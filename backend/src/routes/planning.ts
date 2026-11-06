import { Router } from "express";
import { sqlite } from "../db";
import { getOccupiedBlocksForDate, getFreeSlots, proposeFlexiblePlacements } from "../services/plannerEngine";
import { proposeUrgent, applyUrgent } from "../services/urgentPlanner";
import { z } from "zod";
import { localDateString } from "../services/dateUtils";

const router = Router();

/** Vue "jour" complète : EDT + événements + récupération + tâches déjà placées. */
router.get("/day/:date", (req, res) => {
  const { date } = req.params;
  const blocks = getOccupiedBlocksForDate(date);
  const freeSlots = getFreeSlots(date);
  res.json({ date, blocks, freeSlots });
});

/** Vue "semaine" : agrège 7 jours à partir d'une date de départ (lundi recommandé). */
router.get("/week/:startDate", (req, res) => {
  const start = new Date(req.params.startDate + "T00:00:00");
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = localDateString(d);
    days.push({ date: dateStr, blocks: getOccupiedBlocksForDate(dateStr) });
  }
  res.json({ days });
});

/** Propositions de placement pour les tâches flexibles — jamais appliqué automatiquement. */
router.get("/proposals", (_req, res) => {
  const result = proposeFlexiblePlacements();
  res.json(result);
});

/** Validation d'une proposition : applique le placement choisi par l'utilisateur pour UNE tâche. */
router.post("/proposals/apply", (req, res) => {
  const { taskId, date, startTime } = req.body as { taskId: number; date: string; startTime: string };
  if (!taskId || !date || !startTime) return res.status(400).json({ error: "Paramètres manquants" });

  const now = new Date().toISOString();
  sqlite.prepare(`UPDATE tasks SET date=?, start_time=?, updated_at=? WHERE id=?`).run(date, startTime, now, taskId);
  const task = sqlite.prepare(`SELECT * FROM tasks WHERE id = ?`).get(taskId);
  res.json(task);
});

/** Détection de conflit pour une urgence : quels blocs non-verrouillés chevauchent le créneau demandé ? */
router.post("/conflicts", (req, res) => {
  const { date, startTime, endTime } = req.body as { date: string; startTime: string; endTime: string };
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const blocks = getOccupiedBlocksForDate(date);
  const conflicts = blocks.filter((b) => {
    const overlap = toMin(b.startTime) < toMin(endTime) && toMin(b.endTime) > toMin(startTime);
    return overlap;
  });
  res.json({
    conflicts: conflicts.map((c) => ({ ...c, movable: !c.locked })),
    hasLockedConflict: conflicts.some((c) => c.locked),
  });
});

// ---------- Urgences : proposition puis validation ----------
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const urgentSchema = z.object({
  title: z.string().min(1),
  date: z.string().regex(dateRe),
  startTime: z.string().regex(timeRe),
  endTime: z.string().regex(timeRe),
});

/** Ne modifie rien : renvoie les conflits et un plan de déplacement à valider. */
router.post("/urgent/propose", (req, res) => {
  const parsed = urgentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.json(proposeUrgent(parsed.data));
});

/** Applique le plan validé par l'utilisateur (transaction, blocs verrouillés revérifiés). */
router.post("/urgent/apply", (req, res) => {
  const schema = z.object({
    urgent: urgentSchema,
    moves: z.array(
      z
        .object({
          taskId: z.number().int().nullable().optional(),
          occurrence: z.object({ ruleId: z.number().int(), date: z.string().regex(dateRe) }).optional(),
          to: z.object({ date: z.string().regex(dateRe), startTime: z.string().regex(timeRe) }).nullable(),
        })
        .refine((m) => (m.taskId != null) !== (m.occurrence != null), "Un déplacement concerne une tâche OU une occurrence."),
    ),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    res.status(201).json(applyUrgent(parsed.data));
  } catch (e: any) {
    res.status(409).json({ error: e.message });
  }
});

// ---------- Blocs de récupération (sommeil, repas, pauses...) modifiables ----------
const recoverySchema = z.object({
  kind: z.enum(["Sleep", "Meal", "ShortBreak", "LongBreak", "FreeTime", "Commute"]),
  label: z.string().min(1),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1),
  startTime: z.string().regex(timeRe),
  endTime: z.string().regex(timeRe),
});

router.get("/recovery", (_req, res) => {
  res.json(sqlite.prepare(`SELECT * FROM recovery_blocks WHERE day_of_week IS NOT NULL ORDER BY day_of_week, start_time`).all());
});

router.post("/recovery", (req, res) => {
  const parsed = recoverySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const r = parsed.data;
  const now = new Date().toISOString();
  const stmt = sqlite.prepare(
    `INSERT INTO recovery_blocks (kind, label, day_of_week, start_time, end_time, recurring, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)`
  );
  const ids = r.daysOfWeek.map((d) => Number(stmt.run(r.kind, r.label, d, r.startTime, r.endTime, now).lastInsertRowid));
  res.status(201).json({ ids });
});

router.delete("/recovery/:id", (req, res) => {
  sqlite.prepare(`DELETE FROM recovery_blocks WHERE id = ?`).run(Number(req.params.id));
  res.status(204).send();
});

export default router;

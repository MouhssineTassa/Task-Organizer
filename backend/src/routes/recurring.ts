import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../db";
import { addDays, localDateString } from "../services/dateUtils";
import { applyOccurrenceAction, occurrencesForRange, OccurrenceError, ruleDays } from "../services/recurring";
import type { RuleRow } from "../services/recurring";

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_RANGE_DAYS = 62;

const ruleBase = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  category: z.string().trim().min(1).max(60).optional(),
  priority: z.enum(["Critical", "High", "Medium", "Low", "Optional"]).optional(),
  difficulty: z.enum(["Easy", "Medium", "Hard", "VeryHard"]).optional(),
  estimatedMinutes: z.number().int().min(5).max(600).optional(),
  startTime: z.string().regex(TIME_RE).optional().nullable(),
  frequency: z.enum(["Daily", "Weekly"]).optional(),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  startDate: z.string().regex(DATE_RE).optional(),
  endDate: z.string().regex(DATE_RE).optional().nullable(),
  subjectId: z.number().int().optional().nullable(),
});

function withUpcoming(rule: RuleRow) {
  const today = localDateString(new Date());
  const upcoming = occurrencesForRange(today, addDays(today, 21)).filter((o) => o.ruleId === rule.id).slice(0, 3);
  return { ...rule, daysList: ruleDays(rule), upcoming };
}

router.get("/rules", (req, res) => {
  const rows = (req.query.all === "1"
    ? sqlite.prepare(`SELECT * FROM recurring_rules ORDER BY active DESC, created_at DESC`).all()
    : sqlite.prepare(`SELECT * FROM recurring_rules WHERE active = 1 ORDER BY created_at DESC`).all()) as RuleRow[];
  res.json(rows.map(withUpcoming));
});

router.post("/rules", (req, res) => {
  const parsed = ruleBase.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Données invalides.", details: parsed.error.flatten() });
  const r = parsed.data;
  const frequency = r.frequency ?? "Weekly";
  if (frequency === "Weekly" && (!r.daysOfWeek || r.daysOfWeek.length === 0)) {
    return res.status(400).json({ error: "Choisis au moins un jour de la semaine." });
  }
  const startDate = r.startDate ?? localDateString(new Date());
  if (r.endDate && r.endDate < startDate) return res.status(400).json({ error: "La date de fin est avant la date de début." });

  const days = frequency === "Weekly" ? [...new Set(r.daysOfWeek)].sort().join(",") : null;
  const info = sqlite
    .prepare(
      `INSERT INTO recurring_rules (title, description, category, priority, difficulty, estimated_minutes, start_time, frequency, days_of_week, start_date, end_date, subject_id, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(r.title, r.description ?? null, r.category ?? "Général", r.priority ?? "Medium", r.difficulty ?? "Medium", r.estimatedMinutes ?? 30,
      r.startTime ?? null, frequency, days, startDate, r.endDate ?? null, r.subjectId ?? null, new Date().toISOString());
  res.status(201).json(withUpcoming(sqlite.prepare(`SELECT * FROM recurring_rules WHERE id = ?`).get(info.lastInsertRowid) as RuleRow));
});

router.put("/rules/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = sqlite.prepare(`SELECT * FROM recurring_rules WHERE id = ?`).get(id) as RuleRow | undefined;
  if (!existing) return res.status(404).json({ error: "Routine introuvable." });
  const parsed = ruleBase.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Données invalides.", details: parsed.error.flatten() });
  const r = parsed.data;

  const frequency = r.frequency ?? existing.frequency;
  const daysArr = r.daysOfWeek ?? ruleDays(existing);
  if (frequency === "Weekly" && daysArr.length === 0) return res.status(400).json({ error: "Choisis au moins un jour de la semaine." });
  const startDate = r.startDate ?? existing.start_date;
  const endDate = r.endDate !== undefined ? r.endDate : existing.end_date;
  if (endDate && endDate < startDate) return res.status(400).json({ error: "La date de fin est avant la date de début." });

  sqlite
    .prepare(
      `UPDATE recurring_rules SET title=?, description=?, category=?, priority=?, difficulty=?, estimated_minutes=?, start_time=?, frequency=?, days_of_week=?, start_date=?, end_date=?, subject_id=? WHERE id=?`
    )
    .run(r.title ?? existing.title, r.description !== undefined ? r.description : existing.description, r.category ?? existing.category,
      r.priority ?? existing.priority, r.difficulty ?? existing.difficulty, r.estimatedMinutes ?? existing.estimated_minutes,
      r.startTime !== undefined ? r.startTime : existing.start_time, frequency, frequency === "Weekly" ? [...new Set(daysArr)].sort().join(",") : null,
      startDate, endDate, r.subjectId !== undefined ? r.subjectId : existing.subject_id, id);
  res.json(withUpcoming(sqlite.prepare(`SELECT * FROM recurring_rules WHERE id = ?`).get(id) as RuleRow));
});

/** Désactivation (pas de suppression) : l'historique des occurrences terminées est conservé. */
router.delete("/rules/:id", (req, res) => {
  sqlite.prepare(`UPDATE recurring_rules SET active = 0 WHERE id = ?`).run(Number(req.params.id));
  res.status(204).send();
});

router.get("/occurrences", (req, res) => {
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? from);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return res.status(400).json({ error: "Paramètres from/to invalides (YYYY-MM-DD)." });
  if (to < from) return res.status(400).json({ error: "La date de fin est avant la date de début." });
  if (to > addDays(from, MAX_RANGE_DAYS)) return res.status(400).json({ error: `Période trop longue (${MAX_RANGE_DAYS} jours maximum).` });
  res.json(occurrencesForRange(from, to));
});

/** Occurrences sautées ou annulées dans la période : permet de les rétablir (action "reset"). */
router.get("/occurrences/hidden", (req, res) => {
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? from);
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || to < from || to > addDays(from, MAX_RANGE_DAYS)) {
    return res.status(400).json({ error: "Période invalide." });
  }
  res.json(
    sqlite
      .prepare(
        `SELECT o.rule_id AS ruleId, r.title AS title, o.date AS date, o.status AS status
         FROM task_occurrences o JOIN recurring_rules r ON r.id = o.rule_id
         WHERE r.active = 1 AND o.status IN ('Skipped', 'Cancelled') AND o.date BETWEEN ? AND ? ORDER BY o.date`
      )
      .all(from, to)
  );
});

router.post("/occurrences/action", (req, res) => {
  const parsed = z
    .object({
      ruleId: z.number().int(),
      date: z.string().regex(DATE_RE),
      action: z.enum(["complete", "skip", "cancel", "reschedule", "reset"]),
      newDate: z.string().regex(DATE_RE).optional(),
      newTime: z.string().regex(TIME_RE).or(z.literal("")).nullable().optional(),
      actualMinutes: z.number().int().min(1).max(1000).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Données invalides." });
  try {
    const { ruleId, date, action, ...opts } = parsed.data;
    res.json(applyOccurrenceAction(ruleId, date, action, opts));
  } catch (e) {
    if (e instanceof OccurrenceError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

export default router;

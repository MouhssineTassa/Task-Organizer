import { Router } from "express";
import { sqlite } from "../db";
import { awardXp } from "../services/xpEngine";
import { evaluateAchievements } from "../services/achievementsEngine";

const router = Router();

// ---------- Programmes ----------
router.get("/programs", (_req, res) => {
  const rows = sqlite.prepare(`SELECT * FROM workout_programs ORDER BY created_at DESC`).all() as any[];
  res.json(rows.map((r) => ({ ...r, days: r.days ? JSON.parse(r.days) : [] })));
});

router.post("/programs", (req, res) => {
  const { name, days } = req.body as { name: string; days?: Array<{ dayOfWeek: number; label: string }> };
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const info = sqlite
    .prepare(`INSERT INTO workout_programs (name, days, created_at) VALUES (?, ?, ?)`)
    .run(name, JSON.stringify(days ?? []), new Date().toISOString());
  const row: any = sqlite.prepare(`SELECT * FROM workout_programs WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ...row, days: days ?? [] });
});

router.delete("/programs/:id", (req, res) => {
  sqlite.prepare(`UPDATE workout_sessions SET program_id = NULL WHERE program_id = ?`).run(Number(req.params.id));
  sqlite.prepare(`DELETE FROM workout_programs WHERE id = ?`).run(Number(req.params.id));
  res.status(204).send();
});

// ---------- Séances ----------
router.get("/sessions", (_req, res) => {
  const sessions = sqlite.prepare(`SELECT * FROM workout_sessions ORDER BY date DESC, id DESC`).all() as any[];
  res.json(
    sessions.map((s) => ({
      ...s,
      exercises: sqlite.prepare(`SELECT * FROM exercise_logs WHERE session_id = ?`).all(s.id),
    }))
  );
});

router.post("/sessions", (req, res) => {
  const { programId, label, date, durationMinutes, comment, exercises } = req.body as {
    programId?: number | null;
    label: string;
    date: string;
    durationMinutes?: number;
    comment?: string;
    exercises?: Array<{ exerciseName: string; sets?: number; reps?: number; weight?: number; comment?: string }>;
  };
  if (!label || !date) return res.status(400).json({ error: "label et date requis" });

  const now = new Date().toISOString();
  const info = sqlite
    .prepare(
      `INSERT INTO workout_sessions (program_id, label, date, duration_minutes, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(programId ?? null, label, date, durationMinutes ?? null, comment ?? null, now);
  const sessionId = Number(info.lastInsertRowid);

  const insertEx = sqlite.prepare(
    `INSERT INTO exercise_logs (session_id, exercise_name, sets, reps, weight, comment) VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const e of exercises ?? []) {
    insertEx.run(sessionId, e.exerciseName, e.sets ?? null, e.reps ?? null, e.weight ?? null, e.comment ?? null);
  }

  // Une séance réellement enregistrée donne de l'XP (domaine Sport).
  awardXp("Task", sessionId, "Sport", 25, `Séance : ${label}`);
  const newlyUnlocked = evaluateAchievements();

  res.status(201).json({ id: sessionId, xpAwarded: 25, newlyUnlocked });
});

router.delete("/sessions/:id", (req, res) => {
  const id = Number(req.params.id);
  sqlite.prepare(`DELETE FROM exercise_logs WHERE session_id = ?`).run(id);
  sqlite.prepare(`DELETE FROM workout_sessions WHERE id = ?`).run(id);
  res.status(204).send();
});

// ---------- Progression : charge max par exercice + volume hebdo ----------
router.get("/progress", (_req, res) => {
  const best = sqlite
    .prepare(
      `SELECT exercise_name, MAX(weight) as maxWeight, COUNT(*) as logs
       FROM exercise_logs WHERE weight IS NOT NULL GROUP BY exercise_name ORDER BY maxWeight DESC`
    )
    .all();
  const perWeek = sqlite
    .prepare(
      `SELECT strftime('%Y-W%W', date) as week, COUNT(*) as sessions
       FROM workout_sessions GROUP BY week ORDER BY week DESC LIMIT 8`
    )
    .all();
  res.json({ best, perWeek });
});

export default router;

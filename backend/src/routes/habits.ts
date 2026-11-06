import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../db";
import { getAllHabitsWithStreaks, applyStreakFreeze, HabitRow, computeStreak } from "../services/streakEngine";
import { awardXp, XP_HABIT_COMPLETION } from "../services/xpEngine";
import { evaluateAchievements } from "../services/achievementsEngine";

const router = Router();

const habitSchema = z.object({
  title: z.string().min(1),
  category: z.string().optional(),
  frequencyType: z.enum(["Daily", "Weekly"]).optional(),
  daysOfWeek: z.string().optional().nullable(), // "1,3,5"
  targetMinutes: z.number().int().positive().optional().nullable(),
});

router.get("/", (_req, res) => {
  res.json(getAllHabitsWithStreaks());
});

router.post("/", (req, res) => {
  const parsed = habitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const h = parsed.data;
  const now = new Date().toISOString();
  const info = sqlite
    .prepare(
      `INSERT INTO habits (title, category, frequency_type, days_of_week, target_minutes, active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    )
    .run(h.title, h.category ?? "Général", h.frequencyType ?? "Daily", h.daysOfWeek ?? null, h.targetMinutes ?? null, now);
  const habit = sqlite.prepare(`SELECT * FROM habits WHERE id = ?`).get(info.lastInsertRowid) as HabitRow;
  res.status(201).json({ ...habit, streak: computeStreak(habit) });
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing: any = sqlite.prepare(`SELECT * FROM habits WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: "Habitude introuvable" });
  const parsed = habitSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const h = { ...existing, ...parsed.data };
  sqlite
    .prepare(
      `UPDATE habits SET title=?, category=?, frequency_type=?, days_of_week=?, target_minutes=? WHERE id=?`
    )
    .run(
      h.title,
      h.category,
      h.frequencyType ?? h.frequency_type,
      h.daysOfWeek !== undefined ? h.daysOfWeek : h.days_of_week,
      h.targetMinutes !== undefined ? h.targetMinutes : h.target_minutes,
      id
    );
  const habit = sqlite.prepare(`SELECT * FROM habits WHERE id = ?`).get(id) as HabitRow;
  res.json({ ...habit, streak: computeStreak(habit) });
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  sqlite.prepare(`UPDATE habits SET active = 0 WHERE id = ?`).run(id); // désactivation, pas de suppression de l'historique
  res.status(204).send();
});

/** Enregistre le résultat du jour pour une habitude : Completed | Skipped | Missed. */
router.post("/:id/log", (req, res) => {
  const habitId = Number(req.params.id);
  const { date, status } = req.body as { date: string; status: "Completed" | "Skipped" | "Missed" };
  const habit = sqlite.prepare(`SELECT * FROM habits WHERE id = ?`).get(habitId) as HabitRow | undefined;
  if (!habit) return res.status(404).json({ error: "Habitude introuvable" });

  const now = new Date().toISOString();
  const existingLog = sqlite.prepare(`SELECT id FROM habit_logs WHERE habit_id = ? AND date = ?`).get(habitId, date);
  if (existingLog) {
    sqlite.prepare(`UPDATE habit_logs SET status = ? WHERE habit_id = ? AND date = ?`).run(status, habitId, date);
  } else {
    sqlite
      .prepare(`INSERT INTO habit_logs (habit_id, date, status, created_at) VALUES (?, ?, ?, ?)`)
      .run(habitId, date, status, now);
  }

  let xpAwarded = 0;
  let newlyUnlocked: Array<{ code: string; title: string; icon: string }> = [];
  if (status === "Completed") {
    xpAwarded = XP_HABIT_COMPLETION;
    awardXp("Habit", habitId, habit.category, xpAwarded, `Habitude réalisée : ${habit.title}`);
    newlyUnlocked = evaluateAchievements();
  }

  res.json({ habit: { ...habit, streak: computeStreak(habit) }, xpAwarded, newlyUnlocked });
});

/** Protection de série (freeze) — limitée, voir streakEngine. */
router.post("/:id/freeze", (req, res) => {
  const habitId = Number(req.params.id);
  const { date } = req.body as { date: string };
  const result = applyStreakFreeze(habitId, date);
  if (!result.ok) return res.status(400).json({ error: result.reason });
  const habit = sqlite.prepare(`SELECT * FROM habits WHERE id = ?`).get(habitId) as HabitRow;
  res.json({ ...habit, streak: computeStreak(habit) });
});

export default router;

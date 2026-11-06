import { Router } from "express";
import { sqlite } from "../db";
import { getOccupiedBlocksForDate } from "../services/plannerEngine";
import { getTotalXp, levelFromXp, divisionFromLevel } from "../services/xpEngine";
import { getBestStreakAcrossHabits } from "../services/streakEngine";
import { localDateString } from "../services/dateUtils";
import { occurrencesForDate } from "../services/recurring";

const router = Router();

router.get("/today", (_req, res) => {
  const today = localDateString(new Date());
  const blocks = getOccupiedBlocksForDate(today);

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const next = blocks.find((b) => toMin(b.startTime) >= nowMinutes) ?? null;
  const nextCourse = blocks.find((b) => b.kind === "University" && toMin(b.startTime) >= nowMinutes) ?? null;

  const tasksToday = sqlite.prepare(`SELECT * FROM tasks WHERE date = ?`).all(today) as any[];
  const completed = tasksToday.filter((t) => t.status === "Completed");
  const pending = tasksToday.filter((t) => t.status === "Pending");

  const studyMinutes = completed
    .filter((t) => t.category === "Études" || t.subject_id)
    .reduce((sum, t) => sum + (t.actual_minutes ?? t.estimated_minutes ?? 0), 0);

  const occToday = occurrencesForDate(today);
  const occDone = occToday.filter((o) => o.status === "Completed");
  const occStudyMinutes = occDone.filter((o) => o.category === "Études" || o.subjectId).reduce((n, o) => n + o.estimatedMinutes, 0);

  const totalXp = getTotalXp();
  const { level, xpIntoLevel, xpForNextLevel } = levelFromXp(totalXp);

  res.json({
    date: today,
    blocks,
    next,
    nextCourse,
    tasksTotal: tasksToday.length + occToday.length,
    tasksCompleted: completed.length + occDone.length,
    tasksPending: pending.length + (occToday.length - occDone.length),
    studyMinutes: studyMinutes + occStudyMinutes,
    progression: {
      available: true,
      totalXp,
      level,
      xpIntoLevel,
      xpForNextLevel,
      division: divisionFromLevel(level),
      bestStreak: getBestStreakAcrossHabits(),
    },
  });
});

router.get("/subjects", (_req, res) => {
  res.json(sqlite.prepare(`SELECT * FROM subjects ORDER BY name`).all());
});

router.post("/subjects", (req, res) => {
  const { name, color, semester } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const now = new Date().toISOString();
  const info = sqlite
    .prepare(`INSERT INTO subjects (name, color, semester, created_at) VALUES (?, ?, ?, ?)`)
    .run(name, color ?? "#6366f1", semester ?? null, now);
  res.status(201).json(sqlite.prepare(`SELECT * FROM subjects WHERE id = ?`).get(info.lastInsertRowid));
});

export default router;

import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../db";
import { XP_BY_DIFFICULTY, awardXp } from "../services/xpEngine";
import { checkMissionCompletion } from "../services/missionEngine";
import { evaluateAchievements } from "../services/achievementsEngine";

const router = Router();

const taskInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  category: z.string().optional(),
  priority: z.enum(["Critical", "High", "Medium", "Low", "Optional"]).optional(),
  difficulty: z.enum(["Easy", "Medium", "Hard", "VeryHard"]).optional(),
  taskType: z.enum(["Fixed", "Flexible", "Recurring", "Urgent"]).optional(),
  flexibility: z.enum(["Fixed", "Semi", "FullyFlexible"]).optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  date: z.string().optional().nullable(),
  startTime: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  context: z.string().optional().nullable(),
  subjectId: z.number().int().optional().nullable(),
  goalId: z.number().int().optional().nullable(),
  missionId: z.number().int().optional().nullable(),
  tags: z.string().optional().nullable(),
});

router.get("/", (req, res) => {
  const { date, status } = req.query;
  let query = `SELECT * FROM tasks`;
  const conditions: string[] = [];
  const params: any[] = [];
  if (date) {
    conditions.push(`date = ?`);
    params.push(date);
  }
  if (status) {
    conditions.push(`status = ?`);
    params.push(status);
  }
  if (conditions.length) query += ` WHERE ` + conditions.join(" AND ");
  query += ` ORDER BY date IS NULL, date ASC, start_time IS NULL, start_time ASC`;
  const rows = sqlite.prepare(query).all(...params);
  res.json(rows);
});

router.post("/", (req, res) => {
  const parsed = taskInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const t = parsed.data;
  const now = new Date().toISOString();

  const info = sqlite
    .prepare(
      `INSERT INTO tasks (title, description, category, priority, difficulty, task_type, flexibility, estimated_minutes, date, start_time, deadline, status, context, subject_id, goal_id, mission_id, tags, created_at, updated_at)
       VALUES (@title, @description, @category, @priority, @difficulty, @taskType, @flexibility, @estimatedMinutes, @date, @startTime, @deadline, 'Pending', @context, @subjectId, @goalId, @missionId, @tags, @createdAt, @updatedAt)`
    )
    .run({
      title: t.title,
      description: t.description ?? null,
      category: t.category ?? "Général",
      priority: t.priority ?? "Medium",
      difficulty: t.difficulty ?? "Medium",
      taskType: t.taskType ?? "Flexible",
      flexibility: t.flexibility ?? "FullyFlexible",
      estimatedMinutes: t.estimatedMinutes ?? 30,
      date: t.date ?? null,
      startTime: t.startTime ?? null,
      deadline: t.deadline ?? null,
      context: t.context ?? null,
      subjectId: t.subjectId ?? null,
      goalId: t.goalId ?? null,
      missionId: t.missionId ?? null,
      tags: t.tags ?? null,
      createdAt: now,
      updatedAt: now,
    });

  const task = sqlite.prepare(`SELECT * FROM tasks WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json(task);
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = sqlite.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: "Tâche introuvable" });

  const parsed = taskInputSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const t = parsed.data;
  const now = new Date().toISOString();

  const merged: any = { ...existing, ...t, updatedAt: now };
  sqlite
    .prepare(
      `UPDATE tasks SET title=@title, description=@description, category=@category, priority=@priority,
       difficulty=@difficulty, task_type=@taskType, flexibility=@flexibility, estimated_minutes=@estimatedMinutes,
       date=@date, start_time=@startTime, deadline=@deadline, context=@context, subject_id=@subjectId, tags=@tags,
       updated_at=@updatedAt WHERE id=@id`
    )
    .run({
      id,
      title: merged.title ?? (existing as any).title,
      description: t.description !== undefined ? t.description : (existing as any).description,
      category: t.category ?? (existing as any).category,
      priority: t.priority ?? (existing as any).priority,
      difficulty: t.difficulty ?? (existing as any).difficulty,
      taskType: t.taskType ?? (existing as any).task_type,
      flexibility: t.flexibility ?? (existing as any).flexibility,
      estimatedMinutes: t.estimatedMinutes ?? (existing as any).estimated_minutes,
      date: t.date !== undefined ? t.date : (existing as any).date,
      startTime: t.startTime !== undefined ? t.startTime : (existing as any).start_time,
      deadline: t.deadline !== undefined ? t.deadline : (existing as any).deadline,
      context: t.context !== undefined ? t.context : (existing as any).context,
      subjectId: t.subjectId !== undefined ? t.subjectId : (existing as any).subject_id,
      tags: t.tags !== undefined ? t.tags : (existing as any).tags,
      updatedAt: now,
    });

  const task = sqlite.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id);
  res.json(task);
});

/** Actions dédiées : compléter / reporter / sauter / annuler / mettre en pause. Jamais de suppression silencieuse d'une routine. */
router.post("/:id/action", (req, res) => {
  const id = Number(req.params.id);
  const { action, newDate, actualMinutes } = req.body as {
    action: "complete" | "reschedule" | "skip" | "cancel" | "pause" | "resume";
    newDate?: string;
    actualMinutes?: number;
  };

  const existing: any = sqlite.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: "Tâche introuvable" });

  const now = new Date().toISOString();
  let status = existing.status;
  let date = existing.date;
  let actual = existing.actual_minutes;
  let completedAt = existing.completed_at;
  let xpAwarded = 0;
  let newlyUnlocked: Array<{ code: string; title: string; icon: string }> = [];

  switch (action) {
    case "complete": {
      const wasAlreadyCompleted = existing.status === "Completed";
      status = "Completed";
      actual = actualMinutes ?? existing.estimated_minutes;
      completedAt = now;
      if (!wasAlreadyCompleted) {
        xpAwarded = XP_BY_DIFFICULTY[existing.difficulty] ?? XP_BY_DIFFICULTY.Medium;
        awardXp("Task", id, existing.category, xpAwarded, `Tâche terminée : ${existing.title}`);
      }
      break;
    }
    case "reschedule":
      status = "Pending";
      date = newDate ?? existing.date;
      break;
    case "skip":
      status = "Skipped";
      break;
    case "cancel":
      status = "Cancelled";
      break;
    case "pause":
      status = "Paused";
      break;
    case "resume":
      status = "Pending";
      break;
    default:
      return res.status(400).json({ error: "Action inconnue" });
  }

  sqlite
    .prepare(`UPDATE tasks SET status=?, date=?, actual_minutes=?, completed_at=?, updated_at=? WHERE id=?`)
    .run(status, date, actual, completedAt, now, id);

  if (action === "complete") {
    if (existing.mission_id) checkMissionCompletion(existing.mission_id);
    newlyUnlocked = evaluateAchievements();
  }

  const task = sqlite.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as Record<string, unknown>;
  res.json({ ...task, xpAwarded, newlyUnlocked });
});

router.delete("/:id", (req, res) => {
  sqlite.prepare(`DELETE FROM tasks WHERE id = ?`).run(Number(req.params.id));
  res.status(204).send();
});

export default router;

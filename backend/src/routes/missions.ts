import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../db";

const router = Router();

const missionSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  rewardXp: z.number().int().positive().optional(),
});

function withProgress(mission: any) {
  const tasks = sqlite
    .prepare(`SELECT id, title, status FROM tasks WHERE mission_id = ?`)
    .all(mission.id) as Array<{ id: number; title: string; status: string }>;
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "Completed").length;
  return { ...mission, tasks, tasksTotal: total, tasksCompleted: completed, progress: total > 0 ? completed / total : 0 };
}

router.get("/", (_req, res) => {
  const missions = sqlite.prepare(`SELECT * FROM missions ORDER BY created_at DESC`).all();
  res.json(missions.map(withProgress));
});

router.post("/", (req, res) => {
  const parsed = missionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = parsed.data;
  const now = new Date().toISOString();
  const info = sqlite
    .prepare(`INSERT INTO missions (title, description, reward_xp, status, created_at) VALUES (?, ?, ?, 'Active', ?)`)
    .run(m.title, m.description ?? null, m.rewardXp ?? 50, now);
  const mission = sqlite.prepare(`SELECT * FROM missions WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json(withProgress(mission));
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  sqlite.prepare(`UPDATE tasks SET mission_id = NULL WHERE mission_id = ?`).run(id);
  sqlite.prepare(`DELETE FROM missions WHERE id = ?`).run(id);
  res.status(204).send();
});

export default router;

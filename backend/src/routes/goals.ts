import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../db";

const router = Router();

const goalSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  term: z.enum(["short", "medium", "long"]).optional(),
  parentGoalId: z.number().int().optional().nullable(),
  targetDate: z.string().optional().nullable(),
});

function withProgress(goal: any) {
  const tasks = sqlite.prepare(`SELECT status FROM tasks WHERE goal_id = ?`).all(goal.id) as Array<{ status: string }>;
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "Completed").length;
  return { ...goal, tasksTotal: total, tasksCompleted: completed, progress: total > 0 ? completed / total : 0 };
}

router.get("/", (_req, res) => {
  const goals = sqlite.prepare(`SELECT * FROM goals ORDER BY created_at DESC`).all();
  res.json(goals.map(withProgress));
});

router.post("/", (req, res) => {
  const parsed = goalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const g = parsed.data;
  const now = new Date().toISOString();
  const info = sqlite
    .prepare(
      `INSERT INTO goals (title, description, term, parent_goal_id, target_date, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'Active', ?)`
    )
    .run(g.title, g.description ?? null, g.term ?? "short", g.parentGoalId ?? null, g.targetDate ?? null, now);
  const goal = sqlite.prepare(`SELECT * FROM goals WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json(withProgress(goal));
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing: any = sqlite.prepare(`SELECT * FROM goals WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: "Objectif introuvable" });
  const parsed = goalSchema.partial().extend({ status: z.enum(["Active", "Completed", "Abandoned"]).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const g = { ...existing, ...parsed.data };
  sqlite
    .prepare(`UPDATE goals SET title=?, description=?, term=?, parent_goal_id=?, target_date=?, status=? WHERE id=?`)
    .run(
      g.title,
      g.description,
      g.term,
      g.parentGoalId !== undefined ? g.parentGoalId : g.parent_goal_id,
      g.targetDate !== undefined ? g.targetDate : g.target_date,
      g.status,
      id
    );
  const goal = sqlite.prepare(`SELECT * FROM goals WHERE id = ?`).get(id);
  res.json(withProgress(goal));
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  sqlite.prepare(`UPDATE tasks SET goal_id = NULL WHERE goal_id = ?`).run(id);
  sqlite.prepare(`DELETE FROM goals WHERE id = ?`).run(id);
  res.status(204).send();
});

export default router;

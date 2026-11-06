import { Router } from "express";
import { sqlite } from "../db";
import { awardXp } from "../services/xpEngine";
import { evaluateAchievements } from "../services/achievementsEngine";

const router = Router();

const COLUMNS = ["TODO", "DOING", "DONE"];

function withTasks(project: any) {
  const tasks = sqlite.prepare(`SELECT * FROM project_tasks WHERE project_id = ? ORDER BY id`).all(project.id) as any[];
  const done = tasks.filter((t) => t.column_name === "DONE").length;
  return { ...project, tasks, tasksTotal: tasks.length, tasksDone: done, progress: tasks.length ? done / tasks.length : 0 };
}

router.get("/", (_req, res) => {
  const rows = sqlite.prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all();
  res.json(rows.map(withTasks));
});

router.post("/", (req, res) => {
  const { title, description, deadline } = req.body as { title: string; description?: string; deadline?: string };
  if (!title) return res.status(400).json({ error: "Titre requis" });
  const info = sqlite
    .prepare(`INSERT INTO projects (title, description, deadline, status, created_at) VALUES (?, ?, ?, 'Active', ?)`)
    .run(title, description ?? null, deadline ?? null, new Date().toISOString());
  res.status(201).json(withTasks(sqlite.prepare(`SELECT * FROM projects WHERE id = ?`).get(info.lastInsertRowid)));
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  sqlite.prepare(`DELETE FROM project_tasks WHERE project_id = ?`).run(id);
  sqlite.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  res.status(204).send();
});

router.post("/:id/tasks", (req, res) => {
  const projectId = Number(req.params.id);
  const { title } = req.body as { title: string };
  if (!title) return res.status(400).json({ error: "Titre requis" });
  sqlite
    .prepare(`INSERT INTO project_tasks (project_id, title, column_name, created_at) VALUES (?, ?, 'TODO', ?)`)
    .run(projectId, title, new Date().toISOString());
  res.status(201).json(withTasks(sqlite.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId)));
});

router.put("/tasks/:taskId", (req, res) => {
  const taskId = Number(req.params.taskId);
  const { column } = req.body as { column: string };
  if (!COLUMNS.includes(column)) return res.status(400).json({ error: "Colonne invalide" });
  const task: any = sqlite.prepare(`SELECT * FROM project_tasks WHERE id = ?`).get(taskId);
  if (!task) return res.status(404).json({ error: "Introuvable" });

  let xpAwarded = 0;
  let awardedFlag = task.xp_awarded;
  // XP une seule fois par tâche de projet, même si elle repasse par DONE plusieurs fois.
  if (column === "DONE" && !task.xp_awarded) {
    xpAwarded = 15;
    awardedFlag = 1;
    awardXp("Task", taskId, "Projets", xpAwarded, `Tâche de projet : ${task.title}`);
  }
  sqlite.prepare(`UPDATE project_tasks SET column_name = ?, xp_awarded = ? WHERE id = ?`).run(column, awardedFlag, taskId);
  const newlyUnlocked = xpAwarded ? evaluateAchievements() : [];
  const project = sqlite.prepare(`SELECT * FROM projects WHERE id = ?`).get(task.project_id);
  res.json({ project: withTasks(project), xpAwarded, newlyUnlocked });
});

export default router;

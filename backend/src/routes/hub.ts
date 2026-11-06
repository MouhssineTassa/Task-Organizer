import { Router } from "express";
import { sqlite } from "../db";

const router = Router();

// ---------- INBOX : capture rapide, catégorisation plus tard ----------
router.get("/inbox", (_req, res) => {
  res.json(sqlite.prepare(`SELECT * FROM inbox_items WHERE processed = 0 ORDER BY created_at DESC`).all());
});

router.post("/inbox", (req, res) => {
  const { content } = req.body as { content: string };
  if (!content?.trim()) return res.status(400).json({ error: "Contenu requis" });
  const info = sqlite
    .prepare(`INSERT INTO inbox_items (content, processed, created_at) VALUES (?, 0, ?)`)
    .run(content.trim(), new Date().toISOString());
  res.status(201).json(sqlite.prepare(`SELECT * FROM inbox_items WHERE id = ?`).get(info.lastInsertRowid));
});

/** Transforme un élément d'Inbox en tâche ou en note (choix explicite de l'utilisateur). */
router.post("/inbox/:id/convert", (req, res) => {
  const id = Number(req.params.id);
  const { target } = req.body as { target: "task" | "note" };
  const item: any = sqlite.prepare(`SELECT * FROM inbox_items WHERE id = ?`).get(id);
  if (!item) return res.status(404).json({ error: "Introuvable" });
  const now = new Date().toISOString();

  if (target === "task") {
    sqlite
      .prepare(
        `INSERT INTO tasks (title, category, priority, difficulty, task_type, flexibility, estimated_minutes, status, created_at, updated_at)
         VALUES (?, 'Général', 'Medium', 'Medium', 'Flexible', 'FullyFlexible', 30, 'Pending', ?, ?)`
      )
      .run(item.content, now, now);
  } else if (target === "note") {
    sqlite
      .prepare(`INSERT INTO notes (title, content, type, pinned, favorite, created_at, updated_at) VALUES (?, ?, 'Idée', 0, 0, ?, ?)`)
      .run(item.content.slice(0, 80), item.content, now, now);
  } else {
    return res.status(400).json({ error: "target doit être 'task' ou 'note'" });
  }
  sqlite.prepare(`UPDATE inbox_items SET processed = 1 WHERE id = ?`).run(id);
  res.json({ converted: target });
});

router.delete("/inbox/:id", (req, res) => {
  sqlite.prepare(`UPDATE inbox_items SET processed = 1 WHERE id = ?`).run(Number(req.params.id));
  res.status(204).send();
});

// ---------- RECHERCHE GLOBALE ----------
router.get("/search", (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.json([]);
  const like = `%${q}%`;
  const results: Array<{ type: string; id: number; title: string; extra?: string }> = [];

  const push = (type: string, rows: any[], titleKey: string, extraKey?: string) =>
    rows.forEach((r) => results.push({ type, id: r.id, title: r[titleKey], extra: extraKey ? r[extraKey] : undefined }));

  push("Tâche", sqlite.prepare(`SELECT id, title, status FROM tasks WHERE title LIKE ? OR description LIKE ? OR tags LIKE ? LIMIT 20`).all(like, like, like), "title", "status");
  push("Note", sqlite.prepare(`SELECT id, title, type FROM notes WHERE title LIKE ? OR content LIKE ? OR tags LIKE ? LIMIT 20`).all(like, like, like), "title", "type");
  push("Événement", sqlite.prepare(`SELECT id, title, date FROM events WHERE title LIKE ? OR location LIKE ? LIMIT 20`).all(like, like), "title", "date");
  push("Matière", sqlite.prepare(`SELECT id, name FROM subjects WHERE name LIKE ? LIMIT 20`).all(like), "name");
  push("Cours", sqlite.prepare(`SELECT id, title FROM study_documents WHERE title LIKE ? OR chapters LIKE ? LIMIT 20`).all(like, like), "title");
  push("Livre", sqlite.prepare(`SELECT id, title, author FROM books WHERE title LIKE ? OR author LIKE ? LIMIT 20`).all(like, like), "title", "author");
  push("Média", sqlite.prepare(`SELECT id, title, type FROM media_items WHERE title LIKE ? OR genres LIKE ? LIMIT 20`).all(like, like), "title", "type");
  push("Routine", sqlite.prepare(`SELECT id, title FROM recurring_rules WHERE active = 1 AND (title LIKE ? OR description LIKE ?) LIMIT 20`).all(like, like), "title");
  push("Projet", sqlite.prepare(`SELECT id, title FROM projects WHERE title LIKE ? OR description LIKE ? LIMIT 20`).all(like, like), "title");
  push("Objectif", sqlite.prepare(`SELECT id, title FROM goals WHERE title LIKE ? LIMIT 20`).all(like), "title");

  const type = req.query.type ? String(req.query.type) : null;
  res.json(type ? results.filter((r) => r.type === type) : results);
});

// ---------- ANALYTICS : informations utiles, sans jugement ----------
router.get("/analytics", (_req, res) => {
  const perDay = sqlite
    .prepare(
      `SELECT day, SUM(tasks) AS tasks, SUM(minutes) AS minutes FROM (
         SELECT substr(completed_at, 1, 10) AS day, COUNT(*) AS tasks,
                COALESCE(SUM(COALESCE(actual_minutes, estimated_minutes)), 0) AS minutes
         FROM tasks WHERE status = 'Completed' AND completed_at IS NOT NULL GROUP BY 1
         UNION ALL
         SELECT substr(o.completed_at, 1, 10), COUNT(*), COALESCE(SUM(COALESCE(o.actual_minutes, r.estimated_minutes)), 0)
         FROM task_occurrences o JOIN recurring_rules r ON r.id = o.rule_id
         WHERE o.status = 'Completed' AND o.completed_at IS NOT NULL GROUP BY 1
       ) GROUP BY day ORDER BY day DESC LIMIT 14`
    )
    .all();
  const byStatus = sqlite.prepare(`SELECT status, COUNT(*) as count FROM tasks GROUP BY status`).all();
  const studyMinutes = (
    sqlite
      .prepare(
        `SELECT COALESCE(SUM(COALESCE(actual_minutes, estimated_minutes)), 0) as m FROM tasks
         WHERE status = 'Completed' AND (category = 'Études' OR subject_id IS NOT NULL)`
      )
      .get() as { m: number }
  ).m;
  const pagesRead = (sqlite.prepare(`SELECT COALESCE(SUM(pages_read), 0) as p FROM reading_sessions`).get() as { p: number }).p;
  const workouts = (sqlite.prepare(`SELECT COUNT(*) as c FROM workout_sessions`).get() as { c: number }).c;
  const mediaDone = (sqlite.prepare(`SELECT COUNT(*) as c FROM user_media WHERE status = 'Completed'`).get() as { c: number }).c;
  const booksDone = (sqlite.prepare(`SELECT COUNT(*) as c FROM user_books WHERE status = 'Completed'`).get() as { c: number }).c;
  const xpByCategory = sqlite
    .prepare(`SELECT category, SUM(amount) as xp FROM xp_events GROUP BY category ORDER BY xp DESC`)
    .all();
  // Temps estimé vs réel (section 47) : conservé pour affiner les estimations plus tard.
  const estimateVsActual = sqlite
    .prepare(
      `SELECT COALESCE(SUM(estimated_minutes),0) as estimated, COALESCE(SUM(actual_minutes),0) as actual
       FROM tasks WHERE status = 'Completed' AND actual_minutes IS NOT NULL`
    )
    .get();

  res.json({ perDay, byStatus, studyMinutes, pagesRead, workouts, mediaDone, booksDone, xpByCategory, estimateVsActual });
});

// ---------- RECOMMANDATIONS LOCALES ----------
// Aucune source externe n'est connectée : on ne recommande que des éléments
// du catalogue local, classés selon tes goûts (genres des éléments que tu as bien notés).
router.get("/recommendations/media", (req, res) => {
  const type = req.query.type ? String(req.query.type) : null;
  const liked = sqlite
    .prepare(
      `SELECT mi.genres FROM user_media um JOIN media_items mi ON mi.id = um.media_item_id
       WHERE um.personal_rating >= 4 AND mi.genres IS NOT NULL`
    )
    .all() as Array<{ genres: string }>;
  const genreScore = new Map<string, number>();
  for (const l of liked) {
    for (const g of l.genres.split(",").map((x) => x.trim()).filter(Boolean)) {
      genreScore.set(g, (genreScore.get(g) ?? 0) + 1);
    }
  }
  const candidates = sqlite
    .prepare(
      `SELECT * FROM media_items WHERE id NOT IN (SELECT media_item_id FROM user_media)` + (type ? ` AND type = ?` : ``)
    )
    .all(...(type ? [type] : [])) as any[];

  const scored = candidates
    .map((c) => {
      const genres = (c.genres ?? "").split(",").map((x: string) => x.trim()).filter(Boolean);
      const taste = genres.reduce((s: number, g: string) => s + (genreScore.get(g) ?? 0), 0);
      const popularity = c.public_rating ?? 0;
      return { ...c, score: taste * 2 + popularity, reason: taste > 0 ? "Correspond à tes genres préférés" : "Populaire dans le catalogue local" };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  res.json({ source: "catalogue local uniquement", recommendations: scored });
});

export default router;

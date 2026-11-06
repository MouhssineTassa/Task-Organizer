import { Router } from "express";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { sqlite } from "../db";
import { exportNoteToPdf } from "../services/pdfExport";

const router = Router();

const noteSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  type: z.string().optional(),
  subjectId: z.number().int().optional().nullable(),
  taskId: z.number().int().optional().nullable(),
  folder: z.string().optional().nullable(),
  tags: z.string().optional().nullable(),
  pinned: z.boolean().optional(),
  favorite: z.boolean().optional(),
});

router.get("/", (_req, res) => {
  const rows = sqlite
    .prepare(`SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC`)
    .all();
  res.json(rows);
});

router.get("/:id", (req, res) => {
  const note = sqlite.prepare(`SELECT * FROM notes WHERE id = ?`).get(Number(req.params.id));
  if (!note) return res.status(404).json({ error: "Note introuvable" });
  res.json(note);
});

router.post("/", (req, res) => {
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const n = parsed.data;
  const now = new Date().toISOString();
  const info = sqlite
    .prepare(
      `INSERT INTO notes (title, content, type, subject_id, task_id, folder, tags, pinned, favorite, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      n.title,
      n.content ?? "",
      n.type ?? "Libre",
      n.subjectId ?? null,
      n.taskId ?? null,
      n.folder ?? null,
      n.tags ?? null,
      n.pinned ? 1 : 0,
      n.favorite ? 1 : 0,
      now,
      now
    );
  res.status(201).json(sqlite.prepare(`SELECT * FROM notes WHERE id = ?`).get(info.lastInsertRowid));
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing: any = sqlite.prepare(`SELECT * FROM notes WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: "Note introuvable" });
  const parsed = noteSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const n = { ...existing, ...parsed.data };
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `UPDATE notes SET title=?, content=?, type=?, subject_id=?, task_id=?, folder=?, tags=?, pinned=?, favorite=?, updated_at=? WHERE id=?`
    )
    .run(
      n.title,
      n.content,
      n.type,
      n.subjectId ?? n.subject_id,
      n.taskId ?? n.task_id,
      n.folder,
      n.tags,
      n.pinned ? 1 : 0,
      n.favorite ? 1 : 0,
      now,
      id
    );
  res.json(sqlite.prepare(`SELECT * FROM notes WHERE id = ?`).get(id));
});

router.delete("/:id", (req, res) => {
  sqlite.prepare(`DELETE FROM notes WHERE id = ?`).run(Number(req.params.id));
  res.status(204).send();
});

/**
 * Export d'une note en PDF (section 28). Le fichier généré est enregistré
 * dans storage/exports/ et référencé dans la table files, associé à la note.
 */
router.post("/:id/export-pdf", async (req, res) => {
  const id = Number(req.params.id);
  const note: any = sqlite.prepare(`SELECT * FROM notes WHERE id = ?`).get(id);
  if (!note) return res.status(404).json({ error: "Note introuvable" });

  try {
    const outputDir = path.resolve(__dirname, "../../../storage/exports");
    const filePath = await exportNoteToPdf(note.title, note.content, outputDir);
    const stats = fs.statSync(filePath);
    const now = new Date().toISOString();
    const info = sqlite
      .prepare(
        `INSERT INTO files (original_name, stored_path, mime_type, size, related_type, related_id, created_at)
         VALUES (?, ?, 'application/pdf', ?, 'Note', ?, ?)`
      )
      .run(path.basename(filePath), filePath, stats.size, id, now);
    res.status(201).json({
      fileId: info.lastInsertRowid,
      fileName: path.basename(filePath),
      downloadUrl: `/api/files/${info.lastInsertRowid}/download`,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Échec de l'export PDF : ${err.message}` });
  }
});

export default router;

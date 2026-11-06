import { Router } from "express";
import { sqlite } from "../db";

const router = Router();

router.get("/:id/download", (req, res) => {
  const id = Number(req.params.id);
  const file: any = sqlite.prepare(`SELECT * FROM files WHERE id = ?`).get(id);
  if (!file) return res.status(404).json({ error: "Fichier introuvable" });
  res.download(file.stored_path, file.original_name);
});

router.get("/", (req, res) => {
  const { relatedType, relatedId } = req.query;
  let rows;
  if (relatedType && relatedId) {
    rows = sqlite
      .prepare(`SELECT * FROM files WHERE related_type = ? AND related_id = ? ORDER BY created_at DESC`)
      .all(relatedType, Number(relatedId));
  } else {
    rows = sqlite.prepare(`SELECT * FROM files ORDER BY created_at DESC`).all();
  }
  res.json(rows);
});

export default router;

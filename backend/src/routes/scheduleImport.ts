import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { sqlite } from "../db";
import { parseScheduleFromPdf, ParsedScheduleEntry } from "../services/edtParser";
import { isPdfFile } from "../utils/fileCheck";

const router = Router();

const storageDir = path.resolve(__dirname, "../../../storage/pdf");
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, storageDir),
    filename: (_req, file, cb) => {
      const safe = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      cb(null, safe);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Seuls les fichiers PDF sont acceptés"));
    }
    cb(null, true);
  },
  limits: { fileSize: 15 * 1024 * 1024 },
});

// In-memory draft cache (le PDF étant déjà sur disque, on garde juste l'extraction en mémoire le temps de la validation)
const draftCache = new Map<string, ParsedScheduleEntry[]>();

/** ÉTAPE 1 : upload + extraction → renvoie un brouillon à valider (rien n'est encore en base de planning). */
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });

  if (!isPdfFile(req.file.path)) {
    fs.rmSync(req.file.path, { force: true });
    return res.status(400).json({ error: "Ce fichier n'est pas un vrai PDF." });
  }
  try {
    const buffer = fs.readFileSync(req.file.path);
    const entries = await parseScheduleFromPdf(buffer);

    const now = new Date().toISOString();
    const info = sqlite
      .prepare(
        `INSERT INTO schedule_imports (file_name, stored_path, imported_at, week_label, status)
         VALUES (?, ?, ?, ?, 'draft')`
      )
      .run(req.file.originalname, req.file.path, now, req.body.weekLabel ?? null);

    const importId = String(info.lastInsertRowid);
    draftCache.set(importId, entries);

    res.status(201).json({
      importId: Number(importId),
      fileName: req.file.originalname,
      extractedCount: entries.length,
      entries,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Échec de l'analyse du PDF : ${err.message}` });
  }
});

/** ÉTAPE 2 : comparaison avec l'EDT actuellement actif (avant confirmation). */
router.get("/:id/diff", (req, res) => {
  const importId = req.params.id;
  const draft = draftCache.get(importId);
  if (!draft) return res.status(404).json({ error: "Brouillon introuvable ou expiré. Ré-importez le PDF." });

  const current = sqlite.prepare(`SELECT * FROM schedule_entries`).all() as any[];

  const key = (e: { subjectName?: string; subject_name?: string; dayOfWeek?: number; day_of_week?: number; startTime?: string; start_time?: string }) =>
    `${(e.subjectName ?? e.subject_name)?.toLowerCase()}|${e.dayOfWeek ?? e.day_of_week}|${e.startTime ?? e.start_time}`;

  const currentKeys = new Set(current.map((c) => key(c)));
  const draftKeys = new Set(draft.map((d) => key(d)));

  const added = draft.filter((d) => !currentKeys.has(key(d)));
  const removed = current.filter((c) => !draftKeys.has(key(c)));

  res.json({ added, removed, unchangedCount: draft.length - added.length });
});

/** ÉTAPE 3 : édition manuelle d'une ligne du brouillon avant import (l'utilisateur garde le contrôle). */
router.put("/:id/draft/:index", (req, res) => {
  const draft = draftCache.get(req.params.id);
  if (!draft) return res.status(404).json({ error: "Brouillon introuvable ou expiré" });
  const idx = Number(req.params.index);
  if (idx < 0 || idx >= draft.length) return res.status(400).json({ error: "Index invalide" });
  draft[idx] = { ...draft[idx], ...req.body };
  res.json(draft[idx]);
});

router.delete("/:id/draft/:index", (req, res) => {
  const draft = draftCache.get(req.params.id);
  if (!draft) return res.status(404).json({ error: "Brouillon introuvable ou expiré" });
  const idx = Number(req.params.index);
  draft.splice(idx, 1);
  res.status(204).send();
});

/** ÉTAPE 4 : confirmation définitive → remplace l'EDT actif par le brouillon validé. */
router.post("/:id/confirm", (req, res) => {
  const importId = req.params.id;
  const cachedDraft = draftCache.get(importId);
  if (!cachedDraft) return res.status(404).json({ error: "Brouillon introuvable ou expiré. Ré-importez le PDF." });
  // Les corrections effectuées dans le tableau frontend sont transmises à la confirmation.
  const draft = Array.isArray(req.body?.entries) ? req.body.entries as ParsedScheduleEntry[] : cachedDraft;
  if (draft.some((entry) => !entry.subjectName || !entry.startTime || !entry.endTime || entry.dayOfWeek < 1 || entry.dayOfWeek > 7)) {
    return res.status(400).json({ error: "Le brouillon contient une séance invalide." });
  }

  const now = new Date().toISOString();

  const tx = sqlite.transaction(() => {
    // On remplace l'EDT actif (l'historique du fichier PDF reste conservé dans schedule_imports/storage).
    sqlite.prepare(`DELETE FROM schedule_entries`).run();
    const stmt = sqlite.prepare(
      `INSERT INTO schedule_entries (import_id, subject_name, teacher, room, main_room, session_number, session_label, type, day_of_week, start_time, end_time, locked, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );
    for (const e of draft) {
      stmt.run(importId, e.subjectName, e.teacher, e.room ?? e.mainRoom, e.mainRoom, e.sessionNumber, e.sessionLabel, e.type, e.dayOfWeek, e.startTime, e.endTime, now);
    }
    sqlite.prepare(`UPDATE schedule_imports SET status = 'confirmed' WHERE id = ?`).run(importId);
  });
  tx();

  draftCache.delete(importId);
  const entries = sqlite.prepare(`SELECT * FROM schedule_entries ORDER BY day_of_week, start_time`).all();
  res.json({ imported: entries.length, entries });
});

router.get("/history", (_req, res) => {
  const rows = sqlite.prepare(`SELECT * FROM schedule_imports ORDER BY imported_at DESC`).all();
  res.json(rows);
});

router.get("/current", (_req, res) => {
  const rows = sqlite
    .prepare(`SELECT * FROM schedule_entries ORDER BY day_of_week, start_time`)
    .all();
  res.json(rows);
});

router.delete("/entries/:id", (req, res) => {
  sqlite.prepare(`DELETE FROM schedule_entries WHERE id = ?`).run(Number(req.params.id));
  res.status(204).send();
});

export default router;

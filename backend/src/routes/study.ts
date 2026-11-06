import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { sqlite } from "../db";
import { parseCoursePdf, ParsedCourse } from "../services/courseParser";
import { isPdfFile } from "../utils/fileCheck";

const router = Router();

const storageDir = path.resolve(__dirname, "../../../storage/study");
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, storageDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`),
  }),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") return cb(new Error("Seuls les fichiers PDF sont acceptés"));
    cb(null, true);
  },
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ---------- Semestres ----------
router.get("/semesters", (_req, res) => {
  res.json(sqlite.prepare(`SELECT * FROM semesters ORDER BY created_at DESC`).all());
});

router.post("/semesters", (req, res) => {
  const { name, startDate, endDate } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const now = new Date().toISOString();
  const info = sqlite
    .prepare(`INSERT INTO semesters (name, start_date, end_date, active, created_at) VALUES (?, ?, ?, 1, ?)`)
    .run(name, startDate ?? null, endDate ?? null, now);
  res.status(201).json(sqlite.prepare(`SELECT * FROM semesters WHERE id = ?`).get(info.lastInsertRowid));
});

// ---------- Matières (étendu avec lien semestre) ----------
router.get("/subjects", (req, res) => {
  const { semesterId } = req.query;
  const rows = semesterId
    ? sqlite.prepare(`SELECT * FROM subjects WHERE semester_id = ? ORDER BY name`).all(Number(semesterId))
    : sqlite.prepare(`SELECT * FROM subjects ORDER BY name`).all();
  res.json(rows);
});

router.post("/subjects", (req, res) => {
  const { name, color, semesterId } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const now = new Date().toISOString();
  const info = sqlite
    .prepare(`INSERT INTO subjects (name, color, semester_id, created_at) VALUES (?, ?, ?, ?)`)
    .run(name, color ?? "#6366f1", semesterId ?? null, now);
  res.status(201).json(sqlite.prepare(`SELECT * FROM subjects WHERE id = ?`).get(info.lastInsertRowid));
});

// ---------- Examens ----------
router.get("/exams", (req, res) => {
  const { subjectId } = req.query;
  const rows = subjectId
    ? sqlite.prepare(`SELECT * FROM exams WHERE subject_id = ? ORDER BY exam_date`).all(Number(subjectId))
    : sqlite.prepare(`SELECT * FROM exams ORDER BY exam_date`).all();
  res.json(rows);
});

router.post("/exams", (req, res) => {
  const schema = z.object({
    subjectId: z.number().int(),
    title: z.string().min(1),
    examDate: z.string().optional().nullable(),
    examType: z.enum(["Examen", "Contrôle", "Rattrapage"]).optional(),
    notes: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const e = parsed.data;
  const now = new Date().toISOString();
  const info = sqlite
    .prepare(`INSERT INTO exams (subject_id, title, exam_date, exam_type, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(e.subjectId, e.title, e.examDate ?? null, e.examType ?? "Examen", e.notes ?? null, now);
  res.status(201).json(sqlite.prepare(`SELECT * FROM exams WHERE id = ?`).get(info.lastInsertRowid));
});

router.delete("/exams/:id", (req, res) => {
  sqlite.prepare(`DELETE FROM exams WHERE id = ?`).run(Number(req.params.id));
  res.status(204).send();
});

// ---------- Documents de cours ----------
function withProgress(doc: any) {
  const tasks = sqlite
    .prepare(`SELECT title, status FROM tasks WHERE study_document_id = ?`)
    .all(doc.id) as Array<{ title: string; status: string }>;
  const lectureTasks = tasks.filter((t) => t.title.startsWith("Lire"));
  const allTasks = tasks;
  const readingProgress = lectureTasks.length
    ? lectureTasks.filter((t) => t.status === "Completed").length / lectureTasks.length
    : 0;
  const masteryProgress = allTasks.length
    ? allTasks.filter((t) => t.status === "Completed").length / allTasks.length
    : 0;
  return {
    ...doc,
    chapters: doc.chapters ? JSON.parse(doc.chapters) : [],
    tasksTotal: allTasks.length,
    tasksCompleted: allTasks.filter((t) => t.status === "Completed").length,
    readingProgress,
    masteryProgress,
  };
}

router.get("/documents", (req, res) => {
  const { subjectId } = req.query;
  const rows = subjectId
    ? sqlite.prepare(`SELECT * FROM study_documents WHERE subject_id = ? ORDER BY created_at DESC`).all(Number(subjectId))
    : sqlite.prepare(`SELECT * FROM study_documents ORDER BY created_at DESC`).all();
  res.json(rows.map(withProgress));
});

// In-memory draft cache, même principe que l'import EDT : rien n'est en base tant que ce n'est pas validé.
const draftCache = new Map<string, { subjectId: number; title: string; filePath: string; parsed: ParsedCourse }>();

/** ÉTAPE 1 : upload du PDF de cours + extraction des chapitres → brouillon de tâches proposées. */
router.post("/documents/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });
  const subjectId = Number(req.body.subjectId);
  if (!subjectId) return res.status(400).json({ error: "subjectId requis" });

  if (!isPdfFile(req.file.path)) {
    fs.rmSync(req.file.path, { force: true });
    return res.status(400).json({ error: "Ce fichier n'est pas un vrai PDF." });
  }
  try {
    const buffer = fs.readFileSync(req.file.path);
    const parsed = await parseCoursePdf(buffer);
    const draftId = `${Date.now()}`;
    draftCache.set(draftId, {
      subjectId,
      title: req.body.title || req.file.originalname.replace(/\.pdf$/i, ""),
      filePath: req.file.path,
      parsed,
    });
    res.status(201).json({ draftId, title: req.file.originalname, ...parsed });
  } catch (err: any) {
    res.status(500).json({ error: `Échec de l'analyse du PDF : ${err.message}` });
  }
});

/** ÉTAPE 2 : édition d'une tâche proposée avant validation. */
router.put("/documents/:draftId/draft/:index", (req, res) => {
  const draft = draftCache.get(req.params.draftId);
  if (!draft) return res.status(404).json({ error: "Brouillon introuvable ou expiré" });
  const idx = Number(req.params.index);
  if (idx < 0 || idx >= draft.parsed.proposedTasks.length) return res.status(400).json({ error: "Index invalide" });
  draft.parsed.proposedTasks[idx] = { ...draft.parsed.proposedTasks[idx], ...req.body };
  res.json(draft.parsed.proposedTasks[idx]);
});

router.delete("/documents/:draftId/draft/:index", (req, res) => {
  const draft = draftCache.get(req.params.draftId);
  if (!draft) return res.status(404).json({ error: "Brouillon introuvable ou expiré" });
  draft.parsed.proposedTasks.splice(Number(req.params.index), 1);
  res.status(204).send();
});

/** ÉTAPE 3 : confirmation → crée le StudyDocument + les tâches acceptées (Flexible, liées à la matière et au document). */
router.post("/documents/:draftId/confirm", (req, res) => {
  const draft = draftCache.get(req.params.draftId);
  if (!draft) return res.status(404).json({ error: "Brouillon introuvable ou expiré" });

  const now = new Date().toISOString();
  const docInfo = sqlite
    .prepare(`INSERT INTO study_documents (subject_id, title, file_path, chapters, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(draft.subjectId, draft.title, draft.filePath, JSON.stringify(draft.parsed.chapters), now);
  const documentId = docInfo.lastInsertRowid;

  const insertTask = sqlite.prepare(
    `INSERT INTO tasks (title, description, category, priority, difficulty, task_type, flexibility, estimated_minutes, status, subject_id, study_document_id, created_at, updated_at)
     VALUES (?, ?, 'Études', 'Medium', ?, 'Flexible', 'FullyFlexible', ?, 'Pending', ?, ?, ?, ?)`
  );
  for (const t of draft.parsed.proposedTasks) {
    insertTask.run(t.title, t.description, t.difficulty, t.estimatedMinutes, draft.subjectId, documentId, now, now);
  }

  draftCache.delete(req.params.draftId);
  const document = sqlite.prepare(`SELECT * FROM study_documents WHERE id = ?`).get(documentId);
  res.status(201).json({ ...withProgress(document), tasksCreated: draft.parsed.proposedTasks.length });
});

export default router;

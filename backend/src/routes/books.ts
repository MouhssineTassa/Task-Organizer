import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../db";
import { awardXp } from "../services/xpEngine";
import { evaluateAchievements } from "../services/achievementsEngine";
import { localDateString } from "../services/dateUtils";

const router = Router();

// ---------- Catalogue général ----------
const bookSchema = z.object({
  title: z.string().min(1),
  originalTitle: z.string().optional().nullable(),
  author: z.string().optional().nullable(),
  originalLanguage: z.string().optional().nullable(),
  editionLanguage: z.string().optional().nullable(),
  genre: z.string().optional().nullable(),
  year: z.number().int().optional().nullable(),
  pages: z.number().int().optional().nullable(),
  isbn: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

router.get("/", (req, res) => {
  const { language, genre, search } = req.query;
  let query = `SELECT * FROM books`;
  const conditions: string[] = [];
  const params: any[] = [];
  if (language) {
    conditions.push(`(original_language = ? OR edition_language = ?)`);
    params.push(language, language);
  }
  if (genre) {
    conditions.push(`genre = ?`);
    params.push(genre);
  }
  if (search) {
    conditions.push(`(title LIKE ? OR author LIKE ?)`);
    params.push(`%${search}%`, `%${search}%`);
  }
  if (conditions.length) query += ` WHERE ` + conditions.join(" AND ");
  query += ` ORDER BY title`;
  res.json(sqlite.prepare(query).all(...params));
});

router.post("/", (req, res) => {
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = parsed.data;
  const now = new Date().toISOString();
  const info = sqlite
    .prepare(
      `INSERT INTO books (title, original_title, author, original_language, edition_language, genre, year, pages, isbn, description, created_at)
       VALUES (@title, @originalTitle, @author, @originalLanguage, @editionLanguage, @genre, @year, @pages, @isbn, @description, @createdAt)`
    )
    .run({ ...b, originalTitle: b.originalTitle ?? null, author: b.author ?? null, originalLanguage: b.originalLanguage ?? null, editionLanguage: b.editionLanguage ?? null, genre: b.genre ?? null, year: b.year ?? null, pages: b.pages ?? null, isbn: b.isbn ?? null, description: b.description ?? null, createdAt: now });
  res.status(201).json(sqlite.prepare(`SELECT * FROM books WHERE id = ?`).get(info.lastInsertRowid));
});

// ---------- Ma bibliothèque (personnelle) ----------
function withBookDetails(ub: any) {
  const book: any = sqlite.prepare(`SELECT * FROM books WHERE id = ?`).get(ub.book_id);
  const progress = book?.pages ? Math.min(1, ub.current_page / book.pages) : 0;
  return { ...ub, book, progress };
}

router.get("/my", (req, res) => {
  const { status } = req.query;
  const rows = status
    ? sqlite.prepare(`SELECT * FROM user_books WHERE status = ? ORDER BY updated_at DESC`).all(status)
    : sqlite.prepare(`SELECT * FROM user_books ORDER BY updated_at DESC`).all();
  res.json(rows.map(withBookDetails));
});

router.post("/my", (req, res) => {
  const { bookId, status } = req.body as { bookId: number; status?: string };
  if (!bookId) return res.status(400).json({ error: "bookId requis" });
  const now = new Date().toISOString();
  const info = sqlite
    .prepare(
      `INSERT INTO user_books (book_id, status, current_page, start_date, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)`
    )
    .run(bookId, status ?? "ToRead", (status ?? "ToRead") !== "ToRead" ? localDateString(new Date()) : null, now, now);
  res.status(201).json(withBookDetails(sqlite.prepare(`SELECT * FROM user_books WHERE id = ?`).get(info.lastInsertRowid)));
});

router.put("/my/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing: any = sqlite.prepare(`SELECT * FROM user_books WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: "Introuvable" });
  const { status, currentPage, personalRating, favorite } = req.body as {
    status?: string;
    currentPage?: number;
    personalRating?: number;
    favorite?: boolean;
  };
  const now = new Date().toISOString();
  const newStatus = status ?? existing.status;
  const wasCompleted = existing.status === "Completed";
  const endDate = newStatus === "Completed" && !wasCompleted ? localDateString(new Date()) : existing.end_date;

  sqlite
    .prepare(
      `UPDATE user_books SET status=?, current_page=?, personal_rating=?, favorite=?, end_date=?, updated_at=? WHERE id=?`
    )
    .run(
      newStatus,
      currentPage ?? existing.current_page,
      personalRating ?? existing.personal_rating,
      favorite !== undefined ? (favorite ? 1 : 0) : existing.favorite,
      endDate,
      now,
      id
    );

  let xpAwarded = 0;
  let newlyUnlocked: Array<{ code: string; title: string; icon: string }> = [];
  if (newStatus === "Completed" && !wasCompleted) {
    xpAwarded = 40;
    awardXp("Task", null, "Lecture", xpAwarded, "Livre terminé");
    newlyUnlocked = evaluateAchievements();
  }

  res.json({ ...withBookDetails(sqlite.prepare(`SELECT * FROM user_books WHERE id = ?`).get(id)), xpAwarded, newlyUnlocked });
});

router.delete("/my/:id", (req, res) => {
  sqlite.prepare(`DELETE FROM user_books WHERE id = ?`).run(Number(req.params.id));
  res.status(204).send();
});

// ---------- Sessions de lecture ----------
router.post("/my/:id/sessions", (req, res) => {
  const userBookId = Number(req.params.id);
  const { date, pagesRead, durationMinutes } = req.body as { date: string; pagesRead: number; durationMinutes?: number };
  const userBook: any = sqlite.prepare(`SELECT * FROM user_books WHERE id = ?`).get(userBookId);
  if (!userBook) return res.status(404).json({ error: "Introuvable" });

  const now = new Date().toISOString();
  sqlite
    .prepare(`INSERT INTO reading_sessions (user_book_id, date, pages_read, duration_minutes, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(userBookId, date, pagesRead, durationMinutes ?? null, now);

  const newPage = userBook.current_page + pagesRead;
  const newStatus = userBook.status === "ToRead" ? "Reading" : userBook.status;
  sqlite
    .prepare(`UPDATE user_books SET current_page=?, status=?, updated_at=? WHERE id=?`)
    .run(newPage, newStatus, now, userBookId);

  awardXp("Task", null, "Lecture", 5, "Session de lecture");

  res.status(201).json(withBookDetails(sqlite.prepare(`SELECT * FROM user_books WHERE id = ?`).get(userBookId)));
});

export default router;

import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../db";
import { awardXp } from "../services/xpEngine";
import { evaluateAchievements } from "../services/achievementsEngine";
import { localDateString } from "../services/dateUtils";

const router = Router();

const mediaItemSchema = z.object({
  type: z.enum(["Movie", "Series", "Anime"]),
  title: z.string().min(1),
  originalTitle: z.string().optional().nullable(),
  year: z.number().int().optional().nullable(),
  genres: z.string().optional().nullable(), // CSV
  language: z.string().optional().nullable(),
  durationMinutes: z.number().int().optional().nullable(),
  seasonsCount: z.number().int().optional().nullable(),
  episodesCount: z.number().int().optional().nullable(),
  director: z.string().optional().nullable(),
  studio: z.string().optional().nullable(),
  actors: z.string().optional().nullable(),
  publicRating: z.number().optional().nullable(),
});

// ---------- Catalogue général ----------
router.get("/", (req, res) => {
  const { type, genre, search } = req.query;
  let query = `SELECT * FROM media_items`;
  const conditions: string[] = [];
  const params: any[] = [];
  if (type) {
    conditions.push(`type = ?`);
    params.push(type);
  }
  if (genre) {
    conditions.push(`genres LIKE ?`);
    params.push(`%${genre}%`);
  }
  if (search) {
    conditions.push(`title LIKE ?`);
    params.push(`%${search}%`);
  }
  if (conditions.length) query += ` WHERE ` + conditions.join(" AND ");
  query += ` ORDER BY title`;
  res.json(sqlite.prepare(query).all(...params));
});

router.post("/", (req, res) => {
  const parsed = mediaItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = parsed.data;
  const now = new Date().toISOString();
  const info = sqlite
    .prepare(
      `INSERT INTO media_items (type, title, original_title, year, genres, language, duration_minutes, seasons_count, episodes_count, director, studio, actors, public_rating, created_at)
       VALUES (@type, @title, @originalTitle, @year, @genres, @language, @durationMinutes, @seasonsCount, @episodesCount, @director, @studio, @actors, @publicRating, @createdAt)`
    )
    .run({
      type: m.type,
      title: m.title,
      originalTitle: m.originalTitle ?? null,
      year: m.year ?? null,
      genres: m.genres ?? null,
      language: m.language ?? null,
      durationMinutes: m.durationMinutes ?? null,
      seasonsCount: m.seasonsCount ?? null,
      episodesCount: m.episodesCount ?? null,
      director: m.director ?? null,
      studio: m.studio ?? null,
      actors: m.actors ?? null,
      publicRating: m.publicRating ?? null,
      createdAt: now,
    });
  res.status(201).json(sqlite.prepare(`SELECT * FROM media_items WHERE id = ?`).get(info.lastInsertRowid));
});

// ---------- Ma watchlist / historique ----------
function withMediaDetails(um: any) {
  const item: any = sqlite.prepare(`SELECT * FROM media_items WHERE id = ?`).get(um.media_item_id);
  // current_episode désigne l'épisode courant DANS la saison en cours (comme
  // "Saison 3, Épisode 7/13" dans le cahier des charges), pas un compteur
  // global — c'est ce qui permet d'afficher "prochain épisode : S03E08".
  let progress = 0;
  let nextEpisodeLabel: string | null = null;
  if (item?.type === "Movie") {
    progress = um.status === "Completed" ? 1 : 0;
  } else if (um.status !== "Completed") {
    nextEpisodeLabel = `S${String(um.current_season ?? 1).padStart(2, "0")}E${String((um.current_episode ?? 0) + 1).padStart(2, "0")}`;
  } else {
    progress = 1;
  }
  return { ...um, item, progress, nextEpisodeLabel };
}

router.get("/my", (req, res) => {
  const { status, type } = req.query;
  let query = `SELECT um.* FROM user_media um JOIN media_items mi ON mi.id = um.media_item_id`;
  const conditions: string[] = [];
  const params: any[] = [];
  if (status) {
    conditions.push(`um.status = ?`);
    params.push(status);
  }
  if (type) {
    conditions.push(`mi.type = ?`);
    params.push(type);
  }
  if (conditions.length) query += ` WHERE ` + conditions.join(" AND ");
  query += ` ORDER BY um.updated_at DESC`;
  const rows = sqlite.prepare(query).all(...params);
  res.json(rows.map(withMediaDetails));
});

router.post("/my", (req, res) => {
  const { mediaItemId, status } = req.body as { mediaItemId: number; status?: string };
  if (!mediaItemId) return res.status(400).json({ error: "mediaItemId requis" });
  const now = new Date().toISOString();
  const info = sqlite
    .prepare(
      `INSERT INTO user_media (media_item_id, status, current_season, current_episode, created_at, updated_at)
       VALUES (?, ?, 1, 0, ?, ?)`
    )
    .run(mediaItemId, status ?? "Watchlist", now, now);
  res.status(201).json(withMediaDetails(sqlite.prepare(`SELECT * FROM user_media WHERE id = ?`).get(info.lastInsertRowid)));
});

router.put("/my/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing: any = sqlite.prepare(`SELECT * FROM user_media WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: "Introuvable" });
  const { status, currentSeason, currentEpisode, personalRating, favorite, review } = req.body as {
    status?: string;
    currentSeason?: number;
    currentEpisode?: number;
    personalRating?: number;
    favorite?: boolean;
    review?: string;
  };
  const now = new Date().toISOString();
  const newStatus = status ?? existing.status;
  const wasCompleted = existing.status === "Completed";
  const startDate = newStatus === "Watching" && !existing.start_date ? localDateString(new Date()) : existing.start_date;
  const endDate = newStatus === "Completed" && !wasCompleted ? localDateString(new Date()) : existing.end_date;

  sqlite
    .prepare(
      `UPDATE user_media SET status=?, current_season=?, current_episode=?, personal_rating=?, favorite=?, review=?, start_date=?, end_date=?, updated_at=? WHERE id=?`
    )
    .run(
      newStatus,
      currentSeason ?? existing.current_season,
      currentEpisode ?? existing.current_episode,
      personalRating ?? existing.personal_rating,
      favorite !== undefined ? (favorite ? 1 : 0) : existing.favorite,
      review !== undefined ? review : existing.review,
      startDate,
      endDate,
      now,
      id
    );

  let xpAwarded = 0;
  let newlyUnlocked: Array<{ code: string; title: string; icon: string }> = [];
  if (newStatus === "Completed" && !wasCompleted) {
    xpAwarded = 20;
    awardXp("Task", null, "Media", xpAwarded, "Média terminé");
    newlyUnlocked = evaluateAchievements();
  }

  res.json({ ...withMediaDetails(sqlite.prepare(`SELECT * FROM user_media WHERE id = ?`).get(id)), xpAwarded, newlyUnlocked });
});

router.delete("/my/:id", (req, res) => {
  sqlite.prepare(`DELETE FROM user_media WHERE id = ?`).run(Number(req.params.id));
  res.status(204).send();
});

export default router;

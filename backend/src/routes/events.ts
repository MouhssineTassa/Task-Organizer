import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../db";

const router = Router();

const eventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  location: z.string().optional().nullable(),
  participants: z.string().optional().nullable(),
  reminder: z.boolean().optional(),
});

router.get("/", (req, res) => {
  const { date, from, to } = req.query;
  let rows;
  if (date) {
    rows = sqlite.prepare(`SELECT * FROM events WHERE date = ? ORDER BY start_time`).all(date);
  } else if (from && to) {
    rows = sqlite
      .prepare(`SELECT * FROM events WHERE date BETWEEN ? AND ? ORDER BY date, start_time`)
      .all(from, to);
  } else {
    rows = sqlite.prepare(`SELECT * FROM events ORDER BY date, start_time`).all();
  }
  res.json(rows);
});

router.post("/", (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const e = parsed.data;
  const now = new Date().toISOString();
  const info = sqlite
    .prepare(
      `INSERT INTO events (title, description, date, start_time, end_time, location, participants, reminder, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      e.title,
      e.description ?? null,
      e.date,
      e.startTime,
      e.endTime,
      e.location ?? null,
      e.participants ?? null,
      e.reminder ? 1 : 0,
      now
    );
  const event = sqlite.prepare(`SELECT * FROM events WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json(event);
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing: any = sqlite.prepare(`SELECT * FROM events WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: "Événement introuvable" });
  const parsed = eventSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const e = { ...existing, ...parsed.data };
  sqlite
    .prepare(
      `UPDATE events SET title=?, description=?, date=?, start_time=?, end_time=?, location=?, participants=?, reminder=? WHERE id=?`
    )
    .run(
      e.title,
      e.description,
      e.date,
      e.startTime ?? e.start_time,
      e.endTime ?? e.end_time,
      e.location,
      e.participants,
      e.reminder ? 1 : 0,
      id
    );
  res.json(sqlite.prepare(`SELECT * FROM events WHERE id = ?`).get(id));
});

router.delete("/:id", (req, res) => {
  sqlite.prepare(`DELETE FROM events WHERE id = ?`).run(Number(req.params.id));
  res.status(204).send();
});

export default router;

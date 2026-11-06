import { sqlite } from "../db";

/**
 * XP ENGINE (MVP2)
 * Récompense l'action réelle (tâche terminée, habitude complétée, mission
 * accomplie) — jamais la simple création d'éléments. Les montants sont fixes
 * et connus à l'avance pour rester prévisibles et non manipulables.
 */

export const XP_BY_DIFFICULTY: Record<string, number> = {
  Easy: 5,
  Medium: 15,
  Hard: 30,
  VeryHard: 50,
};

export const XP_HABIT_COMPLETION = 10;

const DIVISIONS = [
  { name: "Bronze", minLevel: 1 },
  { name: "Silver", minLevel: 5 },
  { name: "Gold", minLevel: 10 },
  { name: "Platinum", minLevel: 15 },
  { name: "Diamond", minLevel: 20 },
  { name: "Master", minLevel: 25 },
  { name: "Legend", minLevel: 30 },
];

/** Formule simple et prévisible : 100 XP par niveau. */
export function levelFromXp(totalXp: number): { level: number; xpIntoLevel: number; xpForNextLevel: number } {
  const level = Math.floor(totalXp / 100) + 1;
  const xpIntoLevel = totalXp % 100;
  return { level, xpIntoLevel, xpForNextLevel: 100 };
}

export function divisionFromLevel(level: number): string {
  let current = DIVISIONS[0].name;
  for (const d of DIVISIONS) {
    if (level >= d.minLevel) current = d.name;
  }
  return current;
}

export function awardXp(sourceType: "Task" | "Habit" | "Mission", sourceId: number | null, category: string, amount: number, reason: string) {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO xp_events (source_type, source_id, category, amount, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(sourceType, sourceId, category || "Général", amount, reason, now);
}

export function getTotalXp(): number {
  const row = sqlite.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM xp_events`).get() as { total: number };
  return row.total;
}

export function getXpByCategory(): Array<{ category: string; totalXp: number; level: number }> {
  const rows = sqlite
    .prepare(`SELECT category, SUM(amount) as totalXp FROM xp_events GROUP BY category ORDER BY totalXp DESC`)
    .all() as Array<{ category: string; totalXp: number }>;
  return rows.map((r) => ({ ...r, level: levelFromXp(r.totalXp).level }));
}

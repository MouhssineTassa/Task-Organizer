import { sqlite } from "../db";
import { localDateString } from "./dateUtils";

/**
 * STREAK ENGINE (MVP2)
 * Calcule la série en cours d'une habitude en remontant jour par jour depuis
 * aujourd'hui, en ne comptant que les jours où l'habitude était réellement
 * attendue (fréquence Daily ou Weekly avec jours précis). Un jour "Skipped"
 * pour l'occurrence de la routine ne casse PAS la série suivante (le skip ne
 * concerne que cette occurrence, jamais toute la routine — voir section 13
 * du cahier des charges). Seul un jour "Missed" (attendu, non fait, non
 * protégé) casse la série.
 */

export interface HabitRow {
  id: number;
  title: string;
  category: string;
  frequency_type: "Daily" | "Weekly";
  days_of_week: string | null;
  target_minutes: number | null;
  active: number;
  created_at: string;
}

function isExpectedDay(habit: HabitRow, dow: number): boolean {
  if (habit.frequency_type === "Daily") return true;
  if (!habit.days_of_week) return false;
  const days = habit.days_of_week.split(",").map((d) => Number(d.trim()));
  return days.includes(dow);
}

function isoDow(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

export function computeStreak(habit: HabitRow, maxLookbackDays = 400): { current: number; best: number } {
  const logs = sqlite
    .prepare(`SELECT date, status FROM habit_logs WHERE habit_id = ? ORDER BY date DESC`)
    .all(habit.id) as Array<{ date: string; status: string }>;
  const logByDate = new Map(logs.map((l) => [l.date, l.status]));

  let current = 0;
  let best = 0;
  let running = 0;
  let counting = true; // tant qu'on n'a pas trouvé de rupture, on alimente `current`

  const today = new Date();
  for (let i = 0; i < maxLookbackDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = localDateString(d);
    const dow = isoDow(d);

    if (!isExpectedDay(habit, dow)) continue; // jour non concerné, n'affecte pas la série

    const status = logByDate.get(dateStr);

    if (status === "Completed" || status === "Protected") {
      running += 1;
      if (counting) current = running;
      best = Math.max(best, running);
    } else if (status === "Skipped") {
      // Le skip ne casse pas la série (occurrence seule), mais n'ajoute rien non plus.
      continue;
    } else if (status === "Missed") {
      running = 0;
      counting = false;
    } else {
      // Pas de log du tout pour un jour déjà passé et attendu → série rompue,
      // sauf si c'est aujourd'hui (pas encore joué).
      if (dateStr === localDateString(today)) continue;
      running = 0;
      counting = false;
    }
  }

  return { current, best };
}

export function getAllHabitsWithStreaks() {
  const habits = sqlite.prepare(`SELECT * FROM habits ORDER BY created_at DESC`).all() as HabitRow[];
  return habits.map((h) => ({ ...h, streak: computeStreak(h) }));
}

export function getBestStreakAcrossHabits(): number {
  const habits = sqlite.prepare(`SELECT * FROM habits`).all() as HabitRow[];
  let best = 0;
  for (const h of habits) {
    const s = computeStreak(h);
    best = Math.max(best, s.best, s.current);
  }
  return best;
}

/**
 * Protection de série (freeze). Limitée à 3 utilisations par habitude tous
 * les 30 jours glissants, pour ne pas encourager les abus (section 14).
 */
export function applyStreakFreeze(habitId: number, date: string): { ok: boolean; reason?: string } {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentFreezes = sqlite
    .prepare(`SELECT COUNT(*) as c FROM habit_logs WHERE habit_id = ? AND status = 'Protected' AND date >= ?`)
    .get(habitId, localDateString(thirtyDaysAgo)) as { c: number };

  if (recentFreezes.c >= 3) {
    return { ok: false, reason: "Limite de 3 protections de série par mois glissant atteinte pour cette habitude." };
  }

  const now = new Date().toISOString();
  const existing = sqlite.prepare(`SELECT id FROM habit_logs WHERE habit_id = ? AND date = ?`).get(habitId, date);
  if (existing) {
    sqlite.prepare(`UPDATE habit_logs SET status = 'Protected' WHERE habit_id = ? AND date = ?`).run(habitId, date);
  } else {
    sqlite
      .prepare(`INSERT INTO habit_logs (habit_id, date, status, created_at) VALUES (?, ?, 'Protected', ?)`)
      .run(habitId, date, now);
  }
  return { ok: true };
}

import { sqlite } from "../db";
import { getBestStreakAcrossHabits } from "./streakEngine";

/**
 * ACHIEVEMENTS ENGINE (MVP2)
 * Recalcule la progression de chaque trophée du catalogue et débloque ceux
 * dont la condition est désormais remplie. Ne débloque jamais un trophée déjà
 * obtenu deux fois (idempotent), et ne fait jamais disparaître un trophée
 * obtenu même si la condition redescend ensuite (ex: perte de série).
 */

interface AchievementRow {
  id: number;
  code: string;
  title: string;
  description: string;
  category: string;
  condition_type: string;
  condition_value: number;
  icon: string;
}

function getTasksCompletedCount(): number {
  const row = sqlite
    .prepare(`SELECT (SELECT COUNT(*) FROM tasks WHERE status = 'Completed') + (SELECT COUNT(*) FROM task_occurrences WHERE status = 'Completed') AS c`)
    .get() as { c: number };
  return row.c;
}

function getStudyTasksCompletedCount(): number {
  const row = sqlite
    .prepare(`SELECT COUNT(*) as c FROM tasks WHERE status = 'Completed' AND (category = 'Études' OR subject_id IS NOT NULL)`)
    .get() as { c: number };
  return row.c;
}

function hasEarlyBirdCompletion(): boolean {
  const rows = sqlite
    .prepare(`SELECT completed_at FROM tasks WHERE status = 'Completed' AND completed_at IS NOT NULL
       UNION ALL SELECT completed_at FROM task_occurrences WHERE status = 'Completed' AND completed_at IS NOT NULL`)
    .all() as Array<{ completed_at: string }>;
  return rows.some((r) => new Date(r.completed_at).getHours() < 8);
}

function hasNightOwlCompletion(): boolean {
  const rows = sqlite
    .prepare(`SELECT completed_at FROM tasks WHERE status = 'Completed' AND completed_at IS NOT NULL
       UNION ALL SELECT completed_at FROM task_occurrences WHERE status = 'Completed' AND completed_at IS NOT NULL`)
    .all() as Array<{ completed_at: string }>;
  return rows.some((r) => new Date(r.completed_at).getHours() >= 22);
}

function computeProgress(a: AchievementRow): number {
  switch (a.condition_type) {
    case "best_streak":
      return getBestStreakAcrossHabits();
    case "tasks_completed":
      return getTasksCompletedCount();
    case "study_tasks_completed":
      return getStudyTasksCompletedCount();
    case "early_bird":
      return hasEarlyBirdCompletion() ? 1 : 0;
    case "night_owl":
      return hasNightOwlCompletion() ? 1 : 0;
    default:
      return 0;
  }
}

export function evaluateAchievements(): Array<{ code: string; title: string; icon: string }> {
  const achievements = sqlite.prepare(`SELECT * FROM achievements`).all() as AchievementRow[];
  const newlyUnlocked: Array<{ code: string; title: string; icon: string }> = [];
  const now = new Date().toISOString();

  for (const a of achievements) {
    const progress = computeProgress(a);
    const ua = sqlite
      .prepare(`SELECT * FROM user_achievements WHERE achievement_id = ?`)
      .get(a.id) as { id: number; progress_current: number; unlocked_at: string | null } | undefined;

    if (!ua) continue;

    const shouldUnlock = progress >= a.condition_value;
    const newProgress = Math.max(ua.progress_current, Math.min(progress, a.condition_value));

    if (shouldUnlock && !ua.unlocked_at) {
      sqlite
        .prepare(`UPDATE user_achievements SET progress_current = ?, unlocked_at = ? WHERE id = ?`)
        .run(newProgress, now, ua.id);
      newlyUnlocked.push({ code: a.code, title: a.title, icon: a.icon });
    } else if (newProgress !== ua.progress_current) {
      sqlite.prepare(`UPDATE user_achievements SET progress_current = ? WHERE id = ?`).run(newProgress, ua.id);
    }
  }

  return newlyUnlocked;
}

export function getAchievementsWithProgress() {
  return sqlite
    .prepare(
      `SELECT a.code, a.title, a.description, a.category, a.condition_type, a.condition_value, a.icon,
              ua.progress_current, ua.unlocked_at
       FROM achievements a
       JOIN user_achievements ua ON ua.achievement_id = a.id
       ORDER BY (ua.unlocked_at IS NULL), a.category, a.condition_value`
    )
    .all();
}

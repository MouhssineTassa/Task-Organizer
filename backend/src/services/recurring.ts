import { sqlite } from "../db";
import { addDays, isoWeekday, localDateString } from "./dateUtils";
import { awardXp, XP_BY_DIFFICULTY } from "./xpEngine";
import { evaluateAchievements } from "./achievementsEngine";

/**
 * TÂCHES RÉCURRENTES (sections 7, 13, 58 : TaskOccurrence)
 * Une règle (recurring_rules) décrit la routine. Ses occurrences sont CALCULÉES
 * pour toute date ; la table task_occurrences ne stocke que ce qui s'écarte de
 * la règle : terminée, sautée, annulée, reportée à une autre date/heure.
 * Sauter ou reporter une occurrence ne modifie donc jamais la routine : la
 * prochaine occurrence reste prévue normalement (section 13).
 */

export interface RuleRow {
  id: number;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  difficulty: string;
  estimated_minutes: number;
  start_time: string | null;
  frequency: "Daily" | "Weekly";
  days_of_week: string | null;
  start_date: string;
  end_date: string | null;
  subject_id: number | null;
  active: number;
}

interface OccRow {
  id: number;
  rule_id: number;
  date: string;
  status: "Pending" | "Completed" | "Skipped" | "Cancelled";
  moved_to_date: string | null;
  time_override: string | null;
  actual_minutes: number | null;
  completed_at: string | null;
}

export interface Occurrence {
  ruleId: number;
  title: string;
  category: string;
  priority: string;
  difficulty: string;
  estimatedMinutes: number;
  subjectId: number | null;
  /** Date prévue par la règle (identifie l'occurrence). */
  originalDate: string;
  /** Date effective (différente si l'occurrence a été reportée). */
  date: string;
  /** null = pas d'horaire précis ce jour-là. */
  time: string | null;
  status: "Pending" | "Completed";
  rescheduled: boolean;
}

export class OccurrenceError extends Error {}

export function ruleDays(rule: Pick<RuleRow, "frequency" | "days_of_week">): number[] {
  if (rule.frequency === "Daily") return [1, 2, 3, 4, 5, 6, 7];
  return (rule.days_of_week ?? "")
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => d >= 1 && d <= 7);
}

/** La règle prévoit-elle une occurrence ce jour-là ? (bornes de dates incluses) */
export function matchesRule(rule: RuleRow, dateStr: string): boolean {
  if (dateStr < rule.start_date) return false;
  if (rule.end_date && dateStr > rule.end_date) return false;
  return ruleDays(rule).includes(isoWeekday(dateStr));
}

const activeRules = () => sqlite.prepare(`SELECT * FROM recurring_rules WHERE active = 1`).all() as RuleRow[];

function toOccurrence(rule: RuleRow, originalDate: string, row: OccRow | undefined): Occurrence {
  const date = row?.moved_to_date ?? originalDate;
  const time = row?.time_override === "" ? null : row?.time_override ?? rule.start_time;
  return {
    ruleId: rule.id,
    title: rule.title,
    category: rule.category,
    priority: rule.priority,
    difficulty: rule.difficulty,
    estimatedMinutes: rule.estimated_minutes,
    subjectId: rule.subject_id,
    originalDate,
    date,
    time,
    status: row?.status === "Completed" ? "Completed" : "Pending",
    rescheduled: !!row?.moved_to_date && row.moved_to_date !== originalDate,
  };
}

/** Occurrences effectives entre deux dates incluses (terminées et à faire ; pas les sautées/annulées). */
export function occurrencesForRange(from: string, to: string): Occurrence[] {
  const rules = activeRules();
  if (rules.length === 0) return [];
  const byId = new Map(rules.map((r) => [r.id, r]));

  const rows = sqlite
    .prepare(`SELECT * FROM task_occurrences WHERE (date BETWEEN ? AND ?) OR (moved_to_date BETWEEN ? AND ?)`)
    .all(from, to, from, to) as OccRow[];
  const rowByKey = new Map(rows.map((r) => [`${r.rule_id}|${r.date}`, r]));

  const out: Occurrence[] = [];
  const seen = new Set<string>();

  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const rule of rules) {
      if (!matchesRule(rule, d)) continue;
      const row = rowByKey.get(`${rule.id}|${d}`);
      if (row && (row.status === "Skipped" || row.status === "Cancelled")) continue;
      if (row?.moved_to_date && row.moved_to_date !== d) continue; // reportée ailleurs
      out.push(toOccurrence(rule, d, row));
      seen.add(`${rule.id}|${d}`);
    }
  }

  // Occurrences venues d'une autre date, reportées dans la période demandée.
  for (const row of rows) {
    if (!row.moved_to_date || row.moved_to_date === row.date) continue;
    if (row.moved_to_date < from || row.moved_to_date > to) continue;
    if (row.status === "Skipped" || row.status === "Cancelled") continue;
    const rule = byId.get(row.rule_id);
    if (!rule || seen.has(`${row.rule_id}|${row.date}`)) continue;
    out.push(toOccurrence(rule, row.date, row));
  }

  return out.sort((a, b) => (a.date + (a.time ?? "99:99")).localeCompare(b.date + (b.time ?? "99:99")));
}

export const occurrencesForDate = (date: string) => occurrencesForRange(date, date);

// ------------------------------------------------------------------ actions
export type OccurrenceAction = "complete" | "skip" | "cancel" | "reschedule" | "reset";

function upsert(ruleId: number, date: string, patch: Partial<Omit<OccRow, "id" | "rule_id" | "date">>) {
  const existing = sqlite.prepare(`SELECT * FROM task_occurrences WHERE rule_id = ? AND date = ?`).get(ruleId, date) as OccRow | undefined;
  if (!existing) {
    sqlite
      .prepare(
        `INSERT INTO task_occurrences (rule_id, date, status, moved_to_date, time_override, actual_minutes, completed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(ruleId, date, patch.status ?? "Pending", patch.moved_to_date ?? null, patch.time_override ?? null, patch.actual_minutes ?? null, patch.completed_at ?? null, new Date().toISOString());
    return;
  }
  const merged = { ...existing, ...patch };
  sqlite
    .prepare(`UPDATE task_occurrences SET status = ?, moved_to_date = ?, time_override = ?, actual_minutes = ?, completed_at = ? WHERE id = ?`)
    .run(merged.status, merged.moved_to_date, merged.time_override, merged.actual_minutes, merged.completed_at, existing.id);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function applyOccurrenceAction(
  ruleId: number,
  date: string,
  action: OccurrenceAction,
  opts: { newDate?: string; newTime?: string | null; actualMinutes?: number } = {}
): { xpAwarded: number; newlyUnlocked: Array<{ code: string; title: string; icon: string }> } {
  const rule = sqlite.prepare(`SELECT * FROM recurring_rules WHERE id = ?`).get(ruleId) as RuleRow | undefined;
  if (!rule) throw new OccurrenceError("Routine introuvable.");
  if (!rule.active) throw new OccurrenceError("Cette routine est désactivée.");
  if (!DATE_RE.test(date)) throw new OccurrenceError("Date invalide.");

  const row = sqlite.prepare(`SELECT * FROM task_occurrences WHERE rule_id = ? AND date = ?`).get(ruleId, date) as OccRow | undefined;
  if (!matchesRule(rule, date) && !row) throw new OccurrenceError("Cette date n'est pas une occurrence de la routine.");

  let xpAwarded = 0;
  let newlyUnlocked: Array<{ code: string; title: string; icon: string }> = [];

  switch (action) {
    case "complete": {
      if (row?.status === "Completed") break; // idempotent : pas de double XP
      const now = new Date().toISOString();
      upsert(ruleId, date, { status: "Completed", completed_at: now, actual_minutes: opts.actualMinutes ?? rule.estimated_minutes });
      xpAwarded = XP_BY_DIFFICULTY[rule.difficulty] ?? XP_BY_DIFFICULTY.Medium;
      awardXp("Task", null, rule.category, xpAwarded, `Routine : ${rule.title}`);
      newlyUnlocked = evaluateAchievements();
      break;
    }
    case "skip":
    case "cancel":
      if (row?.status === "Completed") throw new OccurrenceError("Une occurrence terminée ne peut pas être modifiée.");
      upsert(ruleId, date, { status: action === "skip" ? "Skipped" : "Cancelled", moved_to_date: null, time_override: null });
      break;
    case "reschedule": {
      if (row?.status === "Completed") throw new OccurrenceError("Une occurrence terminée ne peut pas être modifiée.");
      if (!opts.newDate || !DATE_RE.test(opts.newDate)) throw new OccurrenceError("Nouvelle date invalide.");
      if (opts.newTime != null && opts.newTime !== "" && !TIME_RE.test(opts.newTime)) throw new OccurrenceError("Nouvelle heure invalide.");
      upsert(ruleId, date, {
        status: "Pending",
        moved_to_date: opts.newDate === date ? null : opts.newDate,
        time_override: opts.newTime === undefined ? null : opts.newTime,
      });
      break;
    }
    case "reset":
      if (row?.status === "Completed") throw new OccurrenceError("Une occurrence terminée ne peut pas être annulée (l'XP est déjà acquis).");
      sqlite.prepare(`DELETE FROM task_occurrences WHERE rule_id = ? AND date = ?`).run(ruleId, date);
      break;
  }
  return { xpAwarded, newlyUnlocked };
}

/** Déplacement décidé par le flux d'urgence (déjà validé par l'utilisateur) : change l'horaire/date de CETTE occurrence seulement. */
export function moveOccurrence(ruleId: number, originalDate: string, to: { date: string; startTime: string } | null) {
  if (to) {
    upsert(ruleId, originalDate, { status: "Pending", moved_to_date: to.date === originalDate ? null : to.date, time_override: to.startTime });
  } else {
    upsert(ruleId, originalDate, { status: "Pending", moved_to_date: null, time_override: "" }); // "" = pas d'horaire ce jour-là
  }
}

export { localDateString };

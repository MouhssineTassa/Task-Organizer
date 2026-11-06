import { sqlite } from "../db";
import { localDateString } from "./dateUtils";
import { occurrencesForDate } from "./recurring";

/**
 * PLANNER ENGINE (MVP1)
 * Ordre de priorité respecté :
 * 1. EDT universitaire (verrouillé, jamais déplacé automatiquement)
 * 2. Événements fixes du jour
 * 3. Blocs de récupération (sommeil, repas, pauses)
 * 4. Créneaux libres restants → proposition de placement des tâches flexibles
 *
 * Le moteur ne modifie jamais rien silencieusement : il retourne une
 * PROPOSITION que le frontend affiche pour validation par l'utilisateur.
 */

export interface Block {
  id: string;
  kind: "University" | "Event" | "Recovery" | "TaskProposal" | "Task";
  label: string;
  startTime: string; // "HH:MM"
  endTime: string;
  locked: boolean;
  meta?: Record<string, unknown>;
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function toTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function getDayOfWeekISO(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0 = dimanche
  return day === 0 ? 7 : day;
}

/** Construit la liste des blocs déjà occupés (EDT + événements + récupération) pour une date donnée. */
export function getOccupiedBlocksForDate(dateStr: string): Block[] {
  const dow = getDayOfWeekISO(dateStr);
  const blocks: Block[] = [];

  const uni = sqlite
    .prepare(`SELECT * FROM schedule_entries WHERE day_of_week = ?`)
    .all(dow) as any[];
  for (const u of uni) {
    blocks.push({
      id: `uni-${u.id}`,
      kind: "University",
      label: `🎓 ${u.subject_name} (${u.type})`,
      startTime: u.start_time,
      endTime: u.end_time,
      locked: true,
      meta: { room: u.room, teacher: u.teacher, subjectEntryId: u.id },
    });
  }

  const evs = sqlite.prepare(`SELECT * FROM events WHERE date = ?`).all(dateStr) as any[];
  for (const e of evs) {
    blocks.push({
      id: `event-${e.id}`,
      kind: "Event",
      label: `🎉 ${e.title}`,
      startTime: e.start_time,
      endTime: e.end_time,
      locked: true,
      meta: { eventId: e.id, location: e.location },
    });
  }

  const recovery = sqlite
    .prepare(`SELECT * FROM recovery_blocks WHERE day_of_week = ? OR date = ?`)
    .all(dow, dateStr) as any[];
  for (const r of recovery) {
    const icon =
      r.kind === "Sleep" ? "😴" : r.kind === "Meal" ? "🍽️" : r.kind === "Commute" ? "🚗" : "☕";
    blocks.push({
      id: `rec-${r.id}`,
      kind: "Recovery",
      label: `${icon} ${String(r.label).replace(/^[^\p{L}\p{N}]+/u, "")}`,
      startTime: r.start_time,
      endTime: r.end_time,
      locked: true,
      meta: { recoveryId: r.id, blockKind: r.kind },
    });
  }

  const fixedTasks = sqlite
    .prepare(`SELECT * FROM tasks WHERE date = ? AND start_time IS NOT NULL AND status = 'Pending'`)
    .all(dateStr) as any[];
  for (const t of fixedTasks) {
    const endMinutes = toMinutes(t.start_time) + (t.estimated_minutes || 30);
    blocks.push({
      id: `task-${t.id}`,
      kind: "Task",
      label: `✅ ${t.title}`,
      startTime: t.start_time,
      endTime: toTime(endMinutes),
      locked: t.task_type === "Fixed" || t.task_type === "Urgent",
      meta: { taskId: t.id, priority: t.priority },
    });
  }

  // Routines : seules les occurrences à faire ET avec un horaire occupent un créneau (terminées/sautées/annulées : non).
  for (const o of occurrencesForDate(dateStr)) {
    if (o.status !== "Pending" || !o.time) continue;
    blocks.push({
      id: `occ-${o.ruleId}-${o.originalDate}`,
      kind: "Task",
      label: `🔁 ${o.title}`,
      startTime: o.time,
      endTime: toTime(toMinutes(o.time) + (o.estimatedMinutes || 30)),
      locked: false,
      meta: { occurrence: { ruleId: o.ruleId, date: o.originalDate }, priority: o.priority },
    });
  }

  return blocks.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
}

/** Calcule les créneaux libres restants sur une journée (par défaut 07:00–23:00). */
export function getFreeSlots(
  dateStr: string,
  dayStart = "07:00",
  dayEnd = "23:00"
): Array<{ start: string; end: string; durationMinutes: number }> {
  const occupied = getOccupiedBlocksForDate(dateStr).filter((b) => b.kind !== "TaskProposal");
  const slots: Array<{ start: string; end: string; durationMinutes: number }> = [];

  let cursor = toMinutes(dayStart);
  const end = toMinutes(dayEnd);

  for (const block of occupied) {
    const bStart = toMinutes(block.startTime);
    const bEnd = toMinutes(block.endTime);
    if (bStart > cursor) {
      slots.push({ start: toTime(cursor), end: toTime(bStart), durationMinutes: bStart - cursor });
    }
    cursor = Math.max(cursor, bEnd);
  }
  if (cursor < end) {
    slots.push({ start: toTime(cursor), end: toTime(end), durationMinutes: end - cursor });
  }

  return slots.filter((s) => s.durationMinutes >= 10);
}

export interface PlacementProposal {
  taskId: number;
  title: string;
  proposedDate: string;
  proposedStart: string;
  proposedEnd: string;
}

export interface PlacementFailure {
  taskId: number;
  title: string;
  reason: string;
}

/**
 * Propose un placement pour les tâches flexibles non planifiées, en cherchant
 * le premier créneau libre suffisant sur les prochains `horizonDays` jours,
 * en respectant la deadline si elle existe. Ne modifie RIEN en base :
 * retourne uniquement une proposition à valider.
 */
export function proposeFlexiblePlacements(horizonDays = 7): {
  proposals: PlacementProposal[];
  failures: PlacementFailure[];
} {
  const flexTasks = sqlite
    .prepare(
      `SELECT * FROM tasks WHERE status = 'Pending' AND (start_time IS NULL OR start_time = '') AND task_type = 'Flexible'`
    )
    .all() as any[];

  const proposals: PlacementProposal[] = [];
  const failures: PlacementFailure[] = [];

  for (const task of flexTasks) {
    let placed = false;
    const deadline = task.deadline ? new Date(task.deadline) : null;

    for (let i = 0; i < horizonDays; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dateStr = localDateString(date);

      if (deadline && date > deadline) break;

      const slots = getFreeSlots(dateStr);
      const fit = slots.find((s) => s.durationMinutes >= task.estimated_minutes);
      if (fit) {
        const startMin = toMinutes(fit.start);
        proposals.push({
          taskId: task.id,
          title: task.title,
          proposedDate: dateStr,
          proposedStart: fit.start,
          proposedEnd: toTime(startMin + task.estimated_minutes),
        });
        placed = true;
        break;
      }
    }

    if (!placed) {
      failures.push({
        taskId: task.id,
        title: task.title,
        reason: deadline
          ? `Impossible de placer "${task.title}" (${task.estimated_minutes} min) avant la deadline sans modifier tes créneaux déjà réservés.`
          : `Aucun créneau de ${task.estimated_minutes} min trouvé dans les ${horizonDays} prochains jours.`,
      });
    }
  }

  return { proposals, failures };
}

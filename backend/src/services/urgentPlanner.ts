import { sqlite } from "../db";
import { Block, getOccupiedBlocksForDate, toMinutes, toTime } from "./plannerEngine";
import { localDateString } from "./dateUtils";
import { moveOccurrence } from "./recurring";

/**
 * FLUX D'URGENCE (section 12)
 * Une urgence est posée sur un créneau précis. Le moteur :
 *  1. refuse de toucher à tout bloc verrouillé (cours/TD/TP, événements,
 *     repas, sommeil, tâches fixes) — il l'explique au lieu de décaler ;
 *  2. propose un nouvel emplacement pour chaque tâche déplaçable en conflit
 *     (même jour après l'urgence, sinon les jours suivants) ;
 *  3. ne modifie RIEN : il renvoie une proposition que l'utilisateur valide.
 */

export interface UrgentInput {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface ProposedMove {
  taskId: number | null;
  /** Renseigné quand le déplacement concerne UNE occurrence d'une routine (la routine elle-même n'est jamais modifiée). */
  occurrence?: { ruleId: number; date: string };
  title: string;
  from: { date: string; startTime: string };
  to: { date: string; startTime: string; endTime: string } | null; // null = ne tient nulle part
  reason?: string;
}

export interface UrgentProposal {
  feasible: boolean;
  blockedBy: Array<{ label: string; startTime: string; endTime: string }>;
  message: string;
  urgent: UrgentInput;
  moves: ProposedMove[];
}

const DAY_START = 7 * 60;
const DAY_END = 23 * 60;
const HORIZON_DAYS = 7;

type Range = [number, number];

/** Un bloc qui passe minuit (ex. sommeil 23:00 → 07:00) est coupé en deux segments. */
function segments(startTime: string, endTime: string): Range[] {
  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  return e > s ? [[s, e]] : [[s, 1440], [0, e]];
}

function overlaps(a: Range[], b: Range[]): boolean {
  return a.some(([as, ae]) => b.some(([bs, be]) => as < be && ae > bs));
}

function findSlotOnDay(occupied: Range[], duration: number, notBefore: number): number | null {
  const sorted = [...occupied].sort((x, y) => x[0] - y[0]);
  let cursor = Math.max(DAY_START, notBefore);
  for (const [s, e] of sorted) {
    if (e <= cursor) continue;
    if (s - cursor >= duration) return cursor;
    cursor = Math.max(cursor, e);
  }
  return DAY_END - cursor >= duration ? cursor : null;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return localDateString(d);
}

export function proposeUrgent(input: UrgentInput): UrgentProposal {
  const urgentSegs = segments(input.startTime, input.endTime);
  const blocks = getOccupiedBlocksForDate(input.date);
  const conflicts = blocks.filter((b) => overlaps(urgentSegs, segments(b.startTime, b.endTime)));

  const locked = conflicts.filter((b) => b.locked);
  if (locked.length > 0) {
    return {
      feasible: false,
      blockedBy: locked.map((b) => ({ label: b.label, startTime: b.startTime, endTime: b.endTime })),
      message:
        "Ce créneau chevauche un élément verrouillé (cours, événement, repas, sommeil ou tâche fixe). Ils ne sont jamais déplacés automatiquement : choisis un autre horaire.",
      urgent: input,
      moves: [],
    };
  }

  const movable = conflicts.filter((b) => b.kind === "Task");
  const movableIds = new Set(movable.map((b) => b.id));

  // Occupation par date, alimentée au fil des déplacements proposés (pour ne pas empiler deux tâches au même endroit).
  const occupancy = new Map<string, Range[]>();
  const occupiedFor = (date: string): Range[] => {
    if (!occupancy.has(date)) {
      const base = getOccupiedBlocksForDate(date)
        .filter((b: Block) => !(date === input.date && movableIds.has(b.id)))
        .flatMap((b) => segments(b.startTime, b.endTime));
      occupancy.set(date, base);
    }
    return occupancy.get(date)!;
  };
  occupiedFor(input.date).push(...urgentSegs);

  const moves: ProposedMove[] = [];
  for (const b of movable) {
    const taskId = b.meta?.taskId != null ? Number(b.meta.taskId) : null;
    const occurrence = b.meta?.occurrence as { ruleId: number; date: string } | undefined;
    const duration = toMinutes(b.endTime) - toMinutes(b.startTime);
    let placed: ProposedMove["to"] = null;

    for (let i = 0; i < HORIZON_DAYS && !placed; i++) {
      const date = addDays(input.date, i);
      const notBefore = i === 0 ? toMinutes(input.endTime) : DAY_START;
      const occ = occupiedFor(date);
      const start = findSlotOnDay(occ, duration, notBefore);
      if (start !== null) {
        occ.push([start, start + duration]);
        placed = { date, startTime: toTime(start), endTime: toTime(start + duration) };
      }
    }

    moves.push({
      taskId,
      occurrence,
      title: b.label.replace(/^\S+\s/, ""),
      from: { date: input.date, startTime: b.startTime },
      to: placed,
      reason: placed
        ? undefined
        : `Aucun créneau de ${duration} min trouvé dans les ${HORIZON_DAYS} prochains jours : la tâche sera remise dans « à placer » (sans horaire), pas supprimée.`,
    });
  }

  return {
    feasible: true,
    blockedBy: [],
    message:
      moves.length === 0
        ? "Le créneau est libre : aucune tâche à déplacer."
        : `${moves.length} tâche(s) en conflit. Voici une proposition de déplacement — rien n'est modifié tant que tu n'as pas validé.`,
    urgent: input,
    moves,
  };
}

export interface ApplyUrgentInput {
  urgent: UrgentInput;
  moves: Array<{ taskId?: number | null; occurrence?: { ruleId: number; date: string }; to: { date: string; startTime: string } | null }>;
}

/** Applique la proposition validée, dans une transaction. Revérifie qu'aucun bloc verrouillé n'est touché. */
export function applyUrgent(input: ApplyUrgentInput): { urgentTaskId: number } {
  const check = proposeUrgent(input.urgent);
  if (!check.feasible) throw new Error(check.message);

  const now = new Date().toISOString();
  const minutes = Math.max(5, toMinutes(input.urgent.endTime) - toMinutes(input.urgent.startTime));

  const tx = sqlite.transaction(() => {
    for (const m of input.moves) {
      if (m.occurrence) {
        moveOccurrence(m.occurrence.ruleId, m.occurrence.date, m.to);
        continue;
      }
      if (m.taskId == null) continue;
      if (m.to) {
        sqlite
          .prepare(`UPDATE tasks SET date = ?, start_time = ?, updated_at = ? WHERE id = ?`)
          .run(m.to.date, m.to.startTime, now, m.taskId);
      } else {
        sqlite.prepare(`UPDATE tasks SET date = NULL, start_time = NULL, updated_at = ? WHERE id = ?`).run(now, m.taskId);
      }
    }
    const info = sqlite
      .prepare(
        `INSERT INTO tasks (title, category, priority, difficulty, task_type, flexibility, estimated_minutes, date, start_time, status, created_at, updated_at)
         VALUES (?, 'Général', 'Critical', 'Medium', 'Urgent', 'Fixed', ?, ?, ?, 'Pending', ?, ?)`
      )
      .run(input.urgent.title, minutes, input.urgent.date, input.urgent.startTime, now, now);
    return Number(info.lastInsertRowid);
  });

  return { urgentTaskId: tx() };
}

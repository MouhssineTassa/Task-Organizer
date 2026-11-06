import { sqlite } from "../db";
import { awardXp } from "./xpEngine";

/**
 * Une mission est terminée quand TOUTES les tâches qui lui sont liées sont
 * au statut Completed (section 20). La récompense n'est attribuée qu'une
 * seule fois, au moment exact où la dernière tâche liée est terminée.
 */
export function checkMissionCompletion(missionId: number) {
  const mission = sqlite.prepare(`SELECT * FROM missions WHERE id = ?`).get(missionId) as
    | { id: number; title: string; reward_xp: number; status: string }
    | undefined;
  if (!mission || mission.status === "Completed") return;

  const linkedTasks = sqlite.prepare(`SELECT status FROM tasks WHERE mission_id = ?`).all(missionId) as Array<{
    status: string;
  }>;
  if (linkedTasks.length === 0) return;

  const allDone = linkedTasks.every((t) => t.status === "Completed");
  if (!allDone) return;

  const now = new Date().toISOString();
  sqlite.prepare(`UPDATE missions SET status = 'Completed', completed_at = ? WHERE id = ?`).run(now, missionId);
  awardXp("Mission", missionId, "Général", mission.reward_xp, `Mission accomplie : ${mission.title}`);
}

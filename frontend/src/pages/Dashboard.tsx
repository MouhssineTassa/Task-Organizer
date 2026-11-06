import { useEffect, useState } from "react";
import { getDashboardToday, getTasks, taskAction, getOccurrences, occurrenceAction } from "../api/client";
import type { Occurrence } from "../api/client";
import { localDateString } from "../lib/date";
import type { DashboardData, Task } from "../types";
import { Card, Badge, PageHeader } from "../components/ui";
import { Circle, Flame } from "lucide-react";

const KIND_ICON: Record<string, string> = {
  University: "🎓",
  Event: "🎉",
  Recovery: "☕",
  Task: "✅",
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [routines, setRoutines] = useState<Occurrence[]>([]);

  const load = async () => {
    setLoading(true);
    const todayStr = localDateString();
    const [dash, tasks, occ] = await Promise.all([
      getDashboardToday(),
      getTasks({ status: "Pending" }),
      getOccurrences(todayStr, todayStr),
    ]);
    setData(dash);
    setRoutines(occ);
    setPendingTasks(tasks.slice(0, 6));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const complete = async (id: number) => {
    await taskAction(id, "complete");
    load();
  };

  const today = new Date();
  const dateLabel = today.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (loading || !data) {
    return <p className="text-slate-400">Chargement du dashboard…</p>;
  }

  return (
    <div>
      <PageHeader title="Aujourd'hui" subtitle={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)} />

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Card>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Prochain</p>
          {data.next ? (
            <>
              <p className="text-lg font-semibold">{data.next.label}</p>
              <p className="text-sm text-slate-500">
                {data.next.startTime} – {data.next.endTime}
              </p>
            </>
          ) : (
            <p className="text-slate-400 text-sm">Rien de prévu pour le reste de la journée</p>
          )}
          {data.nextCourse && (!data.next || data.next.id !== data.nextCourse.id) && (
            <p className="text-xs text-indigo-600 mt-2">
              Prochain cours : {data.nextCourse.label.replace(/^[^\s]+\s/, "")} à {data.nextCourse.startTime}
            </p>
          )}
        </Card>
        <Card>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Tâches</p>
          <p className="text-lg font-semibold">
            {data.tasksCompleted}/{data.tasksTotal}
          </p>
          <p className="text-sm text-slate-500">terminées aujourd'hui</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Temps d'étude</p>
          <p className="text-lg font-semibold">{Math.round(data.studyMinutes)} min</p>
          <p className="text-sm text-slate-500">aujourd'hui</p>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-semibold text-slate-800 mb-3">Journée</h2>
          {data.blocks.length === 0 ? (
            <p className="text-sm text-slate-400">
              Aucun créneau aujourd'hui. Importe ton EDT ou ajoute des tâches/événements.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.blocks.map((b) => (
                <li key={b.id} className="flex items-center gap-3 text-sm">
                  <span className="w-24 text-slate-400 font-mono text-xs">{b.startTime}</span>
                  <span>{KIND_ICON[b.kind] ?? "•"}</span>
                  <span className="flex-1">{b.label.replace(/^[^\s]+\s/, "")}</span>
                  {b.locked && <Badge>verrouillé</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold text-slate-800 mb-3">Tâches en attente</h2>
          {pendingTasks.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune tâche en attente. 🎉</p>
          ) : (
            <ul className="space-y-2">
              {pendingTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 text-sm">
                  <button onClick={() => complete(t.id)} className="text-slate-300 hover:text-emerald-500">
                    <Circle size={18} />
                  </button>
                  <span className="flex-1">{t.title}</span>
                  <Badge color={t.priority === "Critical" || t.priority === "High" ? "red" : "slate"}>
                    {t.priority}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {routines.length > 0 && (
        <Card className="mt-4">
          <h2 className="font-semibold text-slate-800 mb-3">Routines du jour</h2>
          <ul className="space-y-2">
            {routines.map((o) => (
              <li key={`${o.ruleId}|${o.originalDate}`} className="flex items-center gap-3 text-sm">
                {o.status === "Completed" ? (
                  <span className="text-emerald-500 w-[18px] text-center">✓</span>
                ) : (
                  <button
                    title="Terminer"
                    onClick={async () => {
                      await occurrenceAction(o.ruleId, o.originalDate, "complete");
                      load();
                    }}
                    className="text-slate-300 hover:text-emerald-500"
                  >
                    <Circle size={18} />
                  </button>
                )}
                <span className={`flex-1 ${o.status === "Completed" ? "line-through text-slate-400" : ""}`}>🔁 {o.title}</span>
                <span className="text-xs text-slate-400">{o.time ?? "dans la journée"}</span>
                {o.status === "Pending" && (
                  <button
                    title="Sauter aujourd'hui (la routine continue)"
                    onClick={async () => {
                      await occurrenceAction(o.ruleId, o.originalDate, "skip");
                      load();
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Sauter
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Flame className="text-amber-400" />
            <div>
              <p className="text-sm font-medium text-slate-700">
                {data.progression.available
                  ? `Niveau ${data.progression.level} · ${data.progression.division}`
                  : "Progression"}
              </p>
              <p className="text-xs text-slate-400">
                {data.progression.available
                  ? `${data.progression.totalXp} XP total · série la plus longue : ${data.progression.bestStreak} jours`
                  : data.progression.message}
              </p>
            </div>
          </div>
          {data.progression.available && (
            <div className="flex-1 min-w-[140px]">
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500"
                  style={{ width: `${((data.progression.xpIntoLevel ?? 0) / (data.progression.xpForNextLevel ?? 100)) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {data.progression.xpIntoLevel}/{data.progression.xpForNextLevel} XP avant le niveau suivant
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

import { useEffect, useState } from "react";
import { getAnalytics } from "../api/client";
import type { AnalyticsData } from "../api/client";
import { Card, PageHeader } from "../components/ui";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="text-center">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-400 mt-1">{label}</p>
    </Card>
  );
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  useEffect(() => {
    getAnalytics().then(setData);
  }, []);
  if (!data) return <p className="text-slate-400">Chargement…</p>;

  const maxTasks = Math.max(1, ...data.perDay.map((d) => d.tasks));
  const days = [...data.perDay].reverse();
  const maxXp = Math.max(1, ...data.xpByCategory.map((x) => x.xp));

  return (
    <div>
      <PageHeader title="📈 Statistiques" subtitle="Des informations utiles, sans jugement." />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat label="Minutes d'étude" value={data.studyMinutes} />
        <Stat label="Pages lues" value={data.pagesRead} />
        <Stat label="Séances de sport" value={data.workouts} />
        <Stat label="Livres terminés" value={data.booksDone} />
        <Stat label="Médias terminés" value={data.mediaDone} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-semibold text-slate-800 mb-3">Tâches terminées par jour</h2>
          {days.length === 0 ? (
            <p className="text-sm text-slate-400">Pas encore de données.</p>
          ) : (
            <div className="flex items-end gap-1.5 h-32">
              {days.map((d) => (
                <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.day} : ${d.tasks} tâche(s), ${d.minutes} min`}>
                  <div className="w-full bg-brand-400 rounded-t" style={{ height: `${(d.tasks / maxTasks) * 100}%` }} />
                  <span className="text-[9px] text-slate-400 mt-1">{d.day.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold text-slate-800 mb-3">XP par domaine</h2>
          {data.xpByCategory.length === 0 ? (
            <p className="text-sm text-slate-400">Pas encore d'XP.</p>
          ) : (
            <div className="space-y-2">
              {data.xpByCategory.map((x) => (
                <div key={x.category}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span>{x.category}</span>
                    <span className="text-slate-400">{x.xp} XP</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-400" style={{ width: `${(x.xp / maxXp) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold text-slate-800 mb-3">Tâches par statut</h2>
          <ul className="text-sm space-y-1">
            {data.byStatus.map((s) => (
              <li key={s.status} className="flex justify-between">
                <span className="text-slate-600">{s.status}</span>
                <span className="font-medium">{s.count}</span>
              </li>
            ))}
            {data.byStatus.length === 0 && <p className="text-slate-400">Aucune tâche.</p>}
          </ul>
        </Card>

        <Card>
          <h2 className="font-semibold text-slate-800 mb-3">Temps estimé vs réel</h2>
          <p className="text-sm text-slate-600">
            Estimé : <span className="font-medium">{data.estimateVsActual.estimated} min</span> · Réel :{" "}
            <span className="font-medium">{data.estimateVsActual.actual} min</span>
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Ces données sont conservées pour affiner les estimations du planificateur plus tard.
          </p>
        </Card>
      </div>
    </div>
  );
}

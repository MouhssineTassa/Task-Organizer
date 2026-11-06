import { useEffect, useState } from "react";
import { getProgression } from "../api/client";
import type { ProgressionData } from "../types";
import { Card, PageHeader, Badge } from "../components/ui";
import { Flame, Trophy } from "lucide-react";

const DIVISION_COLOR: Record<string, string> = {
  Bronze: "bg-orange-100 text-orange-700",
  Silver: "bg-slate-200 text-slate-700",
  Gold: "bg-amber-100 text-amber-700",
  Platinum: "bg-cyan-100 text-cyan-700",
  Diamond: "bg-blue-100 text-blue-700",
  Master: "bg-purple-100 text-purple-700",
  Legend: "bg-gradient-to-r from-amber-200 to-pink-200 text-amber-900",
};

export default function Progression() {
  const [data, setData] = useState<ProgressionData | null>(null);

  useEffect(() => {
    getProgression().then(setData);
  }, []);

  if (!data) return <p className="text-slate-400">Chargement…</p>;

  const unlocked = data.achievements.filter((a) => a.unlocked_at);
  const locked = data.achievements.filter((a) => !a.unlocked_at);

  return (
    <div>
      <PageHeader title="📊 Progression" subtitle="XP, niveaux, streaks, trophées, divisions, compétences." />

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Card className="md:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-2xl font-bold text-slate-900">Niveau {data.level}</p>
              <span className={`inline-block mt-1 px-2.5 py-1 rounded-full text-xs font-semibold ${DIVISION_COLOR[data.division] ?? "bg-slate-100"}`}>
                {data.division}
              </span>
            </div>
            <p className="text-sm text-slate-400">{data.totalXp} XP au total</p>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden mt-3">
            <div className="h-full bg-brand-500" style={{ width: `${(data.xpIntoLevel / data.xpForNextLevel) * 100}%` }} />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {data.xpIntoLevel} / {data.xpForNextLevel} XP avant le niveau {data.level + 1}
          </p>
        </Card>

        <Card className="flex flex-col items-center justify-center">
          <Flame className="text-amber-500 mb-1" size={28} />
          <p className="text-2xl font-bold">{data.bestStreak}</p>
          <p className="text-xs text-slate-400">meilleure série (jours)</p>
        </Card>
      </div>

      <Card className="mb-6">
        <h2 className="font-semibold text-slate-800 mb-4">Niveaux par domaine</h2>
        {data.skills.length === 0 ? (
          <p className="text-sm text-slate-400">Termine des tâches et habitudes pour faire progresser tes domaines.</p>
        ) : (
          <div className="space-y-3">
            {data.skills.map((s) => (
              <div key={s.category}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{s.category}</span>
                  <span className="text-slate-400">Niveau {s.level}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-400" style={{ width: `${(s.totalXp % 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Trophy size={18} className="text-amber-500" /> Trophées ({unlocked.length}/{data.achievements.length})
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...unlocked, ...locked].map((a) => (
            <div
              key={a.code}
              className={`border rounded-xl p-3 ${a.unlocked_at ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50 opacity-70"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{a.icon}</span>
                <p className="font-medium text-sm">{a.title}</p>
              </div>
              <p className="text-xs text-slate-500 mb-2">{a.description}</p>
              <div className="flex items-center justify-between">
                <Badge color={a.unlocked_at ? "amber" : "slate"}>
                  {a.unlocked_at ? "Débloqué" : `${a.progress_current}/${a.condition_value}`}
                </Badge>
                {a.unlocked_at && (
                  <span className="text-[10px] text-slate-400">{new Date(a.unlocked_at).toLocaleDateString("fr-FR")}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

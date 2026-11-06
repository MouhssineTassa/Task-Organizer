import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPlanningDay, getPlanningProposals, applyProposal } from "../api/client";
import type { PlanningBlock } from "../types";
import { Card, PageHeader, Badge, Button } from "../components/ui";
import { FileUp, Zap } from "lucide-react";
import WeekView from "../components/WeekView";
import UrgentDialog from "../components/UrgentDialog";
import RecoveryEditor from "../components/RecoveryEditor";
import { localDateString } from "../lib/date";

const KIND_STYLE: Record<string, { icon: string; color: string }> = {
  University: { icon: "🎓", color: "bg-indigo-50 border-indigo-200" },
  Event: { icon: "🎉", color: "bg-pink-50 border-pink-200" },
  Recovery: { icon: "☕", color: "bg-slate-50 border-slate-200" },
  Task: { icon: "✅", color: "bg-emerald-50 border-emerald-200" },
};

function todayISO() {
  return localDateString(new Date());
}

function DayPlanning({ refreshKey }: { refreshKey: number }) {
  const [date, setDate] = useState(todayISO());
  const [blocks, setBlocks] = useState<PlanningBlock[]>([]);
  const [freeSlots, setFreeSlots] = useState<{ start: string; end: string; durationMinutes: number }[]>([]);
  const [proposals, setProposals] = useState<
    { taskId: number; title: string; proposedDate: string; proposedStart: string; proposedEnd: string }[]
  >([]);
  const [failures, setFailures] = useState<{ taskId: number; title: string; reason: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [day, props] = await Promise.all([getPlanningDay(date), getPlanningProposals()]);
    setBlocks(day.blocks);
    setFreeSlots(day.freeSlots);
    setProposals(props.proposals);
    setFailures(props.failures);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, refreshKey]);

  const accept = async (p: (typeof proposals)[number]) => {
    await applyProposal(p.taskId, p.proposedDate, p.proposedStart);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Planning"
        subtitle="L'EDT universitaire est prioritaire et verrouillé. Rien n'est déplacé automatiquement sans validation."
        action={
          <div className="flex items-center gap-2">
            <Link
              to="/planning/import"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              <FileUp size={16} /> Importer mon EDT
            </Link>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        }
      />

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <h2 className="font-semibold text-slate-800 mb-3">Journée du {date}</h2>
          {loading ? (
            <p className="text-sm text-slate-400">Chargement…</p>
          ) : blocks.length === 0 ? (
            <p className="text-sm text-slate-400">Rien de planifié ce jour-là.</p>
          ) : (
            <ul className="space-y-2">
              {blocks.map((b) => {
                const style = KIND_STYLE[b.kind] ?? { icon: "•", color: "bg-slate-50 border-slate-200" };
                return (
                  <li key={b.id} className={`flex items-center gap-3 text-sm p-2.5 rounded-lg border ${style.color}`}>
                    <span className="w-28 font-mono text-xs text-slate-500">
                      {b.startTime} – {b.endTime}
                    </span>
                    <span>{style.icon}</span>
                    <span className="flex-1">{b.label.replace(/^[^\s]+\s/, "")}</span>
                    {b.locked && <Badge>verrouillé</Badge>}
                  </li>
                );
              })}
            </ul>
          )}

          <h3 className="font-medium text-slate-700 mt-5 mb-2 text-sm">Créneaux libres</h3>
          <div className="flex flex-wrap gap-2">
            {freeSlots.map((s, i) => (
              <span key={i} className="text-xs bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
                {s.start} – {s.end} ({s.durationMinutes} min)
              </span>
            ))}
            {freeSlots.length === 0 && <p className="text-xs text-slate-400">Aucun créneau libre restant.</p>}
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-slate-800 mb-3">Propositions de placement</h2>
          <p className="text-xs text-slate-400 mb-3">
            Tâches flexibles sans horaire. Le moteur propose un créneau — rien n'est validé sans ton accord.
          </p>
          {proposals.length === 0 && failures.length === 0 && (
            <p className="text-sm text-slate-400">Aucune tâche flexible en attente de placement.</p>
          )}
          <ul className="space-y-3">
            {proposals.map((p) => (
              <li key={p.taskId} className="border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-medium">{p.title}</p>
                <p className="text-xs text-slate-500 mb-2">
                  Proposé : {p.proposedDate} à {p.proposedStart}
                </p>
                <Button variant="secondary" onClick={() => accept(p)}>
                  Accepter ce créneau
                </Button>
              </li>
            ))}
          </ul>
          {failures.length > 0 && (
            <div className="mt-4 space-y-2">
              {failures.map((f) => (
                <div key={f.taskId} className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-2.5">
                  {f.reason}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

type Mode = "day" | "week" | "recovery";

export default function Planning() {
  const [mode, setMode] = useState<Mode>("day");
  const [urgentOpen, setUrgentOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  const tabs: Array<[Mode, string]> = [
    ["day", "Jour"],
    ["week", "Semaine"],
    ["recovery", "Repas & sommeil"],
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex gap-2">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`text-sm px-4 py-2 rounded-lg font-medium ${
                mode === key ? "bg-brand-600 text-white" : "bg-white text-slate-500 border border-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button variant="secondary" onClick={() => setUrgentOpen(true)}>
          <Zap size={15} className="text-amber-500" /> Tâche urgente
        </Button>
      </div>

      {mode === "day" && <DayPlanning refreshKey={refreshKey} />}
      {mode === "week" && <WeekView refreshKey={refreshKey} />}
      {mode === "recovery" && <RecoveryEditor onChanged={refresh} />}

      {urgentOpen && <UrgentDialog onClose={() => setUrgentOpen(false)} onApplied={refresh} />}
    </div>
  );
}

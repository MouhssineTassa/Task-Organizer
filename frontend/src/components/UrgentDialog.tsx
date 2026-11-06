import { useState } from "react";
import { proposeUrgent, applyUrgent } from "../api/client";
import type { UrgentProposal } from "../api/client";
import { Button } from "./ui";
import { localDateString } from "../lib/date";
import { Zap, X } from "lucide-react";

export default function UrgentDialog({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(localDateString());
  const [startTime, setStartTime] = useState("18:20");
  const [endTime, setEndTime] = useState("18:40");
  const [proposal, setProposal] = useState<UrgentProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const propose = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (endTime <= startTime) {
      setError("L'heure de fin doit être après l'heure de début.");
      return;
    }
    setBusy(true);
    try {
      setProposal(await proposeUrgent({ title, date, startTime, endTime }));
    } catch {
      setError("Impossible de calculer la proposition.");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      await applyUrgent(proposal);
      onApplied();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Impossible d'appliquer la proposition.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-slate-800 flex items-center gap-2">
            <Zap size={18} className="text-amber-500" /> Tâche urgente
          </p>
          <button onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={propose} className="grid grid-cols-2 gap-2">
          <input
            className="col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm"
            placeholder="Ex: Imprimer le dossier"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setProposal(null);
            }}
            required
          />
          <input
            type="date"
            className="col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setProposal(null);
            }}
          />
          <input
            type="time"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={startTime}
            onChange={(e) => {
              setStartTime(e.target.value);
              setProposal(null);
            }}
          />
          <input
            type="time"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={endTime}
            onChange={(e) => {
              setEndTime(e.target.value);
              setProposal(null);
            }}
          />
          <Button type="submit" disabled={busy} className="col-span-2">
            Voir ce que ça change
          </Button>
        </form>

        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

        {proposal && (
          <div className="mt-4">
            <p className="text-sm text-slate-600">{proposal.message}</p>

            {!proposal.feasible && (
              <ul className="mt-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-2.5 space-y-1">
                {proposal.blockedBy.map((b, i) => (
                  <li key={i}>
                    {b.label} ({b.startTime}–{b.endTime})
                  </li>
                ))}
              </ul>
            )}

            {proposal.feasible && proposal.moves.length > 0 && (
              <ul className="mt-3 space-y-2">
                {proposal.moves.map((m) => (
                  <li key={m.taskId ?? `${m.occurrence?.ruleId}-${m.occurrence?.date}`} className="text-sm border border-slate-200 rounded-lg p-2.5">
                    <p className="font-medium">{m.title}{m.occurrence && <span className="ml-1.5 text-[11px] font-normal text-indigo-600">routine : seule cette occurrence est déplacée</span>}</p>
                    <p className="text-xs text-slate-500">
                      {m.from.startTime} →{" "}
                      {m.to ? `${m.to.date === date ? "" : m.to.date + " "}${m.to.startTime}` : "remise dans « à placer »"}
                    </p>
                    {m.reason && <p className="text-xs text-amber-700 mt-1">{m.reason}</p>}
                  </li>
                ))}
              </ul>
            )}

            {proposal.feasible && (
              <div className="flex gap-2 mt-4">
                <Button onClick={apply} disabled={busy}>
                  Valider
                </Button>
                <Button variant="secondary" onClick={() => setProposal(null)}>
                  Modifier
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

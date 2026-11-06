import { useEffect, useState } from "react";
import { getRecoveryBlocks, createRecoveryBlock, deleteRecoveryBlock } from "../api/client";
import type { RecoveryBlock } from "../api/client";
import { Card, Button } from "./ui";
import { Trash2 } from "lucide-react";

const KINDS: Array<{ value: RecoveryBlock["kind"]; label: string }> = [
  { value: "Sleep", label: "Sommeil" },
  { value: "Meal", label: "Repas" },
  { value: "ShortBreak", label: "Courte pause" },
  { value: "LongBreak", label: "Pause longue" },
  { value: "FreeTime", label: "Temps libre" },
  { value: "Commute", label: "Déplacement" },
];
const DAYS = ["L", "M", "M", "J", "V", "S", "D"];
const DAY_FULL = ["", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default function RecoveryEditor({ onChanged }: { onChanged: () => void }) {
  const [blocks, setBlocks] = useState<RecoveryBlock[]>([]);
  const [kind, setKind] = useState<RecoveryBlock["kind"]>("Meal");
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState("12:30");
  const [endTime, setEndTime] = useState("13:30");

  const load = async () => setBlocks(await getRecoveryBlocks());
  useEffect(() => {
    load();
  }, []);

  const toggle = (d: number) => setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || days.length === 0) return;
    await createRecoveryBlock({ kind, label, daysOfWeek: days, startTime, endTime });
    setLabel("");
    load();
    onChanged();
  };

  // regroupe par (libellé + horaires) pour afficher les jours ensemble
  const groups = new Map<string, { sample: RecoveryBlock; items: RecoveryBlock[] }>();
  for (const b of blocks) {
    const key = `${b.kind}|${b.label}|${b.start_time}|${b.end_time}`;
    if (!groups.has(key)) groups.set(key, { sample: b, items: [] });
    groups.get(key)!.items.push(b);
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <h2 className="font-semibold text-slate-800 mb-1">Repas, sommeil et pauses</h2>
        <p className="text-xs text-slate-400 mb-3">
          Ce sont de vrais blocs du planning : aucune tâche n'est placée dessus, et l'ajout d'une urgence ne les déplace jamais.
        </p>
        {groups.size === 0 ? (
          <p className="text-sm text-slate-400">Aucun bloc défini.</p>
        ) : (
          <ul className="space-y-2">
            {[...groups.values()].map(({ sample, items }) => (
              <li key={`${sample.kind}${sample.label}${sample.start_time}`} className="flex items-center justify-between text-sm border border-slate-100 rounded-lg px-3 py-2">
                <div>
                  <p className="font-medium">{sample.label}</p>
                  <p className="text-xs text-slate-400">
                    {sample.start_time}–{sample.end_time} · {items.map((i) => DAY_FULL[i.day_of_week]).join(" ")}
                  </p>
                </div>
                <button
                  title="Supprimer ce bloc sur tous ses jours"
                  onClick={async () => {
                    await Promise.all(items.map((i) => deleteRecoveryBlock(i.id)));
                    load();
                    onChanged();
                  }}
                  className="text-slate-300 hover:text-red-500"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-800 mb-3">Ajouter un bloc</h2>
        <form onSubmit={add} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value as RecoveryBlock["kind"])}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Nom (ex: Déjeuner)" value={label} onChange={(e) => setLabel(e.target.value)} />
            <input type="time" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <input type="time" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div className="flex gap-1.5">
            {DAYS.map((d, i) => (
              <button
                type="button"
                key={i}
                onClick={() => toggle(i + 1)}
                className={`w-9 h-9 rounded-full text-xs font-medium ${days.includes(i + 1) ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"}`}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400">Un horaire de fin avant le début (ex. 23:00 → 07:00) est traité comme passant minuit.</p>
          <Button type="submit">Ajouter</Button>
        </form>
      </Card>
    </div>
  );
}

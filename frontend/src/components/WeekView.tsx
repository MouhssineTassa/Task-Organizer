import { useEffect, useState } from "react";
import { getPlanningWeek } from "../api/client";
import type { PlanningBlock } from "../types";
import { localDateString } from "../lib/date";
import { ChevronLeft, ChevronRight } from "lucide-react";

const KIND_COLOR: Record<string, string> = {
  University: "bg-indigo-50 border-indigo-200",
  Event: "bg-pink-50 border-pink-200",
  Recovery: "bg-slate-50 border-slate-200 text-slate-500",
  Task: "bg-emerald-50 border-emerald-200",
};
const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function mondayOf(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = r.getDay() === 0 ? 7 : r.getDay();
  r.setDate(r.getDate() - (dow - 1));
  return r;
}

export default function WeekView({ refreshKey }: { refreshKey: number }) {
  const [monday, setMonday] = useState(mondayOf(new Date()));
  const [days, setDays] = useState<{ date: string; blocks: PlanningBlock[] }[]>([]);
  const today = localDateString();

  useEffect(() => {
    getPlanningWeek(localDateString(monday)).then((r) => setDays(r.days));
  }, [monday, refreshKey]);

  const shift = (n: number) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + n * 7);
    setMonday(d);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => shift(-1)} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Semaine précédente">
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-medium text-slate-700">Semaine du {localDateString(monday)}</p>
        <button onClick={() => shift(1)} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Semaine suivante">
          <ChevronRight size={18} />
        </button>
        <button onClick={() => setMonday(mondayOf(new Date()))} className="text-xs text-brand-600 ml-2">
          Aujourd'hui
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-2 min-w-[980px]">
          {days.map((d, i) => (
            <div key={d.date} className={`rounded-xl border p-2 ${d.date === today ? "border-brand-300 bg-brand-50/40" : "border-slate-200 bg-white"}`}>
              <p className="text-xs font-semibold text-slate-600 mb-2">
                {DAY_NAMES[i]} <span className="text-slate-400 font-normal">{d.date.slice(8)}</span>
              </p>
              <div className="space-y-1.5">
                {d.blocks.length === 0 && <p className="text-[11px] text-slate-300">—</p>}
                {d.blocks.map((b) => (
                  <div key={b.id} className={`border rounded-md px-1.5 py-1 text-[11px] leading-tight ${KIND_COLOR[b.kind] ?? "bg-slate-50 border-slate-200"}`}>
                    <p className="font-mono text-[10px] text-slate-400">
                      {b.startTime}–{b.endTime}
                    </p>
                    <p>{b.label}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

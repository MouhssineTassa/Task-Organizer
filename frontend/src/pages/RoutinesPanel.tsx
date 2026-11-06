import { useCallback, useEffect, useState } from "react";
import {
  getRoutines, createRoutine, deleteRoutine, getOccurrences, getHiddenOccurrences, occurrenceAction,
} from "../api/client";
import type { Occurrence, RoutineRule, HiddenOccurrence } from "../api/client";
import { Card, Badge, Button } from "../components/ui";
import { addDays, localDateString } from "../lib/date";
import { Plus, Trash2, Check, SkipForward, CalendarClock, Undo2, ChevronLeft, ChevronRight, Repeat } from "lucide-react";

const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];
const DAY_FULL = ["", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function mondayOf(d: Date): string {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = r.getDay() === 0 ? 7 : r.getDay();
  r.setDate(r.getDate() - (dow - 1));
  return localDateString(r);
}
const dayName = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
};

export default function RoutinesPanel() {
  const [rules, setRules] = useState<RoutineRule[]>([]);
  const [weekStart, setWeekStart] = useState(mondayOf(new Date()));
  const [occ, setOcc] = useState<Occurrence[]>([]);
  const [hidden, setHidden] = useState<HiddenOccurrence[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null); // clé de l'occurrence en cours de report
  const [moveDate, setMoveDate] = useState("");
  const [moveTime, setMoveTime] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<"Daily" | "Weekly">("Weekly");
  const [days, setDays] = useState<number[]>([3]);
  const [time, setTime] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [difficulty, setDifficulty] = useState("Medium");
  const [category, setCategory] = useState("Général");
  const [startDate, setStartDate] = useState(localDateString());
  const [endDate, setEndDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const loadRules = useCallback(async () => setRules(await getRoutines()), []);
  const loadWeek = useCallback(async () => {
    const end = addDays(weekStart, 6);
    const [o, h] = await Promise.all([getOccurrences(weekStart, end), getHiddenOccurrences(weekStart, end)]);
    setOcc(o);
    setHidden(h);
  }, [weekStart]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);
  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  const say = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const act = async (o: { ruleId: number; originalDate: string }, action: "complete" | "skip" | "cancel" | "reset") => {
    const r = await occurrenceAction(o.ruleId, o.originalDate, action);
    if (r.xpAwarded > 0) say(`+${r.xpAwarded} XP${r.newlyUnlocked.length ? ` · 🏆 ${r.newlyUnlocked.map((a) => a.title).join(", ")}` : ""}`);
    loadWeek();
    loadRules();
  };

  const reschedule = async (o: Occurrence) => {
    if (!moveDate) return;
    await occurrenceAction(o.ruleId, o.originalDate, "reschedule", { newDate: moveDate, newTime: moveTime || null });
    setMoving(null);
    loadWeek();
    loadRules();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (frequency === "Weekly" && days.length === 0) return setFormError("Choisis au moins un jour.");
    try {
      await createRoutine({
        title,
        category,
        difficulty,
        estimatedMinutes: minutes,
        startTime: time || null,
        frequency,
        daysOfWeek: frequency === "Weekly" ? days : undefined,
        startDate,
        endDate: endDate || null,
      });
      setTitle("");
      setShowForm(false);
      loadRules();
      loadWeek();
    } catch (err: any) {
      setFormError(err?.response?.data?.error ?? "Impossible de créer la routine.");
    }
  };

  const byDate = new Map<string, Occurrence[]>();
  for (let i = 0; i < 7; i++) byDate.set(addDays(weekStart, i), []);
  for (const o of occ) byDate.get(o.date)?.push(o);
  const today = localDateString();

  return (
    <div>
      {toast && <div className="mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3">{toast}</div>}

      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <p className="text-xs text-slate-500 max-w-xl">
          Une routine se répète toute seule. <strong>Sauter ou reporter une occurrence ne change pas la routine</strong> : la prochaine reste prévue.
        </p>
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus size={16} /> Nouvelle routine
        </Button>
      </div>

      {showForm && (
        <Card className="mb-5">
          <form onSubmit={submit} className="grid md:grid-cols-4 gap-3">
            <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm md:col-span-4" placeholder="Ex: Sport, Réviser Python, Lire 20 pages…" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
            <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={frequency} onChange={(e) => setFrequency(e.target.value as "Daily" | "Weekly")}>
              <option value="Weekly">Certains jours de la semaine</option>
              <option value="Daily">Tous les jours</option>
            </select>
            <input type="time" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={time} onChange={(e) => setTime(e.target.value)} title="Heure (facultatif : sans heure, la routine reste « à faire dans la journée »)" />
            <input type="number" min={5} max={600} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} title="Durée en minutes" />
            <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="Easy">Facile</option>
              <option value="Medium">Moyenne</option>
              <option value="Hard">Difficile</option>
              <option value="VeryHard">Très difficile</option>
            </select>
            {frequency === "Weekly" && (
              <div className="md:col-span-4 flex gap-1.5">
                {DAY_LABELS.map((l, i) => (
                  <button type="button" key={i} onClick={() => setDays((p) => (p.includes(i + 1) ? p.filter((x) => x !== i + 1) : [...p, i + 1]))} className={`w-9 h-9 rounded-full text-xs font-medium ${days.includes(i + 1) ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {l}
                  </button>
                ))}
              </div>
            )}
            <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Catégorie (ex: Sport)" value={category} onChange={(e) => setCategory(e.target.value)} />
            <label className="text-xs text-slate-500">À partir du<input type="date" className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
            <label className="text-xs text-slate-500">Jusqu'au (facultatif)<input type="date" className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
            {formError && <p role="alert" className="md:col-span-4 text-sm text-red-600">{formError}</p>}
            <div className="md:col-span-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button type="submit">Créer la routine</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Semaine précédente"><ChevronLeft size={17} /></button>
          <h2 className="font-semibold text-slate-800 text-sm">Semaine du {weekStart}</h2>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Semaine suivante"><ChevronRight size={17} /></button>
          <button onClick={() => setWeekStart(mondayOf(new Date()))} className="text-xs text-brand-600 ml-1">Cette semaine</button>
        </div>

        {rules.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune routine. Crée-en une pour qu'elle apparaisse ici et dans ton planning.</p>
        ) : (
          <div className="space-y-3">
            {[...byDate.entries()].map(([date, list]) => {
              const hid = hidden.filter((h) => h.date === date);
              if (list.length === 0 && hid.length === 0) return null;
              return (
                <div key={date}>
                  <p className={`text-xs font-semibold capitalize mb-1 ${date === today ? "text-brand-600" : "text-slate-500"}`}>{dayName(date)}{date === today ? " — aujourd'hui" : ""}</p>
                  <ul className="space-y-1.5">
                    {list.map((o) => {
                      const key = `${o.ruleId}|${o.originalDate}`;
                      return (
                        <li key={key} className="border border-slate-200 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Repeat size={14} className="text-indigo-400" />
                            <span className={`text-sm ${o.status === "Completed" ? "line-through text-slate-400" : "font-medium"}`}>{o.title}</span>
                            <span className="text-xs text-slate-400">{o.time ? `${o.time} · ` : "dans la journée · "}{o.estimatedMinutes} min</span>
                            {o.rescheduled && <Badge color="amber">reportée du {o.originalDate.slice(5)}</Badge>}
                            {o.status === "Completed" && <Badge color="green">faite</Badge>}
                            {o.status === "Pending" && (
                              <span className="ml-auto flex gap-1">
                                <button title="Terminer" onClick={() => act(o, "complete")} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600"><Check size={16} /></button>
                                <button title="Sauter cette occurrence (la routine continue)" onClick={() => act(o, "skip")} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><SkipForward size={16} /></button>
                                <button title="Reporter cette occurrence" onClick={() => { setMoving(moving === key ? null : key); setMoveDate(o.date); setMoveTime(o.time ?? ""); }} className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600"><CalendarClock size={16} /></button>
                                <button title="Annuler cette occurrence" onClick={() => act(o, "cancel")} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><Trash2 size={15} /></button>
                                {o.rescheduled && <button title="Annuler le report" onClick={() => act(o, "reset")} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Undo2 size={15} /></button>}
                              </span>
                            )}
                          </div>
                          {moving === key && (
                            <div className="flex gap-2 mt-2 items-center flex-wrap">
                              <input type="date" className="border border-slate-200 rounded-lg px-2 py-1 text-sm" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
                              <input type="time" className="border border-slate-200 rounded-lg px-2 py-1 text-sm" value={moveTime} onChange={(e) => setMoveTime(e.target.value)} />
                              <Button onClick={() => reschedule(o)}>Confirmer le report</Button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                    {hid.map((h) => (
                      <li key={`${h.ruleId}|${h.date}`} className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 bg-slate-50 rounded-lg">
                        <span className="line-through">{h.title}</span>
                        <Badge>{h.status === "Skipped" ? "sautée" : "annulée"}</Badge>
                        <button onClick={() => act({ ruleId: h.ruleId, originalDate: h.date }, "reset")} className="ml-auto text-brand-600 inline-flex items-center gap-1"><Undo2 size={13} /> Rétablir</button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {occ.length === 0 && hidden.length === 0 && <p className="text-sm text-slate-400">Rien de prévu cette semaine.</p>}
          </div>
        )}
      </Card>

      <h2 className="font-semibold text-slate-800 text-sm mb-2">Mes routines</h2>
      <div className="grid md:grid-cols-2 gap-3">
        {rules.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-slate-800">{r.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {r.frequency === "Daily" ? "Tous les jours" : r.daysList.map((d) => DAY_FULL[d]).join(" ")} · {r.start_time ?? "sans heure"} · {r.estimated_minutes} min
                </p>
                {r.upcoming[0] && <p className="text-xs text-indigo-600 mt-1">Prochaine : {dayName(r.upcoming[0].date)}{r.upcoming[0].time ? ` à ${r.upcoming[0].time}` : ""}</p>}
              </div>
              <button title="Arrêter cette routine (l'historique est conservé)" onClick={async () => { await deleteRoutine(r.id); loadRules(); loadWeek(); }} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

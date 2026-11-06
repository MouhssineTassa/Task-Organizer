import { useEffect, useState } from "react";
import {
  getPrograms,
  createProgram,
  deleteProgram,
  getSessions,
  createSession,
  deleteSession,
  getSportProgress,
} from "../api/client";
import type { WorkoutProgram, WorkoutSession } from "../api/client";
import { Card, PageHeader, Badge, Button } from "../components/ui";
import { Plus, Trash2 } from "lucide-react";
import { localDateString } from "../lib/date";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

interface ExRow {
  exerciseName: string;
  sets: number | "";
  reps: number | "";
  weight: number | "";
}

export default function Sport() {
  const [programs, setPrograms] = useState<WorkoutProgram[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [progress, setProgress] = useState<Awaited<ReturnType<typeof getSportProgress>> | null>(null);

  const [showProgramForm, setShowProgramForm] = useState(false);
  const [programName, setProgramName] = useState("");
  const [dayLabels, setDayLabels] = useState<string[]>(Array(7).fill(""));

  const [showSessionForm, setShowSessionForm] = useState(false);
  const [label, setLabel] = useState("");
  const [duration, setDuration] = useState<number | "">(60);
  const [rows, setRows] = useState<ExRow[]>([{ exerciseName: "", sets: "", reps: "", weight: "" }]);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    setPrograms(await getPrograms());
    setSessions(await getSessions());
    setProgress(await getSportProgress());
  };
  useEffect(() => {
    load();
  }, []);

  const submitProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!programName.trim()) return;
    const days = dayLabels
      .map((l, i) => ({ dayOfWeek: i + 1, label: l.trim() }))
      .filter((d) => d.label);
    await createProgram(programName, days);
    setProgramName("");
    setDayLabels(Array(7).fill(""));
    setShowProgramForm(false);
    load();
  };

  const submitSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    const result = await createSession({
      label,
      date: localDateString(new Date()),
      durationMinutes: duration === "" ? undefined : Number(duration),
      exercises: rows
        .filter((r) => r.exerciseName.trim())
        .map((r) => ({
          exerciseName: r.exerciseName,
          sets: r.sets === "" ? undefined : Number(r.sets),
          reps: r.reps === "" ? undefined : Number(r.reps),
          weight: r.weight === "" ? undefined : Number(r.weight),
        })),
    });
    setToast(`Séance enregistrée · +${result.xpAwarded} XP`);
    setTimeout(() => setToast(null), 3500);
    setLabel("");
    setRows([{ exerciseName: "", sets: "", reps: "", weight: "" }]);
    setShowSessionForm(false);
    load();
  };

  const updateRow = (i: number, patch: Partial<ExRow>) =>
    setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  return (
    <div>
      <PageHeader
        title="🏋️ Sport"
        subtitle="Programmes, séances, historique et progression des charges."
        action={
          <Button onClick={() => setShowSessionForm((s) => !s)}>
            <Plus size={16} /> Enregistrer une séance
          </Button>
        }
      />

      {toast && <div className="mb-4 text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3">{toast}</div>}

      {showSessionForm && (
        <Card className="mb-5">
          <form onSubmit={submitSession} className="space-y-3">
            <div className="grid md:grid-cols-3 gap-3">
              <input
                list="program-labels"
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm md:col-span-2"
                placeholder="Séance (ex: Chest + Triceps)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
              />
              <datalist id="program-labels">
                {programs.flatMap((p) => p.days.map((d) => <option key={`${p.id}-${d.dayOfWeek}`} value={d.label} />))}
              </datalist>
              <input
                type="number"
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Durée (min)"
                value={duration}
                onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : "")}
              />
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-4 gap-2">
                <input
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm col-span-4 md:col-span-1"
                  placeholder="Exercice"
                  value={r.exerciseName}
                  onChange={(e) => updateRow(i, { exerciseName: e.target.value })}
                />
                <input
                  type="number"
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                  placeholder="Séries"
                  value={r.sets}
                  onChange={(e) => updateRow(i, { sets: e.target.value ? Number(e.target.value) : "" })}
                />
                <input
                  type="number"
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                  placeholder="Reps"
                  value={r.reps}
                  onChange={(e) => updateRow(i, { reps: e.target.value ? Number(e.target.value) : "" })}
                />
                <input
                  type="number"
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                  placeholder="Charge (kg)"
                  value={r.weight}
                  onChange={(e) => updateRow(i, { weight: e.target.value ? Number(e.target.value) : "" })}
                />
              </div>
            ))}
            <div className="flex justify-between">
              <Button
                variant="ghost"
                onClick={() => setRows((r) => [...r, { exerciseName: "", sets: "", reps: "", weight: "" }])}
              >
                + Exercice
              </Button>
              <Button type="submit">Enregistrer</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-3">
          <h2 className="font-semibold text-slate-800">Historique</h2>
          {sessions.length === 0 && (
            <Card className="text-center py-8 text-slate-400 text-sm">Aucune séance enregistrée.</Card>
          )}
          {sessions.map((s) => (
            <Card key={s.id}>
              <div className="flex justify-between">
                <div>
                  <p className="font-medium">{s.label}</p>
                  <p className="text-xs text-slate-400">
                    {s.date} {s.duration_minutes ? `· ${s.duration_minutes} min` : ""}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await deleteSession(s.id);
                    load();
                  }}
                  className="text-slate-300 hover:text-red-500"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {s.exercises.length > 0 && (
                <ul className="mt-2 text-sm space-y-0.5">
                  {s.exercises.map((e) => (
                    <li key={e.id} className="text-slate-600">
                      {e.exercise_name}
                      {e.sets && e.reps ? ` — ${e.sets}×${e.reps}` : ""}
                      {e.weight ? ` @ ${e.weight} kg` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-semibold text-slate-800">Programmes</h2>
              <button onClick={() => setShowProgramForm((s) => !s)} className="text-brand-600">
                <Plus size={16} />
              </button>
            </div>
            {showProgramForm && (
              <form onSubmit={submitProgram} className="space-y-1.5 mb-3">
                <input
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-full"
                  placeholder="Nom du programme"
                  value={programName}
                  onChange={(e) => setProgramName(e.target.value)}
                />
                {DAYS.map((d, i) => (
                  <input
                    key={d}
                    className="border border-slate-200 rounded-lg px-2 py-1 text-xs w-full"
                    placeholder={`${d} (laisser vide = repos)`}
                    value={dayLabels[i]}
                    onChange={(e) => setDayLabels((l) => l.map((x, idx) => (idx === i ? e.target.value : x)))}
                  />
                ))}
                <Button type="submit" className="w-full">
                  Créer
                </Button>
              </form>
            )}
            {programs.map((p) => (
              <div key={p.id} className="mb-3">
                <div className="flex justify-between">
                  <p className="text-sm font-medium">{p.name}</p>
                  <button
                    onClick={async () => {
                      await deleteProgram(p.id);
                      load();
                    }}
                    className="text-slate-300 hover:text-red-500"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                {p.days.map((d) => (
                  <p key={d.dayOfWeek} className="text-xs text-slate-500">
                    {DAYS[d.dayOfWeek - 1]} → {d.label}
                  </p>
                ))}
              </div>
            ))}
            {programs.length === 0 && !showProgramForm && <p className="text-xs text-slate-400">Aucun programme.</p>}
          </Card>

          <Card>
            <h2 className="font-semibold text-slate-800 mb-2">Progression</h2>
            {progress?.best.length ? (
              <ul className="space-y-1">
                {progress.best.map((b) => (
                  <li key={b.exercise_name} className="flex justify-between text-sm">
                    <span>{b.exercise_name}</span>
                    <Badge color="indigo">{b.maxWeight} kg max</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">Enregistre des charges pour suivre ta progression.</p>
            )}
            {progress?.perWeek.length ? (
              <p className="text-xs text-slate-400 mt-3">
                Séances par semaine : {progress.perWeek.map((w) => `${w.week.slice(5)}: ${w.sessions}`).join(" · ")}
              </p>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}

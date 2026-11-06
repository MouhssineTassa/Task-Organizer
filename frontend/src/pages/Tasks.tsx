import { useEffect, useState } from "react";
import { getTasks, createTask, taskAction, deleteTask } from "../api/client";
import type { Task, TaskPriority, TaskDifficulty, TaskType } from "../types";
import { Card, Badge, PageHeader, Button } from "../components/ui";
import { Plus, Trash2, CheckCircle2, SkipForward, CalendarClock, Pause, Ban } from "lucide-react";
import HabitsPanel from "./HabitsPanel";
import RoutinesPanel from "./RoutinesPanel";
import { localDateString } from "../lib/date";

const STATUS_COLOR: Record<string, "slate" | "green" | "red" | "amber" | "indigo" | "blue"> = {
  Pending: "blue",
  Completed: "green",
  Rescheduled: "amber",
  Skipped: "slate",
  Cancelled: "red",
  Failed: "red",
  Paused: "amber",
};

const PRIORITY_COLOR: Record<TaskPriority, "slate" | "red" | "amber"> = {
  Critical: "red",
  High: "red",
  Medium: "amber",
  Low: "slate",
  Optional: "slate",
};

const emptyForm = {
  title: "",
  description: "",
  category: "Général",
  priority: "Medium" as TaskPriority,
  difficulty: "Medium" as TaskDifficulty,
  taskType: "Flexible" as TaskType,
  estimatedMinutes: 30,
  date: "",
  startTime: "",
  deadline: "",
  context: "",
};

export default function Tasks() {
  const [tab, setTab] = useState<"tasks" | "routines" | "habits">("tasks");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("Pending");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await getTasks(statusFilter === "All" ? undefined : { status: statusFilter });
    setTasks(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    await createTask({
      title: form.title,
      description: form.description || null,
      category: form.category,
      priority: form.priority,
      difficulty: form.difficulty,
      taskType: form.taskType,
      estimatedMinutes: Number(form.estimatedMinutes) || 30,
      date: form.date || null,
      startTime: form.startTime || null,
      deadline: form.deadline || null,
      context: form.context || null,
    });
    setForm(emptyForm);
    setShowForm(false);
    load();
  };

  const runAction = async (id: number, action: Parameters<typeof taskAction>[1]) => {
    let result;
    if (action === "reschedule") {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      result = await taskAction(id, action, { newDate: localDateString(tomorrow) });
    } else {
      result = await taskAction(id, action);
    }
    if (result.newlyUnlocked?.length > 0) {
      setToast(`🏆 Trophée débloqué : ${result.newlyUnlocked.map((a) => a.title).join(", ")}`);
      setTimeout(() => setToast(null), 4000);
    }
    load();
  };

  return (
    <div>
      <PageHeader
        title="Tâches"
        subtitle="Tâches ponctuelles, flexibles, urgentes ou fixes — jamais confondues avec les cours."
        action={
          tab === "tasks" ? (
            <Button onClick={() => setShowForm((s) => !s)}>
              <Plus size={16} /> Nouvelle tâche
            </Button>
          ) : undefined
        }
      />

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setTab("tasks")}
          className={`text-sm px-4 py-2 rounded-lg font-medium ${
            tab === "tasks" ? "bg-brand-600 text-white" : "bg-white text-slate-500 border border-slate-200"
          }`}
        >
          Tâches
        </button>
        <button
          onClick={() => setTab("routines")}
          className={`text-sm px-4 py-2 rounded-lg font-medium ${
            tab === "routines" ? "bg-brand-600 text-white" : "bg-white text-slate-500 border border-slate-200"
          }`}
        >
          Routines
        </button>
        <button
          onClick={() => setTab("habits")}
          className={`text-sm px-4 py-2 rounded-lg font-medium ${
            tab === "habits" ? "bg-brand-600 text-white" : "bg-white text-slate-500 border border-slate-200"
          }`}
        >
          Habitudes
        </button>
      </div>

      {toast && (
        <div className="mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3">{toast}</div>
      )}

      {tab === "habits" ? (
        <HabitsPanel />
      ) : tab === "routines" ? (
        <RoutinesPanel />
      ) : (
        <>
          {showForm && (
        <Card className="mb-5">
          <form onSubmit={submit} className="grid md:grid-cols-3 gap-3">
            <input
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm md:col-span-3"
              placeholder="Titre de la tâche"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
            <textarea
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm md:col-span-3"
              placeholder="Description (optionnel)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <select
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
            >
              {["Critical", "High", "Medium", "Low", "Optional"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <select
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={form.difficulty}
              onChange={(e) => setForm({ ...form, difficulty: e.target.value as TaskDifficulty })}
            >
              {["Easy", "Medium", "Hard", "VeryHard"].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <select
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={form.taskType}
              onChange={(e) => setForm({ ...form, taskType: e.target.value as TaskType })}
            >
              {["Flexible", "Fixed", "Recurring", "Urgent"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <input
              type="number"
              min={5}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Durée estimée (min)"
              value={form.estimatedMinutes}
              onChange={(e) => setForm({ ...form, estimatedMinutes: Number(e.target.value) })}
            />
            <input
              type="date"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
            <input
              type="time"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Heure (si fixe)"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
            <input
              type="date"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Deadline"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            />
            <div className="md:col-span-3 flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button type="submit">Créer la tâche</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {["Pending", "Completed", "Rescheduled", "Skipped", "Cancelled", "Paused", "All"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              statusFilter === s
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white text-slate-500 border-slate-200"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : tasks.length === 0 ? (
        <Card className="text-center py-10 text-slate-400 text-sm">Aucune tâche dans ce filtre.</Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <Card key={t.id} className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-slate-800">{t.title}</p>
                  <Badge color={STATUS_COLOR[t.status]}>{t.status}</Badge>
                  <Badge color={PRIORITY_COLOR[t.priority]}>{t.priority}</Badge>
                  <Badge>{t.task_type}</Badge>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {t.date ?? "Pas encore planifiée"} {t.start_time ? `à ${t.start_time}` : ""} ·{" "}
                  {t.estimated_minutes} min {t.deadline ? `· deadline ${t.deadline}` : ""}
                </p>
              </div>
              {t.status === "Pending" && (
                <div className="flex gap-1">
                  <button
                    title="Terminer"
                    onClick={() => runAction(t.id, "complete")}
                    className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-600"
                  >
                    <CheckCircle2 size={17} />
                  </button>
                  <button
                    title="Reporter à demain"
                    onClick={() => runAction(t.id, "reschedule")}
                    className="p-2 rounded-lg hover:bg-amber-50 text-amber-600"
                  >
                    <CalendarClock size={17} />
                  </button>
                  <button
                    title="Sauter cette occurrence"
                    onClick={() => runAction(t.id, "skip")}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                  >
                    <SkipForward size={17} />
                  </button>
                  <button
                    title="Mettre en pause"
                    onClick={() => runAction(t.id, "pause")}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                  >
                    <Pause size={17} />
                  </button>
                  <button
                    title="Annuler"
                    onClick={() => runAction(t.id, "cancel")}
                    className="p-2 rounded-lg hover:bg-red-50 text-red-500"
                  >
                    <Ban size={17} />
                  </button>
                </div>
              )}
              {t.status === "Paused" && (
                <Button variant="secondary" onClick={() => runAction(t.id, "resume")}>
                  Reprendre
                </Button>
              )}
              <button
                title="Supprimer définitivement"
                onClick={async () => {
                  await deleteTask(t.id);
                  load();
                }}
                className="p-2 rounded-lg hover:bg-red-50 text-red-400"
              >
                <Trash2 size={16} />
              </button>
            </Card>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}

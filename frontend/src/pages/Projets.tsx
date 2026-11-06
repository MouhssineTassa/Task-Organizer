import { useEffect, useState } from "react";
import { getProjects, createProject, deleteProject, addProjectTask, moveProjectTask } from "../api/client";
import type { Project, ProjectTask } from "../api/client";
import { Card, PageHeader, Button } from "../components/ui";
import { Plus, Trash2, ArrowRight, ArrowLeft } from "lucide-react";

type Column = "TODO" | "DOING" | "DONE";
const COLUMNS: Array<{ key: Column; label: string }> = [
  { key: "TODO", label: "À faire" },
  { key: "DOING", label: "En cours" },
  { key: "DONE", label: "Terminé" },
];

export default function Projets() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [newTask, setNewTask] = useState<Record<number, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => setProjects(await getProjects());
  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await createProject(title, deadline || undefined);
    setTitle("");
    setDeadline("");
    setShowForm(false);
    load();
  };

  const addTask = async (projectId: number) => {
    const t = (newTask[projectId] ?? "").trim();
    if (!t) return;
    await addProjectTask(projectId, t);
    setNewTask((prev) => ({ ...prev, [projectId]: "" }));
    load();
  };

  const move = async (task: ProjectTask, column: Column) => {
    const result = await moveProjectTask(task.id, column);
    if (result.xpAwarded > 0) {
      setToast(`+${result.xpAwarded} XP — carte terminée`);
      setTimeout(() => setToast(null), 3000);
    }
    load();
  };

  const shift = (col: Column, dir: 1 | -1): Column | null => {
    const idx = COLUMNS.findIndex((c) => c.key === col) + dir;
    return idx >= 0 && idx < COLUMNS.length ? COLUMNS[idx].key : null;
  };

  return (
    <div>
      <PageHeader
        title="💻 Projets"
        subtitle="Kanban, deadlines et progression."
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus size={16} /> Nouveau projet
          </Button>
        }
      />

      {toast && <div className="mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3">{toast}</div>}

      {showForm && (
        <Card className="mb-5">
          <form onSubmit={submit} className="grid md:grid-cols-3 gap-3">
            <input
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm md:col-span-2"
              placeholder="Nom du projet"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <input
              type="date"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
            <div className="md:col-span-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button type="submit">Créer</Button>
            </div>
          </form>
        </Card>
      )}

      {projects.length === 0 ? (
        <Card className="text-center py-10 text-slate-400 text-sm">Aucun projet pour le moment.</Card>
      ) : (
        <div className="space-y-6">
          {projects.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-slate-800">{p.title}</p>
                  <p className="text-xs text-slate-400">
                    {p.deadline ? `Deadline : ${p.deadline} · ` : ""}
                    {p.tasksDone}/{p.tasksTotal} cartes terminées
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await deleteProject(p.id);
                    load();
                  }}
                  className="text-slate-300 hover:text-red-500"
                  title="Supprimer le projet"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
                <div className="h-full bg-emerald-400" style={{ width: `${p.progress * 100}%` }} />
              </div>

              <div className="grid md:grid-cols-3 gap-3">
                {COLUMNS.map((col) => (
                  <div key={col.key} className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-xs font-semibold text-slate-500 mb-2">{col.label}</p>
                    <div className="space-y-2">
                      {p.tasks
                        .filter((t) => t.column_name === col.key)
                        .map((t) => {
                          const prev = shift(col.key, -1);
                          const next = shift(col.key, 1);
                          return (
                            <div key={t.id} className="bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-sm">
                              <p>{t.title}</p>
                              <div className="flex gap-1 mt-1.5">
                                {prev && (
                                  <button onClick={() => move(t, prev)} className="text-slate-400 hover:text-brand-600" title="Reculer">
                                    <ArrowLeft size={14} />
                                  </button>
                                )}
                                {next && (
                                  <button onClick={() => move(t, next)} className="text-slate-400 hover:text-brand-600" title="Avancer">
                                    <ArrowRight size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-3">
                <input
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
                  placeholder="Nouvelle carte…"
                  value={newTask[p.id] ?? ""}
                  onChange={(e) => setNewTask((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addTask(p.id)}
                />
                <Button variant="secondary" onClick={() => addTask(p.id)}>
                  Ajouter
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { getGoals, createGoal, updateGoal, deleteGoal, getMissions, createMission, deleteMission } from "../api/client";
import type { Goal, Mission } from "../types";
import { Card, PageHeader, Badge, Button } from "../components/ui";
import { Plus, Trash2, Target, Swords } from "lucide-react";

const TERM_LABEL: Record<string, string> = { short: "Court terme", medium: "Moyen terme", long: "Long terme" };

export default function Objectifs() {
  const [tab, setTab] = useState<"goals" | "missions">("goals");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [showMissionForm, setShowMissionForm] = useState(false);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalTerm, setGoalTerm] = useState<"short" | "medium" | "long">("short");
  const [missionTitle, setMissionTitle] = useState("");
  const [missionReward, setMissionReward] = useState(50);

  const loadGoals = async () => setGoals(await getGoals());
  const loadMissions = async () => setMissions(await getMissions());

  useEffect(() => {
    loadGoals();
    loadMissions();
  }, []);

  const submitGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle.trim()) return;
    await createGoal({ title: goalTitle, term: goalTerm });
    setGoalTitle("");
    setShowGoalForm(false);
    loadGoals();
  };

  const submitMission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!missionTitle.trim()) return;
    await createMission({ title: missionTitle, rewardXp: missionReward });
    setMissionTitle("");
    setShowMissionForm(false);
    loadMissions();
  };

  return (
    <div>
      <PageHeader
        title="🎯 Objectifs"
        subtitle="Objectifs court/moyen/long terme et missions regroupant plusieurs tâches."
        action={
          <Button onClick={() => (tab === "goals" ? setShowGoalForm((s) => !s) : setShowMissionForm((s) => !s))}>
            <Plus size={16} /> {tab === "goals" ? "Nouvel objectif" : "Nouvelle mission"}
          </Button>
        }
      />

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setTab("goals")}
          className={`text-sm px-4 py-2 rounded-lg font-medium flex items-center gap-1.5 ${
            tab === "goals" ? "bg-brand-600 text-white" : "bg-white text-slate-500 border border-slate-200"
          }`}
        >
          <Target size={15} /> Objectifs
        </button>
        <button
          onClick={() => setTab("missions")}
          className={`text-sm px-4 py-2 rounded-lg font-medium flex items-center gap-1.5 ${
            tab === "missions" ? "bg-brand-600 text-white" : "bg-white text-slate-500 border border-slate-200"
          }`}
        >
          <Swords size={15} /> Missions
        </button>
      </div>

      {tab === "goals" ? (
        <>
          {showGoalForm && (
            <Card className="mb-5">
              <form onSubmit={submitGoal} className="grid md:grid-cols-3 gap-3">
                <input
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm md:col-span-2"
                  placeholder="Ex: Réussir mon semestre"
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  required
                />
                <select
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={goalTerm}
                  onChange={(e) => setGoalTerm(e.target.value as any)}
                >
                  <option value="short">Court terme</option>
                  <option value="medium">Moyen terme</option>
                  <option value="long">Long terme</option>
                </select>
                <div className="md:col-span-3 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setShowGoalForm(false)}>
                    Annuler
                  </Button>
                  <Button type="submit">Créer</Button>
                </div>
              </form>
            </Card>
          )}

          {goals.length === 0 ? (
            <Card className="text-center py-10 text-slate-400 text-sm">
              Aucun objectif. Lie des tâches à un objectif (champ "goalId") pour suivre sa progression automatiquement.
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {goals.map((g) => (
                <Card key={g.id}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-slate-800">{g.title}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge>{TERM_LABEL[g.term]}</Badge>
                        <Badge color={g.status === "Completed" ? "green" : "blue"}>{g.status}</Badge>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        await deleteGoal(g.id);
                        loadGoals();
                      }}
                      className="text-slate-300 hover:text-red-500"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="mt-3">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400" style={{ width: `${g.progress * 100}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {g.tasksCompleted}/{g.tasksTotal} tâches liées terminées
                    </p>
                  </div>
                  {g.status === "Active" && g.tasksTotal > 0 && g.progress === 1 && (
                    <Button
                      variant="secondary"
                      className="mt-2"
                      onClick={async () => {
                        await updateGoal(g.id, { status: "Completed" });
                        loadGoals();
                      }}
                    >
                      Marquer comme atteint
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {showMissionForm && (
            <Card className="mb-5">
              <form onSubmit={submitMission} className="grid md:grid-cols-3 gap-3">
                <input
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm md:col-span-2"
                  placeholder="Ex: Préparer l'examen SQL"
                  value={missionTitle}
                  onChange={(e) => setMissionTitle(e.target.value)}
                  required
                />
                <input
                  type="number"
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="Récompense XP"
                  value={missionReward}
                  onChange={(e) => setMissionReward(Number(e.target.value))}
                />
                <div className="md:col-span-3 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setShowMissionForm(false)}>
                    Annuler
                  </Button>
                  <Button type="submit">Créer</Button>
                </div>
              </form>
            </Card>
          )}

          {missions.length === 0 ? (
            <Card className="text-center py-10 text-slate-400 text-sm">
              Aucune mission. Crée une mission puis lie des tâches à elle (champ "missionId") — la mission se termine
              automatiquement et donne son XP bonus quand toutes ses tâches sont terminées.
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {missions.map((m) => (
                <Card key={m.id}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-slate-800">{m.title}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge color={m.status === "Completed" ? "green" : "blue"}>{m.status}</Badge>
                        <Badge color="amber">+{m.reward_xp} XP</Badge>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        await deleteMission(m.id);
                        loadMissions();
                      }}
                      className="text-slate-300 hover:text-red-500"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="mt-3">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-400" style={{ width: `${m.progress * 100}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {m.tasksCompleted}/{m.tasksTotal} tâches terminées
                    </p>
                  </div>
                  {m.tasks.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {m.tasks.map((t) => (
                        <li key={t.id} className="text-xs flex items-center gap-2">
                          <Badge color={t.status === "Completed" ? "green" : "slate"}>{t.status}</Badge>
                          {t.title}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

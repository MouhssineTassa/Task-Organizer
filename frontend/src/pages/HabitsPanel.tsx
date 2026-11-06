import { useEffect, useState } from "react";
import { getHabits, createHabit, logHabit, freezeHabit, deleteHabit } from "../api/client";
import type { Habit } from "../types";
import { Card, Badge, Button } from "../components/ui";
import { Plus, Flame, Snowflake, Trash2, Check, X } from "lucide-react";
import { localDateString } from "../lib/date";

const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

function todayISO() {
  return localDateString(new Date());
}

export default function HabitsPanel() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Général");
  const [frequencyType, setFrequencyType] = useState<"Daily" | "Weekly">("Daily");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => setHabits(await getHabits());

  useEffect(() => {
    load();
  }, []);

  const toggleDay = (d: number) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await createHabit({
      title,
      category,
      frequencyType,
      daysOfWeek: frequencyType === "Weekly" ? days.join(",") : null,
    });
    setTitle("");
    setShowForm(false);
    load();
  };

  const markToday = async (habit: Habit, status: "Completed" | "Skipped" | "Missed") => {
    const result = await logHabit(habit.id, todayISO(), status);
    if (result.newlyUnlocked.length > 0) {
      setToast(`🏆 Trophée débloqué : ${result.newlyUnlocked.map((a) => a.title).join(", ")}`);
      setTimeout(() => setToast(null), 4000);
    }
    load();
  };

  const freeze = async (habit: Habit) => {
    try {
      await freezeHabit(habit.id, todayISO());
      load();
    } catch (e: any) {
      setToast(e?.response?.data?.error ?? "Impossible d'appliquer la protection.");
      setTimeout(() => setToast(null), 4000);
    }
  };

  return (
    <div>
      {toast && (
        <div className="mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3">{toast}</div>
      )}

      <div className="flex justify-end mb-3">
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus size={16} /> Nouvelle habitude
        </Button>
      </div>

      {showForm && (
        <Card className="mb-5">
          <form onSubmit={submit} className="grid md:grid-cols-2 gap-3">
            <input
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm md:col-span-2"
              placeholder="Ex: Lecture quotidienne, Sport, Anglais…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <input
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Catégorie (ex: Lecture, Sport, Études)"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <select
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={frequencyType}
              onChange={(e) => setFrequencyType(e.target.value as "Daily" | "Weekly")}
            >
              <option value="Daily">Tous les jours</option>
              <option value="Weekly">Jours précis de la semaine</option>
            </select>
            {frequencyType === "Weekly" && (
              <div className="md:col-span-2 flex gap-1.5">
                {DAY_LABELS.map((label, i) => {
                  const dayNum = i + 1;
                  const active = days.includes(dayNum);
                  return (
                    <button
                      type="button"
                      key={dayNum}
                      onClick={() => toggleDay(dayNum)}
                      className={`w-9 h-9 rounded-full text-xs font-medium ${
                        active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button type="submit">Créer</Button>
            </div>
          </form>
        </Card>
      )}

      {habits.length === 0 ? (
        <Card className="text-center py-10 text-slate-400 text-sm">Aucune habitude pour le moment.</Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {habits.map((h) => (
            <Card key={h.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-slate-800">{h.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge>{h.category}</Badge>
                    <Badge>{h.frequency_type === "Daily" ? "Quotidien" : "Hebdomadaire"}</Badge>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await deleteHabit(h.id);
                    load();
                  }}
                  className="text-slate-300 hover:text-red-500"
                  title="Désactiver (l'historique est conservé)"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <Flame size={16} className="text-amber-500" />
                <span className="text-sm font-semibold">{h.streak.current} jours</span>
                <span className="text-xs text-slate-400">(record : {h.streak.best})</span>
              </div>

              <div className="flex gap-2 mt-3">
                <Button variant="secondary" onClick={() => markToday(h, "Completed")}>
                  <Check size={14} /> Fait aujourd'hui
                </Button>
                <Button variant="ghost" onClick={() => markToday(h, "Skipped")}>
                  <X size={14} /> Sauter
                </Button>
                <button
                  onClick={() => freeze(h)}
                  title="Protéger la série (limité à 3/mois)"
                  className="p-2 rounded-lg hover:bg-blue-50 text-blue-500"
                >
                  <Snowflake size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

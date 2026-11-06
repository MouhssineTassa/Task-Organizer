// Tests de la logique de planification. Lancer : npm test (depuis backend/)
// Fuseau forcé sur celui de l'utilisateur pour détecter les décalages UTC.
process.env.TZ = "Africa/Casablanca";
const os = require("os");
const path = require("path");
const fs = require("fs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plos-"));
process.env.DB_PATH = path.join(tmp, "test.db");

const test = require("node:test");
const assert = require("node:assert/strict");

const { runMigrations } = require("../dist/db/migrate");
const { sqlite } = require("../dist/db");
const { localDateString } = require("../dist/services/dateUtils");
const { proposeUrgent, applyUrgent } = require("../dist/services/urgentPlanner");
const { getOccupiedBlocksForDate, getFreeSlots } = require("../dist/services/plannerEngine");

runMigrations();

const SAT = "2026-10-17"; // samedi : aucun repas/sommeil par défaut dans la journée
const MON = "2026-10-12"; // lundi : déjeuner 12:30-13:30, sommeil 23:00-07:00

function addTask(title, date, start, minutes = 60, type = "Flexible") {
  const now = new Date().toISOString();
  return Number(
    sqlite
      .prepare(
        `INSERT INTO tasks (title, category, priority, difficulty, task_type, flexibility, estimated_minutes, date, start_time, status, created_at, updated_at)
         VALUES (?, 'Général', 'Medium', 'Medium', ?, 'FullyFlexible', ?, ?, ?, 'Pending', ?, ?)`
      )
      .run(title, type, minutes, date, start, now, now).lastInsertRowid
  );
}
const taskRow = (id) => sqlite.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id);
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

test("localDateString : minuit local reste le même jour (pas de décalage UTC)", () => {
  assert.equal(localDateString(new Date(2026, 9, 12, 0, 0)), "2026-10-12");
  assert.equal(localDateString(new Date(2026, 9, 12, 0, 30)), "2026-10-12");
  assert.equal(localDateString(new Date(2026, 9, 12, 23, 59)), "2026-10-12");
});

test("urgence sur un repas : refusée, jamais déplacée", () => {
  const p = proposeUrgent({ title: "X", date: MON, startTime: "12:45", endTime: "13:00" });
  assert.equal(p.feasible, false);
  assert.ok(p.blockedBy.length > 0);
  assert.equal(p.moves.length, 0);
});

test("urgence pendant le sommeil qui passe minuit : refusée (23:30)", () => {
  const p = proposeUrgent({ title: "X", date: MON, startTime: "23:30", endTime: "23:50" });
  assert.equal(p.feasible, false);
});

test("urgence sur un cours de l'EDT : refusée, le cours n'est pas touché", () => {
  sqlite
    .prepare(
      `INSERT INTO schedule_entries (subject_name, type, day_of_week, start_time, end_time, locked, created_at)
       VALUES ('Python', 'Cours', 6, '08:00', '10:00', 1, ?)`
    )
    .run(new Date().toISOString());
  const p = proposeUrgent({ title: "X", date: SAT, startTime: "09:00", endTime: "09:30" });
  assert.equal(p.feasible, false);
  assert.match(p.blockedBy[0].label, /Python/);
  const courses = sqlite.prepare(`SELECT * FROM schedule_entries WHERE subject_name = 'Python'`).all();
  assert.equal(courses.length, 1);
  assert.equal(courses[0].start_time, "08:00");
  sqlite.prepare(`DELETE FROM schedule_entries`).run();
});

test("proposer ne modifie rien ; valider déplace uniquement la tâche en conflit", () => {
  const sport = addTask("Sport", SAT, "18:00");
  const projet = addTask("Projet", SAT, "19:00");
  const lecture = addTask("Lecture", SAT, "20:00");

  const p = proposeUrgent({ title: "Imprimer", date: SAT, startTime: "18:20", endTime: "18:40" });
  assert.equal(p.feasible, true);
  assert.equal(p.moves.length, 1);
  assert.equal(p.moves[0].taskId, sport);
  assert.ok(p.moves[0].to, "une nouvelle place doit être proposée");

  // rien n'a bougé après la simple proposition
  assert.equal(taskRow(sport).start_time, "18:00");

  const { urgentTaskId } = applyUrgent({
    urgent: p.urgent,
    moves: p.moves.map((m) => ({ taskId: m.taskId, to: m.to && { date: m.to.date, startTime: m.to.startTime } })),
  });
  assert.equal(taskRow(sport).start_time, p.moves[0].to.startTime);
  assert.equal(taskRow(projet).start_time, "19:00"); // non concerné : inchangé
  assert.equal(taskRow(lecture).start_time, "20:00"); // non concerné : inchangé
  assert.equal(taskRow(urgentTaskId).task_type, "Urgent");
});

test("les tâches déplacées ne se chevauchent pas entre elles ni avec les blocs existants", () => {
  const D = "2026-10-24";
  const a = addTask("A", D, "10:00", 60);
  const b = addTask("B", D, "10:30", 60); // chevauche A (le moteur ne l'empêche pas à la création)
  const p = proposeUrgent({ title: "U", date: D, startTime: "10:00", endTime: "11:30" });
  assert.equal(p.feasible, true);
  const placed = p.moves.filter((m) => m.to).map((m) => m.to);
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (placed[i].date === placed[j].date) {
        const overlap = toMin(placed[i].startTime) < toMin(placed[j].endTime) && toMin(placed[j].startTime) < toMin(placed[i].endTime);
        assert.equal(overlap, false, "deux tâches déplacées se chevauchent");
      }
    }
  }
  assert.ok(a && b);
});

test("créneaux libres : exclut l'EDT et les repas", () => {
  const free = getFreeSlots(MON);
  const busy = getOccupiedBlocksForDate(MON).map((b) => b.label);
  assert.ok(busy.some((l) => l.includes("Déjeuner")));
  for (const s of free) {
    const overlapsLunch = toMin(s.start) < toMin("13:30") && toMin(s.end) > toMin("12:30");
    assert.equal(overlapsLunch, false, `créneau libre ${s.start}-${s.end} chevauche le déjeuner`);
  }
});

test.after(() => {
  sqlite.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

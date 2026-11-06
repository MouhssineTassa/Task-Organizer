// Tests des tâches récurrentes : occurrences calculées, exceptions (sauter/reporter/terminer), planificateur, urgence, API.
process.env.TZ = "Africa/Casablanca";
const os = require("os");
const path = require("path");
const fs = require("fs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plos-rec-"));
process.env.DB_PATH = path.join(tmp, "test.db");
process.env.STORAGE_DIR = path.join(tmp, "storage");

const test = require("node:test");
const assert = require("node:assert/strict");

const { runMigrations } = require("../dist/db/migrate");
const { sqlite } = require("../dist/db");
const { createApp } = require("../dist/app");
const auth = require("../dist/services/auth");
const rec = require("../dist/services/recurring");
const { addDays } = require("../dist/services/dateUtils");
const { getOccupiedBlocksForDate } = require("../dist/services/plannerEngine");
const { proposeUrgent, applyUrgent } = require("../dist/services/urgentPlanner");

runMigrations();

const WED = "2026-10-14"; // mercredi
const SAT = "2026-10-17"; // samedi
const now = () => new Date().toISOString();

function addRule(o = {}) {
  const r = { title: "Sport", frequency: "Weekly", days: "3", time: "18:00", minutes: 60, difficulty: "Medium", start: "2026-10-01", end: null, category: "Sport", active: 1, ...o };
  return Number(
    sqlite
      .prepare(
        `INSERT INTO recurring_rules (title, category, priority, difficulty, estimated_minutes, start_time, frequency, days_of_week, start_date, end_date, active, created_at)
         VALUES (?, ?, 'Medium', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(r.title, r.category, r.difficulty, r.minutes, r.time, r.frequency, r.days, r.start, r.end, r.active, now()).lastInsertRowid
  );
}
const dates = (list) => list.map((o) => o.date);
const xpCount = (reason) => sqlite.prepare(`SELECT COUNT(*) c FROM xp_events WHERE reason = ?`).get(reason).c;
const resetAll = () => {
  sqlite.prepare(`DELETE FROM tasks`).run(); // chaque test repart d'un état propre (une urgence appliquée crée une tâche verrouillée)
  sqlite.prepare(`DELETE FROM task_occurrences`).run();
  sqlite.prepare(`DELETE FROM recurring_rules`).run();
};

test("expansion : jours de la semaine, bornes incluses, règle future/inactive", () => {
  resetAll();
  const wed = addRule();
  assert.deepEqual(dates(rec.occurrencesForRange("2026-10-01", "2026-10-31")), ["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28"]);

  sqlite.prepare(`UPDATE recurring_rules SET end_date = '2026-10-21' WHERE id = ?`).run(wed);
  assert.deepEqual(dates(rec.occurrencesForRange("2026-10-01", "2026-10-31")), ["2026-10-07", "2026-10-14", "2026-10-21"], "date de fin incluse, la suivante exclue");
  sqlite.prepare(`UPDATE recurring_rules SET end_date = NULL, start_date = '2026-10-14' WHERE id = ?`).run(wed);
  assert.deepEqual(dates(rec.occurrencesForRange("2026-10-01", "2026-10-31")).slice(0, 1), ["2026-10-14"], "date de début incluse, les précédentes exclues");
  sqlite.prepare(`UPDATE recurring_rules SET active = 0 WHERE id = ?`).run(wed);
  assert.equal(rec.occurrencesForRange("2026-10-01", "2026-10-31").length, 0, "règle désactivée : plus d'occurrence");

  resetAll();
  addRule({ title: "Lire", frequency: "Daily", days: null, time: null });
  assert.equal(rec.occurrencesForRange("2026-10-12", "2026-10-18").length, 7);
  addRule({ title: "Python", days: "1,3,5" });
  const week = rec.occurrencesForRange("2026-10-12", "2026-10-18").filter((o) => o.title === "Python");
  assert.deepEqual(dates(week), ["2026-10-12", "2026-10-14", "2026-10-16"]);
});

test("calendrier local : 400 jours consécutifs sans trou ni doublon (fuseau Casablanca)", () => {
  let d = "2026-01-01";
  for (let i = 0; i < 400; i++) {
    const next = addDays(d, 1);
    const diff = (Date.UTC(...next.split("-").map((n, k) => (k === 1 ? Number(n) - 1 : Number(n)))) - Date.UTC(...d.split("-").map((n, k) => (k === 1 ? Number(n) - 1 : Number(n))))) / 86400000;
    assert.equal(diff, 1, `${d} -> ${next}`);
    d = next;
  }
});

test("EXEMPLE DU CAHIER DES CHARGES : sauter le sport de CE mercredi ne touche pas le mercredi suivant", () => {
  resetAll();
  const sport = addRule();
  const before = rec.occurrencesForRange("2026-10-14", "2026-10-28");
  assert.deepEqual(dates(before), ["2026-10-14", "2026-10-21", "2026-10-28"]);

  rec.applyOccurrenceAction(sport, "2026-10-14", "skip");
  assert.deepEqual(dates(rec.occurrencesForRange("2026-10-14", "2026-10-28")), ["2026-10-21", "2026-10-28"]);
  const rule = sqlite.prepare(`SELECT * FROM recurring_rules WHERE id = ?`).get(sport);
  assert.equal(rule.days_of_week, "3", "la routine n'est pas modifiée");
  assert.equal(rule.active, 1);

  rec.applyOccurrenceAction(sport, "2026-10-14", "reset"); // on peut revenir sur un skip
  assert.deepEqual(dates(rec.occurrencesForRange("2026-10-14", "2026-10-14")), [WED]);
});

test("terminer : XP une seule fois, état protégé", () => {
  resetAll();
  const sport = addRule({ difficulty: "Hard" });
  const reason = "Routine : Sport";
  const xp0 = xpCount(reason);
  const r1 = rec.applyOccurrenceAction(sport, WED, "complete");
  assert.equal(r1.xpAwarded, 30, "Hard = 30 XP");
  const r2 = rec.applyOccurrenceAction(sport, WED, "complete");
  assert.equal(r2.xpAwarded, 0, "second 'terminer' = pas de double XP");
  assert.equal(xpCount(reason), xp0 + 1);
  assert.equal(rec.occurrencesForDate(WED)[0].status, "Completed");
  assert.throws(() => rec.applyOccurrenceAction(sport, WED, "skip"), /terminée/);
  assert.throws(() => rec.applyOccurrenceAction(sport, WED, "reset"), /terminée/);
  assert.throws(() => rec.applyOccurrenceAction(sport, WED, "reschedule", { newDate: "2026-10-15" }), /terminée/);
  assert.equal(rec.occurrencesForDate(WED).length, 1, "toujours là, jamais supprimée");
});

test("les routines terminées comptent pour les trophées de quantité", () => {
  resetAll();
  const daily = addRule({ title: "Anglais", frequency: "Daily", days: null, time: null, category: "Études" });
  for (let i = 0; i < 10; i++) rec.applyOccurrenceAction(daily, addDays("2026-10-01", i), "complete");
  const unlocked = sqlite.prepare(`SELECT ua.unlocked_at FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE a.code = 'tasks_10'`).get();
  assert.ok(unlocked.unlocked_at, "10 occurrences terminées doivent débloquer 'tasks_10'");
});

test("reporter : disparaît du jour d'origine, apparaît au nouveau jour/heure, bloc planifié ; même jour = changement d'heure", () => {
  resetAll();
  const sport = addRule();
  rec.applyOccurrenceAction(sport, "2026-10-21", "reschedule", { newDate: "2026-10-22", newTime: "19:30" });
  const moved = rec.occurrencesForRange("2026-10-21", "2026-10-22");
  assert.deepEqual(moved.map((o) => [o.date, o.time, o.rescheduled, o.originalDate]), [["2026-10-22", "19:30", true, "2026-10-21"]]);

  assert.equal(getOccupiedBlocksForDate("2026-10-21").some((b) => b.label.includes("Sport")), false, "créneau d'origine libéré");
  const block = getOccupiedBlocksForDate("2026-10-22").find((b) => b.label.includes("Sport"));
  assert.ok(block);
  assert.deepEqual([block.startTime, block.endTime], ["19:30", "20:30"]);

  rec.applyOccurrenceAction(sport, "2026-10-28", "reschedule", { newDate: "2026-10-28", newTime: "20:00" });
  const same = rec.occurrencesForDate("2026-10-28");
  assert.deepEqual([same[0].time, same[0].rescheduled], ["20:00", false]);
  assert.equal(rec.occurrencesForRange("2026-10-14", "2026-10-14")[0].time, "18:00", "les autres occurrences gardent l'horaire de la règle");
});

test("planificateur : horaire = bloc avec la bonne durée ; sans horaire ou terminée = pas de bloc", () => {
  resetAll();
  const timed = addRule({ title: "Piano", days: "6", time: "10:15", minutes: 45 });
  addRule({ title: "Lire", frequency: "Daily", days: null, time: null });
  let blocks = getOccupiedBlocksForDate(SAT).filter((b) => b.label.startsWith("🔁"));
  assert.deepEqual(blocks.map((b) => [b.label, b.startTime, b.endTime]), [["🔁 Piano", "10:15", "11:00"]]);
  assert.ok(rec.occurrencesForDate(SAT).some((o) => o.title === "Lire" && o.time === null), "la routine sans horaire existe bien ce jour-là");
  rec.applyOccurrenceAction(timed, SAT, "complete");
  blocks = getOccupiedBlocksForDate(SAT).filter((b) => b.label.startsWith("🔁"));
  assert.equal(blocks.length, 0, "terminée : ne bloque plus le créneau");
});

test("actions invalides refusées", () => {
  resetAll();
  const sport = addRule();
  assert.throws(() => rec.applyOccurrenceAction(sport, "2026-10-15", "complete"), /pas une occurrence/);
  assert.throws(() => rec.applyOccurrenceAction(sport, "2026-09-30", "skip"), /pas une occurrence/, "avant la date de début");
  assert.throws(() => rec.applyOccurrenceAction(999, WED, "skip"), /introuvable/);
  assert.throws(() => rec.applyOccurrenceAction(sport, "14/10/2026", "skip"), /invalide/);
  assert.throws(() => rec.applyOccurrenceAction(sport, WED, "reschedule", {}), /Nouvelle date/);
  assert.throws(() => rec.applyOccurrenceAction(sport, WED, "reschedule", { newDate: "2026-10-15", newTime: "7h" }), /Nouvelle heure/);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) c FROM task_occurrences`).get().c, 0, "aucune écriture après un refus");
});

test("URGENCE : déplace UNE occurrence de routine, jamais la routine ; proposer n'écrit rien", () => {
  resetAll();
  const yoga = addRule({ title: "Yoga", days: "6", time: "18:00", minutes: 60 });
  const urgent = { title: "Imprimer", date: SAT, startTime: "18:20", endTime: "18:40" };

  const rowsBefore = sqlite.prepare(`SELECT COUNT(*) c FROM task_occurrences`).get().c;
  const p = proposeUrgent(urgent);
  assert.equal(p.feasible, true);
  assert.equal(p.moves.length, 1);
  assert.deepEqual(p.moves[0].occurrence, { ruleId: yoga, date: SAT });
  assert.equal(p.moves[0].taskId, null);
  assert.ok(p.moves[0].to, "une nouvelle place est proposée");
  assert.equal(sqlite.prepare(`SELECT COUNT(*) c FROM task_occurrences`).get().c, rowsBefore, "proposer n'écrit rien");
  assert.equal(sqlite.prepare(`SELECT COUNT(*) c FROM tasks WHERE task_type = 'Urgent'`).get().c, 0);

  applyUrgent({ urgent: p.urgent, moves: p.moves.map((m) => ({ taskId: m.taskId, occurrence: m.occurrence, to: m.to && { date: m.to.date, startTime: m.to.startTime } })) });

  const today = rec.occurrencesForDate(SAT)[0];
  assert.equal(today.time, p.moves[0].to.startTime, "cette occurrence a été déplacée");
  const nextWeek = rec.occurrencesForDate("2026-10-24")[0];
  assert.equal(nextWeek.time, "18:00", "la semaine suivante reste à 18:00 : la routine n'a pas changé");
  assert.equal(sqlite.prepare(`SELECT start_time FROM recurring_rules WHERE id = ?`).get(yoga).start_time, "18:00");
  assert.equal(getOccupiedBlocksForDate(SAT).some((b) => b.label.includes("Yoga") && b.startTime === "18:00"), false, "créneau de 18h libéré");
});

test("URGENCE : une occurrence qui ne tient nulle part perd son horaire ce jour-là, sans être supprimée", () => {
  resetAll();
  const yoga = addRule({ title: "Yoga", days: "6", time: "18:00", minutes: 60 });
  // on occupe tout le reste de la journée et des 6 jours suivants avec des tâches fixes (verrouillées)
  const ins = sqlite.prepare(`INSERT INTO tasks (title, task_type, estimated_minutes, date, start_time, status, created_at, updated_at) VALUES ('Bloc', 'Fixed', 960, ?, '07:00', 'Pending', ?, ?)`);
  for (let i = 0; i < 8; i++) if (addDays(SAT, i) !== SAT) ins.run(addDays(SAT, i), now(), now());
  const p = proposeUrgent({ title: "U", date: SAT, startTime: "18:00", endTime: "23:00" });
  assert.equal(p.feasible, true);
  assert.equal(p.moves[0].to, null);
  applyUrgent({ urgent: p.urgent, moves: p.moves.map((m) => ({ taskId: m.taskId, occurrence: m.occurrence, to: null })) });
  const o = rec.occurrencesForDate(SAT).find((x) => x.ruleId === yoga);
  assert.ok(o, "l'occurrence existe toujours");
  assert.equal(o.time, null, "mais sans horaire ce jour-là");
  assert.equal(rec.occurrencesForDate("2026-10-24").find((x) => x.ruleId === yoga).time, "18:00", "la semaine suivante est intacte");
  sqlite.prepare(`DELETE FROM tasks`).run();
});

// ------------------------------------------------------------------ API
let server, base, cookie;
const call = async (method, url, { json, authed = true } = {}) => {
  const headers = { "X-PLOS": "1" };
  if (authed) headers.Cookie = `plos_session=${cookie}`;
  let body;
  if (json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  const res = await fetch(base + url, { method, headers, body });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch {}
  return { status: res.status, data };
};

test("API : authentification exigée, validation des routines", async () => {
  sqlite.prepare(`DELETE FROM users`).run();
  await auth.setPassword("Correct-Horse-9", "T");
  cookie = auth.createSession().token;
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  resetAll();

  assert.equal((await call("GET", "/api/recurring/rules", { authed: false })).status, 401);
  assert.equal((await call("POST", "/api/recurring/rules", { json: { title: "x", frequency: "Weekly" } })).status, 400, "hebdomadaire sans jour");
  assert.equal((await call("POST", "/api/recurring/rules", { json: { title: "x", frequency: "Weekly", daysOfWeek: [] } })).status, 400);
  assert.equal((await call("POST", "/api/recurring/rules", { json: { title: "x", frequency: "Weekly", daysOfWeek: [8] } })).status, 400, "jour hors 1-7");
  assert.equal((await call("POST", "/api/recurring/rules", { json: { title: "", frequency: "Daily" } })).status, 400, "titre vide");
  assert.equal((await call("POST", "/api/recurring/rules", { json: { title: "x", frequency: "Daily", startTime: "25:00" } })).status, 400, "heure invalide");
  assert.equal((await call("POST", "/api/recurring/rules", { json: { title: "x", frequency: "Daily", estimatedMinutes: 1 } })).status, 400, "durée trop courte");
  assert.equal((await call("POST", "/api/recurring/rules", { json: { title: "x", frequency: "Daily", startDate: "2026-10-10", endDate: "2026-10-01" } })).status, 400, "fin avant début");
  assert.equal(sqlite.prepare(`SELECT COUNT(*) c FROM recurring_rules`).get().c, 0, "aucune routine créée après les refus");
});

test("API : cycle complet d'une routine", async () => {
  const created = await call("POST", "/api/recurring/rules", { json: { title: "Sport", frequency: "Weekly", daysOfWeek: [3, 1, 3], startTime: "18:00", estimatedMinutes: 60, startDate: "2026-10-01", difficulty: "Medium", category: "Sport" } });
  assert.equal(created.status, 201);
  assert.deepEqual(created.data.daysList, [1, 3], "jours dédoublonnés et triés");
  const id = created.data.id;

  assert.equal((await call("GET", "/api/recurring/occurrences?from=2026-10-12&to=2026-10-18")).data.length, 2);
  assert.equal((await call("GET", "/api/recurring/occurrences?from=2026-10-12&to=2027-01-30")).status, 400, "plus de 62 jours");
  assert.equal((await call("GET", "/api/recurring/occurrences?from=hier&to=demain")).status, 400);
  assert.equal((await call("GET", "/api/recurring/occurrences?from=2026-10-18&to=2026-10-12")).status, 400);

  const bad = await call("POST", "/api/recurring/occurrences/action", { json: { ruleId: id, date: "2026-10-15", action: "complete" } });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /pas une occurrence/);
  assert.equal((await call("POST", "/api/recurring/occurrences/action", { json: { ruleId: id, date: WED, action: "exploser" } })).status, 400);

  const done = await call("POST", "/api/recurring/occurrences/action", { json: { ruleId: id, date: WED, action: "complete" } });
  assert.equal(done.status, 200);
  assert.equal(done.data.xpAwarded, 15);
  assert.equal((await call("POST", "/api/recurring/occurrences/action", { json: { ruleId: id, date: WED, action: "complete" } })).data.xpAwarded, 0);

  const skipped = await call("POST", "/api/recurring/occurrences/action", { json: { ruleId: id, date: "2026-10-12", action: "skip" } });
  assert.equal(skipped.status, 200);
  const week = (await call("GET", "/api/recurring/occurrences?from=2026-10-12&to=2026-10-18")).data;
  assert.deepEqual(week.map((o) => [o.date, o.status]), [[WED, "Completed"]]);

  const upd = await call("PUT", `/api/recurring/rules/${id}`, { json: { startTime: "19:00" } });
  assert.equal(upd.status, 200);
  assert.equal((await call("GET", "/api/recurring/occurrences?from=2026-10-19&to=2026-10-19")).data[0].time, "19:00");
  assert.equal((await call("PUT", `/api/recurring/rules/${id}`, { json: { frequency: "Weekly", daysOfWeek: [] } })).status, 400);
  assert.equal((await call("PUT", "/api/recurring/rules/9999", { json: { title: "x" } })).status, 404);

  const hidden = await call("GET", "/api/recurring/occurrences/hidden?from=2026-10-12&to=2026-10-18");
  assert.deepEqual(hidden.data.map((h) => [h.date, h.status]), [["2026-10-12", "Skipped"]], "l'occurrence sautée est listée pour pouvoir être rétablie");
  assert.equal((await call("GET", "/api/recurring/occurrences/hidden?from=x&to=y")).status, 400);
  assert.equal((await call("POST", "/api/recurring/occurrences/action", { json: { ruleId: id, date: "2026-10-12", action: "reset" } })).status, 200);
  assert.equal((await call("GET", "/api/recurring/occurrences/hidden?from=2026-10-12&to=2026-10-18")).data.length, 0, "rétablie");
  assert.equal((await call("GET", "/api/recurring/occurrences?from=2026-10-12&to=2026-10-12")).data.length, 1, "elle réapparaît");

  assert.equal((await call("DELETE", `/api/recurring/rules/${id}`)).status, 204);
  assert.equal((await call("GET", "/api/recurring/occurrences?from=2026-10-19&to=2026-10-31")).data.length, 0, "désactivée : plus d'occurrence");
  assert.equal((await call("POST", "/api/recurring/occurrences/action", { json: { ruleId: id, date: "2026-10-19", action: "skip" } })).status, 400, "routine désactivée");
  assert.equal(sqlite.prepare(`SELECT COUNT(*) c FROM task_occurrences WHERE status = 'Completed'`).get().c, 1, "l'historique terminé est conservé");
});

test("sauvegarde : routines et exceptions sont restaurées", async () => {
  const { writeBackupZip, restoreFromZip } = require("../dist/services/backupService");
  resetAll();
  const sport = addRule();
  rec.applyOccurrenceAction(sport, WED, "skip");
  rec.applyOccurrenceAction(sport, "2026-10-21", "reschedule", { newDate: "2026-10-22", newTime: "19:30" });
  const file = path.join(tmp, "rec.zip");
  await writeBackupZip(fs.createWriteStream(file));
  resetAll();
  assert.equal(rec.occurrencesForRange("2026-10-01", "2026-10-31").length, 0);
  await restoreFromZip(file);
  assert.deepEqual(
    rec.occurrencesForRange("2026-10-01", "2026-10-31").map((o) => [o.date, o.time]),
    [["2026-10-07", "18:00"], ["2026-10-22", "19:30"], ["2026-10-28", "18:00"]],
    "le mercredi 14 sauté et le 21 reporté au 22 sont retrouvés"
  );
});

test.after(() => {
  if (server) server.close();
  sqlite.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

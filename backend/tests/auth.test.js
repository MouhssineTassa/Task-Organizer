// Tests de sécurité : authentification, sessions, CSRF, CORS, force brute, uploads, sauvegarde.
const os = require("os");
const path = require("path");
const fs = require("fs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plos-auth-"));
process.env.DB_PATH = path.join(tmp, "test.db");
process.env.STORAGE_DIR = path.join(tmp, "storage");

const test = require("node:test");
const assert = require("node:assert/strict");
const AdmZip = require("adm-zip");
const Database = require("better-sqlite3");

const { runMigrations } = require("../dist/db/migrate");
const { sqlite } = require("../dist/db");
const { createApp } = require("../dist/app");
const { resetLoginLimiter } = require("../dist/services/auth");
const { writeBackupZip, restoreFromZip } = require("../dist/services/backupService");

runMigrations();
sqlite.prepare(`DELETE FROM users`).run(); // base neuve : aucun mot de passe

const server = createApp().listen(0, "127.0.0.1");
const base = () => `http://127.0.0.1:${server.address().port}`;
const GOOD = "Correct-Horse-9";
const ORIGIN = "http://localhost:5173";

async function call(method, url, { json, cookie, headers = {}, form, csrf = true } = {}) {
  const h = { ...headers };
  if (csrf) h["X-PLOS"] = "1";
  if (cookie) h.Cookie = `plos_session=${cookie}`;
  let body;
  if (json !== undefined) { h["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(base() + url, { method, headers: h, body });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch {}
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const sess = setCookie.map((c) => c.match(/^plos_session=([^;]*)/)).find(Boolean);
  return { status: res.status, headers: res.headers, data, text, setCookie, token: sess ? sess[1] : null };
}

const PROTECTED = ["tasks", "events", "notes", "schedule-import/current", "planning/recovery", "dashboard/today", "habits", "goals", "missions",
  "progression", "study/semesters", "files", "books", "media", "sport/programs", "projects", "hub/inbox", "backup/export", "backup/export-json"];

let token; // session principale

test("santé publique ; avant configuration tout le reste est verrouillé", async () => {
  assert.equal((await call("GET", "/api/health")).status, 200);
  const st = await call("GET", "/api/auth/status");
  assert.deepEqual({ c: st.data.configured, a: st.data.authenticated }, { c: false, a: false });
  const r = await call("GET", "/api/tasks");
  assert.equal(r.status, 401);
  assert.equal(r.data.code, "setup_required");
});

test("mots de passe faibles refusés à la création", async () => {
  for (const pw of ["court", "1234567", "password", "12345678", "aaaaaaaaaa", "x".repeat(129)]) {
    const r = await call("POST", "/api/auth/setup", { json: { password: pw } });
    assert.equal(r.status, 400, `devrait refuser: ${pw.slice(0, 12)}`);
  }
  assert.equal((await call("POST", "/api/auth/setup", { json: { password: "MonNomEstKarim", name: "monnomestkarim" } })).status, 400);
  assert.equal((await call("GET", "/api/auth/status")).data.configured, false);
});

test("création du mot de passe : cookie sécurisé, hash scrypt, rien en clair", async () => {
  const r = await call("POST", "/api/auth/setup", { json: { password: GOOD, name: "Karim" } });
  assert.equal(r.status, 201);
  token = r.token;
  assert.ok(token && token.length >= 40);
  const cookie = r.setCookie[0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  const row = sqlite.prepare(`SELECT name, password_hash FROM users`).get();
  assert.equal(row.name, "Karim");
  assert.match(row.password_hash, /^scrypt\$/);
  const dump = JSON.stringify(sqlite.prepare(`SELECT * FROM users`).all()) + JSON.stringify(sqlite.prepare(`SELECT * FROM sessions`).all());
  assert.ok(!dump.includes(GOOD), "le mot de passe ne doit jamais être stocké en clair");
  assert.ok(!dump.includes(token), "le jeton de session ne doit pas être stocké en clair (seulement son empreinte)");
  assert.equal((await call("POST", "/api/auth/setup", { json: { password: "Autre-Mdp-77" } })).status, 409, "setup impossible une fois configuré");
});

test("toutes les routes métier refusent l'accès sans session valide", async () => {
  for (const p of PROTECTED) {
    assert.equal((await call("GET", `/api/${p}`)).status, 401, `/api/${p} sans cookie`);
    assert.equal((await call("GET", `/api/${p}`, { cookie: "faux-jeton-".padEnd(43, "x") })).status, 401, `/api/${p} faux cookie`);
  }
  assert.equal((await call("GET", "/api/tasks", { cookie: "court" })).status, 401);
  assert.equal((await call("GET", "/api/tasks", { cookie: token })).status, 200);
  const st = await call("GET", "/api/auth/status", { cookie: token });
  assert.equal(st.data.authenticated, true);
  assert.equal(st.data.name, "Karim");
});

test("CSRF : en-tête de sécurité et origine exigés pour toute écriture", async () => {
  const body = { title: "t" };
  assert.equal((await call("POST", "/api/tasks", { json: body, cookie: token, csrf: false })).status, 403);
  assert.equal((await call("POST", "/api/tasks", { json: body, cookie: token, headers: { Origin: "http://evil.example" } })).status, 403);
  assert.equal((await call("DELETE", "/api/tasks/1", { cookie: token, csrf: false })).status, 403);
  assert.equal((await call("POST", "/api/tasks", { json: body, cookie: token, headers: { Origin: ORIGIN } })).status, 201);
  assert.equal((await call("POST", "/api/auth/login", { json: { password: GOOD }, csrf: false })).status, 403, "le login est aussi protégé");
});

test("CORS : seule l'origine de l'interface peut lire l'API ; pas d'ouverture à '*'", async () => {
  const ok = await call("GET", "/api/health", { headers: { Origin: ORIGIN } });
  assert.equal(ok.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(ok.headers.get("access-control-allow-credentials"), "true");
  const evil = await call("GET", "/api/health", { headers: { Origin: "http://evil.example" } });
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
  const pre = await fetch(base() + "/api/tasks", { method: "OPTIONS", headers: { Origin: "http://evil.example", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-plos" } });
  assert.equal(pre.headers.get("access-control-allow-origin"), null);
  const hdr = await call("GET", "/api/tasks", { cookie: token });
  assert.equal(hdr.headers.get("x-content-type-options"), "nosniff");
  assert.equal(hdr.headers.get("x-frame-options"), "DENY");
  assert.equal(hdr.headers.get("cache-control"), "no-store");
  assert.equal(hdr.headers.get("x-powered-by"), null);
});

test("connexion : message générique, puis blocage progressif contre la force brute", async () => {
  resetLoginLimiter();
  const bad = await call("POST", "/api/auth/login", { json: { password: "mauvais-mot-de-passe" } });
  assert.equal(bad.status, 401);
  assert.equal(bad.data.error, "Mot de passe incorrect.");
  for (let i = 0; i < 4; i++) await call("POST", "/api/auth/login", { json: { password: "mauvais" + i } });
  const locked = await call("POST", "/api/auth/login", { json: { password: "encore-faux" } });
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers.get("retry-after")) > 0);
  const stillLocked = await call("POST", "/api/auth/login", { json: { password: GOOD } });
  assert.equal(stillLocked.status, 429, "même le bon mot de passe est refusé pendant le blocage");
  resetLoginLimiter();
  const ok = await call("POST", "/api/auth/login", { json: { password: GOOD } });
  assert.equal(ok.status, 200);
  assert.ok(ok.token && ok.token !== token, "chaque connexion crée un nouveau jeton");
  token = ok.token;
});

test("expiration des sessions, et prolongation glissante", async () => {
  const s = await call("POST", "/api/auth/login", { json: { password: GOOD } });
  const t = s.token;
  assert.equal((await call("GET", "/api/tasks", { cookie: t })).status, 200);
  sqlite.prepare(`UPDATE sessions SET expires_at = ? WHERE token_hash = (SELECT token_hash FROM sessions ORDER BY id DESC LIMIT 1)`).run(new Date(Date.now() - 1000).toISOString());
  assert.equal((await call("GET", "/api/tasks", { cookie: t })).status, 401, "session expirée refusée");
  assert.equal(sqlite.prepare(`SELECT COUNT(*) c FROM sessions WHERE expires_at <= ?`).get(new Date().toISOString()).c, 0, "la session expirée est supprimée");

  const s2 = await call("POST", "/api/auth/login", { json: { password: GOOD } });
  const soon = new Date(Date.now() + 3600 * 1000).toISOString();
  sqlite.prepare(`UPDATE sessions SET expires_at = ?, last_used_at = ? WHERE id = (SELECT MAX(id) FROM sessions)`).run(soon, new Date(Date.now() - 2 * 3600 * 1000).toISOString());
  await call("GET", "/api/tasks", { cookie: s2.token });
  const after = sqlite.prepare(`SELECT expires_at FROM sessions WHERE id = (SELECT MAX(id) FROM sessions)`).get().expires_at;
  assert.ok(new Date(after) > new Date(Date.now() + 20 * 24 * 3600 * 1000), "la session est prolongée par l'usage");
});

test("déconnexion : le cookie ne fonctionne plus ; déconnexion de tous les appareils", async () => {
  const a = (await call("POST", "/api/auth/login", { json: { password: GOOD } })).token;
  const b = (await call("POST", "/api/auth/login", { json: { password: GOOD } })).token;
  const out = await call("POST", "/api/auth/logout", { cookie: a });
  assert.equal(out.status, 204);
  assert.match(out.setCookie[0], /Max-Age=0/);
  assert.equal((await call("GET", "/api/tasks", { cookie: a })).status, 401);
  assert.equal((await call("GET", "/api/tasks", { cookie: b })).status, 200);
  assert.equal((await call("POST", "/api/auth/logout-all", { cookie: b })).status, 204);
  assert.equal((await call("GET", "/api/tasks", { cookie: b })).status, 401);
  assert.equal((await call("POST", "/api/auth/logout-all")).status, 401, "logout-all exige d'être connecté");
  token = (await call("POST", "/api/auth/login", { json: { password: GOOD } })).token;
});

test("changement de mot de passe : vérifications, autres sessions coupées, ancien mot de passe inutilisable", async () => {
  resetLoginLimiter();
  const other = (await call("POST", "/api/auth/login", { json: { password: GOOD } })).token;
  assert.equal((await call("POST", "/api/auth/change-password", { cookie: token, json: { currentPassword: "faux", newPassword: "Nouveau-Mdp-55" } })).status, 401);
  assert.equal((await call("POST", "/api/auth/change-password", { cookie: token, json: { currentPassword: GOOD, newPassword: "court" } })).status, 400);
  assert.equal((await call("POST", "/api/auth/change-password", { json: { currentPassword: GOOD, newPassword: "Nouveau-Mdp-55" } })).status, 401, "exige une session");
  const ok = await call("POST", "/api/auth/change-password", { cookie: token, json: { currentPassword: GOOD, newPassword: "Nouveau-Mdp-55" } });
  assert.equal(ok.status, 200);
  assert.equal((await call("GET", "/api/tasks", { cookie: token })).status, 200, "la session courante reste ouverte");
  assert.equal((await call("GET", "/api/tasks", { cookie: other })).status, 401, "les autres sessions sont fermées");
  resetLoginLimiter();
  assert.equal((await call("POST", "/api/auth/login", { json: { password: GOOD } })).status, 401, "l'ancien mot de passe ne marche plus");
  const again = await call("POST", "/api/auth/login", { json: { password: "Nouveau-Mdp-55" } });
  assert.equal(again.status, 200);
  token = again.token;
});

test("upload : un faux PDF (type MIME falsifié) est refusé et ne reste pas sur le disque", async () => {
  const fd = new FormData();
  fd.append("file", new Blob(["ceci n'est pas un PDF du tout"], { type: "application/pdf" }), "edt.pdf");
  const r = await call("POST", "/api/schedule-import/upload", { cookie: token, form: fd });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /vrai PDF/);
  const dir = path.join(process.env.STORAGE_DIR, "pdf");
  assert.deepEqual(fs.existsSync(dir) ? fs.readdirSync(dir) : [], [], "le faux fichier doit être supprimé");

  const fd2 = new FormData();
  fd2.append("file", new Blob(["x"], { type: "text/plain" }), "x.txt");
  assert.equal((await call("POST", "/api/schedule-import/upload", { cookie: token, form: fd2 })).status, 400, "type non PDF refusé proprement (400, pas 500)");
  const fd3 = new FormData();
  fd3.append("file", new Blob(["faux"], { type: "application/pdf" }), "c.pdf");
  fd3.append("subjectId", "1");
  assert.equal((await call("POST", "/api/study/documents/upload", { cookie: token, form: fd3 })).status, 400, "même contrôle pour les cours");
});

test("sauvegarde : ni hash ni sessions exportés ; la restauration ne touche pas au mot de passe actuel", async () => {
  const zipFile = path.join(tmp, "b.zip");
  await writeBackupZip(fs.createWriteStream(zipFile));
  const z = new AdmZip(zipFile);
  const dbFile = path.join(tmp, "snap.db");
  fs.writeFileSync(dbFile, z.getEntry("personal-life-os.db").getData());
  const snap = new Database(dbFile, { readonly: true });
  assert.equal(snap.prepare(`SELECT password_hash FROM users`).get().password_hash, null, "le hash ne doit pas figurer dans la sauvegarde");
  assert.equal(snap.prepare(`SELECT COUNT(*) c FROM sessions`).get().c, 0);
  snap.close();

  const json = await call("GET", "/api/backup/export-json", { cookie: token });
  assert.ok(!json.text.includes("password_hash") && !json.text.includes("scrypt$") && !json.data.tables.sessions);

  const hashBefore = sqlite.prepare(`SELECT password_hash FROM users`).get().password_hash;
  const sessionsBefore = sqlite.prepare(`SELECT COUNT(*) c FROM sessions`).get().c;
  await restoreFromZip(zipFile);
  assert.equal(sqlite.prepare(`SELECT password_hash FROM users`).get().password_hash, hashBefore, "mot de passe conservé");
  assert.equal(sqlite.prepare(`SELECT COUNT(*) c FROM sessions`).get().c, sessionsBefore, "sessions conservées");
  assert.equal((await call("GET", "/api/tasks", { cookie: token })).status, 200, "toujours connecté après une restauration");
  assert.equal((await call("POST", "/api/auth/login", { json: { password: "Nouveau-Mdp-55" } })).status, 200);
});

test.after(() => {
  server.close();
  sqlite.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

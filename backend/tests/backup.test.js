// Tests sauvegarde / restauration. Base et dossier storage temporaires : aucune vraie donnée touchée.
const os = require("os");
const path = require("path");
const fs = require("fs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plos-bk-"));
process.env.DB_PATH = path.join(tmp, "test.db");
process.env.STORAGE_DIR = path.join(tmp, "storage");

const test = require("node:test");
const assert = require("node:assert/strict");
const AdmZip = require("adm-zip");
const Database = require("better-sqlite3");

const { runMigrations } = require("../dist/db/migrate");
const { sqlite, storageDir } = require("../dist/db");
const { writeBackupZip, restoreFromZip, buildJsonExport, relocatePath, RestoreError } = require("../dist/services/backupService");

runMigrations();
const now = new Date().toISOString();
const count = (t) => sqlite.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
const insertTask = (title) =>
  sqlite.prepare(`INSERT INTO tasks (title, created_at, updated_at) VALUES (?, ?, ?)`).run(title, now, now);

async function makeBackup(file) {
  await writeBackupZip(fs.createWriteStream(file));
}
function validManifest() {
  return JSON.stringify({ app: "Personal Life OS", backupVersion: 1, createdAt: now });
}
function zipWith(entries, file) {
  const z = new AdmZip();
  for (const [name, data] of entries) z.addFile(name, Buffer.isBuffer(data) ? data : Buffer.from(data));
  z.writeZip(file);
  return file;
}

test("aller-retour : export, perte des données, restauration complète", async () => {
  fs.mkdirSync(path.join(storageDir, "pdf"), { recursive: true });
  fs.mkdirSync(path.join(storageDir, "exports"), { recursive: true });
  fs.writeFileSync(path.join(storageDir, "pdf", "edt.pdf"), "PDF-EDT");
  fs.writeFileSync(path.join(storageDir, "exports", "note.pdf"), "PDF-NOTE");
  fs.writeFileSync(path.join(storageDir, "pdf", ".gitkeep"), "");

  insertTask("Réviser SQL");
  insertTask("Faire du sport");
  sqlite.prepare(`INSERT INTO notes (title, content, created_at, updated_at) VALUES ('Note', 'contenu', ?, ?)`).run(now, now);
  // chemins ABSOLUS d'une autre machine (Windows et Linux)
  sqlite.prepare(`INSERT INTO schedule_imports (file_name, stored_path, imported_at, status) VALUES ('edt.pdf', ?, ?, 'confirmed')`)
    .run("C:\\Users\\lenovo\\Desktop\\personal-life-os\\storage\\pdf\\edt.pdf", now);
  sqlite.prepare(`INSERT INTO files (original_name, stored_path, mime_type, size, created_at) VALUES ('note.pdf', ?, 'application/pdf', 8, ?)`)
    .run("/home/ancien/personal-life-os/storage/exports/note.pdf", now);

  const zipFile = path.join(tmp, "backup.zip");
  await makeBackup(zipFile);

  const names = new AdmZip(zipFile).getEntries().map((e) => e.entryName);
  assert.ok(names.includes("manifest.json"));
  assert.ok(names.includes("personal-life-os.db"));
  assert.ok(names.includes("files/pdf/edt.pdf"));
  assert.ok(names.includes("files/exports/note.pdf"));
  assert.ok(!names.some((n) => n.endsWith(".gitkeep")), ".gitkeep ne doit pas être sauvegardé");

  // catastrophe : données et fichiers perdus, + une donnée parasite
  sqlite.prepare(`DELETE FROM tasks`).run();
  sqlite.prepare(`DELETE FROM notes`).run();
  insertTask("PARASITE");
  fs.rmSync(path.join(storageDir, "pdf", "edt.pdf"));
  fs.rmSync(path.join(storageDir, "exports", "note.pdf"));

  const summary = await restoreFromZip(zipFile);

  const titles = sqlite.prepare(`SELECT title FROM tasks ORDER BY title`).all().map((r) => r.title);
  assert.deepEqual(titles, ["Faire du sport", "Réviser SQL"]);
  assert.equal(count("notes"), 1);
  assert.equal(summary.tables.tasks, 2);
  assert.equal(summary.filesRestored, 2);
  assert.equal(fs.readFileSync(path.join(storageDir, "pdf", "edt.pdf"), "utf-8"), "PDF-EDT");

  // chemins réécrits vers CETTE machine et fichiers réellement présents
  const imp = sqlite.prepare(`SELECT stored_path FROM schedule_imports`).get().stored_path;
  const fil = sqlite.prepare(`SELECT stored_path FROM files`).get().stored_path;
  assert.equal(imp, path.join(storageDir, "pdf", "edt.pdf"));
  assert.equal(fil, path.join(storageDir, "exports", "note.pdf"));
  assert.ok(fs.existsSync(imp) && fs.existsSync(fil));

  // copie de sécurité = l'état AVANT restauration (avec la donnée parasite)
  const safety = new Database(path.join(storageDir, "exports", summary.safetyBackup), { readonly: true });
  assert.ok(safety.prepare(`SELECT 1 FROM tasks WHERE title='PARASITE'`).get(), "la copie de sécurité doit contenir l'état précédent");
  safety.close();
  assert.equal(summary.foreignKeyIssues, 0);
});

test("relocatePath : chemins Windows, Linux, dossier inconnu", () => {
  assert.equal(relocatePath("C:\\a\\b\\storage\\study\\cours.pdf", "pdf"), path.join(storageDir, "study", "cours.pdf"));
  assert.equal(relocatePath("/x/storage/pdf/e.pdf", "study"), path.join(storageDir, "pdf", "e.pdf"));
  assert.equal(relocatePath("/ailleurs/inconnu/f.pdf", "exports"), path.join(storageDir, "exports", "f.pdf"));
  assert.equal(relocatePath(null, "pdf"), null);
});

test("restauration refuse un fichier qui n'est pas un ZIP", async () => {
  const f = path.join(tmp, "faux.zip");
  fs.writeFileSync(f, "ceci n'est pas un zip");
  await assert.rejects(() => restoreFromZip(f), RestoreError);
});

test("restauration refuse une archive sans manifest", async () => {
  const f = zipWith([["personal-life-os.db", "x"]], path.join(tmp, "sans-manifest.zip"));
  await assert.rejects(() => restoreFromZip(f), /Archive invalide/);
});

test("restauration refuse un manifest d'une autre application", async () => {
  const f = zipWith([["manifest.json", JSON.stringify({ app: "Autre", backupVersion: 1 })], ["personal-life-os.db", "x"]], path.join(tmp, "autre.zip"));
  await assert.rejects(() => restoreFromZip(f), /pas une sauvegarde/);
});

test("restauration refuse une base qui n'est pas SQLite", async () => {
  const f = zipWith([["manifest.json", validManifest()], ["personal-life-os.db", "pas du sqlite du tout"]], path.join(tmp, "pasdb.zip"));
  await assert.rejects(() => restoreFromZip(f), /base contenue/);
});

test("restauration refuse une base incomplète (tables manquantes)", async () => {
  const dbFile = path.join(tmp, "incomplete.db");
  const d = new Database(dbFile);
  d.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY)`);
  d.close();
  const f = zipWith([["manifest.json", validManifest()], ["personal-life-os.db", fs.readFileSync(dbFile)]], path.join(tmp, "incomplete.zip"));
  await assert.rejects(() => restoreFromZip(f), /incomplète/);
});

/** ZIP minimal fabriqué à la main : AdmZip assainit les noms ".." à la création, ce qui rendrait le test factice. */
function rawZip(entries) {
  const zlib = require("zlib");
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name);
    const crc = zlib.crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

test("restauration refuse une archive piégée (zip-slip) et n'écrit rien dehors", async () => {
  const f = path.join(tmp, "slip.zip");
  fs.writeFileSync(f, rawZip([
    ["manifest.json", Buffer.from(validManifest())],
    ["personal-life-os.db", Buffer.from("x")],
    ["../../evil.txt", Buffer.from("mal")],
  ]));
  const reread = new AdmZip(f).getEntries().map((e) => e.entryName);
  assert.ok(reread.some((n) => n.includes("..")), "le test doit réellement contenir une entrée '..' (relue: " + reread.join(",") + ")");
  const before = count("tasks");
  await assert.rejects(() => restoreFromZip(f), /dangereux/);
  assert.equal(count("tasks"), before, "aucune donnée ne doit changer");
  assert.equal(fs.existsSync(path.join(tmp, "evil.txt")), false);
  assert.equal(fs.existsSync(path.join(path.dirname(tmp), "evil.txt")), false);
});

test("restauration d'une ancienne base (colonnes manquantes) : migration + catalogues reconstitués", async () => {
  const dbFile = path.join(tmp, "old.db");
  const d = new Database(dbFile);
  d.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE schedule_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_name TEXT NOT NULL, day_of_week INTEGER NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pending', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO tasks (title, created_at, updated_at) VALUES ('Vieille tâche', '2026-01-01', '2026-01-01');
    INSERT INTO schedule_entries (subject_name, day_of_week, start_time, end_time) VALUES ('Algo', 1, '08:15', '10:05');
  `);
  d.close();
  const f = zipWith([["manifest.json", validManifest()], ["personal-life-os.db", fs.readFileSync(dbFile)]], path.join(tmp, "old.zip"));
  const summary = await restoreFromZip(f);
  assert.equal(summary.tables.tasks, 1);
  assert.equal(sqlite.prepare(`SELECT title FROM tasks`).get().title, "Vieille tâche");
  assert.equal(count("schedule_entries"), 1);
  assert.equal(count("notes"), 0, "table absente de l'ancienne base : vide, pas de crash");
  assert.ok(count("achievements") > 0, "le catalogue de trophées est reconstitué");
  insertTask("après migration"); // le schéma complet est utilisable
  assert.equal(count("tasks"), 2);
});

test("export JSON : toutes les tables avec leurs lignes", () => {
  const j = buildJsonExport();
  assert.equal(j.app, "Personal Life OS");
  assert.ok(Array.isArray(j.tables.tasks));
  assert.equal(j.tables.tasks.length, count("tasks"));
  assert.ok("habits" in j.tables && "user_media" in j.tables);
});

test.after(() => {
  sqlite.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

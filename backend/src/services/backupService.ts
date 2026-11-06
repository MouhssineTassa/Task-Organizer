import fs from "fs";
import os from "os";
import path from "path";
import { Writable } from "stream";
import archiver from "archiver";
import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import { sqlite, storageDir } from "../db";
import { runMigrations } from "../db/migrate";

/**
 * SAUVEGARDE / EXPORT / RESTAURATION (section 60)
 * Format : un ZIP contenant manifest.json, personal-life-os.db (instantané
 * cohérent via l'API de sauvegarde SQLite) et files/<dossier>/<fichier>.
 */

export const BACKUP_VERSION = 1;
export const STORAGE_SUBDIRS = ["pdf", "study", "exports", "uploads", "books", "media", "notes"] as const;
const DB_ENTRY = "personal-life-os.db";

/** Colonnes qui stockent un chemin de fichier absolu : à réécrire quand on restaure sur une autre machine. */
const PATH_COLUMNS: Array<{ table: string; column: string; fallbackSubdir: string }> = [
  { table: "schedule_imports", column: "stored_path", fallbackSubdir: "pdf" },
  { table: "study_documents", column: "file_path", fallbackSubdir: "study" },
  { table: "files", column: "stored_path", fallbackSubdir: "exports" },
];

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

function userTables(): string[] {
  return (
    sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
      .all() as Array<{ name: string }>
  ).map((r) => r.name);
}

// ---------------------------------------------------------------- EXPORT ZIP
export async function writeBackupZip(out: Writable): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plos-backup-"));
  const tmpDb = path.join(tmp, DB_ENTRY);
  try {
    await sqlite.backup(tmpDb); // instantané cohérent, même avec le mode WAL

    // Une sauvegarde peut être copiée sur un cloud ou une clé USB : on y retire le hash du mot de passe et les sessions.
    const snap = new Database(tmpDb);
    try {
      snap.prepare(`UPDATE users SET password_hash = NULL`).run();
      snap.prepare(`DELETE FROM sessions`).run();
    } finally {
      snap.close();
    }

    await new Promise<void>((resolve, reject) => {
      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", reject);
      out.on("close", () => resolve());
      out.on("error", reject);
      archive.pipe(out);

      archive.append(
        JSON.stringify({ app: "Personal Life OS", backupVersion: BACKUP_VERSION, createdAt: new Date().toISOString() }, null, 2),
        { name: "manifest.json" }
      );
      archive.file(tmpDb, { name: DB_ENTRY });
      for (const sub of STORAGE_SUBDIRS) {
        const dir = path.join(storageDir, sub);
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) {
          if (f === ".gitkeep") continue;
          const full = path.join(dir, f);
          if (fs.statSync(full).isFile()) archive.file(full, { name: `files/${sub}/${f}` });
        }
      }
      archive.finalize();
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// --------------------------------------------------------------- EXPORT JSON
export function buildJsonExport(): { app: string; exportedAt: string; tables: Record<string, unknown[]> } {
  const tables: Record<string, unknown[]> = {};
  for (const t of userTables()) {
    if (t === "sessions") continue; // jamais exporté
    const rows = sqlite.prepare(`SELECT * FROM ${q(t)}`).all() as Array<Record<string, unknown>>;
    tables[t] = t === "users" ? rows.map(({ password_hash: _omit, ...rest }) => rest) : rows;
  }
  return { app: "Personal Life OS", exportedAt: new Date().toISOString(), tables };
}

// ------------------------------------------------------------------ RESTORE
export interface RestoreSummary {
  tables: Record<string, number>;
  filesRestored: number;
  safetyBackup: string;
  foreignKeyIssues: number;
}

export class RestoreError extends Error {}

/** Un nom d'entrée est sûr s'il n'est pas absolu et ne remonte pas dans l'arborescence (zip-slip). */
function isUnsafeEntry(name: string): boolean {
  const n = name.replace(/\\/g, "/");
  return n.startsWith("/") || /^[A-Za-z]:/.test(n) || n.split("/").includes("..") || n.includes("\0");
}

export function relocatePath(old: string | null, fallbackSubdir: string): string | null {
  if (!old) return old;
  const norm = old.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/storage/");
  const base = path.basename(norm);
  if (idx >= 0) {
    const parts = norm.slice(idx + "/storage/".length).split("/");
    if ((STORAGE_SUBDIRS as readonly string[]).includes(parts[0])) return path.join(storageDir, parts[0], base);
  }
  return path.join(storageDir, fallbackSubdir, base);
}

export async function restoreFromZip(zipPath: string): Promise<RestoreSummary> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipPath);
  } catch {
    throw new RestoreError("Ce fichier n'est pas une archive ZIP valide.");
  }
  const entries = zip.getEntries();

  for (const e of entries) {
    if (isUnsafeEntry(e.entryName)) throw new RestoreError("Archive refusée : elle contient un chemin dangereux.");
  }

  const manifestEntry = entries.find((e) => e.entryName === "manifest.json");
  const dbEntry = entries.find((e) => e.entryName === DB_ENTRY);
  if (!manifestEntry || !dbEntry) {
    throw new RestoreError("Archive invalide : ce n'est pas une sauvegarde Personal Life OS (manifest.json ou base manquante).");
  }
  let manifest: { app?: string; backupVersion?: number };
  try {
    manifest = JSON.parse(manifestEntry.getData().toString("utf-8"));
  } catch {
    throw new RestoreError("Archive invalide : manifest illisible.");
  }
  if (manifest.app !== "Personal Life OS") throw new RestoreError("Archive invalide : ce n'est pas une sauvegarde Personal Life OS.");
  if ((manifest.backupVersion ?? 0) > BACKUP_VERSION) {
    throw new RestoreError("Cette sauvegarde vient d'une version plus récente de l'application. Mets l'application à jour d'abord.");
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plos-restore-"));
  const srcDb = path.join(tmp, DB_ENTRY);
  try {
    fs.writeFileSync(srcDb, dbEntry.getData());

    // La base fournie doit être une vraie base SQLite contenant au moins nos tables de base.
    const header = fs.readFileSync(srcDb).subarray(0, 16).toString("latin1");
    if (!header.startsWith("SQLite format 3")) throw new RestoreError("La base contenue dans l'archive n'est pas valide.");
    const probe = new Database(srcDb, { readonly: true });
    try {
      const names = new Set((probe.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{ name: string }>).map((r) => r.name));
      for (const required of ["users", "tasks", "schedule_entries"]) {
        if (!names.has(required)) throw new RestoreError(`La base de l'archive est incomplète (table « ${required} » absente).`);
      }
    } finally {
      probe.close();
    }

    // Copie de sécurité automatique des données actuelles AVANT tout remplacement.
    const exportsDir = path.join(storageDir, "exports");
    fs.mkdirSync(exportsDir, { recursive: true });
    const safetyName = `avant-restauration-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
    await sqlite.backup(path.join(exportsDir, safetyName));

    // Remplacement des données dans la connexion ouverte (aucun fichier de base à écraser).
    // Le mot de passe actuel et les sessions ouvertes ne sont jamais écrasés par une restauration.
    const keepHash = (sqlite.prepare(`SELECT password_hash FROM users WHERE password_hash IS NOT NULL LIMIT 1`).get() as
      | { password_hash: string }
      | undefined)?.password_hash;

    sqlite.pragma("foreign_keys = OFF");
    sqlite.prepare(`ATTACH DATABASE ? AS restore_src`).run(srcDb);
    const counts: Record<string, number> = {};
    try {
      const srcTables = new Set(
        (sqlite.prepare(`SELECT name FROM restore_src.sqlite_master WHERE type='table'`).all() as Array<{ name: string }>).map((r) => r.name)
      );
      const tx = sqlite.transaction(() => {
        for (const t of userTables()) {
          if (t === "sessions") continue;
          sqlite.prepare(`DELETE FROM main.${q(t)}`).run();
          if (!srcTables.has(t)) {
            counts[t] = 0;
            continue;
          }
          const mainInfo = sqlite.prepare(`PRAGMA main.table_info(${q(t)})`).all() as Array<{
            name: string;
            type: string;
            notnull: number;
            dflt_value: string | null;
            pk: number;
          }>;
          const srcCols = new Set((sqlite.prepare(`PRAGMA restore_src.table_info(${q(t)})`).all() as Array<{ name: string }>).map((c) => c.name));
          const insertCols: string[] = [];
          const selectExprs: string[] = [];
          for (const c of mainInfo) {
            if (srcCols.has(c.name)) {
              insertCols.push(q(c.name));
              selectExprs.push(q(c.name));
            } else if (c.notnull && c.dflt_value === null && !c.pk) {
              // Colonne obligatoire absente d'une sauvegarde plus ancienne : valeur de repli, pour ne pas échouer.
              insertCols.push(q(c.name));
              selectExprs.push(/INT|REAL|NUM|BOOL/i.test(c.type) ? "0" : `'${new Date().toISOString()}'`);
            }
          }
          sqlite
            .prepare(`INSERT INTO main.${q(t)} (${insertCols.join(", ")}) SELECT ${selectExprs.join(", ")} FROM restore_src.${q(t)}`)
            .run();
          counts[t] = (sqlite.prepare(`SELECT COUNT(*) AS c FROM main.${q(t)}`).get() as { c: number }).c;
        }
      });
      tx();
    } finally {
      sqlite.exec(`DETACH DATABASE restore_src`);
      sqlite.pragma("foreign_keys = ON");
    }

    if (keepHash) sqlite.prepare(`UPDATE users SET password_hash = ?`).run(keepHash);

    // Les chemins de fichiers sont absolus : on les ramène dans le dossier storage de CETTE machine.
    for (const { table, column, fallbackSubdir } of PATH_COLUMNS) {
      const rows = sqlite.prepare(`SELECT id, ${q(column)} AS p FROM ${q(table)} WHERE ${q(column)} IS NOT NULL`).all() as Array<{ id: number; p: string }>;
      const upd = sqlite.prepare(`UPDATE ${q(table)} SET ${q(column)} = ? WHERE id = ?`);
      for (const r of rows) upd.run(relocatePath(r.p, fallbackSubdir), r.id);
    }

    // Fichiers : uniquement files/<dossier autorisé>/<nom simple>.
    let filesRestored = 0;
    for (const e of entries) {
      if (e.isDirectory || !e.entryName.startsWith("files/")) continue;
      const parts = e.entryName.split("/");
      if (parts.length !== 3 || !(STORAGE_SUBDIRS as readonly string[]).includes(parts[1])) continue;
      const name = path.basename(parts[2]);
      if (!name || name === ".gitkeep") continue;
      const destDir = path.join(storageDir, parts[1]);
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(path.join(destDir, name), e.getData());
      filesRestored++;
    }

    runMigrations(); // met à niveau une sauvegarde plus ancienne (colonnes/catalogues manquants)

    const fkIssues = (sqlite.prepare(`PRAGMA foreign_key_check`).all() as unknown[]).length;
    return { tables: counts, filesRestored, safetyBackup: safetyName, foreignKeyIssues: fkIssues };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

// STORAGE_DIR permet aux tests d'isoler les fichiers ; par défaut : <projet>/storage.
export const storageDir = process.env.STORAGE_DIR ?? path.resolve(__dirname, "../../../storage");
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

// DB_PATH permet aux tests d'utiliser une base temporaire sans toucher aux vraies données.
const dbPath = process.env.DB_PATH ?? path.join(storageDir, "personal-life-os.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { sqlite };

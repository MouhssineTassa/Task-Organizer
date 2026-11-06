import crypto from "crypto";
import { promisify } from "util";
import { sqlite } from "../db";

/**
 * AUTHENTIFICATION LOCALE (section 61)
 * - Mot de passe haché avec scrypt (intégré à Node : aucune dépendance native).
 * - Sessions côté serveur : le cookie contient un jeton aléatoire, la base
 *   n'en garde que l'empreinte SHA-256 (une fuite de la base ne donne pas de
 *   session utilisable).
 */

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, keylen: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const KEYLEN = 64;
const COST = { N: 16384, r: 8, p: 1 };
export const SESSION_DAYS = 30;
export const SESSION_MAX_AGE_SEC = SESSION_DAYS * 24 * 3600;

// ---------------------------------------------------------------- mot de passe
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, COST);
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, N, r, p, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

const COMMON = new Set([
  "password", "password1", "12345678", "123456789", "1234567890", "azerty123", "azertyuiop", "qwertyuiop",
  "motdepasse", "motdepasse1", "00000000", "11111111", "abcdefgh", "iloveyou", "admin1234", "letmein123",
]);

/** Renvoie un message d'erreur en français, ou null si le mot de passe est acceptable. */
export function validatePassword(password: unknown, name?: string): string | null {
  if (typeof password !== "string") return "Mot de passe invalide.";
  if (password.length < 8) return "Le mot de passe doit contenir au moins 8 caractères.";
  if (password.length > 128) return "Le mot de passe est trop long (128 caractères maximum).";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "Ce mot de passe est trop courant. Choisis-en un autre.";
  if (new Set(password).size < 3) return "Le mot de passe est trop répétitif.";
  if (name && name.trim().length >= 3 && lower === name.trim().toLowerCase()) return "Le mot de passe ne doit pas être ton nom.";
  return null;
}

// ----------------------------------------------------------------- utilisateur
export function getUser(): { id: number; name: string; password_hash: string | null } | undefined {
  return sqlite.prepare(`SELECT id, name, password_hash FROM users ORDER BY id LIMIT 1`).get() as any;
}
export const isConfigured = (): boolean => !!getUser()?.password_hash;

export async function setPassword(password: string, name?: string): Promise<void> {
  const hash = await hashPassword(password);
  const user = getUser();
  if (!user) {
    sqlite.prepare(`INSERT INTO users (name, password_hash, created_at) VALUES (?, ?, ?)`).run(name || "Étudiant", hash, new Date().toISOString());
  } else {
    sqlite.prepare(`UPDATE users SET password_hash = ?, name = COALESCE(?, name) WHERE id = ?`).run(hash, name || null, user.id);
  }
}

// -------------------------------------------------------------------- sessions
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function createSession(userAgent?: string): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SEC * 1000).toISOString();
  sqlite
    .prepare(`INSERT INTO sessions (token_hash, created_at, last_used_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)`)
    .run(sha256(token), now.toISOString(), now.toISOString(), expiresAt, (userAgent ?? "").slice(0, 200));
  return { token, expiresAt };
}

/** Valide un jeton ; prolonge la session (glissante) au plus une fois par heure. */
export function validateSession(token: string | undefined): boolean {
  if (!token || token.length < 20 || token.length > 100) return false;
  const row = sqlite.prepare(`SELECT id, last_used_at, expires_at FROM sessions WHERE token_hash = ?`).get(sha256(token)) as
    | { id: number; last_used_at: string; expires_at: string }
    | undefined;
  if (!row) return false;
  const now = Date.now();
  if (new Date(row.expires_at).getTime() <= now) {
    sqlite.prepare(`DELETE FROM sessions WHERE id = ?`).run(row.id);
    return false;
  }
  if (now - new Date(row.last_used_at).getTime() > 3600 * 1000) {
    sqlite
      .prepare(`UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE id = ?`)
      .run(new Date(now).toISOString(), new Date(now + SESSION_MAX_AGE_SEC * 1000).toISOString(), row.id);
  }
  return true;
}

export const destroySession = (token: string) => void sqlite.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(sha256(token));
export const destroyOtherSessions = (keepToken: string) => void sqlite.prepare(`DELETE FROM sessions WHERE token_hash != ?`).run(sha256(keepToken));
export const destroyAllSessions = () => void sqlite.prepare(`DELETE FROM sessions`).run();
export const purgeExpiredSessions = () => void sqlite.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).run(new Date().toISOString());

// ------------------------------------------------- limitation des essais de connexion
const MAX_FAILS = Number(process.env.LOGIN_MAX_FAILS ?? 5);
const BASE_LOCK_SEC = Number(process.env.LOGIN_LOCK_SECONDS ?? 60);
const MAX_LOCK_SEC = 15 * 60;
const attempts = new Map<string, { fails: number; locks: number; lockedUntil: number }>();

/** Renvoie 0 si la connexion est permise, sinon le nombre de secondes à attendre. */
export function loginWaitSeconds(key: string): number {
  const a = attempts.get(key);
  if (!a) return 0;
  return a.lockedUntil > Date.now() ? Math.ceil((a.lockedUntil - Date.now()) / 1000) : 0;
}
export function recordLoginFailure(key: string): void {
  const a = attempts.get(key) ?? { fails: 0, locks: 0, lockedUntil: 0 };
  a.fails += 1;
  if (a.fails >= MAX_FAILS) {
    a.locks += 1;
    a.fails = 0;
    a.lockedUntil = Date.now() + Math.min(MAX_LOCK_SEC, BASE_LOCK_SEC * 2 ** (a.locks - 1)) * 1000;
  }
  attempts.set(key, a);
}
export const recordLoginSuccess = (key: string) => void attempts.delete(key);
export const resetLoginLimiter = () => attempts.clear();

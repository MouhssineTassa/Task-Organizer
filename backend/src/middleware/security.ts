import type { NextFunction, Request, Response } from "express";
import { isConfigured, validateSession } from "../services/auth";

/** Origines autorisées à appeler l'API depuis un navigateur (FRONTEND_ORIGINS pour en ajouter). */
export const ALLOWED_ORIGINS = (
  process.env.FRONTEND_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const SESSION_COOKIE = "plos_session";

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
  next();
}

/**
 * Protection CSRF pour toute requête qui modifie des données :
 *  - l'en-tête Origin, s'il est présent, doit être une origine autorisée ;
 *  - l'en-tête personnalisé X-PLOS: 1 est exigé (un site tiers ne peut pas
 *    l'ajouter sans déclencher une pré-vérification CORS, qu'on refuse).
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: "Origine non autorisée." });
  if (req.header("x-plos") !== "1") return res.status(403).json({ error: "Requête refusée (en-tête de sécurité manquant)." });
  next();
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const getSessionToken = (req: Request): string | undefined => parseCookies(req.headers.cookie)[SESSION_COOKIE];

export function setSessionCookie(res: Response, token: string, maxAgeSec: number) {
  const secure = process.env.COOKIE_SECURE === "true" ? "; Secure" : "";
  res.append("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure}`);
}
export function clearSessionCookie(res: Response) {
  res.append("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!isConfigured()) return res.status(401).json({ error: "Aucun mot de passe défini.", code: "setup_required" });
  const token = getSessionToken(req);
  if (!validateSession(token)) return res.status(401).json({ error: "Session absente ou expirée.", code: "unauthenticated" });
  (req as Request & { sessionToken?: string }).sessionToken = token;
  next();
}

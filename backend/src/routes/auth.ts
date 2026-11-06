import { Router } from "express";
import { z } from "zod";
import {
  createSession, destroySession, destroyOtherSessions, destroyAllSessions, getUser, isConfigured, loginWaitSeconds,
  recordLoginFailure, recordLoginSuccess, setPassword, validatePassword, validateSession, verifyPassword, SESSION_MAX_AGE_SEC,
} from "../services/auth";
import { clearSessionCookie, getSessionToken, requireAuth, setSessionCookie } from "../middleware/security";

const router = Router();
const ipKey = (req: { ip?: string }) => req.ip ?? "local";

/** État public : permet à l'interface de choisir entre création du mot de passe, connexion ou application. */
router.get("/status", (req, res) => {
  const configured = isConfigured();
  const authenticated = configured && validateSession(getSessionToken(req));
  res.json({ configured, authenticated, name: authenticated ? getUser()?.name ?? null : null });
});

/** Première utilisation : définit le mot de passe (refusé s'il existe déjà). */
router.post("/setup", async (req, res) => {
  if (isConfigured()) return res.status(409).json({ error: "Un mot de passe est déjà défini." });
  const parsed = z.object({ password: z.string(), name: z.string().trim().max(60).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Données invalides." });
  const problem = validatePassword(parsed.data.password, parsed.data.name);
  if (problem) return res.status(400).json({ error: problem });
  await setPassword(parsed.data.password, parsed.data.name || undefined);
  const { token } = createSession(req.headers["user-agent"]);
  setSessionCookie(res, token, SESSION_MAX_AGE_SEC);
  res.status(201).json({ name: getUser()?.name });
});

router.post("/login", async (req, res) => {
  if (!isConfigured()) return res.status(409).json({ error: "Aucun mot de passe défini.", code: "setup_required" });
  const wait = loginWaitSeconds(ipKey(req));
  if (wait > 0) {
    res.setHeader("Retry-After", String(wait));
    return res.status(429).json({ error: `Trop d'essais. Réessaie dans ${wait} s.`, retryAfter: wait });
  }
  const parsed = z.object({ password: z.string().max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Données invalides." });
  if (!(await verifyPassword(parsed.data.password, getUser()?.password_hash))) {
    recordLoginFailure(ipKey(req));
    return res.status(401).json({ error: "Mot de passe incorrect." }); // message volontairement générique
  }
  recordLoginSuccess(ipKey(req));
  const { token } = createSession(req.headers["user-agent"]);
  setSessionCookie(res, token, SESSION_MAX_AGE_SEC);
  res.json({ name: getUser()?.name });
});

router.post("/logout", (req, res) => {
  const token = getSessionToken(req);
  if (token) destroySession(token);
  clearSessionCookie(res);
  res.status(204).send();
});

router.post("/logout-all", requireAuth, (_req, res) => {
  destroyAllSessions();
  clearSessionCookie(res);
  res.status(204).send();
});

router.post("/change-password", requireAuth, async (req, res) => {
  const parsed = z.object({ currentPassword: z.string().max(200), newPassword: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Données invalides." });
  const wait = loginWaitSeconds(ipKey(req));
  if (wait > 0) {
    res.setHeader("Retry-After", String(wait));
    return res.status(429).json({ error: `Trop d'essais. Réessaie dans ${wait} s.`, retryAfter: wait });
  }
  if (!(await verifyPassword(parsed.data.currentPassword, getUser()?.password_hash))) {
    recordLoginFailure(ipKey(req));
    return res.status(401).json({ error: "Le mot de passe actuel est incorrect." });
  }
  const problem = validatePassword(parsed.data.newPassword, getUser()?.name);
  if (problem) return res.status(400).json({ error: problem });
  await setPassword(parsed.data.newPassword);
  recordLoginSuccess(ipKey(req));
  destroyOtherSessions((req as unknown as { sessionToken: string }).sessionToken); // les autres appareils/navigateurs sont déconnectés
  res.json({ ok: true });
});

export default router;

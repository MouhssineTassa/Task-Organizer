import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getAuthStatus, setupPassword, loginRequest, logoutRequest } from "../api/client";
import type { AuthStatus } from "../api/client";
import { Lock } from "lucide-react";

interface AuthContextValue {
  name: string | null;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue>({ name: null, logout: async () => {} });
export const useAuth = () => useContext(AuthContext);

type Phase = "loading" | "unreachable" | "setup" | "login" | "ready";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center">
            <Lock size={17} />
          </div>
          <div>
            <p className="font-bold text-brand-700 leading-tight">Personal Life OS</p>
            <p className="text-xs text-slate-400">Ton centre personnel</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm";
const btnCls = "w-full px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const st = await getAuthStatus();
      setStatus(st);
      setPhase(!st.configured ? "setup" : st.authenticated ? "ready" : "login");
    } catch {
      setPhase("unreachable");
    }
  }, []);

  useEffect(() => {
    refresh();
    const onExpired = () => {
      setPassword("");
      setPhase((p) => (p === "ready" ? "login" : p));
    };
    window.addEventListener("auth-expired", onExpired);
    return () => window.removeEventListener("auth-expired", onExpired);
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setPassword("");
      setPhase("login");
    }
  }, []);

  const errorText = (e: any) => e?.response?.data?.error ?? "Une erreur est survenue. Réessaie.";

  const submitSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Les deux mots de passe ne correspondent pas.");
    setBusy(true);
    try {
      const r = await setupPassword(password, name.trim() || undefined);
      setStatus({ configured: true, authenticated: true, name: r.name });
      setPassword("");
      setConfirm("");
      setPhase("ready");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await loginRequest(password);
      setStatus({ configured: true, authenticated: true, name: r.name });
      setPassword("");
      setPhase("ready");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (phase === "loading") return <Shell><p className="text-sm text-slate-400">Chargement…</p></Shell>;

  if (phase === "unreachable") {
    return (
      <Shell>
        <p className="font-medium text-slate-800 mb-1">Le serveur local ne répond pas</p>
        <p className="text-sm text-slate-500 mb-3">
          Lance-le avec <code className="bg-slate-100 px-1 rounded">npm run dev</code> dans le dossier <code className="bg-slate-100 px-1 rounded">backend</code>,
          puis réessaie. Tes données ne sont pas perdues.
        </p>
        <button className={btnCls} onClick={() => { setPhase("loading"); refresh(); }}>Réessayer</button>
      </Shell>
    );
  }

  if (phase === "setup") {
    return (
      <Shell>
        <p className="font-medium text-slate-800 mb-1">Bienvenue — protège tes données</p>
        <p className="text-sm text-slate-500 mb-4">
          Choisis un mot de passe pour ouvrir l'application. Il reste sur cet ordinateur et ne peut pas être récupéré : si tu l'oublies, il existe une
          commande de réinitialisation (voir le README), sans perte de données.
        </p>
        <form onSubmit={submitSetup} className="space-y-3">
          <input className={inputCls} placeholder="Ton prénom (optionnel)" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="given-name" />
          <input className={inputCls} type={show ? "text" : "password"} placeholder="Mot de passe (8 caractères minimum)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          <input className={inputCls} type={show ? "text" : "password"} placeholder="Confirme le mot de passe" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Afficher les mots de passe
          </label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button className={btnCls} disabled={busy} type="submit">{busy ? "Création…" : "Créer le mot de passe"}</button>
        </form>
      </Shell>
    );
  }

  if (phase === "login") {
    return (
      <Shell>
        <p className="font-medium text-slate-800 mb-3">{status?.name ? `Bonjour ${status.name}` : "Connexion"}</p>
        <form onSubmit={submitLogin} className="space-y-3">
          <input className={inputCls} type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus required />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button className={btnCls} disabled={busy} type="submit">{busy ? "Connexion…" : "Se connecter"}</button>
        </form>
      </Shell>
    );
  }

  return <AuthContext.Provider value={{ name: status?.name ?? null, logout }}>{children}</AuthContext.Provider>;
}

import { useEffect, useRef, useState } from "react";
import { API_BASE, restoreBackup, changePasswordRequest, logoutAllRequest } from "../api/client";
import type { RestoreSummary } from "../api/client";
import { Card, PageHeader, Button } from "../components/ui";
import { Download, Upload, ShieldAlert, Smartphone, KeyRound } from "lucide-react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export default function Parametres() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RestoreSummary | null>(null);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPw !== newPw2) return setPwMsg({ ok: false, text: "Les deux nouveaux mots de passe ne correspondent pas." });
    setPwBusy(true);
    try {
      await changePasswordRequest(curPw, newPw);
      setCurPw("");
      setNewPw("");
      setNewPw2("");
      setPwMsg({ ok: true, text: "Mot de passe modifié. Les autres appareils/navigateurs ont été déconnectés." });
    } catch (err: any) {
      setPwMsg({ ok: false, text: err?.response?.data?.error ?? "Impossible de modifier le mot de passe." });
    } finally {
      setPwBusy(false);
    }
  };

  const logoutEverywhere = async () => {
    await logoutAllRequest();
    window.dispatchEvent(new CustomEvent("auth-expired"));
  };

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const restore = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      setSummary(await restoreBackup(file));
      setFile(null);
      setConfirmText("");
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "La restauration a échoué.");
    } finally {
      setBusy(false);
    }
  };

  const totalRows = summary ? Object.values(summary.tables).reduce((a, b) => a + b, 0) : 0;

  return (
    <div>
      <PageHeader title="⚙️ Paramètres" subtitle="Sauvegarde, export, restauration et installation." />

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <Download size={17} /> Sauvegarder mes données
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Tes données restent sur ton ordinateur. Une sauvegarde est un fichier ZIP qui contient toute ta base et tes fichiers (EDT, cours, PDF exportés).
            Garde-en une copie ailleurs (clé USB, cloud).
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`${API_BASE}/backup/export`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700"
            >
              <Download size={15} /> Sauvegarde complète (.zip)
            </a>
            <a
              href={`${API_BASE}/backup/export-json`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              Exporter les données (JSON)
            </a>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">
            Le JSON est lisible par un humain ou un autre outil, mais ne contient pas les fichiers et ne peut pas être restauré directement.
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <Upload size={17} /> Restaurer une sauvegarde
          </h2>
          <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 mb-3 flex gap-2">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            <p>
              La restauration <strong>remplace toutes les données actuelles</strong>. Une copie de sécurité de l'état actuel est créée automatiquement dans
              <code className="mx-1">storage/exports</code>avant le remplacement.
            </p>
          </div>

          <div
            className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center cursor-pointer hover:border-brand-300"
            onClick={() => fileInput.current?.click()}
          >
            <p className="text-sm text-slate-600">{file ? file.name : "Choisir un fichier de sauvegarde (.zip)"}</p>
            <input
              ref={fileInput}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setSummary(null);
                setError(null);
              }}
            />
          </div>

          {file && (
            <div className="mt-3">
              <label className="text-xs text-slate-500">
                Pour confirmer, tape <strong>REMPLACER</strong> :
              </label>
              <input
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="REMPLACER"
              />
              <Button className="mt-3" variant="danger" disabled={confirmText !== "REMPLACER" || busy} onClick={restore}>
                {busy ? "Restauration…" : "Restaurer et remplacer mes données"}
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          {summary && (
            <div className="mt-3 text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3">
              <p className="font-medium">Restauration terminée.</p>
              <p className="text-xs mt-1">
                {totalRows} lignes restaurées dans {Object.keys(summary.tables).length} tables, {summary.filesRestored} fichier(s). Copie de sécurité :{" "}
                <code>{summary.safetyBackup}</code>
              </p>
              {summary.foreignKeyIssues > 0 && (
                <p className="text-xs mt-1 text-amber-700">{summary.foreignKeyIssues} lien(s) entre données à vérifier.</p>
              )}
              <Button className="mt-2" variant="secondary" onClick={() => window.location.reload()}>
                Recharger l'application
              </Button>
            </div>
          )}
        </Card>

        <Card className="md:col-span-2">
          <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <KeyRound size={17} /> Sécurité
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            L'application n'écoute que sur cet ordinateur et demande ton mot de passe. Mot de passe oublié ? Arrête le serveur puis lance{" "}
            <code className="bg-slate-100 px-1 rounded">npm run reset-password</code> dans le dossier <code className="bg-slate-100 px-1 rounded">backend</code> : le
            mot de passe est effacé, tes données restent intactes.
          </p>
          <form onSubmit={changePassword} className="grid md:grid-cols-4 gap-2 items-start">
            <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm" type="password" placeholder="Mot de passe actuel" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" required />
            <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm" type="password" placeholder="Nouveau mot de passe" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" required />
            <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm" type="password" placeholder="Confirmer" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" required />
            <Button type="submit" disabled={pwBusy}>{pwBusy ? "…" : "Changer le mot de passe"}</Button>
          </form>
          {pwMsg && <p role="status" className={`text-sm mt-2 ${pwMsg.ok ? "text-emerald-700" : "text-red-600"}`}>{pwMsg.text}</p>}
          <div className="mt-3">
            <Button variant="secondary" onClick={logoutEverywhere}>Déconnecter tous les appareils</Button>
          </div>
        </Card>

        <Card className="md:col-span-2">
          <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <Smartphone size={17} /> Installer l'application
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Personal Life OS peut s'installer comme une application (icône, fenêtre dédiée). L'interface est mise en cache, mais les données viennent du serveur
            local : <strong>le backend doit être lancé</strong> pour que l'application fonctionne.
          </p>
          {installEvent ? (
            <Button onClick={() => installEvent.prompt()}>Installer l'application</Button>
          ) : (
            <p className="text-xs text-slate-500">
              Installation proposée par ton navigateur (menu ⋮ → « Installer… ») quand l'application est servie en version de production. Sur
              <code className="mx-1">http://localhost</code>elle est autorisée ; sur une autre adresse en http, le navigateur la refuse.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

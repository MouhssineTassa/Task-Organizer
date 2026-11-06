import { useEffect, useRef, useState } from "react";
import {
  uploadScheduleFile,
  confirmScheduleImport,
  getCurrentSchedule,
  getScheduleDiff,
} from "../api/client";
import type { DraftScheduleEntry, ScheduleEntry } from "../types";
import { Card, PageHeader, Badge, Button } from "../components/ui";
import { Upload, CheckCircle } from "lucide-react";

const DAY_LABELS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export default function EdtImport() {
  const [draft, setDraft] = useState<DraftScheduleEntry[]>([]);
  const [importId, setImportId] = useState<number | null>(null);
  const [fileName, setFileName] = useState("");
  const [current, setCurrent] = useState<ScheduleEntry[]>([]);
  const [diff, setDiff] = useState<{ added: DraftScheduleEntry[]; removed: any[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadCurrent = async () => setCurrent(await getCurrentSchedule());

  useEffect(() => {
    loadCurrent();
  }, []);

  const handleUpload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const result = await uploadScheduleFile(file);
      setImportId(result.importId);
      setFileName(result.fileName);
      setDraft(result.entries);
      const d = await getScheduleDiff(result.importId);
      setDiff(d);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Échec de l'import du PDF.");
    } finally {
      setBusy(false);
    }
  };

  const updateEntry = (index: number, patch: Partial<DraftScheduleEntry>) => {
    setDraft((d) => d.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const removeEntry = (index: number) => {
    setDraft((d) => d.filter((_, i) => i !== index));
  };

  const confirm = async () => {
    if (importId === null) return;
    setBusy(true);
    try {
      await confirmScheduleImport(importId, draft);
      setDraft([]);
      setImportId(null);
      setDiff(null);
      loadCurrent();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Import de l'EDT universitaire"
        subtitle="Le PDF est analysé puis affiché en brouillon modifiable — rien n'est ajouté au calendrier sans ta validation."
      />

      <Card className="mb-5">
        <div
          className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-brand-300"
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleUpload(f);
          }}
        >
          <Upload className="mx-auto mb-2 text-brand-500" />
          <p className="text-sm text-slate-600">Glisse ton EDT au format PDF ici, ou clique pour choisir un fichier</p>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
        </div>
        {busy && <p className="text-sm text-slate-400 mt-3">Traitement en cours…</p>}
        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
      </Card>

      {draft.length > 0 && (
        <Card className="mb-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-semibold text-slate-800">
              Brouillon extrait de « {fileName} » ({draft.length} créneaux)
            </h2>
            <Button onClick={confirm} disabled={busy}>
              <CheckCircle size={16} /> Valider et remplacer l'EDT actif
            </Button>
          </div>

          {diff && (diff.added.length > 0 || diff.removed.length > 0) && (
            <div className="mb-4 grid md:grid-cols-2 gap-3 text-xs">
              {diff.added.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <p className="font-medium text-emerald-700 mb-1">Nouveaux par rapport à l'EDT actuel</p>
                  {diff.added.map((a, i) => (
                    <p key={i}>
                      {a.subjectName} — {DAY_LABELS[a.dayOfWeek]} {a.startTime}
                    </p>
                  ))}
                </div>
              )}
              {diff.removed.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="font-medium text-red-700 mb-1">Absents du nouveau PDF</p>
                  {diff.removed.map((r: any, i: number) => (
                    <p key={i}>
                      {r.subject_name} — {DAY_LABELS[r.day_of_week]} {r.start_time}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs">
                  <th className="py-2 pr-2">Jour</th>
                  <th className="py-2 pr-2">Horaire</th>
                  <th className="py-2 pr-2">Matière</th>
                  <th className="py-2 pr-2">Type</th>
                  <th className="py-2 pr-2">Salle</th>
                  <th className="py-2 pr-2">Séance</th>
                  <th className="py-2 pr-2">Enseignant</th>
                  <th className="py-2 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {draft.map((e, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-2 pr-2">
                      <select
                        value={e.dayOfWeek}
                        onChange={(ev) => updateEntry(i, { dayOfWeek: Number(ev.target.value) })}
                        className="border border-slate-200 rounded px-1 py-1 text-xs"
                      >
                        {DAY_LABELS.slice(1).map((d, idx) => (
                          <option key={d} value={idx + 1}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      <input
                        value={e.startTime}
                        onChange={(ev) => updateEntry(i, { startTime: ev.target.value })}
                        className="border border-slate-200 rounded px-1 py-1 text-xs w-16"
                      />
                      {" – "}
                      <input
                        value={e.endTime}
                        onChange={(ev) => updateEntry(i, { endTime: ev.target.value })}
                        className="border border-slate-200 rounded px-1 py-1 text-xs w-16"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={e.subjectName}
                        onChange={(ev) => updateEntry(i, { subjectName: ev.target.value })}
                        className="border border-slate-200 rounded px-2 py-1 text-xs w-40"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        value={e.type}
                        onChange={(ev) => updateEntry(i, { type: ev.target.value })}
                        className="border border-slate-200 rounded px-1 py-1 text-xs"
                      >
                        {["Cours", "TD", "TP", "Examen"].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={e.room ?? e.mainRoom ?? ""}
                        onChange={(ev) => updateEntry(i, { room: ev.target.value || null })}
                        className="border border-slate-200 rounded px-2 py-1 text-xs w-24"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={e.sessionNumber ?? ""}
                        onChange={(ev) => updateEntry(i, { sessionNumber: ev.target.value || null })}
                        placeholder="16/22"
                        className="border border-slate-200 rounded px-2 py-1 text-xs w-16"
                      />
                      <div className="text-[10px] text-slate-400 mt-1">{e.sessionLabel ?? ""}</div>
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={e.teacher ?? ""}
                        onChange={(ev) => updateEntry(i, { teacher: ev.target.value })}
                        className="border border-slate-200 rounded px-2 py-1 text-xs w-32"
                      />
                    </td>
                    <td className="py-2">
                      <button onClick={() => removeEntry(i)} className="text-xs text-red-500 hover:underline">
                        Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold text-slate-800 mb-3">EDT actuellement actif</h2>
        {current.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun EDT importé pour le moment.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
              const dayEntries = current.filter((c) => c.day_of_week === day);
              if (dayEntries.length === 0) return null;
              return (
                <div key={day} className="border border-slate-100 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-500 mb-2">{DAY_LABELS[day]}</p>
                  {dayEntries.map((e) => (
                    <div key={e.id} className="text-xs mb-2">
                      <p className="font-medium">{e.subject_name}</p>
                      <p className="text-slate-400">
                        {e.start_time}–{e.end_time} · <Badge>{e.type}</Badge> {e.room ?? e.main_room ?? ""} {e.session_number ? `· ${e.session_number}` : ""}
                      </p>
                      {e.teacher && <p className="text-slate-400">{e.teacher}</p>}
                      {e.session_label && <p className="text-slate-400">{e.session_label}</p>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

import { useEffect, useState } from "react";
import { getNotes, createNote, updateNote, deleteNote, exportNoteToPdf } from "../api/client";
import type { Note } from "../types";
import { Card, PageHeader, Badge, Button } from "../components/ui";
import { Plus, Pin, Star, Trash2, FileDown } from "lucide-react";

const NOTE_TYPES = [
  "Libre",
  "Résumé",
  "Recherche",
  "Idée",
  "Checklist",
  "FicheRévision",
  "Journal",
  "Document",
];

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("Libre");
  const [folder, setFolder] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [folderFilter, setFolderFilter] = useState<string>("all");

  const load = async () => setNotes(await getNotes());

  useEffect(() => {
    load();
  }, []);

  const openNote = (n: Note) => {
    setSelected(n);
    setCreating(false);
    setTitle(n.title);
    setContent(n.content);
    setType(n.type);
    setFolder(n.folder ?? "");
    setTags(n.tags ?? "");
  };

  const startNew = () => {
    setSelected(null);
    setCreating(true);
    setTitle("");
    setContent("");
    setType("Libre");
    setFolder("");
    setTags("");
  };

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    if (creating) {
      const n = await createNote({ title, content, type, folder: folder || null, tags: tags || null });
      setNotes((prev) => [n, ...prev]);
      setSelected(n);
      setCreating(false);
    } else if (selected) {
      const n = await updateNote(selected.id, { title, content, type, folder: folder || null, tags: tags || null });
      setNotes((prev) => prev.map((x) => (x.id === n.id ? n : x)));
      setSelected(n);
    }
    setSaving(false);
  };

  const exportPdf = async () => {
    if (!selected) return;
    setExporting(true);
    try {
      const result = await exportNoteToPdf(selected.id);
      const apiBase = (import.meta as any).env?.VITE_API_URL || "http://localhost:4000/api";
      window.open(`${apiBase}${result.downloadUrl}`, "_blank");
    } finally {
      setExporting(false);
    }
  };

  const toggle = async (n: Note, field: "pinned" | "favorite") => {
    const updated = await updateNote(n.id, { [field]: !n[field] } as any);
    setNotes((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    if (selected?.id === updated.id) setSelected(updated);
  };

  const remove = async (id: number) => {
    await deleteNote(id);
    setNotes((prev) => prev.filter((x) => x.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  return (
    <div>
      <PageHeader
        title="Notebook"
        subtitle="Cours, résumés, recherches, idées, journal — tout dans un seul espace de notes."
        action={
          <Button onClick={startNew}>
            <Plus size={16} /> Nouvelle note
          </Button>
        }
      />

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-1 max-h-[70vh] overflow-y-auto">
          {(() => {
            const folders = Array.from(
              new Set(notes.map((n) => n.folder).filter((f): f is string => Boolean(f)))
            );
            if (folders.length === 0) return null;
            return (
              <select
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-full mb-2"
                value={folderFilter}
                onChange={(e) => setFolderFilter(e.target.value)}
              >
                <option value="all">Tous les dossiers</option>
                {folders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            );
          })()}
          {notes.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune note pour le moment.</p>
          ) : (
            <ul className="space-y-1">
              {notes
                .filter((n) => folderFilter === "all" || n.folder === folderFilter)
                .map((n) => (
                <li
                  key={n.id}
                  onClick={() => openNote(n)}
                  className={`p-2.5 rounded-lg cursor-pointer text-sm flex items-center justify-between gap-2 ${
                    selected?.id === n.id ? "bg-brand-50" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{n.title}</p>
                    <Badge>{n.type}</Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(n, "pinned");
                      }}
                    >
                      <Pin size={14} className={n.pinned ? "text-brand-600" : "text-slate-300"} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(n, "favorite");
                      }}
                    >
                      <Star size={14} className={n.favorite ? "text-amber-400" : "text-slate-300"} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="md:col-span-2">
          {!selected && !creating ? (
            <p className="text-sm text-slate-400 py-10 text-center">
              Sélectionne une note ou clique sur « Nouvelle note ».
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium"
                  placeholder="Titre de la note"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <select
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  {NOTE_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                  placeholder="Dossier (ex: Cours Python)"
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                />
                <input
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                  placeholder="Tags séparés par des virgules"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
              </div>
              <textarea
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[300px] font-mono"
                placeholder="Écris ici… (Markdown simple : #, ##, -, - [ ], > sont supportés à l'export PDF)"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <div className="flex justify-between items-center">
                {selected && (
                  <button onClick={() => remove(selected.id)} className="text-red-500 text-xs inline-flex items-center gap-1">
                    <Trash2 size={14} /> Supprimer
                  </button>
                )}
                <div className="ml-auto flex gap-2">
                  {selected && (
                    <Button variant="secondary" onClick={exportPdf} disabled={exporting}>
                      <FileDown size={15} /> {exporting ? "Export…" : "Exporter en PDF"}
                    </Button>
                  )}
                  <Button onClick={save} disabled={saving}>
                    {saving ? "Sauvegarde…" : "Sauvegarder"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

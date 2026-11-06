import { useEffect, useState } from "react";
import {
  getBookCatalog,
  createBook,
  getMyBooks,
  addBookToLibrary,
  updateUserBook,
  logReadingSession,
} from "../api/client";
import type { Book, UserBook } from "../types";
import { Card, PageHeader, Badge, Button } from "../components/ui";
import { Plus, Star, BookOpen } from "lucide-react";
import { localDateString } from "../lib/date";

const STATUS_LABEL: Record<string, string> = {
  ToRead: "À lire",
  Reading: "En cours",
  Completed: "Terminés",
  Abandoned: "Abandonnés",
};

export default function Bibliotheque() {
  const [tab, setTab] = useState<"catalog" | "mine">("mine");
  const [catalog, setCatalog] = useState<Book[]>([]);
  const [myBooks, setMyBooks] = useState<UserBook[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [language, setLanguage] = useState("Français");
  const [pages, setPages] = useState<number | "">("");
  const [sessionFormFor, setSessionFormFor] = useState<number | null>(null);
  const [sessionPages, setSessionPages] = useState(10);

  const loadCatalog = async () => setCatalog(await getBookCatalog());
  const loadMine = async () => setMyBooks(await getMyBooks(statusFilter === "all" ? undefined : statusFilter));

  useEffect(() => {
    loadCatalog();
  }, []);
  useEffect(() => {
    loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const book = await createBook({
      title,
      author: author || null,
      originalLanguage: language,
      editionLanguage: language,
      pages: pages === "" ? null : Number(pages),
    });
    await addBookToLibrary(book.id, "ToRead");
    setTitle("");
    setAuthor("");
    setPages("");
    setShowForm(false);
    loadCatalog();
    loadMine();
  };

  const changeStatus = async (ub: UserBook, status: string) => {
    await updateUserBook(ub.id, { status });
    loadMine();
  };

  const rate = async (ub: UserBook, rating: number) => {
    await updateUserBook(ub.id, { personalRating: rating });
    loadMine();
  };

  const submitSession = async (ub: UserBook) => {
    await logReadingSession(ub.id, localDateString(new Date()), sessionPages);
    setSessionFormFor(null);
    setSessionPages(10);
    loadMine();
  };

  return (
    <div>
      <PageHeader
        title="📚 Bibliothèque"
        subtitle="Catalogue général et bibliothèque personnelle, avec suivi de lecture."
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus size={16} /> Ajouter un livre
          </Button>
        }
      />

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setTab("mine")}
          className={`text-sm px-4 py-2 rounded-lg font-medium ${
            tab === "mine" ? "bg-brand-600 text-white" : "bg-white text-slate-500 border border-slate-200"
          }`}
        >
          Ma bibliothèque
        </button>
        <button
          onClick={() => setTab("catalog")}
          className={`text-sm px-4 py-2 rounded-lg font-medium ${
            tab === "catalog" ? "bg-brand-600 text-white" : "bg-white text-slate-500 border border-slate-200"
          }`}
        >
          Catalogue général
        </button>
      </div>

      {showForm && (
        <Card className="mb-5">
          <form onSubmit={submit} className="grid md:grid-cols-4 gap-3">
            <input
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm md:col-span-2"
              placeholder="Titre"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <input
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Auteur"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
            <input
              type="number"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Pages"
              value={pages}
              onChange={(e) => setPages(e.target.value ? Number(e.target.value) : "")}
            />
            <select
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option>Français</option>
              <option>English</option>
              <option>العربية</option>
              <option>Español</option>
              <option>Autre</option>
            </select>
            <div className="md:col-span-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button type="submit">Ajouter à ma bibliothèque</Button>
            </div>
          </form>
        </Card>
      )}

      {tab === "mine" ? (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {["all", "ToRead", "Reading", "Completed", "Abandoned"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-3 py-1.5 rounded-full border ${
                  statusFilter === s ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-500 border-slate-200"
                }`}
              >
                {s === "all" ? "Tous" : STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          {myBooks.length === 0 ? (
            <Card className="text-center py-10 text-slate-400 text-sm">Aucun livre dans cette catégorie.</Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {myBooks.map((ub) => (
                <Card key={ub.id}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-slate-800">{ub.book.title}</p>
                      <p className="text-xs text-slate-400">{ub.book.author}</p>
                      <div className="flex gap-1 mt-1">
                        <Badge>{STATUS_LABEL[ub.status]}</Badge>
                        {ub.book.edition_language && <Badge>{ub.book.edition_language}</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} onClick={() => rate(ub, n)}>
                          <Star
                            size={14}
                            className={(ub.personal_rating ?? 0) >= n ? "text-amber-400 fill-amber-400" : "text-slate-200"}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {ub.book.pages && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400" style={{ width: `${ub.progress * 100}%` }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Page {ub.current_page} / {ub.book.pages} · {Math.round(ub.progress * 100)}%
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 mt-3 flex-wrap">
                    {ub.status !== "Completed" && (
                      <>
                        <Button variant="secondary" onClick={() => setSessionFormFor(sessionFormFor === ub.id ? null : ub.id)}>
                          <BookOpen size={14} /> Session de lecture
                        </Button>
                        <Button variant="ghost" onClick={() => changeStatus(ub, "Completed")}>
                          Marquer terminé
                        </Button>
                      </>
                    )}
                  </div>

                  {sessionFormFor === ub.id && (
                    <div className="flex gap-2 mt-2 items-center">
                      <input
                        type="number"
                        className="border border-slate-200 rounded-lg px-2 py-1 text-sm w-24"
                        value={sessionPages}
                        onChange={(e) => setSessionPages(Number(e.target.value))}
                      />
                      <span className="text-xs text-slate-400">pages lues aujourd'hui</span>
                      <Button onClick={() => submitSession(ub)}>Enregistrer</Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {catalog.map((b) => (
            <Card key={b.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{b.title}</p>
                <p className="text-xs text-slate-400">
                  {b.author} {b.year ? `· ${b.year}` : ""} {b.pages ? `· ${b.pages}p` : ""}
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={async () => {
                  await addBookToLibrary(b.id, "ToRead");
                  loadMine();
                }}
              >
                + Ajouter
              </Button>
            </Card>
          ))}
          {catalog.length === 0 && <p className="text-sm text-slate-400">Catalogue vide pour le moment.</p>}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import {
  getMediaCatalog,
  createMediaItem,
  getMyMedia,
  addMediaToLibrary,
  updateUserMedia,
  getMediaRecommendations,
} from "../api/client";
import type { MediaItem, UserMedia } from "../types";
import { Card, PageHeader, Badge, Button } from "../components/ui";
import { Plus, Star } from "lucide-react";

const TYPES: Array<"Movie" | "Series" | "Anime"> = ["Movie", "Series", "Anime"];
const TYPE_LABEL: Record<string, string> = { Movie: "🎬 Films", Series: "📺 Séries", Anime: "🀄 Anime" };
const STATUS_LABEL: Record<string, string> = { Watchlist: "À voir", Watching: "En cours", Completed: "Terminés", Dropped: "Abandonnés" };

export default function Media() {
  const [type, setType] = useState<"Movie" | "Series" | "Anime">("Movie");
  const [tab, setTab] = useState<"mine" | "catalog" | "foryou">("mine");
  const [statusFilter, setStatusFilter] = useState("all");
  const [myMedia, setMyMedia] = useState<UserMedia[]>([]);
  const [catalog, setCatalog] = useState<MediaItem[]>([]);
  const [recs, setRecs] = useState<Array<MediaItem & { reason: string }>>([]);
  const [recsSource, setRecsSource] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [seasonsCount, setSeasonsCount] = useState<number | "">("");

  const loadMine = async () =>
    setMyMedia(await getMyMedia({ type, status: statusFilter === "all" ? undefined : statusFilter }));
  const loadCatalog = async () => setCatalog(await getMediaCatalog({ type }));
  const loadRecs = async () => {
    const r = await getMediaRecommendations(type);
    setRecs(r.recommendations);
    setRecsSource(r.source);
  };

  useEffect(() => {
    loadMine();
    loadCatalog();
    loadRecs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, statusFilter]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const item = await createMediaItem({
      type,
      title,
      year: year === "" ? null : Number(year),
      seasonsCount: type !== "Movie" ? (seasonsCount === "" ? null : Number(seasonsCount)) : null,
    });
    await addMediaToLibrary(item.id, "Watchlist");
    setTitle("");
    setYear("");
    setSeasonsCount("");
    setShowForm(false);
    loadCatalog();
    loadMine();
  };

  const changeStatus = async (um: UserMedia, status: string) => {
    await updateUserMedia(um.id, { status });
    loadMine();
  };

  const advanceEpisode = async (um: UserMedia) => {
    const nextEp = (um.current_episode ?? 0) + 1;
    await updateUserMedia(um.id, { currentEpisode: nextEp });
    loadMine();
  };

  const rate = async (um: UserMedia, rating: number) => {
    await updateUserMedia(um.id, { personalRating: rating });
    loadMine();
  };

  return (
    <div>
      <PageHeader
        title="🎬 Films / Séries / Anime"
        subtitle="Watchlist, progression des saisons, historique et notes personnelles."
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus size={16} /> Ajouter
          </Button>
        }
      />

      <div className="flex gap-2 mb-4">
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`text-sm px-4 py-2 rounded-lg font-medium ${
              type === t ? "bg-brand-600 text-white" : "bg-white text-slate-500 border border-slate-200"
            }`}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
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
              type="number"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Année"
              value={year}
              onChange={(e) => setYear(e.target.value ? Number(e.target.value) : "")}
            />
            {type !== "Movie" && (
              <input
                type="number"
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Nb saisons"
                value={seasonsCount}
                onChange={(e) => setSeasonsCount(e.target.value ? Number(e.target.value) : "")}
              />
            )}
            <div className="md:col-span-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button type="submit">Ajouter à ma watchlist</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setTab("mine")}
          className={`text-sm px-4 py-2 rounded-lg font-medium ${
            tab === "mine" ? "bg-brand-600 text-white" : "bg-white text-slate-500 border border-slate-200"
          }`}
        >
          Ma liste
        </button>
        <button
          onClick={() => setTab("catalog")}
          className={`text-sm px-4 py-2 rounded-lg font-medium ${
            tab === "catalog" ? "bg-brand-600 text-white" : "bg-white text-slate-500 border border-slate-200"
          }`}
        >
          Catalogue général
        </button>
        <button
          onClick={() => setTab("foryou")}
          className={`text-sm px-4 py-2 rounded-lg font-medium ${
            tab === "foryou" ? "bg-brand-600 text-white" : "bg-white text-slate-500 border border-slate-200"
          }`}
        >
          Pour toi
        </button>
      </div>

      {tab === "foryou" ? (
        <div>
          <p className="text-xs text-slate-400 mb-3">
            Source : {recsSource || "catalogue local uniquement"} — aucune base externe n'est connectée. Les suggestions
            croisent la popularité saisie et les genres des éléments que tu as bien notés (4 ou 5 étoiles).
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            {recs.map((m) => (
              <Card key={m.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{m.title}</p>
                  <p className="text-xs text-slate-400">{m.reason}</p>
                </div>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await addMediaToLibrary(m.id, "Watchlist");
                    loadMine();
                    loadRecs();
                  }}
                >
                  + Watchlist
                </Button>
              </Card>
            ))}
            {recs.length === 0 && (
              <p className="text-sm text-slate-400">
                Rien à recommander pour l'instant : ajoute des éléments au catalogue et note ceux que tu as aimés.
              </p>
            )}
          </div>
        </div>
      ) : tab === "mine" ? (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {["all", "Watchlist", "Watching", "Completed", "Dropped"].map((s) => (
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

          {myMedia.length === 0 ? (
            <Card className="text-center py-10 text-slate-400 text-sm">Rien dans cette catégorie.</Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {myMedia.map((um) => (
                <Card key={um.id}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-slate-800">{um.item.title}</p>
                      <p className="text-xs text-slate-400">
                        {um.item.year} {um.item.genres ? `· ${um.item.genres}` : ""}
                      </p>
                      <Badge>{STATUS_LABEL[um.status]}</Badge>
                    </div>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} onClick={() => rate(um, n)}>
                          <Star
                            size={14}
                            className={(um.personal_rating ?? 0) >= n ? "text-amber-400 fill-amber-400" : "text-slate-200"}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {um.item.type !== "Movie" && um.status !== "Completed" && (
                    <div className="mt-2 text-sm">
                      <p className="text-slate-500">
                        Saison {um.current_season} · Épisode {um.current_episode}
                        {um.item.episodes_count ? ` / ${um.item.episodes_count}` : ""}
                      </p>
                      {um.nextEpisodeLabel && (
                        <p className="text-xs text-brand-600 font-medium">Prochain : {um.nextEpisodeLabel}</p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 mt-3 flex-wrap">
                    {um.status === "Watchlist" && (
                      <Button variant="secondary" onClick={() => changeStatus(um, "Watching")}>
                        Commencer
                      </Button>
                    )}
                    {um.status === "Watching" && um.item.type !== "Movie" && (
                      <Button variant="secondary" onClick={() => advanceEpisode(um)}>
                        + Épisode suivant
                      </Button>
                    )}
                    {um.status !== "Completed" && (
                      <Button variant="ghost" onClick={() => changeStatus(um, "Completed")}>
                        Marquer terminé
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {catalog.map((m) => (
            <Card key={m.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{m.title}</p>
                <p className="text-xs text-slate-400">
                  {m.year} {m.genres ? `· ${m.genres}` : ""}
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={async () => {
                  await addMediaToLibrary(m.id, "Watchlist");
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

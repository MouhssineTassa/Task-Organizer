import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { globalSearch } from "../api/client";
import type { SearchResult } from "../api/client";
import { Card, PageHeader, Badge } from "../components/ui";

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const [results, setResults] = useState<SearchResult[]>([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    globalSearch(q)
      .then(setResults)
      .finally(() => setLoading(false));
  }, [q]);

  const types = Array.from(new Set(results.map((r) => r.type)));
  const shown = typeFilter === "all" ? results : results.filter((r) => r.type === typeFilter);

  return (
    <div>
      <PageHeader title="🔍 Recherche" subtitle={q ? `Résultats pour « ${q} »` : "Saisis au moins 2 caractères."} />
      {types.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {["all", ...types].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                typeFilter === t ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-500 border-slate-200"
              }`}
            >
              {t === "all" ? "Tout" : t}
            </button>
          ))}
        </div>
      )}
      {loading ? (
        <p className="text-sm text-slate-400">Recherche…</p>
      ) : shown.length === 0 ? (
        <Card className="text-center py-10 text-slate-400 text-sm">Aucun résultat.</Card>
      ) : (
        <div className="space-y-2">
          {shown.map((r, i) => (
            <Card key={`${r.type}-${r.id}-${i}`} className="flex items-center justify-between">
              <p className="text-sm font-medium">{r.title}</p>
              <div className="flex items-center gap-2">
                {r.extra && <span className="text-xs text-slate-400">{r.extra}</span>}
                <Badge>{r.type}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

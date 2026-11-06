import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  CheckSquare,
  GraduationCap,
  BookOpen,
  Clapperboard,
  Dumbbell,
  NotebookPen,
  FolderKanban,
  Target,
  TrendingUp,
  Sparkles,
  Settings,
  Inbox as InboxIcon,
  BarChart3,
  Search,
  Plus,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { addToInbox, createTask, createNote } from "../api/client";
import { useAuth } from "../components/AuthGate";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/planning", label: "Planning", icon: CalendarDays },
  { to: "/tasks", label: "Tâches", icon: CheckSquare },
  { to: "/etudes", label: "Études", icon: GraduationCap },
  { to: "/bibliotheque", label: "Bibliothèque", icon: BookOpen },
  { to: "/media", label: "Films / Séries / Anime", icon: Clapperboard },
  { to: "/sport", label: "Sport", icon: Dumbbell },
  { to: "/notes", label: "Notes", icon: NotebookPen },
  { to: "/projets", label: "Projets", icon: FolderKanban },
  { to: "/objectifs", label: "Objectifs", icon: Target },
  { to: "/progression", label: "Progression", icon: TrendingUp },
  { to: "/analytics", label: "Statistiques", icon: BarChart3 },
  { to: "/inbox", label: "Inbox", icon: InboxIcon },
  { to: "/assistant", label: "Assistant", icon: Sparkles },
  { to: "/parametres", label: "Paramètres", icon: Settings },
];

// Portails principaux visibles aussi dans la barre mobile (les autres restent dans le menu "Plus")
const MOBILE_PRIMARY = ["/", "/planning", "/tasks", "/notes"];

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [backendDown, setBackendDown] = useState(false);
  const { name: userName, logout } = useAuth();

  useEffect(() => {
    const onStatus = (e: Event) => setBackendDown(!(e as CustomEvent<{ online: boolean }>).detail.online);
    window.addEventListener("backend-status", onStatus);
    return () => window.removeEventListener("backend-status", onStatus);
  }, []);
  const [quickText, setQuickText] = useState("");
  const [quickKind, setQuickKind] = useState<"inbox" | "task" | "note">("inbox");
  const [quickDone, setQuickDone] = useState<string | null>(null);
  const navigate = useNavigate();

  const runSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const submitQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = quickText.trim();
    if (!text) return;
    if (quickKind === "task") await createTask({ title: text });
    else if (quickKind === "note") await createNote({ title: text.slice(0, 80), content: text });
    else await addToInbox(text);
    setQuickText("");
    setQuickDone(quickKind === "task" ? "Tâche ajoutée" : quickKind === "note" ? "Note ajoutée" : "Ajouté à l'Inbox");
    setTimeout(() => {
      setQuickDone(null);
      setQuickOpen(false);
    }, 900);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-5 border-b border-slate-100">
          <h1 className="text-lg font-bold text-brand-700">Personal Life OS</h1>
          <p className="text-xs text-slate-400 mt-0.5">Ton centre personnel</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700 border-r-2 border-brand-600"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-slate-500 truncate">{userName ?? "Connecté"}</span>
          <button onClick={logout} className="text-xs text-slate-500 hover:text-red-600 inline-flex items-center gap-1" title="Se déconnecter">
            <LogOut size={14} /> Quitter
          </button>
        </div>
      </aside>

      {/* Drawer mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white shadow-xl flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h1 className="text-lg font-bold text-brand-700">Personal Life OS</h1>
              <button onClick={() => setMobileOpen(false)} aria-label="Fermer le menu">
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-3">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-5 py-3 text-sm font-medium ${
                      isActive ? "bg-brand-50 text-brand-700" : "text-slate-600"
                    }`
                  }
                >
                  <item.icon size={18} />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-slate-100 px-5 py-3">
              <button onClick={logout} className="text-sm text-slate-600 inline-flex items-center gap-2">
                <LogOut size={16} /> Se déconnecter
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar mobile */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
          <button onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu">
            <Menu size={22} />
          </button>
          <h1 className="text-base font-bold text-brand-700">Personal Life OS</h1>
          <div className="w-6" />
        </header>

        {backendDown && (
          <div role="alert" className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm px-4 py-2.5">
            Le serveur local ne répond pas, donc tes données ne s'affichent pas. Lance-le (
            <code className="bg-amber-100 px-1 rounded">npm run dev</code> dans le dossier <code className="bg-amber-100 px-1 rounded">backend</code>) puis
            recharge la page. Tes données ne sont pas perdues.
          </div>
        )}

        <form onSubmit={runSearch} className="hidden md:flex items-center gap-2 px-8 pt-4">
          <div className="relative w-full max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher partout (tâches, notes, cours, livres…)"
              className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white"
            />
          </div>
        </form>

        <main className="flex-1 overflow-y-auto pb-28 md:pb-20">
          <div className="max-w-6xl mx-auto p-4 md:p-8">
            <Outlet />
          </div>
        </main>

        <button
          onClick={() => setQuickOpen(true)}
          aria-label="Ajout rapide"
          className="fixed right-5 bottom-20 md:bottom-6 z-40 w-12 h-12 rounded-full bg-brand-600 text-white shadow-lg flex items-center justify-center hover:bg-brand-700"
        >
          <Plus size={22} />
        </button>

        {quickOpen && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30" onClick={() => setQuickOpen(false)}>
            <form
              onSubmit={submitQuick}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full md:w-[420px] rounded-t-2xl md:rounded-2xl p-5 shadow-xl"
            >
              <p className="font-semibold text-slate-800 mb-3">Ajout rapide</p>
              <div className="flex gap-2 mb-3">
                {([
                  ["inbox", "Inbox"],
                  ["task", "Tâche"],
                  ["note", "Note"],
                ] as const).map(([k, label]) => (
                  <button
                    type="button"
                    key={k}
                    onClick={() => setQuickKind(k)}
                    className={`text-xs px-3 py-1.5 rounded-full border ${
                      quickKind === k ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-500 border-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                autoFocus
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                placeholder="Qu'est-ce que tu veux capturer ?"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-600">{quickDone ?? ""}</span>
                <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700">
                  Ajouter
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Bottom nav mobile */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around py-2 z-30">
          {NAV_ITEMS.filter((i) => MOBILE_PRIMARY.includes(i.to)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 text-[11px] px-2 ${
                  isActive ? "text-brand-600" : "text-slate-400"
                }`
              }
            >
              <item.icon size={20} />
              {item.label.split(" ")[0]}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

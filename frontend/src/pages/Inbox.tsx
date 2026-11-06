import { useEffect, useState } from "react";
import { getInbox, addToInbox, convertInboxItem, dismissInboxItem } from "../api/client";
import type { InboxItem } from "../api/client";
import { Card, PageHeader, Button } from "../components/ui";
import { CheckSquare, NotebookPen, X } from "lucide-react";

export default function Inbox() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [text, setText] = useState("");

  const load = async () => setItems(await getInbox());
  useEffect(() => {
    load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await addToInbox(text);
    setText("");
    load();
  };

  return (
    <div>
      <PageHeader
        title="📥 Inbox"
        subtitle="Capture sans choisir de catégorie — tu tries plus tard, quand tu veux."
      />
      <Card className="mb-5">
        <form onSubmit={add} className="flex gap-2">
          <input
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
            placeholder="Une idée, une tâche, un livre à lire, un film…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit">Capturer</Button>
        </form>
      </Card>

      {items.length === 0 ? (
        <Card className="text-center py-10 text-slate-400 text-sm">Inbox vide. Rien à trier.</Card>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <Card key={it.id} className="flex items-center justify-between gap-3">
              <p className="text-sm">{it.content}</p>
              <div className="flex gap-1 shrink-0">
                <button
                  title="Transformer en tâche"
                  onClick={async () => {
                    await convertInboxItem(it.id, "task");
                    load();
                  }}
                  className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-600"
                >
                  <CheckSquare size={16} />
                </button>
                <button
                  title="Transformer en note"
                  onClick={async () => {
                    await convertInboxItem(it.id, "note");
                    load();
                  }}
                  className="p-2 rounded-lg hover:bg-blue-50 text-blue-600"
                >
                  <NotebookPen size={16} />
                </button>
                <button
                  title="Écarter"
                  onClick={async () => {
                    await dismissInboxItem(it.id);
                    load();
                  }}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"
                >
                  <X size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

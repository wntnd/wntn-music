import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IconTrash, IconSend } from "@tabler/icons-react";
import { useAuth } from "../hooks/useAuth";
import { commentApi, type Comment } from "../lib/api";
import { useDialogs } from "./Dialogs";

export default function Comments({ trackId }: { trackId: string }) {
  const { user } = useAuth();
  const [list, setList] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { run } = useDialogs();

  const load = () => commentApi.list(trackId).then(setList).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const ok = await run(() => commentApi.add(trackId, text.trim()));
    setBusy(false);
    if (!ok) return;
    setText("");
    await load();
  };

  const remove = async (id: string) => {
    if (await run(() => commentApi.remove(id))) setList((l) => l.filter((c) => c.id !== id));
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs uppercase tracking-wide text-muted">
        комментарии · {list.length}
      </h2>

      {user ? (
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="написать комментарий…"
            maxLength={1000}
            className="flex-1 rounded-card border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy}
            aria-label="отправить"
            className="grid h-9 w-9 place-items-center rounded-card bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
          >
            <IconSend size={16} />
          </button>
        </form>
      ) : (
        <p className="text-sm text-muted">
          <Link to="/login" className="text-accent hover:underline">войди</Link>, чтобы комментировать
        </p>
      )}

      <div className="flex flex-col gap-3">
        {list.length === 0 ? (
          <p className="text-sm text-muted">пока тихо</p>
        ) : (
          list.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-xs font-medium">
                {(c.author || c.username).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{c.author || c.username}</span>{" "}
                  <span className="break-words text-text/90">{c.content}</span>
                </p>
              </div>
              {c.mine && (
                <button
                  onClick={() => remove(c.id)}
                  aria-label="удалить"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-accent"
                >
                  <IconTrash size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

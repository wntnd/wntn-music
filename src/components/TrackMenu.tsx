import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconDots,
  IconPlus,
  IconSearch,
  IconArrowBarToRight,
  IconPlaylist,
  IconMicrophone2,
  IconCheck,
  IconInfoCircle,
} from "@tabler/icons-react";
import { useAuth } from "../hooks/useAuth";
import { usePlayer } from "../hooks/usePlayer";
import { useDropUp } from "../hooks/useDropUp";
import { meApi, playlistApi, type PlaylistMeta } from "../lib/api";
import { slugify, trackPath, type Track } from "../lib/tracks";
import { useDialogs } from "./Dialogs";

/**
 * Per-track "…" menu: queue actions plus add-to-playlist with an inline filter
 * and a create-new row, so saving a track never needs a page change.
 */
export default function TrackMenu({ track }: { track: Track }) {
  const { user } = useAuth();
  const { addToQueue, playNext } = usePlayer();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistMeta[]>([]);
  const [filter, setFilter] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { anchorRef, placement } = useDropUp<HTMLDivElement>(open, picking ? 320 : 200);
  const { run } = useDialogs();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // own playlists are only needed once the submenu opens
  useEffect(() => {
    if (!picking || playlists.length) return;
    meApi
      .library()
      .then((l) => setPlaylists(l.playlists))
      .catch(() => {});
  }, [picking, playlists.length]);

  const close = () => {
    setOpen(false);
    setPicking(false);
    setFilter("");
    setAdded(null);
  };

  const addTo = async (playlistId: string) => {
    setBusy(true);
    const ok = await run(() => playlistApi.addTrack(playlistId, track.id));
    setBusy(false);
    if (!ok) return;
    setAdded(playlistId);
    setTimeout(close, 700);
  };

  const createAndAdd = async () => {
    const title = filter.trim() || `плейлист с ${track.title}`;
    setBusy(true);
    const created = await run(async () => {
      const { id } = await playlistApi.create({ title, isPublic: true });
      await playlistApi.addTrack(id, track.id);
      return id;
    }, `плейлист «${title}» создан`);
    setBusy(false);
    if (!created) return;
    setAdded(created);
    setTimeout(close, 700);
  };

  const shown = playlists.filter((p) =>
    p.title.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div ref={rootRef} className="relative">
      <div ref={anchorRef}>
        <button
          onClick={() => (open ? close() : setOpen(true))}
          aria-label="ещё"
          title="ещё"
          aria-haspopup="menu"
          aria-expanded={open}
          className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-text sm:h-8 sm:w-8"
        >
          <IconDots size={17} />
        </button>
      </div>

      {open && (
        <div
          role="menu"
          className={`absolute right-0 z-40 w-60 animate-dropdown-in overflow-hidden rounded-card border border-border bg-bg shadow-xl ${placement}`}
        >
          {picking ? (
            <div className="flex flex-col">
              <div className="relative border-b border-border">
                <IconSearch
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  autoFocus
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="найти плейлист"
                  className="w-full bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none"
                />
              </div>

              <button
                onClick={() => void createAndAdd()}
                disabled={busy}
                className="flex items-center gap-2.5 border-b border-border px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-hover disabled:opacity-50"
              >
                <IconPlus size={16} className="text-muted" />
                {filter.trim() ? `создать «${filter.trim()}»` : "новый плейлист"}
              </button>

              <div className="max-h-52 overflow-y-auto">
                {shown.length === 0 ? (
                  <p className="px-3 py-2.5 text-xs text-muted">плейлистов нет</p>
                ) : (
                  shown.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => void addTo(p.id)}
                      disabled={busy}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-hover disabled:opacity-50"
                    >
                      <span className="truncate">{p.title}</span>
                      {added === p.id && <IconCheck size={15} className="text-accent" />}
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {user && (
                <MenuRow icon={<IconPlaylist size={16} />} onClick={() => setPicking(true)}>
                  добавить в плейлист
                </MenuRow>
              )}
              <MenuRow
                icon={<IconArrowBarToRight size={16} />}
                onClick={() => {
                  playNext(track);
                  close();
                }}
              >
                играть следующим
              </MenuRow>
              <MenuRow
                icon={<IconPlus size={16} />}
                onClick={() => {
                  addToQueue(track);
                  close();
                }}
              >
                в очередь
              </MenuRow>
              <MenuRow
                icon={<IconInfoCircle size={16} />}
                onClick={() => {
                  close();
                  navigate(trackPath(track));
                }}
              >
                страница трека
              </MenuRow>
              <MenuRow
                icon={<IconMicrophone2 size={16} />}
                onClick={() => {
                  close();
                  navigate(`/artist/${slugify(track.author)}`);
                }}
              >
                к артисту
              </MenuRow>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuRow({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      className="flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-hover"
    >
      <span className="text-muted">{icon}</span>
      {children}
    </button>
  );
}

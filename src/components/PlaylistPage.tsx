import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  IconTrash,
  IconPlayerPlayFilled,
  IconPencil,
  IconLock,
  IconWorld,
  IconHeart,
  IconHeartFilled,
  IconChevronUp,
  IconChevronDown,
  IconPlus,
} from "@tabler/icons-react";
import { useAuth } from "../hooks/useAuth";
import { usePlayer } from "../hooks/usePlayer";
import { useTitle } from "../hooks/useTitle";
import { useGoLogin } from "../hooks/useGoLogin";
import { playlistApi, meApi } from "../lib/api";
import { useDialogs } from "./Dialogs";
import EditableImage from "./EditableImage";
import Checkbox from "./Checkbox";
import TrackRow from "./TrackRow";
import TrackMenu from "./TrackMenu";
import type { Track } from "../lib/tracks";

type Row = {
  id: string;
  title: string;
  cover: string | null;
  author?: string;
  song?: string | null;
};

export default function PlaylistPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { play, addToQueue } = usePlayer();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState<string | null>(null);
  const [plCover, setPlCover] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const goLogin = useGoLogin();
  const { run } = useDialogs();
  useTitle(title || null);

  useEffect(() => {
    if (!id) return;
    playlistApi
      .get(id)
      .then((p) => {
        setTitle(p.title);
        setDescription(p.description ?? null);
        setPlCover(p.cover);
        setIsPublic(p.isPublic);
        setOwnerId(p.userId);
        setSaved(p.saved);
        setRows(p.tracks);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "ошибка"));
  }, [id]);

  // the API returns the audio url per row, so no catalog fetch is needed
  const playable: Track[] = rows
    .filter((r) => r.song)
    .map((r) => ({
      id: r.id,
      title: r.title,
      author: r.author ?? "",
      cover: r.cover ?? "/covers/default.jpg",
      description: "",
      song: r.song as string,
    }));

  const remove = async (trackId: string) => {
    if (!id) return;
    if (await run(() => playlistApi.removeTrack(id, trackId)))
      setRows((rs) => rs.filter((r) => r.id !== trackId));
  };

  if (error) return <p className="font-mono text-sm text-accent">{error}</p>;
  const isOwner = Boolean(user && ownerId === user.id);
  const cover = plCover ?? rows[0]?.cover ?? "/covers/default.jpg";

  const toggleSave = async () => {
    if (!user) return goLogin();
    if (!id) return;
    setSaved((s) => !s);
    await playlistApi.toggleSave(id).catch(() => setSaved((s) => !s));
  };

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (!id || j < 0 || j >= rows.length) return;
    const previous = rows;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
    // optimistic: put the old order back if the server refuses it
    const ok = await run(() => playlistApi.reorder(id, next.map((r) => r.id)));
    if (!ok) setRows(previous);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end gap-4">
        <EditableImage
          src={cover}
          canEdit={isOwner}
          onPick={async (file) => {
            if (!id) return;
            const r = await playlistApi.uploadCover(id, file).catch(() => null);
            if (r) setPlCover(`${r.cover}?t=${Date.now()}`);
          }}
          className="h-32 w-32 shrink-0"
          label="сменить обложку"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted">
            {isPublic ? <IconWorld size={13} /> : <IconLock size={13} />}
            {isPublic ? "публичный плейлист" : "приватный плейлист"}
          </p>
          <h1 className="truncate font-display text-3xl">{title || "плейлист"}</h1>
          {description && <p className="max-w-lg text-sm text-muted">{description}</p>}
          <p className="text-sm text-muted">{rows.length} треков</p>
          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={() => playable[0] && play(playable[0], playable)}
              disabled={!playable.length}
              className="flex items-center gap-2 rounded-card bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              <IconPlayerPlayFilled size={16} /> слушать
            </button>
            {!isOwner && (
              <button
                onClick={() => void toggleSave()}
                data-saved={saved}
                aria-label={saved ? "убрать из сохранённых" : "сохранить плейлист"}
                className="grid h-11 w-11 place-items-center rounded-card border border-border bg-surface text-muted transition-colors hover:bg-surface-hover data-[saved=true]:text-accent"
              >
                {saved ? <IconHeartFilled size={18} /> : <IconHeart size={18} />}
              </button>
            )}
            {isOwner && (
              <button
                onClick={() => setEditing((e) => !e)}
                className="flex items-center gap-1.5 rounded-card border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-hover"
              >
                <IconPencil size={15} /> редактировать
              </button>
            )}
          </div>
        </div>
      </div>

      {isOwner && editing && id && (
        <EditPanel
          id={id}
          title={title}
          description={description}
          isPublic={isPublic}
          onSaved={(t, p, d) => {
            setTitle(t);
            setIsPublic(p);
            setDescription(d);
            setEditing(false);
          }}
          onCover={(c) => setPlCover(c)}
          onDeleted={() => navigate("/library")}
        />
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted">пусто</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r, i) => {
            const t = playable.find((x) => x.id === r.id);
            if (!t)
              return (
                <li key={r.id} className="flex items-center gap-3 rounded-md px-2 py-2 opacity-50">
                  <span className="w-5 text-right font-mono text-xs text-muted">{i + 1}</span>
                  <img
                    src={r.cover ?? "/covers/default.jpg"}
                    alt=""
                    className="h-10 w-10 rounded object-cover"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
                  <span className="text-xs text-muted">нет аудио</span>
                </li>
              );
            return (
              <TrackRow
                key={r.id}
                track={t}
                index={i}
                queue={playable}
                showPlays={false}
                right={
                  <>
                    {isOwner && (
                      <span className="hover-reveal flex flex-col transition-opacity">
                        <button
                          onClick={() => void move(i, -1)}
                          disabled={i === 0}
                          aria-label="выше"
                          className="grid h-4 w-6 place-items-center text-muted hover:text-text disabled:opacity-30"
                        >
                          <IconChevronUp size={13} />
                        </button>
                        <button
                          onClick={() => void move(i, 1)}
                          disabled={i === rows.length - 1}
                          aria-label="ниже"
                          className="grid h-4 w-6 place-items-center text-muted hover:text-text disabled:opacity-30"
                        >
                          <IconChevronDown size={13} />
                        </button>
                      </span>
                    )}
                    <button
                      onClick={() => addToQueue(t)}
                      aria-label="в очередь"
                      title="добавить в очередь"
                      className="hidden h-8 w-8 place-items-center rounded-full hover-reveal text-muted transition-opacity hover:bg-surface-hover hover:text-text sm:grid"
                    >
                      <IconPlus size={16} />
                    </button>
                    <TrackMenu track={t} />
                    {isOwner && (
                      <button
                        onClick={() => remove(r.id)}
                        aria-label="удалить"
                        className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-accent"
                      >
                        <IconTrash size={16} />
                      </button>
                    )}
                  </>
                }
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EditPanel({
  id,
  title,
  description,
  isPublic,
  onSaved,
  onCover,
  onDeleted,
}: {
  id: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  onSaved: (title: string, isPublic: boolean, description: string | null) => void;
  onCover: (cover: string) => void;
  onDeleted: () => void;
}) {
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftDescription, setDraftDescription] = useState(description ?? "");
  const [draftPublic, setDraftPublic] = useState(isPublic);
  const [status, setStatus] = useState<string | null>(null);
  const { confirm } = useDialogs();

  const save = async () => {
    if (!draftTitle.trim()) return;
    setStatus("сохранение…");
    try {
      const d = draftDescription.trim() || null;
      await meApi.renamePlaylist(id, {
        title: draftTitle.trim(),
        isPublic: draftPublic,
        description: d,
      });
      onSaved(draftTitle.trim(), draftPublic, d);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "ошибка");
    }
  };

  const uploadCover = async (file: File) => {
    setStatus("загрузка обложки…");
    try {
      const r = await playlistApi.uploadCover(id, file);
      onCover(`${r.cover}?t=${Date.now()}`);
      setStatus("обложка загружена ✓");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "ошибка");
    }
  };

  const removeAll = async () => {
    if (!(await confirm(`удалить плейлист «${title}»?`, "удалить"))) return;
    await playlistApi.remove(id).catch(() => {});
    onDeleted();
  };

  return (
    <div className="flex max-w-md flex-col gap-4 rounded-card border border-border bg-surface p-4">
      <section className="flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-wide text-muted">о плейлисте</h2>
        <input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          placeholder="название"
          className="rounded-card border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <textarea
          value={draftDescription}
          onChange={(e) => setDraftDescription(e.target.value)}
          placeholder="описание"
          rows={3}
          className="rounded-card border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <label className="w-fit cursor-pointer rounded-card border border-border px-3 py-1.5 text-sm hover:bg-surface-hover">
          загрузить обложку
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadCover(f);
              e.target.value = "";
            }}
          />
        </label>
        <Checkbox
          checked={!draftPublic}
          onChange={(v) => setDraftPublic(!v)}
          label="приватный — виден только мне"
          className="w-fit text-muted"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={() => void save()}
            className="w-fit rounded-card bg-text px-3 py-2 text-sm font-medium text-bg"
          >
            сохранить
          </button>
          {status && <span className="font-mono text-xs text-muted">{status}</span>}
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <h2 className="text-xs uppercase tracking-wide text-muted">опасная зона</h2>
        <button
          onClick={() => void removeAll()}
          className="flex w-fit items-center gap-1.5 rounded-card border border-accent/40 px-3 py-2 text-sm text-accent hover:bg-surface-hover"
        >
          <IconTrash size={15} /> удалить плейлист
        </button>
      </section>
    </div>
  );
}

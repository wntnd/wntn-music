import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  IconPlayerPlayFilled,
  IconChevronUp,
  IconChevronDown,
  IconHeart,
  IconHeartFilled,
  IconPlus,
} from "@tabler/icons-react";
import { albumApi, meApi, type AlbumDetail } from "../lib/api";
import { usePlayer } from "../hooks/usePlayer";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import { useGoLogin } from "../hooks/useGoLogin";
import type { Track } from "../lib/tracks";
import EditableImage from "./EditableImage";
import TrackRow from "./TrackRow";
import TrackMenu from "./TrackMenu";

const TYPE_RU: Record<string, string> = { album: "альбом", ep: "EP", single: "сингл" };

export default function AlbumPage() {
  const { id } = useParams();
  const { play, addToQueue } = usePlayer();
  const { user } = useAuth();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const goLogin = useGoLogin();
  useTitle(album ? `${album.title} — ${album.artistName}` : null);

  useEffect(() => {
    if (!id) return;
    setAlbum(null);
    albumApi
      .get(id)
      .then(setAlbum)
      .catch(() => setError("альбом не найден"));
  }, [id]);

  if (error)
    return (
      <div className="flex flex-col gap-2">
        <p className="font-mono text-sm text-accent">{error}</p>
        <Link to="/" className="text-sm text-accent hover:underline">← на главную</Link>
      </div>
    );
  if (!album) return <p className="font-mono text-sm text-muted">загрузка…</p>;

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= album.tracks.length) return;
    const order = album.tracks.map((t) => t.id);
    [order[i], order[j]] = [order[j], order[i]];
    const reordered = [...album.tracks];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    setAlbum({ ...album, tracks: reordered });
    await albumApi.reorder(album.id, order).catch(() => {});
  };

  const toggleSave = async () => {
    if (!user) return goLogin();
    setAlbum({ ...album, saved: !album.saved });
    await meApi.toggleSavedAlbum(album.id).catch(() => setAlbum(album));
  };

  const playable: Track[] = album.tracks
    .filter((t) => t.song)
    .map((t) => ({
      id: t.id,
      title: t.title,
      author: album.artistName,
      cover: t.cover ?? album.cover ?? "/covers/default.jpg",
      description: "",
      song: t.song as string,
      plays: t.plays,
    }));

  const year = album.releaseDate?.slice(0, 4) ?? album.year;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end gap-4">
        <EditableImage
          src={album.cover}
          canEdit={album.canManage}
          onPick={async (file) => {
            const r = await albumApi.uploadCover(album.id, file).catch(() => null);
            if (r) setAlbum({ ...album, cover: `${r.cover}?t=${Date.now()}` });
          }}
          className="h-36 w-36 shrink-0"
          label="сменить обложку"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs uppercase tracking-wide text-muted">
            {TYPE_RU[album.type] ?? album.type}
            {year && ` · ${year}`}
          </p>
          <h1 className="truncate font-display text-3xl">{album.title}</h1>
          <Link
            to={`/artist/${album.artistSlug}`}
            className="text-sm text-muted hover:underline"
          >
            {album.artistName}
          </Link>
          {album.releaseDate && (
            <p className="text-xs text-muted">
              релиз: {new Date(album.releaseDate).toLocaleDateString("ru")}
            </p>
          )}
          {album.genres.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {album.genres.map((g) => (
                <span
                  key={g}
                  className="rounded-card border border-border bg-surface px-2 py-0.5 text-xs text-muted"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => playable[0] && play(playable[0], playable)}
              disabled={!playable.length}
              className="flex w-fit items-center gap-2 rounded-card bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              <IconPlayerPlayFilled size={16} /> слушать
            </button>
            <button
              onClick={() => void toggleSave()}
              data-saved={album.saved}
              aria-label={album.saved ? "убрать из сохранённых" : "сохранить альбом"}
              className="grid h-11 w-11 place-items-center rounded-card border border-border bg-surface text-muted transition-colors hover:bg-surface-hover data-[saved=true]:text-accent"
            >
              {album.saved ? <IconHeartFilled size={18} /> : <IconHeart size={18} />}
            </button>
          </div>
        </div>
      </div>

      {album.description && (
        <p className="max-w-2xl whitespace-pre-wrap text-sm text-muted">{album.description}</p>
      )}
      {album.copyright && <p className="text-xs text-muted">{album.copyright}</p>}

      {album.tracks.length === 0 ? (
        <p className="text-sm text-muted">треков пока нет</p>
      ) : (
        <ul className="flex flex-col">
          {album.tracks.map((t, i) => {
            const pt = playable.find((x) => x.id === t.id);
            // a track with no uploaded audio still belongs in the listing
            if (!pt)
              return (
                <li key={t.id} className="flex items-center gap-3 rounded-md px-2 py-2 opacity-50">
                  <span className="w-5 text-right font-mono text-xs text-muted">
                    {t.trackNumber ?? i + 1}
                  </span>
                  <img
                    src={t.cover ?? album.cover ?? "/covers/default.jpg"}
                    alt=""
                    className="h-10 w-10 rounded object-cover"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  <span className="text-xs text-muted">нет аудио</span>
                </li>
              );
            return (
              <TrackRow
                key={t.id}
                track={pt}
                index={i}
                number={t.trackNumber ?? i + 1}
                queue={playable}
                subtitle={album.artistName}
                right={
                  <>
                    {t.explicit && (
                      <span
                        title="explicit"
                        className="rounded border border-border px-1 font-mono text-[10px] text-muted"
                      >
                        E
                      </span>
                    )}
                    <button
                      onClick={() => addToQueue(pt)}
                      aria-label="в очередь"
                      title="добавить в очередь"
                      className="hidden h-8 w-8 place-items-center rounded-full hover-reveal text-muted transition-opacity hover:bg-surface-hover hover:text-text sm:grid"
                    >
                      <IconPlus size={16} />
                    </button>
                    <TrackMenu track={pt} />
                    {album.canManage && (
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
                          disabled={i === album.tracks.length - 1}
                          aria-label="ниже"
                          className="grid h-4 w-6 place-items-center text-muted hover:text-text disabled:opacity-30"
                        >
                          <IconChevronDown size={13} />
                        </button>
                      </span>
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

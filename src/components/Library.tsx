import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IconPlus, IconX, IconLock, IconMusic } from "@tabler/icons-react";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import { useGoLogin } from "../hooks/useGoLogin";
import type { Track } from "../lib/tracks";
import {
  meApi,
  playlistApi,
  type PlaylistMeta,
  type FollowedArtist,
  type SavedAlbum,
  type SavedPlaylist,
} from "../lib/api";
import TrackGrid, { GridSkeleton } from "./TrackGrid";
import ArtistAvatar from "./ArtistAvatar";
import Checkbox from "./Checkbox";
import { useDialogs } from "./Dialogs";

export default function Library() {
  const { user, loading: authLoading } = useAuth();
  const goLogin = useGoLogin();
  useTitle("библиотека");
  const [likedTracks, setLikedTracks] = useState<Track[]>([]);
  const [libLoading, setLibLoading] = useState(true);
  const [playlists, setPlaylists] = useState<PlaylistMeta[]>([]);
  const [following, setFollowing] = useState<FollowedArtist[]>([]);
  const [savedAlbums, setSavedAlbums] = useState<SavedAlbum[]>([]);
  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylist[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newPublic, setNewPublic] = useState(true);
  const { confirm, run } = useDialogs();

  useEffect(() => {
    if (!authLoading && !user) goLogin({ replace: true });
  }, [authLoading, user, goLogin]);

  useEffect(() => {
    if (user)
      meApi
        .library()
        .then((l) => {
          setPlaylists(l.playlists);
          setFollowing(l.following);
          setSavedAlbums(l.savedAlbums);
          setSavedPlaylists(l.savedPlaylists);
          // likes arrive with their audio url, so no catalog fetch is needed
          setLikedTracks(
            l.likes
              .filter((t) => t.song)
              .map((t) => ({
                id: t.id,
                title: t.title,
                author: t.author ?? "",
                cover: t.cover ?? "/covers/default.jpg",
                description: "",
                song: t.song as string,
                plays: t.plays,
              })),
          );
        })
        .catch(() => {})
        .finally(() => setLibLoading(false));
  }, [user]);

  if (authLoading || !user) return null;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const created = await run(
      () => playlistApi.create({ title: newTitle.trim(), isPublic: newPublic }),
      `плейлист «${newTitle.trim()}» создан`,
    );
    if (!created) return;
    setPlaylists((p) => [
      ...p,
      { id: created.id, title: newTitle.trim(), cover: null, isPublic: newPublic },
    ]);
    setNewTitle("");
  };

  const removePlaylist = async (id: string, title: string) => {
    if (!(await confirm(`удалить плейлист «${title}»?`, "удалить"))) return;
    if (await run(() => playlistApi.remove(id), "плейлист удалён"))
      setPlaylists((p) => p.filter((x) => x.id !== id));
  };

  return (
    <div className="flex animate-fade-up flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl">плейлисты</h2>
        <form onSubmit={create} className="flex flex-wrap items-center gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="новый плейлист"
            className="min-w-0 flex-1 rounded-card border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent"
          />
          <Checkbox
            checked={!newPublic}
            onChange={(v) => setNewPublic(!v)}
            label="приватный"
            className="rounded-card border border-border bg-surface px-3 py-2 text-muted transition-colors hover:bg-surface-hover"
          />
          <button
            type="submit"
            className="flex items-center gap-1 rounded-card bg-text px-3 py-2 text-sm font-medium text-bg transition-transform active:scale-95"
          >
            <IconPlus size={16} /> создать
          </button>
        </form>

        {playlists.length === 0 ? (
          <p className="text-sm text-muted">пока пусто</p>
        ) : (
          <CardGrid>
            {playlists.map((p) => (
              <CoverCard
                key={p.id}
                to={`/playlist/${p.id}`}
                cover={p.cover}
                title={p.title}
                subtitle={p.isPublic ? "публичный" : "приватный"}
                badge={!p.isPublic ? <IconLock size={12} /> : undefined}
                onRemove={() => void removePlaylist(p.id, p.title)}
              />
            ))}
          </CardGrid>
        )}
      </section>

      {savedPlaylists.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl">сохранённые плейлисты</h2>
          <CardGrid>
            {savedPlaylists.map((p) => (
              <CoverCard
                key={p.id}
                to={`/playlist/${p.id}`}
                cover={p.cover}
                title={p.title}
                subtitle={`@${p.ownerUsername}`}
              />
            ))}
          </CardGrid>
        </section>
      )}

      {savedAlbums.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl">сохранённые альбомы</h2>
          <CardGrid>
            {savedAlbums.map((al) => (
              <CoverCard
                key={al.id}
                to={`/album/${al.id}`}
                cover={al.cover}
                title={al.title}
                subtitle={al.artistName}
              />
            ))}
          </CardGrid>
        </section>
      )}

      {following.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl">подписки</h2>
          <div className="flex flex-wrap gap-4">
            {following.map((a) => (
              <Link
                key={a.slug}
                to={`/artist/${a.slug}`}
                viewTransition
                className="group flex w-24 flex-col items-center gap-2 text-center"
              >
                <ArtistAvatar
                  src={a.avatar}
                  name={a.name}
                  className="transition-transform group-hover:scale-105"
                />
                <span className="w-full truncate text-sm font-medium group-hover:underline">
                  {a.name}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl">лайки</h2>
        {libLoading ? (
          <GridSkeleton />
        ) : likedTracks.length ? (
          <TrackGrid tracks={likedTracks} />
        ) : (
          <p className="text-sm text-muted">пока нет лайкнутых треков</p>
        )}
      </section>
    </div>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {children}
    </div>
  );
}

function CoverCard({
  to,
  cover,
  title,
  subtitle,
  badge,
  onRemove,
}: {
  to: string;
  cover: string | null;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  onRemove?: () => void;
}) {
  return (
    <div className="group relative flex animate-fade-up flex-col rounded-card bg-surface p-2 transition-all duration-200 hover:-translate-y-1 hover:bg-surface-hover">
      <Link to={to} viewTransition className="flex flex-col">
        <div className="relative aspect-square overflow-hidden rounded-md bg-bg">
          {cover ? (
            <img
              src={cover}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.src.endsWith("/covers/default.jpg")) img.src = "/covers/default.jpg";
              }}
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-muted">
              <IconMusic size={32} />
            </span>
          )}
          {badge && (
            <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-bg/80 text-muted backdrop-blur">
              {badge}
            </span>
          )}
        </div>
        <div className="px-1 pt-2">
          <p className="truncate text-sm font-medium group-hover:underline">{title}</p>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
      </Link>
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label="удалить"
          title="удалить"
          className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-bg/80 hover-reveal text-muted backdrop-blur transition-all hover:text-accent"
        >
          <IconX size={15} />
        </button>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  IconId,
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconUser,
  IconWorld,
  IconBrandTelegram,
  IconBrandInstagram,
  IconBrandX,
  IconBrandYoutube,
  IconPlus,
} from "@tabler/icons-react";
import { useTracks } from "../hooks/useTracks";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import { useGoLogin } from "../hooks/useGoLogin";
import { usePlayer } from "../hooks/usePlayer";
import { plural, trackPath, type Track } from "../lib/tracks";
import ArtistAvatar from "./ArtistAvatar";
import { artistApi, type ArtistProfile } from "../lib/api";
import { GridSkeleton } from "./TrackGrid";
import FollowButton from "./FollowButton";
import LikeButton from "./LikeButton";
import TrackMenu from "./TrackMenu";
import TrackRow from "./TrackRow";

const ALBUM_TYPE_RU: Record<string, string> = { album: "альбом", ep: "EP", single: "сингл" };

function linkIcon(url: string) {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (host.includes("t.me") || host.includes("telegram")) return <IconBrandTelegram size={16} />;
  if (host.includes("instagram")) return <IconBrandInstagram size={16} />;
  if (host.includes("x.com") || host.includes("twitter")) return <IconBrandX size={16} />;
  if (host.includes("youtube")) return <IconBrandYoutube size={16} />;
  return <IconWorld size={16} />;
}

export default function ArtistPage() {
  const { slug } = useParams();
  // only this artist's tracks are fetched, and they page in as you scroll
  const {
    tracks: mine,
    total,
    loading,
    loadingMore,
    hasMore,
    sentinelRef,
  } = useTracks({ artist: slug });
  const { play, addToQueue, current, isPlaying, toggle } = usePlayer();
  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  useTitle(profile?.name ?? slug ?? null);

  useEffect(() => {
    if (slug) artistApi.get(slug).then(setProfile).catch(() => setProfile(null));
  }, [slug]);

  const name = profile?.name ?? mine[0]?.author ?? slug;
  const popular = [...mine].sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0)).slice(0, 5);
  const albums = profile?.albums ?? [];
  // Newest *release*. Sorting by id put a random album in the slot — ids are
  // uuids, so "newest" was whatever happened to sort last.
  const latest = [...albums].sort((a, b) => {
    const at = a.releaseDate ?? (a.year ? `${a.year}-01-01` : "");
    const bt = b.releaseDate ?? (b.year ? `${b.year}-01-01` : "");
    return bt.localeCompare(at);
  })[0];
  const playingHere = current && mine.some((t) => t.id === current.id);

  const playAll = () => {
    if (playingHere) return toggle();
    const first = popular[0] ?? mine[0];
    if (first) play(first, mine);
  };

  return (
    <div className="flex animate-fade-up flex-col gap-8">
      <header className="flex flex-col items-center gap-5 sm:flex-row sm:items-end">
        <ArtistAvatar
          src={profile?.avatar}
          name={name ?? "?"}
          size="h-40 w-40"
          text="text-5xl"
          className="vt-cover shadow-lg"
        />

        <div className="flex min-w-0 flex-col items-center gap-3 sm:items-start">
          <p className="text-xs uppercase tracking-wide text-muted">исполнитель</p>
          <h1 className="text-center font-display text-4xl leading-tight sm:text-left">{name}</h1>

          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted sm:justify-start">
            <span className="flex items-center gap-1 rounded-card border border-border bg-surface px-2 py-1">
              <IconUser size={13} /> {profile?.followerCount ?? 0}{" "}
              {plural(profile?.followerCount ?? 0, "подписчик", "подписчика", "подписчиков")}
            </span>
            {/* the catalog pages in, so the loaded slice is not the count */}
            <span className="rounded-card border border-border bg-surface px-2 py-1">
              {total || mine.length}{" "}
              {plural(total || mine.length, "трек", "трека", "треков")}
            </span>
            {profile?.genres?.map((g) => (
              <span key={g} className="rounded-card border border-border bg-surface px-2 py-1">
                {g}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <button
              onClick={playAll}
              disabled={!mine.length}
              className="flex items-center gap-2 rounded-card bg-accent px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-accent-hover active:scale-95 disabled:opacity-50"
            >
              {playingHere && isPlaying ? (
                <>
                  <IconPlayerPauseFilled size={16} /> пауза
                </>
              ) : (
                <>
                  <IconPlayerPlayFilled size={16} /> слушать
                </>
              )}
            </button>
            {profile && (
              <FollowButton
                artistId={profile.id}
                initialFollowing={profile.isFollowing}
                initialCount={profile.followerCount}
              />
            )}
            {profile?.links?.map((l) => (
              <a
                key={l}
                href={l}
                target="_blank"
                rel="noreferrer"
                title={l}
                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-muted transition-all hover:bg-surface-hover hover:text-text active:scale-95"
              >
                {linkIcon(l)}
              </a>
            ))}
          </div>

          {profile?.bio && <p className="max-w-lg text-sm text-muted">{profile.bio}</p>}
          {profile?.claimable && <ClaimControl slug={profile.slug} pending={profile.pendingClaim} />}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl">популярные треки</h2>
          {loading ? (
            <GridSkeleton />
          ) : (
            <ul className="flex flex-col">
              {popular.map((t, i) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  index={i}
                  queue={mine}
                  right={
                    <>
                      <button
                        onClick={() => addToQueue(t)}
                        aria-label="в очередь"
                        title="добавить в очередь"
                        className="hidden h-8 w-8 place-items-center rounded-full hover-reveal text-muted transition-all hover:bg-surface-hover hover:text-text sm:grid"
                      >
                        <IconPlus size={16} />
                      </button>
                      <LikeButton trackId={t.id} size={16} />
                      <TrackMenu track={t} />
                    </>
                  }
                />
              ))}
            </ul>
          )}
        </section>

        {latest && (
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl">новый релиз</h2>
            <Link
              to={`/album/${latest.id}`}
              viewTransition
              className="group flex flex-col gap-2"
            >
              <img
                src={latest.cover ?? "/covers/default.jpg"}
                alt=""
                className="aspect-square w-full rounded-card object-cover transition-transform group-hover:-translate-y-1"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (!img.src.endsWith("/covers/default.jpg")) img.src = "/covers/default.jpg";
                }}
              />
              <div>
                <p className="truncate text-sm font-medium group-hover:underline">{latest.title}</p>
                <p className="truncate text-xs text-muted">
                  {name}
                  {latest.type ? ` · ${ALBUM_TYPE_RU[latest.type] ?? latest.type}` : ""}
                </p>
              </div>
            </Link>
          </section>
        )}
      </div>

      {albums.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl">альбомы</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {albums.map((al) => (
              <Link
                key={al.id}
                to={`/album/${al.id}`}
                viewTransition
                className="group flex flex-col rounded-card bg-surface p-2 transition-all hover:-translate-y-1 hover:bg-surface-hover"
              >
                <img
                  src={al.cover ?? "/covers/default.jpg"}
                  alt=""
                  className="aspect-square w-full rounded-md object-cover"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (!img.src.endsWith("/covers/default.jpg")) img.src = "/covers/default.jpg";
                  }}
                />
                <p className="truncate px-1 pt-2 text-sm font-medium group-hover:underline">
                  {al.title}
                </p>
                <p className="truncate px-1 text-xs text-muted">
                  {ALBUM_TYPE_RU[al.type ?? "album"] ?? al.type}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl">все треки</h2>
        {loading ? <GridSkeleton /> : <TrackRows tracks={mine} queue={mine} />}
        {hasMore && (
          <div ref={sentinelRef} className="py-2 text-center text-xs text-muted">
            {loadingMore ? "загрузка…" : ""}
          </div>
        )}
      </section>

      {(profile?.featuredOn?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl">участие в треках</h2>
          <ul className="flex flex-col">
            {profile!.featuredOn.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface"
              >
                <img
                  src={t.cover ?? "/covers/default.jpg"}
                  alt=""
                  className="h-10 w-10 rounded object-cover"
                />
                <Link
                  to={trackPath(t)}
                  viewTransition
                  className="flex-1 truncate text-sm hover:underline"
                >
                  {t.title}
                </Link>
                <span className="truncate text-xs text-muted">{t.author}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TrackRows({ tracks, queue }: { tracks: Track[]; queue: Track[] }) {
  const { addToQueue } = usePlayer();
  if (!tracks.length) return <p className="text-sm text-muted">треков пока нет</p>;

  return (
    <ul className="flex flex-col">
      {tracks.map((t, i) => (
        <TrackRow
          key={t.id}
          track={t}
          index={i}
          queue={queue}
          showPlays={false}
          right={
            <>
              <button
                onClick={() => addToQueue(t)}
                aria-label="в очередь"
                title="добавить в очередь"
                className="hidden h-8 w-8 place-items-center rounded-full hover-reveal text-muted transition-all hover:bg-surface-hover hover:text-text sm:grid"
              >
                <IconPlus size={16} />
              </button>
              <LikeButton trackId={t.id} size={16} />
              <TrackMenu track={t} />
            </>
          }
        />
      ))}
    </ul>
  );
}

function ClaimControl({ slug, pending }: { slug: string; pending: boolean }) {
  const { user } = useAuth();
  const goLogin = useGoLogin();
  const [sent, setSent] = useState(pending);
  const [error, setError] = useState<string | null>(null);

  if (sent)
    return (
      <p className="animate-fade-in font-mono text-xs text-muted">
        запрос на владение отправлен — ждёт модерации
      </p>
    );

  const request = async () => {
    if (!user) return goLogin();
    try {
      await artistApi.requestClaim(slug);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ошибка");
    }
  };

  return (
    <div key={error ?? "ok"} className={"flex flex-col gap-1 " + (error ? "animate-shake" : "")}>
      <button
        onClick={request}
        className="flex w-fit items-center gap-1.5 rounded-card border border-accent/40 bg-surface px-3 py-1.5 text-sm font-medium text-accent transition-all hover:bg-surface-hover active:scale-95"
      >
        <IconId size={16} /> это я — запросить доступ
      </button>
      {error && <p className="font-mono text-xs text-accent">{error}</p>}
    </div>
  );
}

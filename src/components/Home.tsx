import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconPlus,
  IconMusic,
} from "@tabler/icons-react";
import { useTracks } from "../hooks/useTracks";
import { usePlayer } from "../hooks/usePlayer";
import {
  homeApi,
  type HomeArtist,
  type HomeAlbum,
  type HomePlaylist,
  type HomePopularTrack,
} from "../lib/api";
import { plural, toTrack, trackPath, type Track } from "../lib/tracks";
import ArtistAvatar from "./ArtistAvatar";
import { useTitle } from "../hooks/useTitle";
import TrackGrid, { GridSkeleton } from "./TrackGrid";
import TrackMenu from "./TrackMenu";
import TrackRow from "./TrackRow";

const ALBUM_TYPE_RU: Record<string, string> = { album: "альбом", ep: "EP", single: "сингл" };
const NEW_RELEASE_DAYS = 30;

const isNewRelease = (releaseDate: string | null) => {
  if (!releaseDate) return false;
  const ms = Date.now() - new Date(releaseDate).getTime();
  return ms >= 0 && ms < NEW_RELEASE_DAYS * 24 * 60 * 60 * 1000;
};

export default function Home() {
  // filtering re-queries the server, so a chip isn't limited to the loaded page
  const [artist, setArtist] = useState<string | null>(null);
  // the catalog grid pages in as you scroll; the rails come from /api/home
  const { tracks, total, loading, loadingMore, hasMore, error, sentinelRef } = useTracks({
    artist: artist ?? undefined,
  });
  const [artists, setArtists] = useState<HomeArtist[]>([]);
  const [albums, setAlbums] = useState<HomeAlbum[]>([]);
  const [playlists, setPlaylists] = useState<HomePlaylist[]>([]);
  const [popular, setPopular] = useState<HomePopularTrack[]>([]);
  const [stats, setStats] = useState({ tracks: 0, artists: 0, albums: 0 });
  useTitle(null);

  useEffect(() => {
    homeApi
      .get()
      .then((h) => {
        setArtists(h.artists);
        setAlbums(h.albums);
        setPlaylists(h.playlists);
        setPopular(h.popular ?? []);
        setStats(h.stats ?? { tracks: 0, artists: 0, albums: 0 });
      })
      .catch(() => {});
  }, []);

  const newReleases = albums.filter((a) => isNewRelease(a.releaseDate));
  // anything already sitting in "новые релизы" would otherwise appear twice
  const olderAlbums = albums.filter((a) => !isNewRelease(a.releaseDate));
  const popularTracks: Track[] = popular
    .filter((t) => t.song)
    .map((t) => toTrack({ ...t, song: t.song }));

  if (error) return <p className="font-mono text-sm text-accent">не загрузилось: {error}</p>;

  return (
    <div className="flex flex-col gap-10">
      <Hero popular={popularTracks} stats={stats} />

      {artists.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl">наши артисты</h2>
          <div className="flex gap-4 overflow-x-auto pb-1">
            {artists.map((a) => (
              <Link
                key={a.id}
                to={`/artist/${a.slug}`}
                viewTransition
                className="group flex w-24 shrink-0 animate-fade-up flex-col items-center gap-2 text-center"
              >
                <ArtistAvatar
                  src={a.avatar}
                  name={a.name}
                  className="transition-transform group-hover:scale-105"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium group-hover:underline">{a.name}</p>
                  <p className="text-xs text-muted">
                    {a.trackCount} {plural(a.trackCount, "трек", "трека", "треков")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {popularTracks.length > 0 && (
        <PopularRail tracks={popularTracks} />
      )}

      {newReleases.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl">новые релизы</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {newReleases.map((al) => (
              <AlbumCard key={al.id} album={al} isNew />
            ))}
          </div>
        </section>
      )}

      {olderAlbums.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl">альбомы</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {olderAlbums.map((al) => (
              <AlbumCard key={al.id} album={al} />
            ))}
          </div>
        </section>
      )}

      {playlists.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl">плейлисты</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {playlists.map((p) => (
              <Link
                key={p.id}
                to={`/playlist/${p.id}`}
                viewTransition
                className="group flex animate-fade-up flex-col rounded-card bg-surface p-2 transition-all duration-200 hover:-translate-y-1 hover:bg-surface-hover"
              >
                <div className="aspect-square overflow-hidden rounded-md bg-bg">
                  {p.cover ? (
                    <img
                      src={p.cover}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (!img.src.endsWith("/covers/default.jpg"))
                          img.src = "/covers/default.jpg";
                      }}
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-muted">
                      <IconMusic size={28} />
                    </span>
                  )}
                </div>
                <div className="px-1 pt-2">
                  <p className="truncate text-sm font-medium group-hover:underline">{p.title}</p>
                  {p.description && (
                    <p className="truncate text-xs text-muted">{p.description}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="font-display text-xl">все треки</h2>
          {total > 0 && <span className="text-sm text-muted">{total}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip label="всё" active={artist === null} onClick={() => setArtist(null)} />
          {artists.map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              active={artist === a.slug}
              onClick={() => setArtist(a.slug)}
            />
          ))}
        </div>
        {loading ? <GridSkeleton /> : <TrackGrid tracks={tracks} />}

        {/* scrolling near this element pulls the next page */}
        {hasMore && (
          <div ref={sentinelRef} className="py-4">
            {loadingMore && <GridSkeleton />}
          </div>
        )}
      </section>
    </div>
  );
}

function Hero({
  popular,
  stats,
}: {
  popular: Track[];
  stats: { tracks: number; artists: number; albums: number };
}) {
  const { play, current, isPlaying, toggle } = usePlayer();
  const lead = popular[0];
  const playingLead = lead && current?.id === lead.id;

  return (
    <section className="relative overflow-hidden rounded-card border border-border bg-surface">
      {lead && (
        <img
          src={lead.cover}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl"
        />
      )}
      <div className="relative flex flex-col gap-5 p-6 sm:p-8 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-3xl leading-tight sm:text-4xl">
            wntn<span className="text-accent">.</span>music
          </h1>
          <p className="max-w-md text-sm text-muted">
            музыка своих — треки, альбомы и плейлисты, которые мы делаем сами
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <span className="rounded-card border border-border bg-bg/60 px-2 py-1">
              {stats.tracks} {plural(stats.tracks, "трек", "трека", "треков")}
            </span>
            <span className="rounded-card border border-border bg-bg/60 px-2 py-1">
              {stats.artists} {plural(stats.artists, "артист", "артиста", "артистов")}
            </span>
            <span className="rounded-card border border-border bg-bg/60 px-2 py-1">
              {stats.albums} {plural(stats.albums, "альбом", "альбома", "альбомов")}
            </span>
          </div>
          {lead && (
            <button
              onClick={() => (playingLead ? toggle() : play(lead, popular))}
              className="mt-1 flex w-fit items-center gap-2 rounded-card bg-accent px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-accent-hover active:scale-95"
            >
              {playingLead && isPlaying ? (
                <>
                  <IconPlayerPauseFilled size={16} /> пауза
                </>
              ) : (
                <>
                  <IconPlayerPlayFilled size={16} /> слушать популярное
                </>
              )}
            </button>
          )}
        </div>

        {lead && (
          <Link
            to={trackPath(lead)}
            viewTransition
            className="group flex items-center gap-3 self-start rounded-card border border-border bg-bg/70 p-2 backdrop-blur md:self-end"
          >
            <img src={lead.cover} alt="" className="h-14 w-14 rounded-md object-cover" />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-muted">трек №1</p>
              <p className="truncate text-sm font-medium group-hover:underline">{lead.title}</p>
              <p className="truncate text-xs text-muted">{lead.author}</p>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}

function PopularRail({ tracks }: { tracks: Track[] }) {
  const { addToQueue } = usePlayer();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl">популярные треки</h2>
      <ul className="grid gap-x-6 md:grid-cols-2">
        {tracks.map((t, i) => (
          <TrackRow
            key={t.id}
            track={t}
            index={i}
            queue={tracks}
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
                <TrackMenu track={t} />
              </>
            }
          />
        ))}
      </ul>
    </section>
  );
}

function AlbumCard({ album, isNew }: { album: HomeAlbum; isNew?: boolean }) {
  return (
    <Link
      to={`/album/${album.id}`}
      viewTransition
      className="group flex animate-fade-up flex-col rounded-card bg-surface p-2 transition-all duration-200 hover:-translate-y-1 hover:bg-surface-hover"
    >
      <div className="relative">
        <img
          src={album.cover ?? "/covers/default.jpg"}
          alt=""
          loading="lazy"
          className="aspect-square w-full rounded-md object-cover"
          onError={(e) => {
            const img = e.currentTarget;
            if (!img.src.endsWith("/covers/default.jpg")) img.src = "/covers/default.jpg";
          }}
        />
        {isNew && (
          <span className="absolute left-1.5 top-1.5 rounded-card bg-accent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
            новое
          </span>
        )}
      </div>
      <div className="px-1 pt-2">
        <p className="truncate text-sm font-medium group-hover:underline">{album.title}</p>
        <p className="truncate text-xs text-muted">
          {ALBUM_TYPE_RU[album.type] ?? album.type}
          {(album.releaseDate ?? album.year) &&
            ` · ${album.releaseDate?.slice(0, 4) ?? album.year}`}
          {" · "}
          {album.artistName}
        </p>
      </div>
    </Link>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-active={active}
      className="rounded-card border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-all hover:bg-surface-hover active:scale-95 data-[active=true]:bg-text data-[active=true]:text-bg"
    >
      {label}
    </button>
  );
}

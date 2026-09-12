import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { IconSearch, IconPlus, IconMusic } from "@tabler/icons-react";
import { searchApi, type SearchResult } from "../lib/api";
import { plural, toTrack, type Track } from "../lib/tracks";
import ArtistAvatar from "./ArtistAvatar";
import { usePlayer } from "../hooks/usePlayer";
import { useTitle } from "../hooks/useTitle";
import LikeButton from "./LikeButton";
import TrackMenu from "./TrackMenu";
import TrackRow from "./TrackRow";

const ALBUM_TYPE_RU: Record<string, string> = { album: "альбом", ep: "EP", single: "сингл" };

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [input, setInput] = useState(q);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const { addToQueue } = usePlayer();
  useTitle(q.trim() ? `поиск: ${q}` : "поиск");

  // keep the box in sync when the query changes from outside (header, history)
  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    if (!q.trim()) {
      setResult(null);
      return;
    }
    setLoading(true);
    let alive = true;
    // debounce: typing shouldn't fire a request per keystroke
    const t = setTimeout(() => {
      searchApi
        .query(q)
        .then((r) => alive && setResult(r))
        .catch(() => alive && setResult(null))
        .finally(() => alive && setLoading(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setParams(input.trim() ? { q: input.trim() } : {}, { replace: true });
  };

  const found = result
    ? result.tracks.length + result.artists.length + result.albums.length
    : 0;
  const playable: Track[] = (result?.tracks ?? [])
    .filter((t) => t.song)
    .map((t) => toTrack({ ...t, song: t.song }));

  return (
    <div className="flex animate-fade-up flex-col gap-7">
      <form onSubmit={submit} className="relative">
        <IconSearch
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          autoFocus
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setParams(e.target.value.trim() ? { q: e.target.value } : {}, { replace: true });
          }}
          placeholder="треки, артисты, альбомы"
          className="w-full rounded-card border border-border bg-surface py-3 pl-10 pr-3 text-sm outline-none transition-colors focus:border-accent"
        />
      </form>

      {!q.trim() && (
        <p className="text-sm text-muted">начни печатать — найду треки, артистов и альбомы</p>
      )}
      {q.trim() && !loading && found === 0 && (
        <p className="text-sm text-muted">ничего не нашлось по «{q}»</p>
      )}

      {result && result.artists.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl">артисты</h2>
          <div className="flex flex-wrap gap-4">
            {result.artists.map((a) => (
              <Link
                key={a.id}
                to={`/artist/${a.slug}`}
                viewTransition
                className="group flex w-24 flex-col items-center gap-2 text-center"
              >
                <ArtistAvatar
                  src={a.avatar}
                  name={a.name}
                  className="transition-transform group-hover:scale-105"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium group-hover:underline">
                    {a.name}
                  </span>
                  <span className="block text-xs text-muted">
                    {a.trackCount} {plural(a.trackCount, "трек", "трека", "треков")}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {result && result.tracks.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl">треки</h2>
          <ul className="flex flex-col">
            {playable.map((t, i) => (
              <TrackRow
                key={t.id}
                track={t}
                index={i}
                queue={playable}
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
        </section>
      )}

      {result && result.albums.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl">альбомы</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {result.albums.map((al) => (
              <Link
                key={al.id}
                to={`/album/${al.id}`}
                viewTransition
                className="group flex flex-col rounded-card bg-surface p-2 transition-all duration-200 hover:-translate-y-1 hover:bg-surface-hover"
              >
                <div className="aspect-square overflow-hidden rounded-md bg-bg">
                  {al.cover ? (
                    <img
                      src={al.cover}
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
                  <p className="truncate text-sm font-medium group-hover:underline">{al.title}</p>
                  <p className="truncate text-xs text-muted">
                    {ALBUM_TYPE_RU[al.type] ?? al.type} · {al.artistName}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

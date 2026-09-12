export type Track = {
  id: string;
  slug?: string | null;
  shortId?: string | null;
  title: string;
  author: string;
  cover: string;
  description: string;
  song: string;
  plays?: number;
  duration?: number | null;
  features?: { name: string; slug: string }[];
};

/**
 * Length of an audio file, read in the browser before upload. The file is
 * already local, so this costs nothing — and it saves the server from having
 * to decode audio just to show "3:42" in a list.
 */
export function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (seconds: number) => {
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    audio.onloadedmetadata = () =>
      done(Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0);
    audio.onerror = () => done(0);
    audio.src = url;
  });
}

// Pretty track url: `/track/<slug>-<shortId>`, falling back to the raw id for
// anything not yet carrying the short fields.
export function trackPath(t: { id: string; slug?: string | null; shortId?: string | null }) {
  if (!t.shortId) return `/track/${t.id}`;
  return t.slug ? `/track/${t.slug}-${t.shortId}` : `/track/${t.shortId}`;
}

type RawTrack = {
  id: string;
  title: string;
  author: string;
  cover: string;
  decription?: string; // legacy typo from the python generator
  description?: string;
  song: string;
};

export async function fetchTracks(): Promise<Track[]> {
  const res = await fetch("/track-list.json");
  if (!res.ok) throw new Error(`track-list.json ${res.status}`);
  const raw = (await res.json()) as RawTrack[];
  return raw.map((t) => ({
    id: t.id,
    title: t.title,
    author: t.author,
    cover: t.cover,
    description: t.description ?? t.decription ?? "",
    song: t.song,
  }));
}

type ApiTrack = {
  id: string;
  slug?: string | null;
  shortId?: string | null;
  title: string;
  cover: string | null;
  author: string;
  song: string | null;
  plays?: number;
  duration?: number | null;
  features?: { name: string; slug: string }[];
};

export const toTrack = (r: ApiTrack): Track => ({
  id: r.id,
  slug: r.slug,
  shortId: r.shortId,
  title: r.title,
  author: r.author,
  cover: r.cover ?? "/covers/default.jpg",
  description: "",
  song: r.song as string,
  plays: r.plays,
  duration: r.duration,
  features: r.features,
});

export type TrackPage = { items: Track[]; total: number; hasMore: boolean };

// One page of the catalog. Falls back to the static json (whole list, no
// paging) when the API is unreachable, so the site still works offline.
export async function loadTracks(opts: {
  limit?: number;
  offset?: number;
  artist?: string;
  sort?: "new" | "popular";
} = {}): Promise<TrackPage> {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 24));
  params.set("offset", String(opts.offset ?? 0));
  if (opts.artist) params.set("artist", opts.artist);
  if (opts.sort) params.set("sort", opts.sort);

  try {
    const res = await fetch(`/api/tracks?${params}`);
    if (res.ok) {
      const data = (await res.json()) as { items: ApiTrack[]; total: number; hasMore: boolean };
      if (Array.isArray(data.items))
        return {
          items: data.items.filter((r) => r.song).map(toTrack),
          total: data.total,
          hasMore: data.hasMore,
        };
    }
  } catch {
    // network/api down — use static catalog
  }
  const all = await fetchTracks();
  return { items: all, total: all.length, hasMore: false };
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Russian plural agreement: plural(1,"трек","трека","треков") -> "трек". */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

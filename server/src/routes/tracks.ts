import { Hono } from "hono";
import { eq, desc, inArray, count, and, isNotNull, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { tracks, artists, trackVersions, lyrics, trackArtists } from "../db/schema";
import { param, trackShortIdFromParam } from "../types";

// Audio is streamed via GET /api/audio/:versionId (302 -> the R2 public URL),
// so the catalog only needs to expose the version id, not storage details.
const audioUrl = (versionId: string | null) =>
  versionId ? `/api/audio/${versionId}` : null;

export const trackRoutes = new Hono();

// Attaches featured artists to a page of tracks with one extra query.
async function withFeatures<T extends { id: string; primaryVersionId: string | null }>(rows: T[]) {
  const featRows = rows.length
    ? await db()
        .select({ trackId: trackArtists.trackId, name: artists.name, slug: artists.slug })
        .from(trackArtists)
        .innerJoin(artists, eq(trackArtists.artistId, artists.id))
        .where(
          inArray(
            trackArtists.trackId,
            rows.map((r) => r.id),
          ),
        )
    : [];
  const byTrack = new Map<string, { name: string; slug: string }[]>();
  for (const f of featRows) {
    const list = byTrack.get(f.trackId) ?? [];
    list.push({ name: f.name, slug: f.slug });
    byTrack.set(f.trackId, list);
  }
  return rows.map(({ primaryVersionId, ...r }) => ({
    ...r,
    features: byTrack.get(r.id) ?? [],
    song: audioUrl(primaryVersionId),
  }));
}

const catalogColumns = {
  id: tracks.id,
  slug: tracks.slug,
  shortId: tracks.shortId,
  title: tracks.title,
  cover: tracks.cover,
  plays: tracks.plays,
  duration: tracks.duration,
  explicit: tracks.explicit,
  author: artists.name,
  authorSlug: artists.slug,
  primaryVersionId: tracks.primaryVersionId,
};

const MAX_LIMIT = 100;

/** A track with no audio is a draft: it belongs in the studio, not the catalog.
 *  Counting drafts in `total` made the numbers lie and stalled infinite scroll,
 *  because the client drops audio-less rows before rendering them. */
export const published = isNotNull(tracks.primaryVersionId);

// GET /api/tracks?artist=<slug>&limit=&offset=&sort=new|popular
// Paginated so the client can load the catalog in pages instead of all at once.
trackRoutes.get("/", async (c) => {
  const slug = c.req.query("artist");
  const sort = c.req.query("sort") === "popular" ? "popular" : "new";
  const limit = Math.min(Number(c.req.query("limit") ?? 24) || 24, MAX_LIMIT);
  const offset = Math.max(Number(c.req.query("offset") ?? 0) || 0, 0);
  const where: SQL | undefined = slug
    ? and(eq(artists.slug, slug), published)
    : published;

  const [rows, totalRow] = await Promise.all([
    db()
      .select(catalogColumns)
      .from(tracks)
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      .where(where)
      .orderBy(sort === "popular" ? desc(tracks.plays) : desc(tracks.createdAt))
      .limit(limit)
      .offset(offset),
    db()
      .select({ n: count() })
      .from(tracks)
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      .where(where),
  ]);

  const total = totalRow[0]?.n ?? 0;
  return c.json({
    items: await withFeatures(rows),
    total,
    hasMore: offset + rows.length < total,
  });
});

// Resolves a /:id param to a real track id. Tries the full id first (old
// 64-hex links, uuids), then falls back to the trailing shortId of a pretty
// `<slug>-<shortId>` url.
async function resolveTrackId(paramValue: string): Promise<string | null> {
  const exact = await db()
    .select({ id: tracks.id })
    .from(tracks)
    .where(eq(tracks.id, paramValue))
    .limit(1);
  if (exact[0]) return exact[0].id;

  const short = trackShortIdFromParam(paramValue);
  if (!short) return null;
  const byShort = await db()
    .select({ id: tracks.id })
    .from(tracks)
    .where(eq(tracks.shortId, short))
    .limit(1);
  return byShort[0]?.id ?? null;
}

// GET /api/tracks/:id  -> track + versions + lyrics
trackRoutes.get("/:id", async (c) => {
  const id = await resolveTrackId(param(c, "id"));
  if (!id) return c.json({ error: "not found" }, 404);
  const found = await db()
    .select({
      id: tracks.id,
      slug: tracks.slug,
      shortId: tracks.shortId,
      title: tracks.title,
      cover: tracks.cover,
      plays: tracks.plays,
      author: artists.name,
      authorSlug: artists.slug,
      primaryVersionId: tracks.primaryVersionId,
      albumId: tracks.albumId,
      genres: tracks.genres,
      explicit: tracks.explicit,
      duration: tracks.duration,
      clipKey: tracks.clipKey,
    })
    .from(tracks)
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .where(eq(tracks.id, id))
    .limit(1);
  const track = found[0];
  if (!track) return c.json({ error: "not found" }, 404);

  const versions = await db()
    .select()
    .from(trackVersions)
    .where(eq(trackVersions.trackId, id));
  const lyr = await db().select().from(lyrics).where(eq(lyrics.trackId, id)).limit(1);
  const features = await db()
    .select({ id: artists.id, name: artists.name, slug: artists.slug })
    .from(trackArtists)
    .innerJoin(artists, eq(trackArtists.artistId, artists.id))
    .where(eq(trackArtists.trackId, id));

  const { clipKey, ...rest } = track;
  return c.json({
    ...rest,
    features,
    clip: clipKey ? `/api/clip/${id}` : null,
    plays: track.plays,
    versions: versions.map((v) => ({
      id: v.id,
      kind: v.kind,
      label: v.label,
      isPrimary: v.isPrimary,
      url: audioUrl(v.id),
    })),
    lyrics: lyr[0] ? { content: lyr[0].content, synced: lyr[0].isSynced } : null,
  });
});

// POST /api/play/:id — one UPDATE per play. The old Redis buffer existed to
// spare the DB a write per play; at this catalog size that saving is noise.
// The update also does the existence check: no row, no increment.
trackRoutes.post("/play/:id", async (c) => {
  const id = param(c, "id");
  const [row] = await db()
    .update(tracks)
    .set({ plays: sql`${tracks.plays} + 1` })
    .where(eq(tracks.id, id))
    .returning({ plays: tracks.plays });
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ plays: row.plays });
});

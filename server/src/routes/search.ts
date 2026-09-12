import { Hono } from "hono";
import { eq, ilike, or, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { tracks, artists, albums } from "../db/schema";

export const searchRoutes = new Hono();

const LIMIT = 20;

// GET /api/search?q=... -> tracks + artists + albums
// ILIKE '%q%' is fine at this catalog size; swap for a tsvector index if the
// library ever grows past a few thousand rows.
searchRoutes.get("/", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  if (q.length < 1) return c.json({ tracks: [], artists: [], albums: [], query: q });

  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;

  const [trackRows, artistRows, albumRows] = await Promise.all([
    db()
      .select({
        id: tracks.id,
        slug: tracks.slug,
        shortId: tracks.shortId,
        title: tracks.title,
        cover: tracks.cover,
        plays: tracks.plays,
        explicit: tracks.explicit,
        author: artists.name,
        authorSlug: artists.slug,
        primaryVersionId: tracks.primaryVersionId,
      })
      .from(tracks)
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      // a track matches on its own title or on its artist's name
      .where(or(ilike(tracks.title, like), ilike(artists.name, like)))
      .orderBy(desc(tracks.plays))
      .limit(LIMIT),
    db()
      .select({
        id: artists.id,
        slug: artists.slug,
        name: artists.name,
        avatar: artists.avatar,
        trackCount: sql<number>`count(${tracks.id})`,
      })
      .from(artists)
      .leftJoin(tracks, eq(tracks.artistId, artists.id))
      .where(ilike(artists.name, like))
      .groupBy(artists.id)
      .limit(LIMIT),
    db()
      .select({
        id: albums.id,
        title: albums.title,
        cover: albums.cover,
        type: albums.type,
        year: albums.year,
        releaseDate: albums.releaseDate,
        artistName: artists.name,
        artistSlug: artists.slug,
      })
      .from(albums)
      .innerJoin(artists, eq(albums.artistId, artists.id))
      .where(or(ilike(albums.title, like), ilike(artists.name, like)))
      .limit(LIMIT),
  ]);

  return c.json({
    query: q,
    tracks: trackRows.map(({ primaryVersionId, ...t }) => ({
      ...t,
      song: primaryVersionId ? `/api/audio/${primaryVersionId}` : null,
    })),
    artists: artistRows.map((a) => ({ ...a, trackCount: Number(a.trackCount) })),
    albums: albumRows,
  });
});

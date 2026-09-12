import { Hono } from "hono";
import { eq, and, desc, asc, count, sql } from "drizzle-orm";
import { db } from "../db";
import { artists, albums, tracks, playlists } from "../db/schema";
import { published } from "./tracks";

export const homeRoutes = new Hono();

// GET /api/home — everything the landing page needs in one shot
homeRoutes.get("/", async (c) => {
  const [artistRows, albumRows, playlistRows, trackTotal] = await Promise.all([
    db()
      .select({
        id: artists.id,
        slug: artists.slug,
        name: artists.name,
        avatar: artists.avatar,
        trackCount: count(tracks.id),
      })
      .from(artists)
      // drafts don't count towards an artist's public track number
      .leftJoin(tracks, and(eq(tracks.artistId, artists.id), published))
      .groupBy(artists.id)
      .orderBy(desc(count(tracks.id))),
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
      // newest first; albums with no release date sink below dated ones
      .orderBy(
        asc(sql`${albums.releaseDate} is null`),
        desc(albums.releaseDate),
        desc(albums.year),
      ),
    db()
      .select({
        id: playlists.id,
        title: playlists.title,
        cover: playlists.cover,
        description: playlists.description,
      })
      .from(playlists)
      .where(eq(playlists.isPublic, true))
      .orderBy(desc(playlists.createdAt))
      .limit(12),
    db().select({ n: count() }).from(tracks).where(published),
  ]);
  // top tracks power the hero and the "популярные" rail — small, fixed page
  const popularRows = await db()
    .select({
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
    })
    .from(tracks)
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .where(published)
    .orderBy(desc(tracks.plays), desc(tracks.createdAt))
    .limit(10);

  return c.json({
    artists: artistRows,
    albums: albumRows,
    playlists: playlistRows,
    popular: popularRows.map(({ primaryVersionId, ...t }) => ({
      ...t,
      song: primaryVersionId ? `/api/audio/${primaryVersionId}` : null,
    })),
    stats: {
      tracks: Number(trackTotal[0]?.n ?? 0),
      artists: artistRows.length,
      albums: albumRows.length,
    },
  });
});

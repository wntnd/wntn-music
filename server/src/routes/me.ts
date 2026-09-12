import { Hono } from "hono";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { bodyLimit } from "hono/body-limit";
import { db } from "../db";
import {
  likes,
  playlists,
  tracks,
  artists,
  follows,
  users,
  savedAlbums,
  albums,
  playlistFollows,
} from "../db/schema";
import { requireAuth } from "../auth";
import { putObject } from "../storage";
import { readImageForm } from "../upload";
import { param, type AppEnv } from "../types";

export const meRoutes = new Hono<AppEnv>();
meRoutes.use("*", requireAuth);

// POST /api/me/avatar — multipart image, becomes the user's avatar
meRoutes.post("/avatar", bodyLimit({ maxSize: 10 * 1024 * 1024 }), async (c) => {
  const userId = c.get("userId");
  const img = await readImageForm(c);
  if (!img) return c.json({ error: "image only (jpg/png/webp)" }, 400);
  const avatarKey = `avatars/user/${userId}.${img.ext}`;
  await putObject(avatarKey, img.bytes, img.contentType);
  await db()
    .update(users)
    .set({ avatarKey, avatar: `/api/avatar/user/${userId}` })
    .where(eq(users.id, userId));
  return c.json({ avatar: `/api/avatar/user/${userId}` });
});

// PUT /api/me/settings — account preferences (currently cross-tab playback sync)
meRoutes.put("/settings", async (c) => {
  const body = z
    .object({ playbackSync: z.enum(["off", "tabs", "full"]) })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid input" }, 400);
  await db().update(users).set(body.data).where(eq(users.id, c.get("userId")));
  return c.json({ ok: true });
});

// GET /api/me/library — liked tracks + own playlists + followed artists + saved albums
meRoutes.get("/library", async (c) => {
  const userId = c.get("userId");
  const [liked, myPlaylists, following, mySavedAlbums, savedPlaylists] = await Promise.all([
    db()
      .select({
        id: tracks.id,
        title: tracks.title,
        cover: tracks.cover,
        author: artists.name,
        plays: tracks.plays,
        primaryVersionId: tracks.primaryVersionId,
      })
      .from(likes)
      .innerJoin(tracks, eq(likes.trackId, tracks.id))
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      .where(eq(likes.userId, userId)),
    db().select().from(playlists).where(eq(playlists.userId, userId)),
    db()
      .select({ slug: artists.slug, name: artists.name, avatar: artists.avatar })
      .from(follows)
      .innerJoin(artists, eq(follows.artistId, artists.id))
      .where(eq(follows.userId, userId)),
    db()
      .select({
        id: albums.id,
        title: albums.title,
        cover: albums.cover,
        artistName: artists.name,
        artistSlug: artists.slug,
      })
      .from(savedAlbums)
      .innerJoin(albums, eq(savedAlbums.albumId, albums.id))
      .innerJoin(artists, eq(albums.artistId, artists.id))
      .where(eq(savedAlbums.userId, userId)),
    db()
      .select({
        id: playlists.id,
        title: playlists.title,
        cover: playlists.cover,
        ownerUsername: users.username,
      })
      .from(playlistFollows)
      .innerJoin(playlists, eq(playlistFollows.playlistId, playlists.id))
      .innerJoin(users, eq(playlists.userId, users.id))
      .where(eq(playlistFollows.userId, userId)),
  ]);
  return c.json({
    // song included so the library can play without the full catalog
    likes: liked.map(({ primaryVersionId, ...t }) => ({
      ...t,
      song: primaryVersionId ? `/api/audio/${primaryVersionId}` : null,
    })),
    playlists: myPlaylists,
    following,
    savedAlbums: mySavedAlbums,
    savedPlaylists,
  });
});

// POST /api/me/saved-albums/:albumId — toggle
meRoutes.post("/saved-albums/:albumId", async (c) => {
  const userId = c.get("userId");
  const albumId = param(c, "albumId");
  const existing = await db()
    .select()
    .from(savedAlbums)
    .where(and(eq(savedAlbums.userId, userId), eq(savedAlbums.albumId, albumId)))
    .limit(1);
  if (existing.length) {
    await db()
      .delete(savedAlbums)
      .where(and(eq(savedAlbums.userId, userId), eq(savedAlbums.albumId, albumId)));
    return c.json({ saved: false });
  }
  await db().insert(savedAlbums).values({ userId, albumId }).onConflictDoNothing();
  return c.json({ saved: true });
});

// POST /api/me/follows/:artistId — toggle follow
meRoutes.post("/follows/:artistId", async (c) => {
  const userId = c.get("userId");
  const artistId = param(c, "artistId");
  const existing = await db()
    .select()
    .from(follows)
    .where(and(eq(follows.userId, userId), eq(follows.artistId, artistId)))
    .limit(1);
  if (existing.length) {
    await db()
      .delete(follows)
      .where(and(eq(follows.userId, userId), eq(follows.artistId, artistId)));
    return c.json({ following: false });
  }
  await db().insert(follows).values({ userId, artistId }).onConflictDoNothing();
  return c.json({ following: true });
});

// GET /api/me/artist — the artist profile this user owns, if any
meRoutes.get("/artist", async (c) => {
  const userId = c.get("userId");
  const found = await db()
    .select()
    .from(artists)
    .where(eq(artists.userId, userId))
    .limit(1);
  return c.json({ artist: found[0] ?? null });
});

// POST /api/me/likes/:trackId — toggle
meRoutes.post("/likes/:trackId", async (c) => {
  const userId = c.get("userId");
  const trackId = param(c, "trackId");
  const existing = await db()
    .select()
    .from(likes)
    .where(and(eq(likes.userId, userId), eq(likes.trackId, trackId)))
    .limit(1);
  if (existing.length) {
    await db()
      .delete(likes)
      .where(and(eq(likes.userId, userId), eq(likes.trackId, trackId)));
    return c.json({ liked: false });
  }
  await db().insert(likes).values({ userId, trackId }).onConflictDoNothing();
  return c.json({ liked: true });
});

// PUT /api/me/playlists/:id — rename / visibility
meRoutes.put("/playlists/:id", async (c) => {
  const userId = c.get("userId");
  const id = param(c, "id");
  const body = z
    .object({
      title: z.string().min(1).max(120).optional(),
      isPublic: z.boolean().optional(),
      description: z.string().max(1000).nullable().optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid input" }, 400);
  await db()
    .update(playlists)
    .set(body.data)
    .where(and(eq(playlists.id, id), eq(playlists.userId, userId)));
  return c.json({ ok: true });
});

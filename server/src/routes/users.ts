import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { users, playlists, artists } from "../db/schema";
import { param, type AppEnv } from "../types";

export const userRoutes = new Hono<AppEnv>();

// GET /api/users/:username — public profile: info + public playlists + owned artist
userRoutes.get("/:username", async (c) => {
  const username = param(c, "username").toLowerCase();
  const found = await db()
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatar: users.avatar,
      createdAt: users.createdAt,
      bannedAt: users.bannedAt,
    })
    .from(users)
    .where(sql`lower(${users.username}) = ${username}`)
    .limit(1);
  const user = found[0];
  if (!user) return c.json({ error: "not found" }, 404);

  const [publicPlaylists, ownedArtist] = await Promise.all([
    db()
      .select({ id: playlists.id, title: playlists.title, cover: playlists.cover })
      .from(playlists)
      .where(and(eq(playlists.userId, user.id), eq(playlists.isPublic, true))),
    db()
      .select({ slug: artists.slug, name: artists.name })
      .from(artists)
      .where(eq(artists.userId, user.id))
      .limit(1),
  ]);

  return c.json({
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    createdAt: user.createdAt,
    banned: user.bannedAt !== null,
    playlists: publicPlaylists,
    artist: ownedArtist[0] ?? null,
  });
});

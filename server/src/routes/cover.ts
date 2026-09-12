import { Hono } from "hono";
import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { tracks, albums, playlists } from "../db/schema";
import { objectUrl } from "../storage";
import { param } from "../types";

export const coverRoutes = new Hono();

async function redirectKey(c: Context, key: string | null | undefined) {
  if (!key) return c.redirect("/covers/default.jpg", 302);
  return c.redirect(objectUrl(key), 302);
}

// GET /api/cover/album/:id -> 302 to presigned album cover
coverRoutes.get("/album/:id", async (c) => {
  const found = await db()
    .select({ coverKey: albums.coverKey })
    .from(albums)
    .where(eq(albums.id, param(c, "id")))
    .limit(1);
  return redirectKey(c, found[0]?.coverKey);
});

// GET /api/cover/playlist/:id -> 302 to presigned playlist cover
coverRoutes.get("/playlist/:id", async (c) => {
  const found = await db()
    .select({ coverKey: playlists.coverKey })
    .from(playlists)
    .where(eq(playlists.id, param(c, "id")))
    .limit(1);
  return redirectKey(c, found[0]?.coverKey);
});

// GET /api/cover/:trackId -> 302 to presigned track cover (uploaded covers only).
coverRoutes.get("/:trackId", async (c) => {
  const found = await db()
    .select({ coverKey: tracks.coverKey })
    .from(tracks)
    .where(eq(tracks.id, param(c, "trackId")))
    .limit(1);
  return redirectKey(c, found[0]?.coverKey);
});

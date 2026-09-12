import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { tracks } from "../db/schema";
import { objectUrl } from "../storage";
import { param } from "../types";

export const clipRoutes = new Hono();

// GET /api/clip/:trackId -> 302 to a presigned video url (like audio/cover).
clipRoutes.get("/:trackId", async (c) => {
  const found = await db()
    .select({ clipKey: tracks.clipKey })
    .from(tracks)
    .where(eq(tracks.id, param(c, "trackId")))
    .limit(1);
  if (!found[0]?.clipKey) return c.json({ error: "not found" }, 404);
  return c.redirect(objectUrl(found[0].clipKey), 302);
});

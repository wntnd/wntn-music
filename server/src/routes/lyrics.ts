import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { lyrics, lyricsEdits, tracks, artists, users } from "../db/schema";
import { requireAuth, isAdminRole } from "../auth";
import { newId, param, type AppEnv } from "../types";

export const lyricsRoutes = new Hono<AppEnv>();

const isLrc = (s: string) => /\[\d+:\d+(?:[.:]\d+)?\]/.test(s);

// Can this user moderate lyrics for the track? Artist owner or admin.
async function canModerate(trackId: string, userId: string, role: AppEnv["Variables"]["role"]) {
  if (isAdminRole(role)) return true;
  const found = await db()
    .select({ ownerId: artists.userId })
    .from(tracks)
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .where(eq(tracks.id, trackId))
    .limit(1);
  return found[0]?.ownerId === userId;
}

// POST /api/lyrics/:trackId/edits — propose lyrics (community, genius-style)
lyricsRoutes.post("/:trackId/edits", requireAuth, async (c) => {
  const userId = c.get("userId");
  const trackId = param(c, "trackId");
  const body = z
    .object({ content: z.string().trim().min(1).max(20000) })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid input" }, 400);

  const track = await db().select({ id: tracks.id }).from(tracks).where(eq(tracks.id, trackId)).limit(1);
  if (!track.length) return c.json({ error: "not found" }, 404);

  // owner/admin edits apply instantly — no self-moderation loop
  if (await canModerate(trackId, userId, c.get("role"))) {
    await applyLyrics(trackId, body.data.content);
    return c.json({ applied: true });
  }

  const dup = await db()
    .select({ id: lyricsEdits.id })
    .from(lyricsEdits)
    .where(
      and(
        eq(lyricsEdits.trackId, trackId),
        eq(lyricsEdits.userId, userId),
        eq(lyricsEdits.status, "pending"),
      ),
    )
    .limit(1);
  if (dup.length) return c.json({ error: "ваша правка уже на модерации" }, 409);

  const id = newId();
  await db().insert(lyricsEdits).values({ id, trackId, userId, content: body.data.content });
  return c.json({ id, status: "pending" });
});

// GET /api/lyrics/:trackId/edits — pending edits (moderators only)
lyricsRoutes.get("/:trackId/edits", requireAuth, async (c) => {
  const trackId = param(c, "trackId");
  if (!(await canModerate(trackId, c.get("userId"), c.get("role"))))
    return c.json({ error: "forbidden" }, 403);
  const rows = await db()
    .select({
      id: lyricsEdits.id,
      content: lyricsEdits.content,
      createdAt: lyricsEdits.createdAt,
      username: users.username,
    })
    .from(lyricsEdits)
    .innerJoin(users, eq(lyricsEdits.userId, users.id))
    .where(and(eq(lyricsEdits.trackId, trackId), eq(lyricsEdits.status, "pending")))
    .orderBy(desc(lyricsEdits.createdAt));
  return c.json(rows);
});

async function applyLyrics(trackId: string, content: string) {
  const isSynced = isLrc(content);
  await db()
    .insert(lyrics)
    .values({ trackId, content, isSynced })
    .onConflictDoUpdate({ target: lyrics.trackId, set: { content, isSynced } });
}

// POST /api/lyrics/edits/:id/approve | /reject — moderators only
lyricsRoutes.post("/edits/:id/:action", requireAuth, async (c) => {
  const action = param(c, "action");
  if (action !== "approve" && action !== "reject") return c.json({ error: "not found" }, 404);
  const found = await db()
    .select()
    .from(lyricsEdits)
    .where(eq(lyricsEdits.id, param(c, "id")))
    .limit(1);
  const edit = found[0];
  if (!edit || edit.status !== "pending") return c.json({ error: "not found" }, 404);
  if (!(await canModerate(edit.trackId, c.get("userId"), c.get("role"))))
    return c.json({ error: "forbidden" }, 403);

  if (action === "approve") await applyLyrics(edit.trackId, edit.content);
  await db()
    .update(lyricsEdits)
    .set({ status: action === "approve" ? "approved" : "rejected" })
    .where(eq(lyricsEdits.id, edit.id));
  return c.json({ ok: true });
});

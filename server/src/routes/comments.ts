import { Hono } from "hono";
import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { db } from "../db";
import { comments, users } from "../db/schema";
import { requireAuth, currentUser, isAdminRole } from "../auth";
import { newId, param, type AppEnv } from "../types";

export const commentRoutes = new Hono<AppEnv>();

// GET /api/comments/:trackId — newest first, with author name
commentRoutes.get("/:trackId", async (c) => {
  const trackId = param(c, "trackId");
  const rows = await db()
    .select({
      id: comments.id,
      content: comments.content,
      createdAt: comments.createdAt,
      userId: comments.userId,
      author: users.displayName,
      username: users.username,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.trackId, trackId))
    .orderBy(desc(comments.createdAt))
    .limit(200);
  const me = await currentUser(c);
  // admins see every comment as deletable ("mine") — moderation without extra UI
  const mod = me ? isAdminRole(me.role) : false;
  return c.json(rows.map((r) => ({ ...r, mine: mod || r.userId === me?.id })));
});

// POST /api/comments/:trackId — add (auth)
commentRoutes.post("/:trackId", requireAuth, async (c) => {
  const userId = c.get("userId");
  const trackId = param(c, "trackId");
  const body = z
    .object({ content: z.string().trim().min(1).max(1000) })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid input" }, 400);
  const id = newId();
  await db().insert(comments).values({ id, trackId, userId, content: body.data.content });
  return c.json({ id });
});

// DELETE /api/comments/id/:commentId — delete own; admins delete any
commentRoutes.delete("/id/:commentId", requireAuth, async (c) => {
  const userId = c.get("userId");
  const own = isAdminRole(c.get("role"))
    ? eq(comments.id, param(c, "commentId"))
    : and(eq(comments.id, param(c, "commentId")), eq(comments.userId, userId));
  await db().delete(comments).where(own);
  return c.json({ ok: true });
});

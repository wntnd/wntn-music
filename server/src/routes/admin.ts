import { Hono } from "hono";
import { z } from "zod";
import { eq, and, ne, desc, isNotNull, ilike, or } from "drizzle-orm";
import { db } from "../db";
import { claimRequests, artists, users } from "../db/schema";
import { requireAdmin, requireRoot, revokeAllSessions } from "../auth";
import { param, type AppEnv } from "../types";

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use("*", requireAdmin);

// GET /api/admin/claims — pending ownership requests with artist + requester info
adminRoutes.get("/claims", async (c) => {
  const rows = await db()
    .select({
      id: claimRequests.id,
      message: claimRequests.message,
      createdAt: claimRequests.createdAt,
      artistId: claimRequests.artistId,
      artistName: artists.name,
      artistSlug: artists.slug,
      userId: claimRequests.userId,
      username: users.username,
    })
    .from(claimRequests)
    .innerJoin(artists, eq(claimRequests.artistId, artists.id))
    .innerJoin(users, eq(claimRequests.userId, users.id))
    .where(eq(claimRequests.status, "pending"))
    .orderBy(desc(claimRequests.createdAt));
  return c.json(rows);
});

// POST /api/admin/claims/:id/approve — grant ownership, reject competing requests
adminRoutes.post("/claims/:id/approve", async (c) => {
  const id = param(c, "id");
  const found = await db().select().from(claimRequests).where(eq(claimRequests.id, id)).limit(1);
  const req = found[0];
  if (!req || req.status !== "pending") return c.json({ error: "not found" }, 404);

  // guard: artist must still be unowned
  const art = await db()
    .select({ userId: artists.userId })
    .from(artists)
    .where(eq(artists.id, req.artistId))
    .limit(1);
  if (art[0]?.userId) return c.json({ error: "артист уже занят" }, 409);

  // the requester may have claimed another artist between request and approval
  const already = await db()
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, req.userId))
    .limit(1);
  if (already.length)
    return c.json({ error: "у заявителя уже есть артист" }, 409);

  await db().update(artists).set({ userId: req.userId }).where(eq(artists.id, req.artistId));
  await db()
    .update(claimRequests)
    .set({ status: "approved" })
    .where(eq(claimRequests.id, id));
  // reject all other pending requests for the same artist
  await db()
    .update(claimRequests)
    .set({ status: "rejected" })
    .where(and(eq(claimRequests.artistId, req.artistId), ne(claimRequests.id, id), eq(claimRequests.status, "pending")));
  return c.json({ ok: true });
});

// POST /api/admin/claims/:id/reject
adminRoutes.post("/claims/:id/reject", async (c) => {
  await db()
    .update(claimRequests)
    .set({ status: "rejected" })
    .where(and(eq(claimRequests.id, param(c, "id")), eq(claimRequests.status, "pending")));
  return c.json({ ok: true });
});

// GET /api/admin/users?q= — user list with role, ban state and owned artist
adminRoutes.get("/users", async (c) => {
  const q = c.req.query("q")?.trim();
  const rows = await db()
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      bannedAt: users.bannedAt,
      createdAt: users.createdAt,
      artistSlug: artists.slug,
      artistName: artists.name,
    })
    .from(users)
    .leftJoin(artists, eq(artists.userId, users.id))
    .where(q ? or(ilike(users.username, `%${q}%`), ilike(users.email, `%${q}%`)) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(200);
  return c.json(rows);
});

const rank = { user: 0, admin: 1, root: 2 } as const;

async function getUserRow(id: string) {
  const found = await db().select().from(users).where(eq(users.id, id)).limit(1);
  return found[0] ?? null;
}

// POST /api/admin/users/:id/role {role} — root only; roots are untouchable
adminRoutes.post("/users/:id/role", requireRoot, async (c) => {
  const body = z
    .object({ role: z.enum(["user", "admin"]) })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid input" }, 400);
  const target = await getUserRow(param(c, "id"));
  if (!target) return c.json({ error: "not found" }, 404);
  if (target.role === "root") return c.json({ error: "root нельзя менять" }, 403);
  await db().update(users).set({ role: body.data.role }).where(eq(users.id, target.id));
  return c.json({ ok: true });
});

// POST /api/admin/users/:id/ban | /unban — actor must outrank target
adminRoutes.post("/users/:id/ban", async (c) => {
  const target = await getUserRow(param(c, "id"));
  if (!target) return c.json({ error: "not found" }, 404);
  if (target.id === c.get("userId")) return c.json({ error: "себя нельзя" }, 400);
  if (rank[c.get("role")] <= rank[target.role])
    return c.json({ error: "недостаточно прав" }, 403);
  await db().update(users).set({ bannedAt: new Date() }).where(eq(users.id, target.id));
  await revokeAllSessions(target.id);
  return c.json({ ok: true });
});

// same rank rule as ban: an admin must not undo a root's moderation
adminRoutes.post("/users/:id/unban", async (c) => {
  const target = await getUserRow(param(c, "id"));
  if (!target) return c.json({ error: "not found" }, 404);
  if (rank[c.get("role")] <= rank[target.role])
    return c.json({ error: "недостаточно прав" }, 403);
  await db().update(users).set({ bannedAt: null }).where(eq(users.id, target.id));
  return c.json({ ok: true });
});

// GET /api/admin/artists — owned artists (for revoking access)
adminRoutes.get("/artists", async (c) => {
  const rows = await db()
    .select({
      id: artists.id,
      slug: artists.slug,
      name: artists.name,
      ownerId: users.id,
      ownerUsername: users.username,
    })
    .from(artists)
    .innerJoin(users, eq(artists.userId, users.id))
    .where(isNotNull(artists.userId));
  return c.json(rows);
});

// POST /api/admin/artists/:id/revoke — detach owner, artist becomes claimable again
adminRoutes.post("/artists/:id/revoke", async (c) => {
  await db().update(artists).set({ userId: null }).where(eq(artists.id, param(c, "id")));
  return c.json({ ok: true });
});

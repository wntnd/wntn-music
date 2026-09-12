import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { env } from "./env";
import { db } from "./db";
import { users, sessions } from "./db/schema";

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
const COOKIE = "sid";

export type Role = "user" | "admin" | "root";

// scrypt is built into node:crypto — no argon2/bcrypt native build needed.
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const orig = Buffer.from(hash, "hex");
  return test.length === orig.length && timingSafeEqual(test, orig);
}

// A session is live while its row exists and has not expired.
const live = (sid: string) => and(eq(sessions.id, sid), gt(sessions.expiresAt, new Date()));

export async function createSession(c: Context, userId: string) {
  const sid = randomBytes(24).toString("hex");
  await db()
    .insert(sessions)
    .values({ id: sid, userId, expiresAt: new Date(Date.now() + SESSION_TTL * 1000) });
  setCookie(c, COOKIE, sid, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    // https-only in prod; browsers accept Secure cookies on http://localhost
    secure: true,
    maxAge: SESSION_TTL,
  });
}

export async function destroySession(c: Context) {
  const sid = getCookie(c, COOKIE);
  if (sid) await db().delete(sessions).where(eq(sessions.id, sid));
  deleteCookie(c, COOKIE, { path: "/" });
}

// Ban must cut existing sessions: read-only routes resolve the user without
// requireAuth, so a live session would keep working until they mutate something.
export async function revokeAllSessions(userId: string) {
  await db().delete(sessions).where(eq(sessions.userId, userId));
}

export async function currentUserId(c: Context): Promise<string | null> {
  const sid = getCookie(c, COOKIE);
  if (!sid) return null;
  const found = await db()
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(live(sid))
    .limit(1);
  return found[0]?.userId ?? null;
}

// Session user row (role + ban state). Null if not logged in or user deleted.
// Joined, so resolving the caller is the single query it always was.
export async function currentUser(c: Context) {
  const sid = getCookie(c, COOKIE);
  if (!sid) return null;
  const found = await db()
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      bannedAt: users.bannedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(live(sid))
    .limit(1);
  return found[0] ?? null;
}

export const isAdminRole = (role: Role) => role === "admin" || role === "root";

// Middleware: 401 unless logged in, 403 if banned; stashes userId + role.
export async function requireAuth(c: Context, next: Next) {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (user.bannedAt) {
    await destroySession(c);
    return c.json({ error: "аккаунт заблокирован" }, 403);
  }
  c.set("userId", user.id);
  c.set("role", user.role);
  await next();
}

export async function requireAdmin(c: Context, next: Next) {
  const user = await currentUser(c);
  if (!user || user.bannedAt || !isAdminRole(user.role))
    return c.json({ error: "forbidden" }, 403);
  c.set("userId", user.id);
  c.set("role", user.role);
  await next();
}

export async function requireRoot(c: Context, next: Next) {
  const user = await currentUser(c);
  if (!user || user.bannedAt || user.role !== "root")
    return c.json({ error: "forbidden" }, 403);
  c.set("userId", user.id);
  c.set("role", user.role);
  await next();
}

// One-time bootstrap: promote ADMIN_USERNAMES to root only while no root exists
// yet. Running unconditionally would let anyone who registers a listed-but-
// unclaimed username become root, and would silently unban a listed account on
// every restart. After the first root exists, grants happen in /admin.
export async function bootstrapRoots() {
  if (!env.adminUsernames.length) return;
  const existing = await db()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "root"))
    .limit(1);
  if (existing.length) return;
  await db()
    .update(users)
    .set({ role: "root" })
    .where(inArray(sql`lower(${users.username})`, env.adminUsernames));
}

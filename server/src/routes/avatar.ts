import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { artists, users } from "../db/schema";
import { objectUrl } from "../storage";
import { param } from "../types";

export const avatarRoutes = new Hono();

// GET /api/avatar/artist/:id | /api/avatar/user/:id -> 302 to presigned image
avatarRoutes.get("/artist/:id", async (c) => {
  const found = await db()
    .select({ avatarKey: artists.avatarKey })
    .from(artists)
    .where(eq(artists.id, param(c, "id")))
    .limit(1);
  if (!found[0]?.avatarKey) return c.redirect("/covers/default.jpg", 302);
  return c.redirect(objectUrl(found[0].avatarKey), 302);
});

avatarRoutes.get("/user/:id", async (c) => {
  const found = await db()
    .select({ avatarKey: users.avatarKey })
    .from(users)
    .where(eq(users.id, param(c, "id")))
    .limit(1);
  if (!found[0]?.avatarKey) return c.redirect("/covers/default.jpg", 302);
  return c.redirect(objectUrl(found[0].avatarKey), 302);
});

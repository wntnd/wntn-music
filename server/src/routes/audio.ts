import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { trackVersions } from "../db/schema";
import { objectUrl } from "../storage";
import { param } from "../types";

export const audioRoutes = new Hono();

// GET /api/audio/:versionId -> 302 to a presigned GET URL.
// Backend-agnostic streaming: no public bucket needed, works for rustfs/MinIO/R2.
audioRoutes.get("/:versionId", async (c) => {
  const versionId = param(c, "versionId");
  const found = await db()
    .select({ audioKey: trackVersions.audioKey })
    .from(trackVersions)
    .where(eq(trackVersions.id, versionId))
    .limit(1);
  if (!found[0]) return c.json({ error: "not found" }, 404);
  const url = objectUrl(found[0].audioKey);
  return c.redirect(url, 302);
});

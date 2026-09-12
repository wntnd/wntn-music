import { Hono } from "hono";
import { z } from "zod";
import { eq, and, asc, sql } from "drizzle-orm";
import { bodyLimit } from "hono/body-limit";
import { db } from "../db";
import { albums, tracks, artists, savedAlbums } from "../db/schema";
import { requireAuth, isAdminRole, currentUser } from "../auth";
import { putObject } from "../storage";
import { readImageForm } from "../upload";
import { newId, param, type AppEnv } from "../types";

export const albumRoutes = new Hono<AppEnv>();

async function canManage(artistId: string, userId: string, role: AppEnv["Variables"]["role"]) {
  if (isAdminRole(role)) return true;
  const owner = await db()
    .select({ userId: artists.userId })
    .from(artists)
    .where(eq(artists.id, artistId))
    .limit(1);
  return owner[0]?.userId === userId;
}

// GET /api/albums/:id -> album + artist + tracks (spotify-style detail)
albumRoutes.get("/:id", async (c) => {
  const id = param(c, "id");
  const found = await db()
    .select({
      id: albums.id,
      title: albums.title,
      cover: albums.cover,
      year: albums.year,
      releaseDate: albums.releaseDate,
      description: albums.description,
      genres: albums.genres,
      copyright: albums.copyright,
      type: albums.type,
      artistId: albums.artistId,
      artistName: artists.name,
      artistSlug: artists.slug,
    })
    .from(albums)
    .innerJoin(artists, eq(albums.artistId, artists.id))
    .where(eq(albums.id, id))
    .limit(1);
  const album = found[0];
  if (!album) return c.json({ error: "not found" }, 404);
  const albumTracks = await db()
    .select({
      id: tracks.id,
      title: tracks.title,
      cover: tracks.cover,
      plays: tracks.plays,
      explicit: tracks.explicit,
      trackNumber: tracks.trackNumber,
      primaryVersionId: tracks.primaryVersionId,
    })
    .from(tracks)
    .where(eq(tracks.albumId, id))
    // untracked-order tracks (no manual sort yet) sink to the bottom by createdAt
    .orderBy(asc(sql`${tracks.trackNumber} is null`), asc(tracks.trackNumber), asc(tracks.createdAt));

  const me = await currentUser(c);
  const canManageAlbum = me ? isAdminRole(me.role) || (await canManage(album.artistId, me.id, me.role)) : false;
  const saved = me
    ? (
        await db()
          .select({ userId: savedAlbums.userId })
          .from(savedAlbums)
          .where(and(eq(savedAlbums.userId, me.id), eq(savedAlbums.albumId, id)))
          .limit(1)
      ).length > 0
    : false;

  return c.json({
    ...album,
    canManage: canManageAlbum,
    saved,
    tracks: albumTracks.map(({ primaryVersionId, ...t }) => ({
      ...t,
      song: primaryVersionId ? `/api/audio/${primaryVersionId}` : null,
    })),
  });
});

const createSchema = z.object({
  artistId: z.string(),
  title: z.string().min(1).max(120),
  year: z.number().int().optional(),
  type: z.enum(["album", "ep", "single"]).optional(),
});

// POST /api/albums — owner of the artist (or admin) creates an album
albumRoutes.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid input" }, 400);

  if (!(await canManage(body.data.artistId, userId, c.get("role"))))
    return c.json({ error: "forbidden" }, 403);

  const id = newId();
  await db().insert(albums).values({
    id,
    artistId: body.data.artistId,
    title: body.data.title,
    year: body.data.year,
    type: body.data.type ?? "album",
  });
  return c.json({ id });
});

async function getAlbum(id: string) {
  const found = await db().select().from(albums).where(eq(albums.id, id)).limit(1);
  return found[0] ?? null;
}

const updateSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  year: z.number().int().nullable().optional(),
  releaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  description: z.string().max(2000).nullable().optional(),
  genres: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  copyright: z.string().max(200).nullable().optional(),
  type: z.enum(["album", "ep", "single"]).optional(),
});

// PUT /api/albums/:id — title / year / releaseDate / description / genres / type
albumRoutes.put("/:id", requireAuth, async (c) => {
  const album = await getAlbum(param(c, "id"));
  if (!album) return c.json({ error: "not found" }, 404);
  if (!(await canManage(album.artistId, c.get("userId"), c.get("role"))))
    return c.json({ error: "forbidden" }, 403);
  const body = updateSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid input" }, 400);
  await db().update(albums).set(body.data).where(eq(albums.id, album.id));
  return c.json({ ok: true });
});

// POST /api/albums/:id/cover — multipart cover image
albumRoutes.post("/:id/cover", requireAuth, bodyLimit({ maxSize: 10 * 1024 * 1024 }), async (c) => {
  const album = await getAlbum(param(c, "id"));
  if (!album) return c.json({ error: "not found" }, 404);
  if (!(await canManage(album.artistId, c.get("userId"), c.get("role"))))
    return c.json({ error: "forbidden" }, 403);
  const img = await readImageForm(c);
  if (!img) return c.json({ error: "image only (jpg/png/webp)" }, 400);
  const coverKey = `covers/album/${album.id}.${img.ext}`;
  await putObject(coverKey, img.bytes, img.contentType);
  await db()
    .update(albums)
    .set({ coverKey, cover: `/api/cover/album/${album.id}` })
    .where(eq(albums.id, album.id));
  return c.json({ cover: `/api/cover/album/${album.id}` });
});

// PUT /api/albums/:id/reorder — body { trackIds: [...] } in the desired order,
// sets trackNumber = index+1 for each. Any track not listed keeps its number.
albumRoutes.put("/:id/reorder", requireAuth, async (c) => {
  const album = await getAlbum(param(c, "id"));
  if (!album) return c.json({ error: "not found" }, 404);
  if (!(await canManage(album.artistId, c.get("userId"), c.get("role"))))
    return c.json({ error: "forbidden" }, 403);
  const body = z.object({ trackIds: z.array(z.string()).min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid input" }, 400);

  await Promise.all(
    body.data.trackIds.map((trackId, i) =>
      db()
        .update(tracks)
        .set({ trackNumber: i + 1 })
        .where(and(eq(tracks.id, trackId), eq(tracks.albumId, album.id))),
    ),
  );
  return c.json({ ok: true });
});

// DELETE /api/albums/:id — tracks stay (albumId -> null via FK)
albumRoutes.delete("/:id", requireAuth, async (c) => {
  const album = await getAlbum(param(c, "id"));
  if (!album) return c.json({ error: "not found" }, 404);
  if (!(await canManage(album.artistId, c.get("userId"), c.get("role"))))
    return c.json({ error: "forbidden" }, 403);
  await db().delete(albums).where(eq(albums.id, album.id));
  return c.json({ ok: true });
});

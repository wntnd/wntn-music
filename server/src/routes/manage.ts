import { Hono } from "hono";
import { z } from "zod";
import { bodyLimit } from "hono/body-limit";
import { eq, and, ne, sql, desc, count } from "drizzle-orm";
import { db } from "../db";
import {
  tracks,
  trackVersions,
  artists,
  lyrics,
  trackArtists,
  albums,
  follows,
} from "../db/schema";
import { requireAuth, isAdminRole } from "../auth";
import { putObject, deleteObject } from "../storage";
import { readImageForm } from "../upload";
import { newId, param, contentSlug, shortIdFor, type AppEnv } from "../types";

// Files are uploaded THROUGH the api (same-origin) and streamed to storage,
// so the browser never makes a cross-origin PUT (no S3 CORS needed).
const uploadLimit = bodyLimit({ maxSize: 60 * 1024 * 1024 }); // 60MB, audio
// images are buffered whole in memory before validation — keep them small
const imageLimit = bodyLimit({ maxSize: 10 * 1024 * 1024 });
const VERSION_KINDS = ["demo", "release", "remaster", "live", "other"] as const;
type VersionKind = (typeof VERSION_KINDS)[number];

export const manageRoutes = new Hono<AppEnv>();
manageRoutes.use("*", requireAuth);

type Role = AppEnv["Variables"]["role"];

// Owner of the artist, or an admin — the "can manage" check everywhere below.
async function ownsArtist(artistId: string, userId: string, role: Role) {
  if (isAdminRole(role)) return true;
  const found = await db()
    .select({ userId: artists.userId })
    .from(artists)
    .where(eq(artists.id, artistId))
    .limit(1);
  return found[0]?.userId === userId;
}

// An album belongs to an artist too: without this, a user who owns any artist
// could file their track into someone else's album (and the victim couldn't
// remove it, since removal checks the *track's* owner).
async function canUseAlbum(albumId: string, userId: string, role: Role) {
  if (isAdminRole(role)) return true;
  const found = await db()
    .select({ artistId: albums.artistId })
    .from(albums)
    .where(eq(albums.id, albumId))
    .limit(1);
  if (!found[0]) return false;
  return ownsArtist(found[0].artistId, userId, role);
}

async function ownsTrack(trackId: string, userId: string, role: Role) {
  if (isAdminRole(role)) return true;
  const found = await db()
    .select({ userId: artists.userId })
    .from(tracks)
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .where(eq(tracks.id, trackId))
    .limit(1);
  return found[0]?.userId === userId;
}

// GET /api/manage/overview — everything the studio renders, in one request.
// The public artist profile hides drafts, so the studio can't be built on it.
manageRoutes.get("/overview", async (c) => {
  const userId = c.get("userId");
  const owned = await db()
    .select()
    .from(artists)
    .where(eq(artists.userId, userId))
    .limit(1);
  const artist = owned[0];
  if (!artist) return c.json({ artist: null });

  const [trackRows, albumRows, followerRow] = await Promise.all([
    db()
      .select({
        id: tracks.id,
        slug: tracks.slug,
        shortId: tracks.shortId,
        title: tracks.title,
        cover: tracks.cover,
        plays: tracks.plays,
        duration: tracks.duration,
        explicit: tracks.explicit,
        genres: tracks.genres,
        albumId: tracks.albumId,
        createdAt: tracks.createdAt,
        primaryVersionId: tracks.primaryVersionId,
        versionCount: count(trackVersions.id),
      })
      .from(tracks)
      .leftJoin(trackVersions, eq(trackVersions.trackId, tracks.id))
      .where(eq(tracks.artistId, artist.id))
      .groupBy(tracks.id)
      .orderBy(desc(tracks.createdAt)),
    db()
      .select({
        id: albums.id,
        title: albums.title,
        cover: albums.cover,
        type: albums.type,
        releaseDate: albums.releaseDate,
        year: albums.year,
        trackCount: count(tracks.id),
      })
      .from(albums)
      .leftJoin(tracks, eq(tracks.albumId, albums.id))
      .where(eq(albums.artistId, artist.id))
      .groupBy(albums.id)
      .orderBy(desc(albums.releaseDate)),
    db().select({ n: count() }).from(follows).where(eq(follows.artistId, artist.id)),
  ]);

  const publishedTracks = trackRows.filter((t) => t.primaryVersionId);
  return c.json({
    artist: {
      id: artist.id,
      slug: artist.slug,
      name: artist.name,
      bio: artist.bio,
      avatar: artist.avatar,
      genres: artist.genres,
      links: artist.links,
    },
    stats: {
      published: publishedTracks.length,
      drafts: trackRows.length - publishedTracks.length,
      albums: albumRows.length,
      followers: followerRow[0]?.n ?? 0,
      plays: publishedTracks.reduce((n, t) => n + t.plays, 0),
    },
    albums: albumRows,
    tracks: trackRows.map(({ primaryVersionId, ...t }) => ({
      ...t,
      published: Boolean(primaryVersionId),
    })),
  });
});

// POST /api/manage/tracks — create track metadata
manageRoutes.post("/tracks", async (c) => {
  const userId = c.get("userId");
  const body = z
    .object({
      title: z.string().min(1).max(200),
      artistId: z.string(),
      albumId: z.string().optional(),
      cover: z.string().optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid input" }, 400);
  if (!(await ownsArtist(body.data.artistId, userId, c.get("role"))))
    return c.json({ error: "forbidden" }, 403);
  if (body.data.albumId && !(await canUseAlbum(body.data.albumId, userId, c.get("role"))))
    return c.json({ error: "чужой альбом" }, 403);

  const id = newId();
  await db().insert(tracks).values({
    id,
    slug: contentSlug(body.data.title),
    shortId: shortIdFor(id),
    title: body.data.title,
    artistId: body.data.artistId,
    albumId: body.data.albumId,
    cover: body.data.cover,
  });
  return c.json({ id });
});

// POST /api/manage/tracks/:id/versions — multipart upload (file + kind/label/makePrimary)
manageRoutes.post("/tracks/:id/versions", uploadLimit, async (c) => {
  const userId = c.get("userId");
  const trackId = param(c, "id");
  if (!(await ownsTrack(trackId, userId, c.get("role")))) return c.json({ error: "forbidden" }, 403);

  const form = await c.req.parseBody();
  const file = form["file"];
  if (!(file instanceof File)) return c.json({ error: "file required" }, 400);
  const kind = String(form["kind"] ?? "release");
  if (!VERSION_KINDS.includes(kind as VersionKind))
    return c.json({ error: "bad kind" }, 400);
  const ext = (file.name.split(".").pop() ?? "mp3").toLowerCase();
  if (!/^[a-z0-9]{1,5}$/.test(ext)) return c.json({ error: "bad extension" }, 400);
  const contentType = file.type || "audio/mpeg";
  if (!contentType.startsWith("audio/")) return c.json({ error: "audio only" }, 400);

  const versionId = newId();
  const audioKey = `audio/${trackId}/${versionId}.${ext}`;
  await putObject(audioKey, new Uint8Array(await file.arrayBuffer()), contentType);

  const makePrimary = String(form["makePrimary"] ?? "") === "true";
  const label = form["label"] ? String(form["label"]).slice(0, 80) : undefined;
  await db().insert(trackVersions).values({
    id: versionId,
    trackId,
    kind: kind as VersionKind,
    label,
    audioKey,
    isPrimary: makePrimary,
  });
  // Length is measured in the browser (the file is right there) and sent along,
  // so lists can show a duration without the server decoding audio.
  const duration = Math.round(Number(form["duration"] ?? 0));
  const patch: { primaryVersionId?: string; duration?: number } = {};
  if (makePrimary) patch.primaryVersionId = versionId;
  if (Number.isFinite(duration) && duration > 0 && duration < 24 * 3600 && makePrimary)
    patch.duration = duration;
  if (Object.keys(patch).length)
    await db().update(tracks).set(patch).where(eq(tracks.id, trackId));
  return c.json({ versionId });
});

const clipLimit = bodyLimit({ maxSize: 200 * 1024 * 1024 }); // 200MB video
const CLIP_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

// POST /api/manage/tracks/:id/clip — multipart upload of a video clip
manageRoutes.post("/tracks/:id/clip", clipLimit, async (c) => {
  const trackId = param(c, "id");
  if (!(await ownsTrack(trackId, c.get("userId"), c.get("role"))))
    return c.json({ error: "forbidden" }, 403);

  const form = await c.req.parseBody();
  const file = form["file"];
  if (!(file instanceof File)) return c.json({ error: "file required" }, 400);
  const ext = (file.name.split(".").pop() ?? "mp4").toLowerCase();
  if (!/^[a-z0-9]{1,5}$/.test(ext)) return c.json({ error: "bad extension" }, 400);
  const contentType = file.type || "video/mp4";
  if (!CLIP_TYPES.includes(contentType))
    return c.json({ error: "video only (mp4/webm/mov)" }, 400);

  const clipKey = `clips/${trackId}.${ext}`;
  await putObject(clipKey, new Uint8Array(await file.arrayBuffer()), contentType);
  await db().update(tracks).set({ clipKey }).where(eq(tracks.id, trackId));
  return c.json({ clip: `/api/clip/${trackId}` });
});

// DELETE /api/manage/tracks/:id/clip — remove the clip + its S3 object
manageRoutes.delete("/tracks/:id/clip", async (c) => {
  const trackId = param(c, "id");
  if (!(await ownsTrack(trackId, c.get("userId"), c.get("role"))))
    return c.json({ error: "forbidden" }, 403);
  const row = await db()
    .select({ clipKey: tracks.clipKey })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (row[0]?.clipKey) await deleteObject(row[0].clipKey);
  await db().update(tracks).set({ clipKey: null }).where(eq(tracks.id, trackId));
  return c.json({ ok: true });
});

// POST /api/manage/tracks/:id/cover — multipart upload of a cover image
manageRoutes.post("/tracks/:id/cover", imageLimit, async (c) => {
  const userId = c.get("userId");
  const trackId = param(c, "id");
  if (!(await ownsTrack(trackId, userId, c.get("role")))) return c.json({ error: "forbidden" }, 403);

  const form = await c.req.parseBody();
  const file = form["file"];
  if (!(file instanceof File)) return c.json({ error: "file required" }, 400);
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  if (!/^[a-z0-9]{1,5}$/.test(ext)) return c.json({ error: "bad extension" }, 400);
  const contentType = file.type || "image/jpeg";
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType))
    return c.json({ error: "image only (jpg/png/webp)" }, 400);

  const coverKey = `covers/${trackId}.${ext}`;
  await putObject(coverKey, new Uint8Array(await file.arrayBuffer()), contentType);
  await db()
    .update(tracks)
    .set({ coverKey, cover: `/api/cover/${trackId}` })
    .where(eq(tracks.id, trackId));
  // the url never changes, so the caller needs it back to cache-bust the <img>
  return c.json({ ok: true, cover: `/api/cover/${trackId}` });
});

// PUT /api/manage/tracks/:id/lyrics — LRC or plain; synced auto-detected
manageRoutes.put("/tracks/:id/lyrics", async (c) => {
  const userId = c.get("userId");
  const trackId = param(c, "id");
  if (!(await ownsTrack(trackId, userId, c.get("role")))) return c.json({ error: "forbidden" }, 403);

  const body = z
    .object({ content: z.string() })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid input" }, 400);

  const isSynced = /\[\d+:\d+(?:[.:]\d+)?\]/.test(body.data.content);
  await db()
    .insert(lyrics)
    .values({ trackId, content: body.data.content, isSynced })
    .onConflictDoUpdate({
      target: lyrics.trackId,
      set: { content: body.data.content, isSynced },
    });
  return c.json({ ok: true, synced: isSynced });
});

// POST /api/manage/artists/:id/avatar — artist avatar (owner or admin)
manageRoutes.post("/artists/:id/avatar", imageLimit, async (c) => {
  const artistId = param(c, "id");
  if (!(await ownsArtist(artistId, c.get("userId"), c.get("role"))))
    return c.json({ error: "forbidden" }, 403);
  const img = await readImageForm(c);
  if (!img) return c.json({ error: "image only (jpg/png/webp)" }, 400);
  const avatarKey = `avatars/artist/${artistId}.${img.ext}`;
  await putObject(avatarKey, img.bytes, img.contentType);
  await db()
    .update(artists)
    .set({ avatarKey, avatar: `/api/avatar/artist/${artistId}` })
    .where(eq(artists.id, artistId));
  return c.json({ avatar: `/api/avatar/artist/${artistId}` });
});

// PUT /api/manage/tracks/:id — rename / move to album (albumId: null detaches)
manageRoutes.put("/tracks/:id", async (c) => {
  const trackId = param(c, "id");
  if (!(await ownsTrack(trackId, c.get("userId"), c.get("role"))))
    return c.json({ error: "forbidden" }, 403);
  const body = z
    .object({
      title: z.string().min(1).max(200).optional(),
      albumId: z.string().nullable().optional(),
      genres: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
      explicit: z.boolean().optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid input" }, 400);
  if (body.data.albumId && !(await canUseAlbum(body.data.albumId, c.get("userId"), c.get("role"))))
    return c.json({ error: "чужой альбом" }, 403);

  // newly attached to an album -> append at the end instead of sitting at null forever
  if (body.data.albumId) {
    const current = await db()
      .select({ albumId: tracks.albumId })
      .from(tracks)
      .where(eq(tracks.id, trackId))
      .limit(1);
    if (current[0]?.albumId !== body.data.albumId) {
      const last = await db()
        .select({ n: sql<number>`coalesce(max(${tracks.trackNumber}), 0)` })
        .from(tracks)
        .where(eq(tracks.albumId, body.data.albumId));
      (body.data as { trackNumber?: number }).trackNumber = (last[0]?.n ?? 0) + 1;
    }
  }

  // keep the url slug in step with the title
  const patch = body.data.title
    ? { ...body.data, slug: contentSlug(body.data.title) }
    : body.data;
  await db().update(tracks).set(patch).where(eq(tracks.id, trackId));
  return c.json({ ok: true });
});

// PUT /api/manage/tracks/:id/features — replace the featured-artist list
// (body: { artistIds }). The main artist stays tracks.artistId; these are guests.
manageRoutes.put("/tracks/:id/features", async (c) => {
  const trackId = param(c, "id");
  if (!(await ownsTrack(trackId, c.get("userId"), c.get("role"))))
    return c.json({ error: "forbidden" }, 403);
  const body = z
    .object({ artistIds: z.array(z.string()).max(10) })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid input" }, 400);

  const track = await db()
    .select({ artistId: tracks.artistId })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  // the primary artist is already implied — don't duplicate them as a feature
  const ids = [...new Set(body.data.artistIds)].filter((a) => a !== track[0]?.artistId);

  await db().delete(trackArtists).where(eq(trackArtists.trackId, trackId));
  if (ids.length)
    await db()
      .insert(trackArtists)
      .values(ids.map((artistId) => ({ trackId, artistId })))
      .onConflictDoNothing();
  return c.json({ ok: true, count: ids.length });
});

// DELETE /api/manage/tracks/:id — track + versions + lyrics (cascade) + S3 files
manageRoutes.delete("/tracks/:id", async (c) => {
  const trackId = param(c, "id");
  if (!(await ownsTrack(trackId, c.get("userId"), c.get("role"))))
    return c.json({ error: "forbidden" }, 403);

  const [versions, trackRow] = await Promise.all([
    db()
      .select({ audioKey: trackVersions.audioKey })
      .from(trackVersions)
      .where(eq(trackVersions.trackId, trackId)),
    db()
      .select({ coverKey: tracks.coverKey, clipKey: tracks.clipKey })
      .from(tracks)
      .where(eq(tracks.id, trackId))
      .limit(1),
  ]);
  await db().delete(tracks).where(eq(tracks.id, trackId));
  for (const v of versions) await deleteObject(v.audioKey);
  if (trackRow[0]?.coverKey) await deleteObject(trackRow[0].coverKey);
  if (trackRow[0]?.clipKey) await deleteObject(trackRow[0].clipKey);
  return c.json({ ok: true });
});

async function getVersion(versionId: string) {
  const found = await db()
    .select()
    .from(trackVersions)
    .where(eq(trackVersions.id, versionId))
    .limit(1);
  return found[0] ?? null;
}

// POST /api/manage/versions/:id/primary — make this version the default one
manageRoutes.post("/versions/:id/primary", async (c) => {
  const version = await getVersion(param(c, "id"));
  if (!version) return c.json({ error: "not found" }, 404);
  if (!(await ownsTrack(version.trackId, c.get("userId"), c.get("role"))))
    return c.json({ error: "forbidden" }, 403);
  await db()
    .update(trackVersions)
    .set({ isPrimary: false })
    .where(eq(trackVersions.trackId, version.trackId));
  await db().update(trackVersions).set({ isPrimary: true }).where(eq(trackVersions.id, version.id));
  await db()
    .update(tracks)
    .set({ primaryVersionId: version.id })
    .where(eq(tracks.id, version.trackId));
  return c.json({ ok: true });
});

// PUT /api/manage/versions/:id — edit kind / label
manageRoutes.put("/versions/:id", async (c) => {
  const version = await getVersion(param(c, "id"));
  if (!version) return c.json({ error: "not found" }, 404);
  if (!(await ownsTrack(version.trackId, c.get("userId"), c.get("role"))))
    return c.json({ error: "forbidden" }, 403);
  const body = z
    .object({
      kind: z.enum(VERSION_KINDS).optional(),
      label: z.string().max(80).nullable().optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid input" }, 400);
  await db().update(trackVersions).set(body.data).where(eq(trackVersions.id, version.id));
  return c.json({ ok: true });
});

// DELETE /api/manage/versions/:id — remove version + audio; re-point primary if needed
manageRoutes.delete("/versions/:id", async (c) => {
  const version = await getVersion(param(c, "id"));
  if (!version) return c.json({ error: "not found" }, 404);
  if (!(await ownsTrack(version.trackId, c.get("userId"), c.get("role"))))
    return c.json({ error: "forbidden" }, 403);

  await db().delete(trackVersions).where(eq(trackVersions.id, version.id));
  await deleteObject(version.audioKey);

  if (version.isPrimary) {
    const next = await db()
      .select({ id: trackVersions.id })
      .from(trackVersions)
      .where(and(eq(trackVersions.trackId, version.trackId), ne(trackVersions.id, version.id)))
      .limit(1);
    const nextId = next[0]?.id ?? null;
    if (nextId)
      await db().update(trackVersions).set({ isPrimary: true }).where(eq(trackVersions.id, nextId));
    await db()
      .update(tracks)
      .set({ primaryVersionId: nextId })
      .where(eq(tracks.id, version.trackId));
  }
  return c.json({ ok: true });
});

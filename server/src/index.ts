import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env";
import { authRoutes } from "./routes/auth";
import { trackRoutes } from "./routes/tracks";
import { audioRoutes } from "./routes/audio";
import { coverRoutes } from "./routes/cover";
import { avatarRoutes } from "./routes/avatar";
import { homeRoutes } from "./routes/home";
import { searchRoutes } from "./routes/search";
import { clipRoutes } from "./routes/clip";
import { commentRoutes } from "./routes/comments";
import { adminRoutes } from "./routes/admin";
import { artistRoutes } from "./routes/artists";
import { albumRoutes } from "./routes/albums";
import { playlistRoutes } from "./routes/playlists";
import { meRoutes } from "./routes/me";
import { manageRoutes } from "./routes/manage";
import { lyricsRoutes } from "./routes/lyrics";
import { userRoutes } from "./routes/users";
import { runWith, type ReqCtx } from "./ctx";
import type { AppEnv, Bindings } from "./types";

const app = new Hono<AppEnv>();

// same-origin in prod (one Worker serves the SPA and the API), but keep CORS
// correct for any configured domain — echo back only origins we know.
app.use(
  "*",
  cors({
    origin: (origin) => (env.webOrigins.includes(origin) ? origin : env.webOrigins[0]),
    credentials: true,
  }),
);
app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/api/auth", authRoutes);
app.route("/api/tracks", trackRoutes);
app.route("/api/audio", audioRoutes);
app.route("/api/cover", coverRoutes);
app.route("/api/avatar", avatarRoutes);
app.route("/api/home", homeRoutes);
app.route("/api/search", searchRoutes);
app.route("/api/clip", clipRoutes);
app.route("/api/comments", commentRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/artists", artistRoutes);
app.route("/api/albums", albumRoutes);
app.route("/api/playlists", playlistRoutes);
app.route("/api/me", meRoutes);
app.route("/api/manage", manageRoutes);
app.route("/api/lyrics", lyricsRoutes);
app.route("/api/users", userRoutes);

// Per request: hand the routes the R2 bucket and a DB connection, then close
// the connection. A pool that outlives the request would be reused across
// request contexts, which Workers answer by hanging the next caller.
// Roots are promoted by `pnpm bootstrap` — a Worker has no startup hook.
export default {
  fetch(req, bindings, ctx) {
    // Pages routes every request here, unlike a Worker with static assets where
    // the platform serves files itself. Anything that is not the API is a file.
    if (!new URL(req.url).pathname.startsWith("/api/")) return bindings.ASSETS.fetch(req);

    const store: ReqCtx = {
      connectionString: bindings.HYPERDRIVE.connectionString,
      bucket: bindings.BUCKET,
    };
    return runWith(store, async () => {
      try {
        return await app.fetch(req, bindings, ctx);
      } finally {
        if (store.handle) ctx.waitUntil(store.handle.pool.end());
      }
    });
  },
} satisfies ExportedHandler<Bindings>;

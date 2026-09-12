// End-to-end backend smoke test against the local Worker (`pnpm dev` in server/)
const BASE = process.env.SMOKE_BASE ?? "http://localhost:8787/api";
let cookie = "";

async function call(path, opts = {}) {
  const res = await fetch(BASE + path, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const log = (label, r) =>
  console.log(`${r.status < 400 ? "✓" : "✗"} ${label} [${r.status}]`, JSON.stringify(r.json));

const tracks = await (await fetch(BASE + "/tracks")).json();
const trackId = tracks[0].id;
const uname = "tester_" + Math.floor(Date.now() / 1000);

log("signup", await call("/auth/signup", { method: "POST", body: { username: uname, email: uname + "@x.io", password: "secret123" } }));
log("me", await call("/auth/me"));
log("like", await call(`/me/likes/${trackId}`, { method: "POST" }));
log("library", await call("/me/library"));
const pl = await call("/playlists", { method: "POST", body: { title: "тест-плейлист" } });
log("create playlist", pl);
log("add track", await call(`/playlists/${pl.json.id}/tracks`, { method: "POST", body: { trackId } }));
log("get playlist", await call(`/playlists/${pl.json.id}`));
const artist = await call("/artists", { method: "POST", body: { name: "Тестовый Артист " + uname } });
log("claim artist", artist);
log("my artist", await call("/me/artist"));
log("create track", await call("/manage/tracks", { method: "POST", body: { title: "новый трек", artistId: artist.json.id } }));
log("lyrics", await call(`/manage/tracks/${trackId}/lyrics`, { method: "PUT", body: { content: "[00:01.00]первая строка\n[00:05.00]вторая" } }));
log("logout", await call("/auth/logout", { method: "POST" }));
log("me after logout", await call("/auth/me"));

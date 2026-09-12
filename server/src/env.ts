// Workers populate process.env from vars and secrets under nodejs_compat, so
// plain config still reads at module scope. Bindings (R2, rate limiter) do not
// live here — they arrive per request on the Worker env.
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var: ${name}`);
  return v;
}

export const env = {
  // Worker-side the connection comes from the Hyperdrive binding; this is for
  // the Node scripts (`pnpm bootstrap`, drizzle-kit) that dial Supabase direct.
  databaseUrl: process.env.DATABASE_URL ?? "",
  // comma-separated: the site is served from several domains in prod
  webOrigins: (process.env.WEB_ORIGIN ?? "http://localhost")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  // comma-separated usernames with moderation rights
  adminUsernames: (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  // R2 public/custom domain. Objects are served straight off it so the CDN can
  // cache them; the bucket binding is only used for writes, head and delete.
  publicBaseUrl: req("R2_PUBLIC_BASE_URL").replace(/\/+$/, ""),
};

import type { Context } from "hono";
import { createHash } from "node:crypto";

// Env is generated from wrangler.jsonc by `wrangler types`; ASSETS is the
// static-file fetcher Pages injects and does not appear in that file.
export type Bindings = Env & { ASSETS: Fetcher };

export type AppEnv = {
  Bindings: Bindings;
  Variables: { userId: string; role: "user" | "admin" | "root" };
};

// Hono types param() as string|undefined for non-literal keys; routes guarantee presence.
export function param(c: Context, name: string): string {
  const v = c.req.param(name);
  if (v === undefined) throw new Error(`missing route param: ${name}`);
  return v;
}

export const newId = () => crypto.randomUUID();

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Stable, url-safe 16-char id derived from the full id (which may be a sha256
// or a uuid). Deterministic, so backfilling and re-seeding are idempotent.
export const shortIdFor = (id: string) => createHash("sha256").update(id).digest("hex").slice(0, 16);

// Track/album slug: keeps letters & digits of ANY script (Cyrillic titles must
// not collapse to empty like slugify would), lowercased, spaces -> dashes.
export const contentSlug = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

// Resolve a /track/:param into a real track id. Accepts the full id (old
// links), a bare 16-hex shortId, or `<slug>-<shortId>`.
export function trackShortIdFromParam(param: string): string | null {
  const m = param.match(/([0-9a-f]{16})$/i);
  return m ? m[1].toLowerCase() : null;
}

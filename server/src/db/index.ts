import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { reqCtx } from "../ctx";
import { SUPABASE_CA } from "./supabase-ca";
import * as schema from "./schema";

export type DbHandle = { pool: pg.Pool; db: ReturnType<typeof drizzle<typeof schema>> };

// The Worker reaches Postgres through Hyperdrive's plaintext local endpoint.
// Only the Node-side scripts dial Supabase directly, and that needs its private
// root pinned — Supabase signs the pooler with a CA no public store carries.
const sslFor = (cs: string) => (cs.includes(".supabase.com") ? { ca: SUPABASE_CA } : false);

// node-postgres, not postgres.js: the latter hangs on workerd's TCP shim.
// One pool per request, closed when the request ends — a module-level pool
// leaks sockets across request contexts, which Workers answer by hanging.
// ponytail: that means a connect per request. Put a Hyperdrive binding in front
// when the handshake cost or Supabase's connection count starts to matter —
// only this file and wrangler.jsonc change.
export function db() {
  const ctx = reqCtx();
  if (!ctx.handle) {
    const pool = new pg.Pool({
      connectionString: ctx.connectionString,
      max: 1,
      ssl: sslFor(ctx.connectionString),
    });
    ctx.handle = { pool, db: drizzle(pool, { schema }) };
  }
  return ctx.handle.db;
}

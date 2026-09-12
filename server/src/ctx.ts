import { AsyncLocalStorage } from "node:async_hooks";
import type { DbHandle } from "./db";

// Workers forbid reusing a socket across requests, and the R2 bucket only
// exists on the per-request env. Both live here for the length of one request
// so the 80-odd call sites in the routes don't each have to be handed them.
export type ReqCtx = {
  connectionString: string;
  bucket?: R2Bucket;
  handle?: DbHandle; // opened on first query, so DB-free requests never connect
};

const als = new AsyncLocalStorage<ReqCtx>();

export const runWith = <T>(ctx: ReqCtx, fn: () => T): T => als.run(ctx, fn);

export function reqCtx(): ReqCtx {
  const s = als.getStore();
  if (!s) throw new Error("no request context — called outside runWith()");
  return s;
}

export function bucket(): R2Bucket {
  const b = reqCtx().bucket;
  if (!b) throw new Error("no R2 bucket in this context");
  return b;
}

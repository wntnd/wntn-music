import { bucket } from "./ctx";
import { env } from "./env";

// Download URL — used by the /api/audio, /cover, /avatar, /clip redirects.
// Objects are served straight off the R2 public domain so the CDN caches them;
// nothing is signed, so this is a pure string build.
export function objectUrl(key: string): string {
  return `${env.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function objectExists(key: string): Promise<boolean> {
  return (await bucket().head(key)) !== null;
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  await bucket().put(key, body, { httpMetadata: { contentType } });
}

// Best-effort delete — callers don't fail the request over a stale object.
export async function deleteObject(key: string) {
  try {
    await bucket().delete(key);
  } catch (e) {
    console.error(`deleteObject ${key} failed:`, e);
  }
}

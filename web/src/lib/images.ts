export type PostImage = { url: string; alt?: string };

export const MAX_IMAGES = 4;
// Only accept our own image URLs: the LinkedIn adapter downloads these
// server-side, so arbitrary URLs would be an SSRF hole. Two shapes are allowed:
// a direct Blob-store URL, or our own `/i/` proxy (on `selfOrigin`), which is
// what card/upload now return.
const BLOB_HOST = /^[a-z0-9-]+\.(?:public|private)\.blob\.vercel-storage\.com$/i;

export function parseImages(
  raw: unknown,
  selfOrigin?: string,
): PostImage[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_IMAGES) return null;
  const out: PostImage[] = [];
  for (const r of raw) {
    if (!r || typeof r.url !== "string") return null;
    let u: URL;
    try {
      u = new URL(r.url);
    } catch {
      return null;
    }
    const isBlob = u.protocol === "https:" && BLOB_HOST.test(u.hostname);
    const isProxy =
      !!selfOrigin && u.origin === selfOrigin && u.pathname.startsWith("/i/");
    if (!isBlob && !isProxy) return null;
    out.push({
      url: u.toString(),
      alt:
        typeof r.alt === "string" && r.alt.trim()
          ? r.alt.slice(0, 300)
          : undefined,
    });
  }
  return out;
}

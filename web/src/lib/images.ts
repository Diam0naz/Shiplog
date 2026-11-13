export type PostImage = { url: string; alt?: string };

export const MAX_IMAGES = 4;
// Only accept URLs from our own Blob store: the LinkedIn adapter downloads
// these server-side, so arbitrary URLs would be an SSRF hole. Private blobs
// are handed out as short-lived signed URLs, which still live on this host.
const BLOB_HOST = /^[a-z0-9-]+\.(?:public|private)\.blob\.vercel-storage\.com$/i;

export function parseImages(raw: unknown): PostImage[] | null {
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
    if (u.protocol !== "https:" || !BLOB_HOST.test(u.hostname)) return null;
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

import { issueSignedToken, presignUrl } from "@vercel/blob";

/** How long a private image stays fetchable by LinkedIn and Neynar. */
const URL_TTL_MS = 60 * 60 * 1000;

/**
 * Private Blob URLs require our credentials, which LinkedIn and Neynar don't
 * have. Exchange the pathname for a short-lived presigned GET URL they can
 * fetch without auth. Cards and uploads are posted within minutes of creation,
 * so an hour is plenty.
 */
export async function signedBlobUrl(pathname: string): Promise<string> {
  const validUntil = Date.now() + URL_TTL_MS;
  const token = await issueSignedToken({
    pathname,
    operations: ["get"],
    validUntil,
  });
  const { presignedUrl } = await presignUrl(token, {
    operation: "get",
    pathname,
    access: "private",
    validUntil,
  });
  return presignedUrl;
}

/**
 * A short, permanent public URL that serves a private blob through our own
 * `/i/` proxy. Unlike a presigned URL it never expires and stays well under
 * Farcaster's 256-byte embed limit, so it's safe to embed in a cast.
 */
export function blobProxyUrl(pathname: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}/i/${pathname}`;
}

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

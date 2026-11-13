import { NotConnectedError } from "./publish";
import { loadFarcaster, saveFarcaster, type FarcasterAuth } from "./tokens";
import type { PostImage } from "./images";

/**
 * Farcaster integration via Neynar Sign In With Neynar (SIWN).
 *
 * Farcaster does NOT use OAuth 2.0. There are no `/oauth/authorize` or `/oauth/token`
 * endpoints on farcaster.xyz. The "Why Farcaster Doesn't Need OAuth 2.0" blog post
 * explains the architecture: users sign messages with their Farcaster key (EIP-4361),
 * and apps write on their behalf using a signer the user approves.
 *
 * Neynar provides SIWN: a managed auth flow that returns (fid, signer_uuid) to your
 * frontend. Your backend then verifies the signer is approved and stores it.
 *
 * Flow:
 * 1. Frontend shows "Connect Farcaster" button → opens Neynar SIWN modal
 * 2. User approves in their Farcaster wallet (Warpcast, etc.)
 * 3. Neynar redirects back to your page with ?fid=...&signer_uuid=...
 * 4. Frontend POSTs { fid, signer_uuid } to /api/farcaster/connect
 * 5. Backend verifies signer via Neynar, fetches profile, stores encrypted
 * 6. CLI can now post casts using the signer_uuid via Neynar
 */

export const FARCASTER_CONNECT_PATH = "/connect/farcaster"; // Frontend page with SIWN button

const apiBase = () =>
  (process.env.FARCASTER_API_BASE ?? "https://api.neynar.com/v2").replace(
    /\/$/,
    "",
  );

const neynarHeaders = () => {
  const key = process.env.FARCASTER_API_KEY;
  if (!key) throw new Error("FARCASTER_API_KEY is not set (Neynar API key)");
  return { "x-api-key": key, "Content-Type": "application/json" };
};

/**
 * Verify a Neynar signer and store the connection.
 * Called by your API route with { fid, signer_uuid } from the SIWN callback.
 * Never trust the browser: confirm with Neynar that the signer is approved
 * and belongs to that fid.
 */
export async function connectFarcaster(
  userId: string,
  fid: number,
  signerUuid: string,
) {
  // 1. Verify signer is approved and matches the fid
  const sRes = await fetch(
    `${apiBase()}/farcaster/signer?signer_uuid=${encodeURIComponent(signerUuid)}`,
    { headers: neynarHeaders() },
  );
  if (!sRes.ok) throw new Error(`Signer lookup failed (${sRes.status})`);
  const signer = (await sRes.json()) as { status: string; fid?: number };
  if (signer.status !== "approved" || !signer.fid)
    throw new Error(`Signer not approved (status: ${signer.status})`);
  if (signer.fid !== fid) throw new Error("Signer FID mismatch");

  // 2. Fetch user profile
  const uRes = await fetch(`${apiBase()}/farcaster/user/bulk?fids=${fid}`, {
    headers: neynarHeaders(),
  });
  const user = (await uRes.json()).users?.[0];
  if (!user) throw new Error("Could not load Farcaster profile");

  // 3. Store encrypted
  const auth: FarcasterAuth = {
    fid,
    username: user.username,
    displayName: user.display_name,
    pfpUrl: user.pfp_url,
    signerUuid,
  };
  await saveFarcaster(userId, auth);
  return auth;
}

/** Check if a signer is still approved (for polling after SIWN redirect). */
export async function checkSignerStatus(
  signerUuid: string,
): Promise<{ approved: boolean; fid?: number }> {
  try {
    const sRes = await fetch(
      `${apiBase()}/farcaster/signer?signer_uuid=${encodeURIComponent(signerUuid)}`,
      { headers: neynarHeaders() },
    );
    if (!sRes.ok) return { approved: false };
    const signer = (await sRes.json()) as { status: string; fid?: number };
    return { approved: signer.status === "approved", fid: signer.fid };
  } catch {
    return { approved: false };
  }
}

/** Post a cast using the stored signer. */
export async function postToFarcaster(userId: string, text: string, images: PostImage[] = []) {
  const auth = await loadFarcaster(userId);
  if (!auth)
    throw new NotConnectedError(
      `Farcaster not connected. Connect at ${FARCASTER_CONNECT_PATH}`,
    );

  const res = await fetch(`${apiBase()}/farcaster/cast`, {
    method: "POST",
    headers: neynarHeaders(),
    body: JSON.stringify({
      signer_uuid: auth.signerUuid,
      text,
      ...(images.length
        ? { embeds: images.slice(0, 2).map((i) => ({ url: i.url })) }
        : {}),
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    cast?: { hash?: string };
    message?: string;
    detail?: string;
  } | null;
  if (!res.ok)
    throw new Error(
      `Farcaster error ${res.status}: ${body?.message ?? body?.detail ?? "unknown"}`,
    );
  const hash = body?.cast?.hash;
  if (!hash)
    throw new Error("Farcaster accepted the cast but returned no hash");
  // Warpcast permalinks use the short form of the cast hash.
  const shortHash = hash.slice(0, 10);
  return { id: hash, url: `https://warpcast.com/${auth.username}/${shortHash}` };
}

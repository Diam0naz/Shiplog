import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ExpiredError, NotConnectedError } from "./publish";
import { loadFarcaster, saveFarcaster, type FarcasterAuth } from "./tokens";

export const FARCASTER_CONNECT_PATH = "/api/farcaster/connect";

// Farcaster Auth Kit / SIWF endpoints
const FARCASTER_AUTH_BASE = "https://farcaster.xyz";
const FARCASTER_JWKS_URI = "https://farcaster.xyz/.well-known/jwks.json";

const apiBase = () =>
  (process.env.FARCASTER_API_BASE ?? "https://api.neynar.com/v2").replace(
    /\/$/,
    "");

const authBase = () => FARCASTER_AUTH_BASE;

export const FARCASTER_SCOPES = "openid";

/** Reconnect instructions shared by the connect route and post failures. */
export function redirectUriFor(requestUrl: string) {
  return (
    process.env.FARCASTER_REDIRECT_URI ??
    `${new URL(requestUrl).origin}/api/farcaster/callback`
  );
}

function clientId() {
  const id = process.env.FARCASTER_CLIENT_ID;
  if (!id)
    throw new Error(
      "FARCASTER_CLIENT_ID is not set: create a Farcaster app in the developer portal and add its client id",
    );
  return id;
}

function clientSecret(): string | undefined {
  const secret = process.env.FARCASTER_CLIENT_SECRET;
  if (!secret) return undefined;
  return secret;
}

/** SHA-256 + base64url, the S256 PKCE challenge. */
function challengeFor(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function createPkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: challengeFor(verifier) };
}

export function authorizeUrl(
  state: string,
  challenge: string,
  redirectUri: string,
) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    redirect_uri: redirectUri,
    scope: FARCASTER_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${authBase()}/oauth/authorize?${params}`;
}

/** JWKS for verifying Farcaster ID tokens. */
const jwks = createRemoteJWKSet(new URL(FARCASTER_JWKS_URI));

/** Verify and decode Farcaster ID token (JWT). */
async function verifyIdToken(idToken: string): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: "https://farcaster.xyz",
      audience: clientId(),
    });
    return payload as Record<string, unknown>;
  } catch (e) {
    console.error("Farcaster ID token verification failed:", e);
    return null;
  }
}

/** Exchange authorization code for tokens. */
async function tokenRequest(body: URLSearchParams) {
  const id = clientId();
  const secret = clientSecret();
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  // Public clients (no secret) send client_id in body; confidential clients use Basic auth
  if (secret) {
    headers.Authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  } else {
    body.set("client_id", id);
  }

  const res = await fetch(`${authBase()}/oauth/token`, {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) {
    throw new Error(
      `Farcaster token request failed (${res.status}): ${await res.text()}`,
    );
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
    signer_uuid?: string;
  };
}

export async function exchangeCode(
  userId: string,
  code: string,
  verifier: string,
  redirectUri: string,
) {
  const tok = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  );

  // Verify and decode ID token (JWT)
  let fid: number | undefined;
  let username: string | undefined;
  let displayName: string | undefined;
  let pfpUrl: string | undefined;

  if (tok.id_token) {
    const payload = await verifyIdToken(tok.id_token);
    if (payload) {
      // Standard OIDC claims from SIWF
      fid = typeof payload.sub === "string" ? parseInt(payload.sub, 10) : undefined;
      username = payload.username as string | undefined;
      displayName = payload.name as string | undefined;
      pfpUrl = payload.picture as string | undefined;
    }
  }

  // Fallback: fetch user info from Neynar if we have access token
  if ((!fid || !username) && tok.access_token) {
    try {
      const userRes = await fetch(`${apiBase()}/farcaster/user/me`, {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        fid = userData.fid;
        username = userData.username;
        displayName = userData.display_name;
        pfpUrl = userData.pfp_url;
      }
    } catch {
      // Ignore fallback errors
    }
  }

  if (!fid) throw new Error("Could not determine Farcaster FID");
  if (!username) throw new Error("Could not determine Farcaster username");
  if (!tok.signer_uuid) throw new Error("No signer UUID returned — cannot post");

  const auth: FarcasterAuth = {
    fid,
    username,
    displayName,
    pfpUrl,
    signerUuid: tok.signer_uuid,
  };

  await saveFarcaster(userId, auth);
  return auth;
}

/** Get a fresh access token (Farcaster tokens don't expire the same way) */
export async function freshToken(userId: string) {
  const auth = await loadFarcaster(userId);
  if (!auth)
    throw new NotConnectedError(`Farcaster not connected. Connect at ${FARCASTER_CONNECT_PATH}`);
  return auth;
}

export async function postToFarcaster(userId: string, text: string) {
  const auth = await freshToken(userId);

  if (!auth.signerUuid) {
    throw new Error("No signer UUID stored — reconnect Farcaster");
  }

  // Use Neynar API to cast (post) with signer
  const res = await fetch(`${apiBase()}/farcaster/cast`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FARCASTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      signer_uuid: auth.signerUuid,
      text,
    }),
  });

  const body = (await res.json().catch(() => null)) as {
    cast?: { hash: string; author: { fid: number; username: string } };
    detail?: string;
  } | null;

  if (!res.ok) {
    const detail = body?.detail ?? `HTTP ${res.status}`;
    console.error("Farcaster post failed", res.status, detail);
    throw new Error(`Farcaster error ${res.status}: ${detail}`);
  }

  const cast = body?.cast;
  if (!cast?.hash) throw new Error("Farcaster accepted the cast but returned no hash");

  return {
    id: cast.hash,
    url: `https://warpcast.com/${auth.username}/${cast.hash}`,
  };
}
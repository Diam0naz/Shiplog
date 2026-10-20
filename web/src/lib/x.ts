import { createHash, randomBytes } from "node:crypto";
import { ExpiredError, NotConnectedError } from "./publish";
import { loadX, saveX, type XAuth } from "./tokens";

// X's OAuth 2.0 endpoints. The bases are overridable so the flow can be run
// against a local mock in tests without touching the real API.
const apiBase = () =>
  (process.env.X_API_BASE ?? "https://api.x.com").replace(/\/$/, "");
const authBase = () =>
  (process.env.X_AUTH_BASE ?? "https://x.com").replace(/\/$/, "");

export const X_SCOPES = "tweet.read tweet.write users.read offline.access";

/** Reconnect instructions shared by the connect route and post failures. */
export const X_CONNECT_PATH = "/api/x/connect";

/**
 * The redirect URI must match the X app exactly, so X_REDIRECT_URI wins when
 * set; otherwise it follows whatever origin the request came in on, which is
 * correct for localhost and for preview deployments.
 */
export function redirectUriFor(requestUrl: string) {
  return (
    process.env.X_REDIRECT_URI ??
    `${new URL(requestUrl).origin}/api/x/callback`
  );
}

function clientId() {
  const id = process.env.X_CLIENT_ID;
  if (!id)
    throw new Error(
      "X_CLIENT_ID is not set: create an OAuth 2.0 app in the X developer portal and add its client id",
    );
  return id;
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
    scope: X_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${authBase()}/i/oauth2/authorize?${params}`;
}

/**
 * Confidential apps authenticate with HTTP Basic; public clients (no secret)
 * must send `client_id` in the form body instead.
 */
async function tokenRequest(body: URLSearchParams) {
  const id = clientId();
  const secret = process.env.X_CLIENT_SECRET;
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (secret) {
    headers.Authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  }
  body.set("client_id", id);

  const res = await fetch(`${apiBase()}/2/oauth2/token`, {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) {
    throw new Error(`X token request failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
}

export async function exchangeCode(
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

  const meRes = await fetch(`${apiBase()}/2/users/me`, {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  if (!meRes.ok) {
    throw new Error(`X profile lookup failed (${meRes.status}): ${await meRes.text()}`);
  }
  const me = (await meRes.json()) as {
    data?: { id: string; username?: string; name?: string };
  };
  if (!me.data?.id) throw new Error("X profile lookup returned no user id");

  const auth: XAuth = {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    // Access tokens are short-lived; refresh slightly early to avoid a race
    // where the token expires between the check and the request.
    expiresAt: Date.now() + (tok.expires_in ?? 7200) * 1000,
    userId: me.data.id,
    username: me.data.username,
  };
  await saveX(auth);
  return auth;
}

/** Refreshes an expired access token and persists the rotated pair. */
async function refresh(auth: XAuth) {
  if (!auth.refreshToken)
    throw new ExpiredError(
      `X connection expired. Reconnect at ${X_CONNECT_PATH}`,
    );
  try {
    const tok = await tokenRequest(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: auth.refreshToken,
      }),
    );
    const next: XAuth = {
      ...auth,
      accessToken: tok.access_token,
      // X rotates refresh tokens; keep the old one only if none came back.
      refreshToken: tok.refresh_token ?? auth.refreshToken,
      expiresAt: Date.now() + (tok.expires_in ?? 7200) * 1000,
    };
    await saveX(next);
    return next;
  } catch (e) {
    throw new ExpiredError(
      `X connection expired. Reconnect at ${X_CONNECT_PATH}: ${
        e instanceof Error ? e.message : "refresh failed"
      }`,
    );
  }
}

export async function freshToken() {
  let auth = await loadX();
  if (!auth)
    throw new NotConnectedError(`X not connected. Connect at ${X_CONNECT_PATH}`);
  if (Date.now() >= auth.expiresAt - 60_000) auth = await refresh(auth);
  return auth;
}

export async function postToX(text: string) {
  const auth = await freshToken();
  const res = await fetch(`${apiBase()}/2/tweets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  const body = (await res.json().catch(() => null)) as {
    data?: { id: string };
    detail?: string;
    title?: string;
  } | null;

  if (!res.ok) {
    const detail = body?.detail ?? body?.title ?? `HTTP ${res.status}`;
    console.error("X post failed", res.status, detail);
    throw new Error(`X error ${res.status}: ${detail}`);
  }
  const id = body?.data?.id;
  if (!id) throw new Error("X accepted the tweet but returned no id");

  return {
    id,
    url: auth.username
      ? `https://x.com/${auth.username}/status/${id}`
      : `https://x.com/i/status/${id}`,
  };
}

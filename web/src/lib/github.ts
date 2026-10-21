/**
 * GitHub OAuth, used only to establish who the user is. The service never
 * calls GitHub after login, so the access token is discarded — the session
 * token in `session.ts` is the credential the CLI keeps.
 */

const oauthBase = () =>
  (process.env.GITHUB_OAUTH_BASE ?? "https://github.com").replace(/\/$/, "");
const apiBase = () =>
  (process.env.GITHUB_API_BASE ?? "https://api.github.com").replace(/\/$/, "");

export const GITHUB_CONNECT_PATH = "/api/github/connect";

/** Only same-origin paths are allowed as a post-login destination. */
export function safeNextPath(value: string | null) {
  return value && /^\/(?!\/)/.test(value) ? value : "/";
}

function clientId() {
  const id = process.env.GITHUB_CLIENT_ID;
  if (!id)
    throw new Error(
      "GITHUB_CLIENT_ID is not set: create a GitHub OAuth App and add its client id",
    );
  return id;
}

function clientSecret() {
  const secret = process.env.GITHUB_CLIENT_SECRET;
  if (!secret)
    throw new Error(
      "GITHUB_CLIENT_SECRET is not set: create a GitHub OAuth App and add its client secret",
    );
  return secret;
}

export function githubRedirectUriFor(requestUrl: string) {
  return (
    process.env.GITHUB_REDIRECT_URI ??
    `${new URL(requestUrl).origin}/api/github/callback`
  );
}

export function githubAuthorizeUrl(state: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    // Identity only — no repository access.
    scope: "read:user",
    state,
  });
  return `${oauthBase()}/login/oauth/authorize?${params}`;
}

export async function exchangeGithubCode(code: string, redirectUri: string) {
  const res = await fetch(`${oauthBase()}/login/oauth/access_token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      code,
      redirect_uri: redirectUri,
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  } | null;
  if (!res.ok || !body?.access_token) {
    throw new Error(
      `GitHub token exchange failed (${res.status}): ${
        body?.error_description ?? body?.error ?? "no access token"
      }`,
    );
  }
  return body.access_token;
}

export async function fetchGithubUser(accessToken: string) {
  const res = await fetch(`${apiBase()}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub profile lookup failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    id?: number;
    login?: string;
    name?: string | null;
    avatar_url?: string;
  };
  if (!data.id || !data.login)
    throw new Error("GitHub profile lookup returned no id or login");
  return {
    id: String(data.id),
    login: data.login,
    name: data.name ?? undefined,
    avatarUrl: data.avatar_url,
  };
}

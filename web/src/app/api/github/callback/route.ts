import { NextRequest, NextResponse } from "next/server";
import {
  exchangeGithubCode,
  fetchGithubUser,
  githubRedirectUriFor,
  safeNextPath,
} from "@/lib/github";
import {
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
  upsertUser,
} from "@/lib/session";
import { themedError } from "@/lib/oauth-response";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get("gh_state")?.value;

  if (!code || !state || !expected || state !== expected)
    return themedError("Invalid state", "The OAuth state parameter is missing or doesn't match. Please try again.");

  if (req.nextUrl.searchParams.get("error"))
    return themedError(
      "GitHub declined the login",
      "GitHub declined the authorization request.",
      req.nextUrl.searchParams.get("error_description") ??
        req.nextUrl.searchParams.get("error") ??
        "Unknown error",
      400
    );

  try {
    const accessToken = await exchangeGithubCode(
      code,
      githubRedirectUriFor(req.url),
    );
    const profile = await fetchGithubUser(accessToken);
    const user = await upsertUser(profile);
    const token = await createSession(user.id);

    const res = NextResponse.redirect(
      new URL(safeNextPath(req.cookies.get("gh_next")?.value ?? null), req.url),
    );
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    res.cookies.delete("gh_state");
    res.cookies.delete("gh_next");
    return res;
  } catch (e) {
    return themedError("Could not sign in with GitHub", "Failed to complete the GitHub sign-in.", e instanceof Error ? e.message : "unknown error", 500);
  }
}

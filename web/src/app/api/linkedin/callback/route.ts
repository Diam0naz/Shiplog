import { NextRequest } from "next/server";
import { userFromCookie } from "@/lib/session";
import { saveLinkedIn } from "@/lib/tokens";
import { themedError, themedSuccess } from "@/lib/oauth-response";

export async function GET(req: NextRequest) {
  const user = await userFromCookie(req);
  if (!user)
    return themedError("Sign in required", "Please sign in with GitHub first.", undefined, 401);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("li_state")?.value) {
    return themedError("Invalid state", "The OAuth state parameter is missing or doesn't match. Please try again.");
  }

  const tokenRes = await fetch(
    "https://www.linkedin.com/oauth/v2/accessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }),
    },
  );
  if (!tokenRes.ok) {
    return themedError("Token exchange failed", "Failed to exchange the authorization code for an access token.", await tokenRes.text(), 502);
  }
  const tok = await tokenRes.json();

  const infoRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  if (!infoRes.ok) {
    return themedError("Profile lookup failed", "Failed to fetch your LinkedIn profile.", await infoRes.text(), 502);
  }
  const info = await infoRes.json();

  try {
    await saveLinkedIn(user.id, {
      accessToken: tok.access_token,
      // LinkedIn tokens last ~60 days; fall back to that if expires_in is absent
      // so expiresAt is never NaN (which would read as "never expires").
      expiresAt: Date.now() + (tok.expires_in ?? 60 * 24 * 60 * 60) * 1000,
      personUrn: `urn:li:person:${info.sub}`,
      name: info.name,
    });
  } catch (e) {
    return themedError("Could not store token", "Failed to save your LinkedIn connection.", e instanceof Error ? e.message : "unknown error", 500);
  }

  const res = themedSuccess("LinkedIn connected", `LinkedIn connected${info.name ? " as " + info.name : ""}.`);
  res.cookies.delete("li_state");
  return res;
}

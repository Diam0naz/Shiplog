import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { userFromCookie } from "@/lib/session";

export async function GET(req: NextRequest) {
  const user = await userFromCookie(req);
  if (!user) {
    // Connecting an account has to belong to somebody; sign in first and come
    // back to this URL.
    return NextResponse.redirect(
      new URL(
        `/api/github/connect?next=${encodeURIComponent("/api/linkedin/connect")}`,
        req.url,
      ),
    );
  }

  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
    state,
    // openid + profile identify the member; w_member_social is what lets the
    // app publish on their behalf. Posting fails without it, so it is required
    // here — the LinkedIn app needs both "Sign In with LinkedIn using OpenID
    // Connect" and "Share on LinkedIn" products approved.
    scope: "openid profile w_member_social",
  });
  const res = NextResponse.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params}`);
  res.cookies.set("li_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}

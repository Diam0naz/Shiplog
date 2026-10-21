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
    // Requires "Sign In with LinkedIn" product approval
    scope: "openid profile",
    // Add "w_member_social" after "Share on LinkedIn" is approved
    // scope: "openid profile w_member_social",
  });
  const res = NextResponse.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params}`);
  res.cookies.set("li_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}

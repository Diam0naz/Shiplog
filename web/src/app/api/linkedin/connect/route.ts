import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
    state,
    scope: "openid profile w_member_social",
  });
  const res = NextResponse.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params}`);
  res.cookies.set("li_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
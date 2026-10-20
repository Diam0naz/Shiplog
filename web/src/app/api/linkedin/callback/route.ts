import { NextRequest, NextResponse } from "next/server";
import { saveLinkedIn } from "@/lib/tokens";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("li_state")?.value) {
    return new NextResponse("Invalid state", { status: 400 });
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
    return new NextResponse(`Token exchange failed: ${await tokenRes.text()}`, {
      status: 502,
    });
  }
  const tok = await tokenRes.json();

  const infoRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  if (!infoRes.ok) {
    return new NextResponse(`Profile lookup failed: ${await infoRes.text()}`, {
      status: 502,
    });
  }
  const info = await infoRes.json();

  try {
    await saveLinkedIn({
      accessToken: tok.access_token,
      expiresAt: Date.now() + tok.expires_in * 1000,
      personUrn: `urn:li:person:${info.sub}`,
      name: info.name,
    });
  } catch (e) {
    // Don't report success when the token could not be persisted (read-only
    // filesystem on serverless, missing store, bad TOKEN_ENC_KEY, …).
    return new NextResponse(
      `Could not store the LinkedIn token: ${
        e instanceof Error ? e.message : "unknown error"
      }`,
      { status: 500, headers: { "Content-Type": "text/plain" } },
    );
  }

  const res = new NextResponse(
    `LinkedIn connected${info.name ? " as " + info.name : ""}. You can close this tab.`,
    { headers: { "Content-Type": "text/plain" } },
  );
  res.cookies.delete("li_state");
  return res;
}

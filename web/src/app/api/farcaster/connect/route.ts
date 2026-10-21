import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { userFromCookie } from "@/lib/session";
import { authorizeUrl, createPkce, redirectUriFor } from "@/lib/farcaster";
import { themedError } from "@/lib/oauth-response";

export async function GET(req: NextRequest) {
  const user = await userFromCookie(req);
  if (!user) {
    return NextResponse.redirect(
      new URL(
        `/api/github/connect?next=${encodeURIComponent("/api/farcaster/connect")}`,
        req.url,
      ),
    );
  }

  // PKCE: the verifier stays in an httpOnly cookie, only its hash travels to Farcaster.
  const state = randomBytes(16).toString("hex");
  const { verifier, challenge } = createPkce();

  let url: string;
  try {
    url = authorizeUrl(state, challenge, redirectUriFor(req.url));
  } catch (e) {
    return themedError(
      "Could not start Farcaster login",
      "Failed to build the Farcaster authorization URL.",
      e instanceof Error ? e.message : "unknown error",
      500,
    );
  }

  const res = NextResponse.redirect(url);
  const common = {
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 600,
    path: "/",
  };
  res.cookies.set("fc_state", state, common);
  res.cookies.set("fc_verifier", verifier, common);
  return res;
}
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { authorizeUrl, createPkce, redirectUriFor } from "@/lib/x";

export async function GET(req: NextRequest) {
  // PKCE: the verifier stays in an httpOnly cookie, only its hash travels to X.
  const state = randomBytes(16).toString("hex");
  const { verifier, challenge } = createPkce();

  let url: string;
  try {
    url = authorizeUrl(state, challenge, redirectUriFor(req.url));
  } catch (e) {
    return new NextResponse(
      e instanceof Error ? e.message : "could not start the X login",
      { status: 500, headers: { "Content-Type": "text/plain" } },
    );
  }

  const res = NextResponse.redirect(url);
  const common = {
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 600,
    path: "/",
  };
  res.cookies.set("x_state", state, common);
  res.cookies.set("x_verifier", verifier, common);
  return res;
}

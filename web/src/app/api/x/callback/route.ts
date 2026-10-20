import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, redirectUriFor } from "@/lib/x";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const verifier = req.cookies.get("x_verifier")?.value;

  if (!code || !state || state !== req.cookies.get("x_state")?.value) {
    return new NextResponse("Invalid state", { status: 400 });
  }
  if (!verifier) {
    return new NextResponse(
      "Missing PKCE verifier — start again at /api/x/connect",
      { status: 400 },
    );
  }

  const params = req.nextUrl.searchParams;
  if (params.get("error")) {
    return new NextResponse(
      `X declined the authorization: ${params.get("error_description") ?? params.get("error")}`,
      { status: 400 },
    );
  }

  let username: string | undefined;
  try {
    const auth = await exchangeCode(code, verifier, redirectUriFor(req.url));
    username = auth.username;
  } catch (e) {
    // Covers a failed token exchange, a failed profile lookup, a missing
    // TOKEN_ENC_KEY, and a non-writable filesystem — all of which must not be
    // reported as a successful connection.
    return new NextResponse(
      `Could not connect X: ${e instanceof Error ? e.message : "unknown error"}`,
      { status: 500, headers: { "Content-Type": "text/plain" } },
    );
  }

  const res = new NextResponse(
    `X connected${username ? " as @" + username : ""}. You can close this tab.`,
    { headers: { "Content-Type": "text/plain" } },
  );
  res.cookies.delete("x_state");
  res.cookies.delete("x_verifier");
  return res;
}

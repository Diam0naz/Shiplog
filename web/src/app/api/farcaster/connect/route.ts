import { NextRequest, NextResponse } from "next/server";
import { userFromCookie } from "@/lib/session";
import { connectFarcaster } from "@/lib/farcaster";

/**
 * Receives { fid, signer_uuid } from the SIWN frontend callback.
 * Verifies signer with Neynar and stores encrypted connection.
 *
 * This is a browser-driven flow: the SIWN page fetches this route with the
 * session cookie, not a bearer token, so it authenticates by cookie like the
 * LinkedIn and X connect routes.
 */
export async function POST(req: NextRequest) {
  const user = await userFromCookie(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { fid?: unknown; signer_uuid?: unknown };
  const fid = typeof body.fid === "number" ? body.fid : undefined;
  const signerUuid = typeof body.signer_uuid === "string" ? body.signer_uuid : undefined;

  if (!fid || !signerUuid)
    return NextResponse.json({ error: "missing fid or signer_uuid" }, { status: 400 });

  try {
    const auth = await connectFarcaster(user.id, fid, signerUuid);
    // Consumed by fetch() on the SIWN page, so return JSON, not HTML.
    return NextResponse.json({ ok: true, username: auth.username });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to connect Farcaster" },
      { status: 500 },
    );
  }
}
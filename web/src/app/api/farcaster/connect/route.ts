import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { connectFarcaster } from "@/lib/farcaster";
import { themedError, themedSuccess } from "@/lib/oauth-response";

/**
 * Receives { fid, signer_uuid } from the SIWN frontend callback.
 * Verifies signer with Neynar and stores encrypted connection.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { fid?: unknown; signer_uuid?: unknown };
  const fid = typeof body.fid === "number" ? body.fid : undefined;
  const signerUuid = typeof body.signer_uuid === "string" ? body.signer_uuid : undefined;

  if (!fid || !signerUuid)
    return NextResponse.json({ error: "missing fid or signer_uuid" }, { status: 400 });

  try {
    await connectFarcaster(user.id, fid, signerUuid);
    // Return success — frontend shows themed page
    return themedSuccess("Farcaster connected", `Farcaster connected as @${fid}.`);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to connect Farcaster" },
      { status: 500 },
    );
  }
}
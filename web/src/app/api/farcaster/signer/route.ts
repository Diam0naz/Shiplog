import { NextRequest, NextResponse } from "next/server";
import { userFromCookie } from "@/lib/session";
import { createManagedSigner, refreshSignerStatus } from "@/lib/farcaster";

/**
 * Managed-signer connect flow, driven by the /connect/farcaster page.
 *  POST — create a signer and return its approval URL (open in a wallet).
 *  GET  — poll until the user has approved the signer.
 * Browser-driven, so it authenticates by session cookie.
 */
export async function POST(req: NextRequest) {
  const user = await userFromCookie(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { approvalUrl } = await createManagedSigner(user.id);
    return NextResponse.json({ approval_url: approvalUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not create a signer" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const user = await userFromCookie(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const state = await refreshSignerStatus(user.id);
    return NextResponse.json(state);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not read signer status" },
      { status: 500 },
    );
  }
}

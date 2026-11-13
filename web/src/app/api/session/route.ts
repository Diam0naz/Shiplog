import { NextResponse } from "next/server";
import {
  bearerToken,
  deleteSession,
  requireUser,
  userFromToken,
} from "@/lib/session";

/** `shiplog status` — who the current bearer token belongs to. */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    login: user.login,
    name: user.name ?? null,
    avatarUrl: user.avatarUrl ?? null,
  });
}

/** `shiplog logout` — revokes the bearer token it was called with. */
export async function DELETE(req: Request) {
  const token = bearerToken(req);
  if (!token)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const user = await userFromToken(token);
    if (!user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    await deleteSession(token);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not revoke the session" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { leavePod } from "@/lib/builders";

/** POST — leave a pod: { podId }. */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { podId?: unknown };
  if (typeof body.podId !== "string" || !body.podId.trim())
    return NextResponse.json({ error: "podId is required" }, { status: 400 });
  try {
    await leavePod(user.id, body.podId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not leave pod" },
      { status: 500 },
    );
  }
}

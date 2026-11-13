import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getBuilder, listPods, optIn, optOut } from "@/lib/builders";

/** GET — my builder profile and pods (with this-week cadence). */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const builder = await getBuilder(user.id);
    const pods = builder ? await listPods(user.id) : [];
    return NextResponse.json({ builder, pods });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not load builder" },
      { status: 500 },
    );
  }
}

/** POST — opt in / update profile: { handle, tags?, primaryLang? }. */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    handle?: unknown;
    tags?: unknown;
    primaryLang?: unknown;
  };
  if (typeof body.handle !== "string" || !body.handle.trim())
    return NextResponse.json({ error: "handle is required" }, { status: 400 });
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === "string")
    : [];
  const primaryLang =
    typeof body.primaryLang === "string" ? body.primaryLang : undefined;
  try {
    const builder = await optIn(user.id, body.handle, tags, primaryLang);
    return NextResponse.json({ builder });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not opt in" },
      { status: 500 },
    );
  }
}

/** DELETE — opt out: remove the profile and all pod memberships. */
export async function DELETE(req: Request) {
  const user = await requireUser(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await optOut(user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not opt out" },
      { status: 500 },
    );
  }
}

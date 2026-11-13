import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { createPod, getBuilder } from "@/lib/builders";

/** POST — create a pod: { name }. The caller must already be a builder. */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  if (typeof body.name !== "string" || !body.name.trim())
    return NextResponse.json({ error: "pod name is required" }, { status: 400 });
  try {
    if (!(await getBuilder(user.id)))
      return NextResponse.json(
        { error: "opt in first (set a builder handle)" },
        { status: 409 },
      );
    const pod = await createPod(user.id, body.name);
    return NextResponse.json({ pod });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not create pod" },
      { status: 500 },
    );
  }
}

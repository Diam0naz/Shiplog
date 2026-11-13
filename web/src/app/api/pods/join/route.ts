import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getBuilder, joinPod } from "@/lib/builders";

/** POST — join a pod by code: { code }. The caller must already be a builder. */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  if (typeof body.code !== "string" || !body.code.trim())
    return NextResponse.json({ error: "join code is required" }, { status: 400 });
  try {
    if (!(await getBuilder(user.id)))
      return NextResponse.json(
        { error: "opt in first (set a builder handle)" },
        { status: 409 },
      );
    const pod = await joinPod(user.id, body.code);
    return NextResponse.json({ pod });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "could not join pod";
    const status = msg === "No pod with that code" ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

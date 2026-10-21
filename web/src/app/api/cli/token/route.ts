import { NextResponse } from "next/server";
import {
  consumeCliCode,
  createSession,
  loadUser,
} from "@/lib/session";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  if (typeof body.code !== "string" || !body.code)
    return NextResponse.json({ error: "missing code" }, { status: 400 });

  try {
    // Single use, two-minute lifetime, stored only as a hash.
    const userId = await consumeCliCode(body.code);
    if (!userId)
      return NextResponse.json(
        { error: "invalid or expired code — run `shiplog login` again" },
        { status: 400 },
      );

    const token = await createSession(userId);
    const user = await loadUser(userId);
    return NextResponse.json({
      token,
      user: user
        ? { login: user.login, name: user.name ?? null, avatarUrl: user.avatarUrl ?? null }
        : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not create a session" },
      { status: 500 },
    );
  }
}

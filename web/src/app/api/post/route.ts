import { NextResponse } from "next/server";

export async function POST(req: Request) {
  if (req.headers.get("authorization") !== "Bearer dev-token-123") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { text } = await req.json();
  console.log("WOULD POST:\n" + text);
  return NextResponse.json({ ok: true });
}
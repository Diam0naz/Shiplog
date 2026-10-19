import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { code } = await req.json();
  if (code !== "dev-code") {
    return NextResponse.json({ error: "invalid code" }, { status: 400 });
  }
  return NextResponse.json({ token: "dev-token-123" });
}

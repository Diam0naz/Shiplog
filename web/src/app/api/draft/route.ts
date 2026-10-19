import { NextResponse } from "next/server";

export async function POST(req: Request) {
  if (req.headers.get("authorization") !== "Bearer dev-token-123") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { commits, note } = await req.json();
  const lines = commits
    .slice(0, 3)
    .map((c: { subject: string }) => `• ${c.subject}`)
    .join("\n");
  const draft = `${note ? note + "\n\n" : ""}Progress update:\n${lines}\n\n#buildinpublic`;
  return NextResponse.json({ draft });
}

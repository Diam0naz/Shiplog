import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { suggestBuilders } from "@/lib/builders";

/** GET — up to 5 similar builders (shared tags + language + activity). */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const suggestions = await suggestBuilders(user.id);
    return NextResponse.json({ suggestions });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not load suggestions" },
      { status: 500 },
    );
  }
}

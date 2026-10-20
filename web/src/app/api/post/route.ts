import { NextResponse } from "next/server";
import { postToLinkedIn } from "@/lib/linkedin";
import {
  ExpiredError,
  isPlatform,
  NotConnectedError,
  PLATFORM_LABELS,
  PLATFORMS,
  type Platform,
} from "@/lib/publish";
import { postToX } from "@/lib/x";

const PUBLISHERS: Record<
  Platform,
  (text: string) => Promise<{ id?: string; url?: string }>
> = {
  linkedin: postToLinkedIn,
  x: postToX,
};

type Result = {
  platform: Platform;
  ok: boolean;
  id?: string;
  url?: string;
  error?: string;
  /** A missing or expired credential, as opposed to a rejected publish. */
  connection?: boolean;
};

const usage = (origin: string) =>
  `Connect an account first: LinkedIn at ${origin}/api/linkedin/connect or X at ${origin}/api/x/connect`;

export async function POST(req: Request) {
  if (req.headers.get("authorization") !== "Bearer dev-token-123") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const { text, targets } = body as { text?: unknown; targets?: unknown };

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "empty post" }, { status: 400 });
  }

  // With no explicit list, publish everywhere that is connected — the old
  // single-platform behaviour, generalised.
  const explicit = Array.isArray(targets) && targets.length > 0;
  if (explicit && !(targets as unknown[]).every(isPlatform)) {
    return NextResponse.json(
      { error: `unknown target; expected ${PLATFORMS.join(", ")}` },
      { status: 400 },
    );
  }
  const chosen: Platform[] = explicit
    ? ([...new Set(targets as Platform[])] as Platform[])
    : PLATFORMS;

  // X rejects anything over 280 characters, so say that plainly instead of
  // letting the API answer with a 403 after LinkedIn already published.
  if (chosen.includes("x") && text.length > 280) {
    return NextResponse.json(
      { error: `post is ${text.length} characters; X allows 280` },
      { status: 400 },
    );
  }

  const origin = new URL(req.url).origin;
  const results: Result[] = [];

  for (const platform of chosen) {
    try {
      const out = await PUBLISHERS[platform](text);
      results.push({ platform, ok: true, id: out.id, url: out.url });
    } catch (e) {
      const message = e instanceof Error ? e.message : "post failed";
      // On an implicit "post everywhere" request, a platform that was never
      // connected is simply not a target.
      if (!explicit && e instanceof NotConnectedError) continue;
      const connection =
        e instanceof NotConnectedError || e instanceof ExpiredError;
      results.push({ platform, ok: false, error: message, connection });
      // Surface storage misconfiguration (missing Blob store, bad key) as a
      // server error rather than a connection problem.
      if (!(e instanceof NotConnectedError) && !(e instanceof ExpiredError))
        console.error(`${PLATFORM_LABELS[platform]} publish failed`, e);
    }
  }

  if (results.length === 0) {
    return NextResponse.json({ error: usage(origin) }, { status: 409 });
  }

  const failed = results.filter((r) => !r.ok);
  const ok = failed.length === 0;
  const status = ok
    ? 200
    : failed.every((r) => r.connection)
      ? 409
      : failed.length === results.length
        ? 502
        : 207;

  return NextResponse.json(
    {
      ok,
      results,
      ...(ok
        ? {}
        : {
            error: failed
              .map((r) => `${PLATFORM_LABELS[r.platform]}: ${r.error}`)
              .join("; "),
          }),
    },
    { status },
  );
}

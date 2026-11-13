import { NextResponse } from "next/server";
import { postToFarcaster } from "@/lib/farcaster";
import { postToLinkedIn } from "@/lib/linkedin";
import {
  ExpiredError,
  isPlatform,
  NotConnectedError,
  PLATFORM_LABELS,
  PLATFORMS,
  type Platform,
} from "@/lib/publish";
import { requireUser } from "@/lib/session";
import { recordShip } from "@/lib/streak";
import { postToX } from "@/lib/x";
import { parseImages, type PostImage } from "@/lib/images";

// PUBLISHERS type: add the third argument
const PUBLISHERS: Record<
  Platform,
  (
    userId: string,
    text: string,
    images: PostImage[],
  ) => Promise<{ id?: string; url?: string }>
> = { linkedin: postToLinkedIn, x: postToX, farcaster: postToFarcaster };
// (postToX can keep its two-argument signature for now; X posts text only.)

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
  `Connect an account first: LinkedIn at ${origin}/api/linkedin/connect, X at ${origin}/api/x/connect, or Farcaster at ${origin}/api/farcaster/connect`;

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { text, targets } = body as { text?: unknown; targets?: unknown };

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "empty post" }, { status: 400 });
  }

  const images = parseImages((body as { images?: unknown }).images);
  if (images === null) {
    return NextResponse.json({ error: "invalid images" }, { status: 400 });
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

  // X threads anything over 280 characters (see lib/x.ts), so only a runaway
  // draft is rejected — a sanity cap, not the per-tweet limit.
  if (text.length > 10_000) {
    return NextResponse.json(
      { error: `post is ${text.length} characters; keep it under 10,000` },
      { status: 400 },
    );
  }

  const origin = new URL(req.url).origin;
  const results: Result[] = [];

  for (const platform of chosen) {
    try {
      const out = await PUBLISHERS[platform](user.id, text, images);
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

  // A shipped post counts toward the streak. Best-effort: never fail a
  // successful publish because the streak log couldn't be written.
  if (results.some((r) => r.ok)) {
    try {
      await recordShip(user.id);
    } catch (e) {
      console.error("recordShip failed", e);
    }
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

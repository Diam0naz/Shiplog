import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { loadFarcaster, loadLinkedIn, loadX } from "@/lib/tokens";

/**
 * Which publishing accounts this deployment holds. The CLI uses it to offer
 * only the platforms that will actually work, instead of failing after the
 * user has already approved a post.
 */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const [linkedin, x, farcaster] = await Promise.all([
      loadLinkedIn(user.id),
      loadX(user.id),
      loadFarcaster(user.id),
    ]);
    return NextResponse.json({
      linkedin: linkedin
        ? {
            connected: true,
            expired: Date.now() >= linkedin.expiresAt,
            name: linkedin.name,
          }
        : { connected: false },
      x: x
        ? {
            connected: true,
            // An expired X token is still usable when a refresh token exists.
            expired: Date.now() >= x.expiresAt && !x.refreshToken,
            username: x.username,
          }
        : { connected: false },
      farcaster: farcaster
        ? {
            connected: true,
            expired: false, // Farcaster tokens don't expire the same way
            username: farcaster.username,
          }
        : { connected: false },
    });
  } catch (e) {
    // Storage misconfiguration must be visible, not reported as "nothing
    // connected".
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not read stored tokens" },
      { status: 500 },
    );
  }
}

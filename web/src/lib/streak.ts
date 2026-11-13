import { readJson, writeJson } from "./store";

/**
 * Solo shipping streaks (v0). A "ship" is a day on which a post succeeded; we
 * store the set of ship dates per user and derive the streak on read, so there
 * is no stored counter to drift. Weekly is the headline cadence — daily is
 * punishing for most developers.
 *
 * This is deliberately account-scoped in the Blob store. The pod/matching half
 * (v1) moves to Postgres; this log is the source of truth either way.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function key(userId: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId))
    throw new Error(`invalid user id: ${userId}`);
  return `shiplog/users/${userId}/ships.json`;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Midnight (UTC) of the Monday that starts `iso`'s week, as a timestamp. */
function weekStart(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dow = new Date(t).getUTCDay(); // 0 = Sun … 6 = Sat
  const sinceMonday = (dow + 6) % 7;
  return t - sinceMonday * DAY_MS;
}

export type Streak = {
  /** Consecutive weeks with at least one ship, ending this or last week. */
  weeks: number;
  shippedThisWeek: boolean;
  lastShip: string | null;
  totalShips: number;
};

/** Records today as a ship day (idempotent per day). Best-effort by callers. */
export async function recordShip(userId: string): Promise<void> {
  const log = (await readJson<string[]>(key(userId))) ?? [];
  const day = today();
  if (log.includes(day)) return;
  log.push(day);
  await writeJson(key(userId), log.slice(-400));
}

export async function getStreak(userId: string): Promise<Streak> {
  const log = (await readJson<string[]>(key(userId))) ?? [];
  if (log.length === 0)
    return { weeks: 0, shippedThisWeek: false, lastShip: null, totalShips: 0 };

  const weeks = new Set(log.map(weekStart));
  const totalShips = new Set(log).size;
  const lastShip = [...log].sort().at(-1) ?? null;

  const thisWeek = weekStart(today());
  const shippedThisWeek = weeks.has(thisWeek);

  // The streak is alive if you shipped this week or last week (one week grace).
  let cursor = shippedThisWeek ? thisWeek : thisWeek - 7 * DAY_MS;
  if (!weeks.has(cursor))
    return { weeks: 0, shippedThisWeek, lastShip, totalShips };

  let count = 0;
  while (weeks.has(cursor)) {
    count += 1;
    cursor -= 7 * DAY_MS;
  }
  return { weeks: count, shippedThisWeek, lastShip, totalShips };
}

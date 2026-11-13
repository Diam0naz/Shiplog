import { randomBytes } from "node:crypto";
import { ensureSchema, getSql } from "./db";

/**
 * The builder/pod graph (v1 of builder streaks). A builder is an opted-in
 * profile; pods are small join-by-code groups; cadence is "did each member ship
 * this week," derived from the ship table.
 */

export type Builder = {
  handle: string;
  tags: string[];
  primaryLang: string | null;
};

export type PodMember = {
  handle: string;
  isYou: boolean;
  shippedThisWeek: boolean;
  /** Consecutive weeks with a ship (personal streak), from the DB. */
  weeks: number;
};

export type Suggestion = {
  handle: string;
  primaryLang: string | null;
  /** Tags this builder shares with you. */
  sharedTags: string[];
  /** True when their primary language matches yours. */
  sameLang: boolean;
  /** Shipped this week — an active builder to pair with. */
  active: boolean;
};

export type Pod = {
  id: string;
  name: string;
  joinCode: string;
  isOwner: boolean;
  members: PodMember[];
};

const clip = (s: unknown, n: number) =>
  typeof s === "string" ? s.trim().slice(0, n) : "";

const DAY_MS = 86400000;

/** Timestamp of the Monday (UTC) that starts `iso`'s week. */
function weekStartMs(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dow = new Date(t).getUTCDay();
  return t - ((dow + 6) % 7) * DAY_MS;
}

/** Monday (UTC) of the current week as YYYY-MM-DD, matching the streak logic. */
function mondayISO(): string {
  return new Date(weekStartMs(new Date().toISOString())).toISOString().slice(0, 10);
}

/** Consecutive weeks with a ship (one week of grace), from ship dates. */
function weeklyStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const weeks = new Set(dates.map(weekStartMs));
  const thisWeek = weekStartMs(new Date().toISOString());
  let cursor = weeks.has(thisWeek) ? thisWeek : thisWeek - 7 * DAY_MS;
  if (!weeks.has(cursor)) return 0;
  let n = 0;
  while (weeks.has(cursor)) {
    n += 1;
    cursor -= 7 * DAY_MS;
  }
  return n;
}

/** Short, human-typable join code without ambiguous characters. */
function joinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function getBuilder(userId: string): Promise<Builder | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT handle, tags, primary_lang AS "primaryLang"
    FROM builder WHERE user_id = ${userId}
  `) as Builder[];
  return rows[0] ?? null;
}

export async function optIn(
  userId: string,
  handle: string,
  tags: string[] = [],
  primaryLang?: string,
): Promise<Builder> {
  await ensureSchema();
  const sql = getSql();
  const h = clip(handle, 40) || "builder";
  const t = tags.map((x) => clip(x, 24)).filter(Boolean).slice(0, 5);
  const lang = primaryLang ? clip(primaryLang, 24) : null;
  const rows = (await sql`
    INSERT INTO builder (user_id, handle, tags, primary_lang)
    VALUES (${userId}, ${h}, ${t}::text[], ${lang})
    ON CONFLICT (user_id) DO UPDATE
      SET handle = EXCLUDED.handle,
          tags = EXCLUDED.tags,
          primary_lang = COALESCE(EXCLUDED.primary_lang, builder.primary_lang)
    RETURNING handle, tags, primary_lang AS "primaryLang"
  `) as Builder[];
  return rows[0];
}

export async function optOut(userId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM pod_member WHERE user_id = ${userId}`;
  await sql`DELETE FROM builder WHERE user_id = ${userId}`;
}

export async function createPod(userId: string, name: string): Promise<Pod> {
  await ensureSchema();
  const sql = getSql();
  const id = randomBytes(9).toString("base64url");
  const code = joinCode();
  const nm = clip(name, 60) || "pod";
  await sql`
    INSERT INTO pod (id, name, join_code, created_by)
    VALUES (${id}, ${nm}, ${code}, ${userId})
  `;
  await sql`
    INSERT INTO pod_member (pod_id, user_id) VALUES (${id}, ${userId})
    ON CONFLICT DO NOTHING
  `;
  const pods = await listPods(userId, id);
  return pods[0];
}

export async function joinPod(userId: string, code: string): Promise<Pod> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id FROM pod WHERE join_code = ${clip(code, 12).toUpperCase()}
  `) as { id: string }[];
  const pod = rows[0];
  if (!pod) throw new Error("No pod with that code");
  await sql`
    INSERT INTO pod_member (pod_id, user_id) VALUES (${pod.id}, ${userId})
    ON CONFLICT DO NOTHING
  `;
  const pods = await listPods(userId, pod.id);
  return pods[0];
}

export async function leavePod(userId: string, podId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM pod_member WHERE pod_id = ${podId} AND user_id = ${userId}`;
  // Tidy up a pod that no one is in anymore.
  await sql`
    DELETE FROM pod WHERE id = ${podId}
      AND NOT EXISTS (SELECT 1 FROM pod_member WHERE pod_id = ${podId})
  `;
}

/** The pods a user is in, each with its roster and this-week cadence. */
export async function listPods(userId: string, onlyPodId?: string): Promise<Pod[]> {
  await ensureSchema();
  const sql = getSql();
  // The driver can't compose sql`` fragments, so branch rather than splice.
  const pods = (
    onlyPodId
      ? await sql`
          SELECT p.id, p.name, p.join_code AS "joinCode", (p.created_by = ${userId}) AS "isOwner"
          FROM pod p JOIN pod_member m ON m.pod_id = p.id
          WHERE m.user_id = ${userId} AND p.id = ${onlyPodId}
          ORDER BY p.created_at`
      : await sql`
          SELECT p.id, p.name, p.join_code AS "joinCode", (p.created_by = ${userId}) AS "isOwner"
          FROM pod p JOIN pod_member m ON m.pod_id = p.id
          WHERE m.user_id = ${userId}
          ORDER BY p.created_at`
  ) as Omit<Pod, "members">[];

  const monday = mondayISO();
  const out: Pod[] = [];
  for (const p of pods) {
    // Pull each member with their recent ship days, then derive streak +
    // this-week cadence in JS (one query per pod instead of per member).
    const rows = (await sql`
      SELECT b.handle,
             (b.user_id = ${userId}) AS "isYou",
             s.shipped_on::text AS day
      FROM pod_member m
      JOIN builder b ON b.user_id = m.user_id
      LEFT JOIN ship s
        ON s.user_id = b.user_id AND s.shipped_on >= current_date - 400
      WHERE m.pod_id = ${p.id}
    `) as { handle: string; isYou: boolean; day: string | null }[];

    const byHandle = new Map<string, { isYou: boolean; days: string[] }>();
    for (const r of rows) {
      const e = byHandle.get(r.handle) ?? { isYou: r.isYou, days: [] };
      if (r.day) e.days.push(r.day);
      byHandle.set(r.handle, e);
    }
    const members: PodMember[] = [...byHandle.entries()]
      .map(([handle, e]) => ({
        handle,
        isYou: e.isYou,
        weeks: weeklyStreak(e.days),
        shippedThisWeek: e.days.some((d) => d >= monday),
      }))
      .sort((a, b) => a.handle.localeCompare(b.handle));

    out.push({ ...p, members });
  }
  return out;
}

/**
 * Recommends up to 5 similar builders, scored by three signals: shared
 * self-declared tags, same primary language, and recent shipping activity.
 * When too few score above zero, it fills the rest with other builders at
 * random — "top or random 5".
 */
export async function suggestBuilders(userId: string): Promise<Suggestion[]> {
  await ensureSchema();
  const sql = getSql();
  const me = await getBuilder(userId);
  if (!me) return [];

  const monday = mondayISO();
  const rows = (await sql`
    SELECT b.handle, b.tags, b.primary_lang AS "primaryLang",
           EXISTS (
             SELECT 1 FROM ship s
             WHERE s.user_id = b.user_id AND s.shipped_on >= ${monday}
           ) AS active
    FROM builder b
    WHERE b.user_id <> ${userId}
  `) as { handle: string; tags: string[]; primaryLang: string | null; active: boolean }[];

  const myTags = new Set((me.tags ?? []).map((t) => t.toLowerCase()));
  const myLang = me.primaryLang?.toLowerCase() ?? null;

  const scored = rows.map((r) => {
    const shared = (r.tags ?? []).filter((t) => myTags.has(t.toLowerCase()));
    const sameLang = !!myLang && r.primaryLang?.toLowerCase() === myLang;
    // Tags dominate, language is a strong tiebreaker, activity nudges live
    // builders up; a dash of jitter keeps equal scores from freezing an order.
    const score =
      shared.length * 3 + (sameLang ? 2 : 0) + (r.active ? 1 : 0) + Math.random() * 0.5;
    return {
      score,
      suggestion: {
        handle: r.handle,
        primaryLang: r.primaryLang,
        sharedTags: shared,
        sameLang,
        active: r.active,
      } satisfies Suggestion,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5).map((s) => s.suggestion);
}

/** Records a ship for an opted-in builder (no-op for non-builders). */
export async function recordShipDb(userId: string, platforms: string[]): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO ship (user_id, shipped_on, platforms)
    SELECT ${userId}, current_date, ${platforms}::text[]
    WHERE EXISTS (SELECT 1 FROM builder WHERE user_id = ${userId})
    ON CONFLICT (user_id, shipped_on) DO NOTHING
  `;
}

import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { deleteKey, readJson, writeJson } from "./store";

/**
 * Identity without a database: a user record, a session record keyed by the
 * SHA-256 of the bearer token, and single-use codes for the CLI handoff.
 * Only hashes are ever written, so a leaked store yields no usable token.
 */

export const SESSION_COOKIE = "ship_session";
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 2 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export type User = {
  /** GitHub numeric id, as a string. */
  id: string;
  login: string;
  name?: string;
  avatarUrl?: string;
  createdAt: number;
};

type SessionRecord = {
  userId: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
};

type CodeRecord = {
  userId: string;
  expiresAt: number;
};

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const userKey = (id: string) => `shiplog/users/${assertUserId(id)}.json`;
const sessionKey = (h: string) => `shiplog/sessions/${h}.json`;
const codeKey = (h: string) => `shiplog/cli-codes/${h}.json`;

function assertUserId(id: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error(`invalid user id: ${id}`);
  return id;
}

export function newSecret(bytes = 48) {
  return randomBytes(bytes).toString("base64url");
}

export async function upsertUser(
  input: Omit<User, "createdAt">,
): Promise<User> {
  const existing = await loadUser(input.id);
  const user: User = {
    ...input,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await writeJson(userKey(user.id), user);
  return user;
}

export async function loadUser(id: string): Promise<User | null> {
  return readJson<User>(userKey(id));
}

export async function createSession(userId: string): Promise<string> {
  const token = newSecret(48);
  const now = Date.now();
  const record: SessionRecord = {
    userId: assertUserId(userId),
    createdAt: now,
    lastUsedAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  await writeJson(sessionKey(hash(token)), record);
  return token;
}

/**
 * Resolves a bearer token to a user, rejecting expired sessions. `lastUsedAt`
 * is refreshed at most hourly — every request writing to storage would turn a
 * read-only API call into a write.
 */
export async function userFromToken(token: string): Promise<User | null> {
  if (!token) return null;
  const h = hash(token);
  const record = await readJson<SessionRecord>(sessionKey(h));
  if (!record) return null;
  if (Date.now() >= record.expiresAt) {
    await deleteKey(sessionKey(h));
    return null;
  }
  if (Date.now() - record.lastUsedAt > TOUCH_INTERVAL_MS) {
    await writeJson(sessionKey(h), { ...record, lastUsedAt: Date.now() });
  }
  return loadUser(record.userId);
}

export async function deleteSession(token: string): Promise<void> {
  if (!token) return;
  await deleteKey(sessionKey(hash(token)));
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  return match ? match[1].trim() : null;
}

/** The single auth check every API route uses. */
export async function requireUser(req: Request): Promise<User | null> {
  const token = bearerToken(req);
  return token ? userFromToken(token) : null;
}

/** For browser flows: the session lives in an httpOnly cookie. */
export async function userFromCookie(
  req: NextRequest,
): Promise<User | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return token ? userFromToken(token) : null;
}

export function sessionCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: isProd ? ("none" as const) : ("lax" as const),
    secure: isProd,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

/** One-time code that the browser hands to the CLI's loopback listener. */
export async function createCliCode(userId: string): Promise<string> {
  const code = newSecret(32);
  const record: CodeRecord = {
    userId: assertUserId(userId),
    expiresAt: Date.now() + CODE_TTL_MS,
  };
  await writeJson(codeKey(hash(code)), record);
  return code;
}

export async function consumeCliCode(code: string): Promise<string | null> {
  const h = hash(code);
  const record = await readJson<CodeRecord>(codeKey(h));
  if (!record) return null;
  // Delete before returning: a code is valid at most once.
  await deleteKey(codeKey(h));
  if (Date.now() >= record.expiresAt) return null;
  return record.userId;
}

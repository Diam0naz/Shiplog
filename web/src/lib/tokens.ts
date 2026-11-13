import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readJson, writeJson } from "./store";

export type Provider = "linkedin" | "x" | "farcaster";

export type LinkedInAuth = {
  accessToken: string;
  expiresAt: number;
  personUrn: string;
  name?: string;
};

export type XAuth = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  userId: string;
  username?: string;
};

export type FarcasterAuth = {
  fid: number;
  username: string;
  displayName?: string;
  pfpUrl?: string;
  // Neynar managed signer that casts on the user's behalf.
  signerUuid: string;
  // "pending_approval" until the user approves the signer in their wallet,
  // then "approved". Only an approved signer can cast.
  status: "pending_approval" | "approved";
  // Deep link the user opens to approve the signer (valid while pending).
  approvalUrl?: string;
};

type AuthFor = {
  linkedin: LinkedInAuth;
  x: XAuth;
  farcaster: FarcasterAuth;
};

const FILES: Record<Provider, string> = {
  linkedin: "linkedin-token.json",
  x: "x-token.json",
  farcaster: "farcaster-token.json",
};

/** What actually gets persisted: the AES-GCM envelope, never the raw token. */
type Envelope = {
  iv: string;
  tag: string;
  data: string;
};

/**
 * One credential per platform per user, so two people on the same deployment
 * never share a LinkedIn or X account.
 */
export function tokenKey(provider: Provider, userId: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId))
    throw new Error(`invalid user id: ${userId}`);
  return `shiplog/users/${userId}/${FILES[provider]}`;
}

function key() {
  const hex = process.env.TOKEN_ENC_KEY;
  if (!hex || hex.length !== 64)
    throw new Error("TOKEN_ENC_KEY must be 64 hex characters");
  return Buffer.from(hex, "hex");
}

export async function saveAuth<P extends Provider>(
  provider: P,
  userId: string,
  auth: AuthFor[P],
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(auth), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const envelope: Envelope = {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: data.toString("hex"),
  };
  await writeJson(tokenKey(provider, userId), envelope);
}

export async function loadAuth<P extends Provider>(
  provider: P,
  userId: string,
): Promise<AuthFor[P] | null> {
  const stored = await readJson<Envelope>(tokenKey(provider, userId));
  if (!stored) return null;
  // Outside the try: a missing TOKEN_ENC_KEY is a configuration error worth
  // surfacing, unlike a corrupt envelope or a key that no longer matches.
  const k = key();
  try {
    const d = createDecipheriv(
      "aes-256-gcm",
      k,
      Buffer.from(stored.iv, "hex"),
    );
    d.setAuthTag(Buffer.from(stored.tag, "hex"));
    const out = Buffer.concat([
      d.update(Buffer.from(stored.data, "hex")),
      d.final(),
    ]);
    return JSON.parse(out.toString("utf8")) as AuthFor[P];
  } catch {
    return null; // wrong key or corrupt envelope: treat as not connected
  }
}

export const saveLinkedIn = (userId: string, auth: LinkedInAuth) =>
  saveAuth("linkedin", userId, auth);
export const loadLinkedIn = (userId: string) => loadAuth("linkedin", userId);
export const saveX = (userId: string, auth: XAuth) => saveAuth("x", userId, auth);
export const loadX = (userId: string) => loadAuth("x", userId);
export const saveFarcaster = (userId: string, auth: FarcasterAuth) =>
  saveAuth("farcaster", userId, auth);
export const loadFarcaster = (userId: string) => loadAuth("farcaster", userId);

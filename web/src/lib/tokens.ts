import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { get, put } from "@vercel/blob";

export type Provider = "linkedin" | "x";

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

type AuthFor = {
  linkedin: LinkedInAuth;
  x: XAuth;
};

/** One credential file per platform, so connecting X never touches LinkedIn. */
const PROVIDERS: Record<
  Provider,
  { label: string; file: string; blob: string }
> = {
  linkedin: {
    label: "LinkedIn",
    file: "linkedin.json",
    blob: "shiplog/linkedin-token.json",
  },
  x: { label: "X", file: "x.json", blob: "shiplog/x-token.json" },
};

/** What actually gets persisted: the AES-GCM envelope, never the raw token. */
type Envelope = {
  iv: string;
  tag: string;
  data: string;
};

function key() {
  const hex = process.env.TOKEN_ENC_KEY;
  if (!hex || hex.length !== 64)
    throw new Error("TOKEN_ENC_KEY must be 64 hex characters");
  return Buffer.from(hex, "hex");
}

/**
 * A connected Blob store injects `BLOB_STORE_ID` (Vercel then authenticates
 * with OIDC by default); CI or local setups can use a read-write token
 * instead. With neither, tokens are written to `.data/`.
 */
function blobEnabled() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID,
  );
}

/**
 * Serverless filesystems are read-only, so on Vercel without a Blob store the
 * token cannot be stored. Fail with an actionable message rather than letting
 * the callback report success and lose the token.
 */
function assertStorageConfigured(provider: Provider) {
  if (!blobEnabled() && process.env.VERCEL) {
    throw new Error(
      `${PROVIDERS[provider].label} token storage is not configured: add a Vercel Blob store to this project (it sets BLOB_STORE_ID), then redeploy`,
    );
  }
}

function localFile(provider: Provider) {
  return path.join(process.cwd(), ".data", PROVIDERS[provider].file);
}

async function readEnvelope(provider: Provider): Promise<Envelope | null> {
  assertStorageConfigured(provider);

  if (blobEnabled()) {
    const result = await get(PROVIDERS[provider].blob, {
      access: "private",
      useCache: false, // a cached copy could hand back a revoked token
    });
    if (!result?.stream) return null;
    return JSON.parse(await new Response(result.stream).text()) as Envelope;
  }

  try {
    return JSON.parse(await fs.readFile(localFile(provider), "utf8")) as Envelope;
  } catch {
    return null; // no token stored yet
  }
}

async function writeEnvelope(provider: Provider, envelope: Envelope) {
  assertStorageConfigured(provider);

  if (blobEnabled()) {
    await put(PROVIDERS[provider].blob, JSON.stringify(envelope), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }

  const file = localFile(provider);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(envelope), { mode: 0o600 });
}

export async function saveAuth<P extends Provider>(
  provider: P,
  auth: AuthFor[P],
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(auth), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  await writeEnvelope(provider, {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: data.toString("hex"),
  });
}

export async function loadAuth<P extends Provider>(
  provider: P,
): Promise<AuthFor[P] | null> {
  const stored = await readEnvelope(provider);
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

export const saveLinkedIn = (auth: LinkedInAuth) => saveAuth("linkedin", auth);
export const loadLinkedIn = () => loadAuth("linkedin");
export const saveX = (auth: XAuth) => saveAuth("x", auth);
export const loadX = () => loadAuth("x");

import { promises as fs } from "node:fs";
import path from "node:path";
import { del, get, put } from "@vercel/blob";

/**
 * Everything the service persists goes through here: users, sessions, one-time
 * CLI codes and the encrypted platform tokens. Keys are Blob pathnames, so the
 * same string addresses local files under `.data/` and Blobs in production.
 */

const ROOT = path.join(process.cwd(), ".data");

/** `shiplog/users/42.json` on Blob is `.data/shiplog/users/42.json` on disk. */
function localPath(key: string) {
  return path.join(ROOT, key);
}

function blobEnabled() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID,
  );
}

function assertConfigured() {
  if (!blobEnabled() && process.env.VERCEL)
    throw new Error(
      "Storage is not configured: add a Vercel Blob store to this project (it sets BLOB_STORE_ID), then redeploy",
    );
}

/** Rejects traversal and absolute keys before they reach a filesystem join. */
function assertSafeKey(key: string) {
  if (
    !key.startsWith("shiplog/") ||
    key.includes("..") ||
    key.includes("\\") ||
    key.endsWith("/")
  )
    throw new Error(`unsafe storage key: ${key}`);
}

export async function readJson<T>(key: string): Promise<T | null> {
  assertSafeKey(key);
  assertConfigured();

  if (blobEnabled()) {
    const result = await get(key, {
      access: "private",
      useCache: false, // a cached session could outlive a revoke
    });
    if (!result?.stream) return null;
    return JSON.parse(await new Response(result.stream).text()) as T;
  }

  try {
    return JSON.parse(await fs.readFile(localPath(key), "utf8")) as T;
  } catch {
    return null; // nothing stored yet
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  assertSafeKey(key);
  assertConfigured();

  if (blobEnabled()) {
    await put(key, JSON.stringify(value), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }

  const file = localPath(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value), { mode: 0o600 });
}

export async function deleteKey(key: string): Promise<void> {
  assertSafeKey(key);
  assertConfigured();

  if (blobEnabled()) {
    await del(key);
    return;
  }

  await fs.rm(localPath(key), { force: true });
}

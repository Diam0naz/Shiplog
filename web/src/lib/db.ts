import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Postgres (Neon) for the builder/pod graph — the cross-user half the Blob
 * store can't do. Everything here is gated on DATABASE_URL: with it unset, the
 * builder features report a clear "needs a database" error and the rest of
 * shiplog (auth, posting, solo streaks) keeps working on Blob alone.
 *
 * The schema is created on first use (CREATE TABLE IF NOT EXISTS), so there is
 * no separate migration step to run.
 */

let client: NeonQueryFunction<false, false> | null = null;
let ensured: Promise<void> | null = null;

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getSql(): NeonQueryFunction<false, false> {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error(
      "Builder features need a database: set DATABASE_URL to a Neon/Postgres connection string",
    );
  if (!client) client = neon(url);
  return client;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS builder (
     user_id      text PRIMARY KEY,
     handle       text NOT NULL,
     tags         text[] NOT NULL DEFAULT '{}',
     primary_lang text,
     created_at   timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS ship (
     user_id    text NOT NULL,
     shipped_on date NOT NULL,
     platforms  text[] NOT NULL DEFAULT '{}',
     PRIMARY KEY (user_id, shipped_on)
   )`,
  `CREATE TABLE IF NOT EXISTS pod (
     id         text PRIMARY KEY,
     name       text NOT NULL,
     join_code  text NOT NULL UNIQUE,
     created_by text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS pod_member (
     pod_id    text NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
     user_id   text NOT NULL,
     joined_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (pod_id, user_id)
   )`,
];

/** Creates the schema once per process. Idempotent and memoized. */
export async function ensureSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const sql = getSql();
    for (const stmt of SCHEMA) await sql.query(stmt);
  })().catch((e) => {
    ensured = null; // let a later call retry after a transient failure
    throw e;
  });
  return ensured;
}

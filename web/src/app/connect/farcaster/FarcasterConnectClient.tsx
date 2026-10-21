"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "@/app/page.module.css";

/**
 * Farcaster Connect Client Component — shows Neynar SIWN button.
 * After user approves, Neynar redirects back with ?fid=...&signer_uuid=...
 * We POST those to /api/farcaster/connect to store on backend.
 */
export default function FarcasterConnectClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle Neynar redirect back with fid + signer_uuid
  useEffect(() => {
    const fid = searchParams.get("fid");
    const signerUuid = searchParams.get("signer_uuid");
    if (fid && signerUuid) {
      handleCallback(Number(fid), signerUuid);
    }
  }, [searchParams, router]);

  async function handleCallback(fid: number, signerUuid: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/farcaster/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid, signer_uuid: signerUuid }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      // Success — show confirmation and redirect
      setTimeout(() => router.push("/"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
      setLoading(false);
    }
  }

  // Neynar SIWN URL — replace with your actual Neynar app ID
  const siwnUrl = `https://siwn.neynar.com/?app_id=${process.env.NEXT_PUBLIC_NEYNAR_APP_ID ?? "your-app-id"}&redirect_uri=${encodeURIComponent(window.location.origin + "/connect/farcaster")}`;

  return (
    <div className={styles.page} style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
      <div className={styles.card} style={{ maxWidth: "420px", width: "100%", textAlign: "center" }}>
        <h1 style={{ marginBottom: "1rem" }}>Connect Farcaster</h1>
        <p style={{ color: "var(--ink-2)", marginBottom: "2rem" }}>
          Sign in with your Farcaster account to enable posting.
        </p>

        {!loading && !error && (
          <a
            href={siwnUrl}
            className={styles.btn}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.75rem",
              width: "100%",
              justifyContent: "center",
              fontSize: "1rem",
              padding: "1rem",
            }}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
              <path d="M12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Sign in with Farcaster
          </a>
        )}

        {loading && (
          <div style={{ marginTop: "1.5rem", color: "var(--ink-2)" }}>
            Verifying signer...
          </div>
        )}

        {error && (
          <div style={{ marginTop: "1.5rem", padding: "1rem", background: "color-mix(in srgb, var(--coral, #e85d5d) 15%, transparent)", border: "1px solid var(--coral, #e85d5d)", borderRadius: "4px", color: "var(--ink)" }}>
            {error}
          </div>
        )}

        {loading && !error && (
          <div style={{ marginTop: "1.5rem", color: "var(--sea, #1b7461)" }}>
            ✓ Connected! Redirecting...
          </div>
        )}

        <p className={styles.brand} style={{ marginTop: "2rem" }}>shiplog</p>
      </div>
    </div>
  );
}
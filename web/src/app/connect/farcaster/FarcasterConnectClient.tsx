"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import styles from "@/app/page.module.css";

/**
 * Farcaster connect via Neynar managed signers.
 *  1. Create a signer (POST /api/farcaster/signer) -> approval URL.
 *  2. Show it as a QR (desktop) and a tappable link (mobile) to approve in a
 *     Farcaster wallet.
 *  3. Poll (GET /api/farcaster/signer) until approved, then redirect home.
 */
type Phase = "idle" | "creating" | "awaiting" | "approved" | "error";

export default function FarcasterConnectClient() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const started = useRef(false);

  // Full-page navigation (not router.push) so the browser follows the 307 from
  // /api/github/connect out to GitHub and back; a client route can't follow a
  // server redirect to an external OAuth provider.
  const goToLogin = useCallback(() => {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/api/github/connect?next=${encodeURIComponent(
      "/connect/farcaster",
    )}`;
  }, []);

  // Render the approval URL as a QR code once we have it.
  useEffect(() => {
    if (!approvalUrl) return;
    QRCode.toDataURL(approvalUrl, { margin: 1, width: 232 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [approvalUrl]);

  // While awaiting approval, poll the signer status.
  useEffect(() => {
    if (phase !== "awaiting") return;
    let active = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/farcaster/signer");
        if (res.status === 401 && active) {
          goToLogin();
          return;
        }
        if (!res.ok || !active) return;
        const data = await res.json();
        if (data.status === "approved" && active) {
          setPhase("approved");
          setTimeout(() => router.push("/"), 1500);
        }
      } catch {
        /* transient; keep polling */
      }
    };
    const id = setInterval(tick, 3000);
    tick();
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [phase, router, goToLogin]);

  const start = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setPhase("creating");
    setError(null);
    try {
      const res = await fetch("/api/farcaster/signer", { method: "POST" });
      // No session on this host — send the user through GitHub login (on THIS
      // origin) and back, instead of dead-ending on "unauthorized".
      if (res.status === 401) {
        goToLogin();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      if (!data.approval_url) throw new Error("No approval URL returned");
      setApprovalUrl(data.approval_url as string);
      setPhase("awaiting");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start");
      setPhase("error");
      started.current = false;
    }
  }, [goToLogin]);

  return (
    <div
      className={styles.page}
      style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}
    >
      <div className={styles.card} style={{ maxWidth: "440px", width: "100%", textAlign: "center" }}>
        <h1 style={{ marginBottom: "1rem" }}>Connect Farcaster</h1>

        {(phase === "idle" || phase === "creating") && (
          <>
            <p style={{ color: "var(--ink-2)", marginBottom: "2rem" }}>
              Approve a signer so shiplog can cast on your behalf. You&apos;ll
              confirm once in your Farcaster wallet.
            </p>
            <button
              type="button"
              onClick={start}
              disabled={phase === "creating"}
              className={styles.btn}
              style={{ width: "100%", justifyContent: "center", fontSize: "1rem", padding: "1rem", cursor: "pointer" }}
            >
              {phase === "creating" ? "Preparing…" : "Connect Farcaster"}
            </button>
          </>
        )}

        {phase === "awaiting" && (
          <>
            <p style={{ color: "var(--ink-2)", marginBottom: "1.5rem" }}>
              Scan with your phone, or tap to open your Farcaster wallet, then
              approve the signer.
            </p>
            {qr && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={qr}
                alt="Farcaster approval QR code"
                width={232}
                height={232}
                style={{ borderRadius: "8px", background: "#fff", padding: "8px", margin: "0 auto 1.25rem" }}
              />
            )}
            {approvalUrl && (
              <a
                href={approvalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.btn}
                style={{ width: "100%", justifyContent: "center", padding: "0.85rem", marginBottom: "1rem" }}
              >
                Open in wallet
              </a>
            )}
            <p style={{ color: "var(--ink-3)", fontSize: "0.875rem" }}>
              Waiting for approval… this page updates automatically.
            </p>
          </>
        )}

        {phase === "approved" && (
          <div style={{ marginTop: "1rem", color: "var(--sea, #1b7461)", fontSize: "1.05rem" }}>
            ✓ Connected! Redirecting…
          </div>
        )}

        {phase === "error" && (
          <>
            <div
              style={{ marginTop: "0.5rem", marginBottom: "1.5rem", padding: "1rem", background: "color-mix(in srgb, var(--coral, #e85d5d) 15%, transparent)", border: "1px solid var(--coral, #e85d5d)", borderRadius: "4px", color: "var(--ink)" }}
            >
              {error}
            </div>
            <button
              type="button"
              onClick={start}
              className={styles.btn}
              style={{ width: "100%", justifyContent: "center", padding: "0.85rem", cursor: "pointer" }}
            >
              Try again
            </button>
          </>
        )}

        <p className={styles.brand} style={{ marginTop: "2rem" }}>shiplog</p>
      </div>
    </div>
  );
}

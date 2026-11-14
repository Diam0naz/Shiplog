import Link from "next/link";
import styles from "./page.module.css";

export const metadata = {
  title: "Not found — shiplog",
  description: "That page doesn't exist.",
};

export default function NotFound() {
  return (
    <div
      className={styles.page}
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px",
      }}
    >
      <div
        className={styles.card}
        style={{ maxWidth: "440px", width: "100%", textAlign: "center" }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
            fontSize: "3.5rem",
            fontWeight: 800,
            lineHeight: 1,
            color: "var(--yellow, #f5c518)",
            marginBottom: "0.5rem",
          }}
        >
          404
        </div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>
          Nothing shipped here
        </h1>
        <p style={{ color: "var(--ink-2, #3a4d5d)", marginBottom: "2rem" }}>
          That page doesn&apos;t exist. Check the address, or head back to start.
        </p>
        <Link
          href="/"
          className={styles.btn}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0.85rem 1.5rem",
          }}
        >
          Back to shiplog
        </Link>
        <p className={styles.brand} style={{ marginTop: "2rem" }}>
          shiplog
        </p>
      </div>
    </div>
  );
}

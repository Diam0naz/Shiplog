import Link from "next/link";
import LogoMark from "./LogoMark";
import { REPO_URL } from "./site";
import site from "./page.module.css";
import styles from "./legal.module.css";

/**
 * Shared shell for the legal documents: the same header and footer as the
 * landing page, with long-form typography in between.
 */
export default function LegalPage({
  title,
  updated,
  summary,
  children,
}: {
  title: string;
  updated: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <div className={site.page}>
      <header className={site.header}>
        <div className={`${site.wrap} ${site.nav}`}>
          <Link href="/" className={site.logo} aria-label="shiplog, back to home">
            <LogoMark />
            shiplog
          </Link>
          <nav className={site.navLinks} aria-label="Primary">
            <Link className={site.navLink} href="/#how">
              How it works
            </Link>
            <Link className={site.navLink} href="/#trust">
              Features
            </Link>
            <Link className={`${site.btn} ${site.btnSm}`} href="/#install">
              Install
            </Link>
          </nav>
        </div>
      </header>

      <main className={styles.main}>
        <div className={`${site.wrap} ${styles.column}`}>
          <p className={styles.eyebrow}>Legal</p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.updated}>Last updated {updated}</p>
          <p className={styles.summary}>{summary}</p>
          <article className={styles.doc}>{children}</article>
          <p className={styles.back}>
            <Link href="/">← Back to shiplog</Link>
          </p>
        </div>
      </main>

      <footer className={site.footer}>
        <div className={`${site.wrap} ${site.footerInner}`}>
          <div>
            <Link href="/" className={site.logo}>
              <LogoMark />
              shiplog
            </Link>
            <p className={site.footerNote}>&copy; 2026 shiplog. Built with Rust and Next.js.</p>
          </div>
          <nav className={site.footerLinks} aria-label="Footer">
            <Link href="/#example">Example</Link>
            <Link href="/#how">How it works</Link>
            <Link href="/#trust">Features</Link>
            <Link href="/#install">Install</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

import InstallSection from "./InstallSection";
import LogoMark from "./LogoMark";
import TerminalDemo from "./TerminalDemo";
import { REPO_URL } from "./site";
import styles from "./page.module.css";

const commits = [
  { hash: "a3f9c21", message: "feat(auth): browser login with a one-time code", used: true },
  { hash: "5d17e80", message: "fix(draft): rewrite posts that run over 280 characters", used: true },
  { hash: "9c2b4f6", message: "feat(voice): learn tone from saved posts", used: true },
  { hash: "e45b7c3", message: "docs: fix typo in README", used: false },
  { hash: "02d8f61", message: "chore: bump dependencies", used: false },
  { hash: "6ab13d9", message: "refactor: rename helper functions", used: false },
];

const steps = [
  {
    title: "Connect once",
    body: "Run shiplog login. Your browser opens, you approve, and the CLI keeps a session token on your machine.",
    code: "$ shiplog login\nOpening your browser to log in...\nLogged in.",
  },
  {
    title: "Draft from your commits",
    body: "Run shiplog post inside any repo. Add a short note if you want to steer the draft.",
    code: '$ shiplog post "voice samples are in"\nFound 6 new commits. Drafting...',
  },
  {
    title: "Approve, edit or skip",
    body: "Read the draft, edit it in your editor, or skip it. Nothing is posted until you choose Post.",
    code: "? What now?  Post  Edit  Skip\nPosted to LinkedIn and X.",
  },
];

const principles = [
  {
    term: "Reads your repo",
    desc: "Uses commit messages, bodies and changed file names since your last post. It remembers where it stopped in .git/shiplog-last, so no commit is posted twice.",
  },
  {
    term: "Leaves out the noise",
    desc: "Dependency bumps, typo fixes and renames stay out of the post unless they are the story.",
  },
  {
    term: "Sounds like you",
    desc: "Save a few of your past posts with shiplog voice. Drafts follow your tone and length instead of reading like release notes.",
  },
  {
    term: "You approve every post",
    desc: "Read the draft, edit it, or skip it. Nothing is posted until you choose Post.",
  },
  {
    term: "Posts from your own account",
    desc: "You connect each platform on its own consent screen, and posts go out under your name, not a shared account.",
  },
  {
    term: "One small program",
    desc: "shiplog is a single Rust binary. There is no runtime to install and no daemon running in the background.",
  },
];

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className={styles.page} id="top">
      <a className={styles.skip} href="#main">
        Skip to content
      </a>

      <header className={styles.header}>
        <div className={`${styles.wrap} ${styles.nav}`}>
          <a href="#top" className={styles.logo} aria-label="shiplog, back to top">
            <LogoMark />
            shiplog
          </a>
          <nav className={styles.navLinks} aria-label="Primary">
            <a className={styles.navLink} href="#example">
              Example
            </a>
            <a className={styles.navLink} href="#how">
              How it works
            </a>
            <a className={styles.navLink} href="#trust">
              Features
            </a>
            <a className={styles.navLink} href={REPO_URL} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a className={`${styles.btn} ${styles.btnSm}`} href="#install">
              Install
            </a>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className={styles.hero}>
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div>
              <p className={styles.status}>
                <span className={styles.statusDot} aria-hidden="true" />
                Early beta
              </p>
              <h1 className={styles.title}>Your git log, published.</h1>
              <p className={styles.subtitle}>
                shiplog reads the commits since your last post, drafts an update in your voice, and
                posts it from your own account once you approve it.
              </p>
              <div className={styles.heroActions}>
                <a className={styles.btn} href="#install">
                  Install shiplog
                </a>
                <a className={styles.textLink} href="#example">
                  See an example
                </a>
              </div>
              <p className={styles.platformNote}>
                Posts to LinkedIn and X today. Bluesky and Farcaster are planned.
              </p>
            </div>
            <TerminalDemo />
          </div>
        </section>

        <section id="example" className={`${styles.section} ${styles.ledgerSection}`} aria-labelledby="example-title">
          <div className={styles.wrap}>
            <div className={styles.sectionHead}>
              <h2 id="example-title" className={styles.h2}>
                From six commits to one post
              </h2>
              <p className={styles.lead}>
                shiplog keeps what readers care about and leaves out dependency bumps, typo fixes and
                renames. You see the draft before anything is posted.
              </p>
            </div>

            <div className={styles.ledgerGrid}>
              <div>
                <p className={styles.colLabel}>Commits since your last post</p>
                <div className={styles.ledgerWrap}>
                  <table className={styles.ledger}>
                    <caption className={styles.srOnly}>
                      Six commits and whether each one made it into the draft
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Commit</th>
                        <th scope="col">Message</th>
                        <th scope="col">In the post</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commits.map((c) => (
                        <tr key={c.hash} className={c.used ? undefined : styles.rowSkipped}>
                          <td className={styles.hash}>{c.hash}</td>
                          <td className={styles.msg}>{c.message}</td>
                          <td className={c.used ? styles.used : styles.left}>
                            {c.used ? "Yes" : "Left out"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className={styles.colLabel}>The post you approve</p>
                <article className={styles.post}>
                  <div className={styles.postHead}>
                    <span className={styles.avatar} aria-hidden="true">
                      Y
                    </span>
                    <div>
                      <p className={styles.postName}>You</p>
                      <p className={styles.postWhen}>Posted from your account</p>
                    </div>
                  </div>
                  <p className={styles.postBody}>
                    Login now works end to end: the CLI opens your browser, you approve once, and you
                    are signed in. Drafts also learn your tone from past posts now, and anything over
                    280 characters is rewritten before you see it.
                  </p>
                  <p className={styles.postFoot}>
                    <Check />
                    Drafted by shiplog, approved by you
                  </p>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className={styles.section} aria-labelledby="how-title">
          <div className={styles.wrap}>
            <div className={styles.sectionHead}>
              <h2 id="how-title" className={styles.h2}>
                Set up once, then run one command
              </h2>
              <p className={styles.lead}>
                Connect your account a single time. After that, shiplog post is all you need.
              </p>
            </div>

            <ol className={styles.steps}>
              {steps.map((s, i) => (
                <li key={s.title} className={styles.step}>
                  <span className={styles.stepNum} aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className={styles.stepTitle}>{s.title}</h3>
                    <p className={styles.stepBody}>{s.body}</p>
                  </div>
                  <pre className={styles.mini}>
                    <code>{s.code}</code>
                  </pre>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="trust" className={`${styles.section} ${styles.trustSection}`} aria-labelledby="trust-title">
          <div className={`${styles.wrap} ${styles.trustGrid}`}>
            <div className={styles.trustHead}>
              <h2 id="trust-title" className={styles.h2}>
                Built to be trusted with your accounts
              </h2>
              <p className={styles.lead}>
                Posting for you is a big ask. These are the rules shiplog follows.
              </p>
            </div>
            <dl className={styles.defs}>
              {principles.map((p) => (
                <div key={p.term} className={styles.def}>
                  <dt>{p.term}</dt>
                  <dd>{p.desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <InstallSection />

        <section className={styles.cta} aria-labelledby="cta-title">
          <div className={`${styles.wrap} ${styles.ctaRow}`}>
            <h2 id="cta-title" className={styles.ctaTitle}>
              Make your next commit your next post.
            </h2>
            <a className={styles.btn} href="#install">
              Install shiplog
            </a>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footerInner}`}>
          <div>
            <a href="#top" className={styles.logo}>
              <LogoMark />
              shiplog
            </a>
            <p className={styles.footerNote}>&copy; 2026 shiplog. Built with Rust and Next.js.</p>
          </div>
          <nav className={styles.footerLinks} aria-label="Footer">
            <a href="#example">Example</a>
            <a href="#how">How it works</a>
            <a href="#trust">Features</a>
            <a href="#install">Install</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

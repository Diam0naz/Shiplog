"use client";

import { useState } from "react";
import styles from "./page.module.css";

const delay = (s: string) => ({ "--d": s }) as React.CSSProperties;

/**
 * The hero terminal. Each line fades in on a CSS delay (--d), and the command types out.
 * Changing `run` remounts the body, which restarts every animation.
 */
export default function TerminalDemo() {
  const [run, setRun] = useState(0);

  return (
    <div className={styles.stage}>
      <div className={styles.term}>
        <div className={styles.termBar}>
          <div className={styles.termDots} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span className={styles.termTitle}>~/shiplog</span>
        </div>

        <div className={styles.termBody} key={run}>
          <span className={styles.line} style={delay("0.5s")}>
            <span className={styles.prompt}>$ </span>
            <span className={styles.typed}>shiplog post &quot;voice samples are in&quot;</span>
            <span className={styles.caret} aria-hidden="true" />
          </span>

          <span className={`${styles.line} ${styles.dim}`} style={delay("2.6s")}>
            Found 6 new commits. Drafting...
          </span>

          <span className={styles.line} style={delay("3.5s")}>
            <span className={styles.draft}>
              <span className={styles.draftHead}>
                <span>Draft</span>
                <span>133 / 280</span>
              </span>
              <span className={styles.draftText}>
                Voice samples are in. shiplog now learns your tone from a few of your past posts, so
                drafts read like you and not like release notes.
              </span>
            </span>
          </span>

          <span className={styles.line} style={delay("4.7s")}>
            <span className={styles.prompt}>? </span>
            What now?
            <span className={styles.menu}>
              <span className={styles.sel}>Post</span>
              <span>Edit</span>
              <span>Skip</span>
            </span>
          </span>

          <span className={`${styles.line} ${styles.ok}`} style={delay("5.8s")}>
            Posted to LinkedIn and X.
          </span>
        </div>
      </div>

      <div className={styles.stageFoot}>
        <button type="button" className={styles.replay} onClick={() => setRun((n) => n + 1)}>
          Replay
        </button>
      </div>
    </div>
  );
}

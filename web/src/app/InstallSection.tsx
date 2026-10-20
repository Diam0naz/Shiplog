"use client";

import { useState } from "react";
import CopyButton from "./CopyButton";
import { REPO_URL } from "./site";
import styles from "./page.module.css";

type Tab = {
  id: string;
  label: string;
  available: boolean;
  lines: string[];
  note: string;
};

const TABS: Tab[] = [
  {
    id: "source",
    label: "From source",
    available: true,
    lines: [`git clone ${REPO_URL}.git`, "cd shiplog", "cargo install --path cli"],
    note: "Needs Rust (stable). The shiplog binary is installed to ~/.cargo/bin.",
  },
  {
    id: "cargo",
    label: "Cargo",
    available: false,
    lines: ["cargo install shiplog"],
    note: "Works once the first release is published to crates.io.",
  },
  {
    id: "brew",
    label: "Homebrew",
    available: false,
    lines: ["brew install yourorg/tap/shiplog"],
    note: "Planned. Not available yet.",
  },
];

export default function InstallSection() {
  const [active, setActive] = useState(TABS[0].id);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = TABS.findIndex((t) => t.id === active);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    setActive(TABS[next].id);
    document.getElementById(`tab-${TABS[next].id}`)?.focus();
  }

  return (
    <section id="install" className={styles.install} aria-labelledby="install-title">
      <div className={`${styles.wrap} ${styles.installGrid}`}>
        <div>
          <h2 id="install-title" className={styles.h2}>
            Install shiplog
          </h2>
          <p className={styles.leadDeck}>One binary and nothing else to install.</p>

          <div className={styles.tabs} role="tablist" aria-label="Install method" onKeyDown={onKeyDown}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={active === tab.id}
                aria-controls={`panel-${tab.id}`}
                tabIndex={active === tab.id ? 0 : -1}
                className={`${styles.tab} ${active === tab.id ? styles.tabActive : ""}`}
                onClick={() => setActive(tab.id)}
              >
                {tab.label}
                {!tab.available && <span className={styles.soon}>soon</span>}
              </button>
            ))}
          </div>

          {TABS.map((tab) => (
            <div
              key={tab.id}
              role="tabpanel"
              id={`panel-${tab.id}`}
              aria-labelledby={`tab-${tab.id}`}
              hidden={active !== tab.id}
            >
              <div className={styles.code}>
                <pre>
                  <code>
                    {tab.lines.map((line) => (
                      <span key={line} className={styles.codeLine}>
                        <span className={styles.prompt}>$ </span>
                        {line}
                      </span>
                    ))}
                  </code>
                </pre>
                <CopyButton text={tab.lines.join("\n")} className={styles.copy} />
              </div>
              <p className={styles.panelNote}>{tab.note}</p>
            </div>
          ))}
        </div>

        <div className={`${styles.term} ${styles.termFlat}`} aria-label="Output of shiplog --help">
          <div className={styles.termBar}>
            <div className={styles.termDots} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <span className={styles.termTitle}>shiplog --help</span>
          </div>
          <pre className={styles.helpBody}>
            <code>
              <span className={styles.dim}>Turn your commits into posts</span>
              {"\n\n"}
              Usage: shiplog {"<COMMAND>"}
              {"\n\n"}
              Commands:{"\n"}
              {"  "}login{"  "}Connect your account through the browser{"\n"}
              {"  "}post{"   "}Draft and post an update from your recent commits{"\n"}
              {"  "}voice{"  "}Save sample posts so drafts sound like you{"\n"}
              {"  "}help{"   "}Print this message or the help of the given subcommand(s)
              {"\n\n"}
              Options:{"\n"}
              {"  "}-h, --help{"  "}Print help
            </code>
          </pre>
        </div>
      </div>
    </section>
  );
}

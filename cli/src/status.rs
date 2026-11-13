//! `shiplog status` — a one-glance health check: web app reachability, who you
//! are signed in as, which publishing accounts are connected, and how many
//! commits are waiting since your last post.

use anyhow::Result;
use git2::{Oid, Repository, Sort};
use serde::Deserialize;
use std::time::Duration;

use crate::auth::{load_token, web_base};
use crate::ui;

#[derive(Deserialize)]
struct Me {
    login: String,
    #[serde(default)]
    streak: Option<Streak>,
}

#[derive(Deserialize)]
struct Streak {
    weeks: u32,
    #[serde(rename = "shippedThisWeek")]
    shipped_this_week: bool,
}

/// After a successful post, fetch and show the (now updated) streak — the
/// payoff moment. Best-effort: silent on any failure.
pub async fn show_after_post(client: &reqwest::Client, base: &str, token: &str) {
    let Ok(resp) = client
        .get(format!("{base}/api/session"))
        .bearer_auth(token)
        .send()
        .await
    else {
        return;
    };
    if !resp.status().is_success() {
        return;
    }
    if let Ok(me) = resp.json::<Me>().await
        && let Some(s) = &me.streak
    {
        ui::blank();
        streak_line(s);
    }
}

/// Renders the shipping streak as a status line: a count, a short bar, and a
/// nudge when the streak is alive but you haven't shipped this week yet.
fn streak_line(s: &Streak) {
    if s.weeks == 0 {
        ui::info("No active streak — post to start one.");
        return;
    }
    let bar = "▰".repeat(s.weeks.min(12) as usize);
    if s.shipped_this_week {
        ui::ok(&format!("{bar}  {}-week shipping streak", s.weeks));
    } else {
        ui::warn(&format!(
            "{bar}  {}-week streak — ship this week to keep it going",
            s.weeks
        ));
    }
}

#[derive(Deserialize)]
struct Conn {
    connected: bool,
    #[serde(default)]
    expired: bool,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    username: Option<String>,
}

#[derive(Deserialize)]
struct Connections {
    linkedin: Conn,
    x: Conn,
    farcaster: Conn,
}

pub async fn run() -> Result<()> {
    ui::heading("Status");

    let base = web_base();
    let client = reqwest::Client::new();

    // Reachability: any HTTP response means the web app is up.
    let reachable = client
        .get(&base)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .is_ok();
    if reachable {
        ui::ok(&format!("Web app reachable at {base}"));
    } else {
        ui::warn(&format!("Web app not reachable at {base}"));
    }

    let token = load_token().ok();

    match (&token, reachable) {
        (None, _) => ui::warn("Not logged in — run `shiplog login`."),
        (Some(token), true) => session_and_accounts(&client, &base, token).await,
        (Some(_), false) => {
            ui::info("Credentials are stored locally; start the web app to check accounts.")
        }
    }

    pending(&base);
    Ok(())
}

/// Queries the web app for the signed-in user and connected platforms.
async fn session_and_accounts(client: &reqwest::Client, base: &str, token: &str) {
    match client
        .get(format!("{base}/api/session"))
        .bearer_auth(token)
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => match r.json::<Me>().await {
            Ok(me) => {
                ui::ok(&format!("Logged in as {}", me.login));
                if let Some(s) = &me.streak {
                    streak_line(s);
                }
            }
            Err(_) => ui::ok("Logged in"),
        },
        Ok(r) if r.status() == reqwest::StatusCode::UNAUTHORIZED => {
            ui::warn("Session expired — run `shiplog login` again.");
            return;
        }
        _ => {
            ui::info("Could not verify the session.");
            return;
        }
    }

    let Ok(resp) = client
        .get(format!("{base}/api/connections"))
        .bearer_auth(token)
        .send()
        .await
    else {
        return;
    };
    let Ok(c) = resp.json::<Connections>().await else {
        return;
    };

    ui::blank();
    ui::info("Connected accounts");
    account("LinkedIn", &c.linkedin, c.linkedin.name.as_deref());
    account("X", &c.x, c.x.username.as_deref().map(prefix_at).as_deref());
    account("Farcaster", &c.farcaster, c.farcaster.username.as_deref().map(prefix_at).as_deref());
}

fn prefix_at(u: &str) -> String {
    format!("@{u}")
}

/// One connected-account line, padded so the labels align.
fn account(label: &str, c: &Conn, who: Option<&str>) {
    let label = format!("{label:<10}");
    if !c.connected {
        ui::info(&format!("{label}not connected"));
    } else if c.expired {
        ui::warn(&format!("{label}connected (expired — reconnect)"));
    } else {
        let who = who.map(|w| format!("  {w}")).unwrap_or_default();
        ui::ok(&format!("{label}connected{who}"));
    }
}

/// Counts commits since the last successful post (the `.git/shiplog-last`
/// marker), without contacting the web app.
fn pending(_base: &str) {
    ui::blank();
    ui::info("Pending since last post");

    let Ok(repo) = Repository::discover(".") else {
        ui::info("Not inside a git repository.");
        return;
    };

    let since = std::fs::read_to_string(repo.path().join("shiplog-last"))
        .ok()
        .and_then(|s| Oid::from_str(s.trim()).ok());

    let mut walk = match repo.revwalk() {
        Ok(w) => w,
        Err(_) => return,
    };
    if walk.push_head().is_err() {
        ui::info("No commits yet.");
        return;
    }
    let _ = walk.set_sorting(Sort::TIME);

    let mut rows: Vec<(String, String)> = Vec::new();
    for oid in walk.flatten() {
        if Some(oid) == since || rows.len() >= 20 {
            break;
        }
        if let Ok(c) = repo.find_commit(oid) {
            let hash = oid.to_string()[..7].to_string();
            let subject = c.summary().ok().flatten().unwrap_or("").to_string();
            rows.push((hash, subject));
        }
    }

    if rows.is_empty() {
        ui::ok("Up to date — nothing new to ship.");
        return;
    }

    let more = rows.len() >= 20;
    ui::ok(&format!(
        "{}{} commit(s) ready to ship",
        rows.len(),
        if more { "+" } else { "" }
    ));
    for (hash, subject) in rows.iter().take(5) {
        ui::info(&format!("{hash}  {}", ui::truncate(subject, 56)));
    }
    if rows.len() > 5 {
        ui::info(&format!("… and {} more", rows.len() - 5));
    }
}

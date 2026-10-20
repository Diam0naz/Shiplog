use anyhow::{Context, Result, bail};
use git2::{Oid, Repository, Sort};
use serde::{Deserialize, Serialize};

use crate::auth::{load_token, web_base};
use crate::ui;

#[derive(Serialize)]
struct Commit {
    hash: String,
    subject: String,
    body: String,
    files: Vec<String>,
}

#[derive(Serialize)]
struct DraftReq {
    commits: Vec<Commit>,
    note: Option<String>,
    voice: Vec<String>,
}

#[derive(Deserialize)]
struct DraftResp {
    draft: String,
}

/// A publishing target. Wire names match the web API's `targets` values.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Platform {
    LinkedIn,
    X,
}

impl Platform {
    fn wire(self) -> &'static str {
        match self {
            Platform::LinkedIn => "linkedin",
            Platform::X => "x",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Platform::LinkedIn => "LinkedIn",
            Platform::X => "X",
        }
    }

    fn connect_url(self, base: &str) -> String {
        match self {
            Platform::LinkedIn => format!("{base}/api/linkedin/connect"),
            Platform::X => format!("{base}/api/x/connect"),
        }
    }

    fn from_wire(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "linkedin" => Some(Platform::LinkedIn),
            "x" | "twitter" => Some(Platform::X),
            _ => None,
        }
    }
}

const ALL: [Platform; 2] = [Platform::LinkedIn, Platform::X];

#[derive(Deserialize)]
struct Connection {
    connected: bool,
}

#[derive(Deserialize)]
struct Connections {
    linkedin: Connection,
    x: Connection,
}

#[derive(Deserialize)]
struct PostResult {
    platform: String,
    ok: bool,
    url: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct PostResp {
    #[serde(default)]
    results: Vec<PostResult>,
    error: Option<String>,
}

fn changed_files(repo: &Repository, c: &git2::Commit) -> Vec<String> {
    let Ok(tree) = c.tree() else { return vec![] };
    let parent_tree = c.parent(0).ok().and_then(|p| p.tree().ok());
    let Ok(diff) = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None) else {
        return vec![];
    };
    diff.deltas()
        .filter_map(|d| {
            d.new_file()
                .path()
                .map(|p| p.to_string_lossy().into_owned())
        })
        .take(8)
        .collect()
}

/// Parses `--to`: a comma-separated list of platforms, or `all`.
fn parse_targets(raw: &str) -> Result<Vec<Platform>> {
    if raw.trim().eq_ignore_ascii_case("all") {
        return Ok(ALL.to_vec());
    }
    let mut out = Vec::new();
    for part in raw.split(',') {
        if part.trim().is_empty() {
            continue;
        }
        let p = Platform::from_wire(part)
            .with_context(|| format!("unknown target `{}` — use linkedin, x or all", part.trim()))?;
        if !out.contains(&p) {
            out.push(p);
        }
    }
    if out.is_empty() {
        bail!("--to needs at least one of: linkedin, x, all");
    }
    Ok(out)
}

/// Which accounts the web app has credentials for. `None` means the question
/// could not be answered (older server, network hiccup) — the post request
/// then lets the server decide instead of guessing.
async fn fetch_connections(
    client: &reqwest::Client,
    base: &str,
    token: &str,
) -> Option<Vec<Platform>> {
    let resp = client
        .get(format!("{base}/api/connections"))
        .bearer_auth(token)
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let c: Connections = resp.json().await.ok()?;
    let mut out = Vec::new();
    if c.linkedin.connected {
        out.push(Platform::LinkedIn);
    }
    if c.x.connected {
        out.push(Platform::X);
    }
    Some(out)
}

/// Decides where the approved draft goes: the `--to` flag, the only connected
/// account, or an explicit pick when several are connected.
fn choose_targets(
    requested: Option<&str>,
    connected: Option<&[Platform]>,
    base: &str,
) -> Result<Option<Vec<Platform>>> {
    if let Some(raw) = requested {
        let targets = parse_targets(raw)?;
        for t in &targets {
            if let Some(c) = connected
                && !c.contains(t)
            {
                bail!(
                    "{} is not connected — connect it at {}",
                    t.label(),
                    t.connect_url(base)
                );
            }
        }
        return Ok(Some(targets));
    }

    match connected {
        None => Ok(None), // let the server publish everywhere that is connected
        Some([]) => bail!(
            "no account connected yet — connect LinkedIn at {} or X at {}",
            Platform::LinkedIn.connect_url(base),
            Platform::X.connect_url(base)
        ),
        Some([only]) => Ok(Some(vec![*only])),
        Some(list) => {
            let options: Vec<&str> = list.iter().map(|p| p.label()).collect();
            let defaults: Vec<usize> = (0..options.len()).collect();
            let picked = inquire::MultiSelect::new("Where should this post?", options)
                .with_default(&defaults)
                .with_help_message("space to toggle · enter to post")
                .with_render_config(ui::render_config())
                .prompt()?;
            if picked.is_empty() {
                bail!("no target selected — nothing was posted");
            }
            Ok(Some(
                list.iter()
                    .filter(|p| picked.contains(&p.label()))
                    .copied()
                    .collect(),
            ))
        }
    }
}

fn label_for(wire: &str) -> &'static str {
    Platform::from_wire(wire).map(Platform::label).unwrap_or("platform")
}

pub async fn run(note: Option<String>, to: Option<String>) -> Result<()> {
    let token = load_token()?;
    let repo = Repository::discover(".").context("not inside a git repository")?;

    // Marker file sits inside .git/ so it's repo-local but not tracked.
    let marker = repo.path().join("shiplog-last");
    let since = std::fs::read_to_string(&marker)
        .ok()
        .and_then(|s| Oid::from_str(s.trim()).ok());

    let mut walk = repo.revwalk()?;
    walk.push_head().context("no commits yet")?;
    walk.set_sorting(Sort::TIME)?;

    let mut commits = Vec::new();
    let mut newest: Option<Oid> = None;
    for oid in walk {
        let oid = oid?;
        if Some(oid) == since || commits.len() >= 20 {
            break;
        }
        let c = repo.find_commit(oid)?;
        if newest.is_none() {
            newest = Some(oid);
        }
        commits.push(Commit {
            hash: oid.to_string()[..7].to_string(),
            // summary() and body() return Result<Option<&str>> in git2.
            subject: c.summary().ok().flatten().unwrap_or("").to_string(),
            body: c
                .body()
                .ok()
                .flatten()
                .unwrap_or("")
                .chars()
                .take(300)
                .collect(),
            files: changed_files(&repo, &c),
        });
    }

    if commits.is_empty() {
        ui::warn("Nothing new since your last ship.");
        ui::info("Make a commit, then run `shiplog post` again.");
        return Ok(());
    }

    ui::heading("Recent commits");
    ui::commit_table_header(commits.len());
    for c in &commits {
        ui::commit_row(&c.hash, &c.subject);
    }

    ui::blank();
    ui::step("Drafting an update…");

    let base = web_base();
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{base}/api/draft"))
        .bearer_auth(&token)
        .json(&DraftReq {
            commits,
            note,
            voice: crate::voice::load(),
        })
        .send()
        .await?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        bail!("session expired — run `shiplog login` again");
    }
    let mut draft = resp.error_for_status()?.json::<DraftResp>().await?.draft;

    // Plain labels without emoji so the match is never fragile.
    const OPT_POST: &str = "Post";
    const OPT_EDIT: &str = "Edit";
    const OPT_SKIP: &str = "Skip";

    loop {
        ui::blank();
        ui::draft_card(&draft);

        let choice = inquire::Select::new("What now?", vec![OPT_POST, OPT_EDIT, OPT_SKIP])
            .with_help_message("↑ ↓ to move · enter to select")
            .with_render_config(ui::render_config())
            .prompt()?;

        match choice {
            OPT_POST => {
                let connected = fetch_connections(&client, &base, &token).await;
                let targets = choose_targets(to.as_deref(), connected.as_deref(), &base)?;

                ui::blank();
                ui::step("Posting…");

                let mut body = serde_json::json!({ "text": draft });
                if let Some(t) = &targets {
                    let wire: Vec<&str> = t.iter().map(|p| p.wire()).collect();
                    body["targets"] = serde_json::json!(wire);
                }

                let resp = client
                    .post(format!("{base}/api/post"))
                    .bearer_auth(&token)
                    .json(&body)
                    .send()
                    .await?;

                let status = resp.status();
                let raw = resp.text().await.unwrap_or_default();
                let parsed: Option<PostResp> = serde_json::from_str(&raw).ok();

                let Some(PostResp { results, error }) = parsed else {
                    bail!(
                        "post failed ({}): {}",
                        status.as_u16(),
                        if raw.trim().is_empty() { "empty response" } else { raw.trim() }
                    );
                };

                // 207 means some platforms accepted the post and some did not.
                if !status.is_success() {
                    bail!(
                        "post failed: {}",
                        error.unwrap_or_else(|| format!("HTTP {}", status.as_u16()))
                    );
                }

                let posted = results.iter().filter(|r| r.ok).count();
                for r in results.iter().filter(|r| r.ok) {
                    ui::ok(&format!("Posted to {}.", label_for(&r.platform)));
                    if let Some(url) = &r.url {
                        ui::url(url);
                    }
                }
                for r in results.iter().filter(|r| !r.ok) {
                    ui::warn(&format!(
                        "{} failed: {}",
                        label_for(&r.platform),
                        r.error.as_deref().unwrap_or("unknown error")
                    ));
                }

                if posted == 0 {
                    bail!("nothing was published");
                }
                if posted < results.len() {
                    ui::info("These commits are marked as posted so the platforms that worked are not posted twice.");
                }

                // Atomically update the marker: write to a temp file first,
                // then rename. This means we never end up with a corrupt or
                // missing marker if the process dies mid-write.
                if let Some(oid) = newest {
                    let tmp = marker.with_extension("tmp");
                    std::fs::write(&tmp, oid.to_string())?;
                    std::fs::rename(&tmp, &marker)?;
                }

                return Ok(());
            }
            OPT_EDIT => {
                draft = inquire::Editor::new("Edit draft")
                    .with_predefined_text(&draft)
                    .with_render_config(ui::render_config())
                    .prompt()?;
            }
            _ => {
                // OPT_SKIP or anything unexpected
                ui::warn("Skipped — nothing was posted.");
                return Ok(());
            }
        }
    }
}

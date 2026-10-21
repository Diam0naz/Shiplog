use anyhow::{Context, Result, bail};
use git2::{Oid, Repository, Sort};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::auth::{load_token, web_base};
use crate::ui;

const MAX_IMAGES: usize = 4;
const MAX_IMAGE_BYTES: u64 = 4 * 1024 * 1024;
const CARD_MAX_LINES: usize = 12;
const CARD_MAX_COLS: usize = 76;

struct LocalImage {
    path: PathBuf,
    mime: &'static str,
}

#[derive(Serialize)]
struct ImageRef {
    url: String,
    alt: Option<String>,
}

#[derive(Deserialize)]
struct UploadResp {
    url: String,
}

/// Fail fast, before any drafting, so a typo in a path doesn't cost a draft.
fn check_images(paths: &[PathBuf]) -> Result<Vec<LocalImage>> {
    if paths.len() > MAX_IMAGES {
        bail!("at most {MAX_IMAGES} images per post");
    }
    paths
        .iter()
        .map(|p| {
            let meta = std::fs::metadata(p)
                .with_context(|| format!("can't read image {}", p.display()))?;
            if meta.len() > MAX_IMAGE_BYTES {
                bail!("{} is over 4 MB", p.display());
            }
            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
            let mime = match ext.as_str() {
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                "webp" => "image/webp",
                "gif" => "image/gif",
                _ => bail!("{}: use PNG, JPEG, WebP or GIF", p.display()),
            };
            Ok(LocalImage { path: p.clone(), mime })
        })
        .collect()
}

async fn upload_images(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    images: &[LocalImage],
) -> Result<Vec<ImageRef>> {
    let mut out = Vec::new();
    for img in images {
        let name = img.path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let alt = inquire::Text::new(&format!("Alt text for {name} (optional)"))
            .with_render_config(ui::render_config())
            .prompt()?;
        let bytes = std::fs::read(&img.path)?;
        let resp = client
            .post(format!("{base}/api/upload"))
            .bearer_auth(token)
            .header("content-type", img.mime)
            .body(bytes)
            .send()
            .await?;
        if !resp.status().is_success() {
            bail!("uploading {name} failed ({})", resp.status().as_u16());
        }
        let up = resp.json::<UploadResp>().await?;
        out.push(ImageRef { url: up.url, alt: (!alt.trim().is_empty()).then(|| alt.trim().to_string()) });
    }
    Ok(out)
}

#[derive(Serialize, Clone)]
struct SnipLine {
    kind: &'static str, // "add" | "del" | "ctx"
    text: String,
}

#[derive(Serialize, Clone)]
struct Snippet {
    file: String,
    lang: String,
    title: String,
    lines: Vec<SnipLine>,
}

#[derive(Deserialize)]
struct CardResp {
    url: String,
    alt: String,
}

/// Allow-list on purpose: configs, env files and keys never become cards.
fn language_for(path: &str) -> Option<&'static str> {
    if path.ends_with(".min.js") || path.contains("generated") {
        return None;
    }
    let ext = path.rsplit('.').next()?.to_ascii_lowercase();
    Some(match ext.as_str() {
        "rs" => "Rust",
        "ts" | "tsx" => "TypeScript",
        "js" | "jsx" | "mjs" => "JavaScript",
        "py" => "Python",
        "go" => "Go",
        "sol" => "Solidity",
        "css" => "CSS",
        "java" => "Java",
        "kt" => "Kotlin",
        "swift" => "Swift",
        "c" | "h" => "C",
        "cpp" => "C++",
        _ => return None,
    })
}

/// Keeps the CARD_MAX_LINES window with the most changed lines.
fn best_window(lines: Vec<SnipLine>) -> Vec<SnipLine> {
    if lines.len() <= CARD_MAX_LINES {
        return lines;
    }
    let (mut best_start, mut best_score) = (0, 0);
    for s in 0..=(lines.len() - CARD_MAX_LINES) {
        let score = lines[s..s + CARD_MAX_LINES]
            .iter()
            .filter(|l| l.kind != "ctx")
            .count();
        if score > best_score {
            best_score = score;
            best_start = s;
        }
    }
    lines[best_start..best_start + CARD_MAX_LINES].to_vec()
}

/// Strip shared indentation, then clip long lines.
fn tidy(lines: &mut [SnipLine]) {
    for l in lines.iter_mut() {
        l.text = l.text.replace('\t', "    ");
    }
    let indent = lines
        .iter()
        .filter(|l| !l.text.trim().is_empty())
        .map(|l| l.text.len() - l.text.trim_start().len())
        .min()
        .unwrap_or(0);
    for l in lines.iter_mut() {
        let t: String = l.text.chars().skip(indent).collect();
        l.text = if t.chars().count() > CARD_MAX_COLS {
            let mut c: String = t.chars().take(CARD_MAX_COLS - 1).collect();
            c.push('…');
            c
        } else {
            t
        };
    }
}

/// Finds the most interesting hunk across the new commits.
fn pick_snippet(repo: &Repository, oids: &[Oid]) -> Option<Snippet> {
    let mut best: Option<(usize, Snippet)> = None;
    for oid in oids.iter().take(10) {
        let Ok(c) = repo.find_commit(*oid) else { continue };
        let Ok(tree) = c.tree() else { continue };
        let parent_tree = c.parent(0).ok().and_then(|p| p.tree().ok());
        let Ok(diff) = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None) else {
            continue;
        };
        let title = c.summary().ok().flatten().unwrap_or("").to_string();

        for idx in 0..diff.deltas().len() {
            let Ok(Some(patch)) = git2::Patch::from_diff(&diff, idx) else { continue };
            let Some(path) = patch
                .delta()
                .new_file()
                .path()
                .map(|p| p.to_string_lossy().into_owned())
            else {
                continue;
            };
            let Some(lang) = language_for(&path) else { continue };

            for h in 0..patch.num_hunks() {
                let Ok((_, n)) = patch.hunk(h) else { continue };
                let mut lines = Vec::new();
                for l in 0..n {
                    let Ok(line) = patch.line_in_hunk(h, l) else { continue };
                    let kind = match line.origin() {
                        '+' => "add",
                        '-' => "del",
                        ' ' => "ctx",
                        _ => continue,
                    };
                    let text = String::from_utf8_lossy(line.content())
                        .trim_end_matches(['\n', '\r'])
                        .to_string();
                    lines.push(SnipLine { kind, text });
                }

                let mut lines = best_window(lines);
                let adds = lines.iter().filter(|l| l.kind == "add").count();
                let dels = lines.iter().filter(|l| l.kind == "del").count();
                if adds == 0 || adds + dels < 2 {
                    continue;
                }
                tidy(&mut lines);
                let score = adds * 2 + dels;
                if best.as_ref().is_none_or(|(s, _)| score > *s) {
                    best = Some((
                        score,
                        Snippet {
                            file: path.clone(),
                            lang: lang.to_string(),
                            title: title.clone(),
                            lines,
                        },
                    ));
                }
            }
        }
    }
    best.map(|(_, s)| s)
}

fn confirm_card(s: &Snippet) -> Result<bool> {
    ui::blank();
    ui::info(&format!("Code card from {} ({})", s.file, s.lang));
    for l in &s.lines {
        let mark = match l.kind {
            "add" => "+",
            "del" => "-",
            _ => " ",
        };
        ui::info(&format!("{mark} {}", l.text));
    }
    ui::warn("This goes into a public image. Check it for keys or private details.");
    Ok(inquire::Confirm::new("Attach this card?")
        .with_default(true)
        .with_render_config(ui::render_config())
        .prompt()?)
}

async fn render_card(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    s: &Snippet,
) -> Result<ImageRef> {
    let resp = client
        .post(format!("{base}/api/card"))
        .bearer_auth(token)
        .json(s)
        .send()
        .await?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let msg = resp.text().await.unwrap_or_default();
        bail!("card failed ({status}): {}", msg.trim());
    }
    let c = resp.json::<CardResp>().await?;
    Ok(ImageRef { url: c.url, alt: Some(c.alt) })
}

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
    Farcaster,
}

impl Platform {
    fn wire(self) -> &'static str {
        match self {
            Platform::LinkedIn => "linkedin",
            Platform::X => "x",
            Platform::Farcaster => "farcaster",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Platform::LinkedIn => "LinkedIn",
            Platform::X => "X",
            Platform::Farcaster => "Farcaster",
        }
    }

    fn connect_url(self, base: &str) -> String {
        match self {
            Platform::LinkedIn => format!("{base}/api/linkedin/connect"),
            Platform::X => format!("{base}/api/x/connect"),
            Platform::Farcaster => format!("{base}/connect/farcaster"),
        }
    }

    fn from_wire(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "linkedin" => Some(Platform::LinkedIn),
            "x" | "twitter" => Some(Platform::X),
            "farcaster" | "fc" => Some(Platform::Farcaster),
            _ => None,
        }
    }
}

const ALL: [Platform; 3] = [Platform::LinkedIn, Platform::X, Platform::Farcaster];

#[derive(Deserialize)]
struct Connection {
    connected: bool,
}

#[derive(Deserialize)]
struct Connections {
    linkedin: Connection,
    x: Connection,
    farcaster: Connection,
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
        bail!("--to needs at least one of: linkedin, x, farcaster, all");
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
    if c.farcaster.connected {
        out.push(Platform::Farcaster);
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
            "no account connected yet — connect LinkedIn at {}, X at {}, or Farcaster at {}",
            Platform::LinkedIn.connect_url(base),
            Platform::X.connect_url(base),
            Platform::Farcaster.connect_url(base)
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

pub async fn run(note: Option<String>, to: Option<String>, images: Vec<PathBuf>, want_card: bool) -> Result<()> {
    let local_images = check_images(&images)?;   // first line, before load_token
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
    let mut oids: Vec<Oid> = Vec::new();
    for oid in walk {
        let oid = oid?;
        if Some(oid) == since || commits.len() >= 20 {
            break;
        }
        let c = repo.find_commit(oid)?;
        if newest.is_none() {
            newest = Some(oid);
        }
        oids.push(oid);
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

    // Pick snippet for potential card
    let snippet = pick_snippet(&repo, &oids);
    let mut card: Option<Snippet> = None;
    if want_card {
        match &snippet {
            Some(s) if local_images.len() < MAX_IMAGES => {
                if confirm_card(s)? {
                    card = Some(s.clone());
                }
            }
            Some(_) => ui::warn("Already at the image limit, so no card."),
            None => ui::warn("No suitable code change found for a card."),
        }
    }

    // Plain labels without emoji so the match is never fragile.
    const OPT_POST: &str = "Post";
    const OPT_EDIT: &str = "Edit";
    const OPT_SKIP: &str = "Skip";
    const OPT_CARD_ADD: &str = "Add code card";
    const OPT_CARD_REMOVE: &str = "Remove code card";

    loop {
        ui::blank();
        ui::draft_card(&draft);

        let attached = local_images.len() + usize::from(card.is_some());
        if attached > 0 {
            ui::info(&format!("{attached} image(s) attached"));
        }

        let mut options = vec![OPT_POST];
        if card.is_some() {
            options.push(OPT_CARD_REMOVE);
        } else if snippet.is_some() {
            options.push(OPT_CARD_ADD);
        }
        options.push(OPT_EDIT);
        options.push(OPT_SKIP);

        let choice = inquire::Select::new("What now?", options)
            .with_help_message("↑ ↓ to move · enter to select")
            .with_render_config(ui::render_config())
            .prompt()?;

        match choice {
            OPT_POST => {
                let connected = fetch_connections(&client, &base, &token).await;
                let targets = choose_targets(to.as_deref(), connected.as_deref(), &base)?;

                // Upload images after target selection (so skipped drafts don't leave orphaned blobs)
                let mut refs = upload_images(&client, &base, &token, &local_images).await?;
                if let Some(s) = &card {
                    ui::step("Rendering code card…");
                    refs.insert(0, render_card(&client, &base, &token, s).await?);
                }

                ui::blank();
                ui::step("Posting…");

                let mut body = serde_json::json!({ "text": draft });
                if let Some(t) = &targets {
                    let wire: Vec<&str> = t.iter().map(|p| p.wire()).collect();
                    body["targets"] = serde_json::json!(wire);
                }
                if !refs.is_empty() {
                    body["images"] = serde_json::json!(refs);
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
            OPT_CARD_ADD => {
                if local_images.len() >= MAX_IMAGES {
                    ui::warn("Already at the image limit.");
                } else if let Some(s) = &snippet
                    && confirm_card(s)?
                {
                    card = Some(s.clone());
                }
            }
            OPT_CARD_REMOVE => card = None,
            _ => {
                // OPT_SKIP or anything unexpected
                ui::warn("Skipped — nothing was posted.");
                return Ok(());
            }
        }
    }
}

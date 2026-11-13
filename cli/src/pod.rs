//! `shiplog pod` — builder pods: ship alongside a small group of builders.
//! Opt in with a handle, create or join a pod by code, and see who in your pod
//! shipped this week.

use anyhow::{Result, bail};
use serde::Deserialize;

use crate::auth::{load_token, web_base};
use crate::ui;

#[derive(clap::Subcommand)]
pub enum PodAction {
    /// Create a pod and get a join code to share
    Create {
        /// A name for the pod
        name: String,
    },
    /// Join a pod by its code
    Join {
        /// The pod's join code
        code: String,
    },
    /// Leave a pod by its id
    Leave {
        /// The pod id (shown by `shiplog pod`)
        id: String,
    },
    /// Suggest similar builders to invite (shared tags, language, activity)
    Suggest,
}

#[derive(Deserialize)]
struct Builder {
    handle: String,
}

#[derive(Deserialize)]
struct Member {
    handle: String,
    #[serde(rename = "isYou", default)]
    is_you: bool,
    #[serde(rename = "shippedThisWeek", default)]
    shipped_this_week: bool,
    #[serde(default)]
    weeks: u32,
}

#[derive(Deserialize)]
struct Suggestion {
    handle: String,
    #[serde(rename = "primaryLang", default)]
    primary_lang: Option<String>,
    #[serde(rename = "sharedTags", default)]
    shared_tags: Vec<String>,
    #[serde(default)]
    active: bool,
}

#[derive(Deserialize)]
struct SuggestResp {
    #[serde(default)]
    suggestions: Vec<Suggestion>,
}

#[derive(Deserialize)]
struct Pod {
    id: String,
    name: String,
    #[serde(rename = "joinCode")]
    join_code: String,
    #[serde(default)]
    members: Vec<Member>,
}

#[derive(Deserialize)]
struct BuilderResp {
    builder: Option<Builder>,
    #[serde(default)]
    pods: Vec<Pod>,
}

#[derive(Deserialize)]
struct PodResp {
    pod: Pod,
}

async fn error_of(resp: reqwest::Response) -> String {
    #[derive(Deserialize)]
    struct E {
        error: Option<String>,
    }
    let status = resp.status().as_u16();
    let body = resp.text().await.unwrap_or_default();
    serde_json::from_str::<E>(&body)
        .ok()
        .and_then(|e| e.error)
        .unwrap_or_else(|| format!("HTTP {status}"))
}

pub async fn run(action: Option<PodAction>) -> Result<()> {
    let base = web_base();
    let token = load_token()?;
    let client = reqwest::Client::new();

    match action {
        None => list(&client, &base, &token).await,
        Some(PodAction::Create { name }) => {
            ensure_builder(&client, &base, &token).await?;
            create(&client, &base, &token, &name).await
        }
        Some(PodAction::Join { code }) => {
            ensure_builder(&client, &base, &token).await?;
            join(&client, &base, &token, &code).await
        }
        Some(PodAction::Leave { id }) => leave(&client, &base, &token, &id).await,
        Some(PodAction::Suggest) => {
            ensure_builder(&client, &base, &token).await?;
            suggest(&client, &base, &token).await
        }
    }
}

/// Fetches the builder profile, prompting to opt in (set a handle) if needed.
async fn ensure_builder(
    client: &reqwest::Client,
    base: &str,
    token: &str,
) -> Result<()> {
    let resp = client
        .get(format!("{base}/api/builder"))
        .bearer_auth(token)
        .send()
        .await?;
    if !resp.status().is_success() {
        bail!("{}", error_of(resp).await);
    }
    let data: BuilderResp = resp.json().await?;
    if data.builder.is_some() {
        return Ok(());
    }

    ui::info("First time: pick a builder handle (how your pod sees you).");
    let handle = inquire::Text::new("Builder handle")
        .with_render_config(ui::render_config())
        .prompt()?;
    if handle.trim().is_empty() {
        bail!("a handle is required to join builder mode");
    }

    let resp = client
        .post(format!("{base}/api/builder"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "handle": handle.trim() }))
        .send()
        .await?;
    if !resp.status().is_success() {
        bail!("{}", error_of(resp).await);
    }
    ui::ok(&format!("You're in as @{}", handle.trim()));
    Ok(())
}

async fn list(client: &reqwest::Client, base: &str, token: &str) -> Result<()> {
    ui::heading("Pods");
    let resp = client
        .get(format!("{base}/api/builder"))
        .bearer_auth(token)
        .send()
        .await?;
    if !resp.status().is_success() {
        bail!("{}", error_of(resp).await);
    }
    let data: BuilderResp = resp.json().await?;

    let Some(builder) = data.builder else {
        ui::info("You're not in builder mode yet.");
        ui::info("Create a pod with `shiplog pod create <name>`, or join one with");
        ui::info("`shiplog pod join <code>`.");
        return Ok(());
    };
    ui::ok(&format!("Builder @{}", builder.handle));

    if data.pods.is_empty() {
        ui::blank();
        ui::info("No pods yet — create one or join with a code.");
        return Ok(());
    }

    for pod in &data.pods {
        ui::blank();
        ui::info(&format!("{}  ·  code {}  ·  id {}", pod.name, pod.join_code, pod.id));
        for m in &pod.members {
            let who = if m.is_you {
                format!("@{} (you)", m.handle)
            } else {
                format!("@{}", m.handle)
            };
            let streak = if m.weeks > 0 {
                format!("{}-wk streak", m.weeks)
            } else {
                "no streak".to_string()
            };
            if m.shipped_this_week {
                ui::ok(&format!("{who}  ·  shipped this week  ·  {streak}"));
            } else {
                ui::info(&format!("  {who}  ·  not yet this week  ·  {streak}"));
            }
        }
    }
    Ok(())
}

async fn create(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    name: &str,
) -> Result<()> {
    let resp = client
        .post(format!("{base}/api/pods"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "name": name }))
        .send()
        .await?;
    if !resp.status().is_success() {
        bail!("{}", error_of(resp).await);
    }
    let pod = resp.json::<PodResp>().await?.pod;
    ui::heading("Pod created");
    ui::ok(&pod.name);
    ui::info("Share this code so others can join:");
    ui::ok(&pod.join_code);
    Ok(())
}

async fn join(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    code: &str,
) -> Result<()> {
    let resp = client
        .post(format!("{base}/api/pods/join"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "code": code }))
        .send()
        .await?;
    if !resp.status().is_success() {
        bail!("{}", error_of(resp).await);
    }
    let pod = resp.json::<PodResp>().await?.pod;
    ui::ok(&format!("Joined {} ({} member(s))", pod.name, pod.members.len()));
    Ok(())
}

async fn leave(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    id: &str,
) -> Result<()> {
    let resp = client
        .post(format!("{base}/api/pods/leave"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "podId": id }))
        .send()
        .await?;
    if !resp.status().is_success() {
        bail!("{}", error_of(resp).await);
    }
    ui::ok("Left the pod.");
    Ok(())
}

async fn suggest(client: &reqwest::Client, base: &str, token: &str) -> Result<()> {
    ui::heading("Similar builders");
    let resp = client
        .get(format!("{base}/api/suggestions"))
        .bearer_auth(token)
        .send()
        .await?;
    if !resp.status().is_success() {
        bail!("{}", error_of(resp).await);
    }
    let data: SuggestResp = resp.json().await?;
    if data.suggestions.is_empty() {
        ui::info("No other builders to suggest yet — invite people with your pod code.");
        return Ok(());
    }

    for s in &data.suggestions {
        let mut bits: Vec<String> = Vec::new();
        if let Some(lang) = &s.primary_lang {
            bits.push(lang.clone());
        }
        if !s.shared_tags.is_empty() {
            bits.push(format!("shares {}", s.shared_tags.join(", ")));
        }
        if s.active {
            bits.push("shipping this week".to_string());
        }
        let detail = if bits.is_empty() {
            String::new()
        } else {
            format!("  ·  {}", bits.join("  ·  "))
        };
        ui::ok(&format!("@{}{detail}", s.handle));
    }
    ui::blank();
    ui::info("Share your pod code with them to ship together.");
    Ok(())
}

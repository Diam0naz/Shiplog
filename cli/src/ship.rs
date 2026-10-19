use anyhow::{Context, Result, bail};
use git2::{Oid, Repository, Sort};
use serde::{Deserialize, Serialize};

use crate::auth::{WEB_BASE, load_token};

#[derive(Serialize)]
struct Commit {
    hash: String,
    subject: String,
}

#[derive(Serialize)]
struct DraftReq {
    commits: Vec<Commit>,
    note: Option<String>,
}

#[derive(Deserialize)]
struct DraftResp {
    draft: String,
}

pub async fn run(note: Option<String>) -> Result<()> {
    let token = load_token()?;
    let repo = Repository::discover(".").context("not inside a git repository")?;

    // Marker file remembering the last commit we shipped, stored inside .git
    let marker = repo.path().join("ship-last");
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
            subject: c.summary().unwrap_or(Some("")).expect("REASON").to_string(),
        });
    }

    if commits.is_empty() {
        println!("Nothing new since your last ship.");
        return Ok(());
    }
    println!("Found {} new commit(s). Drafting...", commits.len());

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{WEB_BASE}/api/draft"))
        .bearer_auth(&token)
        .json(&DraftReq { commits, note })
        .send()
        .await?;
    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        bail!("session expired, run `ship login` again");
    }
    let mut draft = resp.error_for_status()?.json::<DraftResp>().await?.draft;

    loop {
        println!("\n----------------\n{draft}\n----------------");
        let choice = inquire::Select::new("What now?", vec!["Post", "Edit", "Skip"]).prompt()?;
        match choice {
            "Post" => {
                client
                    .post(format!("{WEB_BASE}/api/post"))
                    .bearer_auth(&token)
                    .json(&serde_json::json!({ "text": draft }))
                    .send()
                    .await?
                    .error_for_status()?;
                if let Some(oid) = newest {
                    std::fs::write(&marker, oid.to_string())?;
                }
                println!("Posted (stub).");
                return Ok(());
            }
            "Edit" => {
                draft = inquire::Text::new("Edit draft:")
                    .with_initial_value(&draft)
                    .prompt()?;
            }
            _ => {
                println!("Skipped.");
                return Ok(());
            }
        }
    }
}

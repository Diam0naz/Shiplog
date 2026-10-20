use anyhow::{Context, Result, bail};
use rand::{Rng, distributions::Alphanumeric};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, io::Write, time::Duration};
use url::Url;

use crate::ui;

/// The base URL for the shiplog web service.
/// Override with SHIPLOG_WEB to point at a staging or self-hosted instance,
/// e.g. `SHIPLOG_WEB=https://staging.shiplog.dev shiplog login`.
pub fn web_base() -> String {
    std::env::var("SHIPLOG_WEB").unwrap_or_else(|_| "http://localhost:3000".into())
}

#[derive(Serialize, Deserialize)]
struct Credentials {
    token: String,
}

#[derive(Deserialize)]
struct TokenResp {
    token: String,
}

fn save_token(token: &str) -> Result<()> {
    let path = crate::config_dir()?.join("credentials.json");
    let mut opts = fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600); // owner-only read/write, applied at file creation
    }
    let mut f = opts.open(&path)?;
    f.write_all(
        serde_json::to_string(&Credentials {
            token: token.into(),
        })?
        .as_bytes(),
    )?;
    Ok(())
}

pub fn load_token() -> Result<String> {
    let path = crate::config_dir()?.join("credentials.json");
    let raw = fs::read_to_string(&path)
        .with_context(|| "not logged in — run `shiplog login` first")?;
    Ok(serde_json::from_str::<Credentials>(&raw)?.token)
}

pub async fn login() -> Result<()> {
    let state: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();

    // Listen on a random free port, loopback-only.
    let server = tiny_http::Server::http("127.0.0.1:0").map_err(|e| anyhow::anyhow!(e))?;
    let port = server.server_addr().to_ip().context("no port")?.port();

    let base = web_base();
    let url = format!("{base}/cli/login?port={port}&state={state}");

    ui::heading("Login");
    ui::step("Opening your browser to finish signing in");
    ui::info("If nothing opens, visit this URL:");
    ui::url(&url);
    ui::info("Waiting for approval — press Ctrl-C to cancel.");
    let _ = open::that(&url);

    let expected = state.clone();
    // tiny_http is sync; run it on the blocking thread pool so the async
    // runtime is not stalled.
    let code = tokio::task::spawn_blocking(move || -> Result<String> {
        let timeout = Duration::from_secs(180);
        loop {
            // recv_timeout returns Ok(None) on timeout, Ok(Some(req)) on a
            // request, or Err on I/O failure.
            let req = match server.recv_timeout(timeout)? {
                Some(r) => r,
                None => bail!(
                    "timed out after 3 minutes waiting for browser login — try `shiplog login` again"
                ),
            };
            let parsed = Url::parse(&format!("http://127.0.0.1{}", req.url()))?;
            if parsed.path() != "/callback" {
                let _ = req.respond(tiny_http::Response::empty(404));
                continue;
            }
            let q: HashMap<String, String> = parsed.query_pairs().into_owned().collect();
            if q.get("state") != Some(&expected) {
                let _ = req.respond(
                    tiny_http::Response::from_string("Invalid state").with_status_code(400),
                );
                bail!("state mismatch — login aborted");
            }
            let code = q.get("code").cloned().context("missing code in callback")?;
            let html =
                tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap();
            let _ = req.respond(
                tiny_http::Response::from_string(
                    "<h1 style='font-family:system-ui;color:#16a34a'>\
                     ✅ Logged in. You can close this tab.</h1>",
                )
                .with_header(html),
            );
            return Ok(code);
        }
    })
    .await??;

    // Exchange the one-time code for a persistent session token.
    let resp = reqwest::Client::new()
        .post(format!("{base}/api/cli/token"))
        .json(&serde_json::json!({ "code": code }))
        .send()
        .await?
        .error_for_status()?
        .json::<TokenResp>()
        .await?;

    save_token(&resp.token)?;
    ui::ok(&format!(
        "Logged in. Credentials saved to {}",
        crate::config_dir()?.join("credentials.json").display()
    ));
    Ok(())
}

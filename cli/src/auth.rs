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
    #[serde(default)]
    user: Option<TokenUser>,
}

#[derive(Deserialize)]
struct TokenUser {
    login: String,
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

    ui::heading("Login");

    // Fail fast if the web app is not reachable, rather than opening a link
    // into the void. Any HTTP response means it is up; only a transport error
    // (connection refused, DNS failure, timeout) means it is not.
    if reqwest::Client::new()
        .get(&base)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .is_err()
    {
        bail!(
            "the shiplog web app isn't reachable at {base} — start it with `npm run dev` in web/ (or set SHIPLOG_WEB to your deployed URL)"
        );
    }

    let url = format!("{base}/cli/login?port={port}&state={state}");

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
                    r#"<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Logged in — shiplog</title>
  <style>
    :root {
      color-scheme: light dark;
      /* Page */
      --paper: #eceee8;
      --paper-2: #e2e6dd;
      --card: #f7f8f4;
      --ink: #0d2133;
      --ink-2: #3a4d5d;
      --ink-3: #566873;
      --rule: #c3cbc2;
      --rule-strong: #9aa8a2;
      /* Accents */
      --yellow: #f5c518;
      --navy: #0d2133;
      --sea: #1b7461;
      --logo-bg: #0d2133;
      /* Terminals */
      --deck: #0c1b2a;
      --deck-2: #112638;
      --deck-3: #081624;
      --deck-fg: #e6edf2;
      --deck-dim: #8fa3b3;
      --deck-rule: #263d52;
      --deck-ok: #5cd6b0;
      --deck-edge: #0d2133;
      --focus: var(--ink);
      --font-body: system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --paper: #0a1622;
        --paper-2: #07111b;
        --card: #0f2030;
        --ink: #e8eef2;
        --ink-2: #aabbc8;
        --ink-3: #8499a8;
        --rule: #1f3549;
        --rule-strong: #34506a;
        --sea: #5cd6b0;
        --logo-bg: #1b3b57;
        --deck: #0c1b2a;
        --deck-edge: #2a4259;
      }
    }
    *,
    *::before,
    *::after { box-sizing: border-box; }
    * { margin: 0; padding: 0; }
    html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    body {
      min-height: 100dvh;
      background: var(--paper);
      color: var(--ink);
      font-family: var(--font-body);
      font-size: 1rem;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: var(--card);
      border: 1.5px solid var(--ink);
      border-radius: 4px;
      padding: 3rem 2rem;
      text-align: center;
      max-width: 360px;
      width: 100%;
      box-shadow: 4px 4px 0 var(--yellow);
    }
    .check {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: var(--sea);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem;
      color: var(--paper);
      font-size: 28px;
      font-weight: 700;
    }
    h1 {
      font-weight: 800;
      font-size: 1.5rem;
      line-height: 1.2;
      letter-spacing: -0.01em;
      margin-bottom: 0.75rem;
    }
    p {
      color: var(--ink-2);
      font-size: 1rem;
      line-height: 1.6;
    }
    .brand {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--rule);
      font-size: 0.875rem;
      color: var(--ink-3);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    @media (prefers-reduced-motion: reduce) {
      .check { animation: none; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">✓</div>
    <h1>Logged in successfully</h1>
    <p>You can close this tab and return to the CLI.</p>
    <div class="brand">shiplog</div>
  </div>
</body>
</html>"#,
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
    let who = resp
        .user
        .map(|u| format!(" as {}", u.login))
        .unwrap_or_default();
    ui::ok(&format!(
        "Logged in{who}. Credentials saved to {}",
        crate::config_dir()?.join("credentials.json").display()
    ));
    Ok(())
}

/// Revokes this machine's session on the server, then removes the local token.
pub async fn logout() -> Result<()> {
    let path = crate::config_dir()?.join("credentials.json");
    let stored = fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Credentials>(&raw).ok());

    let Some(credentials) = stored else {
        ui::warn("Not logged in — nothing to revoke.");
        return Ok(());
    };

    let base = web_base();
    match reqwest::Client::new()
        .delete(format!("{base}/api/session"))
        .bearer_auth(&credentials.token)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            ui::ok("Session revoked on the server.");
        }
        // An unknown token is already as good as revoked.
        Ok(resp) if resp.status() == reqwest::StatusCode::UNAUTHORIZED => {
            ui::info("The server did not recognise this session; removing it locally.");
        }
        Ok(resp) => bail!(
            "server could not revoke the session ({}): {}",
            resp.status(),
            resp.text().await.unwrap_or_default().trim()
        ),
        Err(e) => {
            // Do not keep a token we cannot revoke: remove it locally and say
            // plainly that the server copy may outlive it.
            fs::remove_file(&path).ok();
            ui::warn(&format!("Could not reach {base} to revoke the session: {e}"));
            ui::info("The local token was removed, but the server session stays valid until it expires.");
            return Ok(());
        }
    }

    fs::remove_file(&path)?;
    ui::ok("Logged out.");
    Ok(())
}

/// Connect a publishing platform (LinkedIn, X, or Farcaster) via the browser.
pub async fn connect(platform: Option<String>) -> Result<()> {
    let base = web_base();
    let token = load_token()?;

    // Determine which platform(s) to connect
    let platforms: Vec<&str> = match platform.as_deref() {
        Some("linkedin") => vec!["linkedin"],
        Some("x") => vec!["x"],
        Some("farcaster") => vec!["farcaster"],
        Some(other) => bail!("unknown platform: {other} (use 'linkedin', 'x', or 'farcaster')"),
        None => select_platforms_interactive(&base, &token).await?,
    };

    for p in platforms {
        let connect_path = match p {
            "linkedin" => "/api/linkedin/connect",
            "x" => "/api/x/connect",
            "farcaster" => "/connect/farcaster", // Frontend page with SIWN button
            _ => unreachable!(),
        };
        let url = format!("{base}{connect_path}");

        ui::heading(&format!("Connect {p}"));
        ui::step("Opening your browser to authorize the connection");
        ui::info("If nothing opens, visit this URL:");
        ui::url(&url);
        ui::info("Complete the authorization, then return here.");
        let _ = open::that(&url);

        // Poll /api/connections until the platform shows as connected
        ui::info("Waiting for connection to complete...");
        let client = reqwest::Client::new();
        let mut connected = false;
        for _ in 0..60 {
            // Poll for up to 60 * 5s = 5 minutes
            tokio::time::sleep(Duration::from_secs(5)).await;
            let resp = client
                .get(format!("{base}/api/connections"))
                .bearer_auth(&token)
                .send()
                .await?;
            if resp.status().is_success() {
                let data: serde_json::Value = resp.json().await?;
                if data.get(p).and_then(|v| v.get("connected")).and_then(|v| v.as_bool()) == Some(true) {
                    connected = true;
                    break;
                }
            }
        }
        if connected {
            ui::ok(&format!("{p} connected successfully"));
        } else {
            ui::warn(&format!(
                "{p} connection not detected yet. Check the browser tab and run `shiplog connect {p}` again if needed."
            ));
        }
    }
    Ok(())
}

/// Show an interactive prompt to select which platforms to connect.
async fn select_platforms_interactive(base: &str, token: &str) -> Result<Vec<&'static str>> {
    use std::io::{self, Write};

    // First check current connection status
    let client = reqwest::Client::new();
    let status = match client
        .get(format!("{base}/api/connections"))
        .bearer_auth(token)
        .send()
        .await
    {
        Ok(resp) => match resp.text().await {
            Ok(body) => serde_json::from_str(&body).unwrap_or_else(|_| serde_json::json!({})),
            Err(_) => serde_json::json!({}),
        },
        Err(_) => serde_json::json!({}),
    };

    let li_connected = status.get("linkedin").and_then(|v| v.get("connected")).and_then(|v| v.as_bool()) == Some(true);
    let x_connected = status.get("x").and_then(|v| v.get("connected")).and_then(|v| v.as_bool()) == Some(true);
    let fc_connected = status.get("farcaster").and_then(|v| v.get("connected")).and_then(|v| v.as_bool()) == Some(true);

    println!();
    ui::heading("Connect publishing platforms");
    println!();
    println!("  1) LinkedIn  {}", if li_connected { "✓ connected" } else { "" });
    println!("  2) X (Twitter)  {}", if x_connected { "✓ connected" } else { "" });
    println!("  3) Farcaster  {}", if fc_connected { "✓ connected" } else { "" });
    println!("  4) All");
    println!("  5) Skip");
    println!();

    print!("Select [1-5]: ");
    io::stdout().flush()?;

    let mut input = String::new();
    io::stdin().read_line(&mut input)?;
    let choice = input.trim();

    match choice {
        "1" => Ok(vec!["linkedin"]),
        "2" => Ok(vec!["x"]),
        "3" => Ok(vec!["farcaster"]),
        "4" => Ok(vec!["linkedin", "x", "farcaster"]),
        _ => {
            ui::info("Skipped.");
            Ok(vec![])
        }
    }
}

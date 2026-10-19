use anyhow::{Context, Result, bail};
use rand::{Rng, distributions::Alphanumeric};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, io::Write, path::PathBuf, time::Duration};
use url::Url;

pub const WEB_BASE: &str = "http://localhost:3000";
#[derive(Serialize, Deserialize)]
struct Credentials {
    token: String,
}

#[derive(Deserialize)]
struct TokenResp {
    token: String,
}

fn creds_path() -> Result<PathBuf> {
    let dir = dirs::config_dir().context("no config dir")?.join("ship");
    fs::create_dir_all(&dir)?;
    Ok(dir.join("credentials.json"))
}

fn save_token(token: &str) -> Result<()> {
    let path = creds_path()?;
    let mut opts = fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600); // owner-only, set at creation
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
    let raw = fs::read_to_string(creds_path()?).context("not logged in, run `ship login` first")?;
    Ok(serde_json::from_str::<Credentials>(&raw)?.token)
}

pub async fn login() -> Result<()> {
    let state: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();

    // Listen on a random free port, loopback only
    let server = tiny_http::Server::http("127.0.0.1:0").map_err(|e| anyhow::anyhow!(e))?;
    let port = server.server_addr().to_ip().context("no port")?.port();

    let url = format!("{WEB_BASE}/cli/login?port={port}&state={state}");
    println!("Opening your browser to log in...\nIf it doesn't open, visit:\n  {url}");
    let _ = open::that(&url);

    let expected = state.clone();
    let code = tokio::task::spawn_blocking(move || -> Result<String> {
        loop {
            let req = server
                .recv_timeout(Duration::from_secs(180))?
                .context("timed out waiting for browser login")?;
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
                bail!("state mismatch, login aborted");
            }
            let code = q.get("code").cloned().context("missing code")?;
            let html =
                tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap();
            let _ = req.respond(
                tiny_http::Response::from_string("<h1>Logged in. You can close this tab.</h1>")
                    .with_header(html),
            );
            return Ok(code);
        }
    })
    .await??;

    // Exchange the one-time code for a session token
    let resp = reqwest::Client::new()
        .post(format!("{WEB_BASE}/api/cli/token"))
        .json(&serde_json::json!({ "code": code }))
        .send()
        .await?
        .error_for_status()?
        .json::<TokenResp>()
        .await?;

    save_token(&resp.token)?;
    println!("Logged in.");
    Ok(())
}

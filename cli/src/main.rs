mod auth;
mod ship;
mod ui;
mod voice;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use std::{fs, path::PathBuf, process::ExitCode};

#[derive(Parser)]
#[command(
    name = "shiplog",
    version,
    about = "Turn your commits into posts",
    disable_help_subcommand = true
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Connect your account through the browser
    Login,
    /// Draft and post an update from your recent commits
    #[command(name = "post")]
    Ship {
        /// Optional note to guide the draft
        message: Option<String>,
        /// Where to publish: linkedin, x or all (comma-separated). Omit to pick
        /// interactively, or to post to the only connected account.
        #[arg(long, value_name = "TARGETS")]
        to: Option<String>,
    },
    /// Save sample posts so drafts sound like you
    Voice,
}

/// Returns (and creates if necessary) the shared ~/.config/shiplog directory.
/// Shared between auth, voice, and any future module that needs persistent
/// per-user storage.
pub fn config_dir() -> Result<PathBuf> {
    let dir = dirs::config_dir()
        .context("could not find a config directory on this system")?
        .join("shiplog");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

async fn dispatch(cli: Cli) -> Result<()> {
    match cli.command {
        Commands::Login => auth::login().await,
        Commands::Ship { message, to } => ship::run(message, to).await,
        Commands::Voice => voice::run(),
    }
}

#[tokio::main]
async fn main() -> ExitCode {
    ui::init();
    if ui::interactive() {
        ui::banner();
    }

    match dispatch(Cli::parse()).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            ui::blank();
            ui::err_hint(&format!("{err}"));
            // The chain is useful when debugging, but the first line is
            // usually the whole story; keep the default output to one line.
            if std::env::var_os("SHIPLOG_DEBUG").is_some() {
                for cause in err.chain().skip(1) {
                    ui::info(&format!("caused by: {cause}"));
                }
            }
            ExitCode::FAILURE
        }
    }
}

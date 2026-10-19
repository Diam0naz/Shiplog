mod auth;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "ship", about = "Turn your commits into posts")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Connect your account through the browser
    Login,
    /// Draft and post an update from your recent commits
    Ship {
        /// Optional note to guide the draft
        message: Option<String>,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Login => auth::login().await?,
        Commands::Ship { message } => println!("ship: not implemented yet ({:?})", message),
    }
    Ok(())
}

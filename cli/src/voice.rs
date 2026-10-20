use anyhow::Result;
use std::fs;

use crate::ui;

fn voice_path() -> anyhow::Result<std::path::PathBuf> {
    Ok(crate::config_dir()?.join("voice.txt"))
}

fn push(out: &mut Vec<String>, cur: &mut Vec<&str>) {
    let s = cur.join("\n").trim().to_string();
    if !s.is_empty() {
        out.push(s);
    }
    cur.clear();
}

fn parse(raw: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur: Vec<&str> = Vec::new();
    for line in raw.lines() {
        if line.trim() == "---" {
            push(&mut out, &mut cur);
        } else {
            cur.push(line);
        }
    }
    push(&mut out, &mut cur);
    out
}

pub fn load() -> Vec<String> {
    let Ok(path) = voice_path() else {
        return vec![];
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return vec![];
    };
    parse(&raw)
}

pub fn run() -> Result<()> {
    let samples = load();
    let existing = samples.join("\n---\n");

    ui::heading("Voice samples");
    if samples.is_empty() {
        ui::step("Paste 3–5 of your own past posts");
    } else {
        ui::step(&format!("Editing {} saved sample(s)", samples.len()));
    }
    ui::info("Separate each post with a line containing only ---");
    ui::info("Press e to open your editor, then save and close it.");

    let edited = inquire::Editor::new("Voice samples")
        .with_predefined_text(&existing)
        .with_render_config(ui::render_config())
        .prompt()?;

    let samples = parse(&edited);
    let path = voice_path()?;
    fs::write(&path, samples.join("\n---\n"))?;

    ui::blank();
    if samples.is_empty() {
        ui::warn("No samples saved — drafts won't use your voice yet.");
        ui::url(&path.display().to_string());
    } else {
        ui::ok(&format!("Saved {} sample(s)", samples.len()));
        ui::url(&path.display().to_string());
    }
    Ok(())
}

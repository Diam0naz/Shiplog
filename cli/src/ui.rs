//! ui — the shiplog terminal design system.
//!
//! Every line the CLI prints goes through one of these functions, so the look
//! of the tool is defined in exactly one file.
//!
//! Palette (mirrors the web landing page):
//!   accent      bright yellow   the `▪` mark, prompts, `›` bullets
//!   primary     bright white    body text
//!   muted       bright black    rules, labels, hints (renders grey)
//!   success     bright green    ✓
//!   warning     bright yellow   ⚠
//!   error       bright red      ✗
//!   commit hash cyan            the short SHA column
//!
//! Rules of the house:
//!   * one glyph per status, never emoji — emoji width and encoding vary
//!     between terminals and break alignment,
//!   * every width is derived from `term_width()`, never hardcoded to 80,
//!   * every truncation is char-based, never byte-based (`&s[..n]` panics on
//!     a multi-byte boundary).

use owo_colors::OwoColorize;
use std::io::IsTerminal;
use terminal_size::{Width, terminal_size};

/// Width used when the terminal size cannot be determined (piped output).
const FALLBACK_WIDTH: usize = 80;
/// Keep prose readable on very wide terminals.
const MAX_WIDTH: usize = 100;
/// Below this, boxed layouts stop being useful.
const MIN_WIDTH: usize = 40;

// ─── setup ──────────────────────────────────────────────────────────────────

/// True when stdout is a terminal and the user has not asked for plain text.
pub fn interactive() -> bool {
    let no_color = std::env::var_os("NO_COLOR").is_some_and(|v| !v.is_empty());
    std::io::stdout().is_terminal() && !no_color
}

/// Call once at startup. Disables colour when output is piped or redirected,
/// so `shiplog post | tee log` stays free of ANSI escapes.
pub fn init() {
    if !interactive() {
        owo_colors::set_override(false);
    }
}

// ─── helpers ────────────────────────────────────────────────────────────────

/// Current terminal width, clamped to a sane range.
pub fn term_width() -> usize {
    terminal_size()
        .map(|(Width(w), _)| w as usize)
        .unwrap_or(FALLBACK_WIDTH)
        .clamp(MIN_WIDTH, MAX_WIDTH)
}

/// Truncates to `max` characters, adding an ellipsis. Char-safe: a subject
/// with an emoji or CJK text can never panic here.
pub fn truncate(s: &str, max: usize) -> String {
    if max == 0 {
        return String::new();
    }
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max - 1).collect();
    out.push('…');
    out
}

/// A dim horizontal rule `w` columns wide.
fn rule(w: usize) -> String {
    "─".repeat(w).bright_black().to_string()
}

// ─── banner ─────────────────────────────────────────────────────────────────

/// The wordmark, printed once at startup (interactive sessions only).
///
/// ```text
/// ┌────────────────────────────────────────┐
/// │  ▎ shiplog                             │
/// │    turn your commits into posts        │
/// └────────────────────────────────────────┘
/// ```
pub fn banner() {
    let w = term_width();
    let inner = w - 2;

    println!("{}", format!("┌{}┐", "─".repeat(inner)).bright_black());

    // "  ▎ shiplog"
    let name_plain = "  ▎ shiplog";
    println!(
        "{}{}{}{}{}",
        "│".bright_black(),
        "  ▎ ".bright_yellow(),
        "shiplog".bright_yellow().bold(),
        " ".repeat(inner.saturating_sub(name_plain.chars().count())),
        "│".bright_black()
    );

    // "    turn your commits into posts"
    let tagline = "turn your commits into posts";
    println!(
        "{}    {}{}{}",
        "│".bright_black(),
        tagline.bright_black(),
        " ".repeat(
            inner.saturating_sub(tagline.chars().count() + 4)
        ),
        "│".bright_black()
    );

    println!("{}", format!("└{}┘", "─".repeat(inner)).bright_black());
}

// ─── section header ─────────────────────────────────────────────────────────

/// A titled rule drawn on one line: `  ── Draft ──────────────────`
pub fn heading(title: &str) {
    println!();
    let prefix = "── ";
    let used = 2 + prefix.chars().count() + title.chars().count() + 1;
    println!(
        "  {}{} {}",
        prefix.bright_yellow(),
        title.bright_white().bold(),
        rule(term_width().saturating_sub(used))
    );
}

// ─── status lines ───────────────────────────────────────────────────────────

/// An in-progress step: `  › Opening your browser`
pub fn step(msg: &str) {
    println!("  {}  {}", "›".bright_yellow().bold(), msg.bright_white());
}

/// A completed step: `  ✓ Logged in`
pub fn ok(msg: &str) {
    println!("  {}  {}", "✓".bright_green().bold(), msg.bright_white());
}

/// A warning: `  ⚠ Nothing new`
pub fn warn(msg: &str) {
    println!("  {}  {}", "⚠".bright_yellow(), msg.bright_white());
}

/// A failure hint: `  ✗ Not logged in`
pub fn err_hint(msg: &str) {
    println!("  {}  {}", "✗".bright_red().bold(), msg.bright_white());
}

/// Dim supporting text, aligned under a status glyph: `     message`
pub fn info(msg: &str) {
    println!("     {}", msg.bright_black());
}

/// A link: `     → https://…`
pub fn url(u: &str) {
    println!("     {}  {}", "→".bright_yellow(), u.cyan().underline());
}

/// A blank line.
pub fn blank() {
    println!();
}

// ─── commit table ───────────────────────────────────────────────────────────

/// Header for the commit table, with a count on the right.
///
/// ```text
///   commit   message                      6 new
///   ──────────────────────────────────────────
/// ```
pub fn commit_table_header(count: usize) {
    let w = term_width();
    let left = "  commit   message";
    let right = format!("{count} new");
    let gap = w.saturating_sub(left.chars().count() + right.chars().count());
    println!(
        "{}{}{}",
        left.bright_black(),
        " ".repeat(gap),
        right.bright_yellow().bold()
    );
    println!("  {}", rule(w.saturating_sub(2)));
}

/// One row of the commit table.
///
/// ```text
///   a3f9c21  feat(auth): browser login with one-time code
/// ```
pub fn commit_row(hash: &str, subject: &str) {
    // 2 indent + 7 hash + 2 gap
    let max_subj = term_width().saturating_sub(11);
    println!(
        "  {}  {}",
        format!("{:>7}", hash).cyan(),
        truncate(subject, max_subj).bright_white()
    );
}

// ─── draft card ─────────────────────────────────────────────────────────────

/// Renders a draft in a bordered card with a live character budget.
///
/// ```text
/// ┌─ Draft ──────────────────────── 133 / 280 ─┐
/// │                                            │
/// │  Voice samples are in. shiplog now learns  │
/// │  your tone from a few of your past posts.  │
/// │                                            │
/// └────────────────────────────────────────────┘
/// ```
pub fn draft_card(text: &str) {
    let w = term_width();
    let count = text.chars().count();
    let limit = 280usize;

    let count_text = format!("{count} / {limit}");
    let count_coloured = if count > limit {
        count_text.bright_red().bold().to_string()
    } else if count > limit * 8 / 10 {
        count_text.bright_yellow().bold().to_string()
    } else {
        count_text.bright_green().bold().to_string()
    };

    // ┌─ Draft ... 133 / 280 ─┐  — plain lengths drive the dash count so the
    // right border always lands on column `w`.
    let lead = "┌─ ";
    let title = "Draft";
    let tail_plain = 1 + count_text.chars().count() + 3; // " " + count + " ─┐"
    let dashes = w
        .saturating_sub(lead.chars().count() + title.chars().count() + 1 + tail_plain);

    println!(
        "{}{} {} {} ─┐",
        lead.bright_black(),
        title.bright_white().bold(),
        rule(dashes),
        count_coloured
    );

    let inner = w.saturating_sub(6); // borders + 2 spaces of padding each side
    let empty_row = format!(
        "{}{}{}",
        "│".bright_black(),
        " ".repeat(w - 2),
        "│".bright_black()
    );

    println!("{empty_row}");
    for line in wrap_text(text, inner) {
        let pad = inner.saturating_sub(line.chars().count());
        println!(
            "{}  {}{}  {}",
            "│".bright_black(),
            line.bright_white(),
            " ".repeat(pad),
            "│".bright_black()
        );
    }
    println!("{empty_row}");
    println!("{}", format!("└{}┘", "─".repeat(w - 2)).bright_black());
}

/// Word wrap to `width` chars, hard-breaking words that are longer than the
/// line (URLs, unbroken tokens) so the card border can never be pushed out.
fn wrap_text(text: &str, width: usize) -> Vec<String> {
    let width = width.max(1);
    let mut lines = Vec::new();

    for paragraph in text.split('\n') {
        if paragraph.trim().is_empty() {
            lines.push(String::new());
            continue;
        }
        let mut current = String::new();
        for word in paragraph.split_whitespace() {
            let fits = !current.is_empty()
                && current.chars().count() + 1 + word.chars().count() <= width;
            if fits {
                current.push(' ');
                current.push_str(word);
                continue;
            }
            if !current.is_empty() {
                lines.push(std::mem::take(&mut current));
            }
            // A single word longer than the card is split across lines.
            let mut rest = word.chars().peekable();
            while rest.clone().count() > width {
                let chunk: String = rest.by_ref().take(width).collect();
                lines.push(chunk);
            }
            current = rest.collect();
        }
        if !current.is_empty() {
            lines.push(current);
        }
    }

    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

// ─── prompt theme ───────────────────────────────────────────────────────────

/// Render configuration for `inquire` prompts, matching the palette above.
pub fn render_config() -> inquire::ui::RenderConfig<'static> {
    use inquire::ui::{Color, RenderConfig, StyleSheet, Styled};

    let accent = Color::LightYellow;
    let mut cfg = RenderConfig::default_colored()
        .with_prompt_prefix(Styled::new("›").with_fg(accent))
        .with_answered_prompt_prefix(Styled::new("✓").with_fg(Color::LightGreen))
        .with_highlighted_option_prefix(Styled::new("›").with_fg(accent))
        .with_help_message(StyleSheet::new().with_fg(Color::DarkGrey));
    // No builder for this one in inquire 0.9 — set the field directly.
    cfg.unhighlighted_option_prefix = Styled::new(" ").with_fg(Color::DarkGrey);
    cfg
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_is_char_safe_and_counts_chars() {
        assert_eq!(truncate("hello", 10), "hello");
        assert_eq!(truncate("héllo wörld", 5), "héll…");
        // Multi-byte boundary: byte slicing here would panic.
        assert_eq!(truncate("日本語のコミット", 4), "日本語…");
    }

    #[test]
    fn wrap_respects_width_and_breaks_long_words() {
        for line in wrap_text("aaaa bbbb cccc", 9) {
            assert!(line.chars().count() <= 9, "{line:?} too long");
        }
        let long = "https://example.com/a/very/long/path/that/never/breaks";
        for line in wrap_text(long, 10) {
            assert!(line.chars().count() <= 10, "{line:?} too long");
        }
    }

    #[test]
    fn wrap_keeps_blank_lines() {
        assert_eq!(wrap_text("a\n\nb", 10), vec!["a", "", "b"]);
    }
}

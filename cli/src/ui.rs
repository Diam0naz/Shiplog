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
use std::io::{IsTerminal, Write};
use std::time::Duration;
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

/// Block-letter glyphs for the wordmark, 5 rows tall. Every row of a given
/// letter is the same width, so joining row `r` of each letter always lines up.
const GLYPHS: [[&str; 5]; 7] = [
    ["████", "█   ", "███ ", "   █", "████"], // s
    ["█  █", "█  █", "████", "█  █", "█  █"], // h
    ["███", " █ ", " █ ", " █ ", "███"],      // i
    ["███ ", "█  █", "███ ", "█   ", "█   "], // p
    ["█   ", "█   ", "█   ", "█   ", "████"], // l
    ["████", "█  █", "█  █", "█  █", "████"], // o
    ["████", "█   ", "█ ██", "█  █", "████"], // g
];

const TAGLINE: &str = "turn your commits into posts";
const INDENT: &str = "   ";
/// Water ramp, low to high, for the animated wave under the wordmark.
const WAVE: [char; 7] = ['▁', '▂', '▃', '▄', '▅', '▆', '▇'];

/// Builds the five wordmark rows by joining each glyph's row with a space.
fn wordmark_rows() -> [String; 5] {
    std::array::from_fn(|r| {
        GLYPHS
            .iter()
            .map(|g| g[r])
            .collect::<Vec<_>>()
            .join(" ")
    })
}

/// 3-stop brand gradient (yellow → coral → sea), with `t` in `0..=1`.
fn gradient(t: f32) -> (u8, u8, u8) {
    let yellow = (245.0, 197.0, 24.0);
    let coral = (232.0, 93.0, 93.0);
    let sea = (27.0, 116.0, 97.0);
    let (a, b, u) = if t < 0.5 {
        (yellow, coral, t * 2.0)
    } else {
        (coral, sea, (t - 0.5) * 2.0)
    };
    let mix = |x: f32, y: f32| (x + (y - x) * u) as u8;
    (mix(a.0, b.0), mix(a.1, b.1), mix(a.2, b.2))
}

fn lerp(a: (u8, u8, u8), b: (u8, u8, u8), t: f32) -> (u8, u8, u8) {
    let t = t.clamp(0.0, 1.0);
    let m = |x: u8, y: u8| (x as f32 + (y as f32 - x as f32) * t) as u8;
    (m(a.0, b.0), m(a.1, b.1), m(a.2, b.2))
}

/// One coloured wordmark row. `sweep` is the position (in `0..=1` space, but
/// may sit off either edge) of a bright highlight band that slides across.
fn paint_row(row: &str, row_idx: usize, span: f32, sweep: f32) -> String {
    let mut out = String::new();
    for (col, ch) in row.chars().enumerate() {
        if ch == ' ' {
            out.push(' ');
            continue;
        }
        // Diagonal position so the gradient and sweep tilt across the mark.
        let p = (col as f32 + row_idx as f32 * 1.5) / span;
        let base = gradient(p.clamp(0.0, 1.0));
        let band = (1.0 - (p - sweep).abs() / 0.16).max(0.0);
        let (r, g, b) = lerp(base, (245, 245, 255), band * 0.85);
        out.push_str(&ch.truecolor(r, g, b).bold().to_string());
    }
    out
}

/// One animated water line beneath the wordmark.
fn paint_wave(width: usize, phase: f32) -> String {
    let mut out = String::new();
    for col in 0..width {
        let s = (col as f32 * 0.55 + phase).sin() * 0.5 + 0.5; // 0..1
        let ch = WAVE[(s * (WAVE.len() - 1) as f32).round() as usize];
        let (r, g, b) = lerp((56, 139, 220), (27, 116, 97), col as f32 / width as f32);
        out.push_str(&ch.truecolor(r, g, b).to_string());
    }
    out
}

/// Prints one frame of the wordmark + wave. `\x1b[K` clears any leftover tail.
fn draw_frame(rows: &[String; 5], span: f32, sweep: f32, wave_phase: f32) {
    let width = rows[0].chars().count();
    let mut buf = String::new();
    for (i, row) in rows.iter().enumerate() {
        buf.push_str(INDENT);
        buf.push_str(&paint_row(row, i, span, sweep));
        buf.push_str("\x1b[K\n");
    }
    buf.push_str(INDENT);
    buf.push_str(&paint_wave(width, wave_phase));
    buf.push_str("\x1b[K\n");
    print!("{buf}");
    let _ = std::io::stdout().flush();
}

/// The wordmark, printed once at startup (interactive sessions only). Animates
/// a gradient shimmer sweeping across `shiplog` over a moving water line, then
/// settles. Falls back to a compact static banner on narrow terminals, and
/// skips the animation entirely when `SHIPLOG_NO_ANIM` is set.
pub fn banner() {
    let rows = wordmark_rows();
    let art_w = rows[0].chars().count();
    let span = art_w as f32 + 6.0;

    // Not enough room for the block letters — keep the old one-box banner.
    if term_width() < art_w + INDENT.len() + 2 {
        simple_banner();
        return;
    }

    println!();
    if std::env::var_os("SHIPLOG_NO_ANIM").is_none() {
        const FRAMES: usize = 22;
        for f in 0..FRAMES {
            if f > 0 {
                print!("\x1b[6A"); // back up over the 5 wordmark rows + wave
            }
            let t = f as f32 / (FRAMES - 1) as f32;
            let sweep = -0.3 + 1.6 * t; // slide the highlight off both edges
            draw_frame(&rows, span, sweep, f as f32 * 0.5);
            std::thread::sleep(Duration::from_millis(38));
        }
        print!("\x1b[6A"); // settle: one last frame with the sweep gone
    }
    draw_frame(&rows, span, 2.0, FRAMES_SETTLE_PHASE);

    println!(
        "{}{}",
        INDENT,
        TAGLINE.truecolor(120, 139, 150).italic()
    );
    println!();
}

/// Wave phase used for the final, settled frame.
const FRAMES_SETTLE_PHASE: f32 = 11.0;

/// Compact fallback banner for narrow terminals or where the animation is a
/// poor fit. Mirrors the original one-box wordmark.
fn simple_banner() {
    let w = term_width();
    let inner = w - 2;

    println!("{}", format!("┌{}┐", "─".repeat(inner)).bright_black());

    let name_plain = "  ▎ shiplog";
    println!(
        "{}{}{}{}{}",
        "│".bright_black(),
        "  ▎ ".bright_yellow(),
        "shiplog".bright_yellow().bold(),
        " ".repeat(inner.saturating_sub(name_plain.chars().count())),
        "│".bright_black()
    );

    let tagline = "turn your commits into posts";
    println!(
        "{}    {}{}{}",
        "│".bright_black(),
        tagline.bright_black(),
        " ".repeat(inner.saturating_sub(tagline.chars().count() + 4)),
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

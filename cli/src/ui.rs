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

// Brand palette (truecolor), shared by every scene.
const YELLOW: (u8, u8, u8) = (245, 197, 24);
const WHITE: (u8, u8, u8) = (236, 239, 243);
const GREY: (u8, u8, u8) = (150, 160, 172);
const NAVY: (u8, u8, u8) = (66, 104, 170);
const SEA: (u8, u8, u8) = (30, 170, 150);
const BORDER: (u8, u8, u8) = (56, 118, 126);

/// Content rows inside the terminal panel (height of every scene).
const CH: usize = 5;

/// One cell of a scene grid: a glyph and its colour, or blank (`rgb: None`).
#[derive(Clone, Copy)]
struct Cell {
    ch: char,
    rgb: Option<(u8, u8, u8)>,
}
const BLANK: Cell = Cell { ch: ' ', rgb: None };
type Grid = Vec<Vec<Cell>>;

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

/// Vivid multi-stop spectrum (gold → coral → pink → periwinkle → teal), with
/// `t` in `0..=1`. Gold and teal anchor it to the brand; the stops between make
/// the wordmark read as clearly multicoloured rather than a flat wash.
fn gradient(t: f32) -> (u8, u8, u8) {
    const STOPS: [(u8, u8, u8); 5] = [
        (245, 197, 24),  // gold
        (247, 118, 62),  // coral/orange
        (233, 92, 158),  // pink
        (124, 124, 236), // periwinkle
        (36, 196, 164),  // teal
    ];
    let t = t.clamp(0.0, 1.0) * (STOPS.len() - 1) as f32;
    let i = (t.floor() as usize).min(STOPS.len() - 2);
    lerp(STOPS[i], STOPS[i + 1], t - i as f32)
}

fn lerp(a: (u8, u8, u8), b: (u8, u8, u8), t: f32) -> (u8, u8, u8) {
    let t = t.clamp(0.0, 1.0);
    let m = |x: u8, y: u8| (x as f32 + (y as f32 - x as f32) * t) as u8;
    (m(a.0, b.0), m(a.1, b.1), m(a.2, b.2))
}

fn blank_grid(w: usize) -> Grid {
    vec![vec![BLANK; w]; CH]
}

fn put(g: &mut Grid, r: usize, c: usize, ch: char, rgb: (u8, u8, u8)) {
    if r < g.len() && c < g[r].len() {
        g[r][c] = Cell { ch, rgb: Some(rgb) };
    }
}

/// Scene 1 — the wordmark. `sweep` is a bright highlight band (in diagonal
/// `0..=1` space) that slides across; set it off-screen to settle the gradient.
fn word_grid(w: usize, sweep: f32) -> Grid {
    let mut g = blank_grid(w);
    let rows = wordmark_rows();
    let aw = rows[0].chars().count();
    let off = w.saturating_sub(aw) / 2;
    let span = aw as f32 + 6.0;
    for (r, row) in rows.iter().enumerate() {
        for (i, ch) in row.chars().enumerate() {
            if ch == ' ' {
                continue;
            }
            let p = (i as f32 + r as f32 * 1.5) / span;
            let base = gradient(p.clamp(0.0, 1.0));
            let band = (1.0 - (p - sweep).abs() / 0.16).max(0.0);
            put(&mut g, r, off + i, '█', lerp(base, (255, 255, 255), band * 0.9));
        }
    }
    g
}

/// Scene 2 — the stacked-bars logo mark inside a rounded tile.
fn logo_grid(w: usize) -> Grid {
    let mut g = blank_grid(w);
    const ART: [&str; 5] = [
        "╭────────╮",
        "│ █████  │",
        "│ ███    │",
        "│ ██████ │",
        "╰────────╯",
    ];
    let bars = [YELLOW, WHITE, GREY]; // rows 1,2,3
    let off = w.saturating_sub(10) / 2;
    for (r, line) in ART.iter().enumerate() {
        for (i, ch) in line.chars().enumerate() {
            match ch {
                ' ' => {}
                '█' => put(&mut g, r, off + i, ch, bars[r - 1]),
                _ => put(&mut g, r, off + i, ch, BORDER),
            }
        }
    }
    g
}

/// Scene 3 — a little sailboat on a shimmering waterline. `phase` drives the
/// water.
fn ship_grid(w: usize, phase: f32) -> Grid {
    let mut g = blank_grid(w);
    const SAIL: [&str; 4] = ["   ▟▌", "  ▟█▌", " ▟██▌", "╲███╱"];
    let fw = 7; // waterline is two columns wider than the 5-wide boat
    let off = w.saturating_sub(fw) / 2;
    for (r, line) in SAIL.iter().enumerate() {
        for (i, ch) in line.chars().enumerate() {
            if ch == ' ' {
                continue;
            }
            let rgb = if r == 3 {
                NAVY // hull
            } else if ch == '▌' {
                GREY // mast
            } else {
                lerp(YELLOW, (247, 118, 62), r as f32 / 3.0) // sail: gold → coral
            };
            put(&mut g, r, off + 1 + i, ch, rgb);
        }
    }
    for c in 0..fw {
        let t = (c as f32 * 0.7 + phase).sin() * 0.5 + 0.5;
        put(&mut g, 4, off + c, '~', lerp(SEA, (120, 230, 245), t));
    }
    g
}

/// A sweep-wipe between two scenes: `b` grows in from the left behind a bright
/// vertical seam, revealing it over `a` as `p` goes `0..=1`.
fn wipe(a: &Grid, b: &Grid, p: f32) -> Grid {
    let w = a[0].len();
    let edge = (p * (w as f32 + 2.0)) as isize - 1;
    let mut g = blank_grid(w);
    for r in 0..CH {
        for c in 0..w {
            let ci = c as isize;
            g[r][c] = if ci < edge {
                b[r][c]
            } else if ci == edge {
                Cell { ch: '▌', rgb: Some((250, 250, 255)) }
            } else {
                a[r][c]
            };
        }
    }
    g
}

/// Renders a scene inside the terminal-window chrome (traffic lights + title),
/// as a fixed block of `CH + 4` lines. `\x1b[K` clears any leftover tail so a
/// redraw never leaves stray glyphs.
fn draw_panel(g: &Grid, w: usize) {
    let bc = |s: &str| s.truecolor(BORDER.0, BORDER.1, BORDER.2).to_string();
    let bar = "─".repeat(w);
    let mut out = String::new();

    out.push_str(&format!("{}{}{}\x1b[K\n", bc("╭"), bc(&bar), bc("╮")));

    // Title bar: ● ● ●  …  shiplog
    let dots = format!(
        "{} {} {}",
        "●".truecolor(237, 106, 94),
        "●".truecolor(245, 197, 24),
        "●".truecolor(92, 214, 176),
    );
    let gap = w.saturating_sub(14); // 1 + 5 dots + gap + 7 title + 1
    out.push_str(&format!(
        "{} {}{}{} {}\x1b[K\n",
        bc("│"),
        dots,
        " ".repeat(gap),
        "shiplog".truecolor(245, 197, 24).bold(),
        bc("│"),
    ));
    out.push_str(&format!("{}{}{}\x1b[K\n", bc("├"), bc(&bar), bc("┤")));

    for row in g {
        let mut line = String::new();
        for cell in row {
            match cell.rgb {
                Some((r, gg, b)) => {
                    line.push_str(&cell.ch.truecolor(r, gg, b).to_string())
                }
                None => line.push(' '),
            }
        }
        out.push_str(&format!("{}{}{}\x1b[K\n", bc("│"), line, bc("│")));
    }

    out.push_str(&format!("{}{}{}\x1b[K\n", bc("╰"), bc(&bar), bc("╯")));
    print!("{out}");
    let _ = std::io::stdout().flush();
}

/// Total lines a panel occupies (top + title + rule + content + bottom).
const PANEL_H: usize = CH + 4;

/// The startup intro (interactive sessions only). Inside a terminal-window
/// frame, it phase-shifts through three scenes — the logo mark, the `shiplog`
/// wordmark, and a little ship — each joined by a bright sweep-wipe, then
/// settles on the wordmark with a gradient shimmer. Falls back to a compact
/// static banner on narrow terminals, and draws a single static frame when
/// `SHIPLOG_NO_ANIM` is set.
pub fn banner() {
    // Panel width: as wide as the terminal allows, capped, with room for the
    // wordmark; below that, keep the old one-box banner.
    let w = term_width().saturating_sub(2).min(46);
    if w < 35 {
        simple_banner();
        return;
    }

    let word = word_grid(w, 99.0); // settled (no sweep band)

    if std::env::var_os("SHIPLOG_NO_ANIM").is_some() {
        println!();
        draw_panel(&word, w);
        tagline(w);
        return;
    }

    let logo = logo_grid(w);
    let ship = ship_grid(w, 7.0);

    println!();
    let mut first = true;
    let mut emit = |g: &Grid| {
        if !first {
            print!("\x1b[{PANEL_H}A"); // back up over the whole panel
        }
        first = false;
        draw_panel(g, w);
        std::thread::sleep(Duration::from_millis(26));
    };

    // 1. hold the logo
    for _ in 0..6 {
        emit(&logo);
    }
    // 2. logo → wordmark
    for f in 1..=7 {
        emit(&wipe(&logo, &word, f as f32 / 7.0));
    }
    // 3. wordmark, with the gradient shimmer sweeping across
    for f in 0..12 {
        emit(&word_grid(w, -0.3 + 1.6 * (f as f32 / 11.0)));
    }
    // 4. wordmark → ship
    for f in 1..=7 {
        emit(&wipe(&word, &ship, f as f32 / 7.0));
    }
    // 5. the ship sails on moving water
    for f in 0..12 {
        emit(&ship_grid(w, f as f32 * 0.5));
    }
    // 6. ship → wordmark, and settle
    for f in 1..=7 {
        emit(&wipe(&ship, &word, f as f32 / 7.0));
    }
    emit(&word);

    tagline(w);
}

/// Centred tagline printed just below the panel.
fn tagline(w: usize) {
    let pad = (w + 2).saturating_sub(TAGLINE.chars().count()) / 2;
    println!(
        "{}{}",
        " ".repeat(pad),
        TAGLINE.truecolor(90, 200, 175).italic()
    );
    println!();
}

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

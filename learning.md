# shiplog — engineering decisions & lessons

A running log of non-obvious choices made during development.
Add a new entry whenever a decision has a reason worth remembering.

---

## 2026-10-20 — CLI optimisation pass

### 1. Trim `tokio` features

**Before:** `tokio = { features = ["full"] }`  
**After:** `tokio = { features = ["rt-multi-thread", "macros"] }`

`"full"` unconditionally compiles tokio's filesystem layer, signal handling,
process spawning, I/O utilities, time, and the full sync primitives suite.
shiplog only needs a multi-threaded executor (`rt-multi-thread`) so that
`spawn_blocking` can run `tiny_http` without stalling the async runtime, and
the `#[tokio::main]` macro (`macros`). Trimming the feature set cuts compile
time and removes dead object code from the binary.

---

### 2. Release profile — strip + LTO + size optimisation

```toml
[profile.release]
strip = true
lto = "thin"
opt-level = "z"
codegen-units = 1
```

| Setting | Effect |
|---|---|
| `strip = true` | Removes DWARF debug symbols from the final binary. |
| `lto = "thin"` | Cross-crate dead-code elimination without the full compile-time cost of fat LTO. |
| `opt-level = "z"` | Optimises for size. A CLI that starts and exits is more sensitive to binary size than throughput. |
| `codegen-units = 1` | Forces the compiler to see the whole crate graph at once, enabling more inlining across modules. |

**Result:** debug binary was 94 MB. Release binary is 5.7 MB.

---

### 3. Shared `config_dir()` helper

**Problem:** `auth.rs` and `voice.rs` both contained identical three-line
blocks that computed `~/.config/shiplog/` and called `create_dir_all`.
Copy-pasted logic means two places to update when the path ever changes, and
two places that can diverge silently.

**Fix:** `pub fn config_dir() -> Result<PathBuf>` added to `main.rs` (the
crate root), called as `crate::config_dir()` from every module that needs
persistent storage. The creation logic lives in exactly one place.

---

### 4. Env-configurable `WEB_BASE`

**Before:** `pub const WEB_BASE: &str = "http://localhost:3000";`  
**After:** `pub fn web_base() -> String` reads `SHIPLOG_WEB` from the
environment, defaulting to `http://localhost:3000`.

A hardcoded URL means the binary can only ever talk to one endpoint. The env
var costs nothing at runtime and means you can aim the CLI at a staging server
or self-hosted instance without recompiling:

```sh
SHIPLOG_WEB=https://staging.shiplog.dev shiplog post
```

---

### 5. Atomic marker file write

**Before:**
```rust
std::fs::write(&marker, oid.to_string())?;
```

**After:**
```rust
let tmp = marker.with_extension("tmp");
std::fs::write(&tmp, oid.to_string())?;
std::fs::rename(&tmp, &marker)?;
```

`fs::write` is not atomic — it opens, truncates, then writes. If the process
dies between truncation and the final write, the marker file is left empty or
corrupt. On the next run, `Oid::from_str("")` returns `Err`, `since` becomes
`None`, and every commit in the repo is re-drafted and potentially re-posted.

`rename` on the same filesystem is atomic at the OS level (a single directory
entry update). The old file is intact until the new one is fully written and
fsynced by the OS, so there is no window where the marker is unreadable.

---

### 6. `tiny_http::recv_timeout` returns `Ok(None)` on timeout

**Before:**
```rust
let req = server
    .recv_timeout(Duration::from_secs(180))?
    .context("timed out waiting for browser login")?;
```

**Problem:** `recv_timeout` returns `Result<Option<Request>>`. `Ok(None)` means
the timeout elapsed with no request; `Ok(Some(req))` means a request arrived;
`Err` means an I/O failure. The old code called `.context(…)` on the `Option`
result of `?`, which means a genuine timeout (the common case) would surface
as the misleading "timed out" context on what was actually a successful
`Result::Ok`. The real error path (`Err`) would surface with *no* helpful
context.

**After:**
```rust
let req = match server.recv_timeout(timeout)? {
    Some(r) => r,
    None => bail!("timed out after 3 minutes — try `shiplog login` again"),
};
```

Timeout and I/O error are now handled separately with accurate messages.

---

### 7. Fragile emoji-match on `inquire::Select` choices

**Before:**
```rust
let choice = inquire::Select::new("…", vec![
    format!("{} Post", "🚀"),
    format!("{} Edit", "✏️"),
    format!("{} Skip", "⏭️"),
]).prompt()?;

match choice.as_str() {
    "🚀 Post" => { … }
    "✏️ Edit" => { … }
    _ => { … }
}
```

**Problem:** The match is against the string that `inquire` returns, which is
the same string that was passed in. But emoji rendering is locale- and
terminal-dependent. Some terminals display `✏️` as a single code point, others
as two (base + variation selector). If the returned string doesn't byte-match
the literal in the `match` arm, the arm silently falls through to `_` (Skip),
meaning "Post" or "Edit" become a silent no-op skip.

**After:**
```rust
const OPT_POST: &str = "Post";
const OPT_EDIT: &str = "Edit";
const OPT_SKIP: &str = "Skip";

inquire::Select::new("What now?", vec![OPT_POST, OPT_EDIT, OPT_SKIP]).prompt()?;

match choice {
    OPT_POST => { … }
    OPT_EDIT => { … }
    _ => { … }   // OPT_SKIP
}
```

Plain ASCII labels. The same `const` is the option label and the match arm, so
they are guaranteed to be identical at compile time.

---

### 8. `git2` `summary()` / `body()` return `Result<Option<&str>>`

**Incorrect assumption:**
```rust
// Assumed body() returned Option<&str>
body: c.body().unwrap_or("").chars().take(300).collect(),
```

**Reality:** both `Commit::summary()` and `Commit::body()` in git2 return
`Result<Option<&str>, Error>` (the `Result` layer covers encoding failures on
non-UTF-8 commit messages). The correct pattern is:

```rust
subject: c.summary().ok().flatten().unwrap_or("").to_string(),
body:    c.body().ok().flatten().unwrap_or("").chars().take(300).collect(),
```

`.ok()` drops the `Result` (treating an encoding error as missing data, which
is reasonable for a social post draft), and `.flatten()` collapses
`Option<Option<&str>>` to `Option<&str>`.

---

## 2026-10-20 — TUI design system (`ui.rs`)

### 9. Terminal output moved into a single `ui` module

**Before:** every module printed its own strings with ad-hoc `owo-colors`
calls — `println!("{} {}", "✅", "Saved".bright_green())` in `voice.rs`,
`"━".repeat(50)` in `ship.rs`, a rainbow of emoji prefixes in `auth.rs`. No
shared indentation, no shared glyph vocabulary, and a colour change meant
touching every file.

**After:** `cli/src/ui.rs` owns *all* stdout. Modules call semantic functions
and never call `println!` themselves.

| Function | Output |
|---|---|
| `banner()` | Boxed wordmark, printed once at startup |
| `heading(title)` | `  ── Recent commits ──────────────────` |
| `step(msg)` | `  ›  Drafting an update…` (in progress) |
| `ok(msg)` | `  ✓  Posted to LinkedIn.` |
| `warn(msg)` | `  ⚠  Nothing new since your last ship.` |
| `err_hint(msg)` | `  ✗  <error>`, one line, no `Debug` dump |
| `info(msg)` | dim, indented supporting line |
| `url(u)` | `     →  https://…` (cyan, underlined) |
| `commit_table_header(n)` | `  commit   message            6 new` + rule |
| `commit_row(hash, subject)` | `  584265a  chore: bump deps` |
| `draft_card(text)` | Bordered card with a colour-coded `517 / 280` budget |
| `render_config()` | Themed `inquire::RenderConfig` (`›` prompt, `✓` answered) |

Palette: accent `bright_yellow` (the landing page's warm yellow), body
`bright_white`, rules/labels `bright_black` (grey), success `bright_green`,
error `bright_red`, SHAs `cyan`. Status glyphs are single characters (`› ✓ ⚠ ✗
▪`), never emoji — see entry 7 for why.

---

### 10. A file under `src/` is not part of the crate until you declare it

**Symptom:** `ui.rs` was written, `cargo build` printed `Finished` and exited
0 — and the binary contained none of it. No warning, no missing-symbol error.

**Cause:** `main.rs` had no `mod ui;`. Rust silently ignores unreferenced files
in `src/`; they are not compiled at all, so nothing can fail. The proof that
output belonged to the new module was only available by *running* the binary.

**Fix:** `mod ui;` in `main.rs`, plus running the binary against a scratch repo
before calling the work done. "It builds" is not evidence that a module exists.

---

### 11. Colour is disabled when stdout is not a terminal

**Problem:** a CLI that always emits ANSI escapes pollutes anything that isn't
a terminal — `shiplog post | tee log`, CI logs, `$(shiplog post)`.

**Fix:**

```rust
pub fn interactive() -> bool {
    let no_color = std::env::var_os("NO_COLOR").is_some_and(|v| !v.is_empty());
    std::io::stdout().is_terminal() && !no_color
}

pub fn init() {
    if !interactive() {
        owo_colors::set_override(false);
    }
}
```

Two things this depends on:

- `owo_colors::set_override` is gated behind the `supports-colors` feature
  (`owo-colors = { version = "4.0", features = ["supports-colors"] }`). Without
  it the function does not exist — the feature adds the `supports-color` crate.
- `NO_COLOR` counts as "set" only when non-empty, per the no-color.org
  convention; `NO_COLOR=` is deliberately ignored.

The banner is tied to the same check: non-interactive runs get no box art, so
the tool stays usable in scripts and pipes.

---

### 12. Byte-slice truncation panics on multi-byte text

**Before:**
```rust
let subj = if subject.len() > max_subj {
    format!("{}…", &subject[..max_subj - 1])
} else { ... };
```

**Two bugs in four lines:**
1. `subject.len()` is a **byte** count. `"日本語"` is 9 bytes but 3 columns, so
the "does it fit" check truncates text that would have fit, and pads text that
would not.
2. `&subject[..n]` slices by bytes and **panics** (`byte index N is not a char
boundary`) when `n` lands inside a multi-byte character. A commit message with
an emoji or CJK text crashes the CLI while printing the commit list.

**After:**
```rust
pub fn truncate(s: &str, max: usize) -> String {
    if max == 0 { return String::new(); }
    if s.chars().count() <= max { return s.to_string(); }
    let mut out: String = s.chars().take(max - 1).collect();
    out.push('…');
    out
}
```

`.chars()` counts and slices at character boundaries, so it cannot panic. This
is covered by a regression test (`truncate_is_char_safe_and_counts_chars`).

---

### 13. `wrap_text` silently dropped blank lines

`text.split('\n')` followed by `paragraph.split_whitespace()` produces **no
words** for an empty paragraph, so a draft with a blank line between paragraphs
lost the gap in the card. Fix: an empty (or whitespace-only) paragraph pushes an
empty line and continues.

Long words needed handling too: a word longer than the card width must be
**hard-broken** into `width`-sized chunks, otherwise a pasted URL pushes the
right border past the terminal edge on every following line. Both behaviours
have tests (`wrap_keeps_blank_lines`, `wrap_respects_width_and_breaks_long_words`).

---

### 14. Box drawing needs plain-text width accounting

ANSI escapes are invisible, so the obvious layout calculation is wrong:

```rust
len(format!(" {} / {}", count, limit))  // string length, not display width
```

Every styled segment adds ~9 bytes of invisible escape text, so padding based
on `String::len()` shortens the fill and the right border of the card drifts
left, one row at a time.

The layout is therefore computed **twice**: once over plain `&str` lengths to
work out how many dashes fill the line, and once over the styled strings that
are actually printed. `draft_card()` computes `tail_plain` from
`count_text.chars().count()` and derives the dash run as
`w - (lead + title + gap + tail_plain)`. `rule()` repeats a character and only
then applies the dim colour, so its own width is exact.

`term_width()` also needs a contract because `terminal_size()` returns `None`
when stdout is not a tty: 80 columns fallback, clamped to `40..=100` so a
narrow terminal does not produce unreadable single-word-per-line cards and a
200-column terminal does not produce a 200-column paragraph.

---

### 15. Errors go through the design system, not `Debug`

`main` returns `ExitCode`, catches the error and prints the first line with
`ui::err_hint`, so a failure looks like the rest of the output:

```text
  ✗  not logged in — run `shiplog login` first
```

instead of `anyhow`'s default `Error: …` dump. An IO context line
(`caused by: No such file or directory`) is redundant for the common case but
invaluable when debugging, so the chain is printed only when `SHIPLOG_DEBUG` is
set.

This required removing the colour codes that `auth::load_token` had baked into
its `with_context` string — a context message is data now, not presentation.

---

### 16. `inquire` theming details (0.9)

`ui::render_config()` themes the interactive prompts so the select menu matches
the palette (`›` prompt prefix, `✓` answered prefix, grey help text).

Two API details worth remembering:

- `inquire::ui::Color` is its own enum with `LightYellow` / `LightGreen` /
  `DarkGrey` variants — not `Yellow` / `Green` / `Grey`.
- `RenderConfig` exposes builders for most fields, but **not** for
  `unhighlighted_option_prefix`; assign the field directly:

```rust
cfg.unhighlighted_option_prefix = Styled::new(" ").with_fg(Color::DarkGrey);
```

Select labels stay plain ASCII constants (`OPT_POST`, `OPT_EDIT`, `OPT_SKIP`)
for the reason in entry 7: the option label is also the value that gets matched.

---

## 2026-10-20 — Publishing to X

### 17. A platform is a module plus one entry in a table

LinkedIn publishing lived inside `app/api/post/route.ts`, so adding X would have
meant a second copy of the auth check, the error mapping and the response
shape. Instead each platform exports a single function and the route keeps the
table:

```ts
const PUBLISHERS = { linkedin: postToLinkedIn, x: postToX };
```

The route owns everything that is the same everywhere — the bearer check, the
target list, the 280-character guard for X, the result shape — and the modules
own what differs: endpoints, payloads, token refresh, and which errors mean
"not connected" versus "the platform said no".

The response is a list, not a single id:

```json
{ "ok": false, "results": [{ "platform": "x", "ok": true, "url": "…" },
                           { "platform": "linkedin", "ok": false, "error": "…" }] }
```

`200` all published, `207` partial, `409` nothing connected or expired, `502`
the platform refused. The CLI treats `207` as success and advances the marker:
the commits did go out, and advancing is what stops the working platform from
receiving the same post twice on the next run. Without that rule a retry after a
partial failure duplicates the post on the platform that worked.

### 18. X OAuth 2.0 is PKCE, so the verifier must survive the redirect

X has no client-secret-only flow for user context. The authorization request
carries `code_challenge = base64url(sha256(verifier))`; the token request must
present the original `verifier`, and the exchange fails if they do not match.

The verifier therefore has to live somewhere between two browser requests.
The options were a server-side store (the project has none) or a cookie. It
goes in `x_verifier`, `httpOnly`, `SameSite=Lax`, 10 minutes, next to the
`x_state` nonce — same lifetime and threat model as the LinkedIn flow, and the
cookie is cleared in the callback.

Two other things that bite:

- **Access tokens last about two hours.** Without `offline.access` the user is
  sent back through consent twice a day. With it, the callback stores the
  refresh token and `postToX` refreshes when the token is within 60 seconds of
  expiry. X rotates the refresh token on every use, so the new pair is written
  back before the publish is attempted — a crash after the publish would
  otherwise leave a dead refresh token on disk.
- **The redirect URI must match the app exactly.** It is derived from the
  request origin, and `X_REDIRECT_URI` overrides it, because preview deployments
  have a different origin and a hard-coded `localhost:3000` breaks them.

### 19. Testing an OAuth flow without the real provider

`X_API_BASE` and `X_AUTH_BASE` exist so the flow can be pointed at a local mock
that records what it receives. That makes the security-relevant details
checkable in a way reading the code is not:

- recompute `sha256(verifier)` and compare it with the `code_challenge` the
  redirect actually sent;
- assert the token request carried `Basic base64(id:secret)` and the same
  `code_verifier`;
- assert the token file contains no plaintext access or refresh token;
- let the token expire, post again, and check the mock saw a `refresh_token`
  grant followed by a tweet with the rotated token.

The same mock proves the failure paths: bad state stores nothing, a missing
token returns `409` with the connect URL, and 281 characters is rejected before
LinkedIn is contacted.

# shiplog

Turn the commits since your last post into a short social update, drafted in
your voice — and publish it from your own account once you approve it.

The repo has two halves:

| Path | What it is |
|---|---|
| `cli/` | The `shiplog` command-line tool (Rust) |
| `web/` | The Next.js app: landing page, browser login page, draft + publishing API |

The CLI is a thin client. It reads your git history locally, then talks to the
web app over HTTP — there is no database, just one encrypted token file per
connected platform (LinkedIn and X).

---

## Requirements

- **Rust 1.85+** (the crate uses `edition = "2024"`)
- **Node.js 20+ and npm** — for the web half
- **git** — the CLI reads history through `libgit2`, so a normal git repo is all
  it needs

---

## Setup

### 1. Start the web app

```sh
cd web
npm install
npm run dev
```

This serves <http://localhost:3000>. If port 3000 is already busy, Next prints
the port it actually used (e.g. 3001) — remember it for step 3.

### 2. Build the CLI

```sh
cd cli
cargo build --release
./target/release/shiplog --help
```

The binary lands at `cli/target/release/shiplog`. To put it on your `PATH`
instead:

```sh
cargo install --path cli     # installs to ~/.cargo/bin/shiplog
```

### 3. Point the CLI at the web app

The CLI defaults to `http://localhost:3000`. If your dev server is on another
port or host:

```sh
export SHIPLOG_WEB=http://localhost:3001
```

### 4. Log in

```sh
shiplog login
```

```text
  ── Login ────────────────────────────────────────────────
  ›  Opening your browser to finish signing in
     If nothing opens, visit this URL:
     →  http://localhost:3000/cli/login?port=42317&state=…
     Waiting for approval — press Ctrl-C to cancel.
  ✓  Logged in. Credentials saved to ~/.config/shiplog/credentials.json
```

Approve on the page that opens; the CLI catches the callback on a loopback port,
exchanges the one-time code for a token and stores it. It waits up to 3 minutes.

### 5. Draft a post

```sh
cd ~/code/some-repo
shiplog post
```

```text
  ── Recent commits ──────────────────────────────────────────────────────────
  commit   message                                                     2 new
  ────────────────────────────────────────────────────────────────────────────
  b5bcc78  ship command with draft and approve flow
  9d7327d  Working CLI login flow

  ›  Drafting an update…

┌─ Draft ────────────────────────────────────────────────────────── 104 / 280 ─┐
│                                                                              │
│  cli tui and readme                                                          │
│                                                                              │
│  Progress update:                                                            │
│  • ship command with draft and approve flow                                  │
│  • Working CLI login flow                                                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
› What now?
  Post
  Edit
  Skip
```

Pick **Edit** to open `$EDITOR` with the draft, **Post** to publish, or **Skip**
to exit without posting. When more than one account is connected, **Post**
first asks which platform(s) should receive the text. The draft shows a live
character budget — both LinkedIn and X cap a post at 280 characters (green
while comfortably under, yellow past 80%, red over).

To skip the picker, name the targets:

```sh
shiplog post --to x              # X only
shiplog post --to linkedin,x     # both, in one approve step
shiplog post "focus on the TUI" --to all
```

Only commits made since the last successful post are considered, up to 20 of
them. A message passed to the command nudges the draft:

```sh
shiplog post "focus on the CLI redesign"
```

### 6. Teach it your voice (optional)

```sh
shiplog voice
```

Opens `$EDITOR` pre-filled with your saved samples. Paste 3–5 of your own past
posts, separating each one with a line containing only `---`, then save and
close the editor. Drafts pick up the tone and length of those samples.

```text
First post sample.
---
Second post sample.
```

---

## What works out of the box

| Step | Without any configuration | To go further |
|---|---|---|
| `shiplog login` | Works — the dev server issues a stub token (`dev-code` → `dev-token-123`) | Replace `/api/cli/token` with your real account auth |
| `shiplog post` (draft) | Works — falls back to a plain template draft | Set the three `LLM_*` vars below for model-written drafts |
| `shiplog post` → **Post** | Fails with `no account connected yet` | Connect LinkedIn and/or X (below); each needs its app credentials plus `TOKEN_ENC_KEY` |
| `shiplog voice` | Works — stored on your machine only | — |

---

## Web app configuration

Put these in `web/.env.local` (Next.js loads it automatically) and restart
`npm run dev`.

| Variable | Needed for | Notes |
|---|---|---|
| `LLM_BASE_URL` | AI drafts | OpenAI-compatible base URL, e.g. `https://api.openai.com/v1` — the route appends `/chat/completions` |
| `LLM_API_KEY` | AI drafts | Sent as `Authorization: Bearer …`; omit for a local model with no auth |
| `LLM_MODEL` | AI drafts | Model name passed straight through |
| `TOKEN_ENC_KEY` | Posting | 64 hex characters (32 bytes) used to encrypt the LinkedIn and X tokens with AES-256-GCM. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `BLOB_STORE_ID` | Posting when deployed | Set automatically when a [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) store is connected; the SDK authenticates with OIDC by default. `BLOB_READ_WRITE_TOKEN` also works (CI, or local use of Blob). With neither, the token goes to `web/.data/` |
| `LINKEDIN_CLIENT_ID` | Posting | From your LinkedIn developer app |
| `LINKEDIN_CLIENT_SECRET` | Posting | From your LinkedIn developer app |
| `LINKEDIN_REDIRECT_URI` | Posting | Must match the app exactly, e.g. `http://localhost:3000/api/linkedin/callback` |
| `LINKEDIN_VERSION` | Optional | `Linkedin-Version` header, defaults to `202609` |
| `X_CLIENT_ID` | Posting to X | OAuth 2.0 client id from your X developer app |
| `X_CLIENT_SECRET` | Posting to X | Client secret. Leave it out only if the app is registered as a public client |
| `X_REDIRECT_URI` | Optional | Defaults to `<origin>/api/x/callback`; set it when the app requires an exact value, e.g. `http://localhost:3000/api/x/callback` |

If `LLM_BASE_URL` or `LLM_MODEL` is missing — or the model call fails — the
draft endpoint logs the error and returns a template draft instead, so the CLI
flow still works end to end.

### Connecting LinkedIn

Posting is separate from CLI login. With the env vars set, start the web app and
open:

<http://localhost:3000/api/linkedin/connect>

Authorize the app; the callback stores the encrypted token — in
`web/.data/linkedin.json` locally, or in a private Vercel Blob
(`shiplog/linkedin-token.json`) when deployed. The requested scopes are
`openid profile w_member_social`, so your LinkedIn app needs those products
approved. Reconnect the same way when the token expires — `shiplog post` then
reports `LinkedIn connection expired`.

Serverless filesystems are read-only, so a deployment without a Blob store
cannot persist the token. Rather than silently losing it, the callback and the
post endpoint fail with `LinkedIn token storage is not configured: add a Vercel
Blob store…` — connect a Blob store (Vercel then sets `BLOB_STORE_ID`),
redeploy, and reconnect LinkedIn.

### Connecting X

In the X developer portal, create an app with OAuth 2.0 enabled, set its
callback URL to `http://localhost:3000/api/x/callback` (or your deployed
`/api/x/callback`), and put the client id and secret in `.env.local`. Then
open:

<http://localhost:3000/api/x/connect>

X uses OAuth 2.0 with PKCE: the verifier lives in a 10-minute cookie and only
its SHA-256 challenge is sent to X, so the token exchange cannot be replayed.
The access token expires after about two hours, but the `offline.access` scope
lets the service refresh it silently and store the rotated pair, so a connected
account keeps working without another trip through the consent screen. The
token is encrypted with the same `TOKEN_ENC_KEY` and kept separately from the
LinkedIn one — `web/.data/x.json` locally, `shiplog/x-token.json` in a private
Vercel Blob when deployed.

Connecting one platform never disturbs the other. To stop publishing to a
platform, remove its token file (or overwrite the Blob) and reconnect only the
ones you want.

---

## Deploying the web app

The web app deploys on its own; the CLI always points at whatever URL you give
it through `SHIPLOG_WEB`.

```sh
cd web
vercel link --project shiplog    # once
vercel deploy                    # preview; the first deploy of a new project
                                 # is assigned to production by Vercel
vercel --prod                    # promote later changes
```

Set the variables from the table above in the Vercel project (dashboard or
`vercel env add <NAME>`); `.env.local` is git-ignored and is not uploaded.

---

## Commands

| Command | What it does |
|---|---|
| `shiplog login` | Browser-based login; writes the token to disk |
| `shiplog post [MESSAGE] [--to TARGETS]` | Draft from recent commits, then Post / Edit / Skip. `--to` is `linkedin`, `x`, `all`, or a comma-separated list |
| `shiplog voice` | Edit the voice samples used to steer drafts |
| `shiplog --help` | Usage, `--version` for the version |

### CLI environment variables

| Variable | Default | Effect |
|---|---|---|
| `SHIPLOG_WEB` | `http://localhost:3000` | Base URL of the web app |
| `NO_COLOR` | unset | Set to any non-empty value to disable colour |
| `SHIPLOG_DEBUG` | unset | Print the full error cause chain |

Colour and the banner are also skipped automatically when output is not a
terminal, so `shiplog post | tee log` stays plain text.

### Where state lives

`<config>` below is `$XDG_CONFIG_HOME` or `~/.config` on Linux,
`~/Library/Application Support` on macOS, and `%APPDATA%` on Windows.

| File | Purpose |
|---|---|
| `<config>/shiplog/credentials.json` | Session token, created with `0600` permissions |
| `<config>/shiplog/voice.txt` | Voice samples, separated by `---` |
| `<repo>/.git/shiplog-last` | OID of the last posted commit (written atomically) |

Deleting `credentials.json` logs you out. Deleting `.git/shiplog-last` makes the
next `post` re-draft from your recent history.

---

## Troubleshooting

| Message | Meaning / fix |
|---|---|
| `not logged in — run shiplog login first` | No `credentials.json` yet; run `shiplog login` |
| `session expired — run shiplog login again` | The server rejected the token (401); log in again |
| `nothing new since your last ship.` | Every commit is already covered — commit something, or delete `.git/shiplog-last` |
| `not inside a git repository` | Run the command from inside a repo |
| `no commits yet` | The repo has no history to draft from |
| `no account connected yet` | Connect LinkedIn and/or X (both have `/connect` URLs above) |
| `LinkedIn not connected` / `X not connected` | That platform has no stored token yet; open its connect URL |
| `X connection expired` | The refresh token could not be used; reconnect X |
| `post failed: …` | The platform rejected the text (rate limit, duplicate post, revoked scope); the message is passed through |
| `timed out after 3 minutes …` | The browser callback never arrived; run `shiplog login` again |
| `state mismatch — login aborted` | The callback's state didn't match this login attempt; try again |

If a `post` fails *after* you approve it, the marker is not advanced, so the
same commits will be drafted again next time.

---

## Development

```sh
# CLI
cd cli
cargo test
cargo clippy --all-targets

# Web
cd web
npm run lint
npm run build
```

The CLI's terminal output lives in `cli/src/ui.rs`; `learning.md` records the
non-obvious decisions behind it and the rest of the codebase.

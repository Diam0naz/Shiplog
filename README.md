# shiplog

Turn the commits since your last post into a short social update, drafted in
your voice — and publish it from your own account once you approve it.

The repo has two halves:

| Path | What it is |
|---|---|
| `cli/` | The `shiplog` command-line tool (Rust) |
| `web/` | The Next.js app: landing page, GitHub sign-in, draft + publishing API |

The CLI is a thin client. It reads your git history locally, then talks to the
web app over HTTP. There is no database server: accounts, sessions and the
encrypted platform tokens are JSON in a Vercel Blob store (or `web/.data/` when
you run it locally).

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
  ✓  Logged in as octocat. Credentials saved to ~/.config/shiplog/credentials.json
```

The page signs you in with GitHub on first run, then hands the CLI a one-time
code valid for two minutes. The CLI catches the callback on a loopback port,
exchanges the code for a session token and stores it with `0600` permissions.
Sessions last 90 days and can be revoked with `shiplog logout`. It waits up to
3 minutes for the browser.

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
| `shiplog login` | Requires a GitHub OAuth App (below) | Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` |
| `shiplog post` (draft) | Works — falls back to a plain template draft | Set the three `LLM_*` vars below for model-written drafts |
| `shiplog post` → **Post** | Fails with `no account connected yet` | Connect LinkedIn, X, and/or Farcaster (below); each needs its app credentials plus `TOKEN_ENC_KEY` |
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
| `GITHUB_CLIENT_ID` | Signing in | Client id of a GitHub OAuth App — the only identity provider |
| `GITHUB_CLIENT_SECRET` | Signing in | Client secret of the same OAuth App |
| `GITHUB_REDIRECT_URI` | Optional | Defaults to `<origin>/api/github/callback`; must match the OAuth App exactly |
| `TOKEN_ENC_KEY` | Posting | 64 hex characters (32 bytes) used to encrypt the LinkedIn and X tokens with AES-256-GCM. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `BLOB_STORE_ID` | Posting when deployed | Set automatically when a [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) store is connected; the SDK authenticates with OIDC by default. `BLOB_READ_WRITE_TOKEN` also works (CI, or local use of Blob). With neither, the token goes to `web/.data/` |
| `LINKEDIN_CLIENT_ID` | Posting | From your LinkedIn developer app |
| `LINKEDIN_CLIENT_SECRET` | Posting | From your LinkedIn developer app |
| `LINKEDIN_REDIRECT_URI` | Posting | Must match the app exactly, e.g. `http://localhost:3000/api/linkedin/callback` or `https://shiplog-sage.vercel.app/api/linkedin/callback` |
| `LINKEDIN_VERSION` | Optional | `Linkedin-Version` header, defaults to `202609` |
| `X_CLIENT_ID` | Posting to X | OAuth 2.0 client id from your X developer app |
| `X_CLIENT_SECRET` | Posting to X | Client secret. Leave it out only if the app is registered as a public client |
| `X_REDIRECT_URI` | Optional | Defaults to `<origin>/api/x/callback`; set it when the app requires an exact value, e.g. `http://localhost:3000/api/x/callback` or `https://shiplog-sage.vercel.app/api/x/callback` |
| `FARCASTER_API_KEY` | Posting to Farcaster | Neynar API key (get from neynar.com) |
| `FARCASTER_DEVELOPER_MNEMONIC` | Posting to Farcaster | Seed phrase of your app's **developer** Farcaster account. Used server-side to sign the managed-signer key request. Keep it secret (Vercel env / `.env.local`, never git) |
| `FARCASTER_DEVELOPER_FID` | Optional | Your app's developer FID. Derived from the mnemonic's custody address when omitted |
| `FARCASTER_API_BASE` | Optional | Neynar API base URL, defaults to `https://api.neynar.com/v2` |

If `LLM_BASE_URL` or `LLM_MODEL` is missing — or the model call fails — the
draft endpoint logs the error and returns a template draft instead, so the CLI
flow still works end to end.

### Signing in

Create a GitHub OAuth App (Settings → Developer settings → OAuth Apps) and
register the callback URLs `http://localhost:3000/api/github/callback` and
`https://shiplog-sage.vercel.app/api/github/callback`. One app can hold up to 10 callback
URLs, so a single app covers both; use one app per environment if you would
rather keep the secrets separate. Leave **Allow wildcard matching** and **Enable
device flow** off — this flow needs neither. Then set `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET`. `shiplog login` then:

1. opens `/cli/login`, which redirects to GitHub when you have no session;
2. GitHub returns to `/api/github/callback`, which creates your user record and
   sets an httpOnly `ship_session` cookie valid for 90 days;
3. `/cli/login` mints a single-use code — stored only as a SHA-256 hash, valid
   for two minutes — and redirects it to the CLI's loopback listener;
4. `POST /api/cli/token` trades that code for a 48-byte session token, also
   stored only as a hash. Every API request presents it as a bearer token.

Only the `read:user` scope is requested, so shiplog never reads your
repositories. There is no shared account: each user's LinkedIn and X tokens are
keyed to their GitHub id, so two people on one deployment never post from each
other's accounts.

### Connecting LinkedIn

Posting is separate from CLI login, and a platform connection belongs to the
user who makes it. Sign in through `shiplog login` first — the connect URL sends
you through GitHub if you are not — then open:

<http://localhost:3000/api/linkedin/connect>

**Production:** <https://shiplog-sage.vercel.app/api/linkedin/connect>

Authorize the app; the callback stores the encrypted token under your user id —
in `web/.data/shiplog/users/<github-id>/linkedin-token.json` locally, or in a private
Vercel Blob (`shiplog/users/<github-id>/linkedin-token.json`) when deployed. The requested scopes are
`openid profile w_member_social`, so your LinkedIn app needs those products
approved. Reconnect the same way when the token expires — `shiplog post` then
reports `LinkedIn connection expired`.

Serverless filesystems are read-only, so a deployment without a Blob store
cannot persist anything — accounts, sessions and platform tokens alike. Rather
than silently losing data, every write fails with `Storage is not configured:
add a Vercel Blob store to this project (it sets BLOB_STORE_ID), then redeploy`.
Connect a Blob store, redeploy, and sign in again.

### Connecting X

In the X developer portal, create an app with OAuth 2.0 enabled, set its
callback URL to `http://localhost:3000/api/x/callback` (or your deployed
`https://shiplog-sage.vercel.app/api/x/callback`), and put the client id and secret in `.env.local`. Then
open:

<http://localhost:3000/api/x/connect>

**Production:** <https://shiplog-sage.vercel.app/api/x/connect>

X uses OAuth 2.0 with PKCE: the verifier lives in a 10-minute cookie and only
its SHA-256 challenge is sent to X, so the token exchange cannot be replayed.
The access token expires after about two hours, but the `offline.access` scope
lets the service refresh it silently and store the rotated pair, so a connected
account keeps working without another trip through the consent screen. The
token is encrypted with the same `TOKEN_ENC_KEY` and kept separately from the
LinkedIn one — `web/.data/users/<github-id>/x-token.json` locally,
`shiplog/users/<github-id>/x-token.json` in a private Vercel Blob when deployed
(the local copy is `web/.data/shiplog/users/<github-id>/x-token.json`).
The connect URL also requires a signed-in user and sends you through GitHub
first if you are not.

Connecting one platform never disturbs the other. To stop publishing to a
platform, remove its token file (or overwrite the Blob) and reconnect only the
ones you want.

### Connecting Farcaster

Farcaster does **not** use OAuth 2.0, and Neynar's older "Sign In With Neynar"
flow is deprecated. shiplog uses **Neynar managed signers**: the app creates a
signer, signs a key request with your app's developer account, and the user
approves that signer once in their Farcaster wallet.

You'll need:
1. A **Neynar account** (neynar.com) → create an **App** to get an **API Key**.
2. A **developer Farcaster account** whose **seed phrase** the server can use to
   sign key requests.

Add these to `.env.local` (or Vercel env vars):

```bash
FARCASTER_API_KEY=your_neynar_api_key
FARCASTER_DEVELOPER_MNEMONIC="word1 word2 … word12"   # keep this secret
# FARCASTER_DEVELOPER_FID=12345                        # optional; derived otherwise
```

Then open:

<http://localhost:3000/connect/farcaster>

**Production:** <https://shiplog-sage.vercel.app/connect/farcaster>

The flow:
1. The page creates a signer (`POST /api/farcaster/signer`) and shows an
   approval **QR code** plus an "Open in wallet" link.
2. You scan it on your phone (or tap on mobile) and approve the signer in your
   Farcaster wallet — a one-time on-chain step (sponsored unless you opt out).
3. The page polls (`GET /api/farcaster/signer`) until the signer is approved,
   stores it encrypted under your user id, and you're connected.
4. `shiplog post` casts through that approved signer via Neynar.

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
| `shiplog login` | GitHub sign-in through the browser; writes the session token to disk |
| `shiplog status` | Shows web-app reachability, who you're signed in as, connected accounts, your weekly shipping streak, and how many commits are waiting since your last post |
| `shiplog logout` | Revokes the session on the server and deletes the local token |
| `shiplog post [MESSAGE] [--to TARGETS]` | Draft from recent commits, then Post / Edit / Skip. `--to` is `linkedin`, `x`, `all`, or a comma-separated list. `--release` drafts a release announcement from the latest version tag; `--week [DAYS]` drafts a "shipped this week" digest (default 7 days). A draft over 280 characters posts as a thread on X |
| `shiplog voice` | Edit the voice samples used to steer drafts |
| `shiplog --help` | Usage, `--version` for the version |

### CLI environment variables

| Variable | Default | Effect |
|---|---|---|
| `SHIPLOG_WEB` | `http://localhost:3000` | Base URL of the web app |
| `NO_COLOR` | unset | Set to any non-empty value to disable colour |
| `SHIPLOG_NO_ANIM` | unset | Set to any value to draw the startup banner once, without the animated intro |
| `SHIPLOG_DEBUG` | unset | Print the full error cause chain |

Colour and the banner are also skipped automatically when output is not a
terminal, so `shiplog post | tee log` stays plain text. The startup intro
phase-shifts through three scenes inside a terminal window — the logo mark, the
`shiplog` wordmark, and a little ship — each joined by a bright sweep, then
settles on the wordmark. Set `SHIPLOG_NO_ANIM` to render a single static frame.

### Where state lives

`<config>` below is `$XDG_CONFIG_HOME` or `~/.config` on Linux,
`~/Library/Application Support` on macOS, and `%APPDATA%` on Windows.

| File | Purpose |
|---|---|
| `<config>/shiplog/credentials.json` | Session token, created with `0600` permissions; use `shiplog logout` to revoke it server-side |
| `<config>/shiplog/voice.txt` | Voice samples, separated by `---` |
| `<repo>/.git/shiplog-last` | OID of the last posted commit (written atomically) |

`shiplog logout` revokes the server session and deletes `credentials.json`;
removing that file by hand only forgets the token on this machine. Deleting
`.git/shiplog-last` makes the next `post` re-draft from your recent history.

---

## Troubleshooting

| Message | Meaning / fix |
|---|---|
| `not logged in — run shiplog login first` | No `credentials.json` yet; run `shiplog login` |
| `session expired — run shiplog login again` | The server rejected the token (401): revoked, expired, or the store was reset; log in again |
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

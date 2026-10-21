# shiplog web

The Next.js side of shiplog: the landing page, the browser login page the CLI
opens, and the API the CLI talks to.

For full setup — including building and running the CLI — see the
[root README](../README.md).

## Run it

```sh
npm install
npm run dev
```

Serves <http://localhost:3000> (Next picks another port if 3000 is taken; the
CLI needs `SHIPLOG_WEB` pointed at whatever port it prints).

## Pages

| Route | What it is |
|---|---|
| `/` | Landing page |
| `/privacy` | Privacy policy — what the CLI sends, what is stored, how to delete it |
| `/terms` | Terms and conditions |
| `/cli/login` | The page `shiplog login` opens in your browser |

Both legal pages live in `src/app/privacy/page.tsx` and `src/app/terms/page.tsx` and share
`src/app/LegalPage.tsx`; edit the copy there. They are linked from the footer of every page.

## API surface

| Route | Used by | Notes |
|---|---|---|
| `GET /cli/login?port=&state=` | `shiplog login` | Route handler: redirects to GitHub when signed out, otherwise to the CLI's loopback listener with a one-time code |
| `GET /api/github/connect?next=` | the pages above | Starts GitHub OAuth (`read:user` only) |
| `GET /api/github/callback` | GitHub | Creates the user, sets the `ship_session` cookie, returns to `next` |
| `POST /api/cli/token` | `shiplog login` | Exchanges that code for a 48-byte session token (stored hashed) |
| `DELETE /api/session` | `shiplog logout` | Revokes the bearer token it is called with |
| `POST /api/draft` | `shiplog post` | Requires a bearer session, returns `{ draft }` |
| `POST /api/post` | `shiplog post` → **Post** | Publishes with *your* platform tokens. `200` all ok, `207` partial, `409` not connected, `502` rejected |
| `GET /api/connections` | `shiplog post` | Which platforms *you* have connected, so the CLI only offers working ones |
| `GET /api/linkedin/connect` | you, once | Requires a session; starts the LinkedIn OAuth flow |
| `GET /api/linkedin/callback` | LinkedIn | Stores the encrypted token under your user id |
| `GET /api/x/connect` | you, once | Requires a session; starts the X OAuth 2.0 + PKCE flow |
| `GET /api/x/callback` | X | Exchanges the code and stores the token under your user id |
| `GET /api/farcaster/connect` | you, once | Requires a session; starts the Farcaster SIWF (EIP-4361) flow |
| `GET /api/farcaster/callback` | Farcaster | Exchanges the code, gets signer UUID, stores encrypted token |

## Configuration

Environment variables live in `.env.local` (git-ignored); the full table is in
the [root README](../README.md#web-app-configuration). Sign-in needs
`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`; without them `/api/github/connect`
returns a message naming the missing variable. Without the `LLM_*` variables,
`/api/draft` returns a template draft. Without a platform's credentials and
`TOKEN_ENC_KEY`, `/api/post` responds `409` with a message naming the missing
connection.

Everything persisted is JSON: `users/<id>.json`, `sessions/<sha256>.json`,
`cli-codes/<sha256>.json` and `users/<id>/{linkedin,x}-token.json`, under
`.data/shiplog/` locally (`web/.data/shiplog/`) and `shiplog/…` in a private
Vercel Blob when deployed. Create the Blob store in the project and Vercel sets
`BLOB_STORE_ID` (OIDC credentials by default); without a store every write fails
with a storage error rather than dropping data silently.

Only hashes of session tokens and CLI codes are stored, and platform tokens are
encrypted with `TOKEN_ENC_KEY`. `GITHUB_API_BASE` / `GITHUB_OAUTH_BASE` override
the GitHub endpoints, and `X_API_BASE` / `X_AUTH_BASE` the X ones, so both flows
can be exercised against a local mock.

X access tokens last about two hours; `/api/x/callback` also stores the refresh
token so posting can renew it without another consent screen. `X_API_BASE` and
`X_AUTH_BASE` override the X endpoints, so the flow can be exercised against a
local mock without touching the real API.

## Deploy

```sh
vercel link --project shiplog
vercel deploy        # first deploy of a new project goes to production
vercel --prod        # subsequent production promotions
```

## Checks

```sh
npm run lint
npm run build
```

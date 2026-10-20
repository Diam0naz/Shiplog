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
| `GET /cli/login?port=&state=` | `shiplog login` | Page with an "Authorize" link back to the CLI's loopback listener |
| `POST /api/cli/token` | `shiplog login` | Exchanges the one-time code for a session token (currently a dev stub) |
| `POST /api/draft` | `shiplog post` | Reads `Authorization: Bearer …`, returns `{ draft }` |
| `POST /api/post` | `shiplog post` → **Post** | Publishes to `targets` (default: every connected platform). `200` all ok, `207` partial, `409` not connected, `502` rejected |
| `GET /api/connections` | `shiplog post` | Which platforms have a stored token, so the CLI only offers working ones |
| `GET /api/linkedin/connect` | you, once | Starts the LinkedIn OAuth flow |
| `GET /api/linkedin/callback` | LinkedIn | Stores the encrypted token in `.data/linkedin.json` |
| `GET /api/x/connect` | you, once | Starts the X OAuth 2.0 + PKCE flow |
| `GET /api/x/callback` | X | Exchanges the code and stores the token in `.data/x.json` |

## Configuration

Environment variables live in `.env.local` (git-ignored); the full table is in
the [root README](../README.md#web-app-configuration). Without the `LLM_*`
variables, `/api/draft` returns a template draft. Without a platform's
credentials and `TOKEN_ENC_KEY`, `/api/post` responds `409` with a message
naming the missing connection.

Tokens are written to `.data/linkedin.json` and `.data/x.json` locally. Deployed,
the filesystem is read-only, so they go to private Vercel Blobs instead —
connect a Blob store to the project and Vercel sets `BLOB_STORE_ID` (OIDC
credentials by default). Without a store `/api/post` returns a storage error
naming the platform rather than silently dropping the token.

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

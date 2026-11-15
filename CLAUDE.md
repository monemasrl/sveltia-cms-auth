# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file Cloudflare Worker ([src/index.js](src/index.js)) that acts as the OAuth broker for Sveltia CMS's GitHub backend, using a **GitHub App** (an OAuth app still works but is no longer documented). GitLab support was removed on purpose; GitLab users are pointed to client-side PKCE. There are no runtime dependencies and no build step: Wrangler deploys `src/index.js` directly.

The same code also deploys to Vercel. [api/index.js](api/index.js) is a Vercel Function (`export default { fetch }`) that calls the Worker's `fetch` with `process.env` as `env`. [vercel.json](vercel.json) rewrites every path to `/api`, and the request keeps its original URL, so the Worker's pathname routing works unchanged. `outputDirectory: "public"` keeps the repo files from being served as static files. All logic stays in `src/index.js`, so keep it free of Cloudflare-only APIs (bindings, `caches`, `ctx`) and Node-only APIs.

## Commands

Uses pnpm (Node version in `.nvmrc`).

- `pnpm start` runs `wrangler dev` locally
- `pnpm deploy` runs `wrangler deploy`
- Vercel: `vercel dev` and `vercel deploy --prod` (env vars set on the Vercel project)
- `pnpm check` runs every `check:*` script: `pnpm audit`, cspell, `prettier --check .` and `eslint .`
- Run a single check with e.g. `pnpm check:eslint`

There is no test suite. Type checking happens through `jsconfig.json` (`checkJs` + `strict`), so JSDoc types are the type system: keep them accurate.

Runtime config comes from Worker env vars, not `wrangler.toml`: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, optional `GITHUB_HOSTNAME` (GitHub Enterprise Server), `ALLOWED_DOMAINS` and `GITHUB_ALLOW_WORKFLOW_SCOPE` (OAuth app only). For local `wrangler dev`, put them in an untracked `.dev.vars`.

## Request flow

Routes in the `fetch` handler (each has a Decap/Netlify-compatible alias):

1. `GET /auth` or `/oauth/authorize` → `handleAuth`: checks `provider === 'github'`, checks `site_id` against `ALLOWED_DOMAINS`, sets a `csrf-token=github_<hex>` cookie (10 min, `SameSite=Lax`) and redirects to GitHub's authorize URL with that token as `state`.
2. `GET /callback` or `/oauth/redirect` → `handleCallback`: checks `state` against the cookie, exchanges `code` via `requestToken`, then returns `outputHTML`.
3. `POST /auth` or `/oauth/access_token` (plus `OPTIONS` preflight) → `handleRefresh`: exchanges a refresh token for a new access token. GitHub App user tokens expire after 8h. The CMS calls this with `fetch`, so it relies on CORS headers from `getCorsHeaders`.

`outputHTML` returns a popup page that speaks the Netlify/Decap `postMessage` protocol: it posts `authorizing:github` to the opener, waits for the opener to echo it back, then posts `authorization:github:<success|error>:<json>` to that origin. Error codes in `errorMessages` are keys that Sveltia CMS uses to localize messages, so treat them as part of the protocol.

## Security invariants

These are deliberate. Read the surrounding comments before changing them:

- `ALLOWED_DOMAINS` is enforced **twice** with the same regex sources from `getDomainPatterns`: on the server against `site_id`, which the caller controls, and in the popup's inline script against the `message` event `origin`, which the browser sets and cannot be forged. A token is released only to a trusted origin, while errors always pass through.
- Values embedded in the inline script must go through `serialize` (JSON plus escaping `<`).
- Token-bearing responses use `Cache-Control: no-store`, and the CSRF cookie is cleared on every `outputHTML`.
- Scopes (OAuth app only) are allowlisted in `GITHUB_SCOPES`, and anything unrecognized falls back to the default. `workflow` is dropped unless the operator opts in, rather than falling back, which could widen the scope.
- An unsupported `provider` is echoed back only if it matches `/^[a-z-]+$/`, so the CMS shows the error instead of hanging.

## Code style

- ESLint uses Airbnb base, Prettier and strict JSDoc rules: every function, including arrow functions, needs a JSDoc block with a description, typed `@param` with a hyphen before the description, and `@returns`. Max line length is 100.
- `padding-line-between-statements` requires blank lines around declarations and blocks, but none between consecutive single-line `const`/`let` declarations.
- Comments use typographic apostrophes (`’`). Inline `//` comments usually have no trailing period, while JSDoc descriptions are complete sentences.
- cspell runs as part of `pnpm check`. Add new legitimate words to `cspell.config.yaml`.
- When behavior or env vars change, update [README.md](README.md). It is the user-facing setup guide.

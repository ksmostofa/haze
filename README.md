# HAZE

A first-person Three.js survival game. Clear six waves before dawn and compete for the fastest verified global time.

**Play:** <https://survivethehaze.netlify.app>

**Cloudflare origin:** <https://haze.ksmostofa576.workers.dev>

Both URLs run the same HAZE build and use the same authoritative Cloudflare leaderboard.

## Architecture

- **Canonical source:** GitHub
- **Game source:** one real `public/index.html`
- **Primary backend/origin:** Cloudflare Worker + Static Assets
- **Leaderboard storage:** SQLite Durable Object
- **Short public mirror:** Netlify
- **Netlify API routing:** `/api/*` transparently proxies to the Cloudflare Worker
- **Engine:** self-hosted, pinned Three.js
- **Identity:** anonymous browser UUID; no account or password
- **Bot protection:** verified ranked-run protocol; optional Cloudflare Turnstile when configured

Netlify does not maintain a second leaderboard or database. A victory submitted from either production URL reaches the same Cloudflare API and the same global ranking.

## Game delivery

The game itself remains a normal single HTML application:

```text
public/index.html
```

`build.mjs` verifies the production markers, copies `public/` into `dist/`, and self-hosts the pinned Three.js build at `dist/vendor/three.min.js`. There is no browser-side Base64 loader and no `atob()` bootstrap.

## Ranked protocol

1. The client waits for `POST /api/run/start` before ranked gameplay begins.
2. The server stores a single-use opaque run ID and start timestamp.
3. The client records bounded kill and wave-split proof events during play.
4. Victory immediately calls `POST /api/run/complete`; the server freezes elapsed time, validates the six-wave proof, derives score itself, and stores a completion proof.
5. The player enters a display name after the clock has stopped.
6. `POST /api/run/finish` atomically consumes the completion proof and inserts or updates only a faster personal best.

Ranking order is fastest time, then higher server-derived score, then earlier achievement. The public board returns the Top 10. Exact ranks are calculated inside the cached Top 100; players below that receive `100+`, avoiding expensive full-table rank scans.

This is pragmatic anti-cheat for a downloadable browser game rather than server-authoritative combat. It blocks trivial timer edits, client-supplied scores, one-request fake wins, token replay, timing-after-victory, malformed six-wave proofs, and casual automated spam.

## Fullscreen and mobile

Browsers require a user gesture before entering fullscreen. HAZE therefore opens with one explicit **Enter Fullscreen** interaction. That gesture requests:

- fullscreen with browser navigation hidden where supported
- landscape orientation where supported
- a screen wake lock where supported

A separate Fullscreen control remains in Settings if the browser rejects or exits the initial request. Portrait phones retain the rotate-device fallback.

## Privacy and storage

Persistent leaderboard records contain only:

- anonymous browser player ID
- chosen display name
- best verified completion time
- server-derived score
- kills
- season
- achievement timestamp

Raw IP addresses are not stored. Old incomplete/completed run records are removed after 24 hours. Display names are Unicode-normalized and reject unsafe control/bidi/private-use characters.

## Production URLs

```text
Netlify     https://survivethehaze.netlify.app
Cloudflare  https://haze.ksmostofa576.workers.dev
```

The Netlify mirror ships `_redirects` so requests such as `/api/leaderboard` and `/api/run/start` are served by the Cloudflare origin. This keeps both public URLs on one leaderboard.

## Repository layout

```text
public/
  index.html             single-file HAZE game source
  manifest.webmanifest
  _headers
  _redirects             Netlify → Cloudflare API proxy
  assets/                icons / social art
src/
  protocol.js            ranked proof + name validation
  worker.js              Cloudflare API + SQLite Durable Object
test/
  protocol.test.js       anti-cheat / quota regression tests
.github/workflows/
  verify.yml             build + dual-host production smoke test
build.mjs                deterministic public/ → dist/ build
netlify.toml              Netlify build configuration
package.json
wrangler.jsonc            Cloudflare Worker / assets / DO configuration
```

## Verification

```bash
npm ci
npm run check
```

CI verifies Worker syntax, the production build, absence of the obsolete Base64/debug loaders, ranked-proof validation, quota guardrails, and both live production hosts. It also confirms that `/api/config`, `/api/leaderboard`, and `/api/run/start` work through Cloudflare directly and through the Netlify proxy.

## Turnstile

Turnstile is optional on top of verified-run protection. When both Cloudflare settings exist:

- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET`

`/api/config` reports `turnstile+verified-run`. Without them it reports `verified-run`; the ranked proof, server timing, single-use completion tokens, validation, and rate limiting remain active.

## Public repository

The repository can remain public: browser game code is inspectable by players regardless of repository visibility, while authoritative leaderboard state and validation run on Cloudflare. No production credentials are committed to `main`.

Public visibility does **not** grant reuse rights. No reuse license has been granted for HAZE.

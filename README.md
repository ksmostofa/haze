# HAZE

A first-person Three.js survival game. Clear six waves before dawn and compete for the fastest verified global time.

**Play:** <https://survivethehaze.netlify.app>

**Cloudflare origin/API:** <https://haze.ksmostofa576.workers.dev>

## Architecture

HAZE has one application and one backend:

```text
GitHub source
    ↓
Cloudflare Worker + Static Assets + Durable Object
    ↓
Netlify 200 rewrite (public hostname only)
    ↓
https://survivethehaze.netlify.app
```

- **GitHub** is the canonical source.
- **Cloudflare** builds and serves the actual frontend, API, ranked validation, and global leaderboard.
- **Netlify** publishes only `netlify-proxy/_redirects`; it does not keep a second game build, function, database, or leaderboard.
- The visible public hostname remains `survivethehaze.netlify.app` while Netlify fetches the Cloudflare frontend behind the scenes.
- Browser API requests go directly to the Cloudflare Worker. `src/entry.js` permits only the public Netlify origin and supplies the required CORS/preflight response, preserving real client IPs for Cloudflare rate limiting.
- The production canonical/social URL is the Netlify public hostname.

Netlify officially supports external 200 rewrites for this proxy pattern. The address bar stays on the Netlify URL while the response comes from the external origin.

## Game delivery

The authored game remains one real file:

```text
public/index.html
```

`build.mjs` validates it and produces the Cloudflare production build. The build also:

- self-hosts pinned Three.js at `/vendor/three.min.js`
- sets the public canonical hostname to `survivethehaze.netlify.app`
- points ranked API calls at the Cloudflare Worker
- injects the responsive Desktop/Mobile How to Play guide

There is no browser-side Base64 loader and no `atob()` bootstrap.

## Controls

The in-game **How to Play** screen now documents both modes.

**Desktop:** WASD move, mouse look/aim, left click attack, Shift sprint, 1–5 or wheel select weapon, R cycle weapon, Esc pause.

**Mobile:** left stick move, right-side drag look/aim, Attack strike, Sprint run, Weapon switch, Ⅱ pause, landscape recommended.

Control mode is detected automatically and can be overridden in Settings.

## Ranked protocol

1. The client obtains a ranked run from `POST /api/run/start` before gameplay.
2. Cloudflare stores a single-use opaque run ID and server start timestamp.
3. The client records bounded kill and wave-split proof events.
4. Victory immediately calls `POST /api/run/complete`; the server freezes elapsed time, validates all six waves, derives score itself, and creates a completion proof.
5. The player enters a display name after the clock has stopped.
6. `POST /api/run/finish` consumes that proof and stores only a faster personal best.

Ranking order is fastest time, then higher server-derived score, then earlier achievement. The public board returns the Top 10. Exact ranks are calculated inside the cached Top 100; players below that receive `100+` to avoid expensive full-table scans.

This is pragmatic anti-cheat for a downloadable browser game rather than server-authoritative combat. It blocks trivial timer edits, client-supplied scores, one-request fake wins, token replay, timing-after-victory, malformed six-wave proofs, and casual automated spam.

## Fullscreen and mobile

Browsers require a user gesture before fullscreen. HAZE therefore opens with **Enter Fullscreen**, which requests fullscreen, landscape orientation where supported, and a screen wake lock. A Fullscreen control remains in Settings, and portrait phones retain the rotate-device fallback.

## Privacy and storage

Persistent leaderboard records contain only an anonymous browser ID, chosen display name, best verified time, server-derived score, kills, season, and achievement timestamp. Raw IP addresses are not stored. Old run records are removed after 24 hours. Display names are Unicode-normalized and reject unsafe control, bidi, private-use, surrogate, and unassigned characters.

## Repository layout

```text
public/
  index.html             authored single-file HAZE game
  how-to-play.css        responsive Desktop/Mobile guide
  how-to-play.js         guide content
  manifest.webmanifest
  _headers
  assets/                icons / social art
netlify-proxy/
  _redirects             all paths → Cloudflare origin, 200 rewrite
src/
  entry.js               public Netlify-origin CORS/hostname adapter
  protocol.js            ranked proof + name validation
  worker.js              API + SQLite Durable Object
test/
  protocol.test.js       anti-cheat / quota tests
  public-origin.test.js  Netlify/Cloudflare architecture regression tests
.github/workflows/
  verify.yml             build + browser-realistic production smoke test
build.mjs                deterministic production build
netlify.toml             publishes only netlify-proxy/
wrangler.jsonc           Cloudflare Worker/assets/DO configuration
```

## Verification

```bash
npm ci
npm run check
```

CI additionally tests the live production flow with real browser-style headers. It verifies that:

- Cloudflare and Netlify return identical production HTML
- Desktop and Mobile How to Play assets are live
- the obsolete `atob()` loader is absent
- Netlify-origin CORS preflight succeeds
- `/api/config` and `/api/leaderboard` succeed
- `POST /api/run/start` succeeds with `Origin: https://survivethehaze.netlify.app`
- both hostnames report the same season and protection mode

## Turnstile

Turnstile is optional on top of verified-run protection. When `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` are configured, `/api/config` reports `turnstile+verified-run`. The public-origin adapter normalizes the Netlify hostname for server-side Turnstile hostname validation. Without Turnstile, server timing, proof validation, single-use completion tokens, validation, and rate limiting remain active.

## Public repository

Browser game code is inspectable by players regardless of repository visibility, while authoritative leaderboard state and validation live on Cloudflare. No production credential is intentionally kept in the current `main` tree.

Public visibility does **not** grant reuse rights. No reuse license has been granted for HAZE.

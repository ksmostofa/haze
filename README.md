# HAZE

A first-person Three.js survival game. Clear six waves before dawn and compete for the fastest verified global time.

**Play:** <https://survivethehaze.netlify.app>

**Cloudflare origin/API:** <https://haze.ksmostofa576.workers.dev>

## Architecture

HAZE has one application, one frontend build, one API, and one leaderboard:

```text
GitHub canonical source
          ↓
Cloudflare Worker + Static Assets + SQLite Durable Object
          ↑
Netlify 200 reverse proxy (public hostname only)
          ↑
https://survivethehaze.netlify.app
```

- **GitHub** is the canonical source.
- **Cloudflare** builds and serves the real frontend, API, ranked validation, and global leaderboard.
- **Netlify** publishes only a tiny reverse-proxy shell. It does not keep a second HAZE frontend, function, database, or leaderboard.
- The public address stays `survivethehaze.netlify.app`; Netlify transparently fetches the same Cloudflare application behind it.
- The browser always uses relative same-origin `/api/*` URLs. On the Netlify hostname those requests are reverse-proxied to the same Cloudflare Worker, so there is no second API client and no browser CORS dependency.
- `src/entry.js` normalizes the proxied Netlify request URL before the one backend performs origin and optional Turnstile hostname validation.

## Game delivery

The authored game remains one real source file:

```text
public/index.html
```

The production pipeline is deterministic:

```text
public/index.html
    ↓ build.mjs
one adaptive production HTML
    ↓ optimize.mjs
pooled / allocation-light production HTML
    ↓
Cloudflare Static Assets
```

The build also:

- self-hosts pinned Three.js at `/vendor/three.min.js`
- sets the public canonical/social hostname to `survivethehaze.netlify.app`
- keeps ranked API calls relative as `/api/*`
- injects the responsive Desktop/Mobile How to Play guide
- rejects obsolete Base64/debug loaders during verification

There is no browser-side Base64 loader and no `atob()` bootstrap.

## Performance

HAZE uses one adaptive frontend rather than separate desktop/mobile versions.

On touch or lower-resource hardware the production build automatically reduces only expensive rendering work while preserving gameplay, enemy stats, hit volumes, waves, controls, and ranked logic:

- lower render pixel ratio
- antialiasing disabled on low-power mode
- expensive realtime shadows disabled on low-power mode
- reduced ground/forest/grass/particle/rain density
- reduced enemy primitive tessellation while preserving silhouettes
- adaptive render resolution when sustained frame rate drops

The hot gameplay path is also allocation-light:

- player movement no longer creates temporary vectors every frame
- cabin collision sweeps avoid temporary arrays
- enemy doorway routing reuses a scratch route instead of allocating objects/closures per enemy per frame
- wave counts avoid temporary filtered arrays
- hit particles and shock rings use a reusable pool instead of allocating GPU/JS resources for every strike
- unique enemy geometries are explicitly released after death/restart/title cleanup

These changes target both sustained GPU load and periodic garbage-collection/GPU-driver hitches.

## Controls

The in-game **How to Play** screen documents both modes.

**Desktop:** WASD move, mouse look/aim, left click attack, Shift sprint, 1–5 or wheel select weapon, R cycle weapon, Esc pause.

**Mobile:** left stick move, right-side drag look/aim, Attack strike, Sprint run, Weapon switch, Ⅱ pause, landscape recommended.

Control mode is detected automatically and can be overridden in Settings.

## Fullscreen and mobile

Browsers require a user gesture before fullscreen. HAZE therefore opens with **Enter Fullscreen**, which requests fullscreen, landscape orientation where supported, and a screen wake lock. A Fullscreen control remains in Settings, and portrait phones retain the rotate-device fallback.

## Ranked protocol

1. The client obtains a ranked run from `POST /api/run/start` before gameplay.
2. Cloudflare stores a single-use opaque run ID and server start timestamp.
3. The client records bounded kill and wave-split proof events.
4. Victory immediately calls `POST /api/run/complete`; the server freezes elapsed time, validates all six waves, derives score itself, and creates a completion proof.
5. The player enters a display name after the clock has stopped.
6. `POST /api/run/finish` consumes that proof and stores only a faster personal best.

Ranking order is fastest time, then higher server-derived score, then earlier achievement. The public board returns the Top 10. Exact ranks are calculated inside the cached Top 100; players below that receive `100+` to avoid expensive full-table scans.

This is pragmatic anti-cheat for a downloadable browser game rather than server-authoritative combat. It blocks trivial timer edits, client-supplied scores, one-request fake wins, token replay, timing-after-victory, malformed six-wave proofs, and casual automated spam.

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
  _redirects             all public paths → Cloudflare, 200 rewrite
  _headers               prevent a stale public HTML shell
src/
  entry.js               Netlify proxy-origin request normalizer
  protocol.js            ranked proof + name validation
  worker.js              API + SQLite Durable Object
test/
  protocol.test.js       anti-cheat / quota tests
  public-origin.test.js  single-app/proxy architecture regression tests
.github/workflows/
  verify.yml             build + production smoke test
build.mjs                deterministic adaptive production build
optimize.mjs             pooled FX / low-device geometry / GPU cleanup
netlify.toml              publishes only netlify-proxy/
package.json
package-lock.json
wrangler.jsonc            Cloudflare Worker/assets/DO configuration
```

## Verification

```bash
npm ci
npm run check
```

Permanent CI additionally verifies both production hostnames. It requires the live HTML to contain the adaptive render profile, allocation-light movement/routing, pooled impact FX, and enemy GPU cleanup. It also verifies:

- Cloudflare and Netlify return identical production HTML
- both responses force revalidation rather than allowing a stale game shell
- Desktop and Mobile How to Play assets are live
- the obsolete `atob()`/debug loaders are absent
- the browser client contains no separate `API_ORIGIN`
- `/api/config` and `/api/leaderboard` succeed through each visible hostname
- `POST /api/run/start` succeeds through each visible hostname with its real browser `Origin`
- both hostnames report the same season and protection mode

The production/runtime npm dependency audit is currently clean. Development test tooling is pinned to a patched Vitest release.

## Turnstile

Turnstile is optional on top of verified-run protection. When `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` are configured, `/api/config` reports `turnstile+verified-run`. The Netlify request normalizer preserves public-hostname validation for this flow. Without Turnstile, server timing, proof validation, single-use completion tokens, validation, and rate limiting remain active.

## Public repository

Browser game code is inspectable by players regardless of repository visibility, while authoritative leaderboard state and validation live on Cloudflare. No production credential is intentionally kept in the current `main` tree.

Public visibility does **not** grant reuse rights. No reuse license has been granted for HAZE.

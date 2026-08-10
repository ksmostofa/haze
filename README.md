# HAZE

Three.js browser survival game with fullscreen entry, mobile landscape handling, and a global Cloudflare D1 fastest-time leaderboard.

## Stack

- GitHub → Cloudflare Pages
- Pages Functions → leaderboard API
- Cloudflare D1 → global best runs
- Cloudflare Turnstile → submission protection
- Anonymous browser UUID → no login/signup
- Server-signed run token + server clock → basic anti-cheat

## Cloudflare setup

### 1. Create the Pages project

Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → connect `ksmostofa/haze`.

Use:

```text
Production branch: main
Framework preset:  None
Build command:     exit 0
Output directory:  .
Root directory:    /
```

Only `/api/*` is routed through Pages Functions; the game/payload remains static.

### 2. Create D1

Create a D1 database named, for example:

```text
haze-leaderboard
```

Run the contents of `schema.sql` in its console.

Then in the HAZE Pages project add a D1 binding:

```text
Variable name: DB
Database: haze-leaderboard
```

### 3. Create Turnstile

Cloudflare Dashboard → **Turnstile** → create a Managed widget.

Add your Pages hostname (and custom domain later if used).

### 4. Set Pages variables/secrets

Pages project → **Settings → Variables and Secrets**:

```text
TURNSTILE_SITE_KEY = <public site key>
TURNSTILE_SECRET   = <secret key>
RUN_SIGNING_SECRET = <long random secret>
```

Generate a signing secret locally with:

```bash
openssl rand -hex 32
```

Redeploy after adding the binding/secrets.

## Leaderboard behavior

- Only successful six-wave clears can submit.
- One best run is stored per anonymous browser/player ID.
- Ranking: **fastest time → higher score → more kills**.
- Top 10 is shown globally; the current player can also see their own rank/best.
- Display name is entered after winning and remembered locally.
- Current game build expects **69 total kills** for a completed run.
- Official ranked time is based on the server-issued run start and submission time; pausing does not stop the ranked clock.

## API

```text
POST /api/run/start
POST /api/run/finish
GET  /api/leaderboard?playerId=...
GET  /api/config
```

## Security model

The leaderboard uses:

- HMAC-signed ranked-run tokens
- server-side elapsed-time calculation
- build/player validation
- score/kill sanity checks
- server-side Turnstile validation
- D1 parameterized queries
- one-best-run-per-player storage

This blocks simple `GS.time = 1`/fake-request cheating and bot spam, but it is intentionally not a fully server-authoritative anti-cheat system; gameplay still runs client-side.

## Fullscreen/mobile

The game presents an `ENTER` gate on load. That click/tap is used to request fullscreen and landscape orientation where the browser supports it. The existing rotate-device fallback remains available where orientation locking is unavailable. A Fullscreen control is also available from Settings.

`manifest.webmanifest` also declares fullscreen/landscape behavior for installed/PWA launches.

## Repository layout

```text
index.html                  # tiny static loader
assets/game.*.b64           # compressed HAZE game payload
manifest.webmanifest
_routes.json
_headers
schema.sql
functions/
  api/
    config.js
    leaderboard.js
    run/
      start.js
      finish.js
```

The payload split exists only because this ChatGPT harness cannot upload the original ~158 KB HTML file to GitHub as one mounted file. It is reconstructed entirely in the browser from static assets and does **not** consume Pages Functions requests. When normal local Git/Codex access is available, it can be consolidated back into a single `index.html` without changing the Cloudflare architecture.

# HAZE

A first-person browser survival game built with Three.js. Survive six waves, reach dawn, and compete for the fastest global completion time.

**Play:** `https://haze.ksmostofa576.workers.dev`

## Features

- First-person melee survival gameplay
- Desktop + touch controls
- Fullscreen entry and landscape-first mobile play
- Six waves, multiple weapons, shelter healing, score and kills
- Global fastest-time leaderboard
- Anonymous player identity — no signup required
- Personal best + global rank
- Server-timed ranked runs with lightweight anti-cheat
- Automatic GitHub → Cloudflare deployment

## Stack

- **Game:** single-file Three.js HTML build
- **Hosting/API:** Cloudflare Workers + Static Assets
- **Leaderboard storage:** Cloudflare SQLite Durable Object
- **Source/deploy:** GitHub → Cloudflare Workers Builds
- **Cost target:** Cloudflare Free plan

No Firebase, Supabase, VPS, external database, login provider, or paid backend is required.

## Ranked runs

Only successful six-wave clears can enter the leaderboard.

Ranking order:

1. Fastest completion time
2. Higher score
3. More kills

Flow:

1. `POST /api/run/start` creates a server-timed ranked run.
2. `POST /api/run/complete` freezes the official time immediately when Wave 6 is cleared.
3. The player enters a display name.
4. `POST /api/run/finish` validates the stored completion proof and writes the result.
5. Only that anonymous player's best run is retained.

The official leaderboard clock is independent of the editable client-side `GS.time` value.

## Repository layout

```text
source/
  game.html.gz.b64   # compressed transport copy of the single-file game source
src/
  worker.js          # API + SQLite Durable Object
build.mjs            # verifies/decompresses source → dist/index.html
manifest.webmanifest
package.json
wrangler.jsonc       # Cloudflare Worker, assets, DO binding + migration
README.md
```

`build.mjs` runs during deployment and produces:

```text
dist/
  index.html
  manifest.webmanifest
```

Players therefore receive a normal **single `index.html`**. There is no browser-side Base64/`atob()` loader.

The compressed `source/game.html.gz.b64` exists only because the connected publishing interface cannot reliably send the ~158 KB HTML source in one GitHub write. It is a source-transport detail, not part of the player-facing runtime.

## Cloudflare deployment

The repository is configured for the existing `haze` Worker. Cloudflare runs:

```bash
npx wrangler deploy
```

Wrangler then:

1. runs `node build.mjs`
2. verifies the game build markers
3. emits `dist/index.html`
4. uploads only `dist/` as static assets
5. deploys `src/worker.js`
6. provisions/binds the SQLite-backed `Leaderboard` Durable Object

Public URL:

```text
https://haze.ksmostofa576.workers.dev
```

No D1 database ID, external database, or production secret is required by the current architecture.

## API

```text
POST /api/run/start
POST /api/run/complete
POST /api/run/finish
GET  /api/leaderboard?playerId=...
GET  /api/config
```

The leaderboard is fetched only when opened or after submission; it is not continuously polled.

## Security model

Ranked submissions use:

- server-created opaque run tokens
- server-calculated elapsed time
- server-stored completion proofs
- build/player validation
- expected 69-kill clear validation
- score sanity checks
- per-player + per-IP rate limiting
- one-best-run-per-player storage
- parameterized SQLite queries

This blocks trivial timer edits and forged one-request submissions. HAZE remains a client-side browser game, so this is pragmatic anti-cheat rather than fully server-authoritative gameplay.

## Privacy

Persistent leaderboard records contain only:

- anonymous browser player ID
- chosen display name
- best completion time
- score
- kills
- update timestamp

No email, password, or account is required. Raw IP addresses are not stored; a short-lived daily hash is used only for abuse rate limiting.

## Public repository

The repository can safely remain public. Browser game code is downloadable by players regardless of repository visibility, and the production architecture commits no credentials or private signing keys.

Public visibility does **not** grant an open-source license. No reuse license has been granted for HAZE at this time.

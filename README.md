# HAZE

A first-person browser survival game built with Three.js. Survive six waves, reach dawn, and compete for the fastest global completion time.

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

1. `/api/run/start` creates a server-timed ranked run.
2. `/api/run/complete` freezes the official time immediately when Wave 6 is cleared.
3. The player enters a display name.
4. `/api/run/finish` validates the completion proof and stores the result.
5. Only that anonymous player's best run is retained on the leaderboard.

The official leaderboard clock is independent of the editable client-side `GS.time` value.

## Repository

```text
assets/game.*.b64   # source transport chunks for the game HTML
build.mjs           # reconstructs the real single-file game at build time
manifest.webmanifest
package.json
src/worker.js       # API + SQLite Durable Object
wrangler.jsonc      # Cloudflare deployment configuration
README.md
```

`build.mjs` reconstructs the game **during Cloudflare's build**, producing:

```text
dist/
  index.html
  manifest.webmanifest
```

Players therefore receive a normal single `index.html`. There is no browser-side Base64/`atob()` loader.

The source chunks only exist because the connected publishing interface could not upload the ~158 KB HTML source in one write. They are not deployed as public game assets.

## Cloudflare deployment

The repository is configured for the existing `haze` Worker.

Cloudflare runs:

```bash
npx wrangler deploy
```

Wrangler reads `wrangler.jsonc`, runs `node build.mjs`, uploads only `dist/` as static assets, deploys `src/worker.js`, and provisions the SQLite Durable Object binding used by the leaderboard.

Public URL:

```text
https://haze.ksmostofa576.workers.dev
```

No D1 database ID or secret is required for the current architecture.

## API

```text
POST /api/run/start
POST /api/run/complete
POST /api/run/finish
GET  /api/leaderboard
GET  /api/config
```

The public leaderboard is fetched only when needed; it is not continuously polled.

## Security model

Ranked submissions use:

- server-created opaque run tokens
- server-calculated elapsed time
- completion proof stored server-side
- build/player validation
- 69-kill victory validation
- score sanity checks
- per-player and per-IP rate limiting
- one-best-run-per-player storage
- parameterized SQLite queries

HAZE is still a client-side browser game, so this is pragmatic anti-cheat rather than a fully server-authoritative game simulation.

## Privacy

Persistent leaderboard records contain only:

- anonymous browser player ID
- chosen display name
- best completion time
- score
- kills
- update timestamp

No email, password, or account is required. IP addresses are not stored; a short-lived daily hash is used only for abuse rate limiting.

## Public repository

The repository can safely remain public. Browser game code is downloadable by every player regardless of repository visibility, and the production architecture commits no credentials or signing secrets.

Public visibility does **not** grant an open-source license. No reuse license has been granted for HAZE at this time.

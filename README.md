# HAZE

A first-person browser survival game built with Three.js. Survive six waves, reach dawn, and compete for the fastest global completion time.

## Features

- First-person melee survival gameplay
- Desktop and touch controls
- Fullscreen entry and landscape-first mobile play
- Six-wave run with score, kills, health, shelter, and multiple weapons
- Global fastest-time leaderboard
- Anonymous player identity — no account required
- Personal best and global rank
- Cloudflare-backed ranked-run verification

## Stack

- **Frontend:** single `index.html` + Three.js
- **Hosting:** Cloudflare Pages
- **API:** Cloudflare Pages Functions
- **Database:** Cloudflare D1
- **Verification:** Cloudflare Turnstile
- **Source / deploy:** GitHub → Cloudflare Pages

## Ranked runs

Only completed runs enter the leaderboard.

Ranking order:

1. Fastest completion time
2. Higher score
3. More kills

The official timer is server-backed:

1. `/api/run/start` issues a signed run token when the run starts.
2. `/api/run/complete` freezes the official time immediately when the final wave is cleared.
3. The player enters a display name and passes Turnstile.
4. `/api/run/finish` validates the signed completion proof and saves the best run to D1.

The leaderboard stores only each anonymous player's best result.

## Repository

```text
index.html
manifest.webmanifest
_headers
_routes.json
schema.sql
.gitignore
functions/
  api/
    config.js
    leaderboard.js
    run/
      start.js
      complete.js
      finish.js
```

The game itself remains a **single HTML file**. Only the leaderboard backend lives in separate Cloudflare Function files.

## Cloudflare configuration

Create a Pages project connected to this repository and use:

```text
Production branch: main
Framework preset:  None
Build command:     exit 0
Output directory:  .
```

Create a D1 database and apply `schema.sql`, then bind it as:

```text
DB
```

Configure these production variables/secrets in Cloudflare:

```text
TURNSTILE_SITE_KEY
TURNSTILE_SECRET
RUN_SIGNING_SECRET
```

Never commit the two secrets to GitHub.

## Security model

Ranked submissions use:

- HMAC-signed run and completion proofs
- server-side elapsed-time calculation
- build/player validation
- score and kill sanity checks
- server-side Turnstile verification
- parameterized D1 queries
- one-best-run-per-player storage

HAZE is still a client-side browser game, so this is pragmatic anti-cheat rather than a fully server-authoritative simulation.

## Privacy

Leaderboard records contain only:

- anonymous browser player ID
- chosen display name
- best completion time
- score
- kills
- update timestamp

No login, password, or email is required.

## License

No open-source license has been granted for this repository at this time.

# HAZE

A first-person Three.js survival game. Clear six waves before dawn and compete for the fastest verified time.

**Production:** <https://haze.ksmostofa576.workers.dev>

## Production stack

- Cloudflare Worker Static Assets for the game
- One SQLite Durable Object for runs and leaderboard records
- Optional Cloudflare Turnstile, enabled only when both secrets are configured
- GitHub as source of truth; Cloudflare Workers Builds deploys `main`
- Self-hosted, pinned Three.js dependency

This is deliberately one free platform, one deploy, and one database. Convex, Supabase, Vercel, Netlify Functions, Firebase, Redis, a VPS, and user accounts would add cost or failure modes without improving this game.

## Ranked protocol

1. The client waits for `POST /api/run/start` before gameplay begins.
2. The server stores a single-use, opaque run ID and start timestamp.
3. The client records bounded kill and wave-split events while playing.
4. Victory immediately calls `POST /api/run/complete`; the server freezes elapsed time, validates the six-wave proof, derives score itself, and stores a proof hash.
5. Name entry and Turnstile happen after the clock has stopped.
6. `POST /api/run/finish` atomically consumes the completed run and inserts or updates only a faster personal best.

Ranking is fastest time, then higher server-derived score, then earlier achievement. The public API returns the Top 10. Exact ranks are computed only inside the cached Top 100; everyone else receives `100+`. There is no quota-destroying `COUNT(*)` rank scan.

This is pragmatic anti-cheat for a downloadable browser game, not a claim of server-authoritative combat. It blocks trivial one-request fake wins, client-supplied scores, token replay, timing-after-victory, malformed proofs, and casual automated spam. Determined attackers can still modify the client and synthesize a plausible event stream.

## Privacy and storage

Persistent leaderboard data is limited to an anonymous browser ID, chosen display name, time, score, kills, season, and achievement timestamp. Raw IP addresses are never stored. In-memory rate limiting uses a daily truncated hash and naturally expires when the Durable Object is evicted.

Old incomplete/completed runs are deleted after 24 hours. Completed tokens are single-use. Display names are NFKC-normalized, limited by Unicode code points, and reject control, bidi, private-use, surrogate, and unassigned characters.

## Local verification

```bash
npm ci
npm run check
npm run dev
```

`npm run check` validates the Worker syntax, production asset markers, absence of debug/CDN loaders, and the ranked protocol tests.

## Repository layout

```text
public/                 game source, manifest, static headers
src/protocol.js         pure ranked-proof validation
src/worker.js           API and SQLite Durable Object
test/protocol.test.js   anti-cheat and quota regression tests
build.mjs               deterministic public/ → dist/ build
wrangler.jsonc          Worker, assets, observability, and DO binding
```

## Turnstile

Set both values in Cloudflare for production protection:

- `TURNSTILE_SITE_KEY` as a Worker variable
- `TURNSTILE_SECRET` as a Worker secret

The server validates Turnstile success plus the exact `haze_score` action, request hostname, and completion-token `cdata`. If either setting is absent, ranked proof validation still runs and `/api/config` reports `verified-run` instead of `turnstile+verified-run`.

## Fullscreen behavior

Browsers prohibit fullscreen without a user gesture. HAZE therefore uses a single explicit **Enter Fullscreen** gate, which requests fullscreen, landscape orientation where supported, and a screen wake lock. A separate fullscreen control remains available if the browser rejects the initial request.

## License

The repository is public for deployment transparency. No reuse license is granted.

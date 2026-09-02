# HAZE asset and audio plan

Status: implemented on the isolated `perf/zombie-rig-audio` review worktree. The `main` branch and production deployment are unchanged.

## Project constraints

- The game is authored primarily in [`public/index.html`](../../public/index.html): procedural environment, custom zombie meshes, and a procedural Web Audio mixer.
- Collision and navigation depend on the existing `CABIN_BOXES`, `CABIN_WALLS`, and `obstacles` data. Imported art must remain visual-only unless collision is explicitly reviewed.
- `build.mjs` copies `public/` into `dist/`; runtime assets therefore live under `public/assets/` and must be same-origin. The current CSP permits `media-src 'self'`.
- Keep the existing `Audio` API, `gameBus`, pause/resume behavior, and cabin occlusion. Add sample playback behind those methods rather than creating a second event system.
- Keep the existing procedural path as a fallback. A missing or late asset must never block the game loop or prevent a run from starting.

## Ranked environment sources

1. **Quaternius Stylized Nature MegaKit** — [official page](https://quaternius.com/packs/stylizednaturemegakit.html). 116 low-poly nature models in glTF/FBX/OBJ, CC0. Best visual match for HAZE. Use a small subset: dead trees, shrubs, ferns, rocks, roots, and a few silhouette trees.
2. **Kenney Nature Kit** — [official page](https://kenney.nl/assets/nature-kit). 330 models, CC0. Use for rocks, stumps, branches, and ground clutter where Quaternius does not provide a useful variant.
3. **Kenney Graveyard Kit** — [official page](https://kenney.nl/assets/graveyard-kit). 90 spooky/horror models with animation support, CC0. Use sparingly for readable landmarks such as broken markers, fences, skulls, and a few props near the cabin.
4. **Poly Haven** — [models](https://polyhaven.com/models), [license](https://polyhaven.com/license). High-quality CC0 assets, but generally more realistic and heavier. Reserve for one or two hero props or baked textures, not forest crowds.

Implementation rule: do not replace the generated forest wall or cabin. Add a curated visual dressing pass using instancing, merged static geometry, or pooled clones. Preserve current object placement and collision radii.

## Ranked audio sources

1. **Sonniss GDC Game Audio Bundle 2026** — [download](https://gdc.sonniss.com/), [license](https://sonniss.com/gdc-bundle-license/). High-quality royalty-free material with commercial game use. Select only a few suitable files; never ship the multi-gigabyte bundle.
2. **Kenney RPG Audio** — [official page](https://kenney.nl/assets/rpg-audio). Small CC0 set covering foley, footsteps, and weapons.
3. **Kenney Impact Sounds** — [official page](https://kenney.nl/assets/impact-sounds). CC0 impact variations for hit feedback and props.
4. **OpenGameArt Zombies Sound Pack** — [page](https://lpc.opengameart.org/content/zombies-sound-pack). CC0 zombie vocal WAVs.
5. **OpenGameArt Zomby SFX Pack** — [page](https://opengameart.org/content/zomby-sfx-pack). CC0 zombie calls; useful as rare randomized variants.
6. **OpenGameArt Forest Ambience** — [page](https://opengameart.org/content/forest-ambience). CC0 seamless forest loop.
7. **OpenGameArt 20 Sword Sound Effects** — [page](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes). CC0 attack and clash variations.
8. **OpenGameArt Player Hit / Hurt Sound Effects** — [damage cue](https://opengameart.org/content/player-hit-damage), [hurt set](https://opengameart.org/content/hurt-sound-effects). CC0 player damage and vocal cues.

Use only files whose individual license is recorded in a local manifest. Do not hotlink Freesound or ZapSplat files; their upload licenses vary or may require attribution.

## Runtime design

### Environment

- Add `public/assets/environment/` with only selected, optimized files and a `SOURCE.md`/license manifest.
- Load one environment bundle during the loading screen, with a timeout and procedural fallback.
- Build a small set of shared geometries/materials. Instance repeated rocks, grass clumps, and deadwood; merge static prop batches where appropriate.
- Use low-cost materials consistent with the existing storm palette. No new per-prop lights.
- Keep imported props outside `obstacles` unless their collision is deliberately added and tested.
- Add distance tiers: full prop near the player, simplified/merged prop at mid distance, generated silhouette or nothing at far distance.

### Audio

- Add `public/assets/audio/` and a manifest with file, source URL, license, duration, and intended event.
- Decode a small bank after the first user gesture. Do not fetch or decode inside combat or `animate()`.
- Route playback through current methods:
  - `weaponSwing` → randomized sword whoosh
  - `hit` → randomized impact
  - `kill` → death/organic impact accent
  - `hurt` → player damage vocal
  - `groan` → distance-attenuated, panned zombie vocal
  - `step` → throttled footsteps
  - `tick`/night events → forest loop, insects, distant calls, rain, thunder, and creaks
- Keep procedural Web Audio as a fallback and preserve `cabinSoundOccluded` for zombie voices.
- Use a small voice pool, per-event cooldowns, random pitch/gain, and the existing limiter so large waves cannot create an audio spike.

## Performance and acceptance gates

- First pass target: no more than 2.5 MB additional compressed environment assets and 3 MB audio shipped to the browser.
- No per-frame allocations, network requests, texture decoding, or model cloning in the hot loop.
- No new dynamic shadow casters for crowd props; retain existing adaptive low-end profile.
- Run `npm run check` in the isolated worktree.
- Compare baseline and asset branch on desktop and a low-end mobile profile: startup, looking around, sprinting, entering the cabin, six-wave combat, and dense zombie scenes.
- Acceptance requires unchanged controls, collision, HUD, weapons, zombie behavior, leaderboard flow, and production build markers. Any regression removes the asset from the branch instead of weakening gameplay.

## Implementation completed

1. Imported and documented a small Kenney environment subset. The loader/fallback keeps generated collision and navigation authoritative.
2. Added a local ambience loop and small sword, impact, hurt, zombie, footsteps, and creak banks through the existing `Audio` mixer.
3. Added randomized variation, spatial pan, cooldowns, decode-after-gesture, and procedural fallbacks.
4. Added a build guard for the loader and audio manifest, then ran the build, tests, desktop smoke test, and landscape mobile smoke test.
5. The branch is intentionally stopped for review. Do not merge or deploy production without explicit approval.

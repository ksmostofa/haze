# HAZE zombie visual variation and crowd-performance research

Date: 2026-09-03

Scope: explain why the current isolated build shows repeated zombie bodies and define a safe, industry-aligned way to add visual variety without bringing back the asset-parse stutters. This is research only. It does not change game code, merge branches, or deploy production.

## Short conclusion

Randomly choosing from the same two meshes is not enough. Independent random selection can still produce three or four identical silhouettes in a row, and it does nothing about synchronized animation. The safe fix is a **visual-identity layer separate from gameplay stats**:

```text
gameplay variant (HP/speed/damage/proof)
        + deterministic shuffle bag / active-neighbor no-repeat
        + shared dark palette/material signature
        + per-enemy animation phase and small time-scale offset
        ↓
visual identity (body rig, palette, clip phase)
```

Start with the two already-loaded Polyart rigs and make them look like a deliberately varied group. Then, if the result still reads as repetitive, preload a measured set of additional body rigs before the first wave and pool their clones. Do not load or parse a new model from `spawnEnemy()` or from the render loop.

## What is happening in this branch

- `spawnEnemy()` cycles ten gameplay variants, but `POLYART.visualVariant()` maps variants `0–4` to `ZombieFemale_A` and `5–9` to `ZombieMale_A`.
- The result is ten different stat identities but only two visible meshes. The current loader intentionally does this to avoid the old mid-game fallback/parser hitch.
- Every clone starts its mixer at time zero and uses the same small set of locomotion clips. Even when the bodies differ, synchronized footfalls make a group look duplicated.
- The repository contains ten body files (`A–E` for female and male), all using one material and the shared `zcolors.png` UV layout. The ten `.bin` body payloads total about 2.8 MB in this worktree; loading all ten would add bytes and main-thread parsing work, so it should be measured rather than assumed safe on low-end devices.
- `SkeletonUtils.clone()` currently reuses geometry and materials. Mutating a material per enemy would therefore either recolor every clone or force unnecessary material duplication; palette choices should be a small shared pool.

## Industry/engine evidence

### Three.js: cache the source, clone the skeleton correctly

- [`GLTFLoader`](https://threejs.org/docs/pages/GLTFLoader.html) returns a scene plus `AnimationClip` objects and supports delivery extensions such as Draco, Meshopt, KTX2, and WebP. Load and parse these assets during a controlled warm-up, not on a combat edge.
- [`SkeletonUtils.clone`](https://threejs.org/docs/pages/module-SkeletonUtils.html) is the supported clone path for skinned hierarchies: bones are cloned and correctly associated, while geometries and materials are reused by reference. This is exactly the desired cache/pool boundary for HAZE.
- [`AnimationMixer`](https://threejs.org/docs/pages/AnimationMixer.html) provides `setTime()` and `timeScale`; those are cheap ways to give clones different starting phases and slightly different gait speeds without another mesh or texture. The mixer still has to be updated from the render loop.
- [`AnimationObjectGroup`](https://threejs.org/docs/pages/AnimationObjectGroup.html) can share animation state among objects, but only when their animated properties are compatible. This is useful for a future crowd tier, not a reason to mix unrelated skeletons into one group.
- [`InstancedMesh`](https://threejs.org/docs/pages/InstancedMesh.html) reduces draw calls when many objects share geometry/material and differ by transforms. Applying it directly to independently skinned zombies is not a drop-in replacement: each character needs its own animated bone pose (an inference from the InstancedMesh contract and SkinnedMesh model). Use it later for impostor quads or rigid far silhouettes, not for the current hero rigs.
- [`LOD`](https://threejs.org/docs/pages/LOD.html) supports distance levels and a hysteresis fraction specifically to avoid rapid switching at boundaries. If HAZE later adds an impostor/far tier, use separate enter/exit thresholds rather than swapping exactly at one distance.
- Three.js's [texture guidance](https://threejs.org/manual/en/textures.html) notes that textures load asynchronously so rendering can begin before an image finishes, and that an atlas is generally more performant than many materials. Keep one dark atlas/palette texture and a few shared material signatures instead of one texture per zombie.

### Unreal: share animation work and randomize playback

- Epic's [Animation Sharing Plugin](https://dev.epicgames.com/documentation/unreal-engine/animation-sharing-plugin-in-unreal-engine?lang=en-US) evaluates an animation once and distributes poses to many characters. It explicitly supports playback-position randomization, blend transitions, and significance thresholds. The portable lesson for HAZE is to share clips/poses wherever skeletons are compatible, then randomize phase and limit blends for insignificant/distant enemies.
- Epic's [Animation Budget Allocator](https://dev.epicgames.com/documentation/unreal-engine/animation-budget-allocator) keeps animation work inside a fixed CPU budget by lowering update rates and optionally interpolating. If HAZE ever grows beyond the current six-enemy waves, update distant mixers less often (with interpolation or held poses) before adding more geometry.

### Unity: pool before gameplay, not during it

- Unity's official [object-pooling guidance](https://learn.unity.com/tutorial/use-object-pooling-to-boost-performance-of-c-scripts-in-unity?version=6.0) says to pre-instantiate during a loading screen, deactivate unused objects, and reuse them. The stated purpose is avoiding repetitive allocation/destruction and garbage-collection spikes that cause stutter.
- Unity's [LOD documentation](https://docs.unity3d.com/es/current/Manual/LevelOfDetail.html) describes progressively cheaper meshes at distance; its older LOD Group docs also describe cross-fading to make transitions less noticeable. The visual principle applies even though HAZE uses Three.js.

### Browser scheduling: optional work must yield

- [`requestIdleCallback`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback) is intended for low-priority work during idle periods and exposes a remaining-time budget, but MDN marks it as limited-availability and recommends a timeout. It is suitable for optional background prefetch or preparation only; it is not a guarantee that a GLTF parse will be invisible. Required rigs must be ready before the first spawn.

## Recommended plan for HAZE

### Phase 1 — safe variance with the current two rigs

1. Add a `visualId`/visual descriptor that is independent of the ten gameplay variants. Keep HP, speed, damage, score, wave accounting, and proof data exactly where they are.
2. Build a deterministic shuffle bag of the currently available visual identities (`female_A`, `male_A`) with a random starting offset. When enough identities exist, reject a choice that matches the previous visible enemy or a nearby active enemy. This prevents accidental same-model clusters; pure `Math.random()` does not.
3. Create a very small, shared palette pool (for example: wet charcoal cloth, desaturated moss cloth, and bruised brown cloth) using the existing dark palette map. Reuse each material set across clones. Keep luminance bounded and remove emissive/bright toy colors; palette variation should read as clothing/wound differences under HAZE's moonlight, not as colored skins.
4. On clone creation, set a deterministic mixer start time and a narrow playback-rate range (roughly ±5–8%). Use the existing walk/run/slow-walk clips; do not fetch another clip when an enemy is spawned. Alternate attack direction or idle-alert only after those clips have been preloaded and measured.
5. Keep the current hidden-emergence path and the gameplay entity authoritative. Visual selection must never alter collision radius, navigation, attack contact, or death timing.

This phase adds no model downloads and should be the first A/B test. It addresses the exact screenshot problem—identical bodies and synchronized motion—without reopening the loader/parser path.

### Phase 2 — measured body-rig expansion

Only if Phase 1 still looks repetitive at the camera's combat distance:

1. Select three or four of the strongest silhouettes from the existing A–E files (not all ten by default). They already share the Polyart texture layout and broadly compatible skeletons, so one clip bank per sex can remain shared after validation.
2. Preload and parse those files before the first wave, behind the existing loader, with progress reporting. Never parse an unready file in `spawnEnemy()` or `animate()`; if a file fails, keep the Phase 1 identities.
3. Warm a bounded pool of `SkeletonUtils.clone()` visual wrappers while the loader is visible. On spawn, take and reset a wrapper; on death, return it after the death pose has finished. Reset action time, weights, root transform, palette assignment, and visibility before reuse.
4. Measure startup, peak memory, first-wave frame time, and a low-end mobile run before adding a fifth or tenth body. The correct limit is the measured budget, not the number of files in the pack.

### Phase 3 — only for larger future crowds

If wave sizes grow materially beyond the current six enemies, add a hybrid distance tier: full skinned rigs for the closest few, then a shared 8-direction animated impostor or GPU-instanced quad for mid/far enemies. Build the impostor frames from the approved dark rig so the silhouette, palette, and animation agree with the close model. Use LOD hysteresis and a shared contact shadow to avoid popping/floating. This is unnecessary for the current wave count and should not be bundled into the first fix.

## Avoid these tempting fixes

- Do not assign a random `visualVariant` on every frame or at every render; it produces flicker and still allows duplicates.
- Do not make all ten model files mandatory just to achieve nominal variety; that trades a screenshot problem for startup/low-end risk.
- Do not clone materials/textures per enemy. `SkeletonUtils` intentionally shares them; use a fixed palette pool or an atlas.
- Do not use a sprite/photo overlay as the near enemy. It will break the authored lighting and look like a card when the player turns.
- Do not hide asset parsing behind `setTimeout` and call it “async.” A parse can still block the main thread; only a measured worker/idle strategy or preloaded cache changes that risk.

## Acceptance gates before implementation/merge

- In a six-enemy wave, no two adjacent/nearby zombies share the same body-plus-palette signature when enough signatures are available.
- Walking zombies have visibly different animation phases and do not march in lockstep; no T-pose, floating feet, or root-motion drift appears.
- Looking around does not trigger network requests, GLTF parsing, texture uploads, or clone/material allocation.
- First-wave frame-time spikes and startup time are no worse than the current isolated baseline on desktop and a low-end mobile profile.
- Gameplay variant, collision, hidden spawn, attack contact, damage/audio timing, death movement, score, proof events, controls, and HUD are unchanged.
- `npm run check` passes; the branch is pushed only for review; production remains untouched until explicit approval.

## Sources

- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)
- [Three.js SkeletonUtils](https://threejs.org/docs/pages/module-SkeletonUtils.html)
- [Three.js AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html)
- [Three.js AnimationObjectGroup](https://threejs.org/docs/pages/AnimationObjectGroup.html)
- [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)
- [Three.js LOD](https://threejs.org/docs/pages/LOD.html)
- [Three.js texture guidance](https://threejs.org/manual/en/textures.html)
- [Epic Animation Sharing Plugin](https://dev.epicgames.com/documentation/unreal-engine/animation-sharing-plugin-in-unreal-engine?lang=en-US)
- [Epic Animation Budget Allocator](https://dev.epicgames.com/documentation/unreal-engine/animation-budget-allocator)
- [Unity object pooling (Unity Learn)](https://learn.unity.com/tutorial/use-object-pooling-to-boost-performance-of-c-scripts-in-unity?version=6.0)
- [Unity LOD](https://docs.unity3d.com/es/current/Manual/LevelOfDetail.html)
- [MDN requestIdleCallback](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback)

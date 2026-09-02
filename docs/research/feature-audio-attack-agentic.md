# HAZE attack, audio, and agentic-change research

Date: 2026-09-02

Scope: implementation guidance for the isolated `perf/zombie-rig-audio` worktree. This note covers attack-contact timing, browser audio loading/playback, and a safe Codex/Git workflow. It does not change game code, merge branches, or deploy production.

## Short recommendation

Keep the existing enemy entity authoritative for movement, collision, cooldowns, and damage. Treat a rig as a visual/input source only:

```text
AI movement and range checks
        ↓
animation state (approach → windup → strike → recovery)
        ↓
clip-time contact marker crossing
        ↓
one guarded damage event + hurt sound
```

Preload and decode local audio into shared `AudioBuffer` objects, then create a fresh source node for each one-shot. Start or resume the `AudioContext` from the existing start-game gesture, and keep the procedural sounds as a fallback when a file is unavailable.

Do the work in a linked worktree, keep the visual, audio, and behavior changes reviewable as separate commits, run the repository checks and a manual browser smoke test there, push only the review branch, and wait for approval before any merge or production deploy.

## 1. Attack animation and damage contact

### What the formats and runtime provide

- `GLTFLoader` exposes a loaded asset's `animations` as `THREE.AnimationClip` objects; a clip is made from keyframe tracks that target node properties ([Three.js `GLTFLoader`](https://threejs.org/docs/pages/GLTFLoader.html), [Three.js animation system](https://threejs.org/manual/en/animation-system.html)).
- A glTF animation channel targets a node and a TRS/property path. `animation.extras` is explicitly application-specific; glTF does not define a standard gameplay “damage frame” event ([Khronos glTF animation](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#animations), [Khronos animation extras](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#reference-animation-extras)). The contact marker should therefore be a small local table (or authored `extras` convention) keyed by clip/variant, not an assumption that every file has the same timing.
- `AnimationMixer.update(deltaTime)` advances all scheduled actions, and `AnimationAction.time` is the action's local clip time. Actions support `LoopOnce`, weights, blend modes, fades, and cross-fades ([`AnimationMixer.update`](https://threejs.org/docs/pages/AnimationMixer.html#method:update), [`AnimationAction.time`](https://threejs.org/docs/pages/AnimationAction.html#property:time), [`AnimationAction` looping/blending](https://threejs.org/docs/pages/AnimationAction.html)).
- `SkeletonUtils.clone()` is the supported way to clone a skinned hierarchy with correctly associated bones; geometries, materials, and textures are reused by reference ([Three.js `SkeletonUtils`](https://github.com/mrdoob/three.js/blob/dev/docs/pages/module-SkeletonUtils.html)).

### Recommended implementation

1. Keep `enemy.position`, the existing capsule/range test, cooldown, and hit points as the gameplay source of truth. The rig's root motion must not move the gameplay entity; if an attack clip contains root/hip translation, remove that track from the attack overlay or counter it on the visual root.
2. Build an explicit state machine per enemy: `approach`, `windup`, `strike`, `recovery`. Enter `windup` while the zombie is still moving when it crosses an alert distance. Continue the locomotion action for the legs; blend an upper-body attack action (or the authored attack action at full weight only for a close fallback). Start `strike` only after the windup has visibly begun, so the zombie never pauses in idle before hitting.
3. Store `attackAction`, `attackClipDuration`, `attackHitAt`, `attackPrevTime`, `attackHitApplied`, and the current attack side on the visual state. Set the attack action to `LoopOnce`, reset it, and play it. Use a short cross-fade to/from locomotion rather than abruptly disabling the walk/run action.
4. After the mixer update, detect the contact frame by crossing the normalized marker: `previousTime < hitAt && currentTime >= hitAt`. Handle a large frame delta and `LoopOnce` completion explicitly, and guard with `attackHitApplied` so one swing cannot damage twice. The marker should be measured from the actual clip (and adjusted per variant), not copied from a different rig.
5. At the marker only, check the existing reach, facing/line-of-attack, alive state, and game state, then call the existing `damagePlayer(...)` once. Remove any independent “lunge elapsed” damage trigger. Lunge/root movement can remain a visual anticipation or gameplay movement, but it must never itself cause damage.
6. Trigger the hurt beep and hurt sample only inside `damagePlayer(...)`. This keeps audio, health loss, invulnerability, and UI feedback synchronized even when a frame is skipped or a zombie is outside reach at the marker.
7. On death or stun, stop/weight-zero the attack overlay before playing the existing death/stun action. Keep `AnimationMixer` instances and cloned skeletons cached per active visual; do not create a new mixer, material, or texture during each frame.

### Verification for this bug

- Record a short debug trace in the isolated build with enemy distance, state, `attackAction.time`, `attackHitAt`, and the timestamp of `damagePlayer`. The damage timestamp must be at or after the visible hand/weapon contact marker, never at attack start or merely on entering reach.
- Test a zombie that starts outside reach, one that enters reach during windup, and one that leaves reach before the marker. The last case should show the swing but deal no damage.
- Test a tab/frame hitch. The crossing check must still fire at most once and must use the existing reach/facing guard.
- Test every loaded attack clip/variant for grounding, no T-pose, no extra leg “sticks,” and a clean return to walk/run.

## 2. Ambience and one-shot audio without stutters

### Browser constraints

- `decodeAudioData()` asynchronously decodes a complete fetched file into an `AudioBuffer` and resamples it to the context's sample rate; it does not decode arbitrary fragments ([MDN `decodeAudioData`](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData), [Web Audio specification](https://www.w3.org/TR/webaudio/#dom-baseaudiocontext-decodeaudiodata)).
- `AudioBufferSourceNode.start()` schedules playback, but a source node is one-shot: calling `start()` more than once throws. Create a new source node for every swing, hit, groan, or footstep while sharing the decoded buffer ([Web Audio `AudioBufferSourceNode`](https://www.w3.org/TR/webaudio/#AudioBufferSourceNode), [Web Audio `start()` algorithm](https://www.w3.org/TR/webaudio/#dom-audiobuffersourcenode-start)).
- Autoplay may leave an `AudioContext` suspended. The autoplay specification recommends checking the policy and resuming from a user-activation handler; Chrome's game guidance likewise calls `resume()` after user interaction ([W3C Autoplay Detection](https://www.w3.org/TR/autoplay-detection/), [Chrome Web Audio autoplay policy](https://developer.chrome.com/blog/web-audio-autoplay)).
- A CSP `media-src` source list controls where media requests may load, and `'self'` matches the protected page's origin ([W3C CSP `media-src`](https://www.w3.org/TR/CSP/#directive-media-src), [W3C CSP source lists](https://www.w3.org/TR/CSP/#source-list-syntax)). Keep the supplied audio local under `/assets/audio`; do not add a runtime dependency on an external CDN.

### Recommended implementation

1. Keep one audio context, one master/game bus, and one ambience gain node. Load a small manifest of local OGG/MP3 files once, deduplicate in-flight fetch/decode promises, and cache the resulting `AudioBuffer`s by URL. Prioritize the first ambience, attack, hurt, and groan samples; load optional variants afterward.
2. Begin loading as soon as the title/start screen is shown, but do not attempt audible playback until the existing start-game pointer/key gesture calls `resume()`. If decode or resume fails, leave the current procedural oscillator/noise path active.
3. For a one-shot, select a cached buffer, create a fresh `AudioBufferSourceNode`, set modest gain/playback-rate/pan, connect it to the existing bus, and call `start()` immediately or a few milliseconds in the future. Use a short gain envelope for tails and loop transitions; the Web Audio use-case guidance calls out gain/filter envelopes to avoid abrupt loop cutoffs ([W3C Web Audio use cases](https://www.w3.org/TR/webaudio-usecases/)).
4. Use one looping ambience source with `source.loop = true`, feed it through `ambienceGain`, and fade that gain in/out on run start/pause/reset. Do not restart ambience every frame. On visibility changes or pause, suspend/stop the source through the existing `pauseRun`/`resumeRun` lifecycle.
5. Cap repeated events (footsteps, groans, impacts) with the existing cooldown/voice policy. Avoid fetch, decode, allocation-heavy graph construction, or filesystem work in the render/update loop; all expensive work belongs to the warm-up path.
6. Keep the manifest and license/source records next to the files. Treat a missing or failed asset as non-fatal: the procedural fallback preserves gameplay and avoids making an audio fetch a frame-time dependency.

## 3. Safe Codex/Git workflow for this feature

1. Begin with an Ask-mode plan that names the exact files, invariants, tests, and non-goals. OpenAI recommends Ask mode before large changes and prompts structured like GitHub issues with paths, components, and acceptance details ([OpenAI Codex best practices](https://openai.com/business/guides-and-resources/how-openai-uses-codex/)).
2. Create a linked branch worktree from the known production base. Git documents that `git worktree add` gives each linked tree its own `HEAD`/index while sharing repository objects, and that the tree can be removed when the experiment is complete ([Git `worktree`](https://git-scm.com/docs/git-worktree)). Never edit the production worktree for this task.
3. Reconcile the asset/audio commit manually. Copy the CC0 assets and license records, then port only the audio/environment integration points. Preserve the current Polyart loader, sky depth behavior, collision code, game lifecycle, and procedural fallbacks. A diff against the base is the review boundary; do not accept a wholesale file replacement.
4. Keep commits small and reversible, for example:

   ```text
   add licensed audio/environment assets and manifest
   integrate cached ambience and one-shot audio with fallbacks
   synchronize zombie attack contact and dark palette
   ```

   `git commit` records the selected changes, `git diff` shows exactly what differs between the worktree and base, and `git revert` records a new commit that reverses an earlier one ([Git `commit`](https://git-scm.com/docs/git-commit), [Git `diff`](https://git-scm.com/docs/git-diff), [Git `revert`](https://git-scm.com/docs/git-revert)).
5. Run `npm run check`, then run the local browser smoke test on desktop and a low-power/mobile profile. Check the console/network panel for failed local assets, verify the baseline game loop, and capture the behavior trace described above. OpenAI's Codex guidance emphasizes reliable tests, visible terminal/test evidence, and human review before integration/deployment ([Introducing Codex](https://openai.com/index/introducing-codex/), [OpenAI harness engineering](https://openai.com/index/harness-engineering/)).
6. Before handoff, report the base commit, branch, commit list, test output, manual checks, known limitations, and an explicit “not merged / not deployed” status. Push only the review branch. Merge and deploy remain a separate owner-approved action.

## Acceptance gates

- Damage is emitted exactly once at the authored attack contact marker and never from proximity alone.
- Zombies keep locomotion/anticipation while approaching, then blend through strike and recovery without an idle pause or T-pose.
- Audio warm-up is asynchronous and cached; user gesture resumes the context; missing samples fall back safely; ambience does not restart every frame.
- Existing rigs, gameplay, collision, waves, controls, lighting, and procedural fallbacks remain intact.
- `npm run check` passes, the isolated branch is pushed for review, and production remains unchanged until explicit approval.

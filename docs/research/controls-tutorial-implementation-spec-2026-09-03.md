# HAZE controls and tutorial implementation spec

Date: 2026-09-03  
Status: isolated specification only; no gameplay or production files changed.  
Baseline: origin/perf/zombie-rig-audio at b370f6b.

## Goal and guardrails

Add controller support, device-aware prompts, remapping, safer touch controls, and a short playable onboarding flow without changing the current desktop feel, combat rules, camera tuning, HUD meaning, leaderboard timing, or ranked waves.

The current game already has the expected FPS baseline: WASD movement, pointer-locked mouse look, left-click attack, Shift sprint, number keys/wheel weapon cycling, Escape pause, a floating left touch stick, right-side touch look, and a landscape gate. Treat these as compatibility requirements, not redesign targets.

## Research decisions

- Use the browser Gamepad API. Read navigator.getGamepads() once per frame, listen for gamepadconnected and gamepaddisconnected, and prefer the "standard" mapping when exposed. The W3C spec defines buttons, axes, mapping, and haptics; MDN documents connection events and polling. ([W3C Gamepad](https://www.w3.org/TR/gamepad/), [MDN Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API))
- Keep pointer lock opt-in from a user gesture. Escape must always release it, and losing focus must clear input and pause safely. ([W3C Pointer Lock 2.0](https://www.w3.org/TR/pointerlock-2/))
- Keep movement on the left and camera on the right for touch. Use a large input area, a floating movement stick, direct right-side camera panning, visible press states, and safe-area insets. Apple recommends a 44x44 pt minimum for frequent touch controls. ([Apple Game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls))
- Disable browser gesture handling only on the game surface with touch-action:none; use pointer capture and handle pointercancel. Keep handlers small and target-specific. ([MDN Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events))
- Use at least 24x24 CSS px as the WCAG 2.2 minimum target, with spacing or larger active hitboxes where needed. Keep text at 4.5:1 contrast, important non-text indicators at 3:1, visible keyboard focus, and no color-only state. ([WCAG 2.2](https://www.w3.org/TR/WCAG22/), [Target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum))
- Support controllers in menus and tutorials as well as gameplay. Android's controller guidance explicitly requires input switching and tutorial coverage across wired and wireless standard controller types. ([Android controller testing](https://developer.android.com/games/sdk/game-controller/testing_controller))
- Use KeyboardEvent.code for physical default bindings and KeyboardEvent.key or Keyboard.getLayoutMap() for labels. This keeps WASD-like physical behavior while displaying the user's actual key names. ([MDN KeyboardEvent.code](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code), [MDN KeyboardEvent](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent))

## Input contract

Create one normalized action state. Rendering, combat, tutorial checks, and menus consume actions only; device handlers never call gameplay functions directly.

| Action | Keyboard/mouse default | Standard gamepad default | Touch default |
|---|---|---|---|
| move | WASD | Left stick | Floating left stick |
| look | Pointer-lock relative mouse | Right stick | Right-side drag surface |
| attack | Left mouse button | RT/R2 | Large right attack button |
| sprint | Hold Shift | Hold left-stick click (L3) | Hold Sprint; optional tap-to-toggle setting |
| weaponNext / weaponPrev | Wheel / R; preserve wheel direction | RB/R1 / LB/L1 | Weapon cycle button |
| pause | Escape | Menu/Start | Top-right pause button |
| confirm / cancel | Enter / Escape | A/Cross / B/Circle | Tap / back control |

Requirements:

1. Normalize axes to [-1,1], apply a 0.15 default stick dead zone, and add a response-curve setting only if testing shows it helps.
2. Digital actions expose pressed, held, and released edges. A held attack must not create repeat swings outside the existing combat cadence.
3. The last meaningful input source becomes active. Prompt labels update immediately between keyboard, mouse, gamepad, and touch, with a text fallback when controller glyphs are unknown.
4. gamepadconnected and gamepaddisconnected update availability without reloading. Unknown mappings get a conservative fallback and a remapping prompt.
5. Remapping is action-based, stored in versioned local storage, supports conflict detection, unbind, reset-to-defaults, and a cancelable capture. Do not intercept browser/system-reserved Escape, Meta, or fullscreen exit behavior.
6. Clear keyboard state on blur, visibilitychange, pointer-lock loss, controller disconnect, orientation change, and tutorial/game-state transitions. Never leave sprint, attack, or a touch pointer stuck.
7. Keep pointer-lock acquisition behind the existing canvas gesture. A failed request is a recoverable state, not a runtime error.

## Touch and mobile layout

- Preserve the split layout: left movement, right look, attack in the lower-right, secondary controls outside the look surface, pause in the top safe area.
- Use env(safe-area-inset-*) for every edge-anchored control. Reserve a visible 56-72 CSS px gameplay button footprint, 8 px minimum separation, and a larger invisible hitbox when the visual design needs a smaller icon.
- Keep touch-action:none on the canvas and touch zones only. Use setPointerCapture, pointerup, pointercancel, lostpointercapture, and orientation-change cleanup so two-finger move/look remains reliable.
- Show a press state that remains visible around the finger. Provide optional opacity reduction, left-handed layout, sprint toggle, and control-size settings.
- Keep the existing portrait gate. If supported, request landscape only after fullscreen/user gesture; never assume screen.orientation.lock() succeeds because browser support is limited. ([MDN Screen Orientation](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock))
- Check 16:9, 19.5:9, short landscape, browser UI visible, notch devices, and resize/orientation changes. HUD text and prompts may not be hidden behind controls or safe-area cutouts.

## Tutorial flow

Implement a separate tutorial state. It is a 60-80 second micro-wave, skippable at any time, replayable from How to Play, and excluded from ranked time, score, proof events, and leaderboard submissions.

| Step | Player action | Completion signal | Target time |
|---|---|---|---:|
| 0. Briefing | Start or continue | One sentence, current-device prompt | 4 s |
| 1. Move | Reach a lit ground marker | Marker pulses, movement haptic/audio | 8 s |
| 2. Look | Center the reticle on a marked zombie | Reticle changes state | 6 s |
| 3. Strike | Attack once | Swing sound, hit flash, damage marker | 8 s |
| 4. Finish | Kill the marked zombie | Kill accent and short score pop | 10-15 s |
| 5. Escape | Sprint through a second marker | Speed-line/footstep cue; no new binding | 8 s |
| 6. Weapon | Cycle once and attack a second target | Weapon HUD highlight and prompt update | 8 s |
| 7. Shelter | Reach the cabin marker | Warm lamp, concise recovery explanation | 8 s |
| 8. Micro-wave | Clear a tiny bounded group | Dawn card, Start the night CTA | 15-20 s |

Tutorial rules:

- Teach one action at a time. Do not advance on a button press alone; require the in-game result.
- Highlight the relevant world marker, HUD element, and device glyph. Keep one instruction line and one optional Skip tutorial affordance on screen.
- Repeat important information through text, icon/reticle state, sound, and optional haptic. Never rely on color alone. Respect reduced-motion and muted-audio settings.
- If the player dies or leaves the tutorial, resume from the last completed step or offer Restart tutorial; never count it as a ranked death.
- Persist completion as a versioned flag named haze.tutorial.v1.completed. Always expose replay from How to Play and Settings.
- On completion, hand off to the unchanged normal Wave 1 start path. The first ranked timer begins only after that handoff.

## Implementation slices

1. Add the normalized action model and device-source resolver. Keep existing keyboard, mouse, and touch behavior as adapters.
2. Add standard gamepad polling, connection lifecycle, menu/tutorial navigation, glyph fallback, haptics behind a capability check, and remapping storage/UI.
3. Harden touch layout and pointer lifecycle. Add safe-area, target-size, resize/orientation, and left-handed/sprint-toggle settings without moving core HUD semantics.
4. Add the tutorial state machine, markers, prompt resolver, completion persistence, replay/skip controls, and ranked-timer boundary.
5. Add tests and run the branch-only browser matrix below. Do not combine with production until review passes.

## Verification matrix

### Static and unit checks

- npm run check passes on the isolated branch.
- Add pure tests for axis dead-zone/curve, button edge transitions, source arbitration, remap conflict/reset, disconnect cleanup, tutorial step transitions, skip/replay, and ranked-timer exclusion.
- Build output contains no duplicate direct gameplay calls from device handlers and no new network fetch/decode work in animation or combat hot loops.

### Desktop

- Chrome and Firefox: pointer lock starts only after click, mouse look is stable, Escape exits lock and pauses, blur/visibility clears held inputs, keyboard defaults remain unchanged, and wheel/R/1-5 still select weapons.
- Every menu and tutorial step is reachable with keyboard and a standard controller. Focus is visible and never fully covered by HUD overlays.

### Gamepad

- Xbox-style and PlayStation-style standard mappings: move/look/attack/sprint/weapon cycle/pause all work in gameplay, menus, and tutorial.
- Connect after load, disconnect during play, reconnect, and switch between controller and keyboard/mouse. Prompts follow the last active device.
- Haptics are optional and failure-safe. No errors when unavailable.

### Touch/mobile

- Android Chrome and iOS Safari in landscape: simultaneous move + look + attack works; no page scroll, pinch zoom, accidental browser navigation, or stuck pointers after interruption.
- Verify safe-area spacing, minimum target sizes, press states, left-handed mode, sprint toggle, portrait gate, orientation change, and browser UI visible/hidden states.
- Run at least one low-end profile with dense zombies. Input handling must not introduce measurable frame spikes or alter current combat/camera behavior.

### Tutorial and regression

- Fresh profile completes the flow in 60-80 seconds with device-correct prompts; skip works immediately; replay works from How to Play; completion persists; tutorial time/score never reaches ranked proof.
- Normal Wave 1, controls, enemy rigs, cabin recovery, HUD, audio, leaderboard, and pause behavior remain unchanged after handoff.
- Local preview logs show no runtime errors; expected asset/audio/model requests are HTTP 200; desktop and landscape-mobile smoke tests pass.

## Branch and release rules

- Work only in research/controls-tutorial-spec for this document, then use a separate implementation branch based on the latest published rig/audio commit.
- Push each implementation branch to GitHub. Provide a preview URL and commit for review.
- Do not merge, cherry-pick, deploy, or alter main until the owner approves the preview and regression report.

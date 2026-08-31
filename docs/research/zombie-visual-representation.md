# HAZE zombie visual representation research

Date: 2026-09-01

Scope: choose a better-looking zombie representation for the existing Three.js/WebGL game without changing enemy gameplay, hit volumes, waves, controls, or ranked behavior. This is an asset/representation plan only; no source code or production deployment is changed by this note.

## Executive recommendation

Use a **hybrid 3D + animated-impostor pipeline** generated from one licensed, good-looking zombie character:

```text
0–8 m       1–3 full skinned GLB clones (the hero view)
8–28 m      8-direction animated impostor atlas (most enemies)
28 m+       4- or 8-direction low-frequency impostor/silhouette
all ranges  existing gameplay entity + invisible collision/hit capsule
```

This is the same broad idea that made old games look rich with small data: spend geometry only where the player can inspect it, and bake the expensive detail into images for the crowd. It is not a replacement for the game's zombie design; the images are rendered from the same authored zombie, so the close and distant versions match.

The first implementation should use **8 directions**, six to eight frames for walk/idle, and separate short clips for attack, hit, and death. If stepping is visible at the 8–28 m range, add 16 directions only for the near-mid atlas; do not start with 16 directions for every state and variant because that multiplies texture memory and authoring time.

## Why not one fully rigged mesh for every zombie?

`GLTFLoader` gives Three.js a portable path for meshes, materials, skins, and animation clips. glTF itself is designed as a compact runtime delivery format and supports linear-blend skinning and articulated animation ([Khronos glTF overview](https://www.khronos.org/gltf/), [glTF 2.0 skinning and animation](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)). Three.js `SkinnedMesh` applies bone transforms to vertices, which is exactly what the close view needs ([SkinnedMesh docs](https://threejs.org/docs/pages/SkinnedMesh.html)).

However, the normal `THREE.InstancedMesh` path is for repeated geometry/materials and transforms, not independently posed skeletal characters ([InstancedMesh docs](https://threejs.org/docs/pages/InstancedMesh.html)). A skinned clone also has a changing animated bounding volume; Three.js notes that animated bounds may need recomputation for culling ([SkinnedMesh bounding-box note](https://threejs.org/docs/pages/SkinnedMesh.html#property:boundingBox)). In HAZE, that makes a full rig a good **hero** representation, not the only representation for an entire crowd.

Load one GLB, share its geometry/materials, and clone only the scene/skeleton for the few close enemies. Keep the visual root behind the current enemy object so gameplay never depends on whether the visual is a GLB or a sprite.

## Representation options

| Representation | Visual quality at the intended range | Runtime shape/animation cost | Main failure mode | HAZE decision |
| --- | --- | --- | --- | --- |
| Full skinned GLB clone | Best close-up, real lighting and perspective | Highest; one independently animated character has multiple skinned draw submissions | Too many mixers, bones, materials, and animated bounds in a crowd | Keep for 1–3 closest enemies |
| One camera-facing billboard | Good front view, weak side/back view | Very low; one quad and a texture | Looks like a card while looking around; no cast shadow | Use only as the base primitive, never as the final art by itself |
| 8-direction animated impostor | Convincing look-around for mid/far range when baked from the hero | Very low; select atlas tile and update a quad | Direction snaps if there are too few angles or no hysteresis | Recommended default crowd representation |
| 16-direction animated impostor | Better side transitions and close-mid inspection | Still low, but doubles directional art/texture space | Atlas size and authoring time grow quickly | Optional near-mid upgrade after an 8-dir test |
| Crossed quads (two intersecting cards) | Better silhouette from oblique angles than one card | Low; two quads per enemy | Can show an X-shaped highlight and still has no true animation volume | Useful fallback for far silhouettes, not the hero view |
| Rigid low-poly mesh with baked texture | True depth and shadows with much less vertex work than a rig | Medium; no skeletal animation if pose is baked | Repeated pose looks dead unless several baked poses are swapped | Optional 2.5D mid tier for bosses/close enemies |
| GPU-instanced animated quads | Same image quality as impostors with one/few draws | Very low after shader work | Requires custom shader/per-instance attributes and careful alpha/depth handling | Implement after the art atlas is approved |
| Vertex-animation-texture (VAT) mesh | True 3D motion at crowd scale | Low runtime CPU cost, higher shader/asset complexity | Precision, texture size, and WebGL compatibility require a dedicated test | Future option only; unnecessary for HAZE's current wave sizes |

Three.js defines a `Sprite` as a plane that always faces the camera; it also explicitly notes that sprites do not cast shadows ([Sprite docs](https://threejs.org/docs/pages/Sprite.html)). That is why a sprite atlas should be paired with a small shared contact-shadow disk and fog/depth, rather than pretending that a sprite can provide the complete lighting model.

## The proposed art pipeline

1. Pick one licensed base zombie with an actual humanoid rig and walk/attack/death clips. Quaternius or LOWPO are candidate sources already collected separately; store the chosen asset's license and author URL beside the files.
2. Normalize the base in Blender: apply scale/axis, remove unused materials, keep one atlas-friendly material, and make a clean A/T-pose. Keep a high-quality source file outside the runtime bundle.
3. Author three or four recognizable zombie variants from the same rig by changing clothing colors, wounds, head silhouette, and one prop. This preserves visual variety without ten unrelated rigs.
4. Render transparent sprite sheets from the final animated rigs at a fixed camera height. Bake cool moonlight, occlusion, wounds, clothing, and a soft ground contact shadow into the color image. Use one consistent silhouette and framing so direction changes do not pop.
5. Pack atlas cells with a small gutter and power-of-two dimensions. Start with one atlas per animation family (for example walk/idle and attack/hit/death) and a 1024–2048 px target, then measure. Three.js notes that atlases reduce material/texture switching and that GPU memory depends on texture dimensions, not compressed file size ([Three.js texture atlas and memory guidance](https://threejs.org/manual/en/textures.html)).
6. Runtime atlas selection uses the enemy's animation phase and the angle from enemy to camera. Quantize the angle to eight bins and hold the previous bin until the angle crosses a small hysteresis band; this prevents rapid tile flipping while the player looks around.
7. Use alpha-tested cutouts (with a small transparent border) for the impostor pass. Keep depth testing and fog enabled, use a shared circular contact-shadow mesh, and do not make each sprite a unique material.
8. Keep the existing enemy collision/AI object authoritative. A render LOD swap must only change the child visual; attacks, hit tests, death timing, score, and proof events stay on the existing entity.

## Runtime structure for this repository

The current repository is a single-file authored game (`public/index.html`) with a build optimizer. The visual should be introduced behind a narrow adapter rather than rewriting enemy logic:

```text
Enemy entity (unchanged gameplay state, radius, hp, proof ID)
└── visual adapter (new)
    ├── HeroVisual: GLB scene + SkeletonUtils clone + AnimationMixer
    ├── ImpostorVisual: pooled instanced quad + atlas frame/direction
    └── FarVisual: same atlas with fewer frames or a dark silhouette
```

Use one shared source geometry/material for the hero clones. If several close enemies share the same clip/state, an `AnimationObjectGroup` can share animation state, subject to Three.js's compatibility limitations ([AnimationObjectGroup docs](https://threejs.org/docs/pages/AnimationObjectGroup.html)). Otherwise use a small pool of mixers and update only visible hero instances.

For the impostor pass, use one quad geometry and one atlas material. Three.js exposes per-instance attributes through `InstancedBufferAttribute` ([docs](https://threejs.org/docs/pages/InstancedBufferAttribute.html)); a custom shader can read per-instance position, scale, variant, animation frame, and direction while the CPU only updates compact typed arrays. WebGL2's instanced draw is widely available, and WebGL1 can use `ANGLE_instanced_arrays` ([MDN `drawElementsInstanced`](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/drawElementsInstanced)). If compatibility testing shows an old browser without instancing, fall back to a small pooled set of ordinary quads.

Three.js `LOD` can switch objects at distances and supports hysteresis to avoid boundary flicker ([LOD docs](https://threejs.org/docs/pages/LOD.html)). Whether implemented with `THREE.LOD` or a tiny custom distance check, use different enter/exit thresholds (for example hero enters at 7 m and exits at 9 m) instead of one threshold.

## Lighting and visual quality tricks

- Bake the high-frequency detail (skin tears, teeth, cloth weave, blood, and facial asymmetry) into the atlas; geometry only needs to hold the silhouette.
- Add a shared contact shadow under every impostor. Sprites cannot cast real shadows, so this is the cue that keeps a zombie planted in the forest.
- Keep the atlas color in the same cool palette as HAZE's moonlight, then apply the scene's fog and a small hit-flash tint in the shader.
- Use three or four palette/prop variants and deterministic per-enemy frame phase. Identical timing is more noticeable than identical geometry.
- Avoid transparent blended edges where possible. Alpha testing/cutout gives more stable depth ordering for overlapping zombies; reserve soft blending for the contact shadow.
- Use mipmaps with gutters or a compressed KTX2 copy after the baseline works. Three.js's `KTX2Loader` transcodes Basis Universal textures to a supported GPU format ([KTX2Loader docs](https://threejs.org/docs/pages/KTX2Loader.html)); Khronos describes KTX2/Basis as reducing delivery and runtime texture memory across GPU vendors ([Khronos KTX overview](https://www.khronos.org/ktx/)). Keep a regular PNG fallback for older browsers while testing.

## Why the suggested “GPT image on a rig” needs a different interpretation

An image generator is useful for the **concept and texture direction**, not as a drop-in 3D rig. OpenAI's image API returns image data, while a rigged game character still needs topology, skin weights, bones, and animation clips ([OpenAI image generation API reference](https://platform.openai.com/docs/api-reference/images)). An image-to-3D service can create a starting mesh and export GLB, but it still needs retopology, pose checks, and animation cleanup. Meshy's own workflow documents image upload, GLB export, and optional remeshing/rigging; its free-tier outputs require CC BY 4.0 attribution ([Meshy image-to-3D](https://www.meshy.ai/features/image-to-3d)).

The productive AI-assisted route is therefore:

```text
GPT image concept sheet (front, side, 3/4, back)
→ licensed/base rig or image-to-3D draft
→ Blender retopo + UV + rig/retarget
→ render 8-direction atlas from the cleaned source
→ runtime hero GLB + impostor atlas
```

For HAZE, using an existing licensed humanoid zombie as the source and using generated images only for variant concepts/textures is safer and more deterministic than shipping an uncleaned AI mesh. It also avoids a mismatch where the close model and the distant “image zombie” have different anatomy.

## Acceptance tests before any merge

- The close zombie is recognizably the same character as its 8-direction impostor from front, side, and rear views.
- At least idle, walk, attack, hit, and death transitions are visible and do not pop at the LOD thresholds.
- The existing enemy root, collision radius, damage, wave counts, death timing, leaderboard proof, and controls are unchanged.
- Crowded-wave profiling shows no long frame pause while the player rotates or moves; inspect frame deltas on both a desktop and a low-power/mobile profile.
- No per-spawn texture/material/geometry allocation occurs after the asset cache is warm.
- `npm run check` passes, and a local preview is reviewed before requesting approval. Do not merge or deploy until the owner approves the visual and behavior comparison.

## Sources

- [Three.js `InstancedMesh`](https://threejs.org/docs/pages/InstancedMesh.html)
- [Three.js `InstancedBufferAttribute`](https://threejs.org/docs/pages/InstancedBufferAttribute.html)
- [Three.js `LOD`](https://threejs.org/docs/pages/LOD.html)
- [Three.js `Sprite`](https://threejs.org/docs/pages/Sprite.html)
- [Three.js `SkinnedMesh`](https://threejs.org/docs/pages/SkinnedMesh.html)
- [Three.js `AnimationMixer` / `AnimationObjectGroup`](https://threejs.org/docs/pages/AnimationObjectGroup.html)
- [Three.js texture atlas and memory guidance](https://threejs.org/manual/en/textures.html)
- [Three.js `GLTFLoader`](https://threejs.org/docs/pages/GLTFLoader.html)
- [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- [Khronos KTX / Basis Universal](https://www.khronos.org/ktx/)
- [MDN WebGL2 instanced drawing](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/drawElementsInstanced)
- [OpenAI image generation API reference](https://platform.openai.com/docs/api-reference/images)
- [Meshy image-to-3D workflow and licensing](https://www.meshy.ai/features/image-to-3d)

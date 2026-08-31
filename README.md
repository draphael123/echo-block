# ECHO BLOCK

A look-development diorama: one suburban block, at night, in voxels — built to
answer a single question, *can a browser get to the look and feel of* Echo
Generation *(Cococucumber, 2021)?*

No mechanics, no player, no game loop beyond a camera and a flickering
television. Live: **[echo-block.vercel.app](https://echo-block.vercel.app)**

```bash
npm run dev        # http://localhost:5833
```

## What actually carries the look

Ranked, because the ordering is the finding:

1. **The camera, not the voxels.** A long lens (fov 18–24) on a fixed 3/4, cut
   between framings rather than flown, plus heavy depth of field. This is what
   makes it read as a diorama on a table instead of a Minecraft screenshot. Get
   everything else right and use a normal 60° follow camera and it looks like a
   generic voxel game.
2. **Night, with light as the subject.** A dim cool key, a warm hemisphere
   fill, and then a dozen tiny saturated local sources — sodium streetlight,
   porch bulbs, window spill, a television. The scene is mostly dark, with
   pools of colour. This fakes the reference's path-traced bounce.
3. **One voxel scale for everything.** A leaf, a mailbox latch and a roof gable
   are the same cube (1 voxel ≈ 8 cm; the houses are ~100 × 80). The common
   failure is modelling small props at a finer resolution because it is easier
   to make them look good — the diorama read collapses immediately.
4. **Clutter density.** The bike on its side, the coiled hose, the leaf piles,
   the bin with its lid off. This is content labour rather than tech, and it is
   the single largest cost.
5. **Grade and grain.** ACES, teal shadows / amber highlights, vignette, grain,
   a whisper of chromatic aberration. Cheapest large win in the list.

## Layout

| file | what it is |
| --- | --- |
| `src/voxel.js` | sparse voxel grid, primitives, string prop DSL, face-culling mesher with per-vertex AO |
| `src/palette.js` | ~50 colours; the saturated ones are all emitters |
| `src/props.js` | the clutter library |
| `src/block.js` | the street, the two houses, prop placement |
| `src/lights.js` | rig, sky shader, fake volumetric shaft, TV flicker |
| `src/post.js` | hand-rolled bloom + DOF + ACES + grade chain |
| `src/ui.js` | title card and settings drawer |

Press **tab** in the running page for the settings drawer — every number that
decides the look is a slider, and the values persist to `localStorage`.
"copy values as json" dumps a tuned set to paste back into the source.

## Three things that bite in three.js

- **Per-voxel emissive.** `emissive` is a per-material uniform and
  `instanceColor` is diffuse-only, so a mesh cannot have some voxels emit and
  others not. The mesher emits two geometries — matte and glow — and the glow
  one is unlit `MeshBasicMaterial` with vertex colours allowed past 1.0.
- **Tone mapping on a post chain.** three skips tone mapping when rendering to
  a render target, and a raw `ShaderMaterial` writing to the default
  framebuffer gets no output-colour-space conversion either. The composite pass
  does both itself.
- **A sky sphere has to contain the scene *and* stay inside the far plane.**
  Get either wrong and the background silently becomes the clear colour or
  occludes the distance. This one rides the camera at radius 1050, far 1600.

## Credits

Reference: *Echo Generation*, Cococucumber (2021). Nothing here is their asset,
code or art — this is an independent study of the look.

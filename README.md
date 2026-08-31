# ECHO BLOCK

A look-development diorama: one suburban block, at night, in voxels — built to
answer a single question, *can a browser get to the look and feel of* Echo
Generation *(Cococucumber, 2021)?*

Houses down both sides of one street, two shops you can walk into, traffic,
four neighbours who each have a small mundane reason to still be outside, a
dog, and a cat that does not care that you are there. You are Row, you have
somebody else's paper round, and you are not going home yet.
Live: **[echo-block.vercel.app](https://echo-block.vercel.app)**

**WASD** walk · **shift** run · **E** talk · **C** camera mode · **tab** settings

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
| `src/block.js` | the street, the seven houses, prop placement |
| `src/people.js` | the cast: rigid voxel limbs on a joint hierarchy, and their lines |
| `src/street.js` | council property — shelter, phone box, signs, skip, swings |
| `src/shops.js` | the parade, and the one building with an interior |
| `src/traffic.js` | two cars on a loop, with the only moving light in the scene |
| `src/walk.js` | collision: floor + headroom, derived from the voxels themselves |
| `src/fx.js` | leaves, chimney smoke, the cat, the bad neon tube |
| `src/round.js` | the paper round — the reason to walk anywhere |
| `src/lights.js` | rig, sky shader, fake volumetric shaft, TV flicker |
| `src/post.js` | hand-rolled bloom + DOF + ACES + grade chain |
| `src/ui.js` | title card and settings drawer |

Press **tab** for the settings drawer — every number that decides the look is a
slider, and the values persist to `localStorage`. "copy values as json" dumps a
tuned set to paste back into the source. **C** swaps between following the
player and the six fixed look-dev framings, which **space** cuts between.

## Walking

Collision runs against a field derived from the voxels that were actually
built, not a hand-maintained list of boxes. The scene comes out of sixty
different prop functions and nobody was ever going to keep a parallel list of
colliders honest.

Two rules do all of it. A **step** height means you can climb a kerb or a porch
tread and nothing taller, which gets kerbs, steps, hedges, bins, tree trunks
and house walls for free. A **headroom** test means you can only stand where
there is clear space above the floor — and that second rule is the one that
makes a doorway possible. With a plain height map the column under a lintel is
as tall as the wall beside it, and you can never walk through anything.

## Marlow's

The shops are built as the opposite of the houses on purpose: brick not
clapboard, a flat roof with a parapet not a gable, a glazed front not punched
windows. A street where every building is built the same way reads as a texture
rather than a place.

The store is the only thing with an interior, and it needed three things the
houses never did — a floor inside, a doorway that is a HOLE rather than a door
slab, and a lintel high enough to clear the headroom band. It also needed the
camera solved: a trailing camera outside is looking at the back of a brick wall
the moment you step through the door, and a camera *inside* a 75-voxel room
needs a wide lens, which is the one thing this look cannot afford. So the roof,
fascia, awning and shopfront are meshed separately and taken away while you are
inside. All of it sits above the headroom band, so leaving the lid out of the
collision world changes nothing.

The door also has to face AWAY from the follow camera, which is why the parade
is authored front-forward and blitted in mirrored.

## The round

The street had nowhere to go. Sam hands you tomorrow's papers and every mailbox
on the block becomes somewhere to be — it uses props that already existed, it
takes you the length of the street in both directions, it teaches the controls
without a tutorial, and it ends. It is deliberately not a quest system: one
flag, a count and a list of positions. Anything more would be building a game
on top of a look study before anyone has decided that is what this is.

Two things it immediately exposed. A neighbour standing beside a postbox made
that postbox unreachable, because "person beats mailbox" is the wrong rule —
whichever is *closer* wins. And with houses down both sides, a camera at a
fixed +Z offset ends up behind the near row the moment you cross the road, so
the camera now always stands in the carriageway and cuts to whichever side you
are on, with a dead band so it cannot chatter on the centre line.

## The street

Houses run down both sides, fronts facing the road, and every camera sits on
the road or the near verge — with two rows that is the only band a lens can
stand in without a roof filling the foreground, and it is where the reference
puts its camera too.

The generic house is one seeded recipe: which rooms are awake, whether there is
a chimney, how the siding bands, where the door sits. Two are bespoke — the
mint one with the porch and the television, because the whole look was tuned
against that framing, and the one with the garage, which holds the right-hand
third of most shots.

The people are rigid voxel chunks on a joint hierarchy: no skinning, no
deformation, a limb rotates as a solid block. That is what gives them the
puppet read, and smooth vertex blending would look wrong here even if it were
cheaper. A kid is 20 voxels tall, an adult 23, heads deliberately oversized.

## What bites in three.js

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
- **Hollow is the wrong trade for a silhouette.** Emptying a backdrop hill or a
  treeline sphere saves voxels — a one-time build cost — but the mesher then
  emits its INNER faces too, which is a permanent per-frame cost. Solid and
  thin beats hollow and deep. (Tree canopies are the exception: they are ragged
  enough that you see into them, and hollow reads better.)
- **The forward renderer loops every light per pixel.** A row of houses each
  contributing three window-spill point lights is a frame-rate cliff, so porch
  bulbs and window spill are both capped to the nearest few and the far ends of
  the street stay emissive-only. Shadow maps refresh every third frame; the
  block is static and only the people and the cars move.
- **A walk cycle has to be driven by distance, not by the clock.** Drive it off
  time and the legs keep scissoring while the player stands still, which is the
  most obvious tell that a character is a puppet with a timer attached.
- **Physical light falloff will clip anything that walks near it.** A lamp
  tuned so the pavement looks right sends a face — twice the albedo — to flat
  white. The composite now applies a highlight rolloff *before* the tone curve,
  which pulls the far end of the range back in without touching the midtones.
  That is the difference between a bright face and a hole in the frame.
- **On a fixed 3/4 camera you will end up behind a tree.** There is a ring on
  the ground under the player drawn with depth testing off, because the honest
  answer to "where am I" should never be "somewhere behind that canopy".

## DYNAMO — the track prototype

, or **ride out** from the hub. A 300-metre sprint out of the
estate: a straight, two corners and one stretch with the streetlights
deliberately absent. Deliberately not a lap — at 9.7 m/s a sixty-second lap is
580 metres, about eight of these blocks, and building that before knowing
whether the look survives speed would be building the expensive thing first.

Speed powers the dynamo, so how hard you have been pedalling decides how far
ahead you can see. Three rules shape it: a **floor**, so slowing down is never
blinding; **lag**, so a sprint before a dark stretch banks light you can still
spend after you brake; and **saturation at 70%**, so past that you gain no
sight and only lose reaction time.

### What it measured

 in the console drives the same bike down the same track under
five throttle policies and prints the table. As tuned:

| policy | time | crashes | blind hits |
| --- | --- | --- | --- |
| flat out | **36.0s** | 2 | 2 |
| steady 90% | 39.4s | 2 | 2 |
| ride to your light | 42.0s | 2 | 0 |
| steady 75% | 45.6s | 2 | 2 |
| steady 60% | 55.3s | 2 | 0 |

**Flat out wins by six seconds. The lamp is currently decoration.** Riding
blind and taking the hits is faster than riding to what you can see.

The more useful detail is that *every* policy crashes exactly twice — including
the one with zero blind hits. So the crashes are not coming from the hazards at
all, they are corner mistakes, and changing the crash penalty cannot flip the
result because it applies equally to everyone. The hazards are not
discriminating between a fast rider and a careful one, which is the actual
thing to fix: either more of them on the back road, tighter to the racing line,
or a rider model whose line does not wander +/-20 voxels of its own accord.

This is written down rather than tuned away. The harness exists so the question
gets a number instead of a feeling, and the first number it produced was a no.

### What it did answer

The look survives 35 km/h. Depth of field and grain still read at speed, the
lit stretch holds together, and the dark stretch is legible precisely because
the lamp reaches a parked car before you do. That was the question the slice
was built for.

### And one architectural finding

 addressed +/-512 voxels and corrupted **silently** past it — a key
outside the range borrows from the next field, so voxels land somewhere else
entirely and nothing throws. It is +/-4096 now with a bounds check that says
so. Related: a 300m track is 2.1M voxels and a 6.5s build. A 580m lap will not
fit this single-mesh approach; a real track needs chunking.

## Credits

Reference: *Echo Generation*, Cococucumber (2021). Nothing here is their asset,
code or art — this is an independent study of the look.

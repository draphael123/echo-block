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
4. **Clutter density.** The bicycle on its side, the coiled hose, the leaf piles,
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

## DYNAMO -- the circuit

`race.html`, or **drive out** from the hub. A closed 507-metre lap: two long
straights, two short ones, four ninety-degree bends, and half the circuit with
the streetlights deliberately absent.

**Cars, not bikes.** One voxel is 8cm, so a BMX wheel is six voxels across and
the frame is a set of one-voxel tubes. Voxels are good at solid masses with
panels and glass and lights and bad at thin tubes: the parked wagon in the hub
reads as a car instantly, and the bike read as a smudge with a lamp on it. That
only became obvious after building the bike.

The carriageway is 128 voxels -- 10.2 metres. It was 88, which is a correct
residential street and too tight to race on, because the only line past a skip
was the one the parked cars were sitting in.

### The mechanic

Your headlights reach 280 voxels. At top speed your braking distance is 297.
**At speed, you cannot stop inside your own beam** -- so on the lit half of the
circuit the streetlights are doing the seeing for you, and on the unlit half
they are not. That single relationship is the whole design, and it is why the
numbers below are the ones they are rather than whatever felt right.

### What it measured

`DYNAMO.sim()` drives the same car round the same circuit under five throttle
policies. RACING brakes for corners and ignores the light. CAUTIOUS brakes for
corners *and* caps its speed to what it can actually see.

| policy | lap | crashes | blind hits |
| --- | --- | --- | --- |
| steady 80% | **34.95s** | 0 | 0 |
| cautious | 35.07s | 0 | 0 |
| steady 65% | 37.67s | 0 | 0 |
| steady 95% | 37.87s | 1 | 0 |
| racing | 38.52s | 1 | 0 |

**Cautious beats racing by 3.45s. The dark is doing work.** Racing loses a lap
to the broken-down car on the unlit stretch; cautious gets round clean.

The harness is deterministic -- no RNG in the driver or the physics -- so each
row is one exact answer, not a sample. Repeating a run changes nothing, and a
"twenty-one run sweep" here would be one run reported twenty-one times.

### What it took to get a readable number

Four separate bugs, each of which presented as a design finding:

- **`locate()` could not wrap.** The nearest-point search clamped its window to
  `[0, total]`, so arc-length pinned to the end of the lap and never came back
  round to zero. Presented as "every policy fails to finish"; was arithmetic.
- **Parked cars were rotated to face the road, like houses.** That parks them
  broadside across the carriageway. Presented as "nobody can complete a lap".
- **Parked cars sat in the dodge lane.** At `ROAD_HALF - 13` a 26-wide car
  spans u 18..44, which is exactly where a driver avoiding a skip goes.
  Presented as two crashes on clear road with nothing to hit.
- **The driver waited before reacting, then moved sideways instantly.** The
  avoidance gate made it wait `WARNING` seconds after sighting and *then* start
  steering -- a dead time followed by teleporting. Reaction is a delay; getting
  across is a distance; they are not the same number. Presented as "the
  lighting is decoration", twice.

The last one is the one worth keeping: **a mechanic can measure as decorative
because the thing measuring it is wrong.** The lighting was working all along.

### Life

Pedestrians pace the pavements in track coordinates, one in three walking a
dog, and they step back off the kerb when a car comes at them. Three more cars
drive the loop on their own business and are solid. Everything is culled past
900 voxels, so the cost is a dozen figures rather than a town.

### Still open

- **The circuit is one mesh.** 3.35M voxels, ~9s to build. This is the second
  independent confirmation that a real track needs chunking.
- **Oncoming headlights bloom into a blob** wider than the car carrying them.
  Reads as night dazzle, but it hides the car.

# DYNAMO — Visual Audit (variety pass)

A targeted look-development audit of the round-6 content: the new buildings,
the new hazards, and the two moving set pieces. The goal is NOT a general
beauty pass — it is to catch the specific ways procedurally-placed content
goes wrong, and fix only what a player would actually notice at racing speed.

## Method

For each item below: load its circuit, pose the camera with a SHOT helper
(direct `camera.position.set` + `lookAt` + `post.render` — the pane's rAF
cannot be trusted), screenshot, and judge against the checklist. The camera
poses are the PLAYER's angles: chase height (~84 up, ~200 back) on the
racing line, not a drone shot — a flaw you can only see from the air is not
a flaw.

## The checklist, per item

1. **Does it read as its thing at 80 km/h?** A pub must read "pub" (warm
   glass, bulb string), a petrol station "petrol station" (lit canopy), from
   two hundred voxels, at night, in that circuit's own sky. If it reads as
   "another box", name the ONE feature that would fix it (silhouette,
   glow placement, colour) — not a redesign.
2. **Is it lit correctly for its sky?** Indoor-warm materials go black under
   some skies; glow keys bloom differently under dusk vs midnight. Check the
   piece is neither invisible nor a white blob under ITS circuit's sky.
3. **Does it sit on the ground?** No floating plinths, no buried ground
   floors, on whatever slope its leg has. (The elev() rule: anything placed
   with put/blit gets its own s's height — verify it actually did.)
4. **Does it collide sanely with its surroundings?** Not inside a tree, not
   fused with a terrace, not straddling a hedge line. Overlaps the scrub
   already cleared from the ROAD are fine — this is about visual fusion off
   the road.
5. **Moving pieces only: is the RHYTHM readable?** The crane load's swing and
   the crossing's cycle must be visible from braking distance — check the
   red lamps bloom, the arm stripes read, the container reads as hanging
   (cables visible against the sky).

## The items

| circuit | item | where |
|---|---|---|
| parade | the pub (terrace gap, both sides) | 'the parade' leg |
| parade | chicane bollards | s=1560 |
| parade | billboards (park + cut rim) | 'the top', 'the cut' |
| parade | petrol station (farm) | 'the last bend', near lap end |
| oldtown | the pub (stone slot 1) | 'the shambles' / 'the descent' |
| oldtown | THE BELL TOWER | 'wall street' mid |
| oldtown | chicane | s=2600 |
| docks | THE LIGHTHOUSE | end of 'the long quay' |
| docks | crane load (swing + cables) | s=350 |
| docks | barrels + slick | s=1500 |
| ring | petrol station + billboard | 'the services' |
| ring | motorway hoardings | both motorway legs |
| ring | THE LEVEL CROSSING (arms, lamps) | s=5900 |
| ring | barrels | s=1200 |

## Output

For each item: PASS, or a one-line finding naming the single targeted fix.
Apply the fixes (they should each be a few lines — material key, an offset,
a size), rebuild the affected circuit, re-shoot only the failures.
Then commit the whole round and deploy.

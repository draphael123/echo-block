# DYNAMO — the pit-lane order: racing first, the hub in service of it

The review (REVIEW-PROMPT.md, and the fix pass that followed it) settled the
question: the racing game is the game, and the on-foot block is its front door.
This order finishes that thought. Nothing here grows the on-foot side for its
own sake; every hub item exists to make the racing loop feel owned, and every
racing item closes a gap the instruments measured. Then a visual pass — but
only where a screenshot from the driving seat showed something weak.

Rules carried over, non-negotiable:

- Anything spanning or near the road is built in (s, u) with per-s elevation.
- Per-track data lives in the track's spec, never in a global constant.
- Every change is verified by an instrument (`sim`, the duel, a probe loop) or
  a driving-seat screenshot, against the OLD behaviour where it can still be
  reproduced. Wedges are a first-class result: report them.
- The hub's look rules stand (README "What actually carries the look"): long
  lens, pools of light, one voxel scale. Hub additions must sit inside them.

## Part 1 — racing: close the measured gaps

1. **Put something behind the Ring Road's brows.** The crest assay HOLDS (15%
   of the lap blind) and yet the verdict is "RACING WINS by 11.4s — the dark is
   underpriced", because not one of the five hazards sits in a blind zone.
   Measured zones (stop > sight): 348–600, 1824–2088, 4500–4704, 4908–5196,
   6432–6684; existing hazards 1200 / 2600 / 4200 / 5400 / 6900 all miss them.
   Add four hazards INSIDE zones, varied kinds, ≥420 from any opposite-side
   neighbour (same-side may sit closer — the S-flick rule from the parade):
   s≈520, s≈2000 (the assay's worst point is 2004), s≈5060 (same side as
   5400), s≈6550 (same side as 6900). Skip the viaduct zone — a surprise on a
   parapeted deck is a wall, not a decision.
   *Accept:* `sim()` on ring no longer reads "underpriced": racing pays ≥2
   blind hits for its win, or the gap compresses under ~4s — and no policy
   wedges. Before: gap 11.38s, 1 blind hit, from a hazard set the brows never
   hide.

2. **Widen the rivals' pace spread.** On the Old Town the racing policy never
   passes a steady-0.9 rival in four laps (0 swaps) — 1.00–0.90 collapses to
   nothing on corner-capped circuits, so grid position decides the race. Set
   RUNNERS to span 1.00–0.85 (Wren 0.85, Ferreira 0.90, Pike 0.93; leaders
   unchanged), which is made easier or harder per driver, not per physics —
   the honest-opponent rule stands.
   *Accept:* the two-driver duel on oldtown (racing from 216 back vs Wren's
   numbers) produces a pass that STICKS — the faster head is ahead at the flag.
   Before: 0 swaps, never passed.

3. **Pay for pace against the circuit, not the wall clock.** The purse's pace
   term `(150 − lapSec) × 6` is track-blind, so the shortest race is the best
   farm per minute. Give each track spec a `refLap` (the measured clean racing
   lap: parade 40, oldtown 34, docks 41 wet, ring 36) and pay
   `max(0, (refLap + 12 − lapAvg) × 55)` — same headline number for an on-pace
   win, but earned against THIS circuit.
   *Accept:* estimated winning credits/minute across the four circuits spread
   under ~25% (was ~2x in the ring's favour).

4. **Rivals may not share a bodyshell.** They ghost through each other — 1,432
   overlap samples in one parade race, closest 13 voxels. Give the field a
   cheap pairwise separation: when two rivals' centres are inside ~40 voxels,
   push both apart along the line between them, a nudge per frame, no impulse
   physics. They already recover a line; let them also keep a lane.
   *Accept:* overlap samples (<40 voxels, 4Hz) under 100 per parade race.

## Part 2 — the hub becomes the pit lane

5. **RIDE OUT is the pit wall.** The track-select card gains the state of the
   campaign: money, fitted parts, and — when a season is live — the GP table
   with the next round marked. DOM, in the card's existing style; no new
   screens, no new keys.
   *Accept:* screenshot of the card mid-season showing table + purse + parts.

6. **The car sleeps outside the house.** Blit the player's car — their paint,
   from the save — parked at the kerb by the hero house, facing the way RIDE
   OUT sends you. It is the campaign made visible on the street; nothing else.
   Static, solid via the voxel world like every parked wagon.
   *Accept:* hub screenshot with the car at the kerb in the saved paint; paint
   change in the garage changes it on next visit.

Nothing else moves on the on-foot side. The round, the neighbours, the shops
stay exactly as they are.

## Part 3 — visual upgrades, from the screenshots

7. **The gantry runs the countdown.** The start lights live in the HUD; the
   gantry the grid stares at is decoration ("made the lights on the gantry a
   decoration" — main.js). Hang three lamps under the crossbar as scene
   sprites driven by the real countdown: red, red, red, all-green at GO, gone
   two seconds later. No voxel rebuild — lights only.
   *Accept:* two screenshots from the grid: lamps red during the count, green
   at go.

8. **The docks' sheds get a night face.** From the driving seat the dock-gate
   sheds are featureless black slabs — the one district that reads as unlit
   geometry rather than a sleeping building. Give D2.shed a high band of
   glazing (mostly dark, a few dim-warm panes) and one wall-pack lamp over the
   door end. Broken symmetry, not a grid — the cure for a flat box is windows
   that are mostly off.
   *Accept:* driving-seat screenshot at the dock gate where the shed reads as
   a building at night; no new blocked cells inside the carriageway (probe).

## Output

For each numbered item: what changed (files + mechanism), the accept
measurement before and after, and any regression the instruments caught
elsewhere. Close with the full four-track sweep + sim table, one line each.

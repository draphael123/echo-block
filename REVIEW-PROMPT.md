# DYNAMO — full review: level geometry, racing, core mechanics

You are reviewing a working game, not building one. Your job is to find what is
actually wrong — measured, reproduced, ranked — and to propose fixes with
acceptance criteria. Do not fix anything during the review. A finding without
evidence is a guess; log it as a guess or drop it.

## The game

ECHO BLOCK / DYNAMO: a voxel night-town hub (`index.html`) and a racing game
(`race.html`) in the style of Echo Generation. three.js r170, vendored locally.
Four circuits built from data specs (`src/race/tracks/*.js`) by one track
builder (`src/race/track.js`, ~1300 lines). Hand-rolled post chain, WebAudio
engine, six-car grids, a Grand Prix mode, one versioned save.

Serve the repo over http (`python -m http.server` or the existing launch
config — never file://) and open `race.html?track=<id>`.

| id | name | claim it must uphold | time | field |
|---|---|---|---|---|
| `parade` | The Parade | your beam is shorter than your braking distance | midnight | 6 |
| `oldtown` | The Old Town | the narrowness costs you (must place the car) | dusk | 4 |
| `docks` | The Docks | the wet changes the driving | dawn | 6 |
| `ring` | The Ring Road | the crests hide the road | sodium | 6 |

## Instruments you already have — use them before writing any new ones

All on `window.DYNAMO` once a track loads:

- `DYNAMO.assay()` — measures the track's own declared claim (`spec.asks`).
- `DYNAMO.sim()` — five driving policies race the circuit headless; returns
  times, contacts, finished, and a verdict on whether the dark/width/etc. is
  "doing work".
- `DYNAMO.parts()` — what each fully-fitted upgrade is worth on THIS track.
  A part that moves no number should not be for sale.
- `DYNAMO.place(s)` — teleport the player car to arc-length `s` for screenshots.
- `DYNAMO.track` — `path` (place/locate/at), `sections`, `hazards`, `elev(s)`,
  `roadHalf`, `spec`. `DYNAMO.ground` — `ceilingAt(x,z)`, `isBlocked(x,z)`.
- `DYNAMO.field` — the rival cars; `DYNAMO.gp` — the championship module.
- The console prints the carriageway audit at build time: every point where the
  road is blocked or the floor is off the tarmac, with s, u, and district.

Track coordinates are `(s, u)`: along and across. Anything spanning the road is
built in (s, u), never along a world axis — every axis-aligned shortcut in this
codebase has eventually put a wall in the carriageway.

## Hard-won rules — treat these as review axioms

1. **Measure before theorising.** Every expensive mistake in this project came
   from reasoning about code instead of probing the running game.
2. **Instruments lie in both directions.** The width assay once measured the
   *driver*, not the track; its thresholds were invented numbers until a human
   drove them. When an assay result disagrees with what a lap feels like,
   suspect the instrument first, then the track.
3. **Collision and rendering are separate truths.** `VoxWorld.set()` accepts any
   string; unknown material names collide but do not render (there is a console
   warning now — check for it). Conversely, meshes with no collision exist too.
   For every set piece, verify BOTH: raycast the visuals, probe `ground` for
   the collision.
4. **Verify a fix against the old code.** A test that passes before the fix
   proves nothing about the fix.
5. **The audit's exclusion windows go stale.** It ignores a ±window around
   declared hazards; if hazards grew, the window may hide real faults — or
   report the roadworks it was built to ignore.
6. **The camera is part of the geometry.** Chase cam sits `CAM.up = 84` above
   the car (× zoom 0.62–1.9), looks down, and DOF blurs by distance. Overhead
   structure must clear ~112; anything at 62–90 is a bar across the eye.
   Judge every set piece through screenshots, not the voxel data.
7. **Per-column floors.** The walk field measures each column from its lowest
   voxel. Solid geometry deep under the road drags the floor down and reads as
   undrivable; build shells, not slabs.

## Part 1 — level geometry

For **each of the four tracks**:

1. **Zero-tolerance audit pass.** Load the track, capture every carriageway
   audit error. The target is a clean console except for declared hazards.
   Current known residue to investigate (may be stale):
   - ring: ~15 points at s≈6132 (motorway), grade warning at s≈2080 (services)
   - docks: ~8 points at s≈8292 (sheds), points in quay near the ship, 35%
     grade warning at the ship ramp (s≈3960) — is the ramp actually drivable
     at speed, in both directions, wet?
   - parade: millyard residue near s≈2040–2160
2. **Sweep the full lap yourself.** Write a probe loop: for every `s` step 6,
   every `u` step 10 across the carriageway, compare `ceilingAt` to
   `elev(s)-1` and check `isBlocked`. Anything >6 off outside a hazard radius
   is a finding. Then repeat OFF the road: pavement and verge should be
   walkable (NPCs live there), and nothing should float (probe from above,
   compare to the ground the surround mesh claims).
3. **Screenshot every set piece from the driving seat** (`DYNAMO.place()` just
   before it, then again inside it): ship (docks), gatehouse + market hall
   (oldtown), viaduct (ring), mill yard (parade), both tunnels, the start
   gantry on all four. For each ask: does it read at speed? does anything cross
   the frame at eye level? does the collision match what you see (drive into
   the walls on purpose)? does the *approach* telegraph it before arrival?
4. **Seams.** Leg boundaries, deck/deckRamp transitions (ship at −34, viaduct
   at −240), tunnel mouths, the surround mesh against the apron. Look for
   cliffs in the ground mesh, water climbing onto structures, gaps showing the
   sky's below-horizon band.
5. **Elevation sanity.** For each profile: does it return to its start value
   with room to spare? Max grade under 22%? Do crests actually hide road on
   the ring (its assay), and NOT hide it fatally elsewhere?
6. **Build cost.** Record voxels + build ms per track (printed at boot). The
   Docks is ~9M voxels / ~13s — flag anything that regressed and the top
   candidates for shell-ing or culling.

## Part 2 — racing

1. **Watch full AI races.** Load each track, start the race, let it run
   without input (you'll finish last; that's fine). Watch the whole field for
   all laps. Findings to hunt: rivals wedged or respawning repeatedly, rivals
   stuck at a set piece, all rivals on one identical line (no racing), rivals
   driving through each other (they have no car-vs-car collision — is that
   visible/objectionable in practice?), pile-ups at hazards, cars falling off
   the viaduct or ship.
2. **Is overtaking real?** From the back of the grid, can the bot's own
   `racing` policy pass a `steady 0.90` rival on each track? Instrument it:
   run two drivers headless and log position swaps. If passing only happens
   when the leader crashes, the racing is a procession — finding.
3. **Drift boost economy.** Measure: time to bank each tier on each track's
   corner set, seconds gained per boost on the following straight, and whether
   tier 3 is ever reachable outside the ring's sweepers. A tier nobody can
   reach is dead content; a boost that beats simply gripping round the corner
   makes drifting mandatory — both are findings. Compare a boost-using lap vs
   a no-drift lap with the same driver.
4. **Contact model.** Drive into a rival at 60, 150, 280: is the player
   slowdown proportionate? Does the shunted rival recover its line? Shunt the
   same rival five times — permanent ruin or rubber-band recovery? Also
   traffic and pedestrians: strike costs, and whether the message/audio always
   fires.
5. **Standings and gaps.** Deliberately lap a slow rival: does P-position and
   the ±gap stay truthful across the wrap (progress uses lap×total+s — probe
   near s=0)? Does the finish order match what you watched?
6. **Grand Prix flow.** Start a season from RIDE OUT, play round 1, use N to
   advance, refresh mid-season and resume, abandon and restart. Check: points
   award (10-8-6-4-2-1) with a 4-car field on oldtown (does 4th get 4?),
   double-scoring on replaying a round, the champion payout, and what happens
   if you quit to the hub mid-round.
7. **Laps-per-track feel.** 3/4/3/2 was set by lap length; race each and judge
   total race duration (target 2.5–4 minutes). Note where a race outstays it.

## Part 3 — core mechanics

1. **Stuck states — the #1 recurring player complaint.** Adversarially try to
   get immovably stuck on each track: cones, skips, barriers, kerbs, the ship
   gunwale, gatehouse walls, viaduct parapet, tunnel walls, parked cars, the
   start gantry legs, off-road at the surround boundary. Rule: anything ≤18
   voxels should be climbable under throttle (with speed cost); walls should
   stop you but reverse must always free you. Log every spot where throttle +
   reverse cannot escape within 3 seconds. Check `wedged` respawn fires and
   lands on tarmac.
2. **Handling envelope.** Top speed, braking distance from V_MAX, off-road
   drag, wet multipliers, reverse. Verify each against what the HUD/feel
   implies. Then the interactions: wet + off-road, boost + wet, drift + climb.
3. **Upgrades.** Run `DYNAMO.parts()` on all four tracks. Every part must save
   measurable time on at least one track, and LAMPS specifically must matter
   on parade/ring and matter *less* on lit oldtown — that asymmetry is the
   design. Price vs purse: how many races to max a car? (Target: a season and
   a bit, not ten minutes, not ten hours.)
4. **Economy.** Purse for win/lose/clean/crashy at each track length; GP prize
   stack. Look for degenerate farming (shortest race replayed for max pay).
5. **NPCs and life.** Watch pedestrians near crossings and set pieces for ≥2
   minutes per track: walkers looping against obstacles (they have baulk
   memory now — does it hold?), jaywalkers dying repeatedly at one spot,
   ragdolls falling through geometry, dogs/traffic doing anything absurd.
6. **Save integrity.** Buy parts, set best laps on two tracks, mid-season GP,
   wardrobe look → hard refresh → everything intact. Then corrupt the save
   (`localStorage.setItem('dynamo.save','{')`) and confirm clean recovery.
7. **Performance.** Frame rate on each track at speed, in rain, at the
   viaduct's long sightline; shadow update stutter; memory across three
   track reloads (leaked geometries on rebuild).

## Known open questions to settle (from prior sessions)

- Parade `sim()` shows racing 44.39s/5 crashes vs cautious 37.97s/1 — after
  the width change, is racing *supposed* to lose by 6s? Is the hazard set now
  overtuned for the wider road?
- The skip power-over test reached `minSpeed: 0` (momentary stop) even though
  it got past. Decide: acceptable, or does climb cost need a floor?
- Old Town sim verdict: "TIED, the dark is not doing work" — fine, its claim
  is width, but check the two unlit legs (mews, back lane) still mean anything.
- Rivals ignore hazards' *lane memory* on wrap? (Driver `seen` map is keyed by
  hazard object, never cleared per lap — does dodge still work on lap 3?)

## Output format

Rank findings most-severe first. For each:

- **Finding** — one sentence.
- **Evidence** — the number, console line, or screenshot that proves it.
- **Repro** — track, `s`/`u` or action sequence.
- **Severity** — `blocker` (breaks a race) / `major` (breaks a mechanic or a
  track's claim) / `minor` (polish).
- **Suggested fix** — concrete, referencing the file and mechanism, honouring
  the axioms above (shells not slabs, (s,u) not world axes, per-track data not
  global constants).
- **Acceptance test** — the measurement that must change, and its target value.
  Every fix must be verifiable by an instrument or a screenshot, and must be
  checked against the *unfixed* code to prove the test can fail.

End with: the five fixes with the highest value-per-effort, and any place
where two findings share one underlying cause (fix the cause, not the sites).

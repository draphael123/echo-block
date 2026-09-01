# DYNAMO — The Juice & Geometry Pass

Two goals, one standard: every action the player takes should *answer back*
(juice), and every voxel in the world should visibly belong to the ground it
stands on (geometry). Plus one behavioural guarantee: no pedestrian is ever
trapped in a loop of walking into things.

## Part 1 — JUICE

The test for every item: does the game acknowledge the player's action within
100ms, in at least two senses (sight + sound, sight + touch)? Work the list
in this order — impact feel first, because collisions happen every lap.

1. **Impacts answer back.** A hard hit gets a hit-stop (a few tens of ms of
   frozen sim — long enough to feel, short enough to never notice as lag), a
   directional camera punch away from the contact, and a chromatic-aberration
   kick through the post chain that decays over ~0.3s. The post pipeline
   already has an `aberration` param — drive it, don't add a new effect.
2. **The boost is an event.** Pad pickup and drift-bank release both: screen
   kick (exists), aberration pulse, streak surge (exists), and a rising
   pitch on the engine for the boost's duration.
3. **Drifting smokes.** A particle puff train from the rear wheels while the
   slip angle is live — the drift reads from the car, not just the HUD.
4. **The lights go out properly.** Countdown beeps rise in pitch; GO gets a
   camera push-in and a bass thump. The first second of a race should feel
   like a starting gun, not a state change.
5. **Overtakes ring.** Position gained: a two-note up-chirp. Lost: down.
   The pops exist; give them a voice.
6. **Menus move.** The title breathes, rows slide on hover, entering a race
   fades through black instead of cutting. The menu is the first 10 seconds
   of every session; it sets the quality expectation for the rest.
7. **Settings exist.** The pause menu carries four toggles, persisted in the
   save: music, sound effects, camera shake, wind streaks. A player who gets
   motion-sick from the shake currently has no recourse; that is not polish,
   it is accessibility.

## Part 2 — GEOMETRY GROUNDING

The failure class: props placed at one anchor height on ground that slopes —
the far end floats or buries. The relief pass made every circuit hillier, so
every span-placed prop is now suspect.

8. **Audit, don't eyeball.** A build-time float/bury audit alongside the
   carriageway audit: sample the prop band (|u| from ROAD_HALF to SET+140)
   at 6-voxel pitch; for each column with content, find its lowest voxel; if
   it hangs more than 3 above the local ground surface and is not part of a
   declared overhead (gantries, bunting, bridges, crossbars all live above
   60), report it with s, u, district, and hang height. Same for buried:
   content whose base sits more than 6 BELOW the surface. Print counts per
   district; the worst three districts get fixed, the rest get judged.
9. **Fix by construction, not by nudging.** A hedge that floats on a grade is
   a hedge segment that is too long for the grade — shorten the marched
   segment or march per-point. A bench on a knoll needs its own gy, not the
   district's. Prefer fixes in the builder so every circuit inherits them.
10. **Verify the fixed world.** Re-run the audit after fixes; then lap every
    circuit with the harness (zero wedges, times within family) and shoot
    the three worst former offenders for the record.

## Part 3 — NOBODY WALKS INTO A WALL FOREVER

11. **The give-up rule.** A walker who has baulked repeatedly in a short
    window — blocked at both ends, blocked crossing, penned by parked cars —
    stops trying: they go home. Fade them out, reset them to their home spot
    on their own pavement, clear their learned limits. A person who cannot
    get where they were going gives up; only a bug keeps walking into the
    same wall.
12. **Verify with a soak.** Run the walker population at 20x for several
    sim-minutes on each circuit; assert no walker ends inside the
    carriageway band without being a zebra crosser, and no walker's baulk
    counter is still climbing at the end.

## Output

Each item: done, with evidence (measurement, screenshot, or soak result) —
or explicitly deferred with the reason. Then commit and deploy.

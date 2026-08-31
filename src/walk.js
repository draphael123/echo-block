// Walking on a voxel street.
//
// Collision runs against a field derived from the voxels that were actually
// built, rather than a hand-maintained list of boxes. Anything anyone builds
// is automatically solid, which matters here because the scene is assembled
// from sixty different prop functions and nobody is going to keep a parallel
// list of colliders honest.
//
// Two rules do all of it:
//   step  — you can climb a kerb or a porch tread, and nothing taller
//   head  — you can only stand where there is clear space above the floor
//
// The second rule is what makes a doorway a doorway. With a plain height map,
// the column under a lintel is as tall as the wall beside it and you can never
// walk through anything.
export const STEP_UP = 4;          // ~32cm: a kerb or a porch tread
const OUT = 999;                   // outside the field: the edge of the world
const VOID = -999;                 // inside the field, but nothing built here
export const FLOOR_MAX = 14;       // the highest surface that counts as a floor
export const HEAD = 19;            // body height, in voxels

const PROBE = [                    // points around a BODY
  [0, 0], [3.4, 0], [-3.4, 0], [0, 3.4], [0, -3.4],
  [2.4, 2.4], [-2.4, 2.4], [2.4, -2.4], [-2.4, -2.4],
];
// A car is 26 voxels wide and 58 long; testing it with a person's 7-voxel
// ring means it drives through the corner of things. Scale is passed in
// rather than baked so one field serves both.
const scaled = (k) => PROBE.map(([a, b]) => [a * k, b * k]);
const RINGS = new Map([[1, PROBE]]);
function ring(scale) {
  if (!RINGS.has(scale)) RINGS.set(scale, scaled(scale));
  return RINGS.get(scale);
}

export class Ground {
  constructor(field) { this.f = field; }

  index(x, z) {
    const f = this.f;
    const i = Math.round(x) - f.x0, k = Math.round(z) - f.z0;
    if (i < 0 || i >= f.w || k < 0 || k >= f.d) return -1;
    return i * f.d + k;
  }

  // OUT and VOID are different things and conflating them cost an evening.
  // Off the plate is the edge of the world and must stop you. A column
  // inside the plate with nothing recorded is a one-voxel PINHOLE in a
  // generated surface — and treating that as a wall means a bike doing
  // 35km/h slams to a halt in the middle of an apparently clear road.
  floorAt(x, z) {
    const i = this.index(x, z);
    if (i < 0) return OUT;
    return this.f.floor[i];                      // may be VOID
  }

  isBlocked(x, z) {
    const i = this.index(x, z);
    return i < 0 || this.f.blocked[i] === 1;
  }

  // The tallest floor the body would be standing on at (x,z), ignoring
  // pinholes — one missing voxel must not decide where your feet are.
  ceilingAt(x, z, scale = 1) {
    let top = VOID;
    for (const [ox, oz] of ring(scale)) {
      const h = this.floorAt(x + ox, z + oz);
      if (h === VOID || h === OUT) continue;
      if (h > top) top = h;
    }
    return top === VOID ? 0 : top;
  }

  // Can a body currently standing on floor `from` occupy (x,z)?
  // stepUp is a parameter because a CAR is not a person. A traffic cone is
  // nine voxels tall — over a person's 4-voxel step and therefore a wall to
  // them, which is right — but a car flattens cones, and treating one as a
  // kerb it cannot climb is how you end up permanently stopped by a cone.
  canStand(x, z, from, scale = 1, stepUp = STEP_UP) {
    for (const [ox, oz] of ring(scale)) {
      const px = x + ox, pz = z + oz;
      const h = this.floorAt(px, pz);
      if (h === OUT) return false;               // the edge of the world
      if (h === VOID) continue;                  // a pinhole; step over it
      if (this.isBlocked(px, pz)) return false;
      if (h - from > stepUp) return false;
    }
    return true;
  }

  // Move with wall-sliding: try the whole step, then each axis alone. Without
  // the per-axis retry you stick to every hedge you brush against.
  move(pos, dx, dz, blockers, scale = 1, stepUp = STEP_UP) {
    let from = this.floorAt(pos.x, pos.z);
    if (from === VOID || from === OUT) from = this.ceilingAt(pos.x, pos.z, scale);
    const free = (x, z) => this.canStand(x, z, from, scale, stepUp) && !(blockers && blockers(x, z));

    if (free(pos.x + dx, pos.z + dz)) { pos.x += dx; pos.z += dz; }
    else if (free(pos.x + dx, pos.z)) pos.x += dx;
    else if (free(pos.x, pos.z + dz)) pos.z += dz;

    pos.y = Math.max(0, this.ceilingAt(pos.x, pos.z, scale));
    return pos;
  }
}

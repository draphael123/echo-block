// Closing a loop, for any shape rather than one shape.
//
// The first circuit's straights were solved BY HAND: four ninety-degree corners
// with axis-aligned sides close exactly when the opposite spans match, so I
// derived two lengths on paper and wrote them in. That worked for a rounded
// rectangle and for nothing else, which is a problem the moment there is a
// second track — an old town wants tight corners at odd angles and a ring road
// wants long sweepers, and neither is a rectangle.
//
// It does not need a solver in the iterative sense. Once the ARCS are fixed the
// heading at every point along the loop is fixed too, so a straight of length L
// contributes exactly L * (sin h, cos h) with h known in advance. The end point
// is therefore a LINEAR function of the free straight lengths, and closing the
// loop is a 2x2 solve. Exact, instant, and it works for any shape whose arcs
// already turn through a full circle.
const D2R = Math.PI / 180;

// ops: [{ straight: n } | { arc: deg, r: n }], in order.
// free: the indices of the two straights whose lengths we are solving for.
// This mirrors Path.arc/Path.straight EXACTLY, discretisation and all, rather
// than using the continuous arc formula. The solver has to model the thing that
// gets built or the loop closes on paper and not on the ground.
const STEP = 4;

function walk(ops, lengths) {
  let x = 0, z = 0, h = 0;
  ops.forEach((op, i) => {
    if (op.straight !== undefined) {
      const L = lengths[i] !== undefined ? lengths[i] : op.straight;
      x += Math.sin(h) * L;                       // n steps of L/n sum to L
      z += Math.cos(h) * L;
    } else {
      const rad = op.arc * D2R;
      const len = Math.abs(rad) * op.r;
      const n = Math.max(2, Math.round(len / STEP));
      const dh = rad / n, seg = len / n;
      for (let k = 0; k < n; k++) { h += dh; x += Math.sin(h) * seg; z += Math.cos(h) * seg; }
    }
  });
  return { x, z, h };
}

export function solveClosure(ops, free) {
  const [i, j] = free;
  const zero = {}; zero[i] = 0; zero[j] = 0;
  const base = walk(ops, zero);

  const oneI = { ...zero }; oneI[i] = 1;
  const oneJ = { ...zero }; oneJ[j] = 1;
  const di = walk(ops, oneI), dj = walk(ops, oneJ);
  // unit contribution of each free straight
  const ax = di.x - base.x, az = di.z - base.z;
  const bx = dj.x - base.x, bz = dj.z - base.z;

  // base + a*Li + b*Lj = 0
  const det = ax * bz - az * bx;
  if (Math.abs(det) < 1e-9) {
    console.error('shape: the two free straights are parallel, so the loop cannot be closed by adjusting them');
    return null;
  }
  const Li = (-base.x * bz + base.z * bx) / det;
  const Lj = (-ax * base.z + az * base.x) / det;
  if (Li < 40 || Lj < 40) {
    console.error('shape: closure wants a negative or silly straight ('
      + Math.round(Li) + ', ' + Math.round(Lj) + ') - adjust the radii or the fixed straights');
  }
  return { [i]: Li, [j]: Lj };
}

// Total turning must be a full circle or the loop cannot close at all, and that
// is worth catching separately because the failure looks like bad arithmetic
// rather than like a shape that was never going to work.
export function checkTurning(ops) {
  const total = ops.reduce((a, o) => a + (o.arc || 0), 0);
  if (Math.abs(Math.abs(total) - 360) > 0.01) {
    console.error('shape: arcs turn through ' + total + ' degrees, not 360 - this loop cannot close');
    return false;
  }
  return true;
}

// Resolve a shape into concrete leg lengths, ready to feed to Path.
export function resolve(spec) {
  const ops = spec.ops;
  checkTurning(ops);
  const solved = spec.free ? solveClosure(ops, spec.free) : {};
  return ops.map((op, i) => {
    if (op.straight === undefined) return { ...op, len: Math.abs(op.arc) * D2R * op.r };
    const L = solved[i] !== undefined ? solved[i] : op.straight;
    return { ...op, straight: L, len: L };
  });
}

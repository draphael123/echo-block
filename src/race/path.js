// A track centreline, as a polyline you build out of straights and arcs.
//
// Everything downstream wants the same three things: where am I at arc-length
// s, which way is the track pointing there, and which way is sideways. Doing
// that from a polyline with a cumulative length table is exact enough at voxel
// resolution and avoids a spline library for the sake of four corners.
//
// It also gives the race its coordinate system for free: hazards, lights,
// scenery, the start line and the timer are all placed in (s, u) — along the
// track and across it — rather than in world x/z, so moving a corner does not
// move forty other things by hand.
const STEP = 4;                       // polyline resolution, in voxels

export class Path {
  constructor(x = 0, z = 0, headingDeg = 180) {
    this.pts = [];
    this.x = x; this.z = z;
    this.h = headingDeg * Math.PI / 180;
    this.marks = [];                  // named arc positions, for sections
    this._push();
  }

  _push() { this.pts.push(this.x, this.z); }

  straight(len) {
    const n = Math.max(1, Math.round(len / STEP));
    const dx = Math.sin(this.h) * (len / n), dz = Math.cos(this.h) * (len / n);
    for (let i = 0; i < n; i++) { this.x += dx; this.z += dz; this._push(); }
    return this;
  }

  // Positive degrees turn one way, negative the other. Radius is to the
  // centreline, so the road's outer edge sweeps wider — which is what makes a
  // corner cost you speed.
  arc(deg, radius) {
    const rad = deg * Math.PI / 180;
    const len = Math.abs(rad) * radius;
    const n = Math.max(2, Math.round(len / STEP));
    const dh = rad / n;
    for (let i = 0; i < n; i++) {
      this.h += dh;
      this.x += Math.sin(this.h) * (len / n);
      this.z += Math.cos(this.h) * (len / n);
      this._push();
    }
    return this;
  }

  mark(name) { this.marks.push({ name, s: this._lengthSoFar() }); return this; }

  _lengthSoFar() {
    let L = 0;
    for (let i = 2; i < this.pts.length; i += 2) {
      L += Math.hypot(this.pts[i] - this.pts[i - 2], this.pts[i + 1] - this.pts[i - 1]);
    }
    return L;
  }

  build() {
    const p = this.pts, n = p.length / 2;
    const cum = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      cum[i] = cum[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
    }
    const total = cum[n - 1];
    const marks = this.marks;

    // Sampling walks the table with a hint index, because every consumer asks
    // for s in increasing order — a binary search here would be slower.
    let hint = 0;
    function at(s, out) {
      s = ((s % total) + total) % total;      // the circuit is closed
      if (cum[hint] > s) hint = 0;
      while (hint < n - 2 && cum[hint + 1] < s) hint++;
      const i = hint;
      const seg = cum[i + 1] - cum[i] || 1;
      const f = (s - cum[i]) / seg;
      const x0 = p[i * 2], z0 = p[i * 2 + 1], x1 = p[i * 2 + 2], z1 = p[i * 2 + 3];
      out.x = x0 + (x1 - x0) * f;
      out.z = z0 + (z1 - z0) * f;
      const tl = Math.hypot(x1 - x0, z1 - z0) || 1;
      out.tx = (x1 - x0) / tl; out.tz = (z1 - z0) / tl;
      out.nx = out.tz; out.nz = -out.tx;         // left-hand normal
      return out;
    }

    // Nearest point on the track to a world position, as (s, u). Used to know
    // how far round the rider is and how far off the racing line — a search
    // seeded from the last answer, because a bike does not teleport.
    // The search WRAPS. A closed circuit is the normal case, and clamping the
    // window to [0, total] means s pins to the end of the lap and never comes
    // back round to zero — which presents as "the lap counter never ticks"
    // rather than as anything to do with searching.
    const wrap = (s) => ((s % total) + total) % total;
    function locate(wx, wz, fromS) {
      let bestS = fromS, bestD = Infinity;
      const probe = { x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0 };
      for (let d = -240; d <= 400; d += 6) {
        const s = wrap(fromS + d);
        at(s, probe);
        const dd = (probe.x - wx) ** 2 + (probe.z - wz) ** 2;
        if (dd < bestD) { bestD = dd; bestS = s; }
      }
      for (let d = -6; d <= 6; d += 1) {
        const s = wrap(bestS + d);
        at(s, probe);
        const dd = (probe.x - wx) ** 2 + (probe.z - wz) ** 2;
        if (dd < bestD) { bestD = dd; bestS = s; }
      }
      at(bestS, probe);
      const u = (wx - probe.x) * probe.nx + (wz - probe.z) * probe.nz;
      return { s: bestS, u, d: Math.sqrt(bestD) };
    }

    // world position of a point given in track coordinates
    function place(s, u, out) {
      at(s, out);
      out.x += out.nx * u;
      out.z += out.nz * u;
      return out;
    }

    return { at, locate, place, total, marks, points: p };
  }
}

export const frame = () => ({ x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0 });

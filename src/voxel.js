// A tiny voxel world: a sparse grid, a handful of solid primitives, a
// string-based prop DSL, and a face-culling mesher with per-vertex AO.
//
// The rule the whole look depends on: EVERY voxel in the scene is the same
// size. There is no finer resolution for small props. A mailbox latch and a
// roof gable are built out of the same cube. Break this and the diorama read
// collapses into "generic voxel game".
import * as THREE from 'three';

// The addressable world, in voxels either side of the origin. This was 512 —
// fine for one street, and it SILENTLY CORRUPTED the moment a race track ran
// past it: a coordinate outside the range makes the packed key borrow from the
// next field, so voxels land on top of each other in a completely different
// part of the world and nothing anywhere throws. 4096 is +/-327m, and the
// bounds check below means the next time it is not enough, it says so.
const OFF = 4096, SPAN = 8192;
let warned = false;
const key = (x, y, z) => {
  if (!warned && (x < -OFF || x >= OFF || y < -OFF || y >= OFF || z < -OFF || z >= OFF)) {
    warned = true;
    console.error('VoxWorld: (' + x + ', ' + y + ', ' + z + ') is outside +/-' + OFF
      + ' — raise OFF/SPAN in voxel.js. Voxels past the edge land somewhere else entirely.');
  }
  return ((x + OFF) * SPAN + (y + OFF)) * SPAN + (z + OFF);
};

// Deterministic per-voxel hash. Drives the value jitter that keeps big flat
// walls from reading as untextured polygons.
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export { hash3 };

// Unit-cube face tables. Vertex order is CCW seen from outside.
// t = the two tangent axes, used to find the AO neighbours of each corner.
const FACES = [
  { d: [ 1, 0, 0], t: [1, 2], v: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]] },
  { d: [-1, 0, 0], t: [1, 2], v: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
  { d: [ 0, 1, 0], t: [0, 2], v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
  { d: [ 0,-1, 0], t: [0, 2], v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { d: [ 0, 0, 1], t: [0, 1], v: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  { d: [ 0, 0,-1], t: [0, 1], v: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] },
];
const AO_LEVEL = [0.42, 0.64, 0.82, 1.0];

export class VoxWorld {
  constructor() { this.v = new Map(); }

  set(x, y, z, c) { if (c) this.v.set(key(x | 0, y | 0, z | 0), c); }
  get(x, y, z) { return this.v.get(key(x | 0, y | 0, z | 0)); }
  clear(x, y, z) { this.v.delete(key(x | 0, y | 0, z | 0)); }
  get size() { return this.v.size; }

  // Solid axis-aligned box. w/h/d are voxel counts along x/y/z.
  // `c` may be a function (x,y,z) => name, for banding, speckle and wear.
  box(x, y, z, w, h, d, c) {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) for (let k = 0; k < d; k++) {
      const n = typeof c === 'function' ? c(x + i, y + j, z + k) : c;
      if (n) this.set(x + i, y + j, z + k, n);
    }
    return this;
  }

  // Hollow box: walls only, `t` voxels thick. House shells use this so the
  // interior stays empty and a lit window reads as a room, not a solid block.
  shell(x, y, z, w, h, d, t, c, opts) {
    const { top = true, bottom = true } = opts || {};
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) for (let k = 0; k < d; k++) {
      const edgeX = i < t || i >= w - t, edgeZ = k < t || k >= d - t;
      const edgeY = (bottom && j < t) || (top && j >= h - t);
      if (!(edgeX || edgeZ || edgeY)) continue;
      const n = typeof c === 'function' ? c(x + i, y + j, z + k) : c;
      if (n) this.set(x + i, y + j, z + k, n);
    }
    return this;
  }

  // Carve a hole: window, door, gap.
  cut(x, y, z, w, h, d) {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) for (let k = 0; k < d; k++)
      this.clear(x + i, y + j, z + k);
    return this;
  }

  // Gabled roof running along X, ridge down the middle of the Z span.
  gable(x, y, z, w, d, c, opts) {
    const { eave = 0, thick = 3 } = opts || {};
    const half = Math.ceil(d / 2);
    for (let k = -eave; k < d + eave; k++) {
      const fromEdge = Math.min(k, d - 1 - k);
      const rise = Math.max(0, Math.min(half, fromEdge + eave));
      for (let t = 0; t < thick; t++) {
        const yy = y + rise - t;
        for (let i = -eave; i < w + eave; i++) {
          const n = typeof c === 'function' ? c(x + i, yy, z + k) : c;
          if (n) this.set(x + i, yy, z + k, n);
        }
      }
    }
    return this;
  }

  // Stamp a DSL prop. layers[y][z][x]; '.' and ' ' are empty.
  stamp(prop, ox, oy, oz, opts) {
    const { rot = 0, mirror = false } = opts || {};
    const { pal, layers } = prop;
    const h = layers.length, d = layers[0].length, w = layers[0][0].length;
    for (let j = 0; j < h; j++) for (let k = 0; k < d; k++) {
      const row = layers[j][k];
      if (!row) continue;
      for (let i = 0; i < w; i++) {
        const ch = row[i];
        if (!ch || ch === '.' || ch === ' ') continue;
        const name = pal[ch];
        if (!name) continue;
        const px = mirror ? w - 1 - i : i, pz = k;
        let qx = px, qz = pz;
        if (rot === 90)  { qx = d - 1 - pz; qz = px; }
        if (rot === 180) { qx = w - 1 - px; qz = d - 1 - pz; }
        if (rot === 270) { qx = pz;         qz = w - 1 - px; }
        this.set(ox + qx, oy + j, oz + qz, name);
      }
    }
    return this;
  }

  // Stamp another world into this one, optionally mirrored in Z.
  //
  // Some builders only make sense written facing one way — a shopfront has a
  // stall riser, a fascia and an awning that all have to agree about which
  // side is "out". Rather than thread a direction through every line of one,
  // build it once at the origin and blit it in flipped.
  // rotY is 0/90/180/270 about the Y axis. Together with mirrorZ this turns a
  // builder written to face ONE way into something you can place facing any
  // way — which is what lets a race track reuse the hub'''s houses instead of
  // growing its own worse ones.
  merge(other, opts) {
    const { ox = 0, oy = 0, oz = 0, mirrorZ = false, rotY = 0 } = opts || {};
    for (const [k, name] of other.v) {
      let z = (k % SPAN) - OFF;
      const y = (Math.floor(k / SPAN) % SPAN) - OFF;
      let x = Math.floor(k / (SPAN * SPAN)) - OFF;
      if (mirrorZ) z = -z;
      if (rotY === 90) { const t = x; x = -z; z = t; }
      else if (rotY === 180) { x = -x; z = -z; }
      else if (rotY === 270) { const t = x; x = z; z = -t; }
      this.set(x + ox, y + oy, z + oz, name);
    }
    return this;
  }

  // A top-down field for walking on: per column, the FLOOR you would stand on
  // and whether there is HEADROOM above it.
  //
  // A single "highest voxel" number cannot express a doorway — the lintel is
  // higher than the floor, so the column looks as solid as the wall beside it.
  // Two passes fix that: first the highest surface at or below `floorMax`
  // (ground, kerb, a porch deck, a shop floor), then whether anything sits in
  // the `head` voxels directly above it. A door has a floor and clear
  // headroom; a wall has no gap; a tree canopy and an overhead wire are far
  // enough above the floor to be walked under.
  walkField(x0, x1, z0, z1, floorMax, head) {
    const w = x1 - x0, d = z1 - z0;
    const floor = new Int16Array(w * d).fill(-999);
    const blocked = new Uint8Array(w * d);
    const cells = [];
    for (const k of this.v.keys()) {
      const z = (k % SPAN) - OFF;
      const x = Math.floor(k / (SPAN * SPAN)) - OFF;
      if (x < x0 || x >= x1 || z < z0 || z >= z1) continue;
      const y = (Math.floor(k / SPAN) % SPAN) - OFF;
      const i = (x - x0) * d + (z - z0);
      cells.push(i, y);
      if (y <= floorMax && y > floor[i]) floor[i] = y;
    }
    for (let n = 0; n < cells.length; n += 2) {
      const i = cells[n], y = cells[n + 1], f = floor[i];
      if (f === -999) continue;
      if (y > f && y <= f + head) blocked[i] = 1;
    }
    return { x0, z0, w, d, floor, blocked };
  }

  // solidBelow  — treat everything under this height as filled. Gives props
  //               correct contact AO where they meet the ground slab.
  // noFloorBelow — drop every downward-facing quad at or below this height.
  //               The underside of the ground plate is never visible from any
  //               camera above it, and at street scale it is HALF the ground's
  //               triangles; this lets the plate be one voxel thick instead of
  //               four, which is the difference between 3M voxels and 1M.
  // Face-culled mesh with per-vertex AO, split into a matte geometry (lit by
  // the scene) and a glow geometry (unlit, feeds the bloom pass). They must be
  // separate: three's emissive is a per-MATERIAL uniform, so one mesh cannot
  // have some voxels emit and others not.
  build(palette, opts) {
    const { solidBelow = -Infinity, noFloorBelow = -Infinity } = opts || {};
    const out = {
      matte: { pos: [], nrm: [], col: [], ind: [] },
      glow:  { pos: [], nrm: [], col: [], ind: [] },
    };
    const solid = (x, y, z) => y < solidBelow || this.v.has(key(x, y, z));

    for (const [k, name] of this.v) {
      const z = (k % SPAN) - OFF;
      const y = (Math.floor(k / SPAN) % SPAN) - OFF;
      const x = Math.floor(k / (SPAN * SPAN)) - OFF;
      const spec = palette[name];
      if (!spec) continue;
      const emissive = spec.emit > 0;
      const bin = emissive ? out.glow : out.matte;
      const jitter = 1 + (hash3(x, y, z) - 0.5) * (emissive ? 0.05 : spec.jitter);

      for (const f of FACES) {
        const nx = x + f.d[0], ny = y + f.d[1], nz = z + f.d[2];
        if (solid(nx, ny, nz)) continue;
        if (f.d[1] === -1 && y <= noFloorBelow) continue;

        const ao = [3, 3, 3, 3];
        if (!emissive) {
          for (let c = 0; c < 4; c++) {
            const p = f.v[c];
            const a = [0, 0, 0], b = [0, 0, 0];
            a[f.t[0]] = p[f.t[0]] === 1 ? 1 : -1;
            b[f.t[1]] = p[f.t[1]] === 1 ? 1 : -1;
            const s1 = solid(nx + a[0], ny + a[1], nz + a[2]) ? 1 : 0;
            const s2 = solid(nx + b[0], ny + b[1], nz + b[2]) ? 1 : 0;
            const cn = solid(nx + a[0] + b[0], ny + a[1] + b[1], nz + a[2] + b[2]) ? 1 : 0;
            ao[c] = (s1 && s2) ? 0 : 3 - (s1 + s2 + cn);
          }
        }

        const base = bin.pos.length / 3;
        for (let c = 0; c < 4; c++) {
          const p = f.v[c];
          bin.pos.push(x + p[0], y + p[1], z + p[2]);
          bin.nrm.push(f.d[0], f.d[1], f.d[2]);
          const s = jitter * AO_LEVEL[ao[c]] * spec.gain;
          bin.col.push(spec.rgb[0] * s, spec.rgb[1] * s, spec.rgb[2] * s);
        }
        // Split the quad across the darker diagonal, or the AO gradient shows
        // up as a hard crease running through flat walls.
        const i = base;
        if (ao[0] + ao[2] < ao[1] + ao[3])
          bin.ind.push(i, i + 1, i + 3, i + 1, i + 2, i + 3);
        else
          bin.ind.push(i, i + 1, i + 2, i, i + 2, i + 3);
      }
    }

    const geo = (bin) => {
      if (!bin.pos.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(bin.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(bin.nrm, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(bin.col, 3));
      g.setIndex(bin.ind);
      g.computeBoundingSphere();
      return g;
    };
    return { matte: geo(out.matte), glow: geo(out.glow) };
  }
}

// Build the mesh pair for a world. Matte is a standard material driven
// entirely by vertex colour; glow is unlit and deliberately allowed past 1.0
// so the bloom pass has something to catch.
export function meshWorld(world, palette, opts) {
  const { shadows = true, name = 'vox', solidBelow, noFloorBelow } = opts || {};
  const { matte, glow } = world.build(palette, { solidBelow, noFloorBelow });
  const group = new THREE.Group();
  group.name = name;
  if (matte) {
    const m = new THREE.Mesh(matte, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.94, metalness: 0.0,
    }));
    m.castShadow = shadows; m.receiveShadow = shadows;
    m.name = name + ':matte';
    group.add(m);
  }
  if (glow) {
    const m = new THREE.Mesh(glow, new THREE.MeshBasicMaterial({
      vertexColors: true, toneMapped: false,
    }));
    m.name = name + ':glow';
    group.add(m);
  }
  return group;
}

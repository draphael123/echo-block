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
const CHUNK_SPAN = 4096;

const FACES = [
  { d: [ 1, 0, 0], t: [1, 2], v: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]] },
  { d: [-1, 0, 0], t: [1, 2], v: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
  { d: [ 0, 1, 0], t: [0, 2], v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
  { d: [ 0,-1, 0], t: [0, 2], v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { d: [ 0, 0, 1], t: [0, 1], v: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  { d: [ 0, 0,-1], t: [0, 1], v: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] },
];
const AO_LEVEL = [0.42, 0.64, 0.82, 1.0];

// A MATERIAL THE PALETTE DOES NOT KNOW.
//
// set() stores whatever string it is handed and the mesher used to skip an
// unknown one in silence, which means a typo -- or a name you were sure existed
// -- produces geometry that COLLIDES AND DOES NOT RENDER. That is the worst
// possible failure: an invisible wall. Four set pieces shipped that way and it
// took a raycast down through the middle of a gatehouse to find out.
//
// Warned once per name, because it fires per voxel.
const UNKNOWN = new Set();
function unknown(name) {
  if (UNKNOWN.has(name)) return;
  UNKNOWN.add(name);
  console.error(`voxel: no palette entry for "${name}" — those voxels will `
    + 'collide but not render. Check the name against palette.js.');
}

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
  // floorMax is measured from the GROUND IN THIS COLUMN, not from y = 0.
  //
  // It used to be absolute, which was invisible while the world was flat and
  // wrong the moment it was not. Raising it to clear a four-metre hill promoted
  // every tree canopy and every roof to "floor": a canopy at +25 over a road at
  // -21 became a 46-voxel cliff in the middle of the carriageway that the car
  // could neither drive through nor climb, and it was not marked BLOCKED either,
  // so nothing caught it. Measuring from the lowest voxel in the column makes
  // the field say what it always meant — "you can step up onto anything within
  // floorMax of the ground here" — at any altitude, and lets you drive under a
  // tree again.
  walkField(x0, x1, z0, z1, floorMax, head) {
    const w = x1 - x0, d = z1 - z0;
    const floor = new Int16Array(w * d).fill(-999);
    const low = new Int16Array(w * d).fill(32000);
    const blocked = new Uint8Array(w * d);
    const cells = [];
    for (const k of this.v.keys()) {
      const z = (k % SPAN) - OFF;
      const x = Math.floor(k / (SPAN * SPAN)) - OFF;
      if (x < x0 || x >= x1 || z < z0 || z >= z1) continue;
      const y = (Math.floor(k / SPAN) % SPAN) - OFF;
      const i = (x - x0) * d + (z - z0);
      cells.push(i, y);
      if (y < low[i]) low[i] = y;
    }
    for (let n = 0; n < cells.length; n += 2) {
      const i = cells[n], y = cells[n + 1];
      if (y <= low[i] + floorMax && y > floor[i]) floor[i] = y;
    }
    for (let n = 0; n < cells.length; n += 2) {
      const i = cells[n], y = cells[n + 1], f = floor[i];
      if (f === -999) continue;
      if (y > f && y <= f + head) blocked[i] = 1;
    }
    return { x0, z0, w, d, floor, blocked };
  }

  // Sort every voxel into a square column of the world, once. Chunking has to
  // start here: meshing each chunk by scanning the whole map would be O(chunks
  // x voxels) and slower than the single mesh it is meant to replace.
  bucket(size) {
    const cells = new Map();
    for (const k of this.v.keys()) {
      const z = (k % SPAN) - OFF;
      const x = Math.floor(k / (SPAN * SPAN)) - OFF;
      // packed so a neighbour's id is +/-1 and +/-CHUNK_SPAN away
      const id = (Math.floor(x / size) + 2048) * CHUNK_SPAN + (Math.floor(z / size) + 2048);
      let list = cells.get(id);
      if (!list) cells.set(id, (list = []));
      list.push(k);
    }
    return cells;
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
  // `only` is a list of voxel keys to emit faces FOR. Neighbour tests still run
  // against the whole world, so a chunk meshed this way has no faces along its
  // seams and no gaps either — it is exactly the slice of the single mesh that
  // falls inside it. That is the whole trick behind chunking this world.
  build(palette, opts) {
    const { solidBelow = -Infinity, noFloorBelow = -Infinity, only = null } = opts || {};
    const V = this.v;

    // Meshing was 16.2 of the circuit's 19.5 second build -- 83% of it -- so
    // this loop is where the whole build time actually lives. Three things were
    // costing it, and all three are in here rather than in anything clever:
    //
    //   1. Array.push. Eight and a half million faces at forty-two pushes each
    //      is 370 million calls onto growing plain arrays. These are typed
    //      arrays that double when full, written by index.
    //   2. key() ran a six-comparison bounds check on every neighbour test, and
    //      there are twenty-odd per voxel. Inside the mesher every coordinate is
    //      in range by construction, so this inlines the packing and skips it.
    //   3. Ambient occlusion sampled twelve neighbours per face when there are
    //      only EIGHT distinct ones -- the four corners share their edges.
    // A Map lookup on these packed keys measures at 161 nanoseconds; a typed
    // array read is 2.9. At roughly twenty-six neighbour tests per voxel over
    // five million voxels that is the difference between twenty-one seconds of
    // hashing and half a second of indexing, and it was the ENTIRE build time.
    //
    // So when meshChunks hands us a dense grid of the chunk plus a one-voxel
    // margin — one voxel is all the face culling and the ambient occlusion ever
    // reach — we index it instead. Without one we fall back to the map, which
    // is what the hub and the small prop worlds still use.
    const d = opts && opts.dense;
    let solid;
    if (d) {
      const { grid, x0, y0, z0, sx, sy, sz } = d;
      const strideX = sy * sz;
      solid = (x, y, z) => {
        if (y < solidBelow) return true;
        const lx = x - x0, ly = y - y0, lz = z - z0;
        if (lx < 0 || ly < 0 || lz < 0 || lx >= sx || ly >= sy || lz >= sz) return false;
        return grid[lx * strideX + ly * sz + lz] !== 0;
      };
    } else {
      const has = (x, y, z) => V.has(((x + OFF) * SPAN + (y + OFF)) * SPAN + (z + OFF));
      solid = (x, y, z) => y < solidBelow || has(x, y, z);
    }

    // A geometry bin backed by typed arrays that grow geometrically.
    const bin = () => ({
      pos: new Float32Array(1 << 14), nrm: new Float32Array(1 << 14),
      col: new Float32Array(1 << 14), ind: new Uint32Array(1 << 14),
      nv: 0, ni: 0,
    });
    const grow = (b, needV, needI) => {
      if (b.nv + needV > b.pos.length) {
        const n = Math.max(b.pos.length * 2, b.nv + needV);
        for (const k of ['pos', 'nrm', 'col']) {
          const bigger = new Float32Array(n);
          bigger.set(b[k].subarray(0, b.nv));
          b[k] = bigger;
        }
      }
      if (b.ni + needI > b.ind.length) {
        const n = Math.max(b.ind.length * 2, b.ni + needI);
        const bigger = new Uint32Array(n);
        bigger.set(b.ind.subarray(0, b.ni));
        b.ind = bigger;
      }
    };
    const out = { matte: bin(), glow: bin() };

    // scratch: the eight distinct AO samples for one face
    const edge = [0, 0, 0, 0];      // t0+, t0-, t1+, t1-
    const corn = [0, 0, 0, 0];      // (t0+,t1+), (t0+,t1-), (t0-,t1+), (t0-,t1-)
    const ao = [3, 3, 3, 3];
    const off = [0, 0, 0];

    for (const k of (only || V.keys())) {
      const name = V.get(k);
      if (name === undefined) continue;
      const z = (k % SPAN) - OFF;
      const y = (Math.floor(k / SPAN) % SPAN) - OFF;
      const x = Math.floor(k / (SPAN * SPAN)) - OFF;
      const spec = palette[name];
      if (!spec) { unknown(name); continue; }
      const emissive = spec.emit > 0;
      const b = emissive ? out.glow : out.matte;
      const jitter = 1 + (hash3(x, y, z) - 0.5) * (emissive ? 0.05 : spec.jitter);
      const r0 = spec.rgb[0], g0 = spec.rgb[1], b0 = spec.rgb[2], gain = spec.gain;

      for (let fi = 0; fi < 6; fi++) {
        const f = FACES[fi];
        const nx = x + f.d[0], ny = y + f.d[1], nz = z + f.d[2];
        if (solid(nx, ny, nz)) continue;
        if (f.d[1] === -1 && y <= noFloorBelow) continue;

        if (!emissive) {
          const t0 = f.t[0], t1 = f.t[1];
          for (let e = 0; e < 4; e++) {
            const axis = e < 2 ? t0 : t1;
            const sign = (e & 1) ? -1 : 1;
            off[0] = 0; off[1] = 0; off[2] = 0; off[axis] = sign;
            edge[e] = solid(nx + off[0], ny + off[1], nz + off[2]) ? 1 : 0;
          }
          for (let c = 0; c < 4; c++) {
            const sa = (c < 2) ? 1 : -1, sb = (c & 1) ? -1 : 1;
            off[0] = 0; off[1] = 0; off[2] = 0;
            off[t0] = sa; off[t1] = sb;
            corn[c] = solid(nx + off[0], ny + off[1], nz + off[2]) ? 1 : 0;
          }
          for (let c = 0; c < 4; c++) {
            const p = f.v[c];
            const ia = p[t0] === 1 ? 0 : 1;          // index into edge for t0
            const ib = p[t1] === 1 ? 2 : 3;          // index into edge for t1
            const ic = (ia === 0 ? 0 : 2) + (ib === 2 ? 0 : 1);
            const s1 = edge[ia], s2 = edge[ib], cn = corn[ic];
            ao[c] = (s1 && s2) ? 0 : 3 - (s1 + s2 + cn);
          }
        } else {
          ao[0] = ao[1] = ao[2] = ao[3] = 3;
        }

        grow(b, 12, 6);
        const base = b.nv / 3;
        let vp = b.nv;
        for (let c = 0; c < 4; c++) {
          const p = f.v[c];
          b.pos[vp] = x + p[0]; b.pos[vp + 1] = y + p[1]; b.pos[vp + 2] = z + p[2];
          b.nrm[vp] = f.d[0]; b.nrm[vp + 1] = f.d[1]; b.nrm[vp + 2] = f.d[2];
          const sc = jitter * AO_LEVEL[ao[c]] * gain;
          b.col[vp] = r0 * sc; b.col[vp + 1] = g0 * sc; b.col[vp + 2] = b0 * sc;
          vp += 3;
        }
        b.nv = vp;

        // Split the quad across the darker diagonal, or the AO gradient shows
        // up as a hard crease running through flat walls.
        const i = base;
        let ii = b.ni;
        if (ao[0] + ao[2] < ao[1] + ao[3]) {
          b.ind[ii] = i; b.ind[ii + 1] = i + 1; b.ind[ii + 2] = i + 3;
          b.ind[ii + 3] = i + 1; b.ind[ii + 4] = i + 2; b.ind[ii + 5] = i + 3;
        } else {
          b.ind[ii] = i; b.ind[ii + 1] = i + 1; b.ind[ii + 2] = i + 2;
          b.ind[ii + 3] = i; b.ind[ii + 4] = i + 2; b.ind[ii + 5] = i + 3;
        }
        b.ni = ii + 6;
      }
    }

    const geo = (b) => {
      if (!b.nv) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(b.pos.subarray(0, b.nv), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(b.nrm.subarray(0, b.nv), 3));
      g.setAttribute('color', new THREE.BufferAttribute(b.col.subarray(0, b.nv), 3));
      g.setIndex(new THREE.BufferAttribute(b.ind.subarray(0, b.ni), 1));
      g.computeBoundingSphere();
      return g;
    };
    return { matte: geo(out.matte), glow: geo(out.glow) };
  }
}

// Build the mesh pair for a world. Matte is a standard material driven
// entirely by vertex colour; glow is unlit and deliberately allowed past 1.0
// so the bloom pass has something to catch.
// The same world as meshWorld, but as one mesh per square column.
//
// A single 5-million-voxel mesh is always drawn in full: three frustum-culls per
// OBJECT, so one object means no culling at all, and the whole circuit went
// through the vertex stage every frame no matter which way the car was facing.
// Chunks give the renderer something to throw away — on a 500-metre lap with a
// chase camera that is most of the world, every frame.
//
// It also un-blocks the things chunking was always really for: a bigger world,
// more than one track, and rebuilding a piece without rebuilding all of it.
export function meshChunks(world, palette, opts) {
  const { size = 192, name = 'vox', ...rest } = opts || {};
  const group = new THREE.Group();
  group.name = name + ':chunks';
  const cells = world.bucket(size);

  for (const [id, keys] of cells) {
    // The chunk's own extent, then one voxel of margin — the furthest any face
    // cull or AO sample ever reaches from the voxel it belongs to.
    // Decoded inline, not through a helper returning [x, y, z]: this runs about
    // forty-six million times across the build and an array per call is forty-six
    // million allocations, which cost more than the work they carry.
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const x = Math.floor(k / (SPAN * SPAN)) - OFF;
      const y = (Math.floor(k / SPAN) % SPAN) - OFF;
      const z = (k % SPAN) - OFF;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    x0--; y0--; z0--; x1++; y1++; z1++;
    const sx = x1 - x0 + 1, sy = y1 - y0 + 1, sz = z1 - z0 + 1;
    const grid = new Uint8Array(sx * sy * sz);
    const strideX = sy * sz;

    // Fill from this chunk AND its eight horizontal neighbours, so the margin
    // is real geometry rather than a hole that would emit faces along a seam.
    // bucket() is by COLUMN, so there are no vertical neighbours to gather.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const src = cells.get(id + dx * CHUNK_SPAN + dz);
        if (!src) continue;
        for (let i = 0; i < src.length; i++) {
          const k = src[i];
          const lx = Math.floor(k / (SPAN * SPAN)) - OFF - x0;
          if (lx < 0 || lx >= sx) continue;
          const ly = (Math.floor(k / SPAN) % SPAN) - OFF - y0;
          if (ly < 0 || ly >= sy) continue;
          const lz = (k % SPAN) - OFF - z0;
          if (lz < 0 || lz >= sz) continue;
          grid[lx * strideX + ly * sz + lz] = 1;
        }
      }
    }

    const m = meshWorld(world, palette, {
      ...rest, name, only: keys, dense: { grid, x0, y0, z0, sx, sy, sz },
    });
    if (m.children.length) group.add(m);
  }
  return group;
}

export function meshWorld(world, palette, opts) {
  const { shadows = true, name = 'vox', solidBelow, noFloorBelow, only, dense } = opts || {};
  const { matte, glow } = world.build(palette, { solidBelow, noFloorBelow, only, dense });
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

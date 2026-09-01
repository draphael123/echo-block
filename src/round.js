// The paper round.
//
// The street had nowhere to go. This is the smallest thing that fixes that:
// Sam hands you tomorrow's papers, and every mailbox on the block becomes
// somewhere to be. It uses props that already existed, it takes you the whole
// length of the street in both directions, it teaches the controls without a
// tutorial, and it ends.
//
// It is deliberately not a quest system. One flag, a count, and a list of
// positions — anything more would be building a game on top of a look study
// before anyone has decided that is what this is.
import * as THREE from '../vendor/three/three.module.js';
import { VoxWorld, meshWorld } from './voxel.js';
import { PALETTE } from './palette.js';

const REACH = 26;

export function createRound(anchors, scene) {
  // one rolled paper per box, hidden until it is delivered
  const w = new VoxWorld();
  w.box(0, 0, 0, 3, 3, 7, 'paper');
  w.box(0, 0, 3, 3, 3, 1, 'concreteOld');
  const proto = meshWorld(w, PALETTE, { name: 'paper' });

  const group = new THREE.Group();
  group.name = 'round';
  scene.add(group);

  const boxes = (anchors.mailboxes || []).map((pos) => {
    const m = proto.clone();
    m.position.set(pos[0] - 1, pos[1] - 2, pos[2] - 2);
    m.rotation.y = Math.random() * 0.5 - 0.25;
    m.visible = false;
    group.add(m);
    return { pos, mesh: m, done: false };
  });

  let state = 'idle';                        // idle | active | done
  let delivered = 0;

  function nearest(p) {
    if (state !== 'active') return null;
    let best = null, bestD = REACH;
    for (const b of boxes) {
      if (b.done) continue;
      const d = Math.hypot(b.pos[0] - p.x, b.pos[2] - p.z);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  return {
    get state() { return state; },
    get delivered() { return delivered; },
    get total() { return boxes.length; },
    boxes,
    nearest,
    start() {
      if (state !== 'idle') return false;
      state = 'active';
      return true;
    },
    deliver(b) {
      if (!b || b.done) return false;
      b.done = true;
      b.mesh.visible = true;
      delivered++;
      if (delivered >= boxes.length) state = 'done';
      return true;
    },
    // What Sam says depends on where you are in it, which is the entire
    // dialogue system this needs.
    linesFor(name) {
      if (name !== 'Sam') return null;
      if (state === 'idle') return [
        'Folding for the morning round. Ninety-one houses, and eleven of them tip.',
        'Except I am not doing it in the morning. I am doing it now, and then I am going to bed.',
        `Take these. ${boxes.length} boxes on this block. You will know them, they are the ones with the little flags.`,
      ];
      if (state === 'active') return [
        `${delivered} of ${boxes.length}. Both sides of the road — do not just do the easy side.`,
        'If a flag is already up, that one is done. Do not double it, they complain.',
      ];
      return [
        'All of them? On a school night.',
        'Right. I owe you. Come back tomorrow and I will let you do it again.',
      ];
    },
    hud() {
      if (state === 'idle') return '';
      if (state === 'done') return 'the round — done';
      return `the round — ${delivered}/${boxes.length}`;
    },
  };
}

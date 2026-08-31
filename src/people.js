// The people.
//
// Built the way the reference builds them: rigid voxel chunks on a joint
// hierarchy, no skinning and no deformation. A limb rotates as a solid block,
// which is what gives the animation its puppet/stop-motion read — smooth
// vertex blending would look wrong here even if it were cheaper.
//
// Everything is the same voxel size as the houses. A kid is 20 voxels tall
// (~1.6m), an adult 23 (~1.85m). Heads are deliberately oversized.
import * as THREE from 'three';
import { VoxWorld, meshWorld } from './voxel.js';
import { PALETTE } from './palette.js';

// A body part: its own tiny voxel world, meshed and parented at its joint.
function part(build) {
  const w = new VoxWorld();
  build(w);
  const g = meshWorld(w, PALETTE, { name: 'part' });
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ------------------------------------------------------------------ bodies
// A cube with hair painted on it reads as a Minecraft head, which is the wrong
// game. The corners come off, the hair OVERHANGS the brow and the back of the
// neck, and there is an actual neck under it — three cheap changes that put
// the characters at the same level of detail as the houses they stand in
// front of, which is the whole problem with under-modelled people in a
// well-modelled street.
function makeHead(s) {
  const d = s.kid ? 7 : 6, h = (d >> 1);
  return part(w => {
    w.box(-h, 0, -h, d, d, d, s.skin);
    // knock the top corners off so the skull is not a die
    for (const cx of [-h, h]) for (const cz of [-h, h]) {
      w.clear(cx, d - 1, cz);
      w.clear(cx, d - 2, cz);
    }
    w.clear(-h, 0, -h); w.clear(h, 0, -h);            // and the jaw corners
    w.set(-h - 1, Math.round(d * 0.45), 0, s.skin);   // ears
    w.set(h + 1, Math.round(d * 0.45), 0, s.skin);

    if (s.hairStyle !== 'bald') {
      w.box(-h - 1, d - 3, -h - 1, d + 2, 4, d + 2, s.hair);     // crown, proud
      w.box(-h - 1, d - 7, -h - 1, d + 2, 5, 1, s.hair);         // down the back
      for (const cx of [-h - 1, h + 1]) w.box(cx, d - 6, -h - 1, 1, 4, d + 1, s.hair);
      if (s.hairStyle === 'fringe') {
        w.box(-h, d - 4, h + 1, d, 2, 1, s.hair);                // overhangs the brow
        w.box(-h + 1, d - 5, h + 1, 3, 1, 1, s.hair);
      }
      if (s.hairStyle === 'long') w.box(-h - 1, d - 11, -h - 1, d + 2, 6, 2, s.hair);
    } else {
      w.box(-h - 1, d - 6, -h - 1, d + 2, 3, 1, s.hair);         // what is left
      for (const cx of [-h - 1, h + 1]) w.box(cx, d - 6, -h - 1, 1, 3, 4, s.hair);
    }
    if (s.cap) {
      w.box(-h - 1, d - 2, -h - 1, d + 2, 2, d + 2, s.cap);
      w.box(-2, d - 3, h + 1, 5, 1, 2, s.cap);                   // the peak
    }
    // eyes, one voxel each, set into the brow rather than painted flat on it
    const ey = Math.round(d * 0.45);
    w.set(-2, ey, h, 'hairDark');
    w.set(2, ey, h, 'hairDark');
    w.set(0, ey - 1, h + 1, s.skin);                             // nose
    if (s.glasses) {
      w.box(-3, ey, h + 1, 7, 1, 1, 'chrome');
      w.set(-3, ey + 1, h + 1, 'chrome'); w.set(3, ey + 1, h + 1, 'chrome');
      w.set(-2, ey, h + 1, 'hairDark'); w.set(2, ey, h + 1, 'hairDark');
    }
  });
}

// A torso that TAPERS. A straight extruded slab is the single biggest reason
// blocky characters read as toys: real shoulders are wider than the waist, and
// two voxels of difference is enough to see.
function makeTorso(s) {
  const wid = s.kid ? 8 : 9, hgt = s.kid ? 7 : 9, dep = 5;
  const hw = wid >> 1, hd = dep >> 1;
  return part(w => {
    for (let j = 0; j < hgt; j++) {
      const t = j / (hgt - 1);
      const cut = t > 0.55 ? 0 : 1;                     // narrow at the waist
      w.box(-hw + cut, j, -hd, wid - cut * 2, 1, dep, s.shirt);
    }
    w.box(-hw, hgt - 1, -hd, wid, 1, dep, s.shirt);     // shoulders, full width
    w.box(-hw + 1, 0, -hd, wid - 2, 1, dep, s.trouser); // waistband
    // a collar with a notch, and a placket down the front
    w.box(-2, hgt - 1, hd, 5, 1, 1, s.collar || 'shirtCream');
    w.box(-3, hgt - 2, hd, 2, 1, 1, s.collar || 'shirtCream');
    w.box(2, hgt - 2, hd, 2, 1, 1, s.collar || 'shirtCream');
    for (let j = 1; j < hgt - 2; j++) w.set(0, j, hd, s.collar || 'shirtCream');
    if (s.jacket) {
      for (let j = 1; j < hgt - 1; j++) {
        w.box(-hw - 1, j, -hd - 1, 1, 1, dep + 2, s.jacket);
        w.box(hw, j, -hd - 1, 1, 1, dep + 2, s.jacket);
        w.box(-hw - 1, j, -hd - 1, wid + 2, 1, 1, s.jacket);
      }
      w.box(-hw - 1, hgt - 2, hd, 3, 2, 1, s.jacket);   // lapels
      w.box(hw - 1, hgt - 2, hd, 3, 2, 1, s.jacket);
    }
    if (s.bag) {                                        // a strap across the chest
      for (let j = 0; j < hgt - 1; j++) w.set(-2 + Math.round(j * 0.4), j, hd, s.bag);
      w.box(hw, 0, -hd - 3, 3, 5, 5, s.bag);
    }
  });
}

function makeLeg(s) {
  const h = s.kid ? 6 : 8;
  return part(w => {
    w.box(-1, -h + 1, -1, 3, h - 1, 3, s.trouser);
    // the shoe sticks out in FRONT of the leg. Without it a walk cycle is two
    // rectangles pivoting and the feet never read as feet.
    w.box(-1, -h, -1, 3, 1, 5, s.shoe || 'shoe');
    w.box(-1, -h + 1, 1, 3, 1, 3, s.shoe || 'shoe');
  });
}

function makeArm(s, side) {
  const h = s.kid ? 7 : 9;
  const sleeve = s.jacket || s.shirt;
  return part(w => {
    w.box(-1, -h + 2, -1, 2, h - 2, 3, sleeve);
    w.box(-1, -h + 2, -1, 2, 1, 3, s.cuff || sleeve);   // cuff
    w.box(-1, -h, -1, 2, 2, 2, s.skin);                 // the hand, narrower
    if (s.torch && side > 0) {
      w.box(-1, -h - 4, 0, 2, 4, 2, 'torchBody');
      w.set(0, -h - 5, 1, 'torchLens');
    }
    if (s.smoke && side < 0) w.set(0, -h - 1, 2, 'cigarette');
  });
}

// ------------------------------------------------------------------ person
export function buildPerson(spec) {
  const s = {
    kid: false, skin: 'skinMid', hair: 'hairBrown', shirt: 'shirtBlue',
    trouser: 'jeans', pose: 'idle', ...spec,
  };
  const legH = s.kid ? 6 : 8, torsoH = s.kid ? 7 : 9;
  // ---- ragdoll
  // Not a solver. The body is already a hierarchy of rigid chunks, so being
  // hit by a car is: throw the root on a ballistic arc, spin every joint,
  // damp it, bounce once, then stand back up. A real articulated ragdoll
  // would look WORSE here — the reference's characters are puppets, and a
  // puppet knocked over tumbles as a unit.
  const rag = { on: false, v: new THREE.Vector3(), spin: new THREE.Vector3(), rest: 0, up: 0 };
  const limbs = [];
  const limbSpin = [];

  const root = new THREE.Group();
  root.name = 'person:' + s.name;
  root.position.set(s.pos[0], s.pos[1], s.pos[2]);
  root.rotation.y = s.face || 0;

  const body = new THREE.Group();          // whole-body bob
  root.add(body);

  const hips = new THREE.Group();
  hips.position.y = legH;
  body.add(hips);

  const legL = makeLeg(s), legR = makeLeg(s);
  legL.position.x = -2; legR.position.x = 2;
  hips.add(legL, legR);

  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(makeTorso(s));

  const shoulderY = torsoH - 1;
  const armL = makeArm(s, -1), armR = makeArm(s, 1);
  const ax = s.kid ? 5 : 5.5;
  armL.position.set(-ax, shoulderY, 0);
  armR.position.set(ax, shoulderY, 0);
  torso.add(armL, armR);
  limbs.push(legL, legR, armL, armR, torso);
  for (let i = 0; i < 5; i++) limbSpin.push(new THREE.Vector3());

  torso.add(part(w => w.box(-1, torsoH - 1, -1, 3, 2, 3, s.skin)));   // neck
  const head = new THREE.Group();
  head.position.y = torsoH + 1;
  head.add(makeHead(s));
  torso.add(head);

  // Picking against a dozen small meshes per person is both slow and fiddly;
  // one invisible box per person is exact enough and never misses a limb.
  const hh = legH + torsoH + (s.kid ? 7 : 6);
  const pick = new THREE.Mesh(
    new THREE.BoxGeometry(12, hh, 10),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.y = hh / 2;
  pick.userData.person = s;
  root.add(pick);

  const lights = [];
  if (s.torch) {
    // the flashlight actually lights the ground in front of them
    const beam = new THREE.SpotLight(0xfff0c4, 26000, 150, 0.42, 0.7, 2);
    beam.position.set(ax, legH + shoulderY - (s.kid ? 12 : 14), 2);
    const tgt = new THREE.Object3D();
    tgt.position.set(ax + (s.torchAim ? s.torchAim[0] : 0), -6, 46);
    root.add(tgt);
    beam.target = tgt;
    root.add(beam);
    lights.push(beam);
  }
  if (s.radio) {
    const glow = new THREE.PointLight(0xff9a5c, 900, 34, 2);
    glow.position.set(-8, legH + 4, 6);
    root.add(glow);
    lights.push(glow);
  }

  // ---------------------------------------------------------------- motion
  const seed = (s.name.charCodeAt(0) * 37 + s.name.length * 11) % 100 / 100;
  const path = s.path;                       // [[x,z],[x,z]] to pace between
  let travel = seed, dir = 1;
  let motion = 0, phase = seed * 6;          // for externally driven walking


  // The walk cycle is driven by DISTANCE, not by the clock. Drive it off time
  // and the legs keep scissoring while the player stands still, which is the
  // single most obvious tell that a character is a puppet with a timer.
  function stride(amount, gait) {
    const sw = Math.sin(phase) * amount;
    legL.rotation.x = sw * 0.62;
    legR.rotation.x = -sw * 0.62;
    armL.rotation.x = -sw * 0.48 - (s.torch ? 0.2 * amount : 0);
    armR.rotation.x = sw * 0.48 - (s.torch ? 0.55 : 0);
    body.position.y = Math.abs(Math.sin(phase)) * 0.5 * amount;
    torso.rotation.y = Math.sin(phase) * 0.06 * amount;
    torso.rotation.x = 0.05 * amount * gait;
  }

  function update(t, dt = 1 / 60, ground) {
    const k = t + seed * 20;

    if (rag.on) {
      rag.v.y -= 260 * dt;
      root.position.addScaledVector(rag.v, dt);
      const floor = ground ? ground.ceilingAt(root.position.x, root.position.z) : 0;
      if (root.position.y <= floor) {
        root.position.y = floor;
        if (rag.v.y < -30) { rag.v.y *= -0.32; rag.v.multiplyScalar(0.55); }
        else { rag.v.set(rag.v.x * 0.60, 0, rag.v.z * 0.60); }
        rag.spin.multiplyScalar(0.86);
        if (rag.v.lengthSq() < 16) rag.rest += dt; else rag.rest = 0;
      }
      body.rotation.x += rag.spin.x * dt;
      body.rotation.y += rag.spin.y * dt;
      body.rotation.z += rag.spin.z * dt;
      for (let i = 0; i < limbs.length; i++) {
        limbs[i].rotation.x += limbSpin[i].x * dt;
        limbs[i].rotation.z += limbSpin[i].z * dt;
        limbSpin[i].multiplyScalar(1 - Math.min(1, dt * 1.6));
      }
      body.position.y = 0;
      if (rag.rest > 0.9) {                       // get up
        rag.up += dt;
        const e = Math.min(1, rag.up * 1.6);
        body.rotation.x += (0 - body.rotation.x) * e * 0.3;
        body.rotation.z += (0 - body.rotation.z) * e * 0.3;
        for (const l of limbs) {
          l.rotation.x += (0 - l.rotation.x) * e * 0.3;
          l.rotation.z += (0 - l.rotation.z) * e * 0.3;
        }
        if (rag.up > 1.5) { rag.on = false; rag.up = 0; body.rotation.set(0, 0, 0); }
      }
      return;
    }

    if (s.pose === 'ride') {
      // On the bike. t is the PEDAL PHASE, advanced by distance travelled by
      // whoever is riding, so the legs stop when the bike stops.
      hips.position.y = legH * 0.62;
      torso.rotation.x = 0.6;
      head.rotation.x = -0.48;
      legL.rotation.x = Math.sin(t) * 0.8 - 0.55;
      legR.rotation.x = -Math.sin(t) * 0.8 - 0.55;
      armL.rotation.x = -1.32; armR.rotation.x = -1.32;
      armL.rotation.z = 0.24; armR.rotation.z = -0.24;
      body.position.y = 0;
      return;
    }

    if (s.pose === 'sit') {
      hips.position.y = legH * 0.55;
      legL.rotation.x = legR.rotation.x = -1.35;
      torso.rotation.x = 0.12;
      body.position.y = Math.sin(k * 1.1) * 0.12;
      armL.rotation.x = -0.5 + Math.sin(k * 0.7) * 0.05;
      armR.rotation.x = -0.5 - Math.sin(k * 0.6) * 0.05;
      return;
    }

    if (s.driven) {
      // motion is 0..1 of top speed, set by whoever is steering this body
      phase += motion * dt * 11;
      if (motion > 0.02) {
        stride(Math.min(1, motion * 1.15), motion);
        head.rotation.y *= 0.9; head.rotation.x *= 0.9;
      } else {
        stride(0, 0);
        body.position.y = Math.sin(k * 1.3) * 0.22;
        armR.rotation.x = -(s.torch ? 0.55 : 0) - Math.sin(k * 0.8) * 0.09;
        armL.rotation.x = Math.sin(k * 0.9) * 0.09;
        head.rotation.y = Math.sin(k * 0.31) * Math.sin(k * 0.17) * 0.5;
      }
      return;
    }

    if (path) {
      travel += dir * 0.055 * (s.speed || 1) * dt;
      if (travel > 1) { travel = 1; dir = -1; }
      if (travel < 0) { travel = 0; dir = 1; }
      const [a, b] = path;
      root.position.x = a[0] + (b[0] - a[0]) * travel;
      root.position.z = a[1] + (b[1] - a[1]) * travel;
      root.rotation.y = Math.atan2((b[0] - a[0]) * dir, (b[1] - a[1]) * dir);
      phase += dt * 3.4 * 2;
      stride(1, 1);
      return;
    }

    // idle: breathe, shift weight, and look around now and then
    body.position.y = Math.sin(k * 1.3) * 0.22;
    torso.rotation.z = Math.sin(k * 0.6) * 0.02;
    armL.rotation.x = Math.sin(k * 0.9) * 0.09 - (s.armsFolded ? 1.2 : 0);
    armR.rotation.x = -Math.sin(k * 0.8) * 0.09 - (s.armsFolded ? 1.2 : 0) - (s.torch ? 0.55 : 0);
    if (s.armsFolded) { armL.rotation.z = 0.5; armR.rotation.z = -0.5; }
    const glance = Math.sin(k * 0.31) * Math.sin(k * 0.17);
    head.rotation.y = glance * 0.7;
    head.rotation.x = Math.sin(k * 0.23) * 0.12;
  }

  update(0);
  return {
    root, pick, update, lights, data: s, head,
    setMotion: (v) => { motion = v; },
    height: legH + torsoH + (s.kid ? 7 : 6),
    get downed() { return rag.on; },
    knock(dx, dz, force) {
      if (rag.on) return false;
      rag.on = true; rag.rest = 0; rag.up = 0;
      rag.v.set(dx * force, force * 0.72, dz * force);
      rag.spin.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 9);
      for (const sp of limbSpin)
        sp.set((Math.random() - 0.5) * 13, 0, (Math.random() - 0.5) * 13);
      return true;
    },
  };
}

// ------------------------------------------------------------------- dog
export function buildDog(spec) {
  const s = { fur: 'dogFur', dark: 'dogFurDark', ...spec };
  const root = new THREE.Group();
  root.name = 'dog';
  root.position.set(s.pos[0], s.pos[1], s.pos[2]);

  const body = new THREE.Group();
  root.add(body);
  body.add(part(w => {
    w.box(-2, 4, -5, 5, 5, 11, s.fur);              // barrel
    w.box(-2, 8, 3, 5, 3, 4, s.fur);                // neck
    w.box(-2, 8, 6, 5, 5, 5, s.fur);                // head
    w.box(-2, 12, 6, 1, 2, 2, s.dark);              // ears
    w.box(2, 12, 6, 1, 2, 2, s.dark);
    w.box(-1, 8, 10, 3, 2, 2, s.dark);              // muzzle
    w.set(-1, 11, 10, 'hairDark'); w.set(1, 11, 10, 'hairDark');
    w.box(-1, 8, -7, 3, 4, 3, s.fur);               // tail
  }));
  const legs = [];
  for (const [lx, lz] of [[-2, 3], [2, 3], [-2, -4], [2, -4]]) {
    const g = new THREE.Group();
    g.position.set(lx, 4, lz);
    g.add(part(w => w.box(-1, -4, -1, 2, 4, 2, s.dark)));
    body.add(g);
    legs.push(g);
  }

  const seed = 0.31;
  const path = s.path;
  let travel = seed, dir = 1;
  // Same as the people: a dog whose owner is being moved by somebody else needs
  // its legs driven from the OUTSIDE, or it slides along the pavement rigid.
  let motion = 0, phase = seed * 6;
  function update(t, dt = 1 / 60) {
    const k = t + seed * 20;
    if (!path && motion > 0.02) {
      phase += motion * dt * 13;
      const sw = Math.sin(phase) * Math.min(1, motion * 1.2);
      legs[0].rotation.x = sw * 0.6;
      legs[1].rotation.x = -sw * 0.6;
      legs[2].rotation.x = -sw * 0.6;
      legs[3].rotation.x = sw * 0.6;
      body.position.y = Math.abs(Math.sin(phase)) * 0.35 * motion;
    }
    if (path) {
      travel += dir * 0.055 * (s.speed || 1) * dt;
      if (travel > 1) { travel = 1; dir = -1; }
      if (travel < 0) { travel = 0; dir = 1; }
      const [a, b] = path;
      root.position.x = a[0] + (b[0] - a[0]) * travel;
      root.position.z = a[1] + (b[1] - a[1]) * travel;
      root.rotation.y = Math.atan2((b[0] - a[0]) * dir, (b[1] - a[1]) * dir);
      const step = k * 5.2;
      legs[0].rotation.x = Math.sin(step) * 0.6;
      legs[1].rotation.x = -Math.sin(step) * 0.6;
      legs[2].rotation.x = -Math.sin(step) * 0.6;
      legs[3].rotation.x = Math.sin(step) * 0.6;
      body.position.y = Math.abs(Math.sin(step)) * 0.35;
    }
    body.rotation.y = Math.sin(k * 1.7) * 0.05;
  }
  update(0);
  return { root, update, data: s, setMotion: (v) => { motion = v; } };
}

// ------------------------------------------------------------------- cast
// Written for the world rather than for a plot: it is a quiet street at night
// and everyone has a small, mundane reason to still be outside.
// The two who work here. Their positions come from the shop anchors rather
// than being written down twice, because the shop moved three times.
// The garage is a place in the hub now, so somebody has to be standing in it.
// Positioned outside the roller door of the house that already had a garage,
// rather than inventing a new building for a counter and a conversation.
export const MECHANIC = {
  name: 'Verity', role: 'runs the garage',
  key: 'mechanic', garage: true,
  skin: 'skinMid', hair: 'hairDark', hairStyle: 'long',
  shirt: 'shirtBlue', trouser: 'trouserGrey', collar: 'fabricPale',
  pos: [22, 2, -48], face: -1.57,
  lines: [
    'Leave it with me. Lamps first, if you are asking — you cannot drive what you cannot see.',
    'Everyone buys the engine first and everyone spends the next week in a hedge.',
    'Bring me the money and I will bring you the parts. That is the whole arrangement.',
  ],
};

export const INDOOR_CAST = [
  {
    key: 'keeper', name: 'Marlow', role: 'behind the counter',
    skin: 'skinMid', hair: 'hairGrey', hairStyle: 'bald', glasses: true,
    shirt: 'shirtCream', collar: 'fabricPale', trouser: 'trouserGrey',
    face: 0,
    lines: [
      'We shut at eleven. The sign says ten but I never get out before eleven.',
      'You want the milk, it is at the back. Everything anyone wants is at the back, that is the trick of it.',
      'Tell Sam he still owes me for a paper he never delivered in June.',
    ],
  },
  {
    key: 'folder', name: 'Ines', role: 'waiting on a dryer',
    skin: 'skinDeep', hair: 'hairDark', hairStyle: 'long',
    shirt: 'shirtGreen', trouser: 'jeans', collar: 'fabricPale',
    face: 3.14,
    lines: [
      'Number four eats your money and gives you back a wet towel. Use six.',
      'Twenty minutes left. I have read the same page of this four times.',
      'It is warmer in here than at mine. That is the whole reason, if you want the truth.',
    ],
  },
];

// The look you can change at the start. Kept as flat lists so the intro can
// render them as swatches without knowing anything about voxels.
export const LOOKS = {
  skin: ['skinLight', 'skinMid', 'skinDeep'],
  hair: ['hairGinger', 'hairBrown', 'hairDark', 'hairGrey'],
  hairStyle: ['fringe', 'plain', 'long'],
  shirt: ['shirtRed', 'shirtBlue', 'shirtGreen', 'shirtCream', 'shirtPlaid'],
  trouser: ['jeans', 'trouserTan', 'trouserGrey'],
  cap: [null, 'shirtBlue', 'shirtRed'],
};

export const CAST = [
  {
    name: 'Row',
    role: 'you',
    player: true, driven: true,
    kid: true, skin: 'skinLight', hair: 'hairGinger', hairStyle: 'fringe',
    shirt: 'shirtRed', trouser: 'jeans', torch: true, torchAim: [0, 0],
    collar: 'shirtCream', bag: 'trouserTan',
    pos: [-44, 2, 30], face: 2.6,
    lines: [
      'My bike’s in the yard. I’m not going home yet.',
      'You hear that? Under the streetlight it hums. It gets louder after eleven.',
      'Mum thinks I’m at Walt’s. Walt thinks I went home.',
      'If the lamp goes out, don’t stand where it was.',
    ],
  },
  {
    name: 'Walt',
    role: 'three doors down, still up',
    skin: 'skinLight', hair: 'hairGrey', hairStyle: 'bald', glasses: true,
    shirt: 'shirtPlaid', trouser: 'trouserTan', pose: 'sit', radio: true, smoke: true,
    collar: 'fabricPale',
    pos: [-62, 6, -20], face: 0.5,
    lines: [
      'Ball game’s in the tenth. I’m not going in until it’s over.',
      'Forty-one years on this street. It was orchards. You wouldn’t know it.',
      'They resurfaced the road in ’81 and it’s been quieter ever since. Ask me why.',
    ],
  },
  {
    name: 'Mrs Okonjo',
    role: 'the porch, arms folded',
    skin: 'skinDeep', hair: 'hairDark', shirt: 'shirtGreen', trouser: 'trouserGrey',
    armsFolded: true, hairStyle: 'long', collar: 'fabricPale',
    pos: [-72, 11, -12], face: 0.15,
    lines: [
      'Bins go out tonight. Nobody remembers but me.',
      'That boy has been up and down this street since supper.',
      'The television’s been on in there since Thursday. I don’t think anyone’s watching it.',
    ],
  },
  {
    name: 'Deb',
    role: 'walking Biscuit',
    skin: 'skinMid', hair: 'hairBrown', shirt: 'shirtCream', trouser: 'jeans',
    jacket: 'shirtBlue', hairStyle: 'long', cuff: 'trouserGrey',
    pos: [40, 2, 34], face: 1.5,
    path: [[40, 34], [-190, 34]], speed: 1,
    lines: [
      'Last loop. She’ll pull all the way to the corner and then refuse to come back.',
      'Evening. Watch the kerb by the hydrant, it’s lifted.',
      'You’re not from the block, are you.',
    ],
  },
  {
    name: 'Sam',
    role: 'papers, tomorrow’s round',
    kid: true, skin: 'skinMid', hair: 'hairDark', cap: 'shirtBlue',
    shirt: 'shirtCream', trouser: 'jeans', bag: 'shirtGreen',
    pos: [88, 2, 30], face: 2.6,
    lines: [
      'Folding for the morning round. Ninety-one houses, and eleven of them tip.',
      'You want the late edition? It’s the same as the early one with a different front.',
    ],
  },
];

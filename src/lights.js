// The lighting rig, the sky, and the one fake volumetric.
//
// The scene is mostly dark on purpose. Almost all of the colour comes from a
// handful of small, saturated, LOCAL sources — a sodium streetlight, two
// porch bulbs, the spill out of lit windows, a television. The moon is only
// there to keep the roofs and the road from going to pure black.
import * as THREE from 'three';
import { GROUND } from './block.js';

const SKY_TOP = new THREE.Color('#080d1a');
const SKY_HORIZON = new THREE.Color('#1d2942');
const SODIUM_HAZE = new THREE.Color('#33241a');
const SKY_BELOW = new THREE.Color('#080c15');

export function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: {
      uTop: { value: new THREE.Vector3(...SKY_TOP.toArray()) },
      uHorizon: { value: new THREE.Vector3(...SKY_HORIZON.toArray()) },
      uHaze: { value: new THREE.Vector3(...SODIUM_HAZE.toArray()) },
      uBelow: { value: new THREE.Vector3(...SKY_BELOW.toArray()) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 uTop, uHorizon, uHaze, uBelow;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.7, 289.3))) * 43758.5453); }
      void main() {
        float y = vDir.y;
        float h = clamp(y * 1.4, 0.0, 1.0);
        vec3 c = mix(uHorizon, uTop, pow(h, 0.55));
        // The camera looks DOWN, so most of the backdrop is BELOW the horizon.
        // Left as sky it becomes a flat grey wall that swallows the distance —
        // it has to fall away to near-black so far silhouettes can read.
        c = mix(uBelow, c, smoothstep(-0.16, 0.03, y));
        // the town's own light on the haze, a band sitting on the horizon
        c += uHaze * exp(-max(y, 0.0) * 13.0) * smoothstep(-0.10, 0.06, y);
        // stars, thinned out toward the horizon where the haze eats them
        vec2 g = floor(vDir.xz / max(abs(vDir.y), 0.15) * 90.0);
        float s = hash(g);
        if (s > 0.9975) c += vec3(0.5, 0.6, 0.8) * (s - 0.9975) * 400.0 * smoothstep(0.1, 0.6, h);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  // Radius is small and the sphere RIDES THE CAMERA (see main.js). A big
  // static sky sphere gets clipped by the far plane and you get the clear
  // colour instead of a gradient — which looks exactly like 'the sky is off'.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1050, 32, 20), mat);
  sky.name = 'sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  return sky;
}

// A light shaft under the streetlight. Not real volumetrics — a cone with a
// falloff, which at this scale is indistinguishable and costs nothing.
export function lightCone(x, y, z, radius, height, color, strength) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, toneMapped: false, fog: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying float vH; varying vec3 vPos;
      void main() {
        vH = uv.y; vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying float vH; varying vec3 vPos;
      uniform vec3 uColor; uniform float uStrength, uTime;
      void main() {
        // dense at the bulb, gone by the ground; soft at the cone's silhouette
        float a = pow(vH, 2.2) * 0.9;
        float edge = 1.0 - abs(dot(normalize(vec3(vPos.x, 0.0, vPos.z)), vec3(0.0,0.0,1.0)));
        a *= 0.35 + 0.65 * smoothstep(0.0, 0.8, edge);
        a *= 0.94 + 0.06 * sin(uTime * 2.1 + vPos.y * 0.05);   // faint mains hum
        gl_FragColor = vec4(uColor * uStrength * a, a);
      }`,
  });
  const geo = new THREE.ConeGeometry(radius, height, 28, 1, true);
  const cone = new THREE.Mesh(geo, mat);
  cone.position.set(x, y - height / 2, z);
  cone.name = 'shaft';
  cone.renderOrder = 2;
  return cone;
}

export function buildLights(scene, anchors) {
  const rig = { flicker: [], cones: [] };

  // Ambient: cool from the sky, a warm bounce off the ground. This stands in
  // for the GI the real game has, and it is the difference between "night"
  // and "black shapes".
  const hemi = new THREE.HemisphereLight(0x33486f, 0x352418, 0.80);
  scene.add(hemi);
  rig.hemi = hemi;

  // The moon. Low and behind-left, so roofs catch a rim and the street does
  // not. Shadows are fitted tightly to the block or they turn to mush.
  const moon = new THREE.DirectionalLight(0xbdd2f2, 2.1);
  moon.position.set(-230, 420, -150);
  moon.target.position.set(-30, 20, 0);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const s = moon.shadow.camera;
  s.left = -260; s.right = 260; s.top = 260; s.bottom = -260;
  s.near = 60; s.far = 900;
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.9;      // chunky cubes acne badly without this
  scene.add(moon, moon.target);
  rig.moon = moon;

  // A weak fill from the camera side, no shadow. Without it every surface
  // facing the lens is pure black and all the clutter that costs the most to
  // build simply disappears.
  const fill = new THREE.DirectionalLight(0x88a4d8, 0.55);
  fill.position.set(300, 180, 420);
  scene.add(fill);
  rig.fill = fill;

  // The streetlight. The one shadow-casting local light — it is the strongest
  // source in frame and its pool is the composition's anchor.
  if (anchors.lamp) {
    const [lx, ly, lz] = anchors.lamp;
    const lamp = new THREE.SpotLight(0xffa23c, 260000, 260, 0.85, 0.75, 2);
    lamp.position.set(lx, ly, lz);
    lamp.target.position.set(lx, GROUND, lz + 8);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.camera.near = 8; lamp.shadow.camera.far = 260;
    lamp.shadow.bias = -0.0012;
    lamp.shadow.normalBias = 0.8;
    scene.add(lamp, lamp.target);
    rig.lamp = lamp;

    const cone = lightCone(lx, ly - 2, lz, 46, ly - GROUND, 0xffa23c, 0.13);
    scene.add(cone);
    rig.cones.push(cone);

    // moths, because an empty cone of light is a diagram
    rig.moths = mothSwarm(lx, ly - 8, lz, 14);
    scene.add(rig.moths.points);
  }

  const bulb = (pos, color, intensity, dist) => {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(pos[0], pos[1], pos[2]);
    scene.add(l);
    return l;
  };

  if (anchors.porchA) rig.porchA = bulb(anchors.porchA, 0xffc98a, 7000, 110);
  if (anchors.porchB) rig.porchB = bulb(anchors.porchB, 0xffc98a, 2600, 80);

  // Spill out of the lit windows. Without these the emissive glass reads as a
  // sticker: a lit window has to put light ON something.
  const spill = [
    [[-104, 33, -33], 0xffb45c, 7000, 110],    // house A front room
    [[-24, 35, -33], 0xffb45c, 3000, 80],      // house A small window
    [[-124, 27, -66], 0xffb45c, 3400, 75],     // house A flank
    [[96, 30, -34], 0xffb45c, 3400, 85],       // house B front
    [[86, 56, -34], 0xffb45c, 5000, 100],      // house B upstairs
  ];
  for (const [p, c, i, d] of spill) bulb(p, c, i, d);

  // The television. Flickers on its own clock, drives both the point light and
  // the emissive plane in block.js.
  if (anchors.tv) {
    const tv = anchors.tv;
    rig.tvLight = bulb([tv.x + tv.w / 2, tv.y + tv.h / 2, tv.z + 6], 0x79b4ff, 9000, 120);
  }

  return rig;
}

function mothSwarm(x, y, z, n) {
  const pos = new Float32Array(n * 3);
  const seed = [];
  for (let i = 0; i < n; i++) {
    seed.push({ r: 8 + Math.random() * 22, a: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.6,
                yo: Math.random() * 16, ys: 0.7 + Math.random() * 1.9 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffd9a0, size: 2.6, sizeAttenuation: true,
    transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    update(t) {
      for (let i = 0; i < n; i++) {
        const s = seed[i];
        const a = s.a + t * s.sp;
        pos[i * 3] = x + Math.cos(a) * s.r;
        pos[i * 3 + 1] = y - s.yo + Math.sin(t * s.ys + s.a) * 5;
        pos[i * 3 + 2] = z + Math.sin(a) * s.r * 0.8;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// The television's flicker. Mostly small brightness wobble with an occasional
// cut to a different scene — a sine wave alone reads as a pulsing lamp.
export function tvFlicker(t) {
  const cut = Math.floor(t * 0.42);
  const seedA = Math.sin(cut * 127.1) * 43758.5453;
  const base = 0.55 + (seedA - Math.floor(seedA)) * 0.5;
  const wob = Math.sin(t * 17.3) * 0.07 + Math.sin(t * 41.7) * 0.04;
  const blink = (Math.sin(t * 3.1) > 0.985) ? 0.45 : 0;
  return Math.max(0.15, base + wob - blink);
}

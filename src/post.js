// The post chain, hand-rolled so nothing has to be vendored:
//
//   scene -> half-float target (+ depth)
//        -> bright pass -> two blur levels        (bloom)
//        -> composite: depth-of-field, bloom, ACES, split-tone, vignette,
//           grain, a touch of chromatic aberration
//
// The tone map lives in the FINAL pass on purpose. three skips tone mapping
// when it renders to a render target, so a chain that relies on
// renderer.toneMapping comes out flat and washed. This one ACESes itself.
//
// The DOF is what does the heavy lifting: the miniature/diorama read comes
// from the lens, not from the voxels.
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BRIGHT = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uThreshold, uKnee;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float b = max(c.r, max(c.g, c.b));
  float soft = clamp(b - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  float w = max(soft, b - uThreshold) / max(b, 1e-5);
  gl_FragColor = vec4(c * w, 1.0);
}
`;

const BLUR = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uDir;
void main() {
  vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227;
  sum += (texture2D(tDiffuse, vUv + uDir * 1.385).rgb +
          texture2D(tDiffuse, vUv - uDir * 1.385).rgb) * 0.316;
  sum += (texture2D(tDiffuse, vUv + uDir * 3.231).rgb +
          texture2D(tDiffuse, vUv - uDir * 3.231).rgb) * 0.070;
  gl_FragColor = vec4(sum, 1.0);
}
`;

const COMPOSITE = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene, tDepth, tBloomA, tBloomB;
uniform vec2 uTexel;
uniform float uNear, uFar, uFocus, uRange, uMaxBlur;
uniform float uBloom, uTime, uGrain, uVignette, uAberration, uExposure, uRolloff;
uniform vec3 uShadowTint, uHighTint;

// 16-tap poisson disk. Enough for a soft, non-bokeh defocus; the shapes in
// this scene are large and flat so real bokeh would be wasted.
const vec2 POISSON[16] = vec2[16](
  vec2( 0.0000, 0.0000), vec2( 0.5341,-0.1888), vec2(-0.3260, 0.4640), vec2( 0.0770,-0.6210),
  vec2(-0.6070,-0.2830), vec2( 0.3520, 0.6350), vec2(-0.1150,-0.9110), vec2( 0.8560, 0.3050),
  vec2(-0.8380, 0.3670), vec2( 0.2170,-0.2440), vec2(-0.2600,-0.1140), vec2( 0.6510,-0.6620),
  vec2(-0.5390, 0.7830), vec2( 0.0430, 0.3130), vec2(-0.9280,-0.1370), vec2( 0.4180, 0.0620)
);

float linearDepth(vec2 uv) {
  float ndc = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  float d = linearDepth(vUv);
  float coc = clamp((d - uFocus) / uRange, -1.0, 1.0);
  float radius = abs(coc) * uMaxBlur;

  // Defocus. Weight each tap by its own CoC so sharp foreground pixels do not
  // smear into the blurred background.
  vec3 col = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 16; i++) {
    vec2 off = POISSON[i] * radius * uTexel;
    vec3 s = texture2D(tScene, vUv + off).rgb;
    float sd = linearDepth(vUv + off);
    float sc = abs(clamp((sd - uFocus) / uRange, -1.0, 1.0));
    float w = (sd > d - uRange * 0.15) ? 1.0 : sc;
    col += s * w; wsum += w;
  }
  col /= max(wsum, 1e-4);

  // A cheap lateral aberration, strongest at the edge of the frame.
  vec2 r = (vUv - 0.5);
  float ab = uAberration * dot(r, r);
  col.r = texture2D(tScene, vUv + r * ab).r * 0.5 + col.r * 0.5;
  col.b = texture2D(tScene, vUv - r * ab).b * 0.5 + col.b * 0.5;

  col += (texture2D(tBloomA, vUv).rgb * 0.6 + texture2D(tBloomB, vUv).rgb) * uBloom;

  // Highlight rolloff BEFORE the tone curve. A point light with physical
  // falloff puts an enormous linear value on anything close to it, and skin
  // has twice the albedo of tarmac — so a lamp tuned to make the pavement
  // look right sends anyone standing under it to flat white. This pulls the
  // far end of the range back into the curve without touching the midtones,
  // which is the difference between a bright face and a hole in the frame.
  col = col / (1.0 + col / max(uRolloff, 0.2));

  col = aces(col * uExposure);

  // Split tone: teal in the shadows, sodium amber in the highlights. This one
  // line is most of the difference between "voxel scene" and "1986".
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col *= mix(uShadowTint, uHighTint, smoothstep(0.02, 0.55, l));

  float v = smoothstep(0.95, 0.25, length(r) * 1.35);
  col *= mix(1.0, v, uVignette);

  // This pass writes straight to the default framebuffer, and a raw
  // ShaderMaterial gets none of three's output-colour-space conversion — so
  // encode here or the whole frame comes out crushed and muddy.
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));

  // Grain belongs in display space, after the encode, or it disappears out of
  // the shadows where it is supposed to live.
  col += (hash(vUv * 1024.0 + fract(uTime) * 91.7) - 0.5) * uGrain;

  gl_FragColor = vec4(col, 1.0);
}
`;

class Quad {
  constructor(material) {
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
  }
  get material() { return this.mesh.material; }
  render(renderer, target) {
    renderer.setRenderTarget(target || null);
    renderer.render(this.scene, this.cam);
  }
}

const rt = (w, h, depth = false) => {
  const t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: true, stencilBuffer: false,
  });
  if (depth) {
    t.depthTexture = new THREE.DepthTexture(Math.max(1, w), Math.max(1, h));
    t.depthTexture.format = THREE.DepthFormat;
    t.depthTexture.type = THREE.UnsignedIntType;
  }
  return t;
};

export class Post {
  constructor(renderer, width, height) {
    this.renderer = renderer;
    this.params = {
      focus: 260, range: 130, maxBlur: 11,
      bloom: 0.85, threshold: 0.72, knee: 0.35,
      exposure: 1.42, rolloff: 3.4, grain: 0.030, vignette: 0.85, aberration: 0.9,
      shadowTint: new THREE.Color(0.80, 0.93, 1.10),
      highTint:   new THREE.Color(1.10, 1.00, 0.88),
      enabled: true,
    };

    this.bright = new Quad(new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: BRIGHT,
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: 0.72 }, uKnee: { value: 0.35 } },
    }));
    this.blur = new Quad(new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: BLUR,
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
    }));
    this.comp = new Quad(new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: COMPOSITE,
      uniforms: {
        tScene: { value: null }, tDepth: { value: null },
        tBloomA: { value: null }, tBloomB: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uNear: { value: 1 }, uFar: { value: 1000 },
        uFocus: { value: 260 }, uRange: { value: 130 }, uMaxBlur: { value: 11 },
        uBloom: { value: 0.85 }, uTime: { value: 0 }, uGrain: { value: 0.03 },
        uVignette: { value: 0.85 }, uAberration: { value: 0.9 }, uExposure: { value: 1.42 },
        uRolloff: { value: 3.4 },
        uShadowTint: { value: new THREE.Vector3() }, uHighTint: { value: new THREE.Vector3() },
      },
    }));
    this.setSize(width, height);
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    for (const t of [this.rtScene, this.rtA, this.rtB, this.rtC, this.rtD]) t && t.dispose();
    this.rtScene = rt(w, h, true);
    this.rtA = rt(w >> 1, h >> 1);   // bloom, half res
    this.rtB = rt(w >> 1, h >> 1);
    this.rtC = rt(w >> 2, h >> 2);   // bloom, quarter res — the wide halo
    this.rtD = rt(w >> 2, h >> 2);
  }

  render(scene, camera, time) {
    const r = this.renderer, p = this.params;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);

    if (!p.enabled) {
      this.comp.material.uniforms.tScene.value = this.rtScene.texture;
      // fall through anyway; disabling just flattens the look knobs
    }

    // bright pass -> half res
    this.bright.material.uniforms.tDiffuse.value = this.rtScene.texture;
    this.bright.material.uniforms.uThreshold.value = p.threshold;
    this.bright.material.uniforms.uKnee.value = p.knee;
    this.bright.render(r, this.rtA);

    const blur = (src, dst, dx, dy, tw, th) => {
      this.blur.material.uniforms.tDiffuse.value = src.texture;
      this.blur.material.uniforms.uDir.value.set(dx / tw, dy / th);
      this.blur.render(r, dst);
    };
    const hw = this.w >> 1, hh = this.h >> 1, qw = this.w >> 2, qh = this.h >> 2;
    blur(this.rtA, this.rtB, 1, 0, hw, hh);
    blur(this.rtB, this.rtA, 0, 1, hw, hh);
    // downsample into the quarter chain for a wider, softer halo
    blur(this.rtA, this.rtC, 1, 0, qw, qh);
    blur(this.rtC, this.rtD, 0, 1, qw, qh);
    blur(this.rtD, this.rtC, 2, 0, qw, qh);
    blur(this.rtC, this.rtD, 0, 2, qw, qh);

    const u = this.comp.material.uniforms;
    u.tScene.value = this.rtScene.texture;
    u.tDepth.value = this.rtScene.depthTexture;
    u.tBloomA.value = this.rtA.texture;
    u.tBloomB.value = this.rtD.texture;
    u.uTexel.value.set(1 / this.w, 1 / this.h);
    u.uNear.value = camera.near; u.uFar.value = camera.far;
    u.uFocus.value = p.focus; u.uRange.value = p.range;
    u.uMaxBlur.value = p.enabled ? p.maxBlur : 0;
    u.uBloom.value = p.enabled ? p.bloom : 0;
    u.uGrain.value = p.enabled ? p.grain : 0;
    u.uVignette.value = p.enabled ? p.vignette : 0;
    u.uAberration.value = p.enabled ? p.aberration * 0.01 : 0;
    u.uExposure.value = p.exposure;
    u.uRolloff.value = p.enabled ? p.rolloff : 1e6;
    u.uTime.value = time;
    u.uShadowTint.value.set(p.shadowTint.r, p.shadowTint.g, p.shadowTint.b);
    u.uHighTint.value.set(p.highTint.r, p.highTint.g, p.highTint.b);
    this.comp.render(r, null);
  }
}

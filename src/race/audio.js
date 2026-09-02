// Sound, synthesised.
//
// There were no assets and there is no licensing, which is the whole reason
// this is oscillators and filtered noise rather than samples — and at this
// fidelity a synthesised engine is honestly better than a bad loop, because it
// tracks speed continuously instead of crossfading between four recordings.
//
// Everything hangs off two continuous inputs (speed and slip) and three events
// (impact, kerb, gear). Nothing here polls the game; main.js pushes state in
// once a frame and the filters do the rest.
//
// Browsers will not start an AudioContext without a gesture, so this stays
// silent until the first key press and says so rather than failing quietly.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function noiseBuffer(ctx, seconds = 2) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function createAudio() {
  let ctx = null, ready = false, muted = false, lastGear = 0;
  let master, engineGain, engineFilter, oscA, oscB, sub, subG;
  let tyreGain, tyreFilter, windGain, windFilter, noise;

  function start() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // ---- engine: two detuned saws plus a sub, through a moving lowpass. The
    // detune is what stops it sounding like a test tone; the filter opening
    // with speed is what makes it sound like it is working harder.
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 400;
    engineFilter.Q.value = 3;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineFilter.connect(engineGain).connect(master);

    oscA = ctx.createOscillator(); oscA.type = 'sawtooth';
    oscB = ctx.createOscillator(); oscB.type = 'sawtooth'; oscB.detune.value = voice.detune;
    sub = ctx.createOscillator(); sub.type = 'square';
    subG = ctx.createGain(); subG.gain.value = voice.sub;
    engineFilter.Q.value = voice.q;            // a voice set before the gesture lands here
    oscA.connect(engineFilter); oscB.connect(engineFilter);
    sub.connect(subG).connect(engineFilter);
    oscA.start(); oscB.start(); sub.start();

    // ---- one noise source feeding tyres and wind, because they are the same
    // physical thing heard through different filters
    noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    noise.loop = true;

    tyreFilter = ctx.createBiquadFilter();
    tyreFilter.type = 'bandpass';
    tyreFilter.frequency.value = 1700;
    tyreFilter.Q.value = 1.1;
    tyreGain = ctx.createGain(); tyreGain.gain.value = 0;
    noise.connect(tyreFilter).connect(tyreGain).connect(master);

    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 700;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    noise.connect(windFilter).connect(windGain).connect(master);

    noise.start();
    ready = true;
    if (ambKind) buildAmbience(ambKind);       // a bed requested before the gesture
  }

  // ---- THE AMBIENT BED: one per circuit, all synthesis, all cheap. Slow
  // LFOs on filtered noise do most of it — a crowd is mid noise breathing, a
  // sea is low noise in waves, industry is a detuned drone under hiss. It
  // rides the master, so the sfx volume and mute own it like everything else.
  let ambKind = null, ambNodes = [];
  function ambStopAll() {
    for (const n of ambNodes) { try { n.stop && n.stop(); } catch { /* already */ } try { n.disconnect(); } catch { /* fine */ } }
    ambNodes = [];
  }
  function buildAmbience(kind) {
    ambStopAll();
    if (!ctx || !ready || !kind) return;
    const mkNoise = () => {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, 3); n.loop = true; n.start();
      return n;
    };
    const lfo = (freq, depth, target, base) => {
      const o = ctx.createOscillator(); o.frequency.value = freq;
      const g = ctx.createGain(); g.gain.value = depth;
      target.value = base;
      o.connect(g).connect(target); o.start();
      ambNodes.push(o, g);
      return o;
    };
    if (kind === 'crowd') {
      // the parade's pavement: a mid murmur that breathes, never repeats
      const n = mkNoise();
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6;
      const g = ctx.createGain();
      n.connect(f).connect(g).connect(master);
      lfo(0.07, 0.016, g.gain, 0.035);
      lfo(0.23, 0.008, g.gain, 0.035);
      ambNodes.push(n, f, g);
    } else if (kind === 'surf') {
      // the sea: low noise arriving in waves, a slower swell underneath
      const n = mkNoise();
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 340;
      const g = ctx.createGain();
      n.connect(f).connect(g).connect(master);
      lfo(0.09, 0.05, g.gain, 0.075);
      lfo(0.031, 0.025, g.gain, 0.075);
      ambNodes.push(n, f, g);
    } else if (kind === 'wind') {
      // the old town at night: thin high air between the walls, nearly nothing
      const n = mkNoise();
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.5;
      const g = ctx.createGain();
      n.connect(f).connect(g).connect(master);
      lfo(0.05, 0.014, g.gain, 0.022);
      ambNodes.push(n, f, g);
    } else if (kind === 'industry') {
      // the works: two saws a few cents apart under a lowpass, plus hiss —
      // the sound of something enormous idling two streets away
      const g = ctx.createGain(); g.gain.value = 0.05;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 54;
      const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 54.7;
      o1.connect(f); o2.connect(f); f.connect(g).connect(master);
      o1.start(); o2.start();
      const n = mkNoise();
      const hf = ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 2600;
      const hg = ctx.createGain();
      n.connect(hf).connect(hg).connect(master);
      lfo(0.11, 0.006, hg.gain, 0.012);
      ambNodes.push(o1, o2, f, g, n, hf, hg);
    }
  }

  // A short burst: the shape of every one-off in the game. `tone` is the body
  // of it and `bright` how much noise rides on top.
  function hit(tone, bright, len, vol) {
    if (!ready || muted) return;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    g.connect(master);

    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(tone, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, tone * 0.35), t + len);
    o.connect(g); o.start(t); o.stop(t + len + 0.02);

    if (bright > 0) {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, 0.4);
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass'; nf.frequency.value = 900 + bright * 2400; nf.Q.value = 0.7;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vol * bright, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + len * 0.8);
      n.connect(nf).connect(ng).connect(master);
      n.start(t); n.stop(t + len);
    }
  }

  let vol = 0.9, prevThrottle = 0, surface = null, lastThunk = 0;
  let voice = { note: 1, detune: 14, sub: 0.35, q: 3 };
  const applyGain = () => { if (master) master.gain.value = muted ? 0 : 0.5 * vol; };

  return {
    start,
    get on() { return ready && !muted; },
    get started() { return !!ctx; },
    mute(v) {
      muted = v === undefined ? !muted : !!v;
      applyGain();
      return muted;
    },
    // the volume knob, 0..1 — the settings slider drives this
    setVolume(v) { vol = Math.max(0, Math.min(1, v)); applyGain(); },

    // the circuit's ambient bed — remembered if asked for before the first
    // gesture, swapped live when the track swaps
    ambience(kind) { ambKind = kind || null; if (ready) buildAmbience(ambKind); },
    // what the tyres are ON: 'plank' thunks, 'gravel' hisses, null is tarmac
    setSurface(kind) { surface = kind || null; },
    // the chassis speaks: note scale, saw spread, sub-square chest, filter bite
    setVoice(v) {
      voice = { note: 1, detune: 14, sub: 0.35, q: 3, ...(v || {}) };
      if (ready) {
        oscB.detune.value = voice.detune;
        subG.gain.value = voice.sub;
        engineFilter.Q.value = voice.q;
      }
    },

    // pushed once a frame
    update(speed, vmax, throttle, slip, offRoad, nos = false) {
      if (!ready || muted) return;
      const f = clamp(Math.abs(speed) / vmax, 0, 1);
      // A gearbox, faked: the note climbs, snaps back and climbs again, which
      // is most of what makes an engine sound like it is accelerating rather
      // than like a siren. The SNAP is the whole effect: the old smoothing
      // constant smeared a gear change into a glide, which is a siren again.
      const gear = Math.min(4, Math.floor(f * 5));
      const withinGear = f * 5 - gear;
      const note = (40 + withinGear * 128 + gear * 8) * voice.note;
      const now = ctx.currentTime;
      const shifted = gear !== lastGear;
      const k = shifted ? 0.015 : 0.08;
      if (shifted && ready) {
        // a breath off the throttle and a mechanical tick, like a real change
        engineGain.gain.cancelScheduledValues(now);
        engineGain.gain.setValueAtTime(0.02, now);
        if (gear > lastGear && f > 0.2) hit(210, 0.5, 0.05, 0.07);
        lastGear = gear;
      }
      oscA.frequency.setTargetAtTime(note, now, k);
      oscB.frequency.setTargetAtTime(note * 1.005, now, k);
      sub.frequency.setTargetAtTime(note * 0.5, now, k);
      engineFilter.frequency.setTargetAtTime(320 + f * 2600 + (throttle > 0 ? 500 : 0), now, k);
      engineGain.gain.setTargetAtTime(0.035 + f * 0.075 + (throttle > 0 ? 0.02 : 0), now, 0.08);

      // LIFT-OFF CRACKLE: come off a wide-open throttle at speed and the
      // exhaust spits a couple of pops — the cheapest, most 1986 sound
      // this engine makes, and it only fires on the transition
      if (prevThrottle > 0.6 && throttle <= 0 && f > 0.5) {
        hit(90 + Math.random() * 30, 0.85, 0.06, 0.12);
        hit(64 + Math.random() * 20, 0.9, 0.1, 0.09);
      }
      prevThrottle = throttle;

      // tyres: scrubbing under slip, rumbling off the tarmac — and the road
      // SURFACE has a voice: planks thunk under the wheels at pace, gravel
      // rides a constant hiss. You hear the pier before you read the sign.
      const scrub = clamp(Math.abs(slip) * 1.7, 0, 1) * f;
      const surfGain = surface === 'gravel' ? f * 0.10 : surface === 'plank' ? f * 0.05 : 0;
      tyreGain.gain.setTargetAtTime(scrub * 0.20 + (offRoad ? f * 0.12 : 0) + surfGain, now, 0.05);
      tyreFilter.frequency.setTargetAtTime(
        offRoad ? 620 : surface === 'gravel' ? 800 : 1500 + scrub * 900, now, 0.05);
      if (surface === 'plank' && f > 0.12 && now - lastThunk > 0.42 - f * 0.3) {
        hit(110, 0.5, 0.045, 0.07);
        lastThunk = now;
      }

      // the wind carries the speed now: nearly triple at the top end, and it
      // keeps rising past where the engine flattens out — the last 20% of
      // speed is mostly SOUND, which is what a fast road car feels like.
      // A NOS burn doubles the wind and shoves the filter open: the burn
      // should be HEARD before the speedo confirms it.
      windGain.gain.setTargetAtTime(f * f * 0.28 * (nos ? 2.1 : 1), now, nos ? 0.04 : 0.12);
      windFilter.frequency.setTargetAtTime(400 + f * 1800 + (nos ? 900 : 0), now, 0.08);
    },

    impact(severity) { hit(90 + severity * 40, 0.9, 0.32 + severity * 0.3, clamp(0.12 + severity * 0.5, 0, 0.7)); },
    // the NOS ignition: a chest-thump and a rising whoosh, ON the press —
    // the burn's wind takes over from here, this is the moment it lights
    nosIgnite() {
      if (!ctx || !ready || muted) return;
      const now = ctx.currentTime;
      hit(140, 0.4, 0.5, 0.5);                    // the thump
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(130, now);
      o.frequency.exponentialRampToValueAtTime(46, now + 0.28);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      o.connect(g).connect(master);
      o.start(now); o.stop(now + 0.32);           // the drop under it
    },
    horn() { hit(330, 0.12, 0.16, 0.22); hit(415, 0.12, 0.22, 0.22); },   // the two-note menace
    thud() { hit(70, 0.45, 0.3, 0.4); },          // somebody on the bonnet
    kerb() { hit(150, 0.7, 0.11, 0.16); },        // riding over something
    beep(f) { hit(f || 520, 0.05, 0.09, 0.12); }, // lap / countdown / chirps
  };
}

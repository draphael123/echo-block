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
  let master, engineGain, engineFilter, oscA, oscB, sub;
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
    oscB = ctx.createOscillator(); oscB.type = 'sawtooth'; oscB.detune.value = 14;
    sub = ctx.createOscillator(); sub.type = 'square';
    const subG = ctx.createGain(); subG.gain.value = 0.35;
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

  return {
    start,
    get on() { return ready && !muted; },
    get started() { return !!ctx; },
    mute(v) {
      muted = v === undefined ? !muted : !!v;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },

    // pushed once a frame
    update(speed, vmax, throttle, slip, offRoad) {
      if (!ready || muted) return;
      const f = clamp(Math.abs(speed) / vmax, 0, 1);
      // A gearbox, faked: the note climbs, snaps back and climbs again, which
      // is most of what makes an engine sound like it is accelerating rather
      // than like a siren. The SNAP is the whole effect: the old smoothing
      // constant smeared a gear change into a glide, which is a siren again.
      const gear = Math.min(4, Math.floor(f * 5));
      const withinGear = f * 5 - gear;
      const note = 40 + withinGear * 128 + gear * 8;
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

      // tyres: scrubbing under slip, rumbling off the tarmac
      const scrub = clamp(Math.abs(slip) * 1.7, 0, 1) * f;
      tyreGain.gain.setTargetAtTime(scrub * 0.20 + (offRoad ? f * 0.12 : 0), now, 0.05);
      tyreFilter.frequency.setTargetAtTime(offRoad ? 620 : 1500 + scrub * 900, now, 0.05);

      windGain.gain.setTargetAtTime(f * f * 0.11, now, 0.12);
      windFilter.frequency.setTargetAtTime(400 + f * 1100, now, 0.12);
    },

    impact(severity) { hit(90 + severity * 40, 0.9, 0.32 + severity * 0.3, clamp(0.12 + severity * 0.5, 0, 0.7)); },
    thud() { hit(70, 0.45, 0.3, 0.4); },          // somebody on the bonnet
    kerb() { hit(150, 0.7, 0.11, 0.16); },        // riding over something
    beep() { hit(520, 0.05, 0.09, 0.12); },       // lap / countdown
  };
}

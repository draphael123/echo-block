// The town's radio.
//
// There is not one audio asset anywhere in this project — the engine note, the
// skids, the struck bins are all synthesised in race/audio.js — and the music
// keeps the rule: a sequencer, a handful of oscillators, and a tape-ish delay.
// Night-drive synthwave, because that is what 1986 sounds like from a car.
//
// REWRITTEN for the polish pass: a real 32-bar FORM instead of a loop. Two
// eight-bar sections — A rides Am9/Fmaj7/Cmaj7/G6, B lifts through Dm9 and
// leans on an E major that pulls the loop home — with the drums dropping out
// at the top of B and rebuilding, a snare fill at every section turn, an
// arpeggio that lives in B, and a detuned two-saw lead that speaks in
// call-and-response phrases instead of noodling. The pads DUCK on every kick
// (the sidechain pump that makes synthwave breathe), and the whole kit obeys
// a volume knob and an INTENSITY line — the final lap turns the heat up.
//
// If real produced tracks ever arrive, this file is the seam: keep the
// interface, swap the insides for an <audio> element.
const N = (m) => 440 * Math.pow(2, (m - 69) / 12);

// A: the honest workhorse, voiced with 7ths and 9ths so it shimmers.
// B: the lift — Dm9 up to an E MAJOR (V of Am) that yanks the loop home.
const PROG_A = [
  { root: 33, pad: [57, 60, 64, 71] },      // Am9
  { root: 29, pad: [57, 60, 64, 65] },      // Fmaj7
  { root: 36, pad: [55, 60, 64, 71] },      // Cmaj7
  { root: 31, pad: [55, 59, 62, 64] },      // G6
];
const PROG_B = [
  { root: 26, pad: [57, 60, 62, 64] },      // Dm9
  { root: 29, pad: [57, 60, 64, 65] },      // Fmaj7
  { root: 31, pad: [55, 59, 62, 64] },      // G6
  { root: 28, pad: [56, 59, 64, 68] },      // E — the pull home
];
// one bar of bass rhythm (16ths): octave bounce with a push before the bar
const BASS_PAT = [0, 12, 0, 0, 12, 0, 7, 12, 0, 12, 0, 0, 12, 0, 12, 7];
// two-bar call, two-bar response — each 32 steps, rests carry the phrasing
const LEAD_CALL = [
  76, 0, 0, 74, 76, 0, 79, 0, 76, 0, 74, 0, 72, 0, 0, 0,
  74, 0, 0, 72, 74, 0, 76, 0, 72, 0, 71, 0, 69, 0, 0, 0];
const LEAD_ANSWER = [
  77, 0, 0, 76, 77, 0, 81, 0, 79, 0, 76, 0, 74, 0, 0, 0,
  76, 0, 74, 0, 72, 0, 74, 0, 71, 0, 72, 0, 69, 0, 0, 0];

export function createMusic() {
  let ctx = null, master = null, delay = null, wet = null, padBus = null;
  let mode = 'race', muted = false, running = false;
  let timer = null, nextT = 0, step = 0;
  let vol = 0.8, heat = 0;

  const baseGain = () => (muted ? 0.0001 : 0.5 * vol + 0.0001);

  function boot() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    delay = ctx.createDelay(1.0);
    const fb = ctx.createGain(); fb.gain.value = 0.34;
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 3000;
    wet = ctx.createGain(); wet.gain.value = 0.2;
    // the pad bus, so the kick can duck every sustained voice at once
    padBus = ctx.createGain(); padBus.gain.value = 1;
    padBus.connect(master);
    master.connect(comp); comp.connect(ctx.destination);
    master.connect(delay); delay.connect(damp); damp.connect(fb); fb.connect(delay);
    delay.connect(wet); wet.connect(comp);
  }

  const spb = () => 60 / (mode === 'race' ? 118 : 88);   // seconds per beat

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function osc(type, freq, t, dur, peak, dest, detune = 0, filter = null) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
    const g = ctx.createGain(); env(g, t, 0.005, peak, dur);
    if (filter) { o.connect(filter); filter.connect(g); } else o.connect(g);
    g.connect(dest);
    o.start(t); o.stop(t + dur + 0.1);
  }
  function noise(t, dur, peak, hp) {
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ctx.createGain(); g.gain.value = peak;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }
  function kick(t) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = ctx.createGain(); env(g, t, 0.002, 0.9, 0.17);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.3);
    // THE PUMP: every kick ducks the pad bus and lets it swell back —
    // this one gesture is most of what makes synthwave feel like driving
    padBus.gain.cancelScheduledValues(t);
    padBus.gain.setValueAtTime(1, t);
    padBus.gain.linearRampToValueAtTime(0.5, t + 0.02);
    padBus.gain.linearRampToValueAtTime(1, t + 0.24);
  }
  // the lead voice: two saws detuned either side, through a lowpass, into
  // the delay — it answers itself a bar later off the tape
  function leadNote(m, t, dur, peak) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.8;
    const g = ctx.createGain(); env(g, t, 0.008, peak, dur);
    for (const dt of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = N(m); o.detune.value = dt;
      o.connect(lp);
      o.start(t); o.stop(t + dur + 0.1);
    }
    lp.connect(g); g.connect(master); g.connect(wet);
  }

  function schedule(t, st) {
    // the 32-bar form: bars 0-15 are A (the prog twice over), 16-31 are B
    const barIdx = Math.floor(st / 16) % 32;
    const inB = barIdx >= 16;
    const ch = (inB ? PROG_B : PROG_A)[Math.floor((barIdx % 16) / 4) % 4];
    const sixteenth = st % 16;
    const drums = mode === 'race';
    // the BREATH: the first two bars of B drop the kit and let the pads
    // carry it, then everything piles back in
    const breath = inB && barIdx < 18 && heat < 0.5;
    // the FILL: the last bar before each section turn rolls the snare in
    const fill = (barIdx === 15 || barIdx === 31) && sixteenth >= 12;

    if (drums && !breath) {
      if (sixteenth % 4 === 0) kick(t);
      if (sixteenth === 4 || sixteenth === 12) noise(t, 0.14, 0.5, 1400);
      if (fill) noise(t, 0.09, 0.3 + (sixteenth - 12) * 0.08, 1600);
      const hatStep = heat > 0.5 ? 1 : 2;
      if (sixteenth % hatStep === 0)
        noise(t, 0.03, (sixteenth % 4 === 2 ? 0.22 : 0.1) * (0.8 + Math.random() * 0.4), 6800);
    }
    // bass: 16ths in race, half-time pulses in the menu
    if (drums && !breath) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 640 + heat * 260;
      osc('sawtooth', N(ch.root + BASS_PAT[sixteenth]), t, 0.11, 0.5, master, 0, lp);
    } else if (sixteenth % 8 === 0) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      osc('sawtooth', N(ch.root + 12), t, spb() * 1.8, 0.3, master, 0, lp);
    }
    // pads: one swell per bar, two detuned saws per note, on the DUCKED bus
    if (sixteenth === 0) {
      for (const m of ch.pad) {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.value = (mode === 'race' ? 1150 : 900) + heat * 500;
        const dur = spb() * 4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime((mode === 'race' ? 0.05 : 0.08) / Math.sqrt(ch.pad.length / 3), t + dur * 0.35);
        g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.05);
        for (const dt of [-7, 7]) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = N(m); o.detune.value = dt;
          o.connect(lp);
          o.start(t); o.stop(t + dur * 1.1);
        }
        lp.connect(g); g.connect(padBus); g.connect(wet);
      }
    }
    // the ARP: sixteenth plucks up the chord — B's signature, and the heat's
    if ((inB || heat > 0.5) && (drums || sixteenth % 2 === 0)) {
      const m = ch.pad[sixteenth % ch.pad.length] + 12;
      osc('square', N(m), t, 0.07, 0.045 + heat * 0.03, wet);
    }
    // the LEAD: call in the back half of A, answer in the back half of B
    const phraseBar = barIdx % 16;
    if (phraseBar >= 8) {
      const line = inB ? LEAD_ANSWER : LEAD_CALL;
      const m = line[st % 32];
      if (m) leadNote(m, t, 0.24, (mode === 'race' ? 0.13 : 0.16) + heat * 0.05);
    }
  }

  function pump() {
    const ahead = ctx.currentTime + 0.18;
    while (nextT < ahead) {
      schedule(nextT, step);
      nextT += spb() / 4;
      step++;
    }
  }

  return {
    start(m) {
      if (m) mode = m;
      if (!ctx) boot();
      if (ctx.state === 'suspended') ctx.resume();
      if (running) return;
      running = true;
      nextT = ctx.currentTime + 0.1; step = 0;
      delay.delayTime.value = spb() * 0.75;
      master.gain.setTargetAtTime(baseGain(), ctx.currentTime, 0.5);
      timer = setInterval(pump, 40);
    },
    stop() {
      if (!running) return;
      running = false;
      clearInterval(timer);
      if (master) master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
    },
    mute(v) {
      muted = !!v;
      if (master && ctx) master.gain.setTargetAtTime(baseGain(), ctx.currentTime, 0.15);
    },
    // the volume knob, 0..1 — the settings slider drives this
    setVolume(v) {
      vol = Math.max(0, Math.min(1, v));
      if (master && ctx && running) master.gain.setTargetAtTime(baseGain(), ctx.currentTime, 0.15);
    },
    // the heat, 0..1 — the final lap turns it up: denser hats, open filters,
    // the arp everywhere, the lead louder
    intensity(v) { heat = Math.max(0, Math.min(1, v)); },
  };
}

// The town's radio.
//
// There is not one audio asset anywhere in this project — the engine note, the
// skids, the struck bins are all synthesised in race/audio.js — and the music
// keeps the rule: a sixteen-step sequencer, a handful of oscillators, and a
// tape-ish delay. Night-drive synthwave, because that is what 1986 sounds
// like from a car. Two moods from one machine: 'race' runs the full kit at
// 118, 'menu' drops the drums and lets the pads carry the hub at 88.
//
// If real produced tracks ever arrive (the ElevenLabs music API needs a paid
// plan), this file is the seam: keep the interface, swap the insides for an
// <audio> element.
const N = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Am — F — C — G, the honest workhorse. Bass roots low, pads in the middle,
// the lead an octave up and mostly silent.
const PROG = [
  { root: 33, pad: [57, 60, 64] },      // Am
  { root: 29, pad: [57, 60, 65] },      // F
  { root: 36, pad: [55, 60, 64] },      // C
  { root: 31, pad: [55, 59, 62] },      // G
];
// one bar of bass rhythm (16ths): octave bounce with a push before the bar
const BASS_PAT = [0, 12, 0, 0, 12, 0, 7, 12, 0, 12, 0, 0, 12, 0, 12, 7];
// a sparse lead phrase over two bars; 0 = rest
const LEAD = [76, 0, 0, 74, 72, 0, 74, 0, 69, 0, 0, 0, 72, 0, 74, 76,
              77, 0, 76, 0, 74, 0, 72, 0, 71, 0, 74, 0, 72, 0, 0, 0];

export function createMusic() {
  let ctx = null, master = null, delay = null, wet = null;
  let mode = 'race', muted = false, running = false;
  let timer = null, nextT = 0, step = 0;

  function boot() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    delay = ctx.createDelay(1.0);
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 3200;
    wet = ctx.createGain(); wet.gain.value = 0.18;
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
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    const g = ctx.createGain(); env(g, t, 0.002, 0.85, 0.16);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.3);
  }

  function schedule(t, st) {
    const bar = Math.floor(st / 16) % 4, sixteenth = st % 16;
    const ch = PROG[bar];
    const drums = mode === 'race';
    if (drums) {
      if (sixteenth % 4 === 0) kick(t);
      if (sixteenth === 4 || sixteenth === 12) noise(t, 0.14, 0.5, 1400);
      if (sixteenth % 2 === 0) noise(t, 0.03, sixteenth % 4 === 2 ? 0.22 : 0.1, 6800);
    }
    // bass: 16ths in race, half-time pulses in the menu
    if (drums) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 640;
      osc('sawtooth', N(ch.root + BASS_PAT[sixteenth]), t, 0.11, 0.5, master, 0, lp);
    } else if (sixteenth % 8 === 0) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      osc('sawtooth', N(ch.root + 12), t, spb() * 1.8, 0.3, master, 0, lp);
    }
    // pads: one swell per bar, two detuned saws per note
    if (sixteenth === 0) {
      for (const m of ch.pad) {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = mode === 'race' ? 1150 : 900;
        const dur = spb() * 4;
        const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = N(m); o1.detune.value = -7;
        const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = N(m); o2.detune.value = 7;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(mode === 'race' ? 0.055 : 0.085, t + dur * 0.35);
        g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.05);
        o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master); g.connect(wet);
        o1.start(t); o2.start(t); o1.stop(t + dur * 1.1); o2.stop(t + dur * 1.1);
      }
    }
    // the lead, every other pass round the progression
    const phrase = Math.floor(st / 64) % 2 === 1;
    if (phrase) {
      const m = LEAD[st % 32];
      if (m) {
        const g2 = ctx.createGain(); g2.gain.value = 1;
        osc('triangle', N(m), t, 0.22, mode === 'race' ? 0.16 : 0.2, wet);
        osc('triangle', N(m), t, 0.22, mode === 'race' ? 0.1 : 0.12, master);
      }
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
      master.gain.setTargetAtTime(muted ? 0.0001 : 0.5, ctx.currentTime, 0.5);
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
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0.0001 : 0.5, ctx.currentTime, 0.15);
    },
  };
}

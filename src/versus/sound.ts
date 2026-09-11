/**
 * Sound, made on the spot.
 *
 * Every cue is synthesised with the Web Audio API — no files to load,
 * nothing to cache — but not from bare beeps. A bell is a stack of
 * inharmonic partials struck together and dying at different rates, the
 * fanfare is two detuned saws breathing through a filter, a tick is a burst
 * of noise through a narrow band, and all of it runs through a short
 * convolution reverb and a compressor so the cues sit in one room and never
 * clip. Off is one tap away and remembered. A phone only lets sound through
 * once a user gesture has opened the audio context, which the buttons that
 * start a match do.
 */
const KEY = 'fiftyStatesDrill.versus.sound';

export type Cue =
  | 'tick' | 'go' | 'lock' | 'right' | 'wrong' | 'miss' | 'streak' | 'round'
  | 'win' | 'loss' | 'draw' | 'react' | 'join';

/** Overall loudness. Cues are a nudge, not a jingle. */
const MASTER = 0.55;

/** How much of each cue goes through the room. */
const WET = 0.22;

/** The floor an exponential ramp can reach: zero is not allowed. */
const SILENT = 0.0005;

let ctx: AudioContext | null = null;
let dry: GainNode | null = null;
let verb: ConvolverNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let on: boolean | null = null;
const listeners = new Set<() => void>();

/* ---------------- the switch ---------------- */

export function soundOn(): boolean {
  if (on === null) {
    try {
      on = localStorage.getItem(KEY) !== 'off';
    } catch {
      on = true;
    }
  }
  return on;
}

export function setSoundOn(next: boolean): void {
  on = next;
  try {
    if (next) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    // Storage unavailable: the choice holds for this session.
  }
  if (next) unlockAudio();
  listeners.forEach((l) => l());
}

/** Hear the switch change. Returns the unsubscribe. */
export function onSoundChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/* ---------------- the room ---------------- */

/** A decaying burst of noise, which convolved with a signal is a small hall. */
function impulse(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const n = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return buf;
}

function whiteNoise(c: AudioContext, seconds: number): AudioBuffer {
  const n = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function build(c: AudioContext): void {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.12;
  const master = c.createGain();
  master.gain.value = MASTER;
  comp.connect(master).connect(c.destination);

  dry = c.createGain();
  dry.connect(comp);
  verb = c.createConvolver();
  verb.buffer = impulse(c, 1.4, 2.6);
  const wet = c.createGain();
  wet.gain.value = WET;
  verb.connect(wet).connect(comp);
  noiseBuf = whiteNoise(c, 1);
}

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC();
      build(ctx);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => { /* not from a gesture yet */ });
  return ctx;
}

/** Called from a tap, so the browser lets sound through afterwards. */
export function unlockAudio(): void {
  if (soundOn()) context();
}

/* ---------------- voices ---------------- */

/** Into the room: straight out, and through the reverb. */
const out = (node: AudioNode) => {
  if (dry && verb) {
    node.connect(dry);
    node.connect(verb);
  }
};

/** Attack, then an exponential decay to nothing. */
function envelope(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(SILENT, t + attack + decay);
}

/**
 * A struck bell: partials at the ratios of a real one — not whole numbers —
 * each dying away faster the higher it sits, so the strike is bright and the
 * ring is warm.
 */
const PARTIALS: [ratio: number, level: number, decay: number][] = [
  [1, 1, 1], [2.0, 0.55, 0.7], [2.98, 0.3, 0.5], [4.16, 0.16, 0.35], [5.43, 0.08, 0.25],
];

function bell(c: AudioContext, t: number, f: number, dur: number, gain: number): void {
  for (const [ratio, level, decay] of PARTIALS) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f * ratio, t);
    envelope(g, t, gain * level * 0.4, 0.003, dur * decay);
    osc.connect(g);
    out(g);
    osc.start(t);
    osc.stop(t + dur * decay + 0.05);
  }
  // The strike itself: a breath of noise, gone at once.
  click(c, t, f * 3, 1.5, 0.03, gain * 0.25);
}

/** A soft filtered tone, with an optional slide in pitch. */
function tone(
  c: AudioContext, t: number, f: number, dur: number, gain: number,
  type: OscillatorType = 'triangle', cutoff = 1200, slideTo?: number,
): void {
  const osc = c.createOscillator();
  const lp = c.createBiquadFilter();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(cutoff, t);
  lp.Q.value = 0.7;
  envelope(g, t, gain, 0.008, dur);
  osc.connect(lp).connect(g);
  out(g);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Two saws a few cents apart, opening through a filter: a small brass section. */
function brass(c: AudioContext, t: number, f: number, dur: number, gain: number): void {
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(400, t);
  lp.frequency.exponentialRampToValueAtTime(2600, t + 0.05);
  lp.frequency.exponentialRampToValueAtTime(900, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.02);
  g.gain.setValueAtTime(gain, t + Math.max(0.02, dur - 0.08));
  g.gain.exponentialRampToValueAtTime(SILENT, t + dur + 0.06);
  for (const cents of [-6, 6]) {
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, t);
    osc.detune.setValueAtTime(cents, t);
    osc.connect(lp);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }
  lp.connect(g);
  out(g);
}

/** A sine sweeping between two pitches: a bubble, a blip. */
function pop(c: AudioContext, t: number, f0: number, f1: number, dur: number, gain: number): void {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
  envelope(g, t, gain, 0.002, dur);
  osc.connect(g);
  out(g);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Noise through a narrow band: a tick, a tock, the strike of a bell. */
function click(c: AudioContext, t: number, f: number, q: number, dur: number, gain: number): void {
  if (!noiseBuf) return;
  const src = c.createBufferSource();
  const bp = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = noiseBuf;
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(f, t);
  bp.Q.value = q;
  envelope(g, t, gain, 0.001, dur);
  src.connect(bp).connect(g);
  out(g);
  src.start(t);
  src.stop(t + dur + 0.05);
}

/** Noise swept through a band: a rush of air. */
function swoosh(c: AudioContext, t: number, f0: number, f1: number, dur: number, gain: number): void {
  if (!noiseBuf) return;
  const src = c.createBufferSource();
  const bp = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = noiseBuf;
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.55);
  g.gain.exponentialRampToValueAtTime(SILENT, t + dur);
  src.connect(bp).connect(g);
  out(g);
  src.start(t);
  src.stop(t + dur + 0.05);
}

/* ---------------- the cues ---------------- */

// Pitches, for reading the cues as music rather than numbers.
const C4 = 261.63, D4 = 293.66, E4 = 329.63, G4 = 392;
const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880;
const C6 = 1046.5, D6 = 1174.66, E6 = 1318.51, G6 = 1567.98, A6 = 1760;

const CUES: Record<Cue, (c: AudioContext, t: number) => void> = {
  // A woodblock: a click and a short falling pip.
  tick: (c, t) => {
    click(c, t, 2400, 8, 0.045, 0.5);
    pop(c, t, 1050, 860, 0.09, 0.3);
  },
  // Air rushing up into two bright bells.
  go: (c, t) => {
    swoosh(c, t, 400, 3200, 0.26, 0.22);
    bell(c, t + 0.12, C6, 0.9, 0.5);
    bell(c, t + 0.24, G6, 1.2, 0.45);
  },
  // A tock: the tap landed.
  lock: (c, t) => {
    click(c, t, 1800, 6, 0.035, 0.35);
    pop(c, t, 640, 520, 0.06, 0.22);
  },
  // Two bells, a fifth apart, rising.
  right: (c, t) => {
    bell(c, t, A5, 0.7, 0.42);
    bell(c, t + 0.11, E6, 1.1, 0.48);
  },
  // A soft bonk: a low tone dropping away, with a thud under it.
  wrong: (c, t) => {
    tone(c, t, 196, 0.34, 0.5, 'triangle', 900, 140);
    click(c, t, 160, 2, 0.1, 0.35);
  },
  // Two soft notes down: the clock ran out.
  miss: (c, t) => {
    tone(c, t, G4, 0.2, 0.32, 'triangle', 1300);
    tone(c, t + 0.2, E4 * 0.944, 0.36, 0.32, 'triangle', 1000);
  },
  // An arpeggio of bells up the chord, with a rush of air behind it.
  streak: (c, t) => {
    swoosh(c, t, 600, 4000, 0.22, 0.16);
    bell(c, t, C6, 0.5, 0.36);
    bell(c, t + 0.09, E6, 0.6, 0.38);
    bell(c, t + 0.18, G6, 1.2, 0.46);
  },
  // A bright ding with a grace note.
  round: (c, t) => {
    bell(c, t, D6, 0.8, 0.38);
    bell(c, t + 0.14, A6, 1.2, 0.42);
  },
  // Three brass hits on the chord, the last held, with bells sparkling over it.
  win: (c, t) => {
    const chord = [C5, E5, G5];
    for (const hit of [0, 0.17]) for (const f of chord) brass(c, t + hit, f, 0.12, 0.16);
    for (const f of [...chord, C6]) brass(c, t + 0.34, f, 0.85, 0.15);
    bell(c, t + 0.36, C6, 1.2, 0.34);
    bell(c, t + 0.52, E6, 1.2, 0.3);
    bell(c, t + 0.68, G6, 1.6, 0.34);
    swoosh(c, t + 0.3, 800, 5000, 0.4, 0.12);
  },
  // Three soft notes stepping down, each a little duller.
  loss: (c, t) => {
    tone(c, t, E4, 0.3, 0.34, 'triangle', 1400);
    tone(c, t + 0.28, D4, 0.3, 0.32, 'triangle', 1100);
    tone(c, t + 0.56, C4, 0.7, 0.34, 'triangle', 800);
  },
  // The same bell twice: neither side had it.
  draw: (c, t) => {
    bell(c, t, G5, 0.8, 0.38);
    bell(c, t + 0.3, G5, 1.0, 0.38);
  },
  // A bubble popping.
  react: (c, t) => {
    pop(c, t, 380, 1150, 0.09, 0.38);
    click(c, t, 3000, 6, 0.02, 0.18);
  },
  // A doorbell: ding, dong.
  join: (c, t) => {
    bell(c, t, E5, 0.7, 0.38);
    bell(c, t + 0.22, C5, 1.1, 0.38);
  },
};

/** How long a cue will wait for the context to open before it is dropped. */
const STALE_MS = 250;

export function play(cue: Cue): void {
  if (!soundOn()) return;
  const c = context();
  if (!c) return;
  const fire = () => CUES[cue](c, c.currentTime + 0.01);
  if (c.state === 'running') {
    fire();
    return;
  }
  // Just unlocked: the context opens a moment after the tap. A cue that
  // would land much later than that is not worth hearing out of place.
  const asked = Date.now();
  void c.resume().then(() => { if (Date.now() - asked < STALE_MS) fire(); }).catch(() => { /* still locked */ });
}

/*
 * Lydeffekter laget med Web Audio API – ingen lydfiler trengs.
 * Nettlesere krever et brukertrykk før lyd kan spilles, derfor kalles unlockAudio() ved første klikk.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let musicNodes: { stop: () => void } | null = null;

function ac(): AudioContext | null {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function unlockAudio() {
  const c = ac();
  if (c && c.state === 'suspended') c.resume();
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (master) master.gain.value = on ? 0.5 : 0;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; delay?: number; slideTo?: number; attack?: number } = {}) {
  const c = ac();
  if (!c || !master || !enabled) return;
  const t0 = c.currentTime + (opts.delay || 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
  const vol = opts.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + (opts.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { vol?: number; delay?: number; freq?: number; q?: number; sweepTo?: number } = {}) {
  const c = ac();
  if (!c || !master || !enabled) return;
  const t0 = c.currentTime + (opts.delay || 0);
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(opts.freq || 2000, t0);
  if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t0 + dur);
  f.Q.value = opts.q || 1;
  const g = c.createGain();
  g.gain.value = opts.vol ?? 0.4;
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

let lastHit = 0;

export const sfx = {
  click: () => tone(900, 0.05, { type: 'triangle', vol: 0.15 }),
  diceHit: (strength = 1) => {
    const now = performance.now();
    if (now - lastHit < 35) return;
    lastHit = now;
    const v = Math.min(0.5, 0.08 + strength * 0.06);
    noise(0.05, { vol: v, freq: 2500 + Math.random() * 1500, q: 3 });
    tone(300 + Math.random() * 200, 0.04, { type: 'square', vol: v * 0.15 });
  },
  diceShake: () => { for (let k = 0; k < 5; k++) noise(0.04, { vol: 0.15, freq: 3000, q: 2, delay: k * 0.05 }); },
  step: (k = 0) => tone(520 + (k % 2) * 60, 0.07, { type: 'triangle', vol: 0.18 }),
  land: () => { tone(220, 0.15, { type: 'sine', vol: 0.3 }); noise(0.08, { vol: 0.15, freq: 600 }); },
  coin: () => { tone(988, 0.08, { type: 'square', vol: 0.12 }); tone(1319, 0.25, { type: 'square', vol: 0.12, delay: 0.07 }); },
  pay: () => { tone(660, 0.1, { type: 'triangle', vol: 0.2 }); tone(440, 0.18, { type: 'triangle', vol: 0.2, delay: 0.08 }); },
  buy: () => [523, 659, 784, 1047].forEach((f, k) => tone(f, 0.18, { type: 'triangle', vol: 0.22, delay: k * 0.07 })),
  build: () => { noise(0.06, { vol: 0.35, freq: 800, q: 2 }); tone(330, 0.12, { type: 'square', vol: 0.12, delay: 0.02 }); tone(494, 0.15, { type: 'triangle', vol: 0.2, delay: 0.09 }); },
  sell: () => { tone(494, 0.1, { type: 'triangle', vol: 0.2 }); tone(330, 0.15, { type: 'triangle', vol: 0.2, delay: 0.08 }); },
  card: () => noise(0.25, { vol: 0.3, freq: 800, sweepTo: 4000, q: 1.5 }),
  jail: () => { tone(110, 0.5, { type: 'sawtooth', vol: 0.15 }); noise(0.1, { vol: 0.5, freq: 400, delay: 0.35, q: 4 }); tone(80, 0.3, { type: 'square', vol: 0.12, delay: 0.35 }); },
  unlock: () => [392, 523, 659].forEach((f, k) => tone(f, 0.12, { type: 'triangle', vol: 0.2, delay: k * 0.06 })),
  gavel: () => { noise(0.05, { vol: 0.6, freq: 500, q: 3 }); noise(0.05, { vol: 0.6, freq: 500, q: 3, delay: 0.18 }); },
  error: () => tone(140, 0.25, { type: 'square', vol: 0.12 }),
  alarm: () => { tone(880, 0.12, { type: 'square', vol: 0.12 }); tone(660, 0.12, { type: 'square', vol: 0.12, delay: 0.14 }); },
  trade: () => [659, 784, 988].forEach((f, k) => tone(f, 0.2, { type: 'sine', vol: 0.25, delay: k * 0.09 })),
  turn: () => tone(740, 0.12, { type: 'sine', vol: 0.15 }),
  fanfare: () => {
    const seq: [number, number][] = [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [784, 0.52], [1047, 0.62]];
    seq.forEach(([f, d]) => { tone(f, 0.3, { type: 'square', vol: 0.1, delay: d }); tone(f / 2, 0.3, { type: 'triangle', vol: 0.15, delay: d }); });
  },
  levelup: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, k) => tone(f, 0.25, { type: 'sine', vol: 0.2, delay: k * 0.06 })),
  achievement: () => { [784, 988, 1175].forEach((f, k) => tone(f, 0.3, { type: 'triangle', vol: 0.22, delay: k * 0.1 })); },
  bankrupt: () => [392, 370, 349, 294].forEach((f, k) => tone(f, k === 3 ? 0.7 : 0.3, { type: 'sawtooth', vol: 0.1, delay: k * 0.3, slideTo: k === 3 ? 220 : undefined })),
  whoosh: () => noise(0.35, { vol: 0.25, freq: 300, sweepTo: 2500, q: 0.8 }),
};

/** Rolig bakgrunnsmusikk: en enkel akkordsløyfe. */
export function startMusic() {
  const c = ac();
  if (!c || !master || musicNodes) return;
  const g = c.createGain();
  g.gain.value = 0.05;
  g.connect(master);
  const chords = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
  let k = 0;
  let stopped = false;
  const play = () => {
    if (stopped || !ctx) return;
    const t0 = ctx.currentTime;
    chords[k % chords.length].forEach((f) => {
      const o = ctx!.createOscillator();
      const og = ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      og.gain.setValueAtTime(0.0001, t0);
      og.gain.exponentialRampToValueAtTime(0.6, t0 + 0.8);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.8);
      o.connect(og).connect(g);
      o.start(t0);
      o.stop(t0 + 4);
    });
    k++;
  };
  play();
  const timer = setInterval(play, 3600);
  musicNodes = { stop: () => { stopped = true; clearInterval(timer); g.disconnect(); } };
}

export function stopMusic() {
  musicNodes?.stop();
  musicNodes = null;
}

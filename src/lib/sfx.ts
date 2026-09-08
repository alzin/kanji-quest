import { useSyncExternalStore } from "react";

/*
 * Kanji Dash sound engine.
 *
 * Two halves live in this file:
 *  - a pure planner (planSound and friends) that turns a SoundId into a data-only
 *    SoundPlan; it never touches window and is unit-tested in Node;
 *  - an impure renderer around one module-singleton AudioContext (Chrome caps
 *    hardware contexts at 6 and RunnerGame remounts on every "Run again").
 *
 * Rules the renderer follows:
 *  - the context is created/resumed only from unlock(), which callers invoke
 *    inside user-activation handlers, and never while sound is muted;
 *  - every multi-part sound is scheduled with AudioContext.currentTime offsets
 *    (Playwright's fake clock does not touch the audio clock), never setTimeout;
 *  - the starting frequency is always applied with frequency.setValueAtTime(f, t0)
 *    before any ramp (the e2e recorder keys on it);
 *  - everything is try/caught and every resume()/suspend() promise is swallowed,
 *    so the module is a silent no-op wherever Web Audio is missing or refuses.
 */

// ---------- Types ----------

export type SoundId =
  | "tap" | "sheet" | "laneChange" | "correct" | "comboMilestone" | "mastered"
  | "wrong" | "lastHeart" | "lessonOpen" | "keepRunning" | "pause" | "resume"
  | "runComplete" | "runEnded" | "checkpointPassed" | "checkpointFailed"
  | "stamp" | "coins" | "sealEarned" | "streakBell"
  | "strokeEnd" | "dojoPass" | "dojoFail" | "unmute";

export type SoundOpts = {
  combo?: number;      // correct, comboMilestone
  dir?: -1 | 1;        // laneChange (-1 = up)
  hearts?: number;     // wrong: 1 schedules lastHeart
  earned?: number;     // coins / results plans
  level?: number;      // stamp loudness 0..1 (dojo 0.65)
};

export type Voice = {
  at: number;                       // seconds after t0, >= 0
  kind: "osc" | "noise";
  wave?: OscillatorType;            // osc only
  freq: number;                     // Hz: oscillator start (setValueAtTime) or filter centre for noise
  freqEnd?: number;                 // exponential glide target
  glideMs?: number;
  detuneCents?: number;
  gain: number;                     // peak pre-master, <= 0.5
  attackMs: number;                 // linear 0 -> gain
  decayMs: number;                  // exponential -> 0.001, then stop
  filter?: { type: BiquadFilterType; freq: number; q: number; freqEnd?: number };
  lfo?: { hz: number; depth: number };
  ceremony?: boolean;               // bypasses the 8-voice cap
  // Pluck transient: the oscillator starts dropCents above its pitch and settles
  // linearly over dropMs (via the detune param, so frequency.setValueAtTime still
  // carries the true pitch for the e2e recorder).
  dropCents?: number;
  dropMs?: number;
};

export type SoundPlan = { id: SoundId; voices: Voice[]; haptic?: number | number[]; minIntervalMs: number };

export const SOUND_IDS: readonly SoundId[] = [
  "tap", "sheet", "laneChange", "correct", "comboMilestone", "mastered",
  "wrong", "lastHeart", "lessonOpen", "keepRunning", "pause", "resume",
  "runComplete", "runEnded", "checkpointPassed", "checkpointFailed",
  "stamp", "coins", "sealEarned", "streakBell",
  "strokeEnd", "dojoPass", "dojoFail", "unmute",
];

// D yo-pentatonic ladder: D4 E4 G4 A4 B4 D5 E5 G5 A5 B5 D6. The top rung is held.
export const PENTATONIC_LADDER: readonly number[] = [293.66, 329.63, 392, 440, 493.88, 587.33, 659.26, 783.99, 880, 987.77, 1174.66];
// Orin strikes: E6, A6, D7.
export const MILESTONE_BELLS: readonly number[] = [1318.5, 1760, 2349];
// Hanko thump time = CSS .stamp-in delay 200 ms + 55% of its 480 ms (keep in sync with styles.css).
export const STAMP_LAND_SECONDS = 0.46;
export const MAX_LIVE_VOICES = 8;

const E6 = 1318.5;
const D4 = 293.66;
const PLUCK_DROP_CENTS = 20.7; // 1200 * log2(1.012)

function safeCombo(combo: number | undefined): number {
  return typeof combo === "number" && Number.isFinite(combo) ? Math.max(0, Math.floor(combo)) : 0;
}

export function comboPitch(combo: number): number {
  const idx = Math.min(Math.max(safeCombo(combo), 1) - 1, PENTATONIC_LADDER.length - 1);
  return PENTATONIC_LADDER[idx] ?? D4;
}

export function comboDetuneCents(combo: number): number {
  return (((safeCombo(combo) * 7) % 5) - 2) * 3;
}

function clamp01(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

// ---------- Voice recipes ----------

type Filter = NonNullable<Voice["filter"]>;

function noise(at: number, filter: Filter, gain: number, attackMs: number, decayMs: number, extra: Partial<Voice> = {}): Voice {
  return { at, kind: "noise", freq: filter.freq, filter, gain, attackMs, decayMs, ...extra };
}

function sine(at: number, freq: number, gain: number, attackMs: number, decayMs: number, extra: Partial<Voice> = {}): Voice {
  return { at, kind: "osc", wave: "sine", freq, gain, attackMs, decayMs, ...extra };
}

// Koto pluck: triangle + two sine partials with a 25 ms pitch settle, a pick
// transient, all under a 3.5 kHz lowpass. `peak` is the fundamental's level.
function pluck(freq: number, at: number, peak: number, decayMs: number, detune = 0, ceremony = false): Voice[] {
  const shared: Partial<Voice> = {
    attackMs: 3,
    filter: { type: "lowpass", freq: 3500, q: 0.7 },
    dropCents: PLUCK_DROP_CENTS,
    dropMs: 25,
    ...(detune !== 0 ? { detuneCents: detune } : {}),
    ...(ceremony ? { ceremony: true } : {}),
  };
  return [
    { at, kind: "osc", wave: "triangle", freq, gain: peak, attackMs: 3, decayMs, ...shared },
    { at, kind: "osc", wave: "sine", freq: freq * 2, gain: peak * 0.35, attackMs: 3, decayMs, ...shared },
    { at, kind: "osc", wave: "sine", freq: freq * 3, gain: peak * 0.12, attackMs: 3, decayMs: Math.min(decayMs, 60), ...shared },
    noise(at, { type: "bandpass", freq: 2200, q: 1 }, 0.05 * (peak / 0.2), 1, 12, ceremony ? { ceremony: true } : {}),
  ];
}

// Orin bell: four sine partials, a 6 Hz tremolo on the fundamental. Always ceremony.
function bell(freq: number, at: number, peak: number, tailMs = 700): Voice[] {
  const k = tailMs / 700;
  const partial = (ratio: number, rel: number, decay: number, extra: Partial<Voice> = {}): Voice =>
    sine(at, freq * ratio, peak * rel, 2, Math.round(decay * k), { ceremony: true, ...extra });
  return [
    partial(1, 1, 700, { lfo: { hz: 6, depth: 0.1 } }),
    partial(2, 0.25, 350),
    partial(2.76, 0.15, 250),
    partial(5.4, 0.05, 120),
  ];
}

// Soft taiko "don".
function taiko(at: number): Voice[] {
  return [
    sine(at, 150, 0.35, 4, 380, { freqEnd: 55, glideMs: 180 }),
    { at, kind: "osc", wave: "triangle", freq: 110, freqEnd: 70, glideMs: 150, gain: 0.10, attackMs: 4, decayMs: 200 },
    noise(at, { type: "lowpass", freq: 700, q: 0.7 }, 0.12, 2, 45),
  ];
}

// Low temple bell for the last heart.
function templeBell(at: number): Voice[] {
  return [
    sine(at, 196, 0.12, 5, 900, { ceremony: true }),
    sine(at, 392, 0.12 * 0.3, 5, 900, { ceremony: true }),
    sine(at, 523, 0.12 * 0.1, 5, 900, { ceremony: true }),
  ];
}

// Paper "fwip": a bandpassed noise sweep downwards.
function fwip(at: number, peak = 0.09, from = 2800, to = 700, sweepMs = 130): Voice[] {
  return [noise(at, { type: "bandpass", freq: from, q: 1.2, freqEnd: to }, peak, 15, 135, { glideMs: sweepMs })];
}

// Hyoshigi clapper "kon".
function clapper(at: number, peak = 0.22, freqScale = 1): Voice[] {
  return [
    noise(at, { type: "bandpass", freq: 2100 * freqScale, q: 9 }, peak, 1, 54),
    noise(at, { type: "bandpass", freq: 3300 * freqScale, q: 12 }, peak * 0.5, 1, 54),
    sine(at, 1050 * freqScale, 0.06 * (peak / 0.22), 1, 30),
  ];
}

// Shared hanko thump. Always ceremony.
function stamp(at: number, level: number): Voice[] {
  const l = clamp01(level, 1);
  return [
    sine(at, 95, 0.30 * l, 2, 138, { freqEnd: 60, glideMs: 90, ceremony: true }),
    noise(at, { type: "lowpass", freq: 900, q: 0.7 }, 0.10 * l, 1, 25, { ceremony: true }),
    noise(at, { type: "bandpass", freq: 1800, q: 2 }, 0.05 * l, 1, 15, { ceremony: true }),
  ];
}

// Mon tally ticks. Always ceremony.
function coins(at: number, earned: number | undefined): Voice[] {
  const tick = (freq: number, offset: number, gain: number): Voice => sine(at + offset, freq, gain, 1, 69, { ceremony: true });
  if (earned === 0) return [tick(2637, 0, 0.03)];
  return [tick(2637, 0, 0.05), tick(3136, 0.07, 0.05), tick(3520, 0.14, 0.05)];
}

// Rising resolution phrase over a low pad. Always ceremony.
function arpeggio(at: number): Voice[] {
  return [
    ...pluck(587.33, at, 0.18, 320, 0, true),
    ...pluck(783.99, at + 0.09, 0.18, 320, 0, true),
    ...pluck(880, at + 0.18, 0.18, 320, 0, true),
    ...pluck(1174.66, at + 0.30, 0.18, 320, 0, true),
    sine(at, D4, 0.06, 60, 640, { ceremony: true }),
  ];
}

// ---------- Planner ----------

export function planSound(id: SoundId, opts: SoundOpts = {}): SoundPlan {
  const voices: Voice[] = [];
  let hapticPattern: number | number[] | undefined;
  let minIntervalMs = 40;

  switch (id) {
    case "tap":
      voices.push(noise(0, { type: "bandpass", freq: 1400, q: 5 }, 0.12, 1, 34), sine(0, 700, 0.04, 1, 25));
      break;
    case "sheet":
      voices.push(...fwip(0, 0.05, 2400, 700, 120));
      break;
    case "laneChange":
      voices.push(noise(0, { type: "bandpass", freq: opts.dir === -1 ? 1200 : 850, q: 2.5 }, 0.045, 2, 28));
      minIntervalMs = 50;
      break;
    case "correct": {
      const combo = Math.max(1, safeCombo(opts.combo));
      const f = comboPitch(combo);
      const detune = comboDetuneCents(combo);
      const decay = Math.min(320, 220 + 8 * combo);
      voices.push(...pluck(f, 0, 0.20, decay, detune));
      if (combo >= 5) {
        const idx = Math.min(combo - 1, PENTATONIC_LADDER.length - 1);
        const second = PENTATONIC_LADDER[Math.min(idx + 2, PENTATONIC_LADDER.length - 1)] ?? f;
        voices.push(...pluck(second, 0.06, 0.10, decay, detune));
      }
      if (combo >= 8) {
        voices.push(sine(0, f / 2, 0.04, 3, decay, { filter: { type: "lowpass", freq: 3500, q: 0.7 }, ...(detune !== 0 ? { detuneCents: detune } : {}) }));
      }
      hapticPattern = 10;
      break;
    }
    case "comboMilestone": {
      const combo = safeCombo(opts.combo);
      voices.push(...bell(MILESTONE_BELLS[0] ?? E6, 0.06, 0.14));
      if (combo >= 10) voices.push(...bell(MILESTONE_BELLS[1] ?? 1760, 0.13, 0.14 * 0.8));
      if (combo >= 20) voices.push(...bell(MILESTONE_BELLS[2] ?? 2349, 0.26, 0.14 * 0.64));
      hapticPattern = [12, 40, 12];
      break;
    }
    case "mastered":
      voices.push(...bell(E6, 0.08, 0.10), ...pluck(1174.66, 0.08, 0.12, 400));
      hapticPattern = [10, 30, 20];
      break;
    case "wrong":
      voices.push(...taiko(0), ...fwip(0.20));
      if (opts.hearts === 1) {
        voices.push(...templeBell(0.35));
        hapticPattern = [35, 50, 35, 80, 20];
      } else {
        hapticPattern = [35, 50, 35];
      }
      break;
    case "lastHeart":
      voices.push(...templeBell(0));
      break;
    case "lessonOpen":
      voices.push(...fwip(0));
      break;
    case "keepRunning":
      voices.push(
        noise(0, { type: "bandpass", freq: 500, q: 0.9, freqEnd: 2600 }, 0.10, 40, 140, { glideMs: 160 }),
        ...pluck(D4, 0.05, 0.12, 200),
      );
      break;
    case "pause":
      voices.push(...clapper(0));
      break;
    case "resume":
      voices.push(...clapper(0), ...clapper(0.11, 0.18, 1.19));
      break;
    case "unmute":
      voices.push(...clapper(0, 0.15));
      break;
    case "runComplete":
      voices.push(...arpeggio(0), ...coins(0.90, opts.earned));
      hapticPattern = [15, 40, 15, 40, 40];
      break;
    case "runEnded":
      voices.push(...pluck(440, 0, 0.14, 400, 0, true), ...pluck(D4, 0.22, 0.12, 450, 0, true), ...fwip(0.05, 0.06));
      break;
    case "checkpointPassed": {
      const t = STAMP_LAND_SECONDS;
      voices.push(...stamp(t, 1), ...arpeggio(t + 0.16), ...bell(E6, t + 0.70, 0.10), ...coins(t + 0.95, opts.earned));
      // Leading zero-length buzz + pause lands the 25 ms tap on the stamp, then the tally pattern.
      hapticPattern = [0, Math.round(t * 1000), 25, 60, 15, 40, 15, 40, 40];
      break;
    }
    case "checkpointFailed":
      voices.push(...pluck(220, 0, 0.20, 450, 0, true), ...pluck(196, 0.16, 0.18, 450, 0, true), ...pluck(329.63, 0.42, 0.18, 500, 0, true));
      break;
    case "stamp":
      voices.push(...stamp(0, clamp01(opts.level, 1)));
      break;
    case "coins":
      voices.push(...coins(0, opts.earned));
      break;
    case "sealEarned": {
      const t = STAMP_LAND_SECONDS;
      voices.push(...stamp(t, 1), ...bell(E6, t + 0.12, 0.10), ...coins(t + 0.5, opts.earned ?? 50));
      hapticPattern = [0, Math.round(t * 1000), 25, 60, 20];
      break;
    }
    case "streakBell":
      voices.push(...bell(880, 0, 0.12, 600));
      break;
    case "strokeEnd":
      voices.push(noise(0, { type: "bandpass", freq: 1300, q: 1.5 }, 0.045, 5, 45));
      minIntervalMs = 80;
      break;
    case "dojoPass":
      voices.push(...pluck(587.33, 0, 0.16, 260), ...stamp(0.15, 0.65));
      hapticPattern = 15;
      break;
    case "dojoFail":
      voices.push(noise(0, { type: "bandpass", freq: 480, q: 4 }, 0.12, 2, 68), sine(0, 240, 0.05, 2, 60));
      break;
    default: {
      const exhaustive: never = id;
      void exhaustive;
    }
  }

  voices.sort((a, b) => a.at - b.at);
  return hapticPattern === undefined ? { id, voices, minIntervalMs } : { id, voices, haptic: hapticPattern, minIntervalMs };
}

// ---------- Preference store (own key, never inside the save) ----------

export const SOUND_PREF_KEY = "kanji-dash-sound";

let soundEnabled = true;
let prefLoaded = false;
const soundListeners = new Set<() => void>();

export function normalizeSoundPreference(raw: unknown): boolean {
  return raw !== "off";
}

function notifySound(): void {
  soundListeners.forEach((listener) => listener());
}

function loadPref(): void {
  if (prefLoaded || typeof window === "undefined") return;
  prefLoaded = true;
  try {
    soundEnabled = normalizeSoundPreference(window.localStorage.getItem(SOUND_PREF_KEY));
  } catch {
    soundEnabled = true;
  }
  try {
    window.addEventListener?.("storage", (event) => {
      if ((event.key !== SOUND_PREF_KEY && event.key !== null) || event.storageArea !== window.localStorage) return;
      soundEnabled = normalizeSoundPreference(event.newValue);
      notifySound();
    });
  } catch {
    /* ignore */
  }
}

export function getSoundEnabled(): boolean {
  loadPref();
  return soundEnabled;
}

function getServerSoundSnapshot(): boolean {
  return true;
}

export function subscribeSound(listener: () => void): () => void {
  loadPref();
  soundListeners.add(listener);
  return () => {
    soundListeners.delete(listener);
  };
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(subscribeSound, getSoundEnabled, getServerSoundSnapshot);
}

export function setSoundEnabled(on: boolean): void {
  loadPref();
  soundEnabled = on;
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(SOUND_PREF_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
  notifySound();
  if (on) {
    unlock(); // the caller is inside a gesture
  } else if (ctx) {
    // Let the student's own music back in while muted; unlock() resumes on unmute.
    try {
      swallow(ctx.suspend());
    } catch {
      /* ignore */
    }
  }
}

// ---------- Renderer ----------

type AudioWindow = { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
let master: AudioNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
const liveEnds: number[] = [];
const lastPlayed: Partial<Record<SoundId, number>> = {};
let lastMilestoneAt = -Infinity;

function swallow(promise: unknown): void {
  if (promise && typeof (promise as Promise<unknown>).catch === "function") {
    (promise as Promise<unknown>).catch(() => {});
  }
}

function wallNow(): number {
  try {
    if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  } catch {
    /* fall through */
  }
  return Date.now();
}

function setParam(param: AudioParam | undefined, value: number): void {
  try {
    if (param) param.value = value;
  } catch {
    /* ignore */
  }
}

function buildMaster(context: AudioContext): AudioNode {
  let output: AudioNode = context.destination;
  try {
    const compressor = context.createDynamicsCompressor();
    setParam(compressor.threshold, -18);
    setParam(compressor.knee, 12);
    setParam(compressor.ratio, 3);
    setParam(compressor.attack, 0.003);
    setParam(compressor.release, 0.12);
    compressor.connect(output);
    output = compressor;
  } catch {
    /* no compressor: straight to the destination */
  }
  try {
    const shelf = context.createBiquadFilter();
    shelf.type = "highshelf";
    setParam(shelf.frequency, 6000);
    setParam(shelf.gain, -4);
    shelf.connect(output);
    output = shelf;
  } catch {
    /* no shelf */
  }
  try {
    const bus = context.createGain();
    setParam(bus.gain, 0.8);
    bus.connect(output);
    output = bus;
  } catch {
    /* no bus */
  }
  return output;
}

function buildNoise(context: AudioContext): void {
  try {
    const rate = Number.isFinite(context.sampleRate) && context.sampleRate > 0 ? Math.floor(context.sampleRate) : 48000;
    const buffer = context.createBuffer(1, rate, rate);
    noiseBuffer = buffer;
    const data = buffer.getChannelData(0);
    let seed = 0x2545f491;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
  } catch {
    /* a buffer without data still lets the graph render silently */
  }
}

function onStateChange(): void {
  if (!isAudioRunning()) arm();
}

function ensureContext(): AudioContext | null {
  if (ctx && ctx.state !== "closed") return ctx;
  if (typeof window === "undefined") return null;
  const w = window as unknown as AudioWindow;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (typeof Ctor !== "function") return null;
  let created: AudioContext;
  try {
    created = new Ctor();
  } catch {
    return null;
  }
  ctx = created;
  master = buildMaster(created);
  buildNoise(created);
  try {
    created.onstatechange = onStateChange;
  } catch {
    /* ignore */
  }
  return created;
}

export function isAudioRunning(): boolean {
  try {
    return ctx !== null && ctx.state === "running";
  } catch {
    return false;
  }
}

// One sound may wait for a pending resume(): AudioContext.state only flips to "running"
// asynchronously, so the sound of the very gesture that resumes it would otherwise be lost.
let pendingAfterResume: { id: SoundId; opts?: SoundOpts } | null = null;

function resumeContext(context: AudioContext): void {
  try {
    void context.resume().then(() => {
      const pending = pendingAfterResume;
      pendingAfterResume = null;
      if (pending) play(pending.id, pending.opts);
    }).catch(() => {
      pendingAfterResume = null;
    });
  } catch {
    pendingAfterResume = null;
  }
}

// ONLY from user-activation handlers (pointerup/touchend/click/keydown).
export function unlock(): void {
  try {
    if (typeof window === "undefined" || !getSoundEnabled()) return;
    const context = ensureContext();
    if (!context) return;
    if (context.state !== "running") resumeContext(context);
  } catch {
    /* ignore */
  }
}

/** Play now if the context is running, otherwise once the pending resume() settles (one sound only). */
export function playWhenReady(id: SoundId, opts?: SoundOpts): void {
  try {
    if (!getSoundEnabled()) return;
    if (ctx && ctx.state === "running") {
      play(id, opts);
      return;
    }
    pendingAfterResume = opts ? { id, opts } : { id };
    unlock();
  } catch {
    /* ignore */
  }
}

function applyFilter(context: AudioContext, spec: Filter, start: number, glideMs: number | undefined): BiquadFilterNode {
  const filter = context.createBiquadFilter();
  filter.type = spec.type;
  filter.frequency.setValueAtTime(spec.freq, start);
  try {
    if (spec.freqEnd !== undefined && spec.freqEnd > 0) {
      filter.frequency.exponentialRampToValueAtTime(spec.freqEnd, start + (glideMs ?? 100) / 1000);
    }
  } catch {
    /* the sweep is shaping only: a recorder stub without ramps still starts the voice */
  }
  setParam(filter.Q, spec.q);
  return filter;
}

function renderVoice(context: AudioContext, out: AudioNode, voice: Voice, base: number): boolean {
  const start = base + Math.max(0, voice.at);
  const attackEnd = start + Math.max(1, voice.attackMs) / 1000;
  const end = attackEnd + Math.max(1, voice.decayMs) / 1000;
  const peak = Math.min(0.5, Math.max(0.002, voice.gain));

  const env = context.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, attackEnd);
  env.gain.exponentialRampToValueAtTime(0.001, end);

  let source: AudioScheduledSourceNode;
  let head: AudioNode;

  if (voice.kind === "noise") {
    if (!noiseBuffer) return false;
    const src = context.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = applyFilter(context, voice.filter ?? { type: "bandpass", freq: voice.freq, q: 1 }, start, voice.glideMs);
    src.connect(filter);
    source = src;
    head = filter;
  } else {
    const osc = context.createOscillator();
    osc.type = voice.wave ?? "sine";
    osc.frequency.setValueAtTime(voice.freq, start); // always first: the recorder keys on it
    try {
      if (voice.freqEnd !== undefined && voice.freqEnd > 0) {
        osc.frequency.exponentialRampToValueAtTime(voice.freqEnd, start + (voice.glideMs ?? 100) / 1000);
      }
      const detune = voice.detuneCents ?? 0;
      const drop = voice.dropCents ?? 0;
      if (detune !== 0 || drop !== 0) {
        osc.detune.setValueAtTime(detune + drop, start);
        if (drop !== 0) osc.detune.linearRampToValueAtTime(detune, start + (voice.dropMs ?? 25) / 1000);
      }
    } catch {
      /* glide and detune are shaping only: a recorder stub without them must still reach start() */
    }
    source = osc;
    head = osc;
    if (voice.filter) {
      const filter = applyFilter(context, voice.filter, start, voice.glideMs);
      osc.connect(filter);
      head = filter;
    }
    if (voice.lfo) {
      // Tremolo before the envelope so the tail still decays to silence.
      try {
        const tremolo = context.createGain();
        tremolo.gain.setValueAtTime(1, start);
        const depth = context.createGain();
        depth.gain.setValueAtTime(voice.lfo.depth, start);
        const lfo = context.createOscillator();
        lfo.type = "sine";
        lfo.frequency.setValueAtTime(voice.lfo.hz, start);
        lfo.connect(depth);
        depth.connect(tremolo.gain);
        head.connect(tremolo);
        head = tremolo;
        lfo.start(start);
        lfo.stop(end + 0.05);
      } catch {
        /* no tremolo */
      }
    }
  }

  head.connect(env);
  env.connect(out);
  source.start(start);
  source.stop(end + 0.05);
  try {
    source.onended = () => {
      try {
        source.disconnect();
        env.disconnect();
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* ignore */
  }
  return true;
}

function pruneLive(now: number): void {
  let keep = 0;
  for (let i = 0; i < liveEnds.length; i++) {
    const end = liveEnds[i];
    if (end !== undefined && end > now) liveEnds[keep++] = end;
  }
  liveEnds.length = keep;
}

function render(context: AudioContext, plan: SoundPlan, now: number): void {
  const base = Number.isFinite(context.currentTime) ? context.currentTime : 0;
  const out = master ?? context.destination;
  pruneLive(now);
  for (const voice of plan.voices) {
    if (!voice.ceremony && liveEnds.length >= MAX_LIVE_VOICES) continue;
    try {
      if (renderVoice(context, out, voice, base) && !voice.ceremony) {
        liveEnds.push(now + voice.at * 1000 + voice.attackMs + voice.decayMs + 30);
      }
    } catch {
      /* skip this voice */
    }
  }
}

export function play(id: SoundId, opts?: SoundOpts): void {
  try {
    if (!getSoundEnabled()) return;
    const context = ctx;
    if (!context || context.state !== "running") return;
    const now = wallNow();
    const plan = opts ? planSound(id, opts) : planSound(id);
    const last = lastPlayed[id];
    if (last !== undefined && now - last < plan.minIntervalMs) return;
    if (id === "mastered" && now - lastMilestoneAt < 100) return;
    if (id === "comboMilestone") lastMilestoneAt = now;
    lastPlayed[id] = now;
    render(context, plan, now);
    if (plan.haptic !== undefined) haptic(plan.haptic);
  } catch {
    /* audio is cosmetic */
  }
}

export function haptic(pattern: number | number[]): void {
  try {
    if (typeof navigator === "undefined" || !("vibrate" in navigator) || typeof navigator.vibrate !== "function") return;
    if (!getSoundEnabled()) return;
    if (typeof document !== "undefined" && document.hidden) return;
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

// ---------- Boot: gesture unlockers, [data-sfx] delegate, visibility suspend ----------

const GESTURES = ["pointerup", "touchend", "keydown", "click"] as const;
const GESTURE_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };
let armed = false;
let dispose: (() => void) | null = null;

function onGesture(): void {
  disarm();
  unlock();
  // Muted, or resume still pending: keep listening for the next gesture.
  if (!isAudioRunning()) arm();
}

function arm(): void {
  if (armed || dispose === null || typeof window === "undefined") return;
  armed = true;
  for (const type of GESTURES) window.addEventListener(type, onGesture, GESTURE_OPTIONS);
}

function disarm(): void {
  if (!armed || typeof window === "undefined") return;
  armed = false;
  for (const type of GESTURES) window.removeEventListener(type, onGesture, GESTURE_OPTIONS);
}

function onDelegatedClick(event: Event): void {
  try {
    const target = event.target as Element | null;
    if (!target || typeof target.closest !== "function") return;
    const el = target.closest("[data-sfx]") as HTMLElement | null;
    if (!el) return;
    const id = el.dataset["sfx"];
    if (id !== "tap" && id !== "sheet") return;
    unlock(); // a click is user activation: the Home CTA primes audio
    play(id);
  } catch {
    /* ignore */
  }
}

function onVisibilityChange(): void {
  try {
    if (typeof document === "undefined") return;
    if (!document.hidden) {
      // Back from the background: the page already holds sticky activation, so resume
      // directly; if the browser refuses, the armed gesture unlockers still cover it.
      if (ctx && ctx.state === "suspended" && getSoundEnabled()) resumeContext(ctx);
      return;
    }
    if (ctx && ctx.state === "running") swallow(ctx.suspend());
    arm();
  } catch {
    /* ignore */
  }
}

export function boot(): () => void {
  if (dispose) return dispose;
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  dispose = () => {
    disarm();
    try {
      document.removeEventListener("click", onDelegatedClick, GESTURE_OPTIONS);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    } catch {
      /* ignore */
    }
    dispose = null;
  };
  try {
    document.addEventListener("click", onDelegatedClick, GESTURE_OPTIONS);
    document.addEventListener("visibilitychange", onVisibilityChange);
  } catch {
    /* ignore */
  }
  arm();
  return dispose;
}

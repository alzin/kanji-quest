import type { GameLayout, RunnerGate } from "./runner-math";

/**
 * Cosmetic effects for the runner: pooled, pure, deterministic.
 *
 * - No DOM, window, timers or Math.random: cosmetic randomness comes from a
 *   32-bit LCG seeded in createEffects, so the fake-clock e2e suite (which
 *   stubs Math.random) and SSR are untouched.
 * - The sim (runner-math) never learns this module exists. RunnerGame calls
 *   spawn* from its onAnswer wrapper and reads getters / draw passes while it
 *   renders. Anything that must freeze with the sim (brush ×, gold outline,
 *   compact stamp opacity) is derived from gate.sinceResolved by the runner,
 *   not timed here.
 * - advanceEffects clamps dt to MAX_STEP_SECONDS so a long fast-forward frame
 *   is one ordinary step. Wall-clock effects (shake, kick, stumble, hop, pause
 *   fade, breathing) keep advancing while paused so they self-terminate under
 *   the lesson blur; sim-linked visuals (stamps, lane flash, echo, brackets,
 *   dust, speed lines) freeze with the sim.
 */

export const MAX_PARTICLES = 64;
export const PARTICLE_STRIDE = 7; // x, y, vx, vy, life, maxLife, kind
export const MAX_STAMPS = 4;
export const MAX_DUST = 3;
export const MAX_SPEED_LINES = 8;
const SPEED_LINE_STRIDE = 4; // travel, unused, length, active
const MAX_WRONG_MARKS = 4;
export const MILESTONES: readonly number[] = [3, 5, 8, 10, 15, 20, 30];
const MILESTONE_KANJI: Readonly<Record<number, string>> = {
  3: "三", 5: "五", 8: "八", 10: "十", 15: "十五", 20: "二十", 30: "三十",
};

/** Longest single step; a 20 s fast-forward frame advances effects by one step. */
export const MAX_STEP_SECONDS = 0.1;
/** A timeline this close to its end counts as finished (absorbs frame-sum rounding such as 10 × 0.02 < 0.2). */
const END_EPSILON = 1e-6;
export const STAMP_SECONDS = 0.7;
export const LANE_FLASH_SECONDS = 0.2;
export const SHAKE_SECONDS = 0.25;
export const KICK_SECONDS = 0.12;
export const HOP_SECONDS = 0.4;
export const STUMBLE_SECONDS = 0.3;
export const BLOOM_SECONDS = 0.2;
export const BRACKET_SLIDE_SECONDS = 0.15;
export const PAUSE_FADE_SECONDS = 0.15;
export const RESUME_DASH_SECONDS = 0.3;
export const DUST_SECONDS = 0.28;
export const MILESTONE_SECONDS = 1.08;
export const RING_SECONDS = 0.3;
export const DECISION_TIMER_SECONDS = 1.5;
/** Horizontal padding inside the echo pill and the gap between word and score. */
export const ECHO_PADDING = 10;
export const ECHO_GAP = 10;

const LANES = 3;
const TAU = Math.PI * 2;
const GRAVITY = 520;
const SPEED_LINE_PX_PER_SECOND = 900;
/** Fixed y table (fraction of H) for the tier-3 speed lines inside the hills band. */
const SPEED_LINE_Y: readonly number[] = [0.38, 0.42, 0.46, 0.5, 0.53, 0.44, 0.4, 0.48];
const DEG = Math.PI / 180;

// Palette (fixed strings: no per-frame string building)
const INK = "#1c1a17";
const GOLD = "#d8b24a";
const GOLD_TEXT = "#b8912a"; // gold that stays legible on paper
const VERMILLION = "#c0392b";
const MOSS = "#4a7c59";
const PAPER = "#f7f2e7";
const PILL = "#fdfaf2";
const DUST = "#e8d7b8";
const PARTICLE_COLORS: readonly string[] = [INK, GOLD, VERMILLION, DUST];
const PARTICLE_ALPHAS: readonly number[] = [0.9, 0.95, 0.9, 0.7];

export type EffectsOptions = { reducedMotion: boolean; seed?: number };
export type EchoColor = "moss" | "vermillion";
export type EchoState = {
  text: string; score: string; width: number; fontPx: number;
  x: number; y: number; t: number; life: number; color: EchoColor;
};
export type Timer = { t: number };

export type EffectsState = {
  reducedMotion: boolean; clock: number; rng: number;
  particles: Float32Array; particleCount: number;
  stamps: { gate: RunnerGate | null; t: number }[];
  wrongMarks: { gate: RunnerGate | null; chosenLane: number }[];
  echo: EchoState | null;
  laneFlash: { lane: number; t: number } | null;
  shake: Timer; kick: Timer;
  hop: Timer; stumble: Timer; bloom: Timer; bracket: { t: number; lane: number };
  pause: { t: number; paused: boolean }; resumeDash: Timer;
  dust: { x: number; y: number; t: number }[]; speedLines: Float32Array;
  milestone: { combo: number; t: number } | null;
  // --- extras (not in the shared sketch, safe to ignore) ---
  /** Last combo reported through spawnCorrect/spawnWrong; drives tier blooms and speed lines. */
  combo: number;
  bracketOn: boolean;
  /** Reduced-motion reward ring (replaces particles). */
  ring: Timer;
  wrongMarkHead: number;
  particleCursor: number;
  anchorX: number; anchorY: number; anchorSet: boolean;
  /** spawnMilestone was called before this answer's spawnCorrect; the burst waits for a position. */
  pendingBurst: boolean;
  viewW: number;
  lineTimer: number;
  /** Font strings rebuilt only when a size changes, so the echo and seal draw without per-frame string building. */
  fontCache: { echoPx: number; echoSerif: string; echoSans: string; sealPx: number; sealSerif: string };
};

export type DrawFonts = { serif: (px: number) => string; sans: (px: number) => string };

// ---------------------------------------------------------------------------
// Tables

export function isMilestone(combo: number): boolean {
  return MILESTONES.includes(combo);
}

export function milestoneKanji(combo: number): string | null {
  return MILESTONE_KANJI[combo] ?? null;
}

export function comboTier(combo: number): 0 | 1 | 2 | 3 {
  return combo >= 10 ? 3 : combo >= 5 ? 2 : combo >= 3 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Math helpers

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function easeOutCubic(u: number): number {
  const v = 1 - clamp(u, 0, 1);
  return 1 - v * v * v;
}

function smooth(u: number): number {
  const v = clamp(u, 0, 1);
  return v * v * (3 - 2 * v);
}

/** cubic-bezier(x1,y1,x2,y2) sampled through a small table built once at module load (pure math). */
function bezierEase(x1: number, y1: number, x2: number, y2: number): (u: number) => number {
  const N = 48;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const mt = 1 - t;
    const a = 3 * mt * mt * t;
    const b = 3 * mt * t * t;
    const c = t * t * t;
    xs.push(a * x1 + b * x2 + c);
    ys.push(a * y1 + b * y2 + c);
  }
  return (u: number) => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    let i = 1;
    while (i < N && (xs[i] ?? 1) < u) i += 1;
    const xa = xs[i - 1] ?? 0;
    const xb = xs[i] ?? 1;
    const ya = ys[i - 1] ?? 0;
    const yb = ys[i] ?? 1;
    const f = xb > xa ? (u - xa) / (xb - xa) : 0;
    return ya + (yb - ya) * f;
  };
}

/** The stamp slam: overshoots past 1, then settles. */
const slamEase = bezierEase(0.34, 1.56, 0.64, 1);

/** Keyframe rows: [time, ...values]. Smoothstep between rows; clamped outside. */
function keyed(rows: readonly (readonly number[])[], t: number, column: number): number {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return 0;
  if (t <= (first[0] ?? 0)) return first[column] ?? 0;
  if (t >= (last[0] ?? 0)) return last[column] ?? 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    if (!a || !b) break;
    const ta = a[0] ?? 0;
    const tb = b[0] ?? 0;
    if (t <= tb) {
      const va = a[column] ?? 0;
      const vb = b[column] ?? 0;
      return va + (vb - va) * smooth(tb > ta ? (t - ta) / (tb - ta) : 1);
    }
  }
  return last[column] ?? 0;
}

// [t, sx, sy, dy]
const HOP_KEYS: readonly (readonly number[])[] = [
  [0, 1, 1, 0],
  [0.06, 1.12, 0.88, 0],
  [0.12, 0.92, 1.12, -10],
  [0.18, 0.94, 1.08, -7],
  [0.26, 1.1, 0.9, 0],
  [HOP_SECONDS, 1, 1, 0],
];
// [t, rot, sx, sy]
const STUMBLE_KEYS: readonly (readonly number[])[] = [
  [0, 0, 1, 1],
  [0.08, -18 * DEG, 1.15, 0.85],
  [0.2, 4 * DEG, 0.96, 1.04],
  [STUMBLE_SECONDS, 0, 1, 1],
];

function ended(t: number, seconds: number): boolean {
  return t >= seconds - END_EPSILON;
}

function alive(timer: Timer, seconds: number): boolean {
  return !ended(timer.t, seconds);
}

function tick(timer: Timer, dt: number, seconds: number): void {
  if (timer.t < seconds) timer.t = Math.min(seconds, timer.t + dt);
}

function laneYOf(layout: GameLayout, lane: number): number {
  return layout.laneTop + layout.laneSpan * ((lane + 0.5) / LANES);
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// State

export function createEffects(opts: EffectsOptions): EffectsState {
  const seed = (opts.seed ?? 1) | 0;
  return {
    reducedMotion: opts.reducedMotion,
    clock: 0,
    rng: (Math.imul(seed, 0x9e3779b1) ^ 0x5bd1e995) >>> 0,
    particles: new Float32Array(MAX_PARTICLES * PARTICLE_STRIDE),
    particleCount: 0,
    stamps: Array.from({ length: MAX_STAMPS }, () => ({ gate: null, t: STAMP_SECONDS })),
    wrongMarks: Array.from({ length: MAX_WRONG_MARKS }, () => ({ gate: null, chosenLane: 0 })),
    echo: null,
    laneFlash: null,
    shake: { t: SHAKE_SECONDS },
    kick: { t: KICK_SECONDS },
    hop: { t: HOP_SECONDS },
    stumble: { t: STUMBLE_SECONDS },
    bloom: { t: BLOOM_SECONDS },
    bracket: { t: BRACKET_SLIDE_SECONDS, lane: 1 },
    pause: { t: 0, paused: false },
    resumeDash: { t: RESUME_DASH_SECONDS },
    dust: Array.from({ length: MAX_DUST }, () => ({ x: 0, y: 0, t: DUST_SECONDS })),
    speedLines: new Float32Array(MAX_SPEED_LINES * SPEED_LINE_STRIDE),
    milestone: null,
    combo: 0,
    bracketOn: false,
    ring: { t: RING_SECONDS },
    wrongMarkHead: 0,
    particleCursor: 0,
    anchorX: 0,
    anchorY: 0,
    anchorSet: false,
    pendingBurst: false,
    viewW: 1280,
    lineTimer: 0,
    fontCache: { echoPx: 0, echoSerif: "", echoSans: "", sealPx: 0, sealSerif: "" },
  };
}

export function setReducedMotion(fx: EffectsState, on: boolean): void {
  fx.reducedMotion = on;
  if (!on) return;
  // Motion that is already in flight stops at once; informational elements stay.
  fx.particleCount = 0;
  fx.pendingBurst = false;
  fx.speedLines.fill(0);
  fx.shake.t = SHAKE_SECONDS;
  fx.kick.t = KICK_SECONDS;
  fx.hop.t = HOP_SECONDS;
  fx.stumble.t = STUMBLE_SECONDS;
  fx.bloom.t = BLOOM_SECONDS;
  fx.resumeDash.t = RESUME_DASH_SECONDS;
  for (const d of fx.dust) d.t = DUST_SECONDS;
}

/** 32-bit LCG (Numerical Recipes constants), deterministic per seed, in [0, 1). */
export function nextRandom(fx: EffectsState): number {
  fx.rng = (Math.imul(fx.rng, 1664525) + 1013904223) >>> 0;
  return fx.rng / 4294967296;
}

// ---------------------------------------------------------------------------
// Particles

function emit(fx: EffectsState, x: number, y: number, vx: number, vy: number, life: number, kind: number): void {
  let index: number;
  if (fx.particleCount < MAX_PARTICLES) {
    index = fx.particleCount;
    fx.particleCount += 1;
  } else {
    // Full pool: recycle slots round-robin instead of allocating.
    index = fx.particleCursor;
    fx.particleCursor = (fx.particleCursor + 1) % MAX_PARTICLES;
  }
  const o = index * PARTICLE_STRIDE;
  const p = fx.particles;
  p[o] = x;
  p[o + 1] = y;
  p[o + 2] = vx;
  p[o + 3] = vy;
  p[o + 4] = life;
  p[o + 5] = life;
  p[o + 6] = kind;
}

/** Upward 120° fan from (x, y). */
function fan(fx: EffectsState, x: number, y: number, count: number, kind: number, minSpeed: number, maxSpeed: number, life: number): void {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (nextRandom(fx) - 0.5) * (TAU / 3);
    const speed = minSpeed + nextRandom(fx) * (maxSpeed - minSpeed);
    emit(fx, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, life, kind);
  }
}

function milestoneBurst(fx: EffectsState, x: number, y: number): void {
  fan(fx, x, y, 12, 1, 160, 280, 0.8);
  fan(fx, x, y, 8, 0, 140, 240, 0.7);
  fan(fx, x, y, 4, 2, 180, 300, 0.8);
}

function particleRadius(index: number): number {
  // 2.5..4 px, fixed per slot so nothing is stored per particle.
  return 2.5 + 0.5 * ((index * 5) & 3);
}

// ---------------------------------------------------------------------------
// Advance

/**
 * Advance every effect. dt is clamped to MAX_STEP_SECONDS. Wall-clock effects
 * advance even while paused; sim-linked ones freeze. Returns whether any timed
 * effect is still mid-life (steady-state visuals such as the aura do not count).
 */
export function advanceEffects(fx: EffectsState, dtSeconds: number, paused: boolean): boolean {
  const dt = Number.isFinite(dtSeconds) ? clamp(dtSeconds, 0, MAX_STEP_SECONDS) : 0;
  // A zero, negative or non-finite frame changes nothing (not even the pause flag: the next real frame handles it).
  if (dt <= 0) return isAnythingAlive(fx, paused);
  fx.clock += dt;

  // Pause fade (wall-clock; hiding is instant).
  if (paused) {
    if (!fx.pause.paused) {
      fx.pause.paused = true;
      fx.pause.t = 0;
    } else {
      tick(fx.pause, dt, PAUSE_FADE_SECONDS);
    }
  } else {
    fx.pause.paused = false;
    fx.pause.t = 0;
  }

  // A milestone reported before this answer's position arrived: burst at the last known runner anchor.
  if (fx.pendingBurst && fx.anchorSet) {
    fx.pendingBurst = false;
    if (!fx.reducedMotion) milestoneBurst(fx, fx.anchorX, fx.anchorY);
  }

  // Wall-clock timelines.
  tick(fx.shake, dt, SHAKE_SECONDS);
  tick(fx.kick, dt, KICK_SECONDS);
  tick(fx.hop, dt, HOP_SECONDS);
  tick(fx.stumble, dt, STUMBLE_SECONDS);
  tick(fx.bloom, dt, BLOOM_SECONDS);
  tick(fx.resumeDash, dt, RESUME_DASH_SECONDS);
  tick(fx.ring, dt, RING_SECONDS);
  if (fx.milestone) {
    fx.milestone.t += dt;
    if (ended(fx.milestone.t, MILESTONE_SECONDS)) fx.milestone = null;
  }

  // Particles (wall-clock so stumble drops finish under the lesson blur).
  {
    const p = fx.particles;
    let i = 0;
    while (i < fx.particleCount) {
      const o = i * PARTICLE_STRIDE;
      const life = (p[o + 4] ?? 0) - dt;
      // Float32 residue after 48 × (1/60) would keep a dead particle for one more frame.
      if (life <= END_EPSILON) {
        fx.particleCount -= 1;
        const last = fx.particleCount * PARTICLE_STRIDE;
        if (last !== o) p.copyWithin(o, last, last + PARTICLE_STRIDE);
        continue;
      }
      const vy = (p[o + 3] ?? 0) + GRAVITY * dt;
      p[o + 4] = life;
      p[o + 3] = vy;
      p[o] = (p[o] ?? 0) + (p[o + 2] ?? 0) * dt;
      p[o + 1] = (p[o + 1] ?? 0) + vy * dt;
      i += 1;
    }
    if (fx.particleCount < MAX_PARTICLES) fx.particleCursor = 0;
  }

  // Sim-linked timelines freeze with the sim.
  if (!paused) {
    for (const s of fx.stamps) {
      if (!s.gate) continue;
      s.t += dt;
      if (ended(s.t, STAMP_SECONDS)) s.gate = null;
    }
    if (fx.laneFlash) {
      fx.laneFlash.t += dt;
      if (ended(fx.laneFlash.t, LANE_FLASH_SECONDS)) fx.laneFlash = null;
    }
    if (fx.echo) {
      fx.echo.t += dt;
      if (ended(fx.echo.t, fx.echo.life)) fx.echo = null;
    }
    if (fx.bracketOn) tick(fx.bracket, dt, BRACKET_SLIDE_SECONDS);
    for (const d of fx.dust) tick(d, dt, DUST_SECONDS);

    // Tier-3 speed lines: pooled, spawned on a jittered timer, recycled off the left edge.
    const lines = fx.speedLines;
    for (let i = 0; i < MAX_SPEED_LINES; i++) {
      const o = i * SPEED_LINE_STRIDE;
      if ((lines[o + 3] ?? 0) <= 0) continue;
      const travel = (lines[o] ?? 0) + SPEED_LINE_PX_PER_SECOND * dt;
      lines[o] = travel;
      if (travel > fx.viewW + (lines[o + 2] ?? 0) + 8) lines[o + 3] = 0;
    }
    if (!fx.reducedMotion && comboTier(fx.combo) >= 3) {
      fx.lineTimer -= dt;
      if (fx.lineTimer <= 0) {
        for (let i = 0; i < MAX_SPEED_LINES; i++) {
          const o = i * SPEED_LINE_STRIDE;
          if ((lines[o + 3] ?? 0) > 0) continue;
          lines[o] = 0;
          lines[o + 2] = 40 + nextRandom(fx) * 50;
          lines[o + 3] = 1;
          break;
        }
        fx.lineTimer = 0.07 + nextRandom(fx) * 0.08;
      }
    } else {
      fx.lineTimer = 0;
    }
  }

  return isAnythingAlive(fx, paused);
}

function isAnythingAlive(fx: EffectsState, paused: boolean): boolean {
  if (fx.particleCount > 0 || fx.echo || fx.laneFlash || fx.milestone) return true;
  if (alive(fx.shake, SHAKE_SECONDS) || alive(fx.kick, KICK_SECONDS) || alive(fx.hop, HOP_SECONDS)
    || alive(fx.stumble, STUMBLE_SECONDS) || alive(fx.bloom, BLOOM_SECONDS)
    || alive(fx.resumeDash, RESUME_DASH_SECONDS) || alive(fx.ring, RING_SECONDS)) return true;
  if (paused && fx.pause.t < PAUSE_FADE_SECONDS) return true;
  for (const s of fx.stamps) if (s.gate) return true;
  for (const d of fx.dust) if (alive(d, DUST_SECONDS)) return true;
  for (let i = 0; i < MAX_SPEED_LINES; i++) if ((fx.speedLines[i * SPEED_LINE_STRIDE + 3] ?? 0) > 0) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Spawns

export function spawnCorrect(fx: EffectsState, a: { x: number; y: number; gate: RunnerGate; combo: number }): void {
  // Stamp slot: a free one, else the oldest.
  let slot = fx.stamps[0];
  for (const s of fx.stamps) {
    if (!s.gate) { slot = s; break; }
    if (slot && s.t > slot.t) slot = s;
  }
  if (slot) {
    slot.gate = a.gate;
    slot.t = 0;
  }

  const previousTier = comboTier(fx.combo);
  fx.combo = a.combo;
  const tier = comboTier(a.combo);
  if (tier !== previousTier) fx.bloom.t = 0;

  const bx = a.x;
  const by = a.y - 8; // body centre
  fx.anchorX = bx;
  fx.anchorY = by;
  fx.anchorSet = true;

  if (fx.reducedMotion) {
    fx.ring.t = 0;
    fx.pendingBurst = false;
    return;
  }
  fx.hop.t = 0;
  fan(fx, bx, by, 8, 0, 140, 260, 0.6);
  fan(fx, bx, by, Math.min(16, 4 + 2 * tier), 1, 140, 260, 0.6);
  if (fx.pendingBurst) {
    fx.pendingBurst = false;
    milestoneBurst(fx, bx, by);
  }
}

export function spawnWrong(fx: EffectsState, a: { x: number; y: number; gate: RunnerGate; chosenLane: number }): void {
  const mark = fx.wrongMarks[fx.wrongMarkHead];
  if (mark) {
    mark.gate = a.gate;
    mark.chosenLane = a.chosenLane;
  }
  fx.wrongMarkHead = (fx.wrongMarkHead + 1) % MAX_WRONG_MARKS;

  fx.combo = 0;
  fx.bloom.t = BLOOM_SECONDS;
  fx.speedLines.fill(0);
  fx.lineTimer = 0;
  fx.pendingBurst = false;
  fx.anchorX = a.x;
  fx.anchorY = a.y - 8;
  fx.anchorSet = true;
  if (fx.reducedMotion) return;

  fx.shake.t = 0;
  fx.stumble.t = 0;
  for (let i = 0; i < 6; i++) {
    emit(fx, a.x + (nextRandom(fx) - 0.5) * 20, a.y - 8 + (nextRandom(fx) - 0.5) * 16,
      (nextRandom(fx) - 0.5) * 80, 20 + nextRandom(fx) * 60, 0.4, 0);
  }
}

export function spawnLaneChange(fx: EffectsState, a: { dir: -1 | 1; lane: number }): void {
  fx.laneFlash = { lane: a.lane, t: 0 };
}

/**
 * Milestone ceremony: seal + rays (scenery), aura bloom, 2 px canvas kick and a
 * 24-particle burst. The burst needs the runner's position, which arrives with
 * spawnCorrect: call spawnMilestone right before or after spawnCorrect in the
 * same handler (before: the burst rides that spawnCorrect; after: it fires at
 * that answer's position on the next advance).
 */
export function spawnMilestone(fx: EffectsState, combo: number): void {
  fx.milestone = { combo, t: 0 };
  fx.bloom.t = 0;
  if (fx.reducedMotion) {
    fx.ring.t = 0;
    return;
  }
  fx.kick.t = 0;
  fx.pendingBurst = true;
}

export function spawnEcho(fx: EffectsState, a: {
  text: string; score: string; width: number; fontPx: number; x: number; y: number; color: EchoColor; lifeSeconds: number;
}): void {
  fx.echo = {
    text: a.text, score: a.score, width: a.width, fontPx: a.fontPx,
    x: a.x, y: a.y, t: 0, life: Math.max(0.05, a.lifeSeconds), color: a.color,
  };
}

/** Paper puff at a foot plant; call on each zero crossing of run = sin(dist * 0.05). */
export function spawnFootfall(fx: EffectsState, x: number, y: number): void {
  if (fx.reducedMotion) return;
  let slot = fx.dust[0];
  for (const d of fx.dust) if (slot && d.t > slot.t) slot = d;
  if (!slot) return;
  slot.x = x;
  slot.y = y;
  slot.t = 0;
}

/** Resume from the pause button / Esc or from "Keep running": forward lean + paper speed lines. */
export function noteResume(fx: EffectsState): void {
  if (fx.reducedMotion) return;
  fx.resumeDash.t = 0;
}

/** Lock-in brackets: active while the next gate is within 0.6 s; lane follows the runner's rounded lane. */
export function setBracketLane(fx: EffectsState, lane: number, active: boolean): void {
  if (!active) {
    fx.bracketOn = false;
    fx.bracket.t = BRACKET_SLIDE_SECONDS;
    return;
  }
  if (!fx.bracketOn) {
    fx.bracketOn = true;
    fx.bracket.t = 0;
  }
  fx.bracket.lane = lane;
}

/** Measure an echo pill once, at spawn: shrinks the font from 14 to 11 px until the pill fits maxWidth. */
export function measureEcho(
  ctx: CanvasRenderingContext2D, fonts: DrawFonts, text: string, score: string, maxWidth: number,
): { width: number; fontPx: number; text: string; score: string } {
  let fontPx = 14;
  let width = 0;
  for (;;) {
    ctx.font = fonts.serif(fontPx);
    const textWidth = ctx.measureText(text).width;
    let scoreWidth = 0;
    if (score) {
      ctx.font = fonts.sans(fontPx);
      scoreWidth = ctx.measureText(score).width;
    }
    width = textWidth + (score ? ECHO_GAP + scoreWidth : 0) + ECHO_PADDING * 2;
    if (width <= maxWidth) break;
    if (fontPx <= 11) {
      // Still too wide at the floor: drop the " · meaning" suffix, then the score, so the pill always fits.
      const cut = text.lastIndexOf(" · ");
      if (cut > 0) return measureEcho(ctx, fonts, text.slice(0, cut), score, maxWidth);
      if (score) return measureEcho(ctx, fonts, text, "", maxWidth);
      break;
    }
    fontPx -= 1;
  }
  return { width, fontPx, text, score };
}

// ---------------------------------------------------------------------------
// Getters (read inside the draw pass)

/** Canvas offset for this frame: apply with ctx.setTransform(pr,0,0,pr,x*pr,y*pr). {0,0} when idle or reduced motion. */
export function getShake(fx: EffectsState): { x: number; y: number } {
  if (fx.reducedMotion) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  if (alive(fx.shake, SHAKE_SECONDS)) {
    const t = fx.shake.t;
    x = 5 * Math.sin(TAU * 25 * t) * Math.exp(-t / 0.08);
    y = 0.6 * x;
  }
  if (alive(fx.kick, KICK_SECONDS)) y -= 2 * (1 - fx.kick.t / KICK_SECONDS);
  return { x, y };
}

/**
 * Pose for the runner drawing: ctx.translate(px, py + dy); ctx.rotate(rot); ctx.scale(sx, sy); ctx.translate(-px, -py).
 * Composes locomotion (from run = sin(dist*0.05)), lane lean (laneDelta = targetLane - lane), hop, stumble and resume lean.
 * Identity when idle with run = 0 and laneDelta = 0.
 */
export function getRunnerPose(fx: EffectsState, run: number, laneDelta: number): { sx: number; sy: number; dy: number; rot: number } {
  const a = Math.abs(run);
  // run = 0 with no lane delta is the standing pose: an exact identity (never -0, which toEqual distinguishes).
  if (fx.reducedMotion) return { sx: 1, sy: 1, dy: a > 0 ? -a * 2 : 0, rot: 0 };

  // Locomotion: foot-plant squash 1.06×0.94 for |run| < 0.15 recovering by 0.5, stretch 0.97×1.04 at the apex.
  // The squash engages over |run| < 0.03 (a fraction of one frame at stride speed) so the standing pose stays identity.
  const engaged = Math.min(1, a / 0.03);
  const plant = engaged * (a < 0.15 ? 1 : clamp((0.5 - a) / 0.35, 0, 1));
  const apex = clamp((a - 0.5) / 0.5, 0, 1);
  let sx = (1 + 0.06 * plant) * (1 - 0.03 * apex);
  let sy = (1 - 0.06 * plant) * (1 + 0.04 * apex);
  let dy = a > 0 ? -a * 3 : 0;
  let rot = laneDelta === 0 ? 0 : clamp(laneDelta * 0.3, -0.24, 0.24);

  if (alive(fx.hop, HOP_SECONDS)) {
    const t = fx.hop.t;
    sx *= keyed(HOP_KEYS, t, 1);
    sy *= keyed(HOP_KEYS, t, 2);
    dy += keyed(HOP_KEYS, t, 3);
  }
  if (alive(fx.stumble, STUMBLE_SECONDS)) {
    const t = fx.stumble.t;
    rot += keyed(STUMBLE_KEYS, t, 1);
    sx *= keyed(STUMBLE_KEYS, t, 2);
    sy *= keyed(STUMBLE_KEYS, t, 3);
  }
  if (alive(fx.resumeDash, RESUME_DASH_SECONDS)) {
    const u = fx.resumeDash.t / RESUME_DASH_SECONDS;
    rot += 10 * DEG * (u < 0.33 ? u / 0.33 : (1 - u) / 0.67);
  }
  return { sx, sy, dy, rot };
}

/** Stamp over the correct sign of a gate answered correctly; null once the 0.7 s ceremony is over. */
export function getStampFor(fx: EffectsState, gate: RunnerGate): { scale: number; alpha: number; signSquash: { sx: number; sy: number } } | null {
  for (const s of fx.stamps) {
    if (s.gate !== gate || ended(s.t, STAMP_SECONDS)) continue;
    const t = s.t;
    const tail = t > 0.5 ? (STAMP_SECONDS - t) / 0.2 : 1;
    if (fx.reducedMotion) {
      return { scale: 1, alpha: clamp(0.95 * Math.min(1, t / 0.12) * tail, 0, 1), signSquash: { sx: 1, sy: 1 } };
    }
    const p = slamEase(t / 0.22);
    const scale = 1.9 + (1 - 1.9) * p;
    const alpha = clamp(0.95 * Math.min(1, t / 0.06) * tail, 0, 1);
    let sx = 1;
    let sy = 1;
    if (t >= 0.11 && t <= 0.32) {
      const v = (t - 0.11) / 0.21;
      const w = (v - 0.2) / 0.8;
      const amount = v < 0.2 ? v / 0.2 : (1 - w) * Math.cos(w * Math.PI * 0.6);
      sx = 1 + 0.08 * amount;
      sy = 1 - 0.15 * amount;
    }
    return { scale, alpha, signSquash: { sx, sy } };
  }
  return null;
}

/** The lane the student chose on a missed gate (keyed by gate identity; the runner times the strokes with gate.sinceResolved). */
export function getWrongMark(fx: EffectsState, gate: RunnerGate): { chosenLane: number } | null {
  for (const m of fx.wrongMarks) if (m.gate === gate) return { chosenLane: m.chosenLane };
  return null;
}

export function getLaneFlash(fx: EffectsState): { lane: number; alpha: number } | null {
  const f = fx.laneFlash;
  if (!f || ended(f.t, LANE_FLASH_SECONDS)) return null;
  if (fx.reducedMotion) return { lane: f.lane, alpha: 0.1 };
  return { lane: f.lane, alpha: 0.12 * (LANE_FLASH_SECONDS - f.t) / LANE_FLASH_SECONDS };
}

/** inset = px outside the sign edge (8 -> 3), signScale 1 -> 1.05; null while no gate is locking in. */
export function getBracket(fx: EffectsState): { inset: number; signScale: number } | null {
  if (!fx.bracketOn) return null;
  if (fx.reducedMotion) return { inset: 3, signScale: 1 };
  const e = easeOutCubic(fx.bracket.t / BRACKET_SLIDE_SECONDS);
  return { inset: 8 - 5 * e, signScale: 1 + 0.05 * e };
}

/** 0..1 multiplier for the pause wash; instant under reduced motion; 0 as soon as the game resumes. */
export function getPauseFade(fx: EffectsState): number {
  if (!fx.pause.paused) return 0;
  if (fx.reducedMotion || ended(fx.pause.t, PAUSE_FADE_SECONDS)) return 1;
  return Math.min(1, fx.pause.t / PAUSE_FADE_SECONDS);
}

/** 一時停止 title: scale 1.3 -> 1 over the fade, rotated -4°. */
export function getPauseTitle(fx: EffectsState): { scale: number; rot: number } {
  const rot = -4 * DEG;
  if (!fx.pause.paused || fx.reducedMotion) return { scale: 1, rot };
  return { scale: 1.3 - 0.3 * easeOutCubic(fx.pause.t / PAUSE_FADE_SECONDS), rot };
}

export function getAura(fx: EffectsState, combo: number): { radius: number; alpha: number; tier: 0 | 1 | 2 | 3 } {
  const tier = comboTier(combo);
  if (tier === 0) return { radius: 0, alpha: 0, tier };
  if (fx.reducedMotion) return { radius: 26, alpha: 0.22, tier };
  const bloom = alive(fx.bloom, BLOOM_SECONDS) ? 8 * Math.sin(Math.PI * fx.bloom.t / BLOOM_SECONDS) : 0;
  return { radius: 26 + bloom, alpha: 0.22 + 0.08 * Math.sin(fx.clock * 6), tier };
}

/** Sun radius multiplier: breathes +6% over 300 ms after a milestone (1 otherwise / under reduced motion). */
export function getSunScale(fx: EffectsState): number {
  const m = fx.milestone;
  if (!m || fx.reducedMotion || m.t >= 0.3) return 1;
  return 1 + 0.06 * Math.sin(Math.PI * m.t / 0.3);
}

/** Width fraction of the compact decision timer bar for tLeft seconds to the decision line (quantised to 4 steps under reduced motion). */
export function getDecisionTimerBar(fx: EffectsState, tLeft: number): number {
  const f = clamp(tLeft / DECISION_TIMER_SECONDS, 0, 1);
  return fx.reducedMotion ? Math.ceil(f * 4) / 4 : f;
}

// ---------------------------------------------------------------------------
// Draw passes (fixed fillStyle strings + globalAlpha, batched arcs, no gradients, no shadowBlur)

/** After the hills, before the ground: tier-3 speed lines, milestone sun rays, desktop milestone seal. */
export function drawEffectsScenery(
  ctx: CanvasRenderingContext2D, fx: EffectsState,
  a: { W: number; H: number; compact: boolean; sunX: number; sunY: number; sunR: number; fonts: DrawFonts },
): void {
  const { W, H } = a;
  fx.viewW = W;

  if (!fx.reducedMotion) {
    const lines = fx.speedLines;
    let any = false;
    ctx.beginPath();
    for (let i = 0; i < MAX_SPEED_LINES; i++) {
      const o = i * SPEED_LINE_STRIDE;
      if ((lines[o + 3] ?? 0) <= 0) continue;
      const len = lines[o + 2] ?? 40;
      const right = W + len - (lines[o] ?? 0);
      const y = H * (SPEED_LINE_Y[i] ?? 0.45);
      ctx.moveTo(right - len, y);
      ctx.lineTo(right, y);
      any = true;
    }
    if (any) {
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  const m = fx.milestone;
  if (!m) return;
  const t = m.t;

  if (!fx.reducedMotion && t < 0.8) {
    ctx.strokeStyle = VERMILLION;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.12 * (1 - t / 0.8);
    const r0 = a.sunR + 6;
    const r1 = a.sunR * 1.9 + 6;
    const spin = t * 0.4;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const angle = spin + k * (Math.PI / 4);
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      ctx.moveTo(a.sunX + c * r0, a.sunY + s * r0);
      ctx.lineTo(a.sunX + c * r1, a.sunY + s * r1);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (a.compact) return;
  const kanji = milestoneKanji(m.combo);
  if (!kanji) return;
  let scale = 1;
  let alpha = 1;
  if (fx.reducedMotion) {
    if (t >= 0.7) return;
  } else {
    if (t < 0.18) scale = 1.6 + (1 - 1.6) * slamEase(t / 0.18);
    if (t > MILESTONE_SECONDS - 0.3) alpha = clamp((MILESTONE_SECONDS - t) / 0.3, 0, 1);
  }
  ctx.save();
  ctx.translate(W * 0.62, H * 0.12);
  ctx.rotate(-8 * DEG);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = VERMILLION;
  roundRectPath(ctx, -28, -28, 56, 56, 8);
  ctx.fill();
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 2;
  roundRectPath(ctx, -23, -23, 46, 46, 5);
  ctx.stroke();
  ctx.fillStyle = PAPER;
  const sealPx = kanji.length > 1 ? 24 : 34;
  const cache = fx.fontCache;
  if (cache.sealPx !== sealPx) {
    cache.sealPx = sealPx;
    cache.sealSerif = a.fonts.serif(sealPx);
  }
  ctx.font = cache.sealSerif;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(kanji, 0, 2);
  ctx.restore();
}

/** After the dashed lanes, before the question panel and signs: lane tap flash band, word echo pill. */
export function drawEffectsUnderGates(ctx: CanvasRenderingContext2D, fx: EffectsState, layout: GameLayout, W: number, fonts: DrawFonts): void {
  const flash = getLaneFlash(fx);
  if (flash) {
    const y = laneYOf(layout, flash.lane);
    const half = layout.laneSpan / 6;
    ctx.fillStyle = GOLD;
    ctx.globalAlpha = flash.alpha;
    ctx.fillRect(0, y - half, W, half * 2);
    ctx.globalAlpha = 1;
  }

  const e = fx.echo;
  if (!e || ended(e.t, e.life)) return;
  const cache = fx.fontCache;
  if (cache.echoPx !== e.fontPx) {
    cache.echoPx = e.fontPx;
    cache.echoSerif = fonts.serif(e.fontPx);
    cache.echoSans = fonts.sans(e.fontPx);
  }
  const u = e.t / e.life;
  const hold = fx.reducedMotion ? Math.max(0, (e.life - 0.15) / e.life) : 2 / 3;
  const alpha = u < hold ? 1 : clamp(1 - (u - hold) / Math.max(1e-6, 1 - hold), 0, 1);
  const rise = fx.reducedMotion ? 0 : 14 * easeOutCubic(u);
  const h = e.fontPx * 2;
  const x0 = e.x - e.width / 2;
  const cy = e.y - rise;
  const accent = e.color === "moss" ? MOSS : VERMILLION;

  const prevAlign = ctx.textAlign;
  const prevBaseline = ctx.textBaseline;
  ctx.globalAlpha = alpha * 0.92;
  ctx.fillStyle = PILL;
  roundRectPath(ctx, x0, cy - h / 2, e.width, h, h / 2);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = cache.echoSerif;
  ctx.fillStyle = e.color === "moss" ? INK : VERMILLION;
  ctx.fillText(e.text, x0 + ECHO_PADDING, cy + 1);
  if (e.score) {
    ctx.textAlign = "right";
    ctx.font = cache.echoSans;
    ctx.fillStyle = GOLD_TEXT;
    ctx.fillText(e.score, x0 + e.width - ECHO_PADDING, cy + 1);
  }
  ctx.textAlign = prevAlign;
  ctx.textBaseline = prevBaseline;
  ctx.globalAlpha = 1;
}

/** Right before the runner body: combo aura ring + orbiters, reduced-motion reward ring, resume dash lines. */
export function drawEffectsBehindRunner(ctx: CanvasRenderingContext2D, fx: EffectsState, a: { px: number; py: number; combo: number }): void {
  const cx = a.px;
  const cy = a.py - 8;
  const tier = comboTier(a.combo);

  if (tier >= 1) {
    const aura = getAura(fx, a.combo);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.globalAlpha = aura.alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, aura.radius, 0, TAU);
    ctx.stroke();
    if (tier >= 2 && !fx.reducedMotion) {
      const angle = fx.clock * TAU * 1.5;
      const r = aura.radius + 5;
      const x1 = cx + Math.cos(angle) * r;
      const y1 = cy + Math.sin(angle) * r;
      const x2 = cx - Math.cos(angle) * r;
      const y2 = cy - Math.sin(angle) * r;
      ctx.fillStyle = INK;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(x1 + 3, y1);
      ctx.arc(x1, y1, 3, 0, TAU);
      ctx.moveTo(x2 + 3, y2);
      ctx.arc(x2, y2, 3, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (alive(fx.ring, RING_SECONDS)) {
    const u = fx.ring.t / RING_SECONDS;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 1 - u;
    ctx.beginPath();
    ctx.arc(cx, cy, 0.5 + 30 * u, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (!fx.reducedMotion && alive(fx.resumeDash, RESUME_DASH_SECONDS)) {
    const u = fx.resumeDash.t / RESUME_DASH_SECONDS;
    const travel = 60 * easeOutCubic(u);
    const len = 1 + 26 * Math.sin(Math.PI * u);
    const right = a.px - 20 - travel;
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.75 * (1 - u * u);
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const y = cy - 15 + k * 10;
      ctx.moveTo(right - len, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** Above everything but the pause overlay: footfall dust, then particles in one batched fill per colour. */
export function drawEffectsFront(ctx: CanvasRenderingContext2D, fx: EffectsState, W: number, H: number): void {
  void W;
  void H;
  for (const d of fx.dust) {
    if (!alive(d, DUST_SECONDS)) continue;
    const u = d.t / DUST_SECONDS;
    ctx.fillStyle = DUST;
    ctx.globalAlpha = 0.6 * (1 - u);
    ctx.beginPath();
    ctx.arc(d.x, d.y, 3 + 6 * u, 0, TAU);
    ctx.fill();
  }

  const p = fx.particles;
  const count = fx.particleCount;
  for (let kind = 0; kind < PARTICLE_COLORS.length; kind++) {
    let any = false;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const o = i * PARTICLE_STRIDE;
      if ((p[o + 6] ?? 0) !== kind) continue;
      const maxLife = p[o + 5] ?? 1;
      const r = particleRadius(i) * ((p[o + 4] ?? 0) / (maxLife > 0 ? maxLife : 1));
      if (r <= 0.05) continue;
      const x = p[o] ?? 0;
      const y = p[o + 1] ?? 0;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
      any = true;
    }
    if (!any) continue;
    ctx.fillStyle = PARTICLE_COLORS[kind] ?? INK;
    ctx.globalAlpha = PARTICLE_ALPHAS[kind] ?? 1;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Damage flash for s.flash (0.6 -> 0): full wash only for the first 150 ms, then an edge vignette; edge only under reduced motion. */
export function drawDamageVignette(ctx: CanvasRenderingContext2D, fx: EffectsState, W: number, H: number, flash: number): void {
  if (flash <= 0) return;
  ctx.strokeStyle = VERMILLION;
  ctx.lineWidth = 28;
  if (fx.reducedMotion) {
    ctx.globalAlpha = 0.35;
    ctx.strokeRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    return;
  }
  if (flash > 0.45) {
    ctx.fillStyle = VERMILLION;
    ctx.globalAlpha = flash * 0.28;
    ctx.fillRect(-8, -8, W + 16, H + 16);
  }
  ctx.globalAlpha = flash * 0.5;
  ctx.strokeRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}

/** Breathing edge while s.hearts <= 1 (static under reduced motion). */
export function drawLastHeartVignette(ctx: CanvasRenderingContext2D, fx: EffectsState, W: number, H: number): void {
  const a = fx.reducedMotion ? 0.35 : 0.25 + 0.12 * Math.sin(fx.clock * TAU * 0.8);
  ctx.strokeStyle = VERMILLION;
  ctx.lineWidth = 14;
  ctx.globalAlpha = a;
  ctx.strokeRect(0, 0, W, H);
  ctx.lineWidth = 28;
  ctx.globalAlpha = a * 0.5;
  ctx.strokeRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}

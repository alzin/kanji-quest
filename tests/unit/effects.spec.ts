import { expect, test } from "@playwright/test";
import type { Question } from "../../src/lib/srs";
import { createRunnerState, getGameLayout, type RunnerGate } from "../../src/components/game/runner-math";
import {
  advanceEffects, BRACKET_SLIDE_SECONDS, comboTier, createEffects, drawDamageVignette, drawEffectsBehindRunner,
  drawEffectsFront, drawEffectsScenery, drawEffectsUnderGates, drawLastHeartVignette, ECHO_GAP, ECHO_PADDING,
  getAura, getBracket, getDecisionTimerBar, getLaneFlash, getPauseFade, getPauseTitle, getRunnerPose, getShake,
  getStampFor, getSunScale, getWrongMark, isMilestone, LANE_FLASH_SECONDS, MAX_DUST, MAX_PARTICLES, MAX_SPEED_LINES,
  MAX_STAMPS, MAX_STEP_SECONDS, measureEcho, MILESTONE_SECONDS, MILESTONES, milestoneKanji, nextRandom, noteResume,
  PARTICLE_STRIDE, PAUSE_FADE_SECONDS, setBracketLane, setReducedMotion, spawnCorrect, spawnEcho, spawnFootfall,
  spawnLaneChange, spawnMilestone, spawnWrong, STAMP_SECONDS, type DrawFonts, type EffectsState,
} from "../../src/components/game/effects";

const width = 320;
const height = 568;
const layout = getGameLayout(width, height);
const fonts: DrawFonts = {
  serif: (px) => `800 ${px}px serif`,
  sans: (px) => `700 ${px}px sans-serif`,
};

function questions(count: number): Question[] {
  return Array.from({ length: count }, (_, i) => {
    const vocab = { w: String(i), r: "one", m: "one", f: [{ t: String(i) }] };
    return {
      kanji: { c: String(i), m: "one", on: "イチ", kun: "ひと", rad: "一", mn: "one", strokes: 1, ch: 1, vocab: [vocab] },
      vocab,
      type: "meaning" as const,
      prompt: String(i),
      segments: [{ t: String(i), focus: true }],
      sub: "Meaning?",
      choices: ["one", "two", "three"],
      answer: "one",
    };
  });
}

/** Distinct gate objects. createRunnerState only fills RUNNER_LANES (3) pending gates, so larger counts concatenate runs. */
function gates(count = 3): RunnerGate[] {
  const out: RunnerGate[] = [];
  while (out.length < count) out.push(...createRunnerState(questions(count - out.length), width, height, () => 0.999).gates);
  return out;
}

function fx(reducedMotion = false, seed = 7) {
  return createEffects({ reducedMotion, seed });
}

/** Steps the wall clock in frames no longer than the clamp (a 20 s fast-forward is delivered frame by frame). */
function run(state: EffectsState, seconds: number, paused = false, frame = 1 / 60) {
  let alive = true;
  for (let t = 0; t < seconds - 1e-9; t += frame) alive = advanceEffects(state, frame, paused);
  return alive;
}

/** JSON view of the state with typed arrays expanded and gates reduced to their prompt. */
function snapshot(state: EffectsState) {
  return JSON.stringify(state, (_, value) => {
    if (value instanceof Float32Array) return Array.from(value);
    if (value && typeof value === "object" && "laneChoices" in value && "q" in value) return (value as RunnerGate).q.prompt;
    return value;
  });
}

/** A recording 2D context: every method call and property write is logged, save/restore stack the state; nothing is drawn. */
function stubContext() {
  const calls: string[] = [];
  const state: Record<string, unknown> = {
    globalAlpha: 1, textAlign: "center", textBaseline: "alphabetic", font: "", fillStyle: "", strokeStyle: "", lineWidth: 1,
  };
  const stack: Record<string, unknown>[] = [];
  const ctx = new Proxy({}, {
    get(_, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop in state) return state[prop];
      return (...args: unknown[]) => {
        calls.push(prop);
        for (const arg of args) if (typeof arg === "number" && !Number.isFinite(arg)) throw new Error(`${prop} received ${arg}`);
        if (prop === "save") stack.push({ ...state });
        if (prop === "restore") Object.assign(state, stack.pop() ?? {});
        return prop === "measureText" ? { width: 6 * String(args[0]).length } : undefined;
      };
    },
    set(_, prop, value) {
      if (typeof prop === "string") {
        state[prop] = value;
        calls.push(`set:${prop}`);
      }
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, state };
}

function drawEverything(state: EffectsState, compact = layout.compact) {
  const { ctx, calls, state: props } = stubContext();
  drawEffectsScenery(ctx, state, { W: width, H: height, compact, sunX: 250, sunY: 90, sunR: 42, fonts });
  drawEffectsUnderGates(ctx, state, layout, width, fonts);
  drawEffectsBehindRunner(ctx, state, { px: layout.playerX, py: 300, combo: state.combo });
  drawEffectsFront(ctx, state, width, height);
  drawDamageVignette(ctx, state, width, height, 0.55);
  drawDamageVignette(ctx, state, width, height, 0.2);
  drawLastHeartVignette(ctx, state, width, height);
  return { calls, props };
}

test("milestone tables and combo tiers", () => {
  expect(MILESTONES).toEqual([3, 5, 8, 10, 15, 20, 30]);
  for (let combo = 0; combo <= 40; combo++) {
    expect(isMilestone(combo)).toBe(MILESTONES.includes(combo));
    expect(milestoneKanji(combo) === null).toBe(!isMilestone(combo));
    expect(comboTier(combo)).toBe(combo >= 10 ? 3 : combo >= 5 ? 2 : combo >= 3 ? 1 : 0);
  }
  expect([3, 5, 8, 10, 15, 20, 30].map(milestoneKanji)).toEqual(["三", "五", "八", "十", "十五", "二十", "三十"]);
});

test("the seeded generator is deterministic and stays in [0, 1)", () => {
  const a = fx(false, 42);
  const b = fx(false, 42);
  const c = fx(false, 43);
  const seqA = Array.from({ length: 200 }, () => nextRandom(a));
  const seqB = Array.from({ length: 200 }, () => nextRandom(b));
  const seqC = Array.from({ length: 200 }, () => nextRandom(c));
  expect(seqA).toEqual(seqB);
  expect(seqA).not.toEqual(seqC);
  for (const v of seqA) {
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
  expect(new Set(seqA).size).toBeGreaterThan(190);
});

test("pools stay bounded after a hundred spawns and never throw", () => {
  const state = fx();
  const [g0, g1, g2] = gates(3);
  for (let i = 0; i < 100; i++) {
    const gate = [g0, g1, g2][i % 3]!;
    spawnCorrect(state, { x: 60, y: 300, gate, combo: i + 1 });
    if (i % 10 === 0) spawnMilestone(state, 10);
    if (i % 7 === 0) spawnWrong(state, { x: 60, y: 300, gate, chosenLane: 2 });
    spawnLaneChange(state, { dir: 1, lane: i % 3 });
    spawnFootfall(state, 50, 322);
    spawnEcho(state, { text: String(i), score: "+100", width: 80, fontPx: 14, x: 100, y: 200, color: "moss", lifeSeconds: 0.9 });
    expect(state.particleCount).toBeLessThanOrEqual(MAX_PARTICLES);
    advanceEffects(state, 1 / 60, false);
    expect(state.particleCount).toBeLessThanOrEqual(MAX_PARTICLES);
  }
  expect(state.particles.length).toBe(MAX_PARTICLES * PARTICLE_STRIDE);
  expect(state.stamps).toHaveLength(MAX_STAMPS);
  expect(state.wrongMarks).toHaveLength(4);
  expect(state.dust).toHaveLength(MAX_DUST);
  expect(state.speedLines.length).toBe(MAX_SPEED_LINES * 4);
  for (let i = 0; i < 10; i++) {
    spawnMilestone(state, MILESTONES[i % MILESTONES.length]!);
    advanceEffects(state, 1 / 60, false);
    expect(state.particleCount).toBeLessThanOrEqual(MAX_PARTICLES);
  }
  // Five answers inside one frame (a long fast-forward) also stay inside the pool.
  for (let i = 0; i < 5; i++) spawnCorrect(state, { x: 60, y: 300, gate: g0!, combo: 10 + i });
  expect(state.particleCount).toBeLessThanOrEqual(MAX_PARTICLES);
  expect(() => drawEverything(state)).not.toThrow();
});

test("a frame longer than the clamp is the same step as a 0.1 s frame", () => {
  const make = () => {
    const state = fx(false, 3);
    const [gate] = gates(1);
    spawnCorrect(state, { x: 60, y: 300, gate: gate!, combo: 3 });
    spawnMilestone(state, 3);
    spawnWrong(state, { x: 60, y: 300, gate: gate!, chosenLane: 0 });
    spawnLaneChange(state, { dir: -1, lane: 0 });
    spawnEcho(state, { text: "日本 にほん", score: "+300 ×3", width: 120, fontPx: 14, x: 100, y: 200, color: "moss", lifeSeconds: 0.9 });
    spawnFootfall(state, 50, 322);
    return state;
  };
  const long = make();
  const short = make();
  const alive1 = advanceEffects(long, 100, false);
  const alive2 = advanceEffects(short, MAX_STEP_SECONDS, false);
  expect(alive1).toBe(alive2);
  expect(snapshot(long)).toBe(snapshot(short));
  expect(long.clock).toBeCloseTo(MAX_STEP_SECONDS, 12);
  // Non-finite and negative frames are ignored entirely.
  const before = snapshot(long);
  for (const dt of [-1, Number.NaN, Number.POSITIVE_INFINITY]) advanceEffects(long, dt, false);
  expect(snapshot(long)).toBe(before);
});

test("twenty seconds expire every particle, stamp, echo, flash and timeline", () => {
  const state = fx();
  const [g0, g1] = gates(2);
  spawnCorrect(state, { x: 60, y: 300, gate: g0!, combo: 5 });
  spawnMilestone(state, 5);
  spawnWrong(state, { x: 60, y: 300, gate: g1!, chosenLane: 1 });
  spawnLaneChange(state, { dir: 1, lane: 2 });
  spawnEcho(state, { text: "日本", score: "+100", width: 80, fontPx: 14, x: 100, y: 200, color: "vermillion", lifeSeconds: 1.2 });
  spawnFootfall(state, 50, 322);
  noteResume(state);
  expect(advanceEffects(state, 1 / 60, false)).toBe(true);
  expect(state.particleCount).toBeGreaterThan(0);

  let frames = 0;
  while (advanceEffects(state, 20, false)) {
    frames += 1;
    expect(frames).toBeLessThanOrEqual(200);
  }
  expect(frames * MAX_STEP_SECONDS).toBeLessThanOrEqual(20);
  expect(state.particleCount).toBe(0);
  expect(state.echo).toBeNull();
  expect(state.laneFlash).toBeNull();
  expect(state.milestone).toBeNull();
  expect(state.stamps.every((s) => s.gate === null)).toBe(true);
  expect(getStampFor(state, g0!)).toBeNull();
  expect(getLaneFlash(state)).toBeNull();
  expect(getShake(state)).toEqual({ x: 0, y: 0 });
  expect(getRunnerPose(state, 0, 0)).toEqual({ sx: 1, sy: 1, dy: 0, rot: 0 });
  // The chosen-lane record is keyed by gate identity and is not time-based; the runner times it with sinceResolved.
  expect(getWrongMark(state, g1!)).toEqual({ chosenLane: 1 });
  expect(advanceEffects(state, 1 / 60, false)).toBe(false);
});

test("reduced motion removes motion but keeps the informational elements", () => {
  const state = fx(true);
  const [g0, g1] = gates(2);
  spawnWrong(state, { x: 60, y: 300, gate: g1!, chosenLane: 2 });
  expect(getShake(state)).toEqual({ x: 0, y: 0 });
  advanceEffects(state, 0.02, false);
  expect(getShake(state)).toEqual({ x: 0, y: 0 });
  expect(getRunnerPose(state, 0, 0)).toEqual({ sx: 1, sy: 1, dy: 0, rot: 0 });
  expect(getRunnerPose(state, 1, 1)).toEqual({ sx: 1, sy: 1, dy: -2, rot: 0 });

  spawnCorrect(state, { x: 60, y: 300, gate: g0!, combo: 3 });
  spawnMilestone(state, 3);
  spawnFootfall(state, 50, 322);
  noteResume(state);
  spawnLaneChange(state, { dir: 1, lane: 0 });
  spawnEcho(state, { text: "日本", score: "+300 ×3", width: 100, fontPx: 14, x: 100, y: 200, color: "moss", lifeSeconds: 0.9 });
  setBracketLane(state, 1, true);
  advanceEffects(state, 0.05, false);
  expect(state.particleCount).toBe(0);
  expect(getRunnerPose(state, 0, 0)).toEqual({ sx: 1, sy: 1, dy: 0, rot: 0 });
  expect(getShake(state)).toEqual({ x: 0, y: 0 });
  expect(getSunScale(state)).toBe(1);
  expect(getLaneFlash(state)).toEqual({ lane: 0, alpha: 0.1 });
  const stamp = getStampFor(state, g0!);
  expect(stamp).not.toBeNull();
  expect(stamp!.scale).toBe(1);
  expect(stamp!.signSquash).toEqual({ sx: 1, sy: 1 });
  expect(getWrongMark(state, g1!)).toEqual({ chosenLane: 2 });
  expect(state.echo?.text).toBe("日本");
  expect(getBracket(state)).toEqual({ inset: 3, signScale: 1 });
  expect(getAura(state, 5)).toEqual({ radius: 26, alpha: 0.22, tier: 2 });
  expect(getDecisionTimerBar(state, 1.0)).toBe(0.75);
  expect(getDecisionTimerBar(state, 0.01)).toBe(0.25);
  expect(state.dust.every((d) => d.t >= 0.28)).toBe(true);
  for (let i = 0; i < MAX_SPEED_LINES; i++) expect(state.speedLines[i * 4 + 3]).toBe(0);

  // Flipping the flag mid-flight stops motion that is already running.
  const moving = fx(false);
  spawnWrong(moving, { x: 60, y: 300, gate: g1!, chosenLane: 2 });
  spawnCorrect(moving, { x: 60, y: 300, gate: g0!, combo: 1 });
  spawnFootfall(moving, 50, 322);
  expect(moving.particleCount).toBeGreaterThan(0);
  setReducedMotion(moving, true);
  expect(moving.particleCount).toBe(0);
  expect(getShake(moving)).toEqual({ x: 0, y: 0 });
  expect(getRunnerPose(moving, 0, 0)).toEqual({ sx: 1, sy: 1, dy: 0, rot: 0 });
  expect(getStampFor(moving, g0!)).not.toBeNull();
  expect(() => drawEverything(moving)).not.toThrow();
});

test("stamps slam in, squash the sign, fade out at 0.7 s and are keyed by gate identity", () => {
  const state = fx();
  const [g0, g1] = gates(2);
  spawnCorrect(state, { x: 60, y: 300, gate: g0!, combo: 1 });
  const first = getStampFor(state, g0!);
  expect(first).not.toBeNull();
  expect(first!.scale).toBeCloseTo(1.9, 6);
  expect(first!.alpha).toBe(0);
  expect(getStampFor(state, g1!)).toBeNull();

  let peaked = false;
  let squashed = false;
  let previous = first!;
  for (let t = 0; t < STAMP_SECONDS + 0.2; t += 0.01) {
    advanceEffects(state, 0.01, false);
    const stamp = getStampFor(state, g0!);
    if (t + 0.01 >= STAMP_SECONDS) {
      expect(stamp).toBeNull();
      continue;
    }
    expect(stamp).not.toBeNull();
    expect(stamp!.alpha).toBeGreaterThanOrEqual(0);
    expect(stamp!.alpha).toBeLessThanOrEqual(1);
    expect(stamp!.scale).toBeGreaterThan(0.85);
    expect(stamp!.scale).toBeLessThanOrEqual(1.9);
    if (t + 0.01 < 0.11 && stamp!.scale > 1) peaked = true;
    if (stamp!.signSquash.sy < 0.9) squashed = true;
    if (t + 0.01 > 0.25) expect(stamp!.scale).toBeCloseTo(1, 1);
    if (t + 0.01 > 0.07 && t + 0.01 < 0.5) expect(stamp!.alpha).toBeCloseTo(0.95, 6);
    previous = stamp!;
  }
  expect(peaked).toBe(true);
  expect(squashed).toBe(true);
  expect(previous.alpha).toBeLessThan(0.2);

  // Four slots: the fifth stamp recycles the oldest.
  const many = fx();
  const five = gates(5);
  five.forEach((gate, i) => {
    spawnCorrect(many, { x: 60, y: 300, gate, combo: i + 1 });
    advanceEffects(many, 0.05, false);
  });
  expect(getStampFor(many, five[0]!)).toBeNull();
  for (const gate of five.slice(1)) expect(getStampFor(many, gate)).not.toBeNull();
});

test("wrong marks remember the chosen lane per gate in a ring of four", () => {
  const state = fx();
  const six = gates(6);
  six.forEach((gate, i) => spawnWrong(state, { x: 60, y: 300, gate, chosenLane: i % 3 }));
  expect(getWrongMark(state, six[0]!)).toBeNull();
  expect(getWrongMark(state, six[1]!)).toBeNull();
  for (let i = 2; i < 6; i++) expect(getWrongMark(state, six[i]!)).toEqual({ chosenLane: i % 3 });
  expect(getWrongMark(state, gates(1)[0]!)).toBeNull();
  run(state, 30);
  expect(getWrongMark(state, six[5]!)).toEqual({ chosenLane: 2 });
});

test("the echo keeps the newest word and expires after its life", () => {
  const state = fx();
  spawnEcho(state, { text: "日本 にほん", score: "+100", width: 120, fontPx: 14, x: 100, y: 200, color: "moss", lifeSeconds: 0.9 });
  spawnEcho(state, { text: "山 やま · mountain", score: "+200 ×2", width: 160, fontPx: 12, x: 120, y: 210, color: "vermillion", lifeSeconds: 1.2 });
  expect(state.echo?.text).toBe("山 やま · mountain");
  expect(state.echo?.color).toBe("vermillion");
  expect(state.echo?.life).toBe(1.2);
  run(state, 1.1);
  expect(state.echo).not.toBeNull();
  run(state, 0.2);
  expect(state.echo).toBeNull();

  const { ctx } = stubContext();
  const measured = measureEcho(ctx, fonts, "日本 にほん", "+300 ×3", 240);
  expect(measured.fontPx).toBe(14);
  expect(measured.width).toBe(6 * 6 + ECHO_GAP + 6 * 7 + ECHO_PADDING * 2);
  const squeezed = measureEcho(ctx, fonts, "a".repeat(40), "+100", 200);
  expect(squeezed.fontPx).toBe(11);
  expect(squeezed.width).toBeGreaterThan(200);
});

test("the lane flash fades strictly to nothing within 0.2 s", () => {
  const state = fx();
  spawnLaneChange(state, { dir: -1, lane: 2 });
  let flash = getLaneFlash(state);
  expect(flash).toEqual({ lane: 2, alpha: 0.12 });
  let elapsed = 0;
  while (flash) {
    advanceEffects(state, 0.02, false);
    elapsed += 0.02;
    const next = getLaneFlash(state);
    if (next) {
      expect(next.lane).toBe(2);
      expect(next.alpha).toBeLessThan(flash.alpha);
      expect(next.alpha).toBeGreaterThan(0);
    }
    flash = next;
  }
  expect(elapsed).toBeLessThanOrEqual(LANE_FLASH_SECONDS + 1e-9);
  // A newer tap restarts the flash on the new lane.
  spawnLaneChange(state, { dir: 1, lane: 0 });
  advanceEffects(state, 0.1, false);
  spawnLaneChange(state, { dir: 1, lane: 1 });
  expect(getLaneFlash(state)).toEqual({ lane: 1, alpha: 0.12 });
});

test("the pause fade rises to one while paused, drops to zero on resume, and the shake keeps decaying", () => {
  const state = fx();
  const [gate] = gates(1);
  expect(getPauseFade(state)).toBe(0);
  spawnWrong(state, { x: 60, y: 300, gate: gate!, chosenLane: 0 });
  spawnCorrect(state, { x: 60, y: 300, gate: gate!, combo: 1 });
  spawnLaneChange(state, { dir: 1, lane: 1 });
  advanceEffects(state, 0.001, true);
  expect(getPauseFade(state)).toBe(0);
  expect(getPauseTitle(state).scale).toBeCloseTo(1.3, 2);
  const shake0 = Math.abs(getShake(state).x);
  expect(shake0).toBeGreaterThan(0);
  const stampBefore = getStampFor(state, gate!);
  const flashBefore = getLaneFlash(state);

  let previous = 0;
  let elapsed = 0;
  while (getPauseFade(state) < 1) {
    advanceEffects(state, 0.01, true);
    elapsed += 0.01;
    expect(getPauseFade(state)).toBeGreaterThanOrEqual(previous);
    previous = getPauseFade(state);
    expect(elapsed).toBeLessThanOrEqual(PAUSE_FADE_SECONDS + 0.011);
  }
  expect(getPauseTitle(state).scale).toBeCloseTo(1, 6);
  // Wall-clock: the shake decays under the lesson blur; sim-linked stamps and flashes are frozen.
  expect(Math.abs(getShake(state).x)).toBeLessThan(shake0);
  expect(getStampFor(state, gate!)).toEqual(stampBefore);
  expect(getLaneFlash(state)).toEqual(flashBefore);
  run(state, 1, true);
  expect(getShake(state)).toEqual({ x: 0, y: 0 });
  expect(getRunnerPose(state, 0, 0)).toEqual({ sx: 1, sy: 1, dy: 0, rot: 0 });
  expect(getStampFor(state, gate!)).toEqual(stampBefore);
  expect(getPauseFade(state)).toBe(1);

  advanceEffects(state, 1 / 60, false);
  expect(getPauseFade(state)).toBe(0);
  expect(getPauseTitle(state)).toEqual({ scale: 1, rot: getPauseTitle(state).rot });
  run(state, 1);
  expect(getStampFor(state, gate!)).toBeNull();
  expect(getLaneFlash(state)).toBeNull();
});

test("shake is a damped 25 Hz wobble that ends within 250 ms; a milestone kicks the frame up 2 px", () => {
  const state = fx();
  const [gate] = gates(1);
  spawnWrong(state, { x: 60, y: 300, gate: gate!, chosenLane: 0 });
  let peak = 0;
  let signChanges = 0;
  let last = 0;
  for (let t = 0; t < 0.3; t += 0.005) {
    advanceEffects(state, 0.005, false);
    const { x, y } = getShake(state);
    peak = Math.max(peak, Math.abs(x));
    expect(Math.abs(x)).toBeLessThanOrEqual(5);
    expect(y).toBeCloseTo(0.6 * x, 9);
    if (Math.sign(x) !== 0 && Math.sign(x) !== Math.sign(last) && last !== 0) signChanges += 1;
    last = x;
  }
  expect(peak).toBeGreaterThan(2);
  expect(signChanges).toBeGreaterThanOrEqual(4);
  expect(getShake(state)).toEqual({ x: 0, y: 0 });

  spawnMilestone(state, 3);
  expect(getShake(state)).toEqual({ x: 0, y: -2 });
  run(state, 0.13);
  expect(getShake(state)).toEqual({ x: 0, y: 0 });
});

test("the runner pose composes locomotion, lean, hop, stumble and the resume lean", () => {
  const state = fx();
  const [gate] = gates(1);
  expect(getRunnerPose(state, 0, 0)).toEqual({ sx: 1, sy: 1, dy: 0, rot: 0 });
  // Locomotion: bob and foot-plant squash from the stride phase alone.
  const plant = getRunnerPose(state, 0.05, 0);
  expect(plant.sx).toBeGreaterThan(1);
  expect(plant.sy).toBeLessThan(1);
  const apex = getRunnerPose(state, 1, 0);
  expect(apex.dy).toBe(-3);
  expect(apex.sy).toBeGreaterThan(1);
  // Lane lean clamps at ±0.24 rad.
  expect(getRunnerPose(state, 0, 0.5).rot).toBeCloseTo(0.15, 9);
  expect(getRunnerPose(state, 0, 2).rot).toBe(0.24);
  expect(getRunnerPose(state, 0, -2).rot).toBe(-0.24);

  spawnCorrect(state, { x: 60, y: 300, gate: gate!, combo: 1 });
  let lowest = 0;
  let stretched = false;
  for (let t = 0; t < 0.4; t += 0.01) {
    advanceEffects(state, 0.01, false);
    const pose = getRunnerPose(state, 0, 0);
    lowest = Math.min(lowest, pose.dy);
    if (pose.sy > 1.05) stretched = true;
  }
  expect(lowest).toBeLessThan(-8);
  expect(stretched).toBe(true);
  expect(getRunnerPose(state, 0, 0)).toEqual({ sx: 1, sy: 1, dy: 0, rot: 0 });

  spawnWrong(state, { x: 60, y: 300, gate: gate!, chosenLane: 0 });
  run(state, 0.08);
  const stumble = getRunnerPose(state, 0, 0);
  expect(stumble.rot).toBeLessThan(-0.25);
  expect(stumble.sx).toBeGreaterThan(1.1);
  run(state, 0.3);
  expect(getRunnerPose(state, 0, 0)).toEqual({ sx: 1, sy: 1, dy: 0, rot: 0 });

  noteResume(state);
  run(state, 0.1);
  expect(getRunnerPose(state, 0, 0).rot).toBeGreaterThan(0.1);
  run(state, 0.3);
  expect(getRunnerPose(state, 0, 0)).toEqual({ sx: 1, sy: 1, dy: 0, rot: 0 });
});

test("lock-in brackets slide from 8 px to 3 px, follow the lane and vanish when inactive", () => {
  const state = fx();
  expect(getBracket(state)).toBeNull();
  setBracketLane(state, 2, true);
  expect(getBracket(state)).toEqual({ inset: 8, signScale: 1 });
  expect(state.bracket.lane).toBe(2);
  let previous = 8;
  for (let t = 0; t < BRACKET_SLIDE_SECONDS; t += 0.01) {
    advanceEffects(state, 0.01, false);
    const b = getBracket(state)!;
    expect(b.inset).toBeLessThanOrEqual(previous);
    previous = b.inset;
  }
  expect(getBracket(state)!.inset).toBeCloseTo(3, 6);
  expect(getBracket(state)!.signScale).toBeCloseTo(1.05, 6);
  setBracketLane(state, 0, true);
  expect(state.bracket.lane).toBe(0);
  expect(getBracket(state)!.inset).toBeCloseTo(3, 6);
  setBracketLane(state, 0, false);
  expect(getBracket(state)).toBeNull();
  setBracketLane(state, 1, true);
  expect(getBracket(state)!.inset).toBe(8);
});

test("the aura follows the combo tier, blooms on a tier change and vanishes on a miss", () => {
  const state = fx();
  const [gate] = gates(1);
  expect(getAura(state, 2)).toEqual({ radius: 0, alpha: 0, tier: 0 });
  spawnCorrect(state, { x: 60, y: 300, gate: gate!, combo: 2 });
  advanceEffects(state, 0.1, false);
  expect(getAura(state, 2).tier).toBe(0);
  spawnCorrect(state, { x: 60, y: 300, gate: gate!, combo: 3 });
  const bloom = getAura(state, 3);
  expect(bloom.tier).toBe(1);
  expect(bloom.radius).toBeCloseTo(26, 6);
  advanceEffects(state, 0.1, false);
  expect(getAura(state, 3).radius).toBeCloseTo(34, 6);
  run(state, 0.2);
  expect(getAura(state, 3).radius).toBeCloseTo(26, 6);
  expect(getAura(state, 3).alpha).toBeGreaterThanOrEqual(0.14);
  expect(getAura(state, 3).alpha).toBeLessThanOrEqual(0.3);
  expect(getAura(state, 12).tier).toBe(3);
  spawnWrong(state, { x: 60, y: 300, gate: gate!, chosenLane: 0 });
  expect(getAura(state, 0)).toEqual({ radius: 0, alpha: 0, tier: 0 });
  expect(state.combo).toBe(0);
});

test("tier-3 speed lines spawn from the pool, wrap off the left edge and stop on a miss", () => {
  const state = fx();
  const [gate] = gates(1);
  spawnCorrect(state, { x: 60, y: 300, gate: gate!, combo: 10 });
  run(state, 1.5);
  const active = () => Array.from({ length: MAX_SPEED_LINES }, (_, i) => state.speedLines[i * 4 + 3]!).filter(Boolean).length;
  expect(active()).toBeGreaterThan(0);
  expect(active()).toBeLessThanOrEqual(MAX_SPEED_LINES);
  const { calls } = drawEverything(state);
  expect(calls.filter((c) => c === "stroke").length).toBeGreaterThan(0);
  spawnWrong(state, { x: 60, y: 300, gate: gate!, chosenLane: 0 });
  expect(active()).toBe(0);
  run(state, 1);
  expect(active()).toBe(0);
});

test("a milestone breathes the sun, shows the seal for 1.08 s and bursts once at the runner", () => {
  const state = fx();
  const [gate] = gates(1);
  spawnMilestone(state, 5);
  expect(state.milestone).toEqual({ combo: 5, t: 0 });
  expect(getSunScale(state)).toBe(1);
  // Two frames: a single 0.15 s frame would be clamped to 0.1 s.
  advanceEffects(state, 0.1, false);
  advanceEffects(state, 0.05, false);
  expect(getSunScale(state)).toBeCloseTo(1.06, 6);
  // No position yet: the burst waits for spawnCorrect.
  expect(state.particleCount).toBe(0);
  spawnCorrect(state, { x: 60, y: 300, gate: gate!, combo: 5 });
  expect(state.particleCount).toBe(8 + 8 + 24);
  run(state, 1);
  expect(state.milestone).toBeNull();
  expect(getSunScale(state)).toBe(1);

  // The other order (correct first, then milestone) bursts at that answer on the next frame.
  const other = fx();
  spawnCorrect(other, { x: 60, y: 300, gate: gate!, combo: 3 });
  const before = other.particleCount;
  spawnMilestone(other, 3);
  expect(other.particleCount).toBe(before);
  advanceEffects(other, 1 / 60, false);
  expect(other.particleCount).toBe(before + 24);
  run(other, MILESTONE_SECONDS + 0.1);
  expect(other.milestone).toBeNull();
});

test("draw passes use fixed styles, batched paths, no gradients or shadows, and leave the context clean", () => {
  const state = fx();
  const [g0, g1] = gates(2);
  spawnCorrect(state, { x: 60, y: 300, gate: g0!, combo: 10 });
  spawnMilestone(state, 10);
  spawnWrong(state, { x: 60, y: 300, gate: g1!, chosenLane: 1 });
  spawnLaneChange(state, { dir: 1, lane: 1 });
  spawnEcho(state, { text: "日本 にほん · Japan", score: "+1000 ×10", width: 200, fontPx: 13, x: 160, y: 200, color: "moss", lifeSeconds: 0.9 });
  spawnFootfall(state, 50, 322);
  noteResume(state);
  spawnCorrect(state, { x: 60, y: 300, gate: g0!, combo: 11 });
  let batchedFrames = 0;
  for (const compact of [true, false]) {
    // A fresh milestone and echo per pass so the desktop seal and the pill text are both drawn.
    spawnMilestone(state, 15);
    spawnEcho(state, { text: "山 やま", score: "+1500 ×15", width: 150, fontPx: 14, x: 160, y: 200, color: "moss", lifeSeconds: 0.9 });
    for (let frame = 0; frame < 80; frame++) {
      advanceEffects(state, 1 / 60, false);
      const { calls, props } = drawEverything(state, compact);
      // Desktop first frame: echo word + score + seal kanji are all text draws.
      if (!compact && frame === 0) expect(calls.filter((c) => c === "fillText").length).toBeGreaterThanOrEqual(3);
      if (compact && frame === 0) expect(calls.filter((c) => c === "fillText").length).toBe(2);
      expect(calls).not.toContain("createLinearGradient");
      expect(calls).not.toContain("createRadialGradient");
      expect(calls).not.toContain("createPattern");
      expect(calls).not.toContain("set:shadowBlur");
      expect(calls).not.toContain("set:filter");
      expect(calls.filter((c) => c === "save").length).toBe(calls.filter((c) => c === "restore").length);
      expect(props["globalAlpha"]).toBe(1);
      expect(props["textAlign"]).toBe("center");
      expect(props["textBaseline"]).toBe("alphabetic");
      // Particles are drawn with at most one fill per colour, not one per particle.
      const front = stubContext();
      drawEffectsFront(front.ctx, state, width, height);
      const arcs = front.calls.filter((c) => c === "arc").length;
      const fills = front.calls.filter((c) => c === "fill").length;
      if (arcs > 8) {
        expect(fills).toBeLessThan(arcs);
        batchedFrames += 1;
      }
      expect(fills).toBeLessThanOrEqual(4 + MAX_DUST);
    }
  }
  expect(batchedFrames).toBeGreaterThan(20);
  expect(state.milestone).toBeNull();
});

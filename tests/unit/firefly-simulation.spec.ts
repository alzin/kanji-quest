import { expect, test } from "@playwright/test";
import {
  advanceFirefly, advanceWithGates, assignGate, burst, chooseLane, chooseTrail, createFireflyState,
  EVENT_WARNING_SECONDS, FIXED_STEP, GATE_SIGHT, getFireflyResult, grantCharge, INTRO_SLOW, PACE, takeGateResults, targetPace, validateRoute,
  type FireflyEntity, type FireflyState, type GateContent, type GateResult,
} from "../../src/components/game/firefly/simulation";
import { GATES_PER_ADVENTURE, SPIRITS, type SpiritId, type TrailId } from "../../src/lib/firefly-catalog";

const create = (seed = 1, difficulty: "standard" | "relaxed" = "standard") => createFireflyState({ seed, difficulty, collected: [] });
const event = (id: number, kind: FireflyEntity["kind"], time: number, lane = 1, spirit?: SpiritId): FireflyEntity => ({ id, kind, time, lane, resolved: false, ...(spirit ? { spirit } : {}) });
const gateAt = (id: number, time: number, gate = 0): FireflyEntity => ({ id, kind: "gate", time, lane: 1, resolved: false, gate });
const words = (answer: number, mode: GateContent["mode"] = "reading", slow = false): GateContent =>
  ({ labels: ["いち", "に", "さん"], answer: answer as 0 | 1 | 2, card: "一", word: "一つ", mode, slow });

function nextStage(s: FireflyState, trail: TrailId): void {
  // Catalog-only tests can inspect each stage without spending time in traversal.
  s.phase = "fork";
  s.elapsed = (s.stage + 1) * 30;
  s.stageTime = 30;
  expect(chooseTrail(s, trail)).toBe(true);
}

/** Dodges thorns, then steers into each gate's answer unless told to miss it. */
function autoplay(s: FireflyState, trails: [TrailId, TrailId], fps = 60, miss: (gate: number) => boolean = () => false): GateResult[] {
  const results: GateResult[] = [];
  for (let frame = 0; frame < fps * 160 && s.phase !== "delivery" && s.phase !== "lost"; frame++) {
    if (s.phase === "fork") chooseTrail(s, trails[s.stage]!);
    const hazard = s.events.find((e) => !e.resolved && e.kind === "hazard" && e.time - s.elapsed <= 0.5);
    const gate = s.events.find((e) => !e.resolved && e.kind === "gate" && e.content && e.time - s.elapsed <= 0.9);
    if (hazard) {
      const blocked = s.events.filter((e) => e.kind === "hazard" && e.time === hazard.time).map((e) => e.lane);
      chooseLane(s, [0, 1, 2].find((lane) => !blocked.includes(lane))!);
    } else if (gate) chooseLane(s, (gate.content!.answer + (miss(gate.gate!) ? 1 : 0)) % 3);
    advanceWithGates(s, 1 / fps, (g) => words((g.gate! * 7) % 3));
    results.push(...takeGateResults(s));
  }
  return results;
}

/** Real seconds from a gate's words appearing to its arrival. */
function callSeconds(s: FireflyState, content: GateContent): number {
  let shown = -1, frame = 0;
  for (; frame < 2000 && s.gatesResolved === 0; frame++) {
    advanceWithGates(s, FIXED_STEP, () => { shown = frame; return content; });
  }
  return (frame - 1 - shown) * FIXED_STEP;
}

test("seeded routes are reproducible, fair, gate-spaced and keep six-second final approaches", () => {
  expect(create(41).events).toEqual(create(41).events);
  expect(create(41).events).not.toEqual(create(42).events);
  for (let seed = 0; seed < 150; seed++) {
    for (const first of ["grove", "bramble"] as const) {
      for (const second of ["bridge", "moonpath"] as const) {
        const s = create(seed);
        for (let stage = 0; stage < 3; stage++) {
          const events = s.events.filter((e) => e.time >= stage * 30);
          expect(validateRoute(events, stage * 30), `seed ${seed}, ${first}/${second}, stage ${stage}`).toBe(true);
          expect(events.every((e) => e.time - stage * 30 >= EVENT_WARNING_SECONDS)).toBe(true);
          expect(events.filter((e) => e.kind === "gate")).toHaveLength(stage === 2 ? 6 : 8);
          const cages = events.filter((e) => e.kind === "cage");
          expect(cages).toHaveLength(stage === 1 && first === "bramble" || stage === 2 && second === "moonpath" ? 3 : 2);
          expect(new Set(cages.map((e) => e.spirit)).size).toBe(cages.length);
          expect(cages.every((e) => SPIRITS.some((spirit) => spirit.id === e.spirit && spirit.stage === stage))).toBe(true);
          if (stage === 0) {
            expect(events.filter((e) => e.kind === "hazard").every((e) => e.time >= 8)).toBe(true);
            nextStage(s, first);
          } else if (stage === 1) nextStage(s, second);
          else expect(events.every((e) => e.time < 84)).toBe(true);
        }
        expect(s.events.filter((e) => e.kind === "gate").map((e) => e.gate)).toEqual([...Array(GATES_PER_ADVENTURE).keys()]);
      }
    }
  }
});

test("every branch can be completed with lane movement, correct words and no Burst", () => {
  for (let seed = 1; seed <= 12; seed++) {
    for (const first of ["grove", "bramble"] as const) {
      for (const second of ["bridge", "moonpath"] as const) {
        const s = create(seed);
        const results = autoplay(s, [first, second], 30);
        expect(s.phase, `seed ${seed}, ${first}/${second}`).toBe("delivery");
        expect(s.hearts).toBe(3);
        expect(s.elapsed).toBe(90);
        expect(results.map((r) => r.gate)).toEqual([...Array(GATES_PER_ADVENTURE).keys()]);
        expect(results.every((r) => r.correct)).toBe(true);
        expect(s.rescued).toEqual([]);
      }
    }
  }
});

test("validator rejects solid walls, poor warning, tight rows and crowded word gates", () => {
  expect(validateRoute([event(1, "hazard", 3, 0), event(2, "hazard", 3, 1), event(3, "hazard", 3, 2)])).toBe(false);
  expect(validateRoute([event(1, "hazard", 1, 0)])).toBe(false);
  expect(validateRoute([event(1, "hazard", 3, 0), event(2, "hazard", 4, 1)])).toBe(false);
  const gates = [gateAt(10, 3.8), gateAt(11, 7.4, 1)];
  expect(validateRoute([...gates, event(1, "hazard", 5.6, 0), event(2, "cage", 9.2, 1), event(3, "firefly", 8.2)])).toBe(true);
  expect(validateRoute([...gates, event(1, "hazard", 4.4, 0)])).toBe(false);
  expect(validateRoute([gateAt(10, 3.8), gateAt(11, 6.8, 1)])).toBe(false);
  expect(validateRoute([gateAt(10, 3)])).toBe(false);
  expect(validateRoute([...gates, event(2, "cage", 4.5, 1)])).toBe(false);
  expect(validateRoute([...gates, event(3, "firefly", 7.6)])).toBe(false);
});

test("a sighted gate waits for its words, discards time while waiting and resolves exactly once", () => {
  const s = create();
  s.events = [gateAt(1, 5)];
  advanceFirefly(s, 1.3);
  expect(s.awaitingGate).toBeNull();
  advanceFirefly(s, 0.3);
  expect(s.awaitingGate).toBe(1);
  expect(5 - s.elapsed).toBeLessThanOrEqual(GATE_SIGHT.standard + 1e-6);
  expect(5 - s.elapsed).toBeGreaterThan(GATE_SIGHT.standard - FIXED_STEP);
  const waiting = structuredClone(s);
  advanceFirefly(s, 10);
  expect(s).toEqual(waiting);
  expect(assignGate(s, 99, words(0))).toBe(false);
  expect(assignGate(s, 1, { ...words(0), labels: ["a", "", "c"] })).toBe(false);
  expect(assignGate(s, 1, { ...words(0), answer: 3 as 0 })).toBe(false);
  expect(assignGate(s, 1, words(2))).toBe(true);
  expect(assignGate(s, 1, words(1))).toBe(false);
  advanceFirefly(s, 0);
  expect(s.awaitingGate).toBeNull();
  expect(s.elapsed).toBeGreaterThan(waiting.elapsed);
  chooseLane(s, 2);
  advanceFirefly(s, 4);
  expect(takeGateResults(s)).toEqual([{ id: 1, gate: 0, lane: 2, correct: true, card: "一", word: "一つ", mode: "reading", charged: false }]);
  expect(takeGateResults(s)).toEqual([]);
  expect(s.hearts).toBe(3);

  const quiet = create();
  quiet.events = [gateAt(1, 4)];
  for (let i = 0; i < 10; i++) advanceWithGates(quiet, 0.5, () => null);
  expect(quiet.events[0]!.resolved).toBe(true);
  expect(quiet.gatesResolved).toBe(0);
  expect(takeGateResults(quiet)).toEqual([]);
  expect(quiet.elapsed).toBeGreaterThan(4);
});

test("lane movement, words and outcomes are equivalent at 20, 30, 60, 120 and 144 FPS", () => {
  const states = [20, 30, 60, 120, 144].map((fps) => {
    const s = create(52);
    s.events = [event(1, "firefly", 1, 0), event(2, "cage", 2.5, 0, "take"), gateAt(5, 4.2), event(3, "hazard", 6, 0), event(4, "hazard", 6.2, 0)];
    chooseLane(s, 0);
    const results: GateResult[] = [];
    const step = () => { advanceWithGates(s, 1 / fps, () => words(0, "reading", true)); results.push(...takeGateResults(s)); };
    for (let i = 0; i < fps * 2; i++) step();
    burst(s);
    for (let i = 0; i < fps * 7; i++) step();
    return { ...s, accumulator: 0, results };
  });
  for (const s of states) expect(s).toEqual(states[0]);
  expect(states[0]!.hearts).toBe(2);
  expect(states[0]!.score).toBe(310);
  expect(states[0]!.rescued).toEqual(["take"]);
  expect(states[0]!.results.map((r) => r.correct)).toEqual([true]);
});

test("a correct streak earns Burst charges; a miss breaks it without costing a heart", () => {
  const s = create();
  s.events = [1, 2, 3, 4].map((i) => gateAt(i, 3.5 + i * 3.6, i - 1));
  burst(s);
  chooseLane(s, 1);
  const results: GateResult[] = [];
  for (let i = 0; i < 60 * 20; i++) {
    advanceWithGates(s, 1 / 60, (g) => words(g.gate === 3 ? 0 : 1));
    results.push(...takeGateResults(s));
  }
  expect(results.map((r) => [r.correct, r.charged])).toEqual([[true, false], [true, false], [true, true], [false, false]]);
  expect(s.charges).toBe(2);
  expect(s.hearts).toBe(3);
  expect([s.gateStreak, s.chain, s.gatesCorrect, s.gatesResolved]).toEqual([0, 0, 3, 4]);
  expect(s.score).toBe(150);
});

test("an introduction cannot be missed, earns no streak or charge and slows the trail while in sight", () => {
  const s = create();
  s.events = [gateAt(1, 4)];
  chooseLane(s, 0);
  advanceWithGates(s, 0.6, () => words(1, "intro", true));
  const before = s.elapsed;
  advanceWithGates(s, 1, () => null);
  expect(s.elapsed - before).toBeCloseTo(INTRO_SLOW * PACE.standard.start, 2);
  advanceWithGates(s, 10, () => null);
  expect(takeGateResults(s).map((r) => [r.mode, r.correct, r.lane])).toEqual([["intro", true, 0]]);
  expect([s.score, s.chain, s.gateStreak, s.gatesCorrect, s.charges]).toEqual([25, 0, 0, 0, 1]);
});

test("the lantern call stays up for its full window in each difficulty", () => {
  const standard = create();
  standard.events = [gateAt(1, 4)];
  expect(callSeconds(standard, words(0))).toBeCloseTo(GATE_SIGHT.standard / PACE.standard.start, 1);
  const relaxed = create(1, "relaxed");
  relaxed.events = [gateAt(1, 4)];
  expect(callSeconds(relaxed, words(0))).toBeCloseTo(GATE_SIGHT.relaxed / PACE.relaxed.start, 1);
  const first = create();
  first.events = [gateAt(1, 4)];
  expect(callSeconds(first, words(0, "intro", true))).toBeCloseTo(GATE_SIGHT.standard / INTRO_SLOW / PACE.standard.start, 1);
});

test("collisions apply one hit and immunity; shields retain the pickup chain", () => {
  const s = create();
  s.events = [event(1, "hazard", 1), event(2, "hazard", 1), event(3, "hazard", 1.2), event(4, "hazard", 2.6)];
  s.chain = 12;
  s.shield = true;
  advanceFirefly(s, 1.3);
  expect(s.hearts).toBe(3);
  expect(s.shield).toBe(false);
  expect(s.chain).toBe(12);
  advanceFirefly(s, 1.4);
  expect(s.hearts).toBe(2);
  expect(s.chain).toBe(0);
  advanceFirefly(s, 1);
  expect(s.hearts).toBe(2);
});

test("Burst protects against hazards, rescues only in-lane cages and cannot be spammed", () => {
  const s = create();
  s.events = [event(1, "hazard", 0.5), event(2, "cage", 0.6, 1, "take"), event(3, "cage", 0.7, 2, "kohaku")];
  expect(burst(s)).toBe(true);
  expect(burst(s)).toBe(false);
  expect(s.charges).toBe(0);
  advanceFirefly(s, 1);
  expect(s.hearts).toBe(3);
  expect(s.score).toBe(250);
  expect(s.rescued).toEqual(["take"]);
  s.events.push(event(4, "cage", 2, 1, "komorebi"));
  advanceFirefly(s, 1.1);
  expect(s.hearts).toBe(3);
  expect(s.rescued).toEqual(["take"]);
});

test("charge regeneration uses traversal time and respects capacity and grantCharge", () => {
  const s = create();
  s.events = [];
  burst(s);
  while (s.elapsed < 11.9) advanceFirefly(s, FIXED_STEP);
  expect(s.charges).toBe(0);
  while (s.elapsed < 12.1) advanceFirefly(s, FIXED_STEP);
  expect(s.charges).toBe(1);
  expect(s.recharge).toBeLessThan(0.2);
  grantCharge(s);
  grantCharge(s);
  expect(s.charges).toBe(2);
  expect(s.recharge).toBe(0);
});

test("trail boons apply only to valid forks and reset on a new adventure", () => {
  const s = create();
  expect(chooseTrail(s, "grove")).toBe(false);
  s.phase = "fork";
  expect(chooseTrail(s, "bridge")).toBe(false);
  nextStage(s, "bramble");
  expect(s.burstDuration).toBe(1.5);
  nextStage(s, "moonpath");
  expect(s.maxCharges).toBe(3);
  expect(s.charges).toBe(2);
  const gentle = create();
  nextStage(gentle, "grove");
  expect(gentle.magnet).toBe(true);
  nextStage(gentle, "bridge");
  expect(gentle.shield).toBe(true);
  const fresh = create();
  expect([fresh.shield, fresh.magnet]).toEqual([false, false]);
  expect([fresh.maxCharges, fresh.burstDuration]).toEqual([2, 1]);
});

test("uncollected spirits are preferred without stage duplicates", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = createFireflyState({ seed, difficulty: "standard", collected: ["komorebi", "take"] });
    const cages = s.events.filter((e) => e.kind === "cage");
    expect(cages[0]!.spirit).toBe("kohaku");
    expect(cages[1]!.spirit).not.toBe("kohaku");
  }
});

test("pickup chains score ten collections per multiplier tier and magnet reaches adjacent lanes", () => {
  const s = create();
  s.events = Array.from({ length: 40 }, (_, i) => event(i + 1, "firefly", (i + 1) / 10));
  advanceFirefly(s, 5);
  expect(s.fireflies).toBe(40);
  expect(s.chain).toBe(40);
  expect(s.score).toBe(100 + 200 + 300 + 400);
  s.magnet = true;
  s.events.push(event(41, "firefly", 6, 0), event(42, "firefly", 6, 2));
  advanceFirefly(s, 1.1);
  expect(s.fireflies).toBe(42);
  expect(s.score).toBe(1080);
});

test("zero hearts ends immediately, retaining rescues but no delivery bonus", () => {
  const s = create();
  s.events = [event(1, "hazard", 1)];
  s.hearts = 1;
  s.rescued = ["take"];
  s.score = 250;
  advanceFirefly(s, 5);
  expect(s.phase).toBe("lost");
  expect(s.elapsed).toBeGreaterThanOrEqual(1);
  expect(s.elapsed - 1).toBeLessThan(FIXED_STEP * 2);
  expect(getFireflyResult(s)).toEqual({ score: 250, rescued: ["take"], delivered: false });
  const terminal = structuredClone(s);
  advanceFirefly(s, 100);
  grantCharge(s);
  expect(s).toEqual(terminal);
});

test("delivery awards its bonus once and returned results cannot mutate the simulation", () => {
  const s = create();
  autoplay(s, ["grove", "bridge"]);
  const score = s.score;
  expect(score).toBeGreaterThanOrEqual(500);
  const result = getFireflyResult(s);
  expect(result.delivered).toBe(true);
  result.rescued.push("take");
  expect(s.rescued).toEqual([]);
  advanceFirefly(s, 100);
  expect(getFireflyResult(s).score).toBe(score);
  expect(chooseTrail(s, "moonpath")).toBe(false);
});

test("relaxed mode has five hearts, starts at 80 percent travel speed and has a longer word window", () => {
  const s = create(1, "relaxed");
  expect(s.hearts).toBe(5);
  expect(s.sight).toBe(GATE_SIGHT.relaxed);
  expect(s.pace).toBe(0.8);
  s.events = [];
  advanceFirefly(s, 10);
  expect(s.elapsed).toBeGreaterThan(8);
  expect(s.elapsed).toBeLessThan(8.2);
  expect(s.phase).toBe("running");
});

test("the trail quickens across the adventure and on a streak, and eases back after a miss", () => {
  const s = create();
  s.events = [];
  expect(s.pace).toBe(PACE.standard.start);
  expect(targetPace({ difficulty: "standard", elapsed: 90, gateStreak: 0 })).toBeCloseTo(PACE.standard.end, 7);
  expect(targetPace({ difficulty: "standard", elapsed: 90, gateStreak: 20 })).toBeCloseTo(PACE.standard.end + PACE.standard.streak, 7);
  expect(targetPace({ difficulty: "relaxed", elapsed: 90, gateStreak: 20 })).toBeLessThanOrEqual(1);
  s.gateStreak = 6;
  advanceFirefly(s, 3);
  expect(s.pace).toBeGreaterThan(PACE.standard.start + PACE.standard.streak * 0.9);
  s.gateStreak = 0;
  advanceFirefly(s, 3);
  expect(s.pace).toBeLessThan(PACE.standard.start + 0.05);
  const late = create();
  late.events = [];
  while (late.phase === "running") advanceFirefly(late, 0.5);
  expect(late.elapsed).toBe(30);
  expect(late.pace).toBeGreaterThan(PACE.standard.start + (PACE.standard.end - PACE.standard.start) / 3 - 0.02);
});

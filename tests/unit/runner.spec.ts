import { expect, test } from "@playwright/test";
import type { Question } from "../../src/lib/srs";
import {
  advanceRunner, checkpointPassed, createRunnerState, dailyRunReward, getDecisionX,
  getGameLayout, getGateSpeed, getRunnerRemaining, getRunnerStats, type RunnerState,
} from "../../src/components/game/runner-math";

const width = 320;
const height = 568;
const fixedRandom = () => 0.999;
const layout = getGameLayout(width, height);

function questions(count: number): Question[] {
  return Array.from({ length: count }, (_, i) => ({
    kanji: { c: String(i), m: "one", on: "イチ", kun: "ひと", rad: "一", mn: "one", strokes: 1, ch: 1, vocab: [] },
    type: "meaning",
    prompt: String(i),
    sub: "Meaning?",
    choices: ["one", "two", "three"],
    answer: "one",
  }));
}

function answerNext(s: RunnerState, queue: Question[], correct: boolean, answered: string[] = []) {
  const gate = s.gates.find((g) => g.resolved === -1)!;
  s.lane = s.targetLane = correct ? gate.correctLane : (gate.correctLane + 1) % 3;
  const seconds = Math.max(0, (gate.x - getDecisionX(layout)) / getGateSpeed(width, layout));
  advanceRunner(s, queue, width, height, seconds + 1e-9, (q) => {
    answered.push(q.prompt);
    return false;
  }, fixedRandom);
}

test("empty and short queues keep exact indices, remaining counts, and completion", () => {
  for (const count of [0, 1, 2, 3, 5, 20]) {
    const queue = questions(count);
    const s = createRunnerState(queue, width, height, fixedRandom);
    expect(s.qi).toBe(Math.min(count, 3));
    expect(getRunnerRemaining(s, count)).toBe(count);
    expect(s.done).toBe(count === 0);
    const answered: string[] = [];
    for (let i = 0; i < count; i++) {
      answerNext(s, queue, true, answered);
      expect(getRunnerRemaining(s, count)).toBe(count - i - 1);
      expect(s.qi).toBeLessThanOrEqual(count);
    }
    expect(answered).toEqual(queue.map((q) => q.prompt));
    expect(getRunnerStats(s)).toEqual({ correct: count, wrong: 0, bestCombo: count, score: 100 * count * (count + 1) / 2 });
    expect(s.done).toBe(true);
    expect(dailyRunReward(getRunnerStats(s))).toBe(3 * count);
  }
});

test("all 1,024 ten-answer patterns conserve questions, lives, combo points and rewards", () => {
  const queue = questions(10);
  for (let mask = 0; mask < 2 ** queue.length; mask++) {
    const planned = queue.map((_, i) => (mask & (1 << i)) !== 0);
    const thirdWrong = planned.map((correct, i) => correct ? -1 : i).filter((i) => i >= 0)[2];
    const actual = thirdWrong === undefined ? planned : planned.slice(0, thirdWrong + 1);
    const correct = actual.filter(Boolean).length;
    const wrong = actual.length - correct;
    const streaks = actual.map((value) => value ? "1" : " ").join("").split(" ").map((run) => run.length);
    const bestCombo = Math.max(...streaks);
    const score = streaks.reduce((total, length) => total + 100 * length * (length + 1) / 2, 0);
    const s = createRunnerState(queue, width, height, fixedRandom);
    const answered: string[] = [];
    for (const correct of actual) answerNext(s, queue, correct, answered);
    expect(getRunnerStats(s)).toEqual({ correct, wrong, bestCombo, score });
    expect(s.hearts).toBe(3 - wrong);
    expect(s.combo).toBe(streaks.at(-1));
    expect(getRunnerRemaining(s, queue.length)).toBe(queue.length - actual.length);
    expect(answered).toEqual(queue.slice(0, actual.length).map((q) => q.prompt));
    expect(dailyRunReward(getRunnerStats(s))).toBe(correct * 2 + bestCombo);
    expect(s.done).toBe(true);
    const terminal = JSON.stringify(s);
    advanceRunner(s, queue, width, height, 100, () => { throw new Error("Answered after completion"); }, fixedRandom);
    expect(JSON.stringify(s)).toBe(terminal);
  }
});

test("a slow frame stops immediately after the third mistake", () => {
  const queue = questions(20);
  const s = createRunnerState(queue, width, height, fixedRandom);
  const answered: boolean[] = [];
  advanceRunner(s, queue, width, height, 100, (_, correct) => { answered.push(correct); }, fixedRandom);
  expect(answered).toEqual([false, false, false]);
  expect(getRunnerStats(s)).toEqual({ correct: 0, wrong: 3, bestCombo: 0, score: 0 });
  expect(s.hearts).toBe(0);
  expect(s.dist).toBeCloseTo(getGateSpeed(width, layout) * 9, 8);
  expect(getRunnerRemaining(s, queue.length)).toBe(17);
});

test("lesson pause resolves only one gate and excludes time spent paused", () => {
  const queue = questions(6);
  const s = createRunnerState(queue, width, height, fixedRandom);
  const answered: boolean[] = [];
  advanceRunner(s, queue, width, height, 100, (_, correct) => {
    answered.push(correct);
    return false;
  }, fixedRandom);
  expect(answered).toEqual([false]);
  expect(s.done).toBe(false);
  expect(s.wrong).toBe(1);
  expect(s.dist).toBeCloseTo(getGateSpeed(width, layout) * 3, 8);
  answerNext(s, queue, true);
  expect(getRunnerStats(s)).toEqual({ correct: 1, wrong: 1, bestCombo: 1, score: 100 });
});

test("distance and lane animation use elapsed seconds at both high and low frame rates", () => {
  for (const [w, h] of [[320, 568], [800, 900]] as const) {
    const queue = questions(5);
    const single = createRunnerState(queue, w, h, fixedRandom);
    const split = createRunnerState(queue, w, h, fixedRandom);
    single.targetLane = split.targetLane = 0;
    advanceRunner(single, queue, w, h, 2, () => {}, fixedRandom);
    for (let i = 0; i < 120; i++) advanceRunner(split, queue, w, h, 1 / 60, () => {}, fixedRandom);
    expect(single.dist).toBeCloseTo(getGateSpeed(w, getGameLayout(w, h)) * 2, 8);
    expect(split.dist).toBeCloseTo(single.dist, 8);
    expect(split.lane).toBeCloseTo(single.lane, 12);
    for (let i = 0; i < single.gates.length; i++) expect(split.gates[i]!.x).toBeCloseTo(single.gates[i]!.x, 8);
  }
});

test("grades the lane at the gate crossing, even when a long frame ends in another lane", () => {
  const queue = questions(1);
  for (const frameSize of [0.001, 1]) {
    const s = createRunnerState(queue, width, height, fixedRandom);
    s.targetLane = 0;
    s.gates[0]!.x = getDecisionX(layout) + getGateSpeed(width, layout) * 0.01;
    for (let elapsed = 0; elapsed < 1 && !s.done; elapsed += frameSize) {
      advanceRunner(s, queue, width, height, frameSize, () => {}, fixedRandom);
    }
    expect(getRunnerStats(s)).toEqual({ correct: 0, wrong: 1, bestCombo: 0, score: 0 });
  }
});

test("complete outcomes do not depend on animation frame frequency", () => {
  const queue = questions(20);
  for (const frameSize of [1 / 120, 1 / 60, 0.25, 100]) {
    const s = createRunnerState(queue, width, height, fixedRandom);
    s.targetLane = 0;
    let attempts = 0;
    while (!s.done) advanceRunner(s, queue, width, height, frameSize, () => { attempts += 1; }, fixedRandom);
    expect(attempts).toBe(20);
    expect(getRunnerStats(s)).toEqual({ correct: 20, wrong: 0, bestCombo: 20, score: 21_000 });
    expect(s.dist).toBeCloseTo(getGateSpeed(width, layout) * 60, 7);
  }
});

test("first question stays ahead of the player with at least three seconds on supported screens", () => {
  for (const [w, h] of [[320, 568], [390, 844], [844, 390], [640, 500], [1280, 900], [3840, 2160]] as const) {
    const s = createRunnerState(questions(1), w, h, fixedRandom);
    const layout = getGameLayout(w, h);
    expect((s.gates[0]!.x - getDecisionX(layout)) / getGateSpeed(w, layout)).toBeGreaterThanOrEqual(3 - 1e-10);
  }
});

test("checkpoint passing uses the complete quiz and an exact seventy-percent boundary", () => {
  for (const [correct, total, passed] of [[0, 0, false], [0, 10, false], [6, 10, false], [7, 10, true], [8, 12, false], [9, 12, true], [1, 12, false], [12, 12, true]] as const) {
    expect(checkpointPassed(correct, total)).toBe(passed);
  }
});

test("invalid elapsed time never changes game numbers", () => {
  const queue = questions(5);
  const s = createRunnerState(queue, width, height, fixedRandom);
  const before = JSON.stringify(s);
  for (const elapsed of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
    advanceRunner(s, queue, width, height, elapsed, () => { throw new Error("Unexpected answer"); }, fixedRandom);
    expect(JSON.stringify(s)).toBe(before);
  }
});

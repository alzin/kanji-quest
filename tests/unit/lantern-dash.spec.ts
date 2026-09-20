import { test, expect } from "@playwright/test";
import { normalizeSave } from "../../src/lib/srs";
import {
  answerTrail,
  createTrail,
  expeditionWords,
  trailSummary,
} from "../../src/lib/expedition";
import {
  completeLanternDash,
  dashQuestions,
  recordDashAnswer,
  type DashEvidence,
} from "../../src/components/game/forest/lantern-dash";
import {
  createRunnerState,
  getDecisionX,
  getGameLayout,
  getGateSpeed,
  resizeRunner,
} from "../../src/components/game/runner-math";

test("dash preserves vocabulary, alternating recognition, and adds evidence once before shrine recall", () => {
  const words = expeditionWords(normalizeSave({})),
    questions = dashQuestions(words);
  expect(questions.map((q) => q.vocab.w)).toEqual(words.map((q) => q.vocab.w));
  expect(questions.map((q) => q.type)).toEqual([
    "reading",
    "meaning",
    "reading",
    "meaning",
  ]);
  let trail = createTrail(words, "river");
  for (let i = 0; i < 8; i++) trail = answerTrail(trail, true);
  let evidence: DashEvidence = {};
  for (const q of questions) evidence = recordDashAnswer(evidence, q, true);
  trail = completeLanternDash(trail, questions, evidence);
  expect(trail.queue.slice(trail.index).map((q) => q.kind)).toEqual([
    "recall",
    "recall",
  ]);
  expect(completeLanternDash(trail, questions, evidence)).toBe(trail);
  while (trail.index < trail.queue.length) trail = answerTrail(trail, true);
  expect(trailSummary(trail)).toMatchObject({
    total: 14,
    earned: 42,
    correct: 14,
  });
  expect(trailSummary(trail).cards).toHaveLength(4);
});

test("a successful retry cannot erase misses or assistance, or consume a pending lantern recovery", () => {
  const words = expeditionWords(normalizeSave({})),
    questions = dashQuestions(words);
  let trail = createTrail(words, "river");
  for (let i = 0; i < 7; i++) trail = answerTrail(trail, true);
  trail = answerTrail(trail, false);
  let evidence: DashEvidence = {};
  questions.forEach((q, i) => {
    evidence = recordDashAnswer(evidence, q, i !== 0, i === 1);
  });
  questions.forEach((q) => {
    evidence = recordDashAnswer(evidence, q, true);
  });
  const pending = trail.queue.slice(trail.index).map((q) => q.id);
  trail = completeLanternDash(trail, questions, evidence);
  expect(trail.queue.slice(trail.index).map((q) => q.id)).toEqual(pending);
  expect(
    trail.answers
      .filter((a) => a.encounter.id.startsWith("dash-"))
      .map((a) => [a.correct, a.assisted]),
  ).toEqual([
    [false, false],
    [true, true],
    [true, false],
    [true, false],
  ]);
  while (trail.index < trail.queue.length) trail = answerTrail(trail, true);
  expect(trailSummary(trail).earned).toBe(33);
});

test("resizing from portrait to desktop and landscape preserves time to every pending gate", () => {
  const questions = dashQuestions(expeditionWords(normalizeSave({})));
  const state = createRunnerState(questions, 390, 844, () => 0.5);
  const seconds = (w: number, h: number) =>
    state.gates.map(
      (g) =>
        (g.x - getDecisionX(getGameLayout(w, h))) /
        getGateSpeed(w, getGameLayout(w, h)),
    );
  const original = seconds(390, 844);
  resizeRunner(state, 390, 844, 1440, 900);
  seconds(1440, 900).forEach((t, i) => expect(t).toBeCloseTo(original[i]!, 8));
  resizeRunner(state, 1440, 900, 844, 390);
  seconds(844, 390).forEach((t, i) => expect(t).toBeCloseTo(original[i]!, 8));
});

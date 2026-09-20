import { test, expect } from "@playwright/test";
import { allKanji, CURRICULUM_VERSION, LEVEL_CHAPTERS } from "../../src/data";
import { normalizeSave } from "../../src/lib/srs";
import { answerTrail, createTrail, expeditionWords, trailSummary } from "../../src/lib/expedition";

test("expeditions prioritize overdue words, cap at four, and respect curriculum locks", () => {
  const save = normalizeSave({ curriculumVersion: CURRICULUM_VERSION, selectedLevel: "N4", progress: {
    一: { mastery: 1, due: 10 }, 二: { mastery: 2, due: 1 }, 私: { mastery: 2, due: 0 },
  } });
  const words = expeditionWords(save, 100);
  expect(words).toHaveLength(4);
  expect(words.slice(0, 2).map((q) => q.kanji.c)).toEqual(["二", "一"]);
  expect(words.every((q) => LEVEL_CHAPTERS.N5.includes(q.kanji.ch))).toBe(true);
  expect(new Set(words.map((q) => q.kanji.c)).size).toBe(4);
});

test("paths reverse retrieval order and finish with typed recall of the same vocabulary", () => {
  const words = expeditionWords(normalizeSave({}));
  const river = createTrail(words, "river"), shrine = createTrail(words, "shrine");
  expect(river.queue.map((q) => q.kind)).toEqual(["meaning", "meaning", "meaning", "meaning", "reading", "reading", "reading", "reading", "recall", "recall"]);
  expect(shrine.queue[0]!.kind).toBe("reading");
  expect(river.queue[0]!.question.vocab).toEqual(river.queue[8]!.question.vocab);
});

test("mistakes return after two other encounters, are bounded, and never multiply rewards", () => {
  let state = createTrail(expeditionWords(normalizeSave({})), "river");
  const original = state;
  state = answerTrail(state, false);
  expect(original.queue).toHaveLength(10);
  expect(state.queue[3]!.id).toBe("0-0-retry");
  while (state.index < state.queue.length) state = answerTrail(state, true);
  const summary = trailSummary(state);
  expect(summary.earned).toBe(27);
  expect(summary.total).toBe(10);
  expect(summary.recovered).toBe(1);
  expect(summary.cards.find((c) => c.c === "一")!.correct).toBe(false);
  expect(answerTrail(state, true)).toBe(state);
  let failed = original;
  while (failed.index < failed.queue.length) failed = answerTrail(failed, false);
  expect(failed.queue).toHaveLength(20);
  expect(trailSummary(failed).earned).toBe(0);
});

test("charms affect light without giving assisted answers coins or production credit", () => {
  const words = expeditionWords(normalizeSave({}));
  let firefly = { ...createTrail(words, "river"), charm: "firefly" as const };
  const bright = answerTrail(firefly, true);
  expect(bright.light).toBe(3);
  let moss = { ...createTrail(words, "river"), charm: "moss" as const };
  expect(answerTrail(moss, true, true).light).toBe(3);
  let state = createTrail(words, "river");
  while (state.index < state.queue.length) state = answerTrail(state, true, true);
  expect(trailSummary(state).earned).toBe(0);
  expect(trailSummary(state).cards.every((c) => !c.correct && !c.produced)).toBe(true);
  expect(state.bestCombo).toBe(0);
});

test("when reviews are not due, free exploration uses learned words without crossing locks", () => {
  const save = normalizeSave({ curriculumVersion: CURRICULUM_VERSION, progress: Object.fromEntries(allKanji.filter((k) => k.ch === 1).map((k) => [k.c, { mastery: 1, due: 999999, correct: 1 }])) });
  expect(expeditionWords(save, 100)).toHaveLength(4);
  expect(expeditionWords(save, 100).every((q) => q.kanji.ch === 1)).toBe(true);
});

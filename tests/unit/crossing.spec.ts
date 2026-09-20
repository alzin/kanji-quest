import { test, expect } from "@playwright/test";
import { normalizeSave } from "../../src/lib/srs";
import {
  answerTrail,
  createTrail,
  expeditionWords,
  trailSummary,
} from "../../src/lib/expedition";
import {
  completeCrossing,
  recordCrossingRecall,
} from "../../src/components/game/forest/crossing";
import type { StackPlacement } from "../../src/components/game/stack-math";

test("crossing replaces reading encounters once and preserves pending lantern recovery and shrine recall", () => {
  const words = expeditionWords(normalizeSave({}));
  let state = createTrail(words, "river");
  for (let i = 0; i < 4; i++) state = answerTrail(state, i !== 3);
  expect(state.queue.slice(state.index).some((e) => e.retry)).toBe(true);
  const recalls = Object.fromEntries(
    words.map((q) => [q.kanji.c, { correct: true, assisted: false }]),
  );
  const crossed = completeCrossing(state, recalls);
  expect(
    crossed.answers.filter((a) => a.encounter.kind === "reading"),
  ).toHaveLength(4);
  expect(crossed.queue.slice(crossed.index).map((e) => e.kind)).toEqual([
    "meaning",
    "recall",
    "recall",
  ]);
  expect(completeCrossing(crossed, recalls)).toBe(crossed);
  let finished = crossed;
  while (finished.index < finished.queue.length)
    finished = answerTrail(finished, true);
  expect(trailSummary(finished)).toMatchObject({
    total: 10,
    earned: 27,
    recovered: 1,
  });
  expect(trailSummary(state).total).toBe(4);
});

test("missed and assisted crossing words never gain independent reward from retries", () => {
  const words = expeditionWords(normalizeSave({}));
  let state = createTrail(words, "river");
  for (let i = 0; i < 4; i++) state = answerTrail(state, true);
  const event = (correct: boolean, hinted: boolean) =>
    ({ word: { q: words[0]! }, correct, hinted }) as StackPlacement;
  let recalls = recordCrossingRecall({}, event(false, false));
  recalls = recordCrossingRecall(recalls, event(true, false));
  expect(recalls[words[0]!.kanji.c]).toEqual({
    correct: false,
    assisted: false,
  });
  recalls = recordCrossingRecall(recalls, event(true, true));
  expect(recalls[words[0]!.kanji.c]).toEqual({
    correct: false,
    assisted: true,
  });
  state = completeCrossing(state, recalls);
  while (state.index < state.queue.length) state = answerTrail(state, true);
  expect(trailSummary(state).earned).toBe(18);
  expect(trailSummary(state).total).toBe(10);
  expect(state.queue).toHaveLength(10);
});

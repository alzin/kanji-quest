import { expect, test } from "@playwright/test";
import { CURRICULUM_VERSION, LEVELS, LEVEL_CHAPTERS, kanjiOfChapter } from "../../src/data";
import { CHECKPOINT_STEPS, completedSteps, emptyCheckpointSteps, nextCheckpointStep, normalizeCheckpointSteps } from "../../src/lib/checkpoint-steps";
import { GATES_PER_ADVENTURE } from "../../src/lib/firefly-catalog";
import { createAdventureDeck, createAdventureLedger, createCheckpointDeck, finishAdventure, planGate, recordGate, type PlannedGate } from "../../src/lib/firefly-learning";
import { clearGate, completeCheckpointStep, getSnapshot, normalizeSave, reopenCheckpointStep, replaceSave, resetCheckpointSteps, setProgressPersistence, type SaveData } from "../../src/lib/srs";

test.describe.configure({ mode: "serial" });
test.afterEach(() => { setProgressPersistence(); });

const FIRST = LEVEL_CHAPTERS.N5[0]!, SECOND = LEVEL_CHAPTERS.N5[1]!;
const met = (due: number) => ({ mastery: 1 as const, ivl: 0.02, ease: 2.5, due, correct: 1, wrong: 0 });

test("step lists keep known regions in order, each within the step before it", () => {
  const regions = [FIRST, SECOND, 14];
  expect(normalizeCheckpointSteps(undefined, regions)).toEqual(emptyCheckpointSteps());
  expect(normalizeCheckpointSteps({ learned: [14, FIRST, FIRST, 9999, "13"], stacked: [FIRST, 14, SECOND], rescued: [SECOND, 14] }, regions))
    .toEqual({ learned: [FIRST, 14], stacked: [FIRST, 14], rescued: [14] });
  expect(normalizeSave({}).checkpointSteps).toEqual(emptyCheckpointSteps());
  expect(normalizeSave({ checkpointSteps: { learned: [FIRST], stacked: [FIRST], rescued: [] } }).checkpointSteps).toEqual({ learned: [FIRST], stacked: [FIRST], rescued: [] });
});

test("steps complete in order and only in open regions; a failed seal reopens the rescue and a stamped seal clears them", () => {
  replaceSave({});
  expect(nextCheckpointStep(getSnapshot(), FIRST)).toBe("learn");
  expect(completeCheckpointStep(FIRST, "stack")).toBe(false);
  expect(completeCheckpointStep(SECOND, "learn")).toBe(false);
  for (const [i, step] of CHECKPOINT_STEPS.entries()) {
    expect(completeCheckpointStep(FIRST, step.id)).toBe(true);
    expect(completedSteps(getSnapshot(), FIRST)).toBe(i + 1);
  }
  const done = getSnapshot();
  expect(completeCheckpointStep(FIRST, "learn")).toBe(true);
  expect(getSnapshot()).toBe(done);
  expect(nextCheckpointStep(getSnapshot(), FIRST)).toBe("seal");

  reopenCheckpointStep(FIRST, "rescue");
  expect(getSnapshot().checkpointSteps).toEqual({ learned: [FIRST], stacked: [FIRST], rescued: [] });
  expect(nextCheckpointStep(getSnapshot(), FIRST)).toBe("rescue");
  completeCheckpointStep(FIRST, "rescue");
  expect(clearGate(FIRST)).toBe(50);
  expect(getSnapshot().checkpointSteps).toEqual(emptyCheckpointSteps());

  // A repeat visit records its steps again; its seal starts them afresh.
  completeCheckpointStep(FIRST, "learn");
  expect(completedSteps(getSnapshot(), FIRST)).toBe(1);
  resetCheckpointSteps(FIRST);
  expect(completedSteps(getSnapshot(), FIRST)).toBe(0);

  // The seal opened the next region, and steps survive a stored round trip.
  expect(completeCheckpointStep(SECOND, "learn")).toBe(true);
  replaceSave(JSON.parse(JSON.stringify(getSnapshot())));
  expect(getSnapshot().checkpointSteps).toEqual({ learned: [SECOND], stacked: [], rescued: [] });
});

test("a checkpoint deck carries exactly its region: reviews first, unmet kanji introduced, the rest practice", () => {
  const region = kanjiOfChapter(FIRST);
  const save = normalizeSave({ progress: { [region[0]!.c]: met(8_000_000_000_000), [region[1]!.c]: met(5), [region[2]!.c]: met(2) } });
  const deck = createCheckpointDeck(save, FIRST, "relaxed", 9);
  expect(deck).toEqual(createCheckpointDeck(save, FIRST, "relaxed", 9));
  expect(deck).toMatchObject({ checkpoint: FIRST, level: "N5", difficulty: "relaxed" });
  expect(deck.cards.map((card) => card.kanji.c).sort()).toEqual(region.map((k) => k.c).sort());
  expect(deck.cards.slice(0, 2).map((card) => [card.kanji.c, card.origin])).toEqual([[region[2]!.c, "due"], [region[1]!.c, "due"]]);
  expect(deck.cards.find((card) => card.kanji.c === region[0]!.c)!.origin).toBe("practice");
  expect(deck.cards.filter((card) => card.origin === "fresh").map((card) => card.kanji.c).sort()).toEqual(region.slice(3).map((k) => k.c).sort());
});

test("on every road, a freshly stacked region's rescue asks only its own words and brings every one of them round", () => {
  for (const chapter of LEVELS.flatMap((level) => LEVEL_CHAPTERS[level])) {
    const region = kanjiOfChapter(chapter);
    replaceSave({ curriculumVersion: CURRICULUM_VERSION, unlockedChapters: [chapter], progress: Object.fromEntries(region.map((k) => [k.c, met(Date.now() + 1_800_000)])) });
    const ledger = createAdventureLedger(createCheckpointDeck(getSnapshot(), chapter, "standard", chapter));
    const gates: PlannedGate[] = [];
    for (let i = 0; i < GATES_PER_ADVENTURE; i++) {
      gates.push(planGate(ledger, i));
      recordGate(ledger, { gate: i, correct: true });
    }
    expect(gates.every((gate) => gate.kanji.ch === chapter && gate.mode !== "intro"), `region ${chapter}`).toBe(true);
    for (let i = 1; i < gates.length; i++) expect(gates[i]!.kanji.c, `region ${chapter} gate ${i}`).not.toBe(gates[i - 1]!.kanji.c);
    expect(new Set(gates.map((gate) => gate.vocab.w)), `region ${chapter}`).toEqual(new Set(region.flatMap((k) => k.vocab.map((v) => v.w))));
    // Just-stacked words are practice: the trail cannot fast-forward their schedules.
    expect(ledger.scheduledGraded, `region ${chapter}`).toBe(0);
  }
});

test("only a checkpoint adventure that reaches the shrine completes the rescue, in its single terminal write", () => {
  replaceSave({ checkpointSteps: { learned: [FIRST], stacked: [FIRST], rescued: [] } });
  const lost = createAdventureLedger(createCheckpointDeck(getSnapshot(), FIRST, "standard", 3));
  expect(finishAdventure(lost, { score: 120, rescued: [], delivered: false })).toMatchObject({ stepCompleted: false, delivered: false });
  expect(completedSteps(getSnapshot(), FIRST)).toBe(2);

  const writes: SaveData[] = [];
  setProgressPersistence((save) => writes.push(save));
  const delivered = createAdventureLedger(createCheckpointDeck(getSnapshot(), FIRST, "standard", 4));
  expect(finishAdventure(delivered, { score: 900, rescued: ["komorebi"], delivered: true })).toMatchObject({ stepCompleted: true, newSpirits: ["komorebi"] });
  expect(writes).toHaveLength(1);
  expect(writes[0]!.checkpointSteps).toEqual({ learned: [FIRST], stacked: [FIRST], rescued: [FIRST] });
  expect(getSnapshot().runsCompleted).toBe(2);

  // A region that was never stacked, or a free adventure, completes nothing.
  replaceSave({ checkpointSteps: { learned: [FIRST], stacked: [], rescued: [] } });
  expect(finishAdventure(createAdventureLedger(createCheckpointDeck(getSnapshot(), FIRST, "standard", 5)), { score: 0, rescued: [], delivered: true })).toMatchObject({ stepCompleted: false });
  expect(finishAdventure(createAdventureLedger(createAdventureDeck(getSnapshot(), "standard", 6)), { score: 0, rescued: [], delivered: true })).toMatchObject({ stepCompleted: false });
  expect(getSnapshot().checkpointSteps).toEqual({ learned: [FIRST], stacked: [], rescued: [] });
});

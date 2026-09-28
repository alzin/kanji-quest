import { expect, test } from "@playwright/test";
import { kanjiOfLevel } from "../../src/data";
import { adventureSummary, createAdventureDeck, createAdventureLedger, finishAdventure, isAdventureLedgerCurrent, planGate, recordGate, type AdventureLedger, type PlannedGate } from "../../src/lib/firefly-learning";
import { emptyRunner, hasRunnerProgress, normalizeRunner, runnerOf } from "../../src/lib/firefly-progress";
import { GATES_PER_ADVENTURE, SPIRITS } from "../../src/lib/firefly-catalog";
import { equipRunnerLantern, getSnapshot, grade, invalidateProgressSession, markRunnerTutorial, normalizeSave, replaceSave, setProgressPersistence, type SaveData } from "../../src/lib/srs";
import { correctReadings, wordSegments } from "../../src/lib/words";

test.describe.configure({ mode: "serial" });
const dueCard = () => ({ mastery: 1 as const, due: 0, ivl: 1, ease: 2.5, correct: 1, wrong: 0 });
function dueSave(count = 5): SaveData {
  return normalizeSave({ progress: Object.fromEntries(kanjiOfLevel("N5").slice(0, count).map((kanji) => [kanji.c, dueCard()])) });
}
const ledgerFor = (save: SaveData, seed = 11) => { replaceSave(save); return createAdventureLedger(createAdventureDeck(getSnapshot(), "standard", seed)); };
/** Gates arrive one at a time: each is planned after the previous answer is recorded. */
function play(ledger: AdventureLedger, count = GATES_PER_ADVENTURE, correct: (gate: PlannedGate) => boolean = () => true): PlannedGate[] {
  const gates: PlannedGate[] = [];
  for (let i = 0; i < count; i++) {
    const gate = planGate(ledger, i);
    gates.push(gate);
    recordGate(ledger, { gate: i, correct: correct(gate) });
  }
  return gates;
}
test.afterEach(() => { setProgressPersistence(); });

test("decks put due reviews first, scale new words to the review load and are reproducible", () => {
  const fresh = normalizeSave({});
  const deck = createAdventureDeck(fresh, "standard", 72, 100);
  expect(deck).toEqual(createAdventureDeck(fresh, "standard", 72, 100));
  expect(deck.cards.map((card) => card.origin)).toEqual(["fresh", "fresh", "fresh", "fresh"]);
  const busy = createAdventureDeck(dueSave(6), "standard", 2);
  expect(busy.cards.filter((card) => card.origin === "due")).toHaveLength(5);
  expect(busy.cards.filter((card) => card.origin === "fresh")).toHaveLength(1);
  expect(busy.cards.filter((card) => card.origin === "practice")).toHaveLength(1);
  const allKnown = normalizeSave({ progress: Object.fromEntries(kanjiOfLevel("N5").map((kanji) => [kanji.c, { ...dueCard(), due: Date.now() + 86_400_000, mastery: 3 }])) });
  const practice = createAdventureDeck(allKnown, "standard", 3);
  expect(practice.cards.every((card) => card.origin === "practice")).toBe(true);
  expect(practice.cards.length).toBeLessThanOrEqual(6);
});

test("a first adventure introduces each new word, then brings it back spaced and both ways round", () => {
  const ledger = ledgerFor({});
  const gates = play(ledger);
  expect(gates).toHaveLength(GATES_PER_ADVENTURE);
  expect(gates[0]!.mode).toBe("intro");
  expect(gates[0]!.slow).toBe(true);
  for (let i = 1; i < gates.length; i++) expect(gates[i]!.kanji.c, `gate ${i}`).not.toBe(gates[i - 1]!.kanji.c);
  const fresh = ledger.deck.cards.map((card) => card.kanji.c);
  expect(fresh).toHaveLength(4);
  for (const kanji of fresh) {
    const mine = gates.filter((gate) => gate.kanji.c === kanji);
    expect(mine.filter((gate) => gate.mode === "intro"), kanji).toHaveLength(1);
    expect(mine[0]!.mode).toBe("intro");
    const asks = mine.slice(1);
    expect(asks.length, kanji).toBeGreaterThanOrEqual(3);
    expect(asks[0]!.mode).toBe("reading");
    expect(asks[0]!.slow).toBe(true);
    expect(asks[0]!.index - mine[0]!.index).toBeGreaterThanOrEqual(2);
    expect(asks.every((gate) => gate.vocab.w === mine[0]!.vocab.w)).toBe(true);
  }
  expect(gates.some((gate) => gate.mode === "listen")).toBe(true);
  for (const gate of gates) {
    if (gate.mode === "intro") { expect(new Set(gate.labels)).toEqual(new Set([gate.vocab.w])); continue; }
    const right = gate.mode === "reading" ? gate.kana : gate.vocab.w;
    expect(new Set(gate.labels).size).toBe(3);
    expect(gate.labels[gate.answer]).toBe(right);
    if (gate.mode === "listen") {
      expect(wordSegments(gate.vocab, gate.kanji).some((segment) => segment.furigana)).toBe(false);
      for (const label of gate.labels) if (label !== right) expect(correctReadings(label).has(gate.kana)).toBe(false);
    }
  }
});

test("a missed word returns soon in the same kind, and the next gate lets its correction be heard", () => {
  const ledger = ledgerFor({});
  let missed: PlannedGate | undefined;
  const gates = play(ledger, GATES_PER_ADVENTURE, (gate) => {
    if (missed || gate.mode !== "listen") return true;
    missed = gate;
    return false;
  });
  expect(missed).toBeDefined();
  const at = missed!.index;
  expect(gates[at + 1]!.mode).not.toBe("listen");
  const retry = gates.slice(at + 1).find((gate) => gate.kanji.c === missed!.kanji.c)!;
  expect(retry.index - at).toBeGreaterThanOrEqual(2);
  expect(retry.index - at).toBeLessThanOrEqual(3);
  expect(retry.mode).toBe("listen");
  expect(retry.vocab.w).toBe(missed!.vocab.w);
  expect(ledger.cards.get(missed!.kanji.c)!.asks).toBeGreaterThanOrEqual(2);
  expect(getSnapshot().progress[missed!.kanji.c]!.wrong).toBe(0);
});

test("new words grade once, on a reading recall at least three gates after their introduction", () => {
  const ledger = ledgerFor({});
  const gates = play(ledger);
  const graded = ledger.recalls.filter((event) => event.graded);
  expect(graded).toHaveLength(4);
  for (const event of graded) {
    const intro = gates.find((gate) => gate.kanji.c === event.kanji && gate.mode === "intro")!;
    expect(event.gate - intro.index).toBeGreaterThanOrEqual(3);
    expect(gates[event.gate]!.mode).toBe("reading");
    expect(getSnapshot().progress[event.kanji]).toMatchObject({ mastery: 1, correct: 1, wrong: 0 });
  }
  expect(ledger.recalls.filter((event) => event.kanji === graded[0]!.kanji && event.graded)).toHaveLength(1);
  expect(Object.keys(getSnapshot().progress).sort()).toEqual(graded.map((event) => event.kanji).sort());
});

test("due words grade on their first ask, wrong answers grade once and practice never grades", () => {
  const save = dueSave(5);
  for (const kanji of kanjiOfLevel("N5").slice(5, 8)) save.progress[kanji.c] = { ...dueCard(), due: Date.now() + 86_400_000 };
  const ledger = ledgerFor(save);
  const first = ledger.deck.cards[0]!.kanji.c;
  const before = getSnapshot().progress;
  const gates = play(ledger, GATES_PER_ADVENTURE, (gate) => gate.index !== 0);
  expect(gates.slice(0, 5).every((gate) => gate.mode === "reading" && ledger.cards.get(gate.kanji.c)!.origin === "due")).toBe(true);
  expect(getSnapshot().progress[first]!.wrong).toBe(1);
  expect(ledger.recalls.filter((event) => event.kanji === first && event.graded)).toHaveLength(1);
  expect(ledger.recalls.filter((event) => event.origin === "practice").every((event) => !event.graded)).toBe(true);
  expect(ledger.recalls.some((event) => event.origin === "practice")).toBe(true);
  for (const kanji of kanjiOfLevel("N5").slice(5, 8)) expect(getSnapshot().progress[kanji.c]).toEqual(before[kanji.c]);
  expect(ledger.scheduledGraded).toBe(5);
  expect(ledger.scheduledCorrect).toBe(4);
  expect(ledger.attempted.has(ledger.deck.cards.find((card) => card.origin === "fresh")!.kanji.c)).toBe(true);
});

test("eligibility is rechecked when answering, so a card reviewed elsewhere cannot be punished", () => {
  const ledger = ledgerFor(dueSave());
  const gate = planGate(ledger, 0);
  grade(gate.kanji.c, true);
  const snapshot = getSnapshot();
  expect(recordGate(ledger, { gate: 0, correct: false })).toBe(false);
  expect(recordGate(ledger, { gate: 0, correct: false })).toBe(false);
  expect(getSnapshot()).toBe(snapshot);
});

test("account changes and replacement snapshots invalidate learning and terminal writes", () => {
  for (const invalidate of [() => invalidateProgressSession(), () => replaceSave({ coins: 50 })]) {
    const ledger = ledgerFor(dueSave());
    planGate(ledger, 0);
    invalidate();
    const after = getSnapshot();
    expect(isAdventureLedgerCurrent(ledger)).toBe(false);
    expect(recordGate(ledger, { gate: 0, correct: true })).toBe(false);
    expect(finishAdventure(ledger, { score: 3000, rescued: ["komorebi"], delivered: true })).toBeNull();
    expect(getSnapshot()).toBe(after);
  }
});

test("terminal rewards commit once, atomically, with ten mon cap and immutable separate records", () => {
  const ledger = ledgerFor(dueSave());
  play(ledger, 7);
  expect(getSnapshot().coins).toBe(0);
  const before = getSnapshot(), writes: SaveData[] = [];
  setProgressPersistence((save) => writes.push(save));
  const result = { score: 4600, rescued: ["komorebi", "take", "kohaku"] as const, delivered: true };
  expect(finishAdventure(ledger, { ...result, rescued: [...result.rescued] })).toMatchObject({
    earned: 10, newSpirits: [...result.rescued], best: 4600, previousBest: 0,
    arcadeScore: 4600, delivered: true, deliveredSpiritIds: [...result.rescued],
    learning: { introductions: 1, recallTotal: 6, recallCorrect: 6, scheduledGraded: 5, scheduledCorrect: 5 },
  });
  expect(writes).toHaveLength(1);
  expect(getSnapshot()).toMatchObject({ coins: 10, runsCompleted: 1, streak: { count: 1 } });
  expect(runnerOf(getSnapshot()).best).toEqual({ N5: { standard: 4600, relaxed: 0 }, N4: { standard: 0, relaxed: 0 }, N3: { standard: 0, relaxed: 0 } });
  expect(runnerOf(before)).toEqual(emptyRunner());
  expect(finishAdventure(ledger, { ...result, rescued: [...result.rescued] })).toBeNull();
  expect(writes).toHaveLength(1);
  expect(recordGate(ledger, { gate: 7, correct: true })).toBe(false);
});

test("lost attempts retain recalls, mon and personal best but no collection; abandoned recalls remain", () => {
  const abandoned = ledgerFor(dueSave(), 1);
  play(abandoned, 1);
  expect(getSnapshot().runsCompleted).toBe(0);
  expect(getSnapshot().coins).toBe(0);
  const first = abandoned.gates.get(0)!.kanji.c, recall = getSnapshot().progress[first];
  const ledger = createAdventureLedger(createAdventureDeck(getSnapshot(), "relaxed", 2));
  play(ledger, 1);
  expect(finishAdventure(ledger, { score: 650, rescued: ["komorebi"], delivered: false })).toMatchObject({ earned: 2, newSpirits: [], best: 650, previousBest: 0, arcadeScore: 650, delivered: false, deliveredSpiritIds: [] });
  expect(runnerOf(getSnapshot()).rescued).toEqual([]);
  expect(getSnapshot().progress[first]).toEqual(recall);
  expect(runnerOf(getSnapshot()).best.N5).toEqual({ standard: 0, relaxed: 650 });
});

test("the results summary lists only the words met, with every attempt in order", () => {
  const ledger = ledgerFor({});
  const gates = play(ledger, 6, (gate) => gate.index !== 3);
  planGate(ledger, 6);
  const summary = adventureSummary(ledger);
  expect(summary.map((word) => word.word)).toEqual([...new Set(gates.map((gate) => gate.vocab.w))]);
  expect(summary.reduce((n, word) => n + word.attempts.length, 0)).toBe(gates.filter((gate) => gate.mode !== "intro").length);
  expect(summary.find((word) => word.word === gates[3]!.vocab.w)!.attempts).toContain(false);
  expect(summary.every((word) => word.introduced)).toBe(true);
  expect(finishAdventure(ledger, { score: 100, rescued: [], delivered: false })!.summary).toEqual(summary);
});

test("runner save normalization, cosmetic milestones, tutorial and reload preserve valid progress", () => {
  expect(normalizeSave({}).runner).toEqual(emptyRunner());
  expect(normalizeRunner({ best: { N5: { standard: Infinity, relaxed: -4 } }, rescued: ["invalid", "take", "take"], equippedLantern: "rose", tutorialSeen: "yes" })).toEqual({ ...emptyRunner(), rescued: ["take"] });
  replaceSave({});
  expect(hasRunnerProgress(getSnapshot())).toBe(false);
  expect(equipRunnerLantern("jade")).toBe(false);
  markRunnerTutorial();
  expect(hasRunnerProgress(getSnapshot())).toBe(true);
  for (const [count, lantern] of [[3, "jade"], [6, "azure"], [9, "rose"]] as const) {
    replaceSave({ runner: { ...emptyRunner(), rescued: SPIRITS.slice(0, count).map((spirit) => spirit.id) } });
    expect(equipRunnerLantern(lantern)).toBe(true);
    const stored = JSON.stringify(getSnapshot());
    replaceSave(JSON.parse(stored));
    expect(runnerOf(getSnapshot()).equippedLantern).toBe(lantern);
    expect(runnerOf(getSnapshot()).rescued).toHaveLength(count);
  }
});

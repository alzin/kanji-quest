import { expect, test } from "@playwright/test";
import { allKanji, CURRICULUM_VERSION, LEVELS, LEVEL_CHAPTERS, kanjiOfLevel, kanjiOfChapter, levelOfChapter } from "../../src/data";
import { buildGateQuiz, buildRunQueue, buildStackQueue, isChapterUnlocked, isLevelUnlocked, learningLevel, levelMasteryPct, normalizeSave } from "../../src/lib/srs";
import { correctReadings, readingChoices, vocabKana, wordSegments } from "../../src/lib/words";
import { expeditionWords } from "../../src/lib/expedition";
import { createAdventureDeck } from "../../src/lib/firefly-learning";
import { copyRunner, normalizeRunner } from "../../src/lib/firefly-progress";

test("N2 contains 355 distinct dictionary-backed cards across 71 stable regions", () => {
  const cards = kanjiOfLevel("N2");
  expect(cards).toHaveLength(355);
  expect(LEVEL_CHAPTERS.N2).toEqual(Array.from({ length: 71 }, (_, i) => 126 + i));
  expect(new Set(allKanji.map((k) => k.c)).size).toBe(allKanji.length);
  expect(cards.flatMap((k) => k.vocab)).toHaveLength(1065);
  for (const k of cards) {
    expect(levelOfChapter(k.ch)).toBe("N2");
    expect(k.mn.length).toBeGreaterThan(20);
    expect(k.rad).toBeTruthy();
    expect(k.strokes).toBeGreaterThan(0);
    expect(k.on !== "—" || k.kun !== "—").toBe(true);
    expect(new Set(k.vocab.map((v) => v.w)).size).toBe(3);
    for (const vocab of k.vocab) {
      expect(vocab.w).toContain(k.c);
      expect(vocab.f.map((f) => f.t).join("")).toBe(vocab.w);
      const kana = vocabKana(vocab);
      expect(kana).toMatch(/^[ぁ-ゖ]+$/);
      expect(vocab.r).toMatch(/^[a-z']+$/);
      expect(vocab.m).toBeTruthy();
      expect(wordSegments(vocab, k).some((span) => span.focus)).toBe(true);
      const choices = readingChoices({ kanji: k, vocab, kana }, () => 0.4);
      expect(choices).toHaveLength(2);
      expect(choices.filter((r) => correctReadings(vocab.w).has(r))).toEqual([]);
    }
  }
  for (const ch of LEVEL_CHAPTERS.N2) {
    expect(new Set(buildGateQuiz(ch).map((q) => q.kanji.c))).toEqual(new Set(kanjiOfChapter(ch).map((k) => k.c)));
  }
});

for (const level of LEVELS) {
  test(`a fresh learner can start ${level} in every learning queue without earlier seals`, () => {
    const save = normalizeSave({ curriculumVersion: CURRICULUM_VERSION, selectedLevel: level });
    expect(isLevelUnlocked(save, level)).toBe(true);
    expect(learningLevel(save)).toBe(level);
    expect(isChapterUnlocked(save, LEVEL_CHAPTERS[level][0]!)).toBe(true);
    expect(isChapterUnlocked(save, LEVEL_CHAPTERS[level][1]!)).toBe(false);
    for (const queue of [buildRunQueue(save), buildStackQueue(save), expeditionWords(save)]) {
      expect(queue.length).toBeGreaterThan(0);
      expect(queue.every((q) => levelOfChapter(q.kanji.ch) === level)).toBe(true);
    }
    const deck = createAdventureDeck(save, "standard", 1, 100);
    expect(deck.level).toBe(level);
    expect(deck.cards.length).toBeGreaterThan(0);
    expect(save.clearedChapters).toEqual([]);
    expect(save.coins).toBe(0);
  });
}

test("N2 progress and records survive reload without changing earlier levels", () => {
  const save = normalizeSave({ curriculumVersion: CURRICULUM_VERSION, selectedLevel: "N2",
    clearedChapters: [126], unlockedChapters: [127], coins: 50,
    progress: { 幼: { mastery: 2, due: 1234, ivl: 1, ease: 2.5, correct: 4, wrong: 1 } },
    runner: { best: { N5: { standard: 300, relaxed: 500 }, N2: { standard: 1000, relaxed: 2000 } } },
  });
  expect(normalizeSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
  expect(save.selectedLevel).toBe("N2");
  expect(save.progress["幼"]?.due).toBe(1234);
  for (const k of kanjiOfLevel("N2")) save.progress[k.c] = { mastery: 3, due: 1234, ivl: 30, ease: 2.5, correct: 5, wrong: 0 };
  expect(levelMasteryPct(save, "N2")).toBe(100);
  for (const level of ["N5", "N4", "N3"] as const) expect(levelMasteryPct(save, level)).toBe(0);
  const copied = copyRunner(save);
  copied.best.N2.standard = 0;
  expect(save.runner!.best.N2.standard).toBe(1000);
  expect(normalizeRunner({ best: { N3: { standard: 600, relaxed: 700 } } }).best).toMatchObject({
    N3: { standard: 600, relaxed: 700 }, N2: { standard: 0, relaxed: 0 },
  });
  expect(normalizeSave({ gatesCleared: 999 }).clearedChapters.every((ch) => ch < 126)).toBe(true);
});

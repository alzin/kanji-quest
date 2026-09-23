import { expect, test } from "@playwright/test";
import { allKanji, CURRICULUM_VERSION, LEVEL_CHAPTERS, kanjiOfLevel, kanjiOfChapter, levelOfChapter } from "../../src/data";
import { buildGateQuiz, buildRunQueue, isChapterUnlocked, isLevelCleared, isLevelUnlocked, learningLevel, levelMasteryPct, newKanji, normalizeSave } from "../../src/lib/srs";
import { correctReadings, readingChoices, vocabKana, wordSegments } from "../../src/lib/words";

const foundation = [...LEVEL_CHAPTERS.N5, ...LEVEL_CHAPTERS.N4];
const progress = (mastery: 1 | 2 | 3, due = 0) => ({ mastery, due, ivl: 1, ease: 2.5, correct: 3, wrong: 0 });
const unlocked = () => normalizeSave({ curriculumVersion: CURRICULUM_VERSION, selectedLevel: "N3", clearedChapters: foundation });

test("N3 adds complete, distinct cards in small regions with usable word readings", () => {
  const cards = kanjiOfLevel("N3");
  expect(cards).toHaveLength(341);
  expect(LEVEL_CHAPTERS.N3).toHaveLength(70);
  expect(new Set(allKanji.map((k) => k.c)).size).toBe(allKanji.length);
  expect(cards.flatMap((k) => k.vocab)).toHaveLength(1022);
  for (const k of cards) {
    expect(levelOfChapter(k.ch)).toBe("N3");
    expect(k.mn.length).toBeGreaterThan(20);
    expect(k.rad).toBeTruthy();
    expect(k.strokes).toBeGreaterThan(0);
    expect(k.on !== "—" || k.kun !== "—").toBe(true);
    expect(k.vocab.length).toBeGreaterThanOrEqual(2);
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
});

test("N3 needs every foundation seal; a preview falls back to the highest unlocked road", () => {
  const save = normalizeSave({ curriculumVersion: CURRICULUM_VERSION, selectedLevel: "N3" });
  expect(save.selectedLevel).toBe("N3");
  expect(learningLevel(save)).toBe("N5");
  expect(isLevelUnlocked(save, "N3")).toBe(false);
  save.clearedChapters = [...LEVEL_CHAPTERS.N5];
  expect(learningLevel(save)).toBe("N4");
  save.clearedChapters.push(...LEVEL_CHAPTERS.N4.slice(0, -1));
  expect(isLevelUnlocked(save, "N3")).toBe(false);
  expect(isChapterUnlocked(save, 56)).toBe(false);
  save.clearedChapters.push(LEVEL_CHAPTERS.N4.at(-1)!);
  expect(isLevelUnlocked(save, "N3")).toBe(true);
  expect(learningLevel(save)).toBe("N3");
  expect(isChapterUnlocked(save, 56)).toBe(true);
  expect(isChapterUnlocked(save, 57)).toBe(false);
  save.clearedChapters = [...LEVEL_CHAPTERS.N4];
  expect(isLevelUnlocked(save, "N3")).toBe(false);
});

test("N3 seals and mastery progress independently, with retained access and idempotent saves", () => {
  const save = unlocked();
  const first = kanjiOfChapter(56);
  first.forEach((k, i) => { save.progress[k.c] = progress(i < 2 ? 3 : 1); });
  expect(isChapterUnlocked(save, 57)).toBe(true); // 9/15 points >= 55%.
  const retained = normalizeSave(save);
  first.forEach((k) => { retained.progress[k.c] = progress(1); });
  expect(isChapterUnlocked(retained, 57)).toBe(true);
  expect(levelMasteryPct(save, "N4")).toBe(0);
  save.clearedChapters.push(...LEVEL_CHAPTERS.N3.slice(0, -1));
  expect(isLevelCleared(save, "N3")).toBe(false);
  save.clearedChapters.push(LEVEL_CHAPTERS.N3.at(-1)!);
  expect(isLevelCleared(save, "N3")).toBe(true);
  const reloaded = normalizeSave(save);
  expect(normalizeSave(reloaded)).toEqual(reloaded);
  expect(reloaded.selectedLevel).toBe("N3");
  expect(reloaded.clearedChapters).toContain(125);
  expect(normalizeSave({ gatesCleared: 999 }).clearedChapters).not.toContain(56);
});

test("N3 daily lessons retain due N5/N4 reviews and gates cover their own region", () => {
  const save = unlocked();
  save.progress["一"] = progress(2, 1);
  save.progress["本"] = progress(2, 2);
  save.progress["君"] = progress(2, 3); // Region 57 remains locked.
  const queue = buildRunQueue(save, 100);
  expect(queue.some((q) => q.kanji.c === "一")).toBe(true);
  expect(queue.some((q) => q.kanji.c === "本")).toBe(true);
  expect(queue.some((q) => q.kanji.c === "君")).toBe(false);
  expect(newKanji(save).every((k) => k.ch === 56)).toBe(true);
  for (const ch of LEVEL_CHAPTERS.N3) {
    expect(new Set(buildGateQuiz(ch).map((q) => q.kanji.c))).toEqual(new Set(kanjiOfChapter(ch).map((k) => k.c)));
  }
  expect(correctReadings("昨日").has("きのう")).toBe(true);
  expect(correctReadings("昨日").has("さくじつ")).toBe(true);
});

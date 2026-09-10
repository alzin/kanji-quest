import { expect, test } from "@playwright/test";
import { allKanji, CHAPTER_COUNT, CHAPTER_NAMES, CURRICULUM_VERSION, kanjiByChar, kanjiOfChapter, kanjiOfLevel, LEVEL_CHAPTERS, levelOfChapter } from "../../src/data";
import { allKanji as n5Kanji } from "../../src/data/n5";
import { buildGateQuiz, buildRunQueue, chapterMasteryPct, dueCount, isChapterUnlocked, isLevelCleared, isLevelUnlocked, learningLevel, levelMasteryPct, newKanji, normalizeSave, type CardProgress } from "../../src/lib/srs";
import { correctReadings, meaningChoices, vocabKana } from "../../src/lib/words";

const NOW = 1_800_000_000_000;
const card = (mastery: CardProgress["mastery"], due = NOW + 86_400_000): CardProgress => ({ mastery, due, ivl: 30, ease: 2.5, correct: 4, wrong: 1 });
const unlocked = () => normalizeSave({ curriculumVersion: CURRICULUM_VERSION, selectedLevel: "N4", clearedChapters: LEVEL_CHAPTERS.N5 });

test("N4 adds complete, unique cards while preserving every N5 identity", () => {
  expect(kanjiOfLevel("N5")).toBe(n5Kanji);
  expect(n5Kanji).toHaveLength(96);
  expect(kanjiOfLevel("N4")).toHaveLength(189);
  expect(allKanji).toHaveLength(285);
  expect(kanjiByChar.size).toBe(285);
  expect(CHAPTER_COUNT).toBe(55);
  for (const ch of LEVEL_CHAPTERS.N4) {
    expect(levelOfChapter(ch)).toBe("N4");
    expect(CHAPTER_NAMES[ch]?.name).toBeTruthy();
    expect(kanjiOfChapter(ch).length).toBeGreaterThanOrEqual(4);
    expect(kanjiOfChapter(ch).length).toBeLessThanOrEqual(6);
    const quiz = buildGateQuiz(ch);
    expect(quiz).toHaveLength(kanjiOfChapter(ch).length);
    expect(new Set(quiz.map((q) => q.kanji.c)).size).toBe(quiz.length);
    expect(quiz.every((q) => q.kanji.ch === ch)).toBe(true);
  }
  for (const k of kanjiOfLevel("N4")) {
    expect([...k.c]).toHaveLength(1);
    expect(k.strokes, k.c).toBeGreaterThan(0);
    expect(k.rad.trim(), k.c).toBeTruthy();
    expect(k.mn.length, k.c).toBeGreaterThan(20);
    expect(k.vocab, k.c).toHaveLength(2);
    for (const word of k.vocab) {
      expect(word.w, k.c).toContain(k.c);
      expect(word.f.map((span) => span.t).join(""), k.c).toBe(word.w);
      expect(vocabKana(word), word.w).toMatch(/^[ぁ-ゖ]+$/);
      expect(word.r, word.w).toMatch(/^[a-z]+$/);
      expect(word.m.trim(), word.w).toBeTruthy();
    }
  }
});

test("legacy saves preserve totals and can never grant N4 seals implicitly", () => {
  const legacy = normalizeSave({ gatesCleared: 999, coins: 42, runsCompleted: 8, progress: { 一: card(3), 私: card(2) } });
  expect(legacy.clearedChapters).toEqual([...LEVEL_CHAPTERS.N5].sort((a, b) => a - b));
  expect(legacy.selectedLevel).toBe("N5");
  expect(legacy.coins).toBe(42);
  expect(legacy.runsCompleted).toBe(8);
  expect(legacy.progress["一"]).toEqual(card(3));
  expect(legacy.progress["私"]).toEqual(card(2));
  const current = normalizeSave({ ...legacy, selectedLevel: "N4", clearedChapters: [12, 7, 7, ...LEVEL_CHAPTERS.N5, 13] });
  expect(current.clearedChapters).toEqual([...new Set([7, 12, ...LEVEL_CHAPTERS.N5])].sort((a, b) => a - b));
  expect(current.gatesCleared).toBe(21);
  expect(normalizeSave(current)).toEqual(current);
  expect(normalizeSave({ selectedLevel: "N3" }).selectedLevel).toBe("N5");
});

test("N4 opens only after every N5 seal, then uses road order and the unrounded threshold", () => {
  const locked = normalizeSave({ selectedLevel: "N4", clearedChapters: [1, 2, 3, 4, 6, 7] });
  for (const k of allKanji) locked.progress[k.c] = card(3);
  expect(isLevelUnlocked(locked, "N4")).toBe(false);
  expect(isChapterUnlocked(locked, 7)).toBe(false);
  expect(isChapterUnlocked(locked, 8)).toBe(false);
  expect(learningLevel(locked)).toBe("N5");
  const save = unlocked();
  expect(isLevelCleared(save, "N5")).toBe(true);
  expect(isLevelCleared(save, "N4")).toBe(false);
  expect(isChapterUnlocked(save, 7)).toBe(true);
  expect(isChapterUnlocked(save, 8)).toBe(false);
  const region = kanjiOfChapter(7);
  const second = LEVEL_CHAPTERS.N4[1]!;
  const minimum = Math.ceil(region.length * 3 * 0.55);
  for (let points = 0; points < minimum; points++) {
    const k = region[Math.floor(points / 3)]!;
    save.progress[k.c] = card(((points % 3) + 1) as CardProgress["mastery"]);
    expect(isChapterUnlocked(save, second)).toBe(points + 1 >= minimum);
  }
  expect(chapterMasteryPct(save, 7)).toBeGreaterThanOrEqual(55);
});

test("level progress and completion have independent denominators", () => {
  const save = unlocked();
  for (const k of n5Kanji) save.progress[k.c] = card(3);
  expect(levelMasteryPct(save, "N5")).toBe(100);
  expect(levelMasteryPct(save, "N4")).toBe(0);
  for (const k of kanjiOfLevel("N4")) save.progress[k.c] = card(3);
  expect(levelMasteryPct(save, "N4")).toBe(100);
  save.progress["私"] = card(2);
  expect(levelMasteryPct(save, "N4")).toBe(99);
  expect(levelMasteryPct(save, "N5")).toBe(100);
  save.clearedChapters.push(...LEVEL_CHAPTERS.N4.slice(0, -1));
  expect(isLevelCleared(save, "N4")).toBe(false);
  save.clearedChapters.push(LEVEL_CHAPTERS.N4.at(-1)!);
  expect(isLevelCleared(save, "N4")).toBe(true);
});

test("N4 queues retain N5 reviews and select new cards only from the current unlocked road", () => {
  const save = unlocked();
  save.progress["一"] = card(3, NOW - 2_000);
  save.progress["私"] = card(2, NOW - 1_000);
  save.progress["字"] = card(2, NOW - 3_000); // Later N4 region is still locked.
  expect(dueCount(save, NOW)).toBe(2);
  const queue = buildRunQueue(save, NOW);
  expect(queue).toHaveLength(7);
  expect(queue.map((q) => q.kanji.c)).toEqual(expect.arrayContaining(["一", "私"]));
  expect(queue.some((q) => q.kanji.c === "字")).toBe(false);
  expect(newKanji(save)).toHaveLength(5);
  expect(newKanji(save).every((k) => k.ch === 7 && !save.progress[k.c])).toBe(true);
  save.selectedLevel = "N5";
  expect(newKanji(save).every((k) => levelOfChapter(k.ch) === "N5")).toBe(true);
  expect(buildRunQueue(save, NOW).some((q) => q.kanji.c === "私")).toBe(true);
  save.selectedLevel = "N4";
  save.clearedChapters = [];
  expect(newKanji(save).every((k) => k.ch === 1)).toBe(true);
  expect(buildRunQueue(save, NOW).every((q) => levelOfChapter(q.kanji.ch) === "N5")).toBe(true);
});

test("N4 homographs and irregular words retain accepted readings", () => {
  for (const [word, reading] of [["日本", "にっぽん"], ["開く", "あく"], ["悪口", "わるぐち"], ["私", "わたくし"], ["工場", "こうば"], ["空", "から"], ["魚", "うお"], ["門", "かど"], ["夕飯", "ゆうめし"], ["家", "うち"]]) {
    expect(correctReadings(word!).has(reading!), word).toBe(true);
  }
  const words = kanjiOfLevel("N4").flatMap((k) => k.vocab);
  for (const [word, reading] of [["発音", "はつおん"], ["南口", "みなみぐち"], ["悪口", "わるくち"], ["田舎", "いなか"], ["お土産", "おみやげ"]]) {
    expect(words.filter((v) => v.w === word).map(vocabKana), word).toContain(reading);
  }
});

test("N4 meaning distractors exclude overlapping glosses and verb forms", () => {
  const keys = (value: string) => value.toLowerCase().split(/[.;]/).map((part) => part.trim().replace(/^(?:to|the|an?) /, ""));
  for (const character of ["問", "答", "勉", "歩"]) {
    const kanji = kanjiByChar.get(character)!;
    for (const vocab of kanji.vocab) {
      const own = keys(vocab.m);
      // Request the entire distractor pool, so rare random choices are checked too.
      const choices = meaningChoices({ kanji, vocab, kana: vocabKana(vocab) }, () => 0.5, 1_000);
      expect(choices.length).toBeGreaterThan(2);
      for (const choice of choices) expect(keys(choice).some((key) => own.includes(key)), `${vocab.w}: ${choice}`).toBe(false);
    }
  }
});

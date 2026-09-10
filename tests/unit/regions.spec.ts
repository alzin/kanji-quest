import { expect, test } from "@playwright/test";
import { allKanji, CURRICULUM_VERSION, LEVEL_CHAPTERS, REGIONS, kanjiByChar, kanjiOfChapter, nextChapter } from "../../src/data";
import { wordSegments } from "../../src/lib/words";
import { chaptersA } from "../../src/data/n5/chaptersA";
import { chaptersB } from "../../src/data/n5/chaptersB";
import { buildGateQuiz, buildRunQueue, isChapterUnlocked, isLevelCleared, isLevelUnlocked, newKanji, normalizeSave } from "../../src/lib/srs";

const progress = (mastery: 1 | 2 | 3, due = 0) => ({ mastery, due, ivl: 1, ease: 2.5, correct: 3, wrong: 0 });
const freshSave = () => normalizeSave({ curriculumVersion: CURRICULUM_VERSION });

test("both roads cover the same curriculum in unique, complete sets of 4–6 kanji", () => {
  expect(LEVEL_CHAPTERS.N5).toHaveLength(19);
  expect(LEVEL_CHAPTERS.N4).toHaveLength(36);
  expect(new Set(REGIONS.map((r) => r.id)).size).toBe(55);
  expect(REGIONS.flatMap((r) => [...r.chars])).toHaveLength(285);
  expect(new Set(REGIONS.flatMap((r) => [...r.chars])).size).toBe(285);
  for (const region of REGIONS) {
    expect(region.chars.length).toBeGreaterThanOrEqual(4);
    expect(region.chars.length).toBeLessThanOrEqual(6);
    expect(kanjiOfChapter(region.id).map((k) => k.c).join("")).toBe(region.chars);
    expect(new Set(buildGateQuiz(region.id).map((q) => q.kanji.c))).toEqual(new Set(region.chars));
  }
  for (const original of [...chaptersA, ...chaptersB]) {
    const current = allKanji.find((k) => k.c === original.c)!;
    expect({ ...current, ch: original.ch }).toEqual(original);
  }
});

test("each seal immediately opens the next short region, including nonconsecutive IDs", () => {
  const save = freshSave();
  for (const level of ["N5", "N4"] as const) {
    for (const [index, ch] of LEVEL_CHAPTERS[level].entries()) {
      expect(isChapterUnlocked(save, ch)).toBe(true);
      const next = nextChapter(ch);
      expect(next).toBe(LEVEL_CHAPTERS[level][index + 1]);
      if (next !== undefined) expect(isChapterUnlocked(save, next)).toBe(false);
      save.clearedChapters.push(ch);
      if (next !== undefined) expect(isChapterUnlocked(save, next)).toBe(true);
    }
    expect(isLevelCleared(save, level)).toBe(true);
  }
  expect(nextChapter(-1)).toBeUndefined();
});

test("new seals never expand as legacy seals on reload and N4 needs all 19", () => {
  const save = normalizeSave({ curriculumVersion: CURRICULUM_VERSION, clearedChapters: [1, 2, 3, 4, 5, 6] });
  expect(save.clearedChapters).toEqual([1, 2, 3, 4, 5, 6]);
  expect(isLevelUnlocked(save, "N4")).toBe(false);
  expect(normalizeSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
});

test("supporting readings follow study order even when permanent IDs go backwards", () => {
  const seven = kanjiByChar.get("七")!; // ID 13 is earlier than 月's ID 2.
  const july = seven.vocab.find((v) => v.w === "七月")!;
  expect(wordSegments(july, seven).find((s) => s.t === "月")?.furigana).toBe("がつ");
  const paper = kanjiByChar.get("紙")!; // ID 8 comes after 手's ID 30.
  const letter = paper.vocab.find((v) => v.w === "手紙")!;
  expect(wordSegments(letter, paper).find((s) => s.t === "手")?.furigana).toBeUndefined();
  const self = kanjiByChar.get("私")!; // N4 ID 7 is later than N5 ID 22.
  const privateSchool = self.vocab.find((v) => v.w === "私立")!;
  expect(wordSegments(privateSchool, self).find((s) => s.t === "立")?.furigana).toBeUndefined();
});

test("migration preserves old seals, totals, schedules and access without paying more rewards", () => {
  const raw = {
    clearedChapters: [1, 2, 3, 4, 5, 6, 7], selectedLevel: "N4", coins: 391,
    runsCompleted: 27, streak: { count: 5, last: "2026-09-10" },
    progress: { 一: progress(3, 1_900_000_000_000), 私: progress(2), 家: progress(1) },
  };
  const save = normalizeSave(raw);
  expect(save.clearedChapters).toEqual(REGIONS.filter((r) => r.legacyChapter <= 7).map((r) => r.id).sort((a, b) => a - b));
  expect(save).toMatchObject({ ...raw, clearedChapters: save.clearedChapters });
  expect(isLevelUnlocked(save, "N4")).toBe(true);
  expect(isLevelCleared(save, "N4")).toBe(false);
  for (const ch of LEVEL_CHAPTERS.N5) expect(isChapterUnlocked(save, ch)).toBe(true);
  expect(normalizeSave(save)).toEqual(save);

  // Old chapter 1 was at 56.25%, opening all 16 cards of old chapter 2.
  const partial = normalizeSave({ progress: Object.fromEntries([...chaptersA].filter((k) => k.ch === 1).slice(0, 9).map((k) => [k.c, progress(3)])) });
  for (const r of REGIONS.filter((r) => r.legacyChapter <= 2)) expect(isChapterUnlocked(partial, r.id)).toBe(true);
  expect(isChapterUnlocked(partial, 3)).toBe(false);
  expect(partial.clearedChapters).toEqual([]);
});

test("an opened region stays open when a review mistake lowers previous mastery", () => {
  const save = freshSave();
  for (const k of kanjiOfChapter(1).slice(0, 3)) save.progress[k.c] = progress(3);
  const opened = normalizeSave(save);
  expect(isChapterUnlocked(opened, 13)).toBe(true);
  for (const k of kanjiOfChapter(1)) opened.progress[k.c] = progress(1);
  expect(isChapterUnlocked(normalizeSave(opened), 13)).toBe(true);
});

test("daily queues cap at ten words and never fill a region's last slot from another theme", () => {
  const save = freshSave();
  save.clearedChapters = [...LEVEL_CHAPTERS.N5];
  for (const k of kanjiOfChapter(1).slice(0, 4)) save.progress[k.c] = progress(2);
  expect(newKanji(save).map((k) => k.c)).toEqual(["五"]);
  expect(buildRunQueue(save)).toHaveLength(5);
  for (const [i, k] of kanjiOfChapter(13).entries()) save.progress[k.c] = progress(2, i);
  expect(buildRunQueue(save)).toHaveLength(6);
  for (const k of kanjiOfChapter(1)) save.progress[k.c] = progress(2);
  expect(buildRunQueue(save)).toHaveLength(10);
  expect(new Set(newKanji(save).map((k) => k.ch))).toEqual(new Set([14]));
});

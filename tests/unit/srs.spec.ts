import { expect, test } from "@playwright/test";
import { allKanji, CHAPTER_COUNT, CHAPTER_NAMES, kanjiByChar, kanjiOfChapter } from "../../src/data/n5";
import { CHAPTER_COUNT as TOTAL_CHAPTERS, CURRICULUM_VERSION, LEVEL_CHAPTERS } from "../../src/data";
import type { Kanji } from "../../src/data/n5/types";
import {
  buildGateQuiz,
  buildRunQueue,
  chapterMasteryPct,
  clearGate,
  dueCount,
  finishRun,
  getCard,
  getServerSnapshot,
  getSnapshot,
  grade,
  isChapterUnlocked,
  isGateCleared,
  n5MasteryPct,
  normalizeSave,
  streakCount,
  subscribe,
  touchStreak,
  vocabKana,
  type CardProgress,
  type SaveData,
} from "../../src/lib/srs";

// These tests exercise the store in one process; none require a browser or server.
test.describe.configure({ mode: "serial" });

const DAY = 86_400_000;
const NOW = new Date(2026, 8, 6, 12).getTime();

function emptySave(): SaveData {
  return {
    curriculumVersion: CURRICULUM_VERSION,
    unlockedChapters: [],
    progress: {},
    streak: { count: 0, last: "" },
    coins: 0,
    runsCompleted: 0,
    gatesCleared: 0,
    clearedChapters: [],
    selectedLevel: "N5",
  };
}

function card(overrides: Partial<CardProgress> = {}): CardProgress {
  return { mastery: 0, ivl: 0, ease: 2.5, due: 0, correct: 0, wrong: 0, ...overrides };
}

function masterAll(): SaveData {
  const save = emptySave();
  for (const k of allKanji) save.progress[k.c] = card({ mastery: 3, due: NOW + DAY, ivl: 30 });
  return save;
}

function normalizeReading(reading: string): string {
  return reading.trim().replace(/[()\s]/g, "").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

function validReadings(k: Kanji): Set<string> {
  return new Set([k.on, k.kun].flatMap((value) => value.split(",")).filter((value) => value.trim() !== "—").map(normalizeReading));
}

function meanings(value: string): string[] {
  return value.toLowerCase().split(";").map((part) => part.trim());
}

function withSeed<T>(seed: number, callback: () => T): T {
  const original = Math.random;
  let value = seed >>> 0;
  Math.random = () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value / 0x1_0000_0000;
  };
  try {
    return callback();
  } finally {
    Math.random = original;
  }
}

test("curriculum has unique cards and complete chapter, reading, and vocabulary data", () => {
  expect(allKanji).toHaveLength(96);
  expect(new Set(allKanji.map((k) => k.c)).size).toBe(allKanji.length);
  expect(kanjiByChar.size).toBe(allKanji.length);
  expect(Object.keys(CHAPTER_NAMES)).toHaveLength(CHAPTER_COUNT);

  for (const ch of LEVEL_CHAPTERS.N5) {
    expect(kanjiOfChapter(ch).length, `chapter ${ch}`).toBeGreaterThanOrEqual(4);
    expect(kanjiOfChapter(ch).length, `chapter ${ch}`).toBeLessThanOrEqual(6);
    expect(CHAPTER_NAMES[ch]?.name).toBeTruthy();
  }
  for (const k of allKanji) {
    expect([...k.c], k.c).toHaveLength(1);
    expect(Number.isInteger(k.strokes) && k.strokes > 0, k.c).toBe(true);
    expect(LEVEL_CHAPTERS.N5.includes(k.ch), k.c).toBe(true);
    expect(k.m.trim(), k.c).toBeTruthy();
    expect(validReadings(k).size, k.c).toBeGreaterThan(0);
    expect(k.vocab.length, k.c).toBeGreaterThan(0);
    for (const vocab of k.vocab) {
      const where = `${k.c}: ${vocab.w}`;
      expect(vocab.w, where).toContain(k.c);
      expect(vocab.r.trim(), where).toBeTruthy();
      expect(vocab.m.trim(), where).toBeTruthy();
      // Ruby spans must rebuild both the word and a readable hiragana spelling.
      expect(vocab.f.map((span) => span.t).join(""), where).toBe(vocab.w);
      expect(vocabKana(vocab), where).toMatch(/^[ぁ-ゖ]+$/);
      for (const span of vocab.f) {
        expect(span.t.length, where).toBeGreaterThan(0);
        if (span.r !== undefined) expect(span.r, `${where} span ${span.t}`).toMatch(/^[ぁ-ゖ]+$/);
        // Only kanji carry a reading; kana spans read as themselves.
        if (!/[一-鿿々]/.test(span.t)) expect(span.r, `${where} span ${span.t}`).toBeUndefined();
      }
    }
  }
});

test("mastery uses every card's weight and only reaches 100% when all cards are mastered", () => {
  const save = emptySave();
  expect(n5MasteryPct(save)).toBe(0);
  expect(chapterMasteryPct(save, 1)).toBe(0);
  save.progress["一"] = card({ mastery: 1 });
  save.progress["二"] = card({ mastery: 2 });
  save.progress["三"] = card({ mastery: 3 });
  expect(chapterMasteryPct(save, 1)).toBe(40); // 6 / (5 * 3).
  expect(n5MasteryPct(save)).toBe(2); // 6 / (96 * 3), rounded.
  save.progress["not-in-curriculum"] = card({ mastery: 3 });
  expect(n5MasteryPct(save)).toBe(2);

  const complete = masterAll();
  expect(n5MasteryPct(complete)).toBe(100);
  for (const ch of LEVEL_CHAPTERS.N5) expect(chapterMasteryPct(complete, ch)).toBe(100);
  complete.progress[allKanji.at(-1)!.c]!.mastery = 2;
  expect(n5MasteryPct(complete)).toBe(99); // 287 / 288 must not claim completion.
  expect(chapterMasteryPct(complete, LEVEL_CHAPTERS.N5.at(-1)!)).toBeLessThan(100);
});

test("chapter unlock thresholds and chapter identifiers are bounded", () => {
  const save = emptySave();
  expect(isChapterUnlocked(save, 1)).toBe(true);
  expect(isChapterUnlocked(save, 2)).toBe(false);
  const chapter = kanjiOfChapter(1);
  for (const k of chapter.slice(0, 2)) save.progress[k.c] = card({ mastery: 3 });
  save.progress[chapter[2]!.c] = card({ mastery: 2 });
  expect(isChapterUnlocked(save, 13)).toBe(false); // 8/15 < 55%.
  save.progress[chapter[2]!.c]!.mastery = 3;
  expect(isChapterUnlocked(save, 13)).toBe(true); // 9/15 >= 55%.
  expect(isChapterUnlocked(save, 2)).toBe(false); // The next legacy theme is further along the road.

  const complete = masterAll();
  for (const ch of [-1, 0, 1.5, TOTAL_CHAPTERS + 1, NaN, Infinity]) {
    expect(isChapterUnlocked(complete, ch), `chapter ${ch}`).toBe(false);
    expect(isGateCleared(complete, ch), `gate ${ch}`).toBe(false);
    expect(buildGateQuiz(ch), `quiz ${ch}`).toEqual([]);
  }
});

test("gate completion tracks the actual chapters rather than their largest number", () => {
  const save = { ...emptySave(), gatesCleared: 1, clearedChapters: [3] };
  expect(isGateCleared(save, 3)).toBe(true);
  expect(isGateCleared(save, 1)).toBe(false);
  expect(isGateCleared(save, 2)).toBe(false);
  expect(isGateCleared(save, 4)).toBe(false);
});

test("due totals and queues include mastered cards and exclude locked or future cards", () => {
  const save = emptySave();
  save.progress["一"] = card({ mastery: 3, due: NOW, ivl: 30 });
  save.progress["二"] = card({ mastery: 1, due: NOW + 1 });
  save.progress["半"] = card({ mastery: 2, due: NOW - DAY }); // Chapter 2 remains locked.
  save.progress["三"] = card({ mastery: 0, due: NOW - DAY });
  expect(dueCount(save, NOW - 1)).toBe(0);
  expect(dueCount(save, NOW)).toBe(1);
  expect(dueCount(save, NOW + 1)).toBe(2);
  const queue = withSeed(10, () => buildRunQueue(save, NOW));
  expect(queue.map((q) => q.kanji.c)).toContain("一");
  expect(queue.map((q) => q.kanji.c)).not.toContain("二");
  expect(queue.map((q) => q.kanji.c)).not.toContain("半");
  expect(queue).toHaveLength(4); // One review and three fresh cards from this region.
});

test("saved mastery-zero cards remain eligible as fresh cards", () => {
  const save = emptySave();
  for (const k of kanjiOfChapter(1)) save.progress[k.c] = card();
  expect(dueCount(save, NOW)).toBe(0);
  const queue = withSeed(20, () => buildRunQueue(save, NOW));
  expect(queue).toHaveLength(5);
  expect(new Set(queue.map((q) => q.kanji.c))).toEqual(new Set(kanjiOfChapter(1).slice(0, 5).map((k) => k.c)));
});

test("a short run selects the five oldest eligible reviews and new cards from one region", () => {
  const save = emptySave();
  const reviews = [...kanjiOfChapter(1), ...kanjiOfChapter(13), ...kanjiOfChapter(14).slice(0, 4)];
  reviews.forEach((k, index) => { save.progress[k.c] = card({ mastery: 2, due: NOW - (index + 1) * DAY, ivl: 1 }); });
  save.progress[reviews[0]!.c]!.mastery = 3;
  expect(dueCount(save, NOW)).toBe(14);
  const queue = withSeed(30, () => buildRunQueue(save, NOW));
  const queuedReviews = queue.filter((question) => getCard(save, question.kanji.c).mastery > 0);
  const queuedFresh = queue.filter((question) => getCard(save, question.kanji.c).mastery === 0);
  expect(queue).toHaveLength(7);
  expect(new Set(queue.map((question) => question.kanji.c)).size).toBe(7);
  expect(queuedReviews).toHaveLength(5);
  expect(new Set(queuedReviews.map((question) => question.kanji.c))).toEqual(new Set(reviews.slice(-5).map((k) => k.c)));
  expect(queuedFresh).toHaveLength(2);
  expect(queuedFresh.every((question) => question.kanji.ch === 14)).toBe(true);
});

test("fully learned cards produce no premature review and become reviewable at their due instant", () => {
  const save = masterAll();
  expect(dueCount(save, NOW)).toBe(0);
  expect(buildRunQueue(save, NOW)).toEqual([]);
  expect(dueCount(save, NOW + DAY)).toBe(allKanji.length);
  expect(buildRunQueue(save, NOW + DAY)).toHaveLength(5);
});

test("every chapter checkpoint covers its entire small set exactly once", () => {
  for (const ch of LEVEL_CHAPTERS.N5) {
    const quiz = withSeed(ch, () => buildGateQuiz(ch));
    expect(quiz).toHaveLength(kanjiOfChapter(ch).length);
    expect(new Set(quiz.map((question) => question.kanji.c)).size).toBe(quiz.length);
    expect(quiz.every((question) => question.kanji.ch === ch)).toBe(true);
  }
});

test("streaks follow local dates across midnight, month/year boundaries, and daylight saving", () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ["Asia/Tokyo", "America/New_York"]) {
      process.env.TZ = timezone;
      const save = { ...emptySave(), streak: { count: 7, last: "2026-09-06" } };
      expect(streakCount(save, new Date(2026, 8, 6, 0, 1).getTime()), timezone).toBe(7);
      expect(streakCount(save, new Date(2026, 8, 7, 0, 1).getTime()), timezone).toBe(7);
      expect(streakCount(save, new Date(2026, 8, 8, 0, 1).getTime()), timezone).toBe(0);
      expect(streakCount(save, new Date(2026, 8, 5, 23, 59).getTime()), timezone).toBe(0);
      save.streak.last = "2026-12-31";
      expect(streakCount(save, new Date(2027, 0, 1, 0, 1).getTime()), timezone).toBe(7);
    }
    process.env.TZ = "America/New_York";
    // Subtracting 24 hours can land on today (fall) or two dates ago (spring).
    const fallBack = { ...emptySave(), streak: { count: 3, last: "2026-10-31" } };
    expect(streakCount(fallBack, new Date(2026, 10, 1, 23, 30).getTime())).toBe(3);
    const springForward = { ...emptySave(), streak: { count: 3, last: "2026-03-08" } };
    expect(streakCount(springForward, new Date(2026, 2, 9, 0, 30).getTime())).toBe(3);
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("save normalization repairs invalid math and discards unsupported progress", () => {
  for (const raw of [null, undefined, 4, "bad", []]) expect(normalizeSave(raw)).toEqual(emptySave());
  const save = normalizeSave({
    curriculumVersion: CURRICULUM_VERSION,
    coins: -40,
    runsCompleted: Infinity,
    gatesCleared: 99,
    clearedChapters: [3, 3, 0, -1, 1.5, TOTAL_CHAPTERS + 1, "2"],
    streak: { count: NaN, last: "not-a-day" },
    progress: {
      一: { mastery: 3, ivl: -2, ease: 20, due: -1, correct: 3.9, wrong: -8 },
      二: { mastery: 9, ivl: Infinity, ease: "bad", due: NaN, correct: Infinity, wrong: "3" },
      三: null,
      unknown: card({ mastery: 3 }),
    },
  });
  expect(save.coins).toBe(0);
  expect(save.runsCompleted).toBe(0);
  expect(save.clearedChapters).toEqual([3]);
  expect(save.gatesCleared).toBe(1);
  expect(save.streak).toEqual({ count: 0, last: "" });
  expect(save.progress).not.toHaveProperty("unknown");
  for (const progress of Object.values(save.progress)) {
    expect(Number.isInteger(progress.mastery) && progress.mastery >= 0 && progress.mastery <= 3).toBe(true);
    expect(Number.isFinite(progress.ivl) && progress.ivl >= 0).toBe(true);
    expect(Number.isFinite(progress.due) && progress.due >= 0).toBe(true);
    expect(Number.isFinite(progress.ease) && progress.ease >= 1.3 && progress.ease <= 3).toBe(true);
    expect(Number.isSafeInteger(progress.correct) && progress.correct >= 0).toBe(true);
    expect(Number.isSafeInteger(progress.wrong) && progress.wrong >= 0).toBe(true);
  }
  expect(Number.isFinite(n5MasteryPct(save))).toBe(true);
});

test("legacy gate saves migrate while explicit chapter completion remains authoritative", () => {
  expect(normalizeSave({ gatesCleared: 2 }).clearedChapters).toEqual([1, 2, 13, 14, 15, 16]);
  expect(normalizeSave({ gatesCleared: 999 }).clearedChapters).toEqual([...LEVEL_CHAPTERS.N5].sort((a, b) => a - b));
  expect(normalizeSave({ gatesCleared: -1 }).clearedChapters).toEqual([]);
  const explicit = normalizeSave({ gatesCleared: 6, clearedChapters: [5, 2, 5] });
  expect(explicit.clearedChapters).toEqual([2, 5, 15, 16, 22, 23]);
  expect(explicit.gatesCleared).toBe(6);
  expect(normalizeSave({ streak: { count: 8, last: "2026-02-30" } }).streak).toEqual({ count: 0, last: "" });
});

test("guest grading, rewards, session persistence, and streak updates preserve exact totals and immutable snapshots", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalTimezone = process.env.TZ;
  let stored = JSON.stringify({ ...emptySave(), curriculumVersion: undefined, clearedChapters: undefined, gatesCleared: 2, coins: 7, runsCompleted: 3 });
  let notifications = 0;
  let unsubscribe = () => {};
  const sessionWrites: string[] = [];
  const durableWrites: string[] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => key === "kanji-dash-guest-v1" ? stored : null,
        setItem: (key: string, value: string) => { sessionWrites.push(key); stored = value; },
      },
      localStorage: {
        getItem: () => JSON.stringify({ ...emptySave(), coins: 999 }),
        setItem: (key: string) => { durableWrites.push(key); },
      },
    },
  });
  try {
    unsubscribe = subscribe(() => { notifications += 1; });
    const initial = getSnapshot();
    expect(initial.clearedChapters).toEqual([1, 2, 13, 14, 15, 16]);
    expect(getSnapshot()).toBe(initial);
    expect(getServerSnapshot()).toBe(getServerSnapshot());

    let now = NOW;
    grade("一", true, now);
    let current = getSnapshot();
    expect(current).not.toBe(initial);
    expect(current.progress).not.toBe(initial.progress);
    expect(initial.progress).toEqual({});
    expect(current.progress["一"]).toMatchObject({ mastery: 1, ivl: 0.02, correct: 1, wrong: 0 });
    expect(current.progress["一"]!.ease).toBeCloseTo(2.58, 10);
    expect(current.progress["一"]!.due).toBe(now + 1_728_000);

    const beforeEarly = current;
    grade("一", true, now + 1);
    current = getSnapshot();
    expect(current.progress["一"]).toEqual({ ...beforeEarly.progress["一"], correct: 2 });
    expect(beforeEarly.progress["一"]!.correct).toBe(1);
    expect(current.progress["一"]).not.toBe(beforeEarly.progress["一"]);

    const expectedIntervals = [1, 2.7, 7.4, 20.9, 60.6];
    for (let i = 0; i < expectedIntervals.length; i += 1) {
      const previous = current;
      const previousValue = structuredClone(previous);
      now = previous.progress["一"]!.due;
      grade("一", true, now);
      current = getSnapshot();
      expect(previous).toEqual(previousValue);
      expect(current.progress["一"]!.ivl).toBeCloseTo(expectedIntervals[i]!, 10);
      expect(current.progress["一"]!.due).toBeCloseTo(now + expectedIntervals[i]! * DAY, 0);
      expect(current.progress["一"]!.mastery).toBe(i === expectedIntervals.length - 1 ? 3 : 2);
      expect(current.progress["一"]!.correct).toBe(i + 3);
      expect(current.progress["一"]!.wrong).toBe(0);
    }

    const mastered = current;
    now = mastered.progress["一"]!.due;
    grade("一", false, now);
    current = getSnapshot();
    expect(mastered.progress["一"]!.mastery).toBe(3);
    expect(current.progress["一"]!.mastery).toBe(2);
    expect(current.progress["一"]!.ivl).toBeCloseTo(24.24, 10);
    expect(current.progress["一"]!.ease).toBeCloseTo(2.78, 10);
    expect(current.progress["一"]!.correct).toBe(7);
    expect(current.progress["一"]!.wrong).toBe(1);
    expect(current.progress["一"]!.due).toBeCloseTo(now + 24.24 * DAY, 0);

    grade("二", false, NOW);
    expect(getSnapshot().progress["二"]).toMatchObject({ mastery: 1, ivl: 0.01, correct: 0, wrong: 1, due: NOW + 864_000 });
    expect(getSnapshot().progress["二"]!.ease).toBeCloseTo(2.3, 10);
    for (let i = 0; i < 25; i += 1) grade("二", false, NOW + i);
    expect(getSnapshot().progress["二"]!.ease).toBe(1.3);
    expect(getSnapshot().progress["二"]!.ivl).toBe(0.01);
    expect(getSnapshot().progress["二"]!.wrong).toBe(26);

    const beforeUnknown = structuredClone(getSnapshot());
    grade("not-a-kanji", true, NOW);
    expect(getSnapshot()).toEqual(beforeUnknown);

    const beforeInvalid = structuredClone(getSnapshot());
    for (const amount of [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) finishRun(amount);
    expect(getSnapshot()).toEqual(beforeInvalid);
    finishRun(13);
    expect(getSnapshot().coins).toBe(20);
    expect(getSnapshot().runsCompleted).toBe(4);
    finishRun(0);
    expect(getSnapshot().coins).toBe(20);
    expect(getSnapshot().runsCompleted).toBe(5);

    expect(clearGate(2)).toBe(0); // Legacy cleared gate cannot pay again.
    expect(clearGate(5)).toBe(0); // Locked N5 checkpoints cannot be skipped.
    expect(clearGate(3)).toBe(50);
    expect(clearGate(3)).toBe(0);
    expect(clearGate(17)).toBe(50); // The new road order advances immediately after a seal.
    expect(getSnapshot().clearedChapters).toEqual([1, 2, 3, 13, 14, 15, 16, 17]);
    expect(getSnapshot().gatesCleared).toBe(8);
    expect(getSnapshot().coins).toBe(120);
    expect(getSnapshot().runsCompleted).toBe(5);
    expect(isGateCleared(getSnapshot(), 4)).toBe(false);
    const beforeInvalidGate = structuredClone(getSnapshot());
    for (const ch of [-1, 0, 1.5, TOTAL_CHAPTERS + 1, NaN, Infinity]) expect(clearGate(ch)).toBe(0);
    expect(clearGate(7)).toBe(0); // A real N4 gate cannot pay before N5 is cleared.
    expect(getSnapshot()).toEqual(beforeInvalidGate);

    process.env.TZ = "Asia/Tokyo";
    touchStreak(new Date(2027, 0, 1, 23, 59).getTime());
    const firstDay = getSnapshot();
    expect(firstDay.streak).toEqual({ count: 1, last: "2027-01-01" });
    touchStreak(new Date(2027, 0, 2, 0, 1).getTime());
    expect(getSnapshot().streak).toEqual({ count: 2, last: "2027-01-02" });
    expect(firstDay.streak).toEqual({ count: 1, last: "2027-01-01" });
    touchStreak(new Date(2027, 0, 2, 23, 59).getTime());
    expect(getSnapshot().streak.count).toBe(2);
    touchStreak(new Date(2027, 0, 4, 0, 1).getTime());
    expect(getSnapshot().streak).toEqual({ count: 1, last: "2027-01-04" });
    expect(JSON.parse(stored)).toEqual(getSnapshot());
    expect(sessionWrites.length).toBeGreaterThan(0);
    expect(new Set(sessionWrites)).toEqual(new Set(["kanji-dash-guest-v1"]));
    expect(durableWrites).toEqual([]);
    expect(notifications).toBeGreaterThan(0);
  } finally {
    unsubscribe();
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

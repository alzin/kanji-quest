import { test, expect } from "@playwright/test";
import { allKanji } from "../../src/data";
import { acceptsReading, readingInput } from "../../src/lib/production";
import { buyCosmetic, getSnapshot, grade, normalizeSave, recordProduction, recordStackSheet, replaceSave, streakCount, touchStreak } from "../../src/lib/srs";
import { dailyQuests, emptyStack, normalizeStack, stackOf } from "../../src/lib/stack-progress";

test("hiragana, katakana, romaji, sokuon, n apostrophe and long vowels", () => {
  for (const [input, expected] of [["gakkou", "がっこう"], ["GAKKŌ", "がっこう"], ["shin'you", "しんよう"], ["konnichiha", "こんにちは"], ["sensei", "せんせい"], ["ガッコウ", "がっこう"], ["nihon", "にほん"], ["shimbun", "しんぶん"]]) {
    expect(readingInput(input!)).toBe(expected);
  }
  const gakkou = allKanji.flatMap((k) => k.vocab).find((v) => v.w === "学校")!;
  expect(acceptsReading(gakkou, "gakkou")).toBe(true);
  expect(acceptsReading(gakkou, "gakko")).toBe(false);
  expect(acceptsReading(gakkou, "gakou")).toBe(false);
  expect(acceptsReading(gakkou, "garbage")).toBe(false);
  for (const k of allKanji) for (const vocab of k.vocab) {
    expect(acceptsReading(vocab, vocab.f.map((f) => f.r || f.t).join("")), vocab.w).toBe(true);
    expect(acceptsReading(vocab, vocab.r), `${vocab.w}: ${vocab.r}`).toBe(true);
  }
});

test("hinted retries cannot advance mastery; fluency misses do not change due intervals", () => {
  replaceSave(normalizeSave({ progress: { 一: { mastery: 1, ivl: 1, ease: 2.5, due: 100, correct: 0, wrong: 0 } } }));
  grade("一", true, 100, { rt: 500, fallTime: 6, hinted: true });
  expect(getSnapshot().progress["一"]!.mastery).toBe(1);
  const before = { ...getSnapshot().progress["一"]! };
  grade("一", false, 101, { rt: 800, fallTime: 2.5, hinted: false });
  expect(getSnapshot().progress["一"]).toMatchObject({ due: before.due, ivl: before.ivl, ease: before.ease, mastery: 1, wrong: 1 });
});

test("mastery needs two production successes and daily tracing counts only once", () => {
  replaceSave(normalizeSave({ progress: { 一: { mastery: 2, ivl: 20, ease: 2.5, due: 100, correct: 0, wrong: 0 } } }));
  grade("一", true, 100);
  expect(getSnapshot().progress["一"]!.mastery).toBe(2);
  const now = new Date(2026, 8, 20, 12).getTime();
  recordProduction("一", true, now); recordProduction("一", true, now);
  expect(getSnapshot().progress["一"]!.prod).toBe(1);
  recordProduction("一", false, now);
  expect(getSnapshot().progress["一"]!.mastery).toBe(3);
});

test("freezes are granted once and cover only the actual missed calendar days", () => {
  replaceSave(normalizeSave({ streak: { count: 2, last: "2026-09-18" } }));
  touchStreak(new Date(2026, 8, 19, 12).getTime());
  expect(stackOf(getSnapshot()).freezes.count).toBe(1);
  expect(streakCount(getSnapshot(), new Date(2026, 8, 21, 12).getTime())).toBe(3);
  touchStreak(new Date(2026, 8, 21, 12).getTime());
  expect(getSnapshot().streak.count).toBe(4);
  expect(stackOf(getSnapshot()).freezes).toEqual({ count: 0, granted: 1, lastUsedDay: "2026-09-21" });
  touchStreak(new Date(2026, 8, 21, 14).getTime());
  expect(stackOf(getSnapshot()).freezes.count).toBe(0);
});

test("cosmetics charge once, refuse unaffordable purchases, and preserve immutable saves", () => {
  replaceSave(normalizeSave({ coins: 100 }));
  const before = getSnapshot();
  expect(buyCosmetic("sakura")).toBe(true); expect(getSnapshot().coins).toBe(20);
  expect(buyCosmetic("sakura")).toBe(true); expect(getSnapshot().coins).toBe(20);
  expect(buyCosmetic("wave")).toBe(false);
  expect(before.coins).toBe(100); expect(stackOf(before).cosmetics.owned).toEqual(["hanko", "washi"]);
});

test("best scores, quests and play duration persist and reset by local day", () => {
  replaceSave(normalizeSave({}));
  const now = new Date(2026, 8, 20, 12).getTime();
  recordStackSheet({ score: 1500, elapsed: 70, redeemed: 3, cleared: true, kind: "daily" }, now);
  recordStackSheet({ score: 1000, elapsed: 50, redeemed: 0, cleared: true, kind: "daily" }, now);
  expect(stackOf(getSnapshot())).toMatchObject({ bestSheet: 1500, playMs: 120000, sheetsCleared: 2 });
  expect(dailyQuests(getSnapshot(), now).find((q) => q.key === "sheets")?.value).toBe(2);
  expect(dailyQuests(getSnapshot(), now + 86400000).every((q) => q.value === 0)).toBe(true);
  expect(normalizeStack({ ...emptyStack(), bestSheet: Infinity, freezes: { count: 99, granted: -1, lastUsedDay: "bad" } }, [1])).toMatchObject({ bestSheet: 0, freezes: { count: 3, granted: 0, lastUsedDay: "" } });
});

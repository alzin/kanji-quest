import assert from "node:assert/strict";
import test from "node:test";
import { parseSaveData } from "../src/application/progress-validation.js";
import { CURRICULUM_VERSION } from "../src/domain/curriculum.js";
import type { SaveData } from "../src/domain/models.js";

const legacy = (): SaveData => ({ curriculumVersion: CURRICULUM_VERSION, unlockedChapters: [], progress: {}, streak: { count: 0, last: "" }, coins: 0, runsCompleted: 0, gatesCleared: 0, clearedChapters: [], selectedLevel: "N5" });
const current = (): SaveData => ({ ...legacy(), progress: { 一: { mastery: 2, ivl: 1, ease: 2.5, due: 0, correct: 3, wrong: 1, rt: 1234, prod: 2, fl: 4 } }, stack: {
  bestSheet: 2500, bestMarathon: 8000, bestSprintMs: 45000, sheetsCleared: 2, lastSealDay: "2026-09-20",
  quests: { day: "2026-09-20", sheets: 2, redeems: 3, typed: 1 }, freezes: { count: 1, granted: 1, lastUsedDay: "" },
  cosmetics: { owned: ["hanko", "washi", "sakura"], stamp: "sakura", paper: "washi" }, perfectGates: [1], playDay: "2026-09-20", playMs: 30000, strokeDay: "",
} });

test("old clients remain valid; stack progress survives a complete round trip", () => {
  assert.deepEqual(parseSaveData(legacy()), legacy());
  assert.deepEqual(parseSaveData(current()), current());
});

test("optional fields are validated without allowing unknown fields or invalid arithmetic", () => {
  for (const value of [-1, Infinity, NaN, "1234", 600001]) {
    const save = current(); save.progress["一"]!.rt = value as number;
    assert.throws(() => parseSaveData(save));
  }
  for (const field of ["prod", "fl"] as const) {
    const save = current(); save.progress["一"]![field] = 1.2; assert.throws(() => parseSaveData(save));
  }
  const save = current();
  assert.throws(() => parseSaveData({ ...save, unexpected: 1 }));
  assert.throws(() => parseSaveData({ ...save, stack: { ...save.stack, unexpected: 1 } }));
  assert.throws(() => parseSaveData({ ...save, stack: { ...save.stack, lastSealDay: "2026-02-30" } }));
  assert.throws(() => parseSaveData({ ...save, stack: { ...save.stack, cosmetics: { owned: ["hanko", "washi"], stamp: "sakura", paper: "washi" } } }));
});

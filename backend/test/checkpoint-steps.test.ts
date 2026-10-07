import assert from "node:assert/strict";
import test from "node:test";
import { parseSaveData } from "../src/application/progress-validation.js";
import { CURRICULUM_VERSION } from "../src/domain/curriculum.js";
import type { SaveData } from "../src/domain/models.js";

const legacy = (): SaveData => ({ curriculumVersion: CURRICULUM_VERSION, unlockedChapters: [13], progress: {}, streak: { count: 0, last: "" }, coins: 0, runsCompleted: 0, gatesCleared: 0, clearedChapters: [], selectedLevel: "N5" });
const current = (): SaveData => ({ ...legacy(), checkpointSteps: { learned: [1, 13], stacked: [1, 13], rescued: [13] } });

test("checkpoint steps survive validated round trips, and saves from before them remain valid", () => {
  assert.deepEqual(parseSaveData(legacy()), legacy());
  const source = current(), parsed = parseSaveData(source);
  assert.deepEqual(parsed, source);
  assert.notEqual(parsed.checkpointSteps!.learned, source.checkpointSteps!.learned);
  assert.deepEqual(parseSaveData({ ...source, checkpointSteps: { learned: [13, 1], stacked: [13, 1], rescued: [13] } }).checkpointSteps, source.checkpointSteps);
});

test("checkpoint steps reject unknown regions, duplicates, steps out of order and malformed fields", () => {
  const save = current(), steps = save.checkpointSteps!;
  const invalid = [
    null, [], {}, { ...steps, extra: [] }, { learned: [1], stacked: [] },
    { ...steps, learned: [1, 1, 13] }, { ...steps, learned: [1, 13, 9999] }, { ...steps, learned: [1, "13"] }, { ...steps, rescued: "13" },
    { learned: [1, 13], stacked: [1, 13, 14], rescued: [] },
    { learned: [1, 13], stacked: [1], rescued: [13] },
  ];
  for (const value of invalid) assert.throws(() => parseSaveData({ ...save, checkpointSteps: value }), JSON.stringify(value));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseSaveData } from "../src/application/progress-validation.js";
import { CURRICULUM_VERSION } from "../src/domain/curriculum.js";
import { RUNNER_SPIRITS, type SaveData } from "../src/domain/models.js";

const legacy = (): SaveData => ({ curriculumVersion: CURRICULUM_VERSION, unlockedChapters: [], progress: {}, streak: { count: 0, last: "" }, coins: 0, runsCompleted: 0, gatesCleared: 0, clearedChapters: [], selectedLevel: "N5" });
const current = (): SaveData => ({ ...legacy(), runner: {
  best: { N5: { standard: 2400, relaxed: 7500 }, N4: { standard: 1100, relaxed: 0 }, N3: { standard: 0, relaxed: 0 } },
  rescued: ["komorebi", "take", "kohaku"], equippedLantern: "jade", tutorialSeen: true,
} });

test("old saves remain unchanged and runner state survives complete validated round trips", () => {
  assert.deepEqual(parseSaveData(legacy()), legacy());
  const source = current(), parsed = parseSaveData(source);
  assert.deepEqual(parsed, source);
  assert.notEqual(parsed.runner!.best.N5, source.runner!.best.N5);
  assert.notEqual(parsed.runner!.rescued, source.runner!.rescued);
});

test("runner rejects invalid records, identities, locked cosmetics and malformed fields", () => {
  const save = current(), runner = save.runner!;
  const invalid = [
    null, {}, { ...runner, unexpected: true },
    { ...runner, best: { ...runner.best, N1: { standard: 0, relaxed: 0 } } },
    ...[-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, "50"].map((standard) => ({ ...runner, best: { ...runner.best, N5: { standard, relaxed: 0 } } })),
    { ...runner, rescued: ["komorebi", "komorebi"] }, { ...runner, rescued: ["unknown"] },
    { ...runner, equippedLantern: "rose" }, { ...runner, equippedLantern: "unknown" },
    { ...runner, tutorialSeen: "yes" },
  ];
  for (const value of invalid) assert.throws(() => parseSaveData({ ...save, runner: value }));
});

test("the backend's stable spirit identities match the frontend catalog", async () => {
  const source = await readFile(new URL("../../src/lib/firefly-catalog.ts", import.meta.url), "utf8");
  const ids = [...source.matchAll(/id: "([a-z]+)", name: "[^"]+", title:/g)].map((match) => match[1]);
  assert.deepEqual(ids, [...RUNNER_SPIRITS]);
});

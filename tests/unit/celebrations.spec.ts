import { expect, test } from "@playwright/test";
import { diffFx, FX_KEY, normalizeFx, readFx, rememberFx, toFxRecord, type FxRecord } from "../../src/lib/celebrations";
import type { SaveData } from "../../src/lib/srs";

test.describe.configure({ mode: "serial" });

const TODAY = "2026-09-08";

function save(over: Partial<SaveData> = {}): SaveData {
  return {
    progress: {},
    streak: { count: 2, last: TODAY },
    coins: 120,
    runsCompleted: 3,
    gatesCleared: 2,
    clearedChapters: [1, 2],
    selectedLevel: "N5",
    curriculumVersion: 2,
    unlockedChapters: [],
    ...over,
  };
}

const empty: FxRecord = { seenSeals: [], lastCoins: 0, lastStreakDay: "" };

test("normalizeFx tolerates garbage", () => {
  for (const raw of [null, undefined, 42, "x", [], [1, 2], true, () => 1]) {
    expect(normalizeFx(raw), String(raw)).toEqual(empty);
  }
  expect(normalizeFx({ seenSeals: "no", lastCoins: -3, lastStreakDay: 7 })).toEqual(empty);
  expect(normalizeFx({ seenSeals: [3, 1, 1, "2", 0, 2.5, -1, Number.NaN], lastCoins: 12.7, lastStreakDay: TODAY }))
    .toEqual({ seenSeals: [1, 3], lastCoins: 12, lastStreakDay: TODAY });
  expect(normalizeFx({ lastCoins: Number.POSITIVE_INFINITY, lastStreakDay: "yesterday" })).toEqual(empty);
  expect(normalizeFx({ lastCoins: Number.MAX_VALUE }).lastCoins).toBe(Number.MAX_SAFE_INTEGER);
  expect(FX_KEY).toBe("kanji-dash-fx-v1");
});

test("diffFx reports only what changed since the last visit", () => {
  const record: FxRecord = { seenSeals: [1], lastCoins: 120, lastStreakDay: TODAY };
  expect(diffFx(record, save(), TODAY)).toEqual({ newSeals: [2], coinsChanged: false, streakDayChanged: false });
  expect(diffFx({ ...record, seenSeals: [1, 2] }, save(), TODAY).newSeals).toEqual([]);
  expect(diffFx({ ...record, seenSeals: [] }, save({ clearedChapters: [] }), TODAY).newSeals).toEqual([]);
  expect(diffFx(empty, save({ clearedChapters: [4, 1] }), TODAY).newSeals).toEqual([4, 1]);

  expect(diffFx({ ...record, lastCoins: 70 }, save(), TODAY).coinsChanged).toBe(true);
  expect(diffFx({ ...record, lastCoins: 120 }, save(), TODAY).coinsChanged).toBe(false);
  expect(diffFx(empty, save({ coins: 0 }), TODAY).coinsChanged).toBe(false);

  // The streak day only "changes" when the save was touched today and the record predates it.
  expect(diffFx({ ...record, lastStreakDay: "2026-09-07" }, save(), TODAY).streakDayChanged).toBe(true);
  expect(diffFx({ ...record, lastStreakDay: "" }, save(), TODAY).streakDayChanged).toBe(true);
  expect(diffFx({ ...record, lastStreakDay: TODAY }, save(), TODAY).streakDayChanged).toBe(false);
  expect(diffFx({ ...record, lastStreakDay: "2026-09-07" }, save({ streak: { count: 1, last: "2026-09-07" } }), TODAY).streakDayChanged).toBe(false);
  expect(diffFx(empty, save({ streak: { count: 0, last: "" } }), TODAY).streakDayChanged).toBe(false);
});

test("toFxRecord remembers the streak's own day so a pre-run Home visit cannot hide the ignite", () => {
  const yesterday = "2026-09-07";
  const before = toFxRecord(save({ streak: { count: 1, last: yesterday } }), TODAY);
  expect(before.lastStreakDay).toBe(yesterday);
  // Home visited before the run: no ignite ...
  expect(diffFx(before, save({ streak: { count: 1, last: yesterday } }), TODAY).streakDayChanged).toBe(false);
  // ... run happened: ignite ...
  expect(diffFx(before, save(), TODAY).streakDayChanged).toBe(true);
  // ... and once remembered it is not repeated.
  const after = toFxRecord(save(), TODAY);
  expect(after.lastStreakDay).toBe(TODAY);
  expect(diffFx(after, save(), TODAY).streakDayChanged).toBe(false);
  expect(toFxRecord(save({ streak: { count: 0, last: "" } }), TODAY).lastStreakDay).toBe("");
  expect(toFxRecord(save({ clearedChapters: [3, 1, 3] }), TODAY).seenSeals).toEqual([1, 3]);
});

test("rememberFx round-trips through normalizeFx", () => {
  const store = new Map<string, string>();
  const g = globalThis as { window?: unknown };
  g.window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
    },
  };
  try {
    expect(readFx()).toEqual(empty);
    const s = save({ clearedChapters: [2, 1], coins: 77 });
    rememberFx(s, TODAY);
    expect([...store.keys()]).toEqual([FX_KEY]);
    const stored = normalizeFx(JSON.parse(store.get(FX_KEY) ?? "null"));
    expect(stored).toEqual(toFxRecord(s, TODAY));
    expect(readFx()).toEqual({ seenSeals: [1, 2], lastCoins: 77, lastStreakDay: TODAY });
    expect(diffFx(readFx(), s, TODAY)).toEqual({ newSeals: [], coinsChanged: false, streakDayChanged: false });

    store.set(FX_KEY, "{not json");
    expect(readFx()).toEqual(empty);
    store.set(FX_KEY, JSON.stringify({ seenSeals: [9, "x"], lastCoins: "many" }));
    expect(readFx()).toEqual({ seenSeals: [9], lastCoins: 0, lastStreakDay: "" });
  } finally {
    delete g.window;
  }
  // Without a window both are silent no-ops.
  expect(readFx()).toEqual(empty);
  expect(() => rememberFx(save(), TODAY)).not.toThrow();
});

import type { SaveData } from "@/lib/srs";

/*
 * Celebration bookkeeping under its own localStorage key, so a reload or
 * backgrounding between the results card and the map never loses a ceremony
 * and revisiting never repeats one. Pure helpers (normalizeFx, diffFx,
 * toFxRecord) are unit-tested; readFx/rememberFx are client-only and meant to
 * be called from useEffect after hydration.
 */

export const FX_KEY = "kanji-dash-fx-v1";
export type FxRecord = { seenSeals: number[]; lastCoins: number; lastStreakDay: string };
export type FxDiff = { newSeals: number[]; coinsChanged: boolean; streakDayChanged: boolean };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(Math.min(value, Number.MAX_SAFE_INTEGER)) : 0;
}

export function normalizeFx(raw: unknown): FxRecord {
  const r = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const seals = r["seenSeals"];
  const seenSeals = Array.isArray(seals)
    ? [...new Set(seals.filter((ch): ch is number => typeof ch === "number" && Number.isInteger(ch) && ch >= 1))].sort((a, b) => a - b)
    : [];
  const day = r["lastStreakDay"];
  return {
    seenSeals,
    lastCoins: count(r["lastCoins"]),
    lastStreakDay: typeof day === "string" && DAY.test(day) ? day : "",
  };
}

export function diffFx(record: FxRecord, save: SaveData, today: string): FxDiff {
  const seen = new Set(record.seenSeals);
  return {
    newSeals: save.clearedChapters.filter((ch) => !seen.has(ch)),
    coinsChanged: record.lastCoins !== save.coins,
    streakDayChanged: record.lastStreakDay !== today && save.streak.last === today,
  };
}

// The record rememberFx persists. lastStreakDay is the day the streak was last
// touched (save.streak.last), not `today`: the app opens on Home, so stamping
// today's date before the run would hide the ignite after it.
export function toFxRecord(save: SaveData, today: string): FxRecord {
  return {
    seenSeals: [...new Set(save.clearedChapters)].sort((a, b) => a - b),
    lastCoins: count(save.coins),
    lastStreakDay: save.streak.last === today ? today : normalizeFx({ lastStreakDay: save.streak.last }).lastStreakDay,
  };
}

export function readFx(): FxRecord {
  try {
    if (typeof window === "undefined") return normalizeFx(null);
    const raw = window.localStorage.getItem(FX_KEY);
    return normalizeFx(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeFx(null);
  }
}

export function rememberFx(save: SaveData, today: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FX_KEY, JSON.stringify(toFxRecord(save, today)));
  } catch {
    /* ignore */
  }
}

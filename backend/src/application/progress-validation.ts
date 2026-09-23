import { AppError } from "../domain/errors.js";
import type { CardProgress, SaveData } from "../domain/models.js";
import { CHAPTER_IDS, CURRICULUM_VERSION, KANJI_CHARACTERS } from "../domain/curriculum.js";

const kanji = new Set([...KANJI_CHARACTERS]);
const chapters = new Set<number>(CHAPTER_IDS);
const MAX_TIMESTAMP = 8_640_000_000_000_000;

function invalid(field: string): never {
  throw new AppError("INVALID_PROGRESS", `Invalid progress field: ${field}.`, 400);
}

function object(value: unknown, fields: readonly string[], field: string, optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(field);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !fields.includes(key) && !optional.includes(key)) || fields.some((key) => !Object.hasOwn(result, key))) invalid(field);
  return result;
}

function bounded(value: unknown, field: string, min: number, max: number, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) invalid(field);
  return value;
}

function count(value: unknown, field: string): number {
  return bounded(value, field, 0, Number.MAX_SAFE_INTEGER, true);
}

function chapterList(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.length > chapters.size || value.some((id) => typeof id !== "number" || !chapters.has(id)) || new Set(value).size !== value.length) invalid(field);
  return [...value].sort((a: number, b: number) => a - b) as number[];
}

export function parseSaveData(value: unknown): SaveData {
  const raw = object(value, ["curriculumVersion", "unlockedChapters", "progress", "streak", "coins", "runsCompleted", "gatesCleared", "clearedChapters", "selectedLevel"], "save", ["stack"]);
  if (raw.curriculumVersion !== CURRICULUM_VERSION) invalid("curriculumVersion");
  if (raw.selectedLevel !== "N5" && raw.selectedLevel !== "N4" && raw.selectedLevel !== "N3") invalid("selectedLevel");
  const unlockedChapters = chapterList(raw.unlockedChapters, "unlockedChapters");
  const clearedChapters = chapterList(raw.clearedChapters, "clearedChapters");
  if (raw.gatesCleared !== clearedChapters.length) invalid("gatesCleared");
  const streak = object(raw.streak, ["count", "last"], "streak");
  const streakCount = count(streak.count, "streak.count");
  if (typeof streak.last !== "string") invalid("streak.last");
  if (streak.last === "") {
    if (streakCount !== 0) invalid("streak.count");
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(streak.last)) invalid("streak.last");
    const date = new Date(`${streak.last}T12:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== streak.last) invalid("streak.last");
  }
  if (!raw.progress || typeof raw.progress !== "object" || Array.isArray(raw.progress)) invalid("progress");
  const entries = Object.entries(raw.progress);
  if (entries.length > kanji.size) invalid("progress");
  const progress: Record<string, CardProgress> = {};
  for (const [character, value] of entries) {
    if (!kanji.has(character)) invalid("progress.character");
    const card = object(value, ["mastery", "ivl", "ease", "due", "correct", "wrong"], `progress.${character}`, ["rt", "prod", "fl"]);
    progress[character] = {
      mastery: bounded(card.mastery, "mastery", 0, 3, true) as CardProgress["mastery"],
      ivl: bounded(card.ivl, "ivl", 0, MAX_TIMESTAMP / 86_400_000),
      ease: bounded(card.ease, "ease", 1.3, 3),
      due: bounded(card.due, "due", 0, MAX_TIMESTAMP, true),
      correct: count(card.correct, "correct"),
      wrong: count(card.wrong, "wrong"),
      ...(card.rt !== undefined ? { rt: bounded(card.rt, "rt", 0, 600_000) } : {}),
      ...(card.prod !== undefined ? { prod: count(card.prod, "prod") } : {}),
      ...(card.fl !== undefined ? { fl: count(card.fl, "fl") } : {}),
    };
  }
  return {
    curriculumVersion: CURRICULUM_VERSION,
    unlockedChapters,
    progress,
    streak: { count: streakCount, last: streak.last },
    coins: count(raw.coins, "coins"),
    runsCompleted: count(raw.runsCompleted, "runsCompleted"),
    gatesCleared: clearedChapters.length,
    clearedChapters,
    selectedLevel: raw.selectedLevel,
    ...(raw.stack !== undefined ? { stack: parseStack(raw.stack) } : {}),
  };
}

function day(value: unknown, field: string): string {
  if (value === "") return "";
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(field);
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid(field);
  return value;
}

function parseStack(value: unknown): NonNullable<SaveData["stack"]> {
  const s = object(value, ["bestSheet", "bestMarathon", "bestSprintMs", "sheetsCleared", "lastSealDay", "quests", "freezes", "cosmetics", "perfectGates", "playDay", "playMs", "strokeDay"], "stack");
  const q = object(s.quests, ["day", "sheets", "redeems", "typed"], "quests");
  const f = object(s.freezes, ["count", "granted", "lastUsedDay"], "freezes");
  const c = object(s.cosmetics, ["owned", "stamp", "paper"], "cosmetics");
  const stamps = ["hanko", "sakura", "wave"];
  const papers = ["washi", "indigo", "moss"];
  if (!Array.isArray(c.owned) || c.owned.length > 6 || new Set(c.owned).size !== c.owned.length || c.owned.some((id) => ![...stamps, ...papers].includes(id as string))) invalid("cosmetics.owned");
  if (typeof c.stamp !== "string" || !stamps.includes(c.stamp) || !c.owned.includes(c.stamp)) invalid("cosmetics.stamp");
  if (typeof c.paper !== "string" || !papers.includes(c.paper) || !c.owned.includes(c.paper)) invalid("cosmetics.paper");
  return {
    bestSheet: count(s.bestSheet, "bestSheet"), bestMarathon: count(s.bestMarathon, "bestMarathon"),
    bestSprintMs: count(s.bestSprintMs, "bestSprintMs"), sheetsCleared: count(s.sheetsCleared, "sheetsCleared"),
    lastSealDay: day(s.lastSealDay, "lastSealDay"),
    quests: { day: day(q.day, "quests.day"), sheets: count(q.sheets, "quests.sheets"), redeems: count(q.redeems, "quests.redeems"), typed: count(q.typed, "quests.typed") },
    freezes: { count: bounded(f.count, "freezes.count", 0, 3, true), granted: bounded(f.granted, "freezes.granted", 0, 7, true), lastUsedDay: day(f.lastUsedDay, "lastUsedDay") },
    cosmetics: { owned: c.owned as string[], stamp: c.stamp, paper: c.paper }, perfectGates: chapterList(s.perfectGates, "perfectGates"),
    playDay: day(s.playDay, "playDay"), playMs: count(s.playMs, "playMs"), strokeDay: day(s.strokeDay, "strokeDay"),
  };
}

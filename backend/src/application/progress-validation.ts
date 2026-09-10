import { AppError } from "../domain/errors.js";
import type { CardProgress, SaveData } from "../domain/models.js";
import { CHAPTER_IDS, CURRICULUM_VERSION, KANJI_CHARACTERS } from "../domain/curriculum.js";

const kanji = new Set([...KANJI_CHARACTERS]);
const chapters = new Set<number>(CHAPTER_IDS);
const MAX_TIMESTAMP = 8_640_000_000_000_000;

function invalid(field: string): never {
  throw new AppError("INVALID_PROGRESS", `Invalid progress field: ${field}.`, 400);
}

function object(value: unknown, fields: readonly string[], field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(field);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !fields.includes(key)) || fields.some((key) => !Object.hasOwn(result, key))) invalid(field);
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

/** Reject malformed writes rather than silently dropping account progress. */
export function parseSaveData(value: unknown): SaveData {
  const raw = object(value, ["curriculumVersion", "unlockedChapters", "progress", "streak", "coins", "runsCompleted", "gatesCleared", "clearedChapters", "selectedLevel"], "save");
  if (raw.curriculumVersion !== CURRICULUM_VERSION) invalid("curriculumVersion");
  if (raw.selectedLevel !== "N5" && raw.selectedLevel !== "N4") invalid("selectedLevel");
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
    const card = object(value, ["mastery", "ivl", "ease", "due", "correct", "wrong"], `progress.${character}`);
    progress[character] = {
      mastery: bounded(card.mastery, "mastery", 0, 3, true) as CardProgress["mastery"],
      ivl: bounded(card.ivl, "ivl", 0, MAX_TIMESTAMP / 86_400_000),
      ease: bounded(card.ease, "ease", 1.3, 3),
      due: bounded(card.due, "due", 0, MAX_TIMESTAMP, true),
      correct: count(card.correct, "correct"),
      wrong: count(card.wrong, "wrong"),
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
  };
}

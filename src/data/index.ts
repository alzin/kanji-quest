import { allKanji as n5Kanji } from "./n5";
import { n4Kanji } from "./n4";
import type { Kanji } from "./n5/types";

import type { JLPTLevel } from "./regions";
export { CHAPTER_NAMES, CHAPTER_COUNT, CURRICULUM_VERSION, LEVELS, LEVEL_CHAPTERS, REGIONS, LEGACY_CHAPTERS, levelOfChapter, nextChapter } from "./regions";
export type { JLPTLevel } from "./regions";
export const allKanji: Kanji[] = [...n5Kanji, ...n4Kanji];
export const kanjiByChar = new Map(allKanji.map((k) => [k.c, k]));

export function kanjiOfLevel(level: JLPTLevel): Kanji[] {
  return level === "N5" ? n5Kanji : n4Kanji;
}

export function kanjiOfChapter(ch: number): Kanji[] {
  return allKanji.filter((k) => k.ch === ch);
}

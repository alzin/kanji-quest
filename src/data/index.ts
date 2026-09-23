import { allKanji as n5Kanji } from "./n5";
import { n4Kanji } from "./n4";
import { n3Kanji } from "./n3";
import type { Kanji } from "./n5/types";

import type { JLPTLevel } from "./regions";
export { CHAPTER_NAMES, CHAPTER_COUNT, CURRICULUM_VERSION, LEVELS, LEVEL_CHAPTERS, REGIONS, LEGACY_CHAPTERS, levelOfChapter, nextChapter, previousLevel, nextLevel } from "./regions";
export type { JLPTLevel } from "./regions";
export const allKanji: Kanji[] = [...n5Kanji, ...n4Kanji, ...n3Kanji];
export const kanjiByChar = new Map(allKanji.map((k) => [k.c, k]));

export function kanjiOfLevel(level: JLPTLevel): Kanji[] {
  return { N5: n5Kanji, N4: n4Kanji, N3: n3Kanji }[level];
}

export function kanjiOfChapter(ch: number): Kanji[] {
  return allKanji.filter((k) => k.ch === ch);
}

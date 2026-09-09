import { allKanji as n5Kanji, CHAPTER_NAMES as n5Chapters } from "./n5";
import { n4Kanji } from "./n4";
import type { Kanji } from "./n5/types";

export type JLPTLevel = "N5" | "N4";
export const LEVELS: readonly JLPTLevel[] = ["N5", "N4"];
export const LEVEL_CHAPTERS: Record<JLPTLevel, readonly number[]> = {
  N5: [1, 2, 3, 4, 5, 6],
  N4: [7, 8, 9, 10, 11, 12],
};

// Chapter IDs and character keys are permanent save identifiers.
export const CHAPTER_NAMES: Record<number, { name: string; jp: string }> = {
  ...n5Chapters,
  7: { name: "Neighborhood of Connections", jp: "つながりの町" },
  8: { name: "Academy of Ideas", jp: "学びの館" },
  9: { name: "Roads of Discovery", jp: "発見の道" },
  10: { name: "Market of Daily Life", jp: "暮らしの市場" },
  11: { name: "Garden of the Seasons", jp: "四季の庭" },
  12: { name: "Summit of Wellbeing", jp: "元気の頂" },
};
export const CHAPTER_COUNT = Object.keys(CHAPTER_NAMES).length;
export const allKanji: Kanji[] = [...n5Kanji, ...n4Kanji];
export const kanjiByChar = new Map(allKanji.map((k) => [k.c, k]));

export function levelOfChapter(ch: number): JLPTLevel | undefined {
  return LEVELS.find((level) => LEVEL_CHAPTERS[level].includes(ch));
}

export function kanjiOfLevel(level: JLPTLevel): Kanji[] {
  return level === "N5" ? n5Kanji : n4Kanji;
}

export function kanjiOfChapter(ch: number): Kanji[] {
  return allKanji.filter((k) => k.ch === ch);
}

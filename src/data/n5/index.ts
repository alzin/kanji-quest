import { chaptersA } from "./chaptersA";
import { chaptersB } from "./chaptersB";
import type { Kanji } from "./types";
import { arrangeRegions, CHAPTER_NAMES as allChapterNames, LEVEL_CHAPTERS } from "../regions";

export const allKanji: Kanji[] = arrangeRegions([...chaptersA, ...chaptersB], "N5");

export const CHAPTER_NAMES = Object.fromEntries(LEVEL_CHAPTERS.N5.map((ch) => [ch, allChapterNames[ch]!]));

export const CHAPTER_COUNT = LEVEL_CHAPTERS.N5.length;

export const kanjiByChar = new Map(allKanji.map((k) => [k.c, k]));

export function kanjiOfChapter(ch: number): Kanji[] {
  return allKanji.filter((k) => k.ch === ch);
}

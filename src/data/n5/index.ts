import { chaptersA } from "./chaptersA";
import { chaptersB } from "./chaptersB";
import type { Kanji } from "./types";

export const allKanji: Kanji[] = [...chaptersA, ...chaptersB];

export const CHAPTER_NAMES: Record<number, { name: string; jp: string }> = {
  1: { name: "Village of Numbers", jp: "数の里" },
  2: { name: "Fields of Time", jp: "時の野原" },
  3: { name: "Town of People", jp: "人の町" },
  4: { name: "Valley of Colors", jp: "色の谷" },
  5: { name: "River of Actions", jp: "技の川" },
  6: { name: "Mountain of the World", jp: "世界の山" },
};

export const CHAPTER_COUNT = 6;

export const kanjiByChar = new Map(allKanji.map((k) => [k.c, k]));

export function kanjiOfChapter(ch: number): Kanji[] {
  return allKanji.filter((k) => k.ch === ch);
}

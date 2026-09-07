import { allKanji, kanjiByChar } from "@/data/n5";
import type { Kanji, Vocab } from "@/data/n5/types";
import { hasKanji, isHiragana, isKanji, isPlausibleReading, phoneticVariants, readingList } from "./kana";

/** One drawable span of the word shown on a gate. */
export type PromptSegment = {
  t: string;
  furigana?: string; // shown above the span when its kanji is not yet due to be known
  focus?: boolean; // the kanji this card is grading
};

export type WordCard = { kanji: Kanji; vocab: Vocab; kana: string };

/** The reading a word actually has, assembled from its ruby spans. */
export function vocabKana(vocab: Vocab): string {
  return vocab.f.map((s) => (s.r && s.r.length > 0 ? s.r : s.t)).join("");
}

export function vocabSurface(vocab: Vocab): string {
  return vocab.f.map((s) => s.t).join("");
}

// ---------- Indexes ----------

const allVocab: WordCard[] = allKanji.flatMap((kanji) =>
  kanji.vocab.map((vocab) => ({ kanji, vocab, kana: vocabKana(vocab) })),
);

/** Every reading a word is written with anywhere in the curriculum, so a
 *  homograph's other reading is never offered as a wrong answer. */
const kanaByWord = new Map<string, Set<string>>();
for (const card of allVocab) {
  const set = kanaByWord.get(card.vocab.w) ?? new Set<string>();
  set.add(card.kana);
  kanaByWord.set(card.vocab.w, set);
}

/**
 * Readings that are genuinely correct for a word even though the curriculum
 * teaches a different one, so the game never marks a defensible answer wrong.
 * Audited case by case: standalone on'yomi (十 じゅう, 何 なん), weekday and
 * grading abbreviations (月 げつ, 上 じょう), formal doublets (毎年 まいねん,
 * 半年 はんねん) and dictionary alternatives (富士山 ふじやま, 大雨 たいう).
 */
const ALSO_CORRECT: Record<string, string[]> = {
  "十": ["じゅう"],
  "一人": ["いちにん"],
  "二人": ["ににん"],
  "三つ": ["みつ"],
  "四つ": ["よつ"],
  "六つ": ["むつ"],
  "八つ": ["やつ"],
  "七月": ["なながつ"],
  "一時": ["ひととき", "いちどき"],
  "半年": ["はんねん"],
  "毎年": ["まいねん"],
  "月": ["げつ"],
  "水": ["すい"],
  "木": ["もく"],
  "土": ["ど"],
  "中": ["ちゅう"],
  "上": ["じょう"],
  "下": ["げ"],
  "中古": ["ちゅうぶる"],
  "間": ["かん", "けん"],
  "何": ["なん"],
  "入る": ["いる"],
  "大雨": ["たいう"],
  "富士山": ["ふじやま"],
  "目": ["もく"],
};

/** Every spelling that must never appear in a wrong lane for this word. */
export function correctReadings(word: string): Set<string> {
  return new Set([...(kanaByWord.get(word) ?? []), ...(ALSO_CORRECT[word] ?? [])]);
}

/** Readings each kanji is known to take: its listed on/kun plus every reading
 *  it carries inside a curriculum word (which is where rendaku shows up). */
const readingsByKanji = new Map<string, string[]>();
function addReading(character: string, reading: string) {
  if (!isKanji(character) || !isHiragana(reading)) return;
  const list = readingsByKanji.get(character) ?? [];
  if (!list.includes(reading)) list.push(reading);
  readingsByKanji.set(character, list);
}
for (const kanji of allKanji) {
  for (const reading of readingList(kanji.kun)) addReading(kanji.c, reading);
  for (const reading of readingList(kanji.on)) addReading(kanji.c, reading);
}
for (const card of allVocab) {
  for (const span of card.vocab.f) {
    if ([...span.t].length === 1 && span.r) addReading(span.t, span.r);
  }
}

export function readingsOf(character: string): string[] {
  return readingsByKanji.get(character) ?? [];
}

// ---------- Display ----------

/** A supporting kanji is glossed when the learner cannot be expected to read it
 *  yet: outside the curriculum, or from a later chapter than the card's kanji. */
function needsFurigana(text: string, focus: Kanji): boolean {
  return [...text].some((character) => {
    if (!isKanji(character)) return false;
    const other = kanjiByChar.get(character);
    return !other || other.ch > focus.ch;
  });
}

export function wordSegments(vocab: Vocab, focus: Kanji): PromptSegment[] {
  return vocab.f.map((span) => {
    const isFocus = span.t.includes(focus.c);
    const segment: PromptSegment = { t: span.t };
    if (isFocus) segment.focus = true;
    if (!isFocus && span.r && hasKanji(span.t) && needsFurigana(span.t, focus)) {
      segment.furigana = span.r;
    }
    return segment;
  });
}

// ---------- Distractors ----------

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

function spansWithReadings(vocab: Vocab): { index: number; character: string; reading: string }[] {
  return vocab.f.flatMap((span, index) =>
    [...span.t].length === 1 && isKanji(span.t) && span.r
      ? [{ index, character: span.t, reading: span.r }]
      : [],
  );
}

function withReadingAt(vocab: Vocab, index: number, reading: string): string {
  return vocab.f
    .map((span, i) => (i === index ? reading : span.r && span.r.length > 0 ? span.r : span.t))
    .join("");
}

/** Wrong spellings in tiers, hardest first: real readings of the same kanji used
 *  in the wrong slot, then near-misses of the right reading. */
export function readingCandidates(card: WordCard): string[][] {
  const spans = spansWithReadings(card.vocab);
  const swaps: string[] = [];
  const doubleSwaps: string[] = [];

  for (const span of spans) {
    for (const reading of readingsOf(span.character)) {
      if (reading === span.reading) continue;
      swaps.push(withReadingAt(card.vocab, span.index, reading));
    }
  }
  // Two kanji misread at once — the classic "every reading is on'yomi" error.
  for (const a of spans) {
    for (const b of spans) {
      if (b.index <= a.index) continue;
      for (const first of readingsOf(a.character)) {
        if (first === a.reading) continue;
        for (const second of readingsOf(b.character)) {
          if (second === b.reading) continue;
          doubleSwaps.push(
            card.vocab.f
              .map((span, i) => (i === a.index ? first : i === b.index ? second : span.r && span.r.length > 0 ? span.r : span.t))
              .join(""),
          );
        }
      }
    }
  }

  const phonetic = phoneticVariants(card.kana);
  const nearSwaps = swaps.flatMap((swap) => phoneticVariants(swap));
  return [swaps, phonetic, doubleSwaps, nearSwaps];
}

function lengthOf(text: string): number {
  return [...text].length;
}

/** Mora-level edit distance, so a fallback distractor is still a near-miss. */
function editDistance(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  let previous = right.map((_, i) => i);
  previous.unshift(0);
  for (let i = 1; i <= left.length; i++) {
    const row = [i];
    for (let j = 1; j <= right.length; j++) {
      row[j] = Math.min(
        previous[j]! + 1,
        row[j - 1]! + 1,
        previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = row;
  }
  return previous[right.length]!;
}

/** Three choices — the real reading plus the two most confusable wrong ones. */
export function readingChoices(card: WordCard, random: () => number = Math.random, count = 2): string[] {
  const correctLength = lengthOf(card.kana);
  const forbidden = correctReadings(card.vocab.w);
  const chosen: string[] = [];

  const take = (candidates: string[]) => {
    for (const candidate of candidates) {
      if (chosen.length >= count) return;
      if (forbidden.has(candidate) || chosen.includes(candidate)) continue;
      if (!isPlausibleReading(candidate)) continue;
      if (Math.abs(lengthOf(candidate) - correctLength) > 2) continue;
      chosen.push(candidate);
    }
  };

  // Within a tier, closest in length reads as the most plausible misspelling.
  const byCloseness = (a: string, b: string) =>
    Math.abs(lengthOf(a) - correctLength) - Math.abs(lengthOf(b) - correctLength);
  for (const tier of readingCandidates(card)) {
    if (chosen.length >= count) break;
    take(shuffle([...new Set(tier)], random).sort(byCloseness));
  }

  // A one-kanji word with a single listed reading can run the pool dry; the
  // nearest real readings in the curriculum are still tighter than random ones.
  if (chosen.length < count) {
    const others = [...new Set(allVocab.filter((other) => other.vocab.w !== card.vocab.w).map((other) => other.kana))]
      .map((kana) => ({ kana, distance: editDistance(kana, card.kana) }))
      .sort((a, b) => a.distance - b.distance)
      .map((entry) => entry.kana);
    const nearest = others.slice(0, 12);
    take(shuffle(nearest, random));
    take(others);
  }
  return chosen;
}

function normalizedMeaning(meaning: string): string {
  return meaning.toLowerCase().replace(/[.;].*$/, "").trim();
}

/** Meaning distractors prefer words that share a kanji: near-misses, not noise. */
export function meaningChoices(card: WordCard, random: () => number = Math.random, count = 2): string[] {
  const forbidden = new Set(
    allVocab.filter((other) => other.vocab.w === card.vocab.w).map((other) => normalizedMeaning(other.vocab.m)),
  );
  const characters = new Set([...card.vocab.w].filter(isKanji));
  const related: string[] = [];
  const rest: string[] = [];
  for (const other of allVocab) {
    if (other.vocab.w === card.vocab.w) continue;
    const meaning = other.vocab.m;
    if (forbidden.has(normalizedMeaning(meaning))) continue;
    ([...other.vocab.w].some((character) => characters.has(character)) ? related : rest).push(meaning);
  }
  const chosen: string[] = [];
  for (const meaning of [...shuffle([...new Set(related)], random), ...shuffle([...new Set(rest)], random)]) {
    if (chosen.length >= count) break;
    if (chosen.some((value) => normalizedMeaning(value) === normalizedMeaning(meaning))) continue;
    chosen.push(meaning);
  }
  return chosen;
}

export { allVocab };

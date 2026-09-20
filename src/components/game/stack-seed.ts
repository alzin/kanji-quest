import type { Question } from "@/lib/srs";
import { correctReadings, readingCandidates, readingChoices, vocabKana } from "@/lib/words";
import { isPlausibleReading, phoneticVariants } from "@/lib/kana";

export type StackWord = { q: Question; mastery: number; rt: number; fresh: boolean };
export type TileKind = "K" | "R" | "D" | "M" | "G";
export type StackTile = { id: number; word: number; kind: TileKind; text: string; born: number };
export type StackTask = { word: number; kind: "K" | "R" | "M"; target: number; attempt: number; hinted: boolean; held?: boolean };

export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

export function shuffleStack<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(rng() * (i + 1))));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** The forbidden union includes every defensible reading of every partner on the sheet. */
export function stackDecoy(q: Question, forbidden: ReadonlySet<string>, rng: () => number): string {
  const card = { kanji: q.kanji, vocab: q.vocab, kana: vocabKana(q.vocab) };
  const candidates = [...readingChoices(card, rng, 1), ...readingCandidates(card).flat(), ...phoneticVariants(card.kana)];
  const acceptable = (v: string) => !forbidden.has(v) && !correctReadings(q.vocab.w).has(v) && isPlausibleReading(v);
  const first = candidates.find(acceptable);
  if (first) return first;
  // A bounded second mutation still resembles the word; never invent random kana.
  for (const candidate of candidates) {
    const second = phoneticVariants(candidate).find(acceptable);
    if (second) return second;
  }
  const fallback = readingChoices(card, rng, 64).find(acceptable);
  if (!fallback) throw new Error(`No safe distractor for ${q.vocab.w}`);
  return fallback;
}

export function seedStackTiles(words: readonly StackWord[], rng: () => number): { tiles: StackTile[]; tasks: StackTask[] } {
  const forbidden = new Set(words.flatMap((w) => [...correctReadings(w.q.vocab.w), vocabKana(w.q.vocab)]));
  const tiles: StackTile[] = [], tasks: StackTask[] = [];
  words.forEach((w, word) => {
    const base = word * 3;
    tiles.push(
      { id: base, word, kind: "R", text: vocabKana(w.q.vocab), born: 0 },
      { id: base + 1, word, kind: "D", text: stackDecoy(w.q, forbidden, rng), born: 0 },
      { id: base + 2, word, kind: "K", text: w.q.vocab.w, born: 0 },
    );
    const reading: StackTask = { word, kind: "K", target: base, attempt: 0, hinted: false };
    const reverse: StackTask = { word, kind: w.mastery === 2 ? "R" : "M", target: base + 2, attempt: 0, hinted: false };
    tasks.push(...(w.mastery >= 2 ? [reverse, reading] : [reading, reverse]));
  });
  return { tiles, tasks };
}

/** Homographs and homophones go on separate sheets so a defensible answer is never wrong. */
export function composeSheets(words: readonly StackWord[], maxSheets = 4): StackWord[][] {
  const sheets: StackWord[][] = [];
  for (const word of words) {
    const readings = correctReadings(word.q.vocab.w);
    const compatible = (sheet: StackWord[]) => sheet.length < 7 && sheet.every((other) => other.q.vocab.w !== word.q.vocab.w && ![...correctReadings(other.q.vocab.w)].some((r) => readings.has(r)));
    const sheet = sheets.find((s) => s.length < 6 && compatible(s)) ?? sheets.find(compatible);
    if (sheet) sheet.push(word);
    else if (sheets.length < maxSheets) sheets.push([word]);
  }
  // Avoid a one-word tail when it can join a smaller, still-disjoint sheet.
  if (sheets.length > 1) {
    const last = sheets[sheets.length - 1]!;
    const first = sheets[0]!;
    while (last.length < 4 && first.length > 4) {
      const index = first.findIndex((w) => last.every((o) => o.q.vocab.w !== w.q.vocab.w && ![...correctReadings(o.q.vocab.w)].some((r) => correctReadings(w.q.vocab.w).has(r))));
      if (index < 0) break;
      last.push(first.splice(index, 1)[0]!);
    }
  }
  return sheets;
}

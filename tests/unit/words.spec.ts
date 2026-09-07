import { expect, test } from "@playwright/test";
import { allKanji, kanjiByChar } from "../../src/data/n5";
import type { Kanji, Vocab } from "../../src/data/n5/types";
import {
  isHiragana, phoneticVariants, readingList, toHiragana, voicingVariants,
} from "../../src/lib/kana";
import { correctReadings, readingChoices, readingsOf, vocabKana, wordSegments } from "../../src/lib/words";
import { buildQuestion } from "../../src/lib/srs";

const HIRAGANA = /^[ぁ-ゖ]+$/;
const KANJI = /[一-鿿々]/;

function withSeed<T>(seed: number, callback: () => T): T {
  const original = Math.random;
  let value = seed >>> 0;
  Math.random = () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value / 0x1_0000_0000;
  };
  try {
    return callback();
  } finally {
    Math.random = original;
  }
}

const cards: { kanji: Kanji; vocab: Vocab }[] = allKanji.flatMap((kanji) =>
  kanji.vocab.map((vocab) => ({ kanji, vocab })),
);

/** Every reading a surface word takes anywhere, so homographs are not "wrong". */
const kanaByWord = new Map<string, Set<string>>();
for (const { vocab } of cards) {
  const set = kanaByWord.get(vocab.w) ?? new Set<string>();
  set.add(vocabKana(vocab));
  kanaByWord.set(vocab.w, set);
}

const length = (text: string) => [...text].length;

test("kana helpers convert, split and voice readings", () => {
  expect(toHiragana("ジカン")).toBe("じかん");
  expect(toHiragana("じかん")).toBe("じかん");
  expect(readingList("ダイ, タイ")).toEqual(["だい", "たい"]);
  expect(readingList("おお(きい)")).toEqual(["おお"]);
  expect(readingList("ちい(さい), こ")).toEqual(["ちい", "こ"]);
  expect(readingList("—")).toEqual([]);
  expect(readingList("")).toEqual([]);
  expect(voicingVariants("か")).toContain("が");
  expect(voicingVariants("は").sort()).toEqual(["ば", "ぱ"]);
  expect(voicingVariants("ん")).toEqual([]);
  expect(voicingVariants("あ")).toEqual([]);
});

test("phonetic variants are plausible near-misses and never the original", () => {
  for (const reading of ["こう", "がっこう", "しょうがっこう", "じかん", "せんせい", "き", "おおきい"]) {
    const variants = phoneticVariants(reading);
    expect(variants.length, reading).toBeGreaterThan(0);
    for (const variant of variants) {
      expect(variant, reading).not.toBe(reading);
      expect(isHiragana(variant), `${reading} -> ${variant}`).toBe(true);
      expect(Math.abs(length(variant) - length(reading)), `${reading} -> ${variant}`).toBeLessThanOrEqual(1);
    }
    expect(new Set(variants).size, reading).toBe(variants.length);
  }
  expect(phoneticVariants("こう")).toEqual(expect.arrayContaining(["こ", "こお", "ごう"]));
  expect(phoneticVariants("がっこう")).toEqual(expect.arrayContaining(["がこう", "がっこ"]));
  expect(phoneticVariants("しょう")).toContain("しよう");
  expect(phoneticVariants("じかん")).toContain("じっかん");
});

test("each kanji's reading pool covers its listed readings and the ones its words use", () => {
  for (const kanji of allKanji) {
    const pool = readingsOf(kanji.c);
    expect(pool.length, kanji.c).toBeGreaterThan(0);
    expect(new Set(pool).size, kanji.c).toBe(pool.length);
    for (const reading of pool) expect(isHiragana(reading), `${kanji.c}: ${reading}`).toBe(true);
    for (const listed of [...readingList(kanji.on), ...readingList(kanji.kun)]) {
      expect(pool, kanji.c).toContain(listed);
    }
    for (const vocab of kanji.vocab) {
      for (const span of vocab.f) {
        if ([...span.t].length === 1 && span.r) expect(readingsOf(span.t), span.t).toContain(span.r);
      }
    }
  }
});

test("word segments rebuild the word, mark the studied kanji and gloss only harder ones", () => {
  for (const { kanji, vocab } of cards) {
    const segments = wordSegments(vocab, kanji);
    const where = `${kanji.c} in ${vocab.w}`;
    expect(segments.map((s) => s.t).join(""), where).toBe(vocab.w);
    expect(segments, where).toHaveLength(vocab.f.length);

    const focused = segments.filter((s) => s.focus);
    expect(focused.length, where).toBeGreaterThan(0);
    for (const segment of focused) expect(segment.t, where).toContain(kanji.c);
    for (const segment of segments) {
      if (!segment.t.includes(kanji.c)) expect(segment.focus, `${where}: ${segment.t}`).toBeUndefined();
      // The answer is never printed above the kanji being graded.
      if (segment.focus) expect(segment.furigana, `${where}: ${segment.t}`).toBeUndefined();
    }

    segments.forEach((segment, i) => {
      const source = vocab.f[i]!;
      const harder = [...segment.t].some((character) => {
        const other = kanjiByChar.get(character);
        return KANJI.test(character) && (!other || other.ch > kanji.ch);
      });
      if (segment.furigana !== undefined) {
        expect(segment.furigana, `${where}: ${segment.t}`).toBe(source.r);
        expect(harder, `${where}: ${segment.t} is glossed but already learnable`).toBe(true);
      } else if (!segment.focus && KANJI.test(segment.t) && source.r) {
        expect(harder, `${where}: ${segment.t} needs a gloss`).toBe(false);
      }
    });
  }
});

test("reading questions offer three distinct spellings with exactly one correct", () => {
  for (const { kanji, vocab } of cards) {
    const kana = vocabKana(vocab);
    for (let seed = 1; seed <= 8; seed += 1) {
      const question = withSeed(seed * 2_654_435_761 + kanji.c.codePointAt(0)!, () =>
        buildQuestion(kanji, "reading", vocab));
      const where = `${kanji.c} ${vocab.w} seed ${seed}: ${question.choices.join(" | ")}`;

      expect(question.type, where).toBe("reading");
      expect(question.prompt, where).toBe(vocab.w);
      expect(question.answer, where).toBe(kana);
      expect(question.choices, where).toHaveLength(3);
      expect(new Set(question.choices).size, where).toBe(3);
      expect(question.choices.filter((c) => c === question.answer), where).toHaveLength(1);

      for (const choice of question.choices) {
        expect(choice, where).toMatch(HIRAGANA);
        // A wrong lane must never hold a real reading of the same word.
        if (choice !== question.answer) {
          expect(kanaByWord.get(vocab.w)!.has(choice), `${where}: ${choice} is a real reading`).toBe(false);
          expect(Math.abs(length(choice) - length(kana)), where).toBeLessThanOrEqual(2);
        }
      }
    }
  }
});

test("a word's other genuine readings are never offered as a wrong answer", () => {
  // Audited collisions: readings a teacher would have to accept for that word.
  const audited: [string, string][] = [
    ["十", "じゅう"], ["何", "なん"], ["間", "かん"], ["間", "けん"], ["中", "ちゅう"],
    ["上", "じょう"], ["下", "げ"], ["月", "げつ"], ["水", "すい"], ["木", "もく"],
    ["土", "ど"], ["目", "もく"], ["毎年", "まいねん"], ["半年", "はんねん"],
    ["中古", "ちゅうぶる"], ["入る", "いる"], ["大雨", "たいう"], ["富士山", "ふじやま"],
    ["一人", "いちにん"], ["二人", "ににん"], ["一時", "ひととき"], ["一時", "いちどき"],
    ["三つ", "みつ"], ["四つ", "よつ"], ["六つ", "むつ"], ["八つ", "やつ"], ["七月", "なながつ"],
  ];
  for (const [word, reading] of audited) {
    expect(correctReadings(word).has(reading), `${word}: ${reading}`).toBe(true);
  }

  for (const { kanji, vocab } of cards) {
    const card = { kanji, vocab, kana: vocabKana(vocab) };
    const safe = correctReadings(vocab.w);
    for (let seed = 1; seed <= 12; seed += 1) {
      for (const choice of withSeed(seed * 31 + kanji.c.codePointAt(0)!, () => readingChoices(card))) {
        expect(safe.has(choice), `${vocab.w}: "${choice}" is also correct`).toBe(false);
      }
    }
  }
});

test("reading distractors mostly reuse a real reading of a kanji in the word", () => {
  let fromRealReadings = 0;
  let total = 0;
  for (const { kanji, vocab } of cards) {
    if (vocab.f.filter((span) => [...span.t].length === 1 && span.r).length < 2) continue;
    const question = withSeed(kanji.c.codePointAt(0)!, () => buildQuestion(kanji, "reading", vocab));
    for (const choice of question.choices.filter((c) => c !== question.answer)) {
      total += 1;
      // A swap keeps every other span intact, so some real reading still prefixes or suffixes it.
      const swapped = vocab.f.some((span, i) =>
        [...span.t].length === 1 && span.r
        && readingsOf(span.t).some((reading) =>
          reading !== span.r
          && choice === vocab.f.map((s, j) => (j === i ? reading : s.r ?? s.t)).join("")),
      );
      if (swapped) fromRealReadings += 1;
    }
  }
  expect(total).toBeGreaterThan(50);
  expect(fromRealReadings / total).toBeGreaterThan(0.5);
});

test("meaning questions offer three distinct meanings with exactly one correct", () => {
  for (const { kanji, vocab } of cards) {
    for (let seed = 1; seed <= 4; seed += 1) {
      const question = withSeed(seed * 97 + kanji.c.codePointAt(0)!, () =>
        buildQuestion(kanji, "meaning", vocab));
      const where = `${kanji.c} ${vocab.w} seed ${seed}: ${question.choices.join(" | ")}`;
      expect(question.answer, where).toBe(vocab.m);
      expect(question.prompt, where).toBe(vocab.w);
      expect(question.choices, where).toHaveLength(3);
      expect(new Set(question.choices).size, where).toBe(3);
      expect(question.choices.filter((c) => c === question.answer), where).toHaveLength(1);
      // No distractor may be a meaning this very word also carries.
      const own = new Set(cards.filter((c) => c.vocab.w === vocab.w).map((c) => c.vocab.m.toLowerCase()));
      for (const choice of question.choices.filter((c) => c !== question.answer)) {
        expect(own.has(choice.toLowerCase()), `${where}: ${choice}`).toBe(false);
      }
    }
  }
});

test("every card shows a word rather than a bare kanji", () => {
  for (const { kanji, vocab } of cards) {
    for (const type of ["reading", "meaning"] as const) {
      const question = withSeed(7, () => buildQuestion(kanji, type, vocab));
      expect(question.prompt, `${kanji.c} ${type}`).toContain(kanji.c);
      expect(question.vocab.w, `${kanji.c} ${type}`).toBe(vocab.w);
      expect(question.segments.map((s) => s.t).join(""), `${kanji.c} ${type}`).toBe(vocab.w);
      expect(question.sub.trim(), `${kanji.c} ${type}`).toBeTruthy();
    }
  }
});

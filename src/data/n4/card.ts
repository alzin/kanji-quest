import type { Furi, Kanji, Vocab } from "../n5/types";

type Word = readonly [ruby: string, romaji: string, meaning: string];

// Compact authoring notation keeps the reading next to its exact surface span:
// 学[がく]校[こう], 食[た]べる, or a whole irregular span 明日[あした].
function word([ruby, r, m]: Word): Vocab {
  const f: Furi[] = [];
  for (const match of ruby.matchAll(/([一-鿿々]+)\[([ぁ-ゖ]+)\]|([ぁ-ゖー]+)/gu)) {
    f.push(match[1] ? { t: match[1], r: match[2]! } : { t: match[3]! });
  }
  const reconstructed = f.map((span) => span.r ? `${span.t}[${span.r}]` : span.t).join("");
  if (reconstructed !== ruby) throw new Error(`Invalid N4 ruby: ${ruby}`);
  return { w: f.map((span) => span.t).join(""), r, m, f };
}

export function card(ch: number, c: string, m: string, on: string, kun: string, rad: string, strokes: number, mn: string, a: Word, b: Word): Kanji {
  return { ch, c, m, on, kun, rad, strokes, mn, vocab: [word(a), word(b)] };
}

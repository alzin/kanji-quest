import { toHiragana } from "./kana";
import { correctReadings, vocabKana } from "./words";
import type { Vocab } from "@/data/n5/types";

const rows: Record<string, string> = { "": "あいうえお", k: "かきくけこ", g: "がぎぐげご", s: "さしすせそ", z: "ざじずぜぞ", t: "たちつてと", d: "だぢづでど", n: "なにぬねの", h: "はひふへほ", b: "ばびぶべぼ", p: "ぱぴぷぺぽ", m: "まみむめも", r: "らりるれろ" };
const syllables: Record<string, string> = { shi: "し", chi: "ち", tsu: "つ", fu: "ふ", ji: "じ", sha: "しゃ", shu: "しゅ", sho: "しょ", cha: "ちゃ", chu: "ちゅ", cho: "ちょ", ja: "じゃ", ju: "じゅ", jo: "じょ", ya: "や", yu: "ゆ", yo: "よ", wa: "わ", wo: "を", wi: "うぃ", we: "うぇ", vu: "ゔ" };
for (const [prefix, kana] of Object.entries(rows)) [...kana].forEach((c, i) => { syllables[prefix + "aiueo"[i]] = c; });
for (const [prefix, base] of Object.entries({ ky: "き", gy: "ぎ", sy: "し", zy: "じ", jy: "じ", ty: "ち", cy: "ち", dy: "ぢ", ny: "に", hy: "ひ", by: "び", py: "ぴ", my: "み", ry: "り" })) {
  ["a", "u", "o"].forEach((v, i) => { syllables[prefix + v] = base + ["ゃ", "ゅ", "ょ"][i]; });
}

export function readingInput(value: string): string {
  const text = toHiragana(value.normalize("NFKC").trim().toLowerCase()).replace(/ā/g, "aa").replace(/ī/g, "ii").replace(/ū/g, "uu").replace(/ē/g, "ee").replace(/ō/g, "ou").replace(/[\s’]/g, (v) => v === "’" ? "'" : "");
  let result = "", i = 0;
  while (i < text.length) {
    const c = text[i]!, next = text[i + 1];
    if (/[ぁ-ゖー]/.test(c)) { result += c; i++; continue; }
    if (/[bcdfghjkmprstvyz]/.test(c) && c === next) { result += "っ"; i++; continue; }
    if (text.slice(i, i + 3) === "tch") { result += "っ"; i++; continue; }
    if (c === "m" && next && /[bmp]/.test(next)) { result += "ん"; i++; continue; }
    if (c === "n" && next === "n" && /[aiueoy]/.test(text[i + 2] ?? "")) { result += "ん"; i++; continue; }
    if (c === "n" && (next === "'" || next === undefined || (next !== "n" && !/[aiueoy]/.test(next)) || (next === "n" && !/[aiueoy]/.test(text[i + 2] ?? "")))) {
      result += "ん"; i += next === "'" || next === "n" ? 2 : 1; continue;
    }
    let matched = false;
    for (const len of [3, 2, 1]) {
      const kana = syllables[text.slice(i, i + len)];
      if (kana) { result += kana; i += len; matched = true; break; }
    }
    if (!matched) return "";
  }
  return result;
}

function longVowels(value: string): string {
  const vowel = new Map<string, string>();
  Object.values(rows).forEach((row) => [...row].forEach((c, i) => vowel.set(c, "あいうえお"[i]!)));
  for (const [c, v] of Object.entries({ ゃ: "あ", ゅ: "う", ょ: "お", わ: "あ", や: "あ", ゆ: "う", よ: "お", を: "お" })) vowel.set(c, v);
  let result = "", previous = "";
  for (const c of value) {
    if (c === "ー" || (previous && (c === previous || (previous === "お" && c === "う") || (previous === "え" && c === "い")))) { result += "ー"; previous = ""; }
    else { result += c; previous = vowel.get(c) ?? ""; }
  }
  return result;
}

export function acceptsReading(vocab: Vocab, input: string): boolean {
  // Some published curriculum spellings omit the n' boundary (honya for
  // hon'ya). Accept that word's own displayed romanization as an alias,
  // without making the general kana parser conflate にゃ with んや.
  const romanKey = (v: string) => v.normalize("NFKC").toLowerCase().replace(/[\s’']/g, "");
  if (/^[a-zāīūēō]+$/.test(romanKey(input)) && romanKey(input) === romanKey(vocab.r)) return true;
  const normalized = readingInput(input);
  if (!normalized) return false;
  return [...correctReadings(vocab.w), vocabKana(vocab)].some((r) => longVowels(r) === longVowels(normalized));
}

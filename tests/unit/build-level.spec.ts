import { test, expect } from "@playwright/test";
import { buildLevel, dictionaryWords, uniqueCompoundHoles, type AuthoredLevel } from "../../scripts/build-level";

test("dictionary indexes respect reading restrictions and reject ambiguous compound waves", () => {
  const xml = '<entry><k_ele><keb>学校</keb></k_ele><k_ele><keb>学園</keb></k_ele><r_ele><reb>がっこう</reb><re_restr>学校</re_restr></r_ele><r_ele><reb>がくえん</reb><re_restr>学園</re_restr></r_ele></entry><entry><k_ele><keb>高校</keb></k_ele><r_ele><reb>こうこう</reb></r_ele></entry>';
  const words = dictionaryWords(xml);
  expect(words.get("学校")?.has("がくえん")).toBe(false);
  expect(words.get("学園")?.has("がくえん")).toBe(true);
  expect(uniqueCompoundHoles(words, ["学", "高"], ["＿校"])).toBe(false);
  expect(uniqueCompoundHoles(words, ["学", "日"], ["＿校"])).toBe(true);
});

test("level builds require complete reviewed authorship and additive identities", () => {
  // Deliberately synthetic XML fixtures: no dictionary corpus is bundled with the tests.
  const chars = "現政経法";
  const xml = [...chars].map((c) => `<character><literal>${c}</literal><stroke_count>10</stroke_count><reading r_type="ja_on">カ</reading></character>`).join("");
  const words = [...chars].flatMap((c) => ["一", "二", "三"].map((suffix) => `<entry><k_ele><keb>${c}${suffix}</keb></k_ele><r_ele><reb>かな</reb></r_ele></entry>`)).join("");
  const authored: AuthoredLevel = { level: "N3", reviewedBy: "Fixture reviewer", reviewedOn: "2026-09-20", previouslyAdded: "", regions: [{ id: 56, legacyChapter: 13, name: "Fixture", jp: "テスト", chars }], cards: [...chars].map((c, i) => ({ c, m: `Original meaning ${i}`, mn: `An original mnemonic long enough for fixture ${i}.`, rad: "一", keyword: `fixture ${i}`, vocab: ["一", "二", "三"].map((suffix) => ({ w: c + suffix, r: "kana", m: "Original fixture word", f: [{ t: c + suffix, r: "かな" }] })) })) };
  expect(buildLevel("N3", xml, words, chars, authored).cards).toHaveLength(4);
  expect(() => buildLevel("N3", xml, words, chars, { ...authored, reviewedBy: "" })).toThrow(/review/);
  expect(() => buildLevel("N3", xml, words, chars, { ...authored, regions: [{ ...authored.regions[0]!, id: 55 }] })).toThrow(/56/);
  expect(() => buildLevel("N3", xml, words, chars, { ...authored, cards: authored.cards.slice(1) })).toThrow(/one original card/);
  const invalid = structuredClone(authored); invalid.cards[0]!.vocab[0]!.f[0]!.r = "うそ";
  expect(() => buildLevel("N3", xml, words, chars, invalid)).toThrow(/JMdict/);
});

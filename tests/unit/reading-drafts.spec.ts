import { test, expect } from "@playwright/test";
import { REGIONS } from "../../src/data/regions";
import { sentenceDrafts } from "../../content/drafts/reading-ladder";
import { passageDrafts } from "../../content/drafts/passages";
import { kanjiOfLevel } from "../../src/data";

test("keywords are present and unique within each existing level", () => {
  for (const level of ["N5", "N4", "N3"] as const) {
    const cards = kanjiOfLevel(level);
    expect(cards.every((k) => !!k.keyword?.trim())).toBe(true);
    expect(new Set(cards.map((k) => k.keyword!.toLowerCase())).size).toBe(cards.length);
  }
});

test("110 unpublished original drafts cover N5/N4 regions without introducing later kanji", () => {
  expect(sentenceDrafts).toHaveLength(110);
  const known = new Set<string>();
  for (const region of REGIONS.filter((r) => r.level === "N5" || r.level === "N4")) {
    [...region.chars].forEach((c) => known.add(c));
    const sentences = sentenceDrafts.filter((s) => s.region === region.id);
    expect(sentences, region.name).toHaveLength(2);
    for (const sentence of sentences) {
      expect(sentence.reviewed).toBe(false);
      expect(sentence.source).toBe("original");
      const plain = sentence.ruby.replace(/\[[ぁ-ゖ]+\]/gu, "");
      expect(plain, sentence.ruby).toContain(sentence.slot);
      expect([...sentence.slot].some((c) => region.chars.includes(c)), sentence.slot).toBe(true);
      expect(plain.split(sentence.slot)).toHaveLength(2);
      for (const c of plain.match(/\p{Script=Han}/gu) ?? []) expect(known.has(c), `${region.id}: ${sentence.ruby} introduces ${c}`).toBe(true);
      expect(sentence.ruby.replace(/[一-鿿々]+\[[ぁ-ゖ]+\]/gu, "")).not.toMatch(/\p{Script=Han}|\[|\]/u);
      expect(sentence.translation.length).toBeGreaterThan(8);
    }
  }
});

test("fourteen scroll drafts have four to six sentences and only already introduced kanji", () => {
  expect(passageDrafts).toHaveLength(14);
  expect(new Set(passageDrafts.map((p) => p.id)).size).toBe(14);
  for (const passage of passageDrafts) {
    const index = REGIONS.findIndex((r) => r.id === passage.throughRegion);
    expect(index).toBeGreaterThanOrEqual(0);
    const known = new Set(REGIONS.slice(0, index + 1).flatMap((r) => [...r.chars]));
    expect(passage.ruby.length).toBeGreaterThanOrEqual(4);
    expect(passage.ruby.length).toBeLessThanOrEqual(6);
    expect(passage.reviewed).toBe(false);
    const plain = passage.ruby.join("").replace(/\[[ぁ-ゖ]+\]/gu, "");
    for (const c of plain.match(/\p{Script=Han}/gu) ?? []) expect(known.has(c), `${passage.id}: ${c}`).toBe(true);
    if (passage.id === "level-N5") { expect([...plain].length).toBeGreaterThanOrEqual(80); expect([...plain].length).toBeLessThanOrEqual(200); }
  }
});

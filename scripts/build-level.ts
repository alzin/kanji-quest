/** Build-time only. Dictionaries and unreviewed writing never enter the PWA bundle.
 * Run with: node --experimental-strip-types scripts/build-level.ts N3 kanjidic2.xml JMdict_e list.txt authored.json output-directory
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { KANJI_CHARACTERS } from "../backend/src/domain/curriculum.ts";
import type { Kanji } from "../src/data/n5/types.ts";

export type AuthoredLevel = {
  level: "N3" | "N2" | "N1";
  reviewedBy: string;
  reviewedOn: string;
  /** Include N3/N2 characters here when building a subsequent road. */
  previouslyAdded: string;
  regions: { id: number; name: string; jp: string; chars: string; legacyChapter: number }[];
  cards: { c: string; m: string; mn: string; rad: string; keyword: string; vocab: Kanji["vocab"] }[];
};

const decode = (text: string) => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const tags = (xml: string, name: string): string[] => [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "g"))].map((m) => decode(m[1]!));
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

export function dictionaryWords(xml: string): Map<string, Set<string>> {
  const words = new Map<string, Set<string>>();
  for (const entry of tags(xml, "entry")) {
    const surfaces = tags(entry, "keb");
    for (const r of tags(entry, "r_ele")) {
      if (/<re_nokanji\s*\/>/.test(r)) continue;
      const restrictions = tags(r, "re_restr");
      const kana = tags(r, "reb");
      for (const surface of surfaces) {
        if (restrictions.length && !restrictions.includes(surface)) continue;
        const readings = words.get(surface) ?? new Set<string>();
        kana.forEach((reading) => readings.add(reading)); words.set(surface, readings);
      }
    }
  }
  return words;
}

export function buildLevel(level: string, kanjidic: string, jmdict: string, list: string, authored: AuthoredLevel) {
  check(["N3", "N2", "N1"].includes(level), "Choose N3, N2, or N1");
  check(authored.level === level, "Authored level does not match the selected road");
  check(typeof authored.reviewedBy === "string" && authored.reviewedBy.trim().length >= 2, "Native review attribution is required");
  check(/^\d{4}-\d{2}-\d{2}$/.test(authored.reviewedOn) && new Date(`${authored.reviewedOn}T12:00:00Z`).toISOString().slice(0, 10) === authored.reviewedOn, "Record a valid review date");
  const existing = new Set([...KANJI_CHARACTERS, ...authored.previouslyAdded]);
  const expected = new Set((list.match(/\p{Script=Han}/gu) ?? []).filter((c) => !existing.has(c)));
  check(expected.size > 0, "The reference list contains no new characters");
  const metadata = new Map(tags(kanjidic, "character").map((entry) => [tags(entry, "literal")[0]!, entry]));
  const dictionary = dictionaryWords(jmdict);
  check(dictionary.size > 0, "No JMdict entries were read");
  const ids = new Set<number>(), assigned = new Set<string>(), keywords = new Set<string>();
  for (const region of authored.regions) {
    check(Number.isInteger(region.id) && region.id >= 56 && !ids.has(region.id), `Region ID must be unique and at least 56: ${region.id}`);
    check([...region.chars].length >= 4 && [...region.chars].length <= 6, `Region ${region.id} needs four to six kanji`);
    check(region.name.trim() && region.jp.trim(), `Region ${region.id} needs names`);
    ids.add(region.id);
    for (const c of region.chars) { check(expected.has(c) && !assigned.has(c), `Unexpected or repeated region character: ${c}`); assigned.add(c); }
  }
  check(assigned.size === expected.size, "Regions must cover the whole reference list after subtracting earlier levels");
  check(authored.cards.length === expected.size && new Set(authored.cards.map((k) => k.c)).size === expected.size, "Provide exactly one original card per new kanji");
  const cards: (Kanji & { keyword: string })[] = [];
  for (const source of authored.cards) {
    check(expected.has(source.c), `Unexpected card: ${source.c}`);
    check(source.m.trim() && source.mn.trim().length >= 20 && source.rad.trim(), `Original gloss, mnemonic and radical required: ${source.c}`);
    check(source.keyword.trim() && !keywords.has(source.keyword.trim().toLowerCase()), `Unique keyword required: ${source.c}`); keywords.add(source.keyword.trim().toLowerCase());
    check(source.vocab.length >= 3, `Three word contexts required: ${source.c}`);
    const meta = metadata.get(source.c); check(meta, `Missing KANJIDIC2 metadata: ${source.c}`);
    const on = [...meta.matchAll(/<reading\s+r_type="ja_on"[^>]*>(.*?)<\/reading>/g)].map((m) => m[1]!);
    const kun = [...meta.matchAll(/<reading\s+r_type="ja_kun"[^>]*>(.*?)<\/reading>/g)].map((m) => m[1]!.replace(/\.([ぁ-ゖ]+)/g, "($1)"));
    const strokes = Number(tags(meta, "stroke_count")[0]);
    check(strokes > 0 && Number.isInteger(strokes) && on.length + kun.length > 0, `Incomplete character metadata: ${source.c}`);
    const used = new Set<string>();
    for (const word of source.vocab) {
      check(word.w.includes(source.c) && !used.has(word.w), `Words must contain ${source.c} and be distinct: ${word.w}`); used.add(word.w);
      check(word.f.map((f) => f.t).join("") === word.w && word.m.trim() && /^[a-z']+$/.test(word.r), `Incomplete original vocabulary: ${word.w}`);
      const kana = word.f.map((f) => f.r || f.t).join("");
      check(/^[ぁ-ゖー]+$/.test(kana) && dictionary.get(word.w)?.has(kana), `JMdict does not confirm ${word.w} / ${kana}`);
    }
    const ch = authored.regions.find((r) => r.chars.includes(source.c))!.id;
    cards.push({ ...source, on: on.join(", ") || "—", kun: kun.join(", ") || "—", strokes, ch });
  }
  return { level, cards, regions: authored.regions.map((r) => ({ ...r, level })), reviewedBy: authored.reviewedBy, reviewedOn: authored.reviewedOn };
}

/** A compound wave is accepted only if each hole fits exactly one candidate. */
export function uniqueCompoundHoles(dictionary: Map<string, Set<string>>, candidates: string[], holes: string[]): boolean {
  return holes.every((hole) => hole.split("＿").length === 2 && candidates.filter((c) => dictionary.has(hole.replace("＿", c))).length === 1);
}

async function main() {
  const [level, kanjidicPath, jmdictPath, listPath, authoredPath, outPath] = process.argv.slice(2);
  if (!level || !kanjidicPath || !jmdictPath || !listPath || !authoredPath || !outPath) throw new Error("Usage: build-level.ts N3 kanjidic2.xml JMdict_e list.txt authored.json output-directory");
  const [kanjidic, jmdict, list, authoredText] = await Promise.all([kanjidicPath, jmdictPath, listPath, authoredPath].map((path) => readFile(path, "utf8")));
  const result = buildLevel(level, kanjidic!, jmdict!, list!, JSON.parse(authoredText!));
  const out = resolve(outPath);
  await mkdir(out, { recursive: true });
  // Refuse to overwrite an earlier authored release; no source files are modified.
  const manifest = { ...result, curriculumVersion: 2, hashes: [kanjidic, jmdict, list, authoredText].map((data) => createHash("sha256").update(data!).digest("hex")), sources: ["https://www.edrdg.org/edrdg/licence.html", "https://www.tanos.co.uk/jlpt/sharing/"] };
  await writeFile(join(out, `${level.toLowerCase()}-reviewed.json`), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  console.log(`${level}: ${result.cards.length} reviewed cards, ${result.regions.length} additive regions. Integrate explicitly, then regenerate the backend manifest.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}

# N3 study road

The N3 road adds **341 unique kanji in 70 themed regions**, with **1,022 vocabulary examples**, after the 96 N5 and 189 N4 cards. Regions contain 4–6 kanji and progress from family, daily life and feelings to travel, abstract ideas, work and society. This is a kanji study sequence, not a complete JLPT grammar, reading or listening course, and not an official exam syllabus.

## Sources and license

- Character coverage: the `jlpt_new: 3` classification in [David Luz Gouveia's kanji-data](https://github.com/davidluzgouveia/kanji-data/tree/00fd7079c3890f430759536f91aa5e854ec0ca4f), after subtracting characters already in N5/N4. That classification is derived from Jonathan Waller's study lists. No WaniKani fields, mnemonics or proprietary teaching text are used.
- Character readings, stroke counts, classical radicals and English glosses: [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project).
- Vocabulary spellings, readings and English glosses: [JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project). Reading and sense restrictions are respected. Selected words are in `content/n3-vocabulary.tsv`; preferred readings for ambiguous words are explicit in `content/n3-preferred-readings.tsv`.
- Dictionary snapshot: [jmdict-simplified release 3.6.2+20260921173324](https://github.com/scriptin/jmdict-simplified/releases/tag/3.6.2%2B20260921173324), dictionary date 2026-09-21. Input SHA-256 digests are recorded in `manifest.json`.

JMdict and KANJIDIC2 are copyright Jim Breen and the Electronic Dictionary Research and Development Group. Their data is provided under [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/), subject to the [EDRDG license statement](https://www.edrdg.org/edrdg/licence.html). The derived N3 data in `cards.ts`, `readings.ts` and the vocabulary audit is distributed under CC BY-SA 4.0. Changes consist of selecting study entries, choosing glosses, lowercasing character meanings, converting readings to romaji, assigning ruby spans and adding study order and original memory aids. This data license does not change the application's code license.

The region names and mnemonics are original project writing. Mnemonics are imagined memory aids, not historical etymologies. Dictionary validation is automated; no native-speaker review is claimed. Compound readings are split using character readings and common sound changes where possible; irregular readings retain a complete ruby span. Dictionary-confirmed alternative readings are excluded from wrong-answer lanes.

## Progression and compatibility

- All N5 and N4 checkpoint seals are required to unlock N3 lessons. All level tabs remain selectable. Map and collection previews and free dojo writing are available before the lesson road unlocks. Previewing a locked N3 road keeps lessons on the highest unlocked road.
- N3 has its own mastery percentage and 70 completion seals. Daily lessons introduce at most five new cards from one unlocked region and retain eligible due reviews from earlier roads.
- N3 uses additive permanent region IDs 56–125. IDs 1–55 and their content are unchanged. Curriculum version 2 remains valid: its region-seal format has not changed, and old theme-seal migrations never grant N3 seals.
- Deploy the regenerated backend curriculum with this frontend so account saves accept the added IDs, characters and level. No database schema migration is needed.

## Regeneration and review

Download the pinned `kanji.json`, `kanjidic2-en-3.6.2.json` and `jmdict-eng-common-3.6.2.json` snapshots, then run:

```text
python scripts/import-n3.py path/to/kanji.json path/to/kanjidic2-en-3.6.2.json path/to/jmdict-eng-common-3.6.2.json
npm run db:generate-curriculum --prefix backend
npm test
npm run backend:test
```

Review `content/n3-vocabulary-audit.txt` after regeneration. The importer rejects missing vocabulary, unsupported preferred readings, incomplete character or mnemonic coverage, duplicate keywords, and regions outside the 4–6-card range. Each card has three selected contexts except 忙, which uses the two common examples 忙しい and 多忙. Refresh dictionary snapshots as part of curriculum maintenance and review their generated diff; never silently replace the reference coverage or renumber permanent IDs. The separate `scripts/build-level.ts` pipeline for native-reviewed authored releases remains available and continues to enforce its review attribution requirement.

# N2 study road

N2 adds **355 unique kanji in 71 themed regions**, with **1,065 vocabulary examples**. Each region contains five kanji. The road starts with family and daily life and continues through nature, work, society and abstract ideas. This is a kanji study sequence, not an official JLPT syllabus or a complete grammar, listening or reading course.

## Sources and license

- Coverage: `jlpt_new: 2` in [David Luz Gouveia's kanji-data, commit 00fd7079](https://github.com/davidluzgouveia/kanji-data/tree/00fd7079c3890f430759536f91aa5e854ec0ca4f), derived from Jonathan Waller's study lists, excluding every character already taught in N5/N4/N3. No proprietary mnemonics or WaniKani fields are used.
- Character readings, English meanings, stroke counts and classical radicals: [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project).
- Word spellings, readings and English meanings: [JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project). Reading and sense restrictions are respected. The full English dictionary provides contexts for characters with few common entries, including 肯. Selected examples are pinned in `content/n2-vocabulary.tsv`; preferred readings are in `content/n2-preferred-readings.tsv`.
- Dictionary snapshot: [jmdict-simplified 3.6.2+20260921173324](https://github.com/scriptin/jmdict-simplified/releases/tag/3.6.2%2B20260921173324), dictionary date 2026-09-21. Input SHA-256 digests are in `manifest.json`.

JMdict and KANJIDIC2 are copyright Jim Breen and the Electronic Dictionary Research and Development Group. Their data is provided under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), subject to the [EDRDG license statement](https://www.edrdg.org/edrdg/licence.html). The derived `cards.ts`, `readings.ts` and vocabulary audit are distributed under CC BY-SA 4.0. Changes include entry selection, shortened glosses, lowercase meanings, romaji conversion, ruby segmentation and original study order and memory cues. This data license does not change the application's code license.

Region names and memory cues are original project writing. Cues are imagined scenes for recalling meanings, not historical etymologies. Dictionary verification is automated; no native-speaker review is claimed. Irregular word readings retain a whole-word ruby span when character segmentation cannot be verified. Dictionary-confirmed alternative readings are excluded from wrong-answer lanes.

## Progress and compatibility

- N5, N4, N3 and N2 are available immediately. Selecting a level sets the next lesson and adventure to that road; no earlier checkpoint seals are required.
- Each road retains independent mastery and completion. Within a road, clear the previous checkpoint or reach its exact 55% mastery threshold to open the next region. Previously opened regions remain accessible.
- N2 adds permanent region IDs **126–196**. Existing IDs and card identities are unchanged. Curriculum version 2 still applies, and legacy migration never manufactures N2 seals or rewards.
- Due reviews of previously studied, accessible cards remain eligible across roads. Untouched lower levels are not prerequisites or injected as new lesson cards.
- Deploy the updated backend curriculum and level validation with the frontend so account saves accept N2 cards, regions and runner records. Older saves without N2 records initialize them to zero. No database schema migration is required.

## Regeneration

Download the pinned `kanji.json`, `kanjidic2-en-3.6.2.json` and full `jmdict-eng-3.6.2.json` inputs, then run:

```text
python scripts/import-n2.py path/to/kanji.json path/to/kanjidic2-en-3.6.2.json path/to/jmdict-eng-3.6.2.json
npm run db:generate-curriculum --prefix backend
npm test
npm run backend:test
```

The N2 entry point shares N3's dictionary importer. Coverage, distinct vocabulary, preferred readings, keyword uniqueness and region sizes are validated. Review the generated `content/n2-vocabulary-audit.txt` whenever inputs change. Keep the pinned word selections and permanent region IDs stable.

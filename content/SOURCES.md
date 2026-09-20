# Tsumiji content and release status

The 110 sentences and 14 passages under `drafts/` are original writing for this project. They are **unpublished drafts**, not native-reviewed teaching material. No Tatoeba sentences, Heisig text, or WaniKani text were copied. Automated checks verify the region ordering, ruby coverage, blank spans and the N5 passage length; these checks do not replace a native-language review or semantic slot-disjointness review.

The existing N4 curriculum attribution remains in [its source notes](../src/data/n4/SOURCES.md).

## Later-level build inputs

`scripts/build-level.ts` accepts local KANJIDIC2 and JMdict XML, a plain character list transcribed from the chosen Waller reference, and separately authored and reviewed cards. It produces a review manifest; it does not change the running curriculum or download dictionary files into the app.

- Dictionary metadata and word-reading verification: James William Breen and the Electronic Dictionary Research and Development Group, [KANJIDIC](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) and [JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project). The [current EDRDG licence](https://www.edrdg.org/edrdg/licence.html) is CC BY-SA 4.0, with the stated attribution requirements. The importer excludes SKIP codes and dictionary glosses. Any distributed dictionary-derived material still needs its source acknowledgement and applicable licence.
- Study-list reference: Jonathan Waller, [Tanos JLPT resources](https://www.tanos.co.uk/jlpt/). The author permits reuse of nonsold material under [Creative Commons BY with attribution](https://www.tanos.co.uk/jlpt/sharing/). These are study lists, not an official JLPT syllabus. Record the exact downloaded reference and date alongside each authored release.
- Glosses, keywords, mnemonics and word meanings must be separately authored. The build refuses missing review attribution, repeated kanji, fewer than three word contexts, conflicting keywords, unconfirmed word readings, incomplete regions and IDs below 56.

No external dictionary dump or N3–N1 card set has been imported or published in this change. Keep curriculum version 2 until an explicit migration is designed. Before exposing another level, integrate its reviewed cards and regions, widen the frontend/backend level validation together, regenerate the backend curriculum manifest, and verify save compatibility.

## Native review checklist

For each sentence and passage, confirm natural Japanese, accurate translation, grammatical level, ruby boundaries (especially irregular readings), a single defensible blank within its candidate wave, and reasonable progression. Verb slots currently contain inflected forms; the future sentence composer must use those exact forms or explicitly teach the inflection. Record reviewer and review date before moving a draft into runtime data. Review the 12 theme passages as connected prose, not merely isolated sentences.

# N4 study road

This is a curated kanji study sequence, not an official JLPT syllabus or a complete N4 exam course. The [JLPT FAQ](https://www.jlpt.jp/e/faq/) explains that the test does not publish a fixed vocabulary, kanji, or grammar list. N4 also tests grammar, reading, and listening.

The road adds **189 unique kanji and 378 vocabulary examples** after the existing 96-card N5 road. Character coverage was cross-checked against the [Nihongo Online School N4 study list](https://nihongo-online.com/jlpt-n4-kanji-list/), the [Tanos N4 reference](https://www.tanos.co.uk/jlpt/jlpt4/kanji/KanjiList.N4.pdf), and the N4/N5 classifications in [kanji-data](https://github.com/davidluzgouveia/kanji-data). Classifications differ between study lists. Characters already present in N5 are not duplicated; foundation bridge cards for 本・外・午・会・手・足・口 cover omissions in the existing road without changing its saved progress or denominator.

Meanings, vocabulary examples, and memory prompts were authored for this app. Mnemonics are memory aids, not claims about historical character origins. Stroke counts and listed readings were checked against kanji-data's KANJIDIC-derived reference; the download is not shipped or needed at runtime. All 378 ruby readings were also checked against their written romaji. The kanji reading list is intentionally selective; examples can introduce additional readings.

## Sequence

| Permanent region ID | Theme | Cards |
| --- | --- | ---: |
| 7 | Home, family, and relationships | 36 |
| 8 | Learning, language, and ideas | 32 |
| 9 | Places, directions, and travel | 34 |
| 10 | Work, shopping, and daily tasks | 29 |
| 11 | Seasons, nature, food, and culture | 31 |
| 12 | Body, health, and descriptions | 27 |

Every card has two vocabulary examples with explicit ruby spans. Irregular words such as 田舎 and 土産 keep a whole-word span instead of assigning misleading character readings. Supporting kanji from later regions receive furigana in run prompts. The game excludes known alternate word readings and a bare kanji's listed readings from distractors.

## Progress compatibility

- N5 retains permanent region IDs 1–6, its 96 character keys, and its existing mastery denominator. N4 uses IDs 7–12 and its own denominator.
- All six exact N5 checkpoint seals unlock N4. The first N4 region then opens immediately; later N4 regions use the existing exact 55% previous-region threshold.
- Each road needs its own six seals for completion. Existing rewards, streaks, review schedules, and run totals remain shared and preserved.
- A save without a selected level starts at N5. Legacy `gatesCleared` migration is capped at the original six N5 gates; it cannot fabricate N4 seals.
- Map and collection allow N4 previews. Daily lessons and free writing remain on N5 until N4 unlocks. New daily cards come from the selected learning road; due reviews from both unlocked roads share the existing oldest-first review allowance.

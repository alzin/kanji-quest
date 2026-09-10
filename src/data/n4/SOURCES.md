# N4 study road

This is a curated kanji study sequence, not an official JLPT syllabus or a complete N4 exam course. The [JLPT FAQ](https://www.jlpt.jp/e/faq/) explains that the test does not publish a fixed vocabulary, kanji, or grammar list. N4 also tests grammar, reading, and listening.

The road adds **189 unique kanji and 378 vocabulary examples** after the existing 96-card N5 road. Character coverage was cross-checked against the [Nihongo Online School N4 study list](https://nihongo-online.com/jlpt-n4-kanji-list/), the [Tanos N4 reference](https://www.tanos.co.uk/jlpt/jlpt4/kanji/KanjiList.N4.pdf), and the N4/N5 classifications in [kanji-data](https://github.com/davidluzgouveia/kanji-data). Classifications differ between study lists. Characters already present in N5 are not duplicated; foundation bridge cards for 本・外・午・会・手・足・口 cover omissions in the existing road without changing its saved progress or denominator.

Meanings, vocabulary examples, and memory prompts were authored for this app. Mnemonics are memory aids, not claims about historical character origins. Stroke counts and listed readings were checked against kanji-data's KANJIDIC-derived reference; the download is not shipped or needed at runtime. All 378 ruby readings were also checked against their written romaji. The kanji reading list is intentionally selective; examples can introduce additional readings.

## Sequence

| N4 region numbers | Theme | Cards | Regions |
| --- | --- | ---: | ---: |
| 1–6 | Home, family, and relationships | 36 | 6 |
| 7–12 | Learning, language, and ideas | 32 | 6 |
| 13–18 | Places, directions, and travel | 34 | 6 |
| 19–24 | Work, shopping, and daily tasks | 29 | 6 |
| 25–30 | Seasons, nature, food, and culture | 31 | 6 |
| 31–36 | Body, health, and descriptions | 27 | 6 |

Each region holds 4–6 kanji. The explicit character groups, region names, permanent IDs, and road order are maintained in `../regions.ts`. Groups keep useful families together: siblings, compass directions, study/test compounds, buying and borrowing, seasons, and doctor/hospital vocabulary. N5 uses the same approach across 19 regions and its existing 96 kanji.

Every card has two vocabulary examples with explicit ruby spans. Irregular words such as 田舎 and 土産 keep a whole-word span instead of assigning misleading character readings. Supporting kanji from later regions receive furigana in run prompts. The game excludes known alternate word readings and a bare kanji's listed readings from distractors.

## Progress compatibility

- Character keys and each level's mastery denominator stay unchanged. Original IDs 1–12 identify the first smaller region in each old theme; added regions use IDs 13–55. Ordered road arrays determine progression and display numbers, never ID arithmetic.
- All 19 exact N5 checkpoint seals unlock N4. Clearing a checkpoint immediately opens the next region; the exact 55% previous-region mastery threshold is an alternative. Opened regions remain available after review mistakes.
- Completion requires 19 N5 seals or 36 N4 seals. Saves without curriculum version 2 migrate each earned original-theme seal to all its smaller regions, preserving completed roads without adding rewards. Access to previously open themes is preserved too.
- A save without a selected level starts at N5. Legacy `gatesCleared` migration is capped at the original six N5 themes; it cannot fabricate N4 seals. Version 2 saves never reinterpret new seals as original theme seals. Rewards, streaks, review schedules, and run totals remain shared and preserved.
- Map and collection allow N4 previews. Daily lessons and free writing remain on N5 until N4 unlocks. A daily run introduces at most five new kanji from one region and includes up to five oldest eligible due reviews from either unlocked road. Each checkpoint covers its complete 4–6-card region once.

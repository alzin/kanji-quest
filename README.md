# Kanji Quest

Do you know the JLPTs required Kanji lists? Do you know the best way / method to start learning each kanji daily easily and interactivly? What is the out of box ideas that might we create a web application to get anyone to master Kanjis daily and easily? I am thinking about making the whole app as a 2D or 3D game. So for example, having missions to be accompilised each time. Maybe a person running and you have to provide the correct Kanji they need based on context but I am not sure who to allign it with JLPT 5 levels perfectly or do you have any ideas for the game?

## Development

The project includes an Express/TypeScript API with PostgreSQL on Neon, Google sign-in, and account progress saving. Guests can play freely with temporary progress in their current tab. See the [backend setup and deployment guide](backend/README.md) to configure Google OAuth and Neon, migrate the database, and start both applications.

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Game calculations

- Choose N5 or N4 on Home, the map, the collection, or the dojo. N5 has 19 regions and N4 has 36, each with 4–6 kanji grouped within the original themes. Earn all 19 N5 checkpoint seals to open N4's 189 additional kanji and 378 vocabulary examples. You can preview its map and collection before unlocking it. N5 and N4 keep separate mastery percentages and completion seals. [Curriculum scope and references](src/data/n4/SOURCES.md) explain the study coverage and foundation bridge cards.
- Daily runs introduce up to five new cards from one region and include at most five due reviews from both unlocked roads: at most ten words per run. Finishing a region's remaining new cards never pulls in another theme just to fill the queue. Older saves preserve card progress, schedules, mon, streak, and access to previously open regions. Each old earned seal becomes the seals for its smaller regions, without paying additional mon.

- Every daily run, checkpoint, and retry starts with Dojo preparation: study each word with furigana, kana, meaning, and a kanji mnemonic; optionally trace its focus kanji; then recall every reading and meaning without a timer. Incorrect recall checks show feedback and require another attempt. The runner uses the same frozen word queue. Preparation never grades cards or awards mastery, coins, or streaks. Leaving or refreshing starts preparation again.

- A correct answer earns `100 × current consecutive correct answers` points. A mistake resets the combo and costs one of three hearts. Unreached questions are counted separately from mistakes.
- A daily run earns `2 × correct answers + best combo` mon. A checkpoint covers every kanji in its region once and needs at least 70% correct: 3 of 4, 4 of 5, or 5 of 6. It pays 50 mon on its first clearance only and immediately opens the next region. Every finished session, including a failed or passed checkpoint, adds one completed run.
- Mastery progress gives each card 0/1/2/3 points for unseen/learning/reviewing/mastered, divided by the maximum possible points. Displays round to whole percentages, with 100% reserved for all cards mastered. Regions also unlock at the exact 55% previous-region threshold, not a rounded display value. Once opened, regions stay accessible after review mistakes. Road order is explicit in `src/data/regions.ts`; IDs remain stable for saves and links while the UI numbers regions within each road.
- Daily queues take the five oldest eligible due reviews. Mastered cards return when due. Correct answers before a card is due count as practice without advancing its schedule. The first correct interval is 0.02 days (28 minutes 48 seconds), followed by 1 day; later intervals multiply by the prior ease and round to tenths of a day. Mastery requires an interval of at least 21 days. Mistakes shorten the interval to 40%, with a 0.01-day minimum.
- Streaks count local calendar days, including daylight-saving transitions. Tracing uses every pixel with a symmetric 10-pixel square tolerance: at least 70% coverage and strictly less than 45% stray ink, before display rounding. Tracing does not assess stroke order or award mastery.

Save curriculum version 2 distinguishes new region seals from original theme seals. A legacy highest gate count can only grant the original six N5 themes and their replacement seals; it cannot grant N4 seals. Migration is idempotent and keeps completed N5/N4 roads complete. Historical overpaid rewards cannot be reconstructed because saves contain no run history.

## Verification

`npm test` runs deterministic calculation and curriculum tests without a browser. `npm run typecheck` checks application types. `npm run test:pwa` builds the app and runs browser, gameplay, progress, mobile, and offline tests in Chromium and WebKit. `npm run test:pages` checks the static Pages build with the same browser suite.

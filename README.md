# Kanji Quest

Do you know the JLPTs required Kanji lists? Do you know the best way / method to start learning each kanji daily easily and interactivly? What is the out of box ideas that might we create a web application to get anyone to master Kanjis daily and easily? I am thinking about making the whole app as a 2D or 3D game. So for example, having missions to be accompilised each time. Maybe a person running and you have to provide the correct Kanji they need based on context but I am not sure who to allign it with JLPT 5 levels perfectly or do you have any ideas for the game?

## Development

The title screen leads into **Spirit Trail**, a playable Phaser 4.2.1 forest adventure. Walk with Aki, gather fireflies, light a lantern through kanji meanings, rebuild a bridge through readings, carry its light through **Lantern Dash**, and wake the shrine with typed recall. The learning dashboard is now **Camp**. Word Weaver (Tsumiji), Lantern Dash (`/run?mode=runner`), and the Ink Dojo remain available as alternate practice modes. See [Spirit Trail architecture and playtest guide](docs/spirit-trail.md).

The project includes an Express/TypeScript API with PostgreSQL on Neon, Google sign-in, and account progress saving. Guests can play freely with temporary progress in their current tab. See the [backend setup and deployment guide](backend/README.md) to configure Google OAuth and Neon, migrate the database, and start both applications.

**Lantern Dash: Firefly Rescue** is the adventure-first runner. Three short woodland stages combine lane movement, a rechargeable Lantern Burst, rescued spirit companions, word gates you answer by steering into the right lane, and two branching trail upgrades. It is the third step of every region checkpoint on the map, carrying only that region's words, and it stays playable from Camp at `/run?mode=runner` as a daily review run. See the [Firefly Rescue guide](docs/firefly-rescue.md) for controls, learning/reward rules, architecture, and release compatibility.

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Game calculations

- Choose **N5, N4, N3 or N2** on Camp, the map, the collection, or the dojo. Every level is available immediately, with no requirement to finish earlier levels. N5 has 96 kanji in 19 regions; N4 adds 189 in 36 regions; N3 adds 341 in 70 regions; and **N2 adds 355 in 71 regions, with 1,065 vocabulary examples**. Each road keeps separate mastery and completion seals. Regions within a road still open progressively. [N2 coverage, dictionary attribution and regeneration](src/data/n2/SOURCES.md). [N3 sources](src/data/n3/SOURCES.md). [N4 scope and references](src/data/n4/SOURCES.md).
- Daily runs introduce up to five new cards from one region and include at most five due reviews from any accessible, previously studied road: at most ten words per run. Finishing a region's remaining new cards never pulls in another theme just to fill the queue. Older saves preserve card progress, schedules, mon, streak, and access to previously open regions. Each old earned seal becomes the seals for its smaller regions, without paying additional mon.

- Formal runner checkpoints (`/run?mode=runner&gate=…`) retain Dojo preparation: study each word with furigana, kana, meaning, and a kanji mnemonic; optionally trace its focus kanji; then recall every reading and meaning without a timer. Incorrect recall checks show feedback and require another attempt. The checkpoint uses the same frozen word queue. Preparation never grades cards or awards mastery, coins, or streaks. Firefly Rescue instead teaches on the trail: 22 word gates per adventure, new words introduced in slow motion and brought back on a spaced schedule, and optional study before playing.

- In formal runner checkpoints, a correct answer earns `100 × current consecutive correct answers` points. A mistake resets the combo and costs one of three hearts. Unreached questions are counted separately from mistakes. Firefly Rescue scores traversal separately; wrong words never cost hearts, and obstacle collisions never grade kanji.
- A region checkpoint (`/run?gate=…`, opened from the map) is three planned steps over every word of the region, then a typed seal: **1. Learn & write** (open each word, optionally trace its kanji), **2. Stack & recall** (Tsumiji sheets; clear at least 70% of the words), **3. Firefly Rescue** (22 word gates drawn only from the region; reaching the shrine completes the step). The seal then asks for 2 of 3 typed readings; a failed seal reopens step 3. Each completed step is saved per region (`checkpointSteps`), so the map shows where every region stands and a learner who leaves resumes at the step they reached. Stamping the seal clears that region's steps.
- A daily run earns `2 × correct answers + best combo` mon. A checkpoint covers every kanji in its region once and needs at least 70% correct: 3 of 4, 4 of 5, or 5 of 6. It pays 50 mon on its first clearance only and immediately opens the next region. Every finished session, including a failed or passed checkpoint, adds one completed run.
- Mastery progress gives each card 0/1/2/3 points for unseen/learning/reviewing/mastered, divided by the maximum possible points. Displays round to whole percentages, with 100% reserved for all cards mastered. Regions also unlock at the exact 55% previous-region threshold, not a rounded display value. Once opened, regions stay accessible after review mistakes. Road order is explicit in `src/data/regions.ts`; IDs remain stable for saves and links while the UI numbers regions within each road.
- Daily queues take the five oldest eligible due reviews. Mastered cards return when due. Correct answers before a card is due count as practice without advancing its schedule. The first correct interval is 0.02 days (28 minutes 48 seconds), followed by 1 day; later intervals multiply by the prior ease and round to tenths of a day. Mastery requires an interval of at least 21 days. Mistakes shorten the interval to 40%, with a 0.01-day minimum.
- Streaks count local calendar days, including daylight-saving transitions. Tracing uses every pixel with a symmetric 10-pixel square tolerance: at least 70% coverage and strictly less than 45% stray ink, before display rounding. Tracing does not assess stroke order or award mastery.

Save curriculum version 2 distinguishes new region seals from original theme seals. A legacy highest gate count can only grant the original six N5 themes and their replacement seals; it cannot grant N4 seals. Migration is idempotent and keeps completed N5/N4 roads complete. Historical overpaid rewards cannot be reconstructed because saves contain no run history.

## Verification

`npm test` runs deterministic calculation and curriculum tests without a browser. `npm run typecheck` checks application types. `npm run test:pwa` builds the app and runs browser, gameplay, progress, mobile, and offline tests in Chromium and WebKit. `npm run test:pages` checks the static Pages build with the same browser suite.

## Environments

The test and production environments share this repository and differ only in build
inputs and the cloud resources they target.

- **Test** — pushes to `main` publish the static build to GitHub Pages at
  `https://alzin.github.io/kanji-quest/`, backed by the `kanji-quest-api` Cloud Run
  service and the Neon test project.
- **Production** — pushes to `production` build both containers and deploy them to
  Cloud Run behind `https://kanji.nipporia.com` and `https://kanji-api.nipporia.com`,
  after an approval on the `production` GitHub environment.

Promote a release by fast-forwarding the branch to a commit already verified on the
test site:

```sh
git checkout production && git merge --ff-only main && git push origin production
```

Setup and operational procedures are in the [production runbook](docs/PRODUCTION.md).

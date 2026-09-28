# Lantern Dash: Firefly Rescue

Open `/run?mode=runner`. No preparation is required. Move between three lanes with Left/Right, A/D, 1–3, a horizontal swipe, or a lane tap. Space and the Burst button activate a lantern shield that frees cages on contact. Esc pauses; blur and hidden tabs pause automatically, and a frame longer than one second is discarded as a stall. Route choices stop every gameplay timer.

## Words on the trail

The words are what you steer by. Each adventure has 22 word gates (eight in each of the first two stages, six in the last). A gate row is three lantern plates, one per lane, and the **lantern call** under the HUD shows what to look for while the row travels toward Aki: 3.4 seconds of trail time, which is about 3.1 seconds at the opening pace on Standard and 4.5 seconds on Gentle Journey. Be in the right lane when the row arrives.

- **Reading gates** show the word (with furigana only for kanji from later chapters) and put three readings on the plates.
- **Listen gates** speak and show the kana and put three written words on the plates, preferring words that share a kanji, so the choice is about telling kanji forms apart. A word that can be read the same way is never offered, and only words shown without furigana are asked this way.
- **Introductions** carry the same golden word on every plate. The call shows the word, reading, meaning and mnemonic, speaks it, and the trail slows to 60% until the row passes. The first ask of each new word is slowed the same way.

A right answer scores 50 × the collection multiplier and extends the chain; every third right answer in a row adds a Burst charge. A wrong answer breaks the chain and streak, never a heart. The chosen plate dims, the right word drifts to Aki, and the call's echo line shows and speaks the correction. The gate after a miss is always a silent reading gate, so the correction is heard. Gates sit further apart than the longest call, so only one call is ever live and each gate's words are chosen after the previous answer.

## Pace and feel

The trail quickens. On Standard the pace starts at 1.1× and climbs steadily to 1.35× by the shrine; every correct answer in a row adds up to 0.1× more (full at six), and a miss lets that lift ease away over about a second. Gentle Journey climbs from 0.8× to 0.95× with a smaller lift. The banner shows the current pace (⚡) and any streak of three or more (🔥). Trail time, gate spacing and every rule above are measured along the trail, so the pace changes only how fast real time passes.

The trail is drawn in gentle perspective: objects linger in the distance, grow and rush in as they reach Aki, and the lanes converge slightly toward the horizon. Ground stones and flecks are pinned to the trail; side scenery and speed lines move with the pace. Aki's stride quickens with the pace, each footfall bobs and lifts dust, lane changes lean and leave lantern-tinted afterimages, and the lantern swings.

Answers get arcade feedback. A hit bursts sparks and a shockwave from the plate, flashes the screen, punches the camera, hops Aki through the gate, floats the points, and calls a cheer that grows with the streak: いいね! (nice), すごい! (great), さいこう! (awesome), かんぺき! (perfect). Every third in a row adds confetti, a charge fanfare and "+1 BURST". A miss shatters the chosen plate, shakes the camera, stumbles Aki and calls おしい! (so close). Introductions call はじめまして! and each new stage calls スピードアップ!. The runner has its own synthesized sounds (`gateHit`, `gateStreak`, `gateMiss`, `gateIntro`, `paceUp` in `src/lib/sfx.ts`): quick rising chip-tone notes on a kick that climb with the streak, a short fanfare, a friendly descending "bwoop", a rising chime and a whoosh, all in the music's D pentatonic key. Reduced motion removes shake, zoom, hops, afterimages, dust and speed lines and softens the flash.

## Adventure rules

Three 30-second traversal stages end in two route choices and the shrine. Standard starts with three hearts; Gentle Journey has five hearts and a slower pace. Both use the same learning rules, with separate records. Bursts start with one of two charges, last one second, and replenish every twelve traversal seconds. Thorns sit only in the gaps between word gates, never within 0.8 seconds of one: one row per gap in the first stage, then a dodge, a dodge and a choice. Collisions cost one heart and grant 1.5 seconds of immunity. Each stage offers two optional rescues, placed in quiet gaps.

Firefly Grove adds a magnet; Bramble Run extends Burst to 1.5 seconds and adds a cage. Quiet Bridge adds a single-hit shield that also protects the collection chain and halves the thorns; Moonpath adds a third charge, grants one immediately, and adds a cage. Upgrades reset on replay.

Fireflies score 10 × the collection multiplier (×1–4, rising every ten collections). Introductions score 25, a rescue 250, and delivery adds 500. Nine spirits, three per biome, unlock three lantern cosmetics at 3/6/9 collected identities. Spirits enter the journal only on delivery; failed attempts retain their score record and already recorded learning.

## Learning and saves

At launch the adventure chooses its deck: up to five due reviews (oldest first), new words scaled to the review load (four with zero or one review, down to one with five), and up to six familiar words. Which word each gate asks is decided as the gate comes into sight:

1. a word whose in-adventure spacing is due, never the word that just passed;
2. the first ask of a due review;
3. a new word, once every word being learned has two correct answers;
4. a word due one gate from now;
5. a familiar word, least recently seen first;
6. a new word while fewer than two are still fresh.

A new word returns two gates after its introduction, then three and six gates after correct answers; a third correct answer settles it for the adventure. A miss brings the same word back two gates later in the same kind of gate and restarts its spacing. Familiar kanji move to their next vocabulary word after a correct answer.

Only the first eligible recall per kanji grades SRS: a due review's first ask, or a new word's first reading ask at least three gates after its introduction. Eligibility is rechecked when answering, and at most five grades are recorded per adventure. Familiar practice, introductions and collisions never grade. A replaced account/progress snapshot invalidates the adventure ledger. Each terminal adventure commits once, awarding two mon per correctly graded card (maximum ten), run/streak progress, records, and delivered collection entries. Leaving early keeps recorded recall but awards no terminal reward. The results list every word actually met, with one mark per attempt.

**Meet the words first** previews the reviews and new words of the exact adventure it starts. Guest saves remain tab-local. Optional automatic save nudges wait until the player leaves Firefly Rescue; explicit account prompts and conflicts are never deferred. Use **Save progress** on the launch screen to sign in. Whole-save cloud/device conflict choices remain authoritative.

**Release order:** deploy backend runner validation and older-client preservation before the frontend. Existing JSONB storage needs no migration. An older client omitting `runner` retains the stored runner object in the same optimistic-version update; an explicit runner object replaces it normally. Gate timing and deck rules are client-only. Formal chapter checkpoints and the expedition dash retain their existing implementation.

## Architecture and verification

- `src/components/game/firefly/simulation.ts`: deterministic fixed-step rules, with authored silhouettes in `patterns.ts`; no Phaser or React dependencies. A sighted gate without words stops traversal until `advanceWithGates` supplies them, so outcomes are identical at any frame rate.
- `FireflyScene.ts` and `art.ts`: disposable Phaser rendering. Gate plates use pooled text labels that wrap long readings and redraw once Japanese font subsets load. The trail starts below the measured lantern call. The existing protagonist's four-frame strip retains its anchors; new spirit strips use shared frame dimensions and anchors. Three biome palettes, trees, river edges, lanterns, cages, followers and Burst effects are local procedural art with no network asset dependency.
- `FireflyAdventure.tsx`: keyboard/pointer input, the lantern call, DOM overlays, loading/pause/account boundaries and immediate replay. A screen-reader live region announces each call and its three paths.
- `src/lib/firefly-learning.ts`, `firefly-progress.ts`, and `firefly-catalog.ts`: deck, gate planning and in-adventure spacing, grading ledger, serializable progress, gate timing and stable identities. `wordChoices` in `src/lib/words.ts` supplies listen-gate distractors.

Run `npm test`, `npm run typecheck`, `npm run backend:test`, and `npm run build`. `npm run test:firefly` runs keyboard/pointer adventures through every word gate and fork combination, misses, fresh-word grading, failure, delivery, replay, and small-screen checks in desktop Chromium, Android Chromium, and iPhone WebKit. It reuses the development server on port 3000; set `FIREFLY_BASE_URL` to test another development URL. The read-only `__fireflyInspect` probe exists only in development and cannot control the simulation. Account and pronunciation tests are also available through `playwright.firefly.config.ts`.

Generated route tests verify gate spacing, clearances and a reachable path without Burst, and equivalent outcomes across frame rates. Browser tests drive actual inputs and capture representative screenshots. Voluntary replay and long-term retention still require sessions with real players.

For the first player sessions, give a fresh player the launch screen and no verbal instructions. Observe whether they read the first introduction, understand that the plates are answers, and choose **Run again** without prompting. Record gates missed for reading speed versus wrong answers, collisions, and voluntary replays separately; tune the call window and thorn density before adding pressure elsewhere.

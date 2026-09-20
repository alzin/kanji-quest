# Tsumiji implementation status

The working app uses stack mode as its daily default, as requested. This change implements the core N5/N4 game and most Phase 2 features. It does **not** complete the four-phase curriculum plan or deploy it to production.

## Playable now

- `/run` and region checkpoints use Tsumiji. `/run?mode=runner` remains reachable as Classic run from the map.
- Deterministic 5×8 phone / 6×10 desktop simulation: K/R/M matches, board-safe decoys, Hold, tap/swipe/keyboard controls, lock delay, ink correction, retries, redemption, passive chains, rescue and top-out.
- New words use Learn-only preparation. The daily queue draws up to 12 reviews and 4 new kanji, split into at most four disjoint sheets. Each sheet saves its rewards once. Retrying a top-out preserves that sheet's words.
- Reading direction follows mastery, and response times, fluent streaks and production successes are saved. Extra stack play cannot reschedule not-due cards. Two production successes are required for new mastery-3 promotions; existing mastery-3 saves are retained.
- Region checkpoints use both vocabulary contexts and a three-word typed Seal check. Hiragana, katakana, common romaji conventions, long vowels and the curriculum's displayed romanizations are accepted. Perfect repeats award 10 mon and a gold map rim.
- Daily seals, personal bests, optional Fluency and Marathon, three daily quests, free streak freezes, a seven-day message and stamp/paper cosmetics inside Collection. The four-link navigation is preserved.
- New save fields are optional at the backend boundary. Old saves remain valid, and normalization supplies deterministic defaults.

## Content prepared but unpublished

- Unique keywords for all 285 existing cards are live.
- `content/drafts/reading-ladder.ts` contains 110 original sentence drafts, two per region, with ruby, translation, blank and part-of-speech tags.
- `content/drafts/passages.ts` contains 12 theme drafts and two level-scroll drafts. They use only kanji introduced through their stated region. The N5 level draft meets the 80–200-character constraint.
- These drafts deliberately have `reviewed: false` and are not imported into the app. Structural tests do not certify Japanese naturalness, grammatical level or semantic ambiguity. See `content/SOURCES.md` for the review requirements.
- `scripts/build-level.ts` verifies separately authored, reviewed N3/N2/N1 cards against local KANJIDIC2, JMdict and a supplied study list. It checks dictionary reading restrictions, three vocabulary contexts, unique keywords, region sizes, additive IDs and source hashes. It outputs a manifest, not a live curriculum.

Example importer invocation (local inputs must already exist):

```powershell
node --experimental-strip-types scripts/build-level.ts N3 kanjidic2.xml JMdict_e N3.txt authored-N3.json output-N3
```

## Remaining plan work

1. Compound-hole blocks, two-column sentence strips, sentence-row line clears, scroll routes, reveal tracking, passage saves and passage-based level completion are not implemented. Their data need a native-language review before publication.
2. The approximately 1,900 N3–N1 cards and their original glosses, mnemonics and three contexts have not been authored/imported. The runtime and backend still expose N5/N4 only. Later level integration and regenerated backend curriculum remain necessary; curriculum version stays 2.
3. The composer guarantees a reachable perfect path and safe decoy *content*. It does not guarantee that each current word's own decoy is exposed among column tops. No 20% guessing-rate claim is established.
4. Retries are inserted after two queued tasks, but reachability can change the actual spawn order. Fresh-word ordering prefers intervening pieces where possible; an all-new first sheet cannot supply two already-known blocks. There is no enforced one-minute introduction delay.
5. Gravity uses the specified deterministic 150 ms resolver phase; the canvas snaps settled columns at the end rather than tweening every falling stack tile. Human timing, guess rates and retrieval distributions across mastery tiers still need playtesting. The recording uses scripted fast decisions and does not establish a 60–90-second human sheet time.
6. Classic run is retained. A true near-chain result measure and full runner retirement remain deferred.

## Verification and reproduction

- `npm test`: 115 unit tests (including all-word decoy audit, seeded perfect paths, miss recovery, conservation and elapsed-time splitting).
- `npm run typecheck` and `npm run backend:typecheck`.
- `npm run backend:test`: 15 passed; the real PostgreSQL driver integration is skipped without `TEST_DATABASE_URL`. The embedded database tests pass.
- `npm run build` then `npx playwright test --project=android-chromium`: 50 passed, including offline navigation, two-sheet chaining, typed seals, not-due fluency, pause/blur and retry preservation.
- `scripts/film-stack.mjs` records the real column controls at a 375×812 viewport with Google Fonts blocked and captures a separate 320×568 layout. It needs Playwright Chromium and ffmpeg. `artifacts.local/tsumiji-final/two-sheets-60fps.mp4` contains 2,064 frames at 60 fps, padded by one pixel for H.264. The accompanying telemetry is explicitly scripted, local and excluded from the app.
- WebKit/iPhone has not been verified; that browser is not installed.

## Release order

Deploy the backend accepting optional `rt`, `prod`, `fl` and `stack` fields **before** the frontend writes them. The production workflow already deploys the API before the web service. Do not serve this frontend against the old strict validator. No production deployment, push or commit was performed for this change.

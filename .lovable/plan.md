# Kanji Dash — JLPT Kanji Learning Game (Plan)

## Concept

A **2D auto-runner** where your character runs through a stylized Japanese countryside. Obstacles, gates, and pickups carry kanji challenges — answer correctly (reading, meaning, or vocabulary in context) to jump, smash, or collect. Wrong answers cost momentum/hearts. Learning is driven by a built-in **spaced-repetition (SRS) engine** that decides which kanji appear, so the game is fun *and* pedagogically sound.

## Core answers to your questions

- **JLPT kanji lists**: yes. N5 ≈ 103 kanji, N4 ≈ 181, N3 ≈ 361, N2 ≈ 415, N1 ≈ 1,232 (~2,200 joyo total). V1 ships full N5.
- **Best daily method**: spaced repetition (SRS) + retrieval practice in context, in short daily sessions. The game loop *is* the SRS queue — every run pulls due kanji first, then introduces a few new ones.
- **Story-driven progression**: one continuous journey ordered by kanji usefulness within N5. JLPT milestones appear as **"N5 Checkpoint Gates"** — boss runs that test a chapter's kanji; passing awards the JLPT badge and unlocks the next region.

## What V1 includes

1. **Runner gameplay** (HTML5 Canvas, 60fps, mobile + desktop)
   - Auto-running character with jump / lane action
   - Challenge gates: pick the correct reading or meaning from 2–4 signposts as you approach
   - Combo meter, hearts, distance score, near-miss slow-mo on wrong answers
   - Keyboard + touch controls

2. **Learning engine**
   - SRS scheduler (SM-2 style): due reviews surface first, ~5 new kanji per day
   - Per-kanji mastery state: unseen → learning → reviewing → mastered
   - Question types mixed in-run: kanji→meaning, kanji→reading (on/kun), word-in-context (kanji shown inside real vocabulary with a sentence)
   - Stroke-order practice mode (outside runs): animated stroke diagrams + trace-on-canvas with correctness check
   - Radical breakdown + mnemonic hint card for every kanji, shown on mistakes

3. **N5 content pack** (~103 kanji)
   - Hand-authored data: meanings, on'yomi/kun'yomi, 2–3 vocabulary words each with example sentences, stroke counts, radicals, mnemonics
   - 6 chapters ("regions") of ~17 kanji each, ending in a Checkpoint Gate boss run

4. **Daily loop & progression**
   - Daily mission: "clear today's review queue" = one run session; streak counter
   - World map screen showing region progress, JLPT milestone badges
   - Local persistence (localStorage) for SRS state, streaks, settings — no accounts needed for V1

5. **Screens/routes**
   - `/` — title/home with daily mission card, streak, "Start Run"
   - `/run` — the game
   - `/practice` — stroke-order tracing + kanji detail browser
   - `/map` — world map, chapter unlocks, N5 badge progress
   - `/collection` — kanji dex: all N5 kanji with mastery state

## Out-of-the-box ideas in the design

- **Context gates**: sentences appear on a gate with a blank — you pick the kanji that fits, teaching vocabulary naturally
- **Failure teaches**: hitting an obstacle opens a 5-second "lesson flash" (radicals + mnemonic) before continuing
- **Stroke dojo**: tracing minigame between runs, rewards coins used for cosmetic outfits
- **Checkpoint boss runs**: timed mixed quiz run per chapter = JLPT milestone

## Technical approach

- TanStack Start + React 19 + Tailwind v4 (existing stack)
- Game rendered with Canvas 2D (no heavy engine); sprite art generated in-app
- SRS + game state in `src/lib/` modules; progress persisted to localStorage
- Kanji data as typed TS data files (`src/data/n5/`)
- Routes per the screen list above; each with proper head() metadata
- Design direction prototypes first (visual style choice), then full build

## Later (not in V1)

- N4+ content packs, accounts + cloud sync (Lovable Cloud), leaderboards, audio pronunciation, 3D world version

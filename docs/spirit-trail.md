# Spirit Trail: Kodama Woods

The home screen at `/` is the world map (see below). A brand-new traveller first
sees the title card over it; “Start your journey” sets them down at the trailhead,
where “Walk today’s trail” opens the Phaser adventure at `/run?mode=expedition`.
Camp (stats, quests, other modes, the level picker, settings) and the journey log
(every checkpoint as a list) are panels on the map: `/?panel=camp` and
`/?panel=journey`. The old `/camp`, `/map` and `/world` addresses redirect there.
Every other screen (dojo, collection, checkpoints, legal) wears the shared game
HUD from `GameScreen.tsx`, whose labelled “Map” button always leads home.

## Playing

- Walk with WASD, arrow keys, or by clicking/tapping the ground.
- Follow the gold marker. “Follow the trail” navigates to the next objective and
  provides a keyboard-accessible alternative to pointing at the canvas.
- Press E or use the interaction button near a landmark.
- Meet four words in the field notes, then restore the lantern through meanings,
  rebuild the bridge with River of Words, carry its light through Lantern Dash,
  and wake the shrine with typed recall.
- At the river, match golden word stones to written forms, readings, or meanings.
  Partners below or beside a landing stone count. Tap a lane twice to drop, or use
  arrows and Space. C holds a stone. Missed words leave ink that a later match washes away.
  Both forest and standalone games start with automatically falling stones.
  Optional untimed Calm Water is available in the forest help menu or desktop
  guide. Aki can highlight the partner stone.
- At the mist trail, choose one of three paths before its gates reach you. Tap a
  path, press 1–3, or use Up/Down or W/S. Follow readings and meanings from the
  same four words. Three misses end the attempt; Aki keeps an ember for a retry.
  Delivering the lantern clears the mist and lights the shrine approach.
- Wrong answers show the reading and mnemonic, then return after other words.
  Hints are available without time pressure. Five optional fireflies reward
  exploration; they do not modify learning scores or currency.
- Escape pauses. Menus capture focus and disable movement. Leaving the tab also
  pauses; returning requires an explicit resume.

## Areas

Each JLPT level walks its own stretch of the old highways. The area follows the
learner's selected level, and a level without an area yet continues on the
furthest area before it:

| Level | Chapter | Area | Season |
|---|---|---|---|
| N5 | 01 | 木霊の森 Kodama Woods (Tōkaidō) | Spring woods |
| N4 | 02 | 木曽の宿 Kiso Post Town (Nakasendō) | Rainy season; inn, stone-paved pass, swollen stream |
| N3, N2 | — | Not built yet; walk Kiso | — |

Every area keeps the same three landmarks and learning rules: a lantern (meanings),
a crossing (River of Words), the mist trail (Lantern Dash), then a shrine (typed
recall). Only the land, its copy and its weather change.

`areas.ts` defines each area as plain data: start, landmarks and their copy, trail
waypoints, fireflies, the water's course and crossing, the shrine, solid buildings,
props, tree seed and species, ground style, colour grade, weather and Aki's lines.
Kodama is transcribed exactly from the original single-area layout. Adding an area
means adding one definition and, if it needs new scenery, its textures in `art.ts`.

## The world map

`/` is the whole Kanji Journey as one walkable Phaser map, south to north
through one year: N5's spring coast, N4's rainy Nakasendō, N3's autumn Kōshū
Kaidō, N2's first snow at Nikkō, and N1's snowbound barrier, closed until its
regions exist. Every region is a stop on one winding road: 印 when sealed (gold
for a perfect seal), glowing with step arcs when open, grey when locked. The
walked stretch is lit gold. The avatar and Aki stand at the learner's next
checkpoint under a “You are here” flag.

Tap a stop or press ↑/↓ (W/S) to walk there; its panel shows the region's kanji,
mastery, checkpoint steps and the same next action as the checkpoint list. Drag
or scroll to explore; the road strip flies the camera to any road, and “You are
here” walks back. Each road has its own season: graded tree textures and capped
weather (petals, rain, leaves, snow) around the camera.

`layout.ts` owns the geometry (testable without Phaser), `WorldScene.ts` draws
it and moves the avatar along a spline through every stop, and `hub/WorldHub.tsx`
owns the HUD, the checkpoint panel, the Camp and Journey log drawers and the
title card. The camp tent at the trailhead is tappable and opens Camp. Exits from
any checkpoint return to `/?stop=<region>`, so the map opens on the stop just
played. The forest's HUD shows the trail's place on the journey; its labelled
“Map” button returns home, asking first if the trail is unfinished.

## Boundaries

`world.ts` owns collision, deterministic scenery placement, and tap-to-walk
routing for any area. It has no dependency on Phaser or React. Its original
named exports (`SITES`, `START`, `TREES`, `walkable`, …) describe Kodama Woods.

`ForestScene.ts` renders that state using Phaser **4.2.1**, pinned in package.json.
`art.ts` creates original pixel textures, including direction-specific player
frames with a shared foot anchor. Scenery is recoloured per area by an HSL grade
when its texture is drawn; characters, lantern light and sparks are never graded,
and Kodama's identity grade leaves its pixels untouched. Kiso adds a cypress, an
inn and a raindrop texture. Rain is a world-space particle emitter spawning above
the camera's view, capped at 260 live drops, paused with the world and hidden for
reduced motion. There are no external asset downloads or generated-image
dependencies for the forest. Phaser loads dynamically in a client effect and is
destroyed when its host unmounts.

`ForestAdventure.tsx` owns the session and accessible DOM overlays. It reuses
`expeditionWords`, `createTrail`, `answerTrail`, and `trailSummary`, so curriculum
locks, overdue-word priority, retry limits, and independent recall rewards keep
their existing behavior. Completed adventures grade each kanji once and award
currency once. Assisted answers never become independent production credit.

`RiverStackGame.tsx` connects the existing deterministic `stack-math.ts` simulation
to the disposable Phaser `RiverStackScene.ts`. The same presentation is used by
daily sheets, fluency, marathon and the stack step of region checkpoints. Daily, fluency
and marathon timers, rewards and rules remain owned by `StackSession`; checkpoint steps
and seals are owned by `CheckpointSession`.

`CrossingEncounter.tsx` uses the lantern's words, separating homophones into
unambiguous boards. Its `crossing.ts` adapter combines placement evidence into one
reading result per kanji. Board retries retain earlier mistakes and assistance;
they cannot manufacture mastery or coins. The crossing does not save separately.
Remaining lantern recovery and typed shrine prompts are preserved, and the world
bridge opens only after all boards have been cleared and the player confirms.

`LanternRunnerGame.tsx` and `LanternRunnerScene.ts` share the existing runner
simulation between `/run?mode=runner` and the forest's `LanternDashEncounter.tsx`.
Standalone preparation, hearts, combos, checkpoint seals, and review grading
remain unchanged. The scene reuses the forest's player and Aki sprites. DOM path
buttons carry readable prompts and keyboard/touch controls. Resize preserves
time to each gate; reduced motion stops decorative scrolling and sprite cycling.

`lantern-dash.ts` retains wrong and assisted answers across mist-trail retries,
then inserts four results before shrine recall. It never saves a separate run.
The full four-word adventure has fourteen independent checks, worth at most
42 mon, and still grades each kanji only once on completion.

An unfinished adventure resets if the page is reloaded or left; only completed
learning results are saved through the existing guest/account save system. The
journey map still represents curriculum checkpoints, which are separate from the
three landmarks. The Lantern Dash inside an area still draws Kodama's trees.

## Validation

```
npm run typecheck
npm test
npm run build
npx playwright test --config playwright.forest.config.ts
```

The forest suite covers a full route on desktop Chromium, mobile Chromium and
WebKit, rewards and production credit, mistake recovery, hints, pause and focus,
keyboard/tap movement, Lantern Dash failure and retry, rotation, and 320px
reduced-motion layouts. `kiso.spec.ts` walks Kiso end to end as an N4 learner
with the same exact rewards, and `tests/unit/forest-areas.spec.ts` checks every
area's reachability, crossing gate, fireflies and solid buildings, plus Kodama's
exact transcription. Timed dash tests use the real input controls with the
browser clock held between actions so screenshot capture never consumes an
answer window. Screenshots are saved
under `test-results/forest`. The existing PWA suite exercises cached Phaser
boot and field notes while offline. The production build precaches the lazy
engine chunk and exports `/camp`, `/map` and `/world` entry points for static
hosting, so old links redirect to the map even offline.

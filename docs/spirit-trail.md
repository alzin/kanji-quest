# Spirit Trail: Kodama Woods

The title screen at `/` opens the Phaser adventure at `/run?mode=expedition`.
The previous learning dashboard is available at `/camp`. The runner, stacking
game, collection, curriculum map, accounts, and stroke dojo remain available.

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

## Boundaries

`world.ts` owns positions, collision, deterministic scenery placement, and
tap-to-walk routing. It has no dependency on Phaser or React.

`ForestScene.ts` renders that state using Phaser **4.2.1**, pinned in package.json.
`art.ts` creates original pixel textures, including direction-specific player
frames with a shared foot anchor. There are no external asset downloads or
generated-image dependencies for the forest. Phaser loads dynamically in a
client effect and is destroyed when its host unmounts.

`ForestAdventure.tsx` owns the session and accessible DOM overlays. It reuses
`expeditionWords`, `createTrail`, `answerTrail`, and `trailSummary`, so curriculum
locks, overdue-word priority, retry limits, and independent recall rewards keep
their existing behavior. Completed adventures grade each kanji once and award
currency once. Assisted answers never become independent production credit.

`RiverStackGame.tsx` connects the existing deterministic `stack-math.ts` simulation
to the disposable Phaser `RiverStackScene.ts`. The same presentation is used by
standalone Tsumiji checkpoints, daily sheets, fluency, and marathon. Their existing
timers, checkpoint seals, rewards, and rules remain owned by `StackSession`.

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

This is one complete area, not a migrated multi-region campaign. An unfinished
adventure resets if the page is reloaded or left; only completed learning results
are saved through the existing guest/account save system. Camp's world map still
represents curriculum checkpoints, which are separate from the three landmarks.

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
reduced-motion layouts. Timed dash tests use the real input controls with the
browser clock held between actions so screenshot capture never consumes an
answer window. Screenshots are saved
under `test-results/forest`. The existing PWA suite exercises cached Phaser
boot and field notes while offline. The production build precaches the lazy
engine chunk and exports a `/camp` entry point for static hosting.

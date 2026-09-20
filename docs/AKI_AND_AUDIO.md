# Aki and the woodland soundtrack

Aki is the Spirit Trail's original lantern keeper. She appears at camp and travels beside the learner, with idle, success, encouragement, and celebration poses. The character reacts to actual answer state. Every third independent recall triggers a victory jump; a miss resets the flow display and prompts encouragement. Mistakes do not deduct light or mon.

Answer feedback adds a short sparkle ring, floating light and mon amounts, animated tally numbers, combo banners, and a brief amber wobble for mistakes. Reward amounts come directly from the expedition result, so hints and retries cannot display unearned coins. The same score-pop treatment is added to Word Weaver's HUD; Torii Run retains its existing canvas effects.

## Audio

`src/lib/music.ts` generates an original 16-bar woodland composition with synthesized bells, a soft pad, and bass. The trail uses a relaxed 82 BPM arrangement, typed recall a sparse 70 BPM variation, Word Weaver 94 BPM, and Torii Run 108 BPM. It uses the existing shared Web Audio context and starts only after user activation. No audio downloads or external service are needed.

The music note button saves its preference separately as `kanji-dash-music`; the existing game-sound button remains the master mute. Music pauses with the game, stops when the tab is hidden or the game unmounts, and lowers its volume while Japanese speech is active. Buffer sources and gain nodes are disconnected on completion or interruption, scheduling has a short lookahead, and polyphony is capped at 32 voices. Unsupported audio devices remain playable.

## Art assets and provenance

Generated with the built-in **image_gen** tool, then normalized through Game Studio's `normalize_sprite_strip.py` into four 384 × 384 frames with a shared scale and bottom-center anchor. The normalized frames were encoded as WebP with alpha at quality 88. The four shipped frames total 154,136 bytes; no source outside the repository is required to run the game.

- `public/art/aki/idle.webp` — 40,248 bytes
- `public/art/aki/success.webp` — 38,976 bytes
- `public/art/aki/encourage.webp` — 37,696 bytes
- `public/art/aki/celebrate.webp` — 37,216 bytes

Character direction for the initial reference: an original full-body chibi anime forest traveler, chestnut bob, amber eyes, a leaf hair clip, cream tunic, green leaf-embroidered haori, ochre sash, green shorts, cream wraps, brown boots, russet scarf, and a brass lantern. No existing anime character was referenced.

Final production prompt, with that generated character as the identity reference:

> Create a new game sprite sheet using the attached character as identity reference only. Transparent background. A single wide horizontal 4-column strip of Aki, this chestnut-bob-haired amber-eyed chibi anime forest lantern keeper in green haori, russet scarf, cream tunic, ochre sash, green shorts and brown boots holding a brass lantern. Four equal slots, full body, same scale, feet baseline, generous clear gap. Pose 1: calm smile and friendly wave. Pose 2: delighted closed eyes and fist pump. Pose 3: concerned but encouraging hand to chest. Pose 4: joyful victory lantern raised. Isolated on fully transparent background. No backdrop, no floor, no gray checkerboard design. Produce a PNG with transparent alpha around all four characters. Beautiful clean painted anime game asset.

An earlier strip had a baked checkerboard and was rejected. The selected production strip was verified as RGBA with transparent pixels before normalization. Character motion combines these reaction poses with CSS breathing, hops, and a small stumble; it is not a frame-by-frame walking animation.

## Accessibility and verification

The character and particles are decorative; persistent answer feedback remains readable and announced through the existing status region. Reduced motion removes character motion, shake, particles, and count-up animation while preserving reward text. Pause freezes decorative motion as well as the soundtrack. Answer focus uses `preventScroll` so feedback doesn't unexpectedly pull the character out of view on a phone.

Browser coverage checks exact rewards and reactions, hints, bounded retries, 320px layouts, pause, existing game modes, sound effects, speech, and offline character assets. Real Web Audio tests inspect source scheduling, non-silent PCM, voice bounds, separate music mute, master mute, speech ducking, tab visibility, and route cleanup in Chromium. Windows Playwright WebKit does not expose Web Audio, so its real-audio tests are explicitly skipped; its gameplay, UI, and unsupported-audio fallback are still tested. Physical iPhone speaker playback remains a device check.

# Spirit Trail

The home screen now starts a short forest expedition at `/run?mode=expedition`. Existing stacking sessions, the runner, region checkpoints, the collection, account saving, and stroke practice keep their routes and data.

## The adventure

1. Choose the river path (meaning first) or the shrine path (reading first).
2. Study any new words with their exact vocabulary reading, meaning, audio, and mnemonic.
3. Recall four words in two different ways. Independent answers gather light; every third consecutive recall adds a bonus.
4. At the clearing, choose a charm. Firefly adds one light to independent answers. Moss increases guided-answer light from one to three.
5. Type two readings at the shrine. Hiragana, katakana, and the existing accepted romaji forms work.
6. Collect mon and a field journal of the words practised. Four light kindle a lantern, up to five lanterns. The results distinguish independent recall from words needing further practice.

There is no timer or life counter in this mode. A mistake is explained, then scheduled for one recovery attempt after up to two intervening encounters. If no encounters remain, the retry follows immediately. Retries are bounded; even an all-mistake expedition can finish. Pause uses a modal dialog with focus containment, and hiding the page pauses the trail.

## Learning and save rules

- A session contains at most four unique kanji, selected from oldest due reviews, new cards in the current unlocked region, then previously learned words for optional practice. Locked content never enters the queue.
- The meaning, reading, and production questions use the same vocabulary example. New-word preparation does not mutate progress.
- Only original, correct, unassisted encounters earn mon: three per encounter. Retry answers and hinted answers earn light, not mon.
- Finish grades each kanji exactly once. All its original encounters must have been independently correct to receive a successful grade. Retry success cannot erase an initial miss.
- Optional practice preserves a card's existing future review date. Existing SRS intervals and long-term production requirements remain authoritative.
- An independently correct original typed answer records production. Charms never alter SRS or production credit.
- A completed expedition updates the existing run count, daily streak, daily seal, typed quest, and coins. It does not grant a region checkpoint seal; existing checkpoints still open the road.
- Unfinished expeditions are not saved. A pause explains this before the player leaves. Guest progress remains temporary in its tab; signed-in persistence continues through the existing account transport.
- Explorer XP is derived from saved correct card grades (10 XP each, 200 XP per explorer level). It is a cosmetic experience level, separate from kanji mastery.

## Implementation

`src/lib/expedition.ts` owns selection, encounter order, bounded retries, light, charms, and the final learning summary. `src/components/Expedition.tsx` owns presentation and commits the finished summary through the existing SRS APIs. The turn-based adventure uses React and native accessible controls; the established canvas runner and stacking engines remain intact.

The original generated forest artwork is shipped as `public/art/spirit-forest.webp` (about 397 KiB). Its path respects the Vite base URL and the PWA precache includes WebP assets. Reduced motion disables drifting lights and reward motion. No new runtime dependencies were added.

Aki now joins the expedition with animated reaction poses, reward popups, and combo celebrations. An original procedural soundtrack follows the trail and the two arcade games, with separate music controls and automatic volume ducking for Japanese pronunciation. See [Aki and audio](AKI_AND_AUDIO.md) for behavior, asset provenance, and verification details.

Unit tests cover due-card priority, locks, path order, retry bounds, rewards, hints, and charms. Browser tests cover full completion, exact saved rewards, production credit, mistakes, pause, both paths, hints, a 320px layout, and reduced motion. The existing mobile, curriculum, save, and offline tests also cover the redesigned home.

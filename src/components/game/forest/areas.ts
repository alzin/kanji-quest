import type { JLPTLevel } from "@/data";
import type { Point } from "./world";

/** A landmark the trail restores. `approach` is where travel stops, relative to the landmark. */
export type Site = {
  x: number;
  y: number;
  name: string;
  verb: string;
  objective: string;
  restored: string;
  story: string;
  reward: string;
  approach?: Point;
};

export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** HSL shift applied to scenery textures. Characters and lantern light keep their colours. */
export type Grade = { hue: number; sat: number; light: number };

/**
 * Everything one stretch of the Spirit Trail needs: layout, collision, scenery and copy.
 * Pure data, so movement rules stay testable without Phaser. All areas share WORLD's size.
 */
export type AreaDefinition = {
  id: "kodama" | "kiso";
  level: JLPTLevel;
  chapter: number;
  road: string;
  name: { jp: string; en: string };
  terrain: string;
  start: Point;
  sites: readonly [Site, Site, Site];
  trail: readonly Point[];
  motes: readonly Point[];
  /** The water that splits the area: centre x = base + sin(y / period) × amplitude. */
  water: { base: number; amplitude: number; period: number };
  /** Where the restored crossing spans the water. */
  crossing: { x: number; y: number; halfHeight: number };
  shrine: Point;
  shrineLanterns: readonly Point[];
  blocked: readonly Rect[];
  props: readonly { kind: "tent" | "inn"; x: number; y: number }[];
  clearings: readonly { x: number; y: number; r: number }[];
  trees: { seed: number; count: number; variants: readonly number[] };
  ground: { trail: "dirt" | "stone"; flowers: readonly [string, string]; trailFlowers: number };
  grade: Grade;
  weather: "clear" | "rain";
  rays: readonly number[];
  previewCenter: Point;
  welcome: readonly [string, string];
  dash: { objective: string; verb: string; done: string };
  recallPrompt: string;
  remembered: string;
  results: readonly [string, string];
};

const KODAMA_SITES = [
  {
    x: 470,
    y: 598,
    name: "The sleeping lantern",
    verb: "Light the lantern",
    objective: "Find the sleeping lantern",
    restored: "The lantern is awake",
    story:
      "Aki’s lantern has gone quiet. Give four forest words their meaning to kindle it again.",
    reward: "A little light returns to the woods.",
  },
  {
    x: 674,
    y: 466,
    name: "The forgotten crossing",
    verb: "Restore the bridge",
    objective: "Restore the river crossing",
    restored: "The bridge is restored",
    story:
      "The river remembers a bridge here. Give your words their voices to bring it back.",
    reward: "The way across the river is open.",
  },
  {
    x: 1110,
    y: 326,
    name: "The wordkeeper’s shrine",
    verb: "Wake the shrine",
    objective: "Wake the wordkeeper’s shrine",
    restored: "The forest remembers",
    story:
      "One last offering. Recall the words without choices, and let the shrine hear you.",
    reward: "You brought the forest’s words home.",
  },
] as const satisfies readonly [Site, Site, Site];

/** Chapter 1 · N5 · Tōkaidō. The original woods, transcribed exactly. */
export const KODAMA: AreaDefinition = {
  id: "kodama",
  level: "N5",
  chapter: 1,
  road: "Tōkaidō",
  name: { jp: "木霊の森", en: "KODAMA WOODS" },
  terrain: "WOODLANDS",
  start: { x: 300, y: 690 },
  sites: KODAMA_SITES,
  trail: [
    { x: 300, y: 690 },
    { x: 360, y: 650 },
    KODAMA_SITES[0],
    { x: 560, y: 550 },
    KODAMA_SITES[1],
    { x: 920, y: 466 },
    { x: 1020, y: 400 },
    KODAMA_SITES[2],
    { x: 1200, y: 310 },
  ],
  motes: [
    { x: 372, y: 650 },
    { x: 542, y: 566 },
    { x: 632, y: 490 },
    { x: 914, y: 466 },
    { x: 1008, y: 410 },
  ],
  water: { base: 796, amplitude: 22, period: 145 },
  crossing: { x: 796, y: 466, halfHeight: 34 },
  shrine: { x: 1110, y: 285 },
  shrineLanterns: [
    { x: 1020, y: 331 },
    { x: 1202, y: 330 },
  ],
  blocked: [{ x0: 1040, y0: 175, x1: 1180, y1: 276 }],
  props: [{ kind: "tent", x: 218, y: 640 }],
  clearings: [],
  trees: { seed: 82, count: 235, variants: [0, 1, 2] },
  ground: { trail: "dirt", flowers: ["#e6ce91", "#b7b4cc"], trailFlowers: 0 },
  grade: { hue: 0, sat: 1, light: 1 },
  weather: "clear",
  rays: [290, 605, 1020, 1250],
  previewCenter: { x: 665, y: 463 },
  welcome: ["The forest has forgotten its words.", "Come on. Let’s find its first light."],
  dash: {
    objective: "Carry light through the mist",
    verb: "Run the mist trail",
    done: "The mist lifts. Your lantern has lit the shrine path.",
  },
  recallPrompt: "What does the forest remember?",
  remembered: "The forest remembers.",
  results: ["A lantern glows. A river can be crossed.", "And a few more words feel like old friends."],
};

const KISO_SITES = [
  {
    x: 1060,
    y: 690,
    name: "The inn’s paper lantern",
    verb: "Light the andon",
    objective: "Light the inn’s paper lantern",
    restored: "The andon glows",
    story:
      "Rain has put out the inn’s lantern. Give four words their meaning to light it again.",
    reward: "Warm light spills across the wet stones.",
  },
  {
    x: 695,
    y: 540,
    name: "The washed-out footbridge",
    verb: "Rebuild the footbridge",
    objective: "Cross the swollen stream",
    restored: "The footbridge stands",
    story:
      "The rain carried the footbridge away. Give your words their voices to lay it again.",
    reward: "The way over the stream is open.",
    approach: { x: 30, y: 24 },
  },
  {
    x: 300,
    y: 291,
    name: "The shrine at the pass",
    verb: "Wake the pass shrine",
    objective: "Climb to the shrine at the pass",
    restored: "The pass remembers",
    story:
      "One last offering at the top of the pass. Recall the words without choices.",
    reward: "You carried the post town’s words over the pass.",
  },
] as const satisfies readonly [Site, Site, Site];

/** Chapter 2 · N4 · Nakasendō. A rainy-season post town in the Kiso valley, up a stone pass. */
export const KISO: AreaDefinition = {
  id: "kiso",
  level: "N4",
  chapter: 2,
  road: "Nakasendō",
  name: { jp: "木曽の宿", en: "KISO POST TOWN" },
  terrain: "POST ROAD",
  start: { x: 1250, y: 760 },
  sites: KISO_SITES,
  trail: [
    { x: 1250, y: 760 },
    { x: 1160, y: 735 },
    KISO_SITES[0],
    { x: 940, y: 640 },
    { x: 810, y: 585 },
    KISO_SITES[1],
    { x: 460, y: 540 },
    { x: 380, y: 480 },
    { x: 470, y: 420 },
    { x: 380, y: 365 },
    KISO_SITES[2],
    { x: 225, y: 300 },
  ],
  motes: [
    { x: 1150, y: 728 },
    { x: 900, y: 624 },
    { x: 780, y: 570 },
    { x: 420, y: 508 },
    { x: 430, y: 392 },
  ],
  water: { base: 600, amplitude: 30, period: 130 },
  crossing: { x: 575, y: 540, halfHeight: 34 },
  shrine: { x: 300, y: 250 },
  shrineLanterns: [
    { x: 210, y: 296 },
    { x: 392, y: 295 },
  ],
  blocked: [
    { x0: 230, y0: 140, x1: 370, y1: 241 },
    { x0: 1300, y0: 600, x1: 1462, y1: 690 },
  ],
  props: [{ kind: "inn", x: 1380, y: 694 }],
  clearings: [{ x: 1380, y: 650, r: 150 }],
  trees: { seed: 91, count: 250, variants: [0, 1, 3, 3, 3] },
  ground: { trail: "stone", flowers: ["#7f9fe0", "#b096e2"], trailFlowers: 46 },
  grade: { hue: 16, sat: 0.7, light: 0.88 },
  weather: "rain",
  rays: [],
  previewCenter: { x: 700, y: 520 },
  welcome: ["Rain has washed the post town’s words away.", "Let’s light the inn’s lantern first."],
  dash: {
    objective: "Carry light up the misty pass",
    verb: "Climb the misty pass",
    done: "The mist parts. Your lantern lights the climb to the shrine.",
  },
  recallPrompt: "What does the pass remember?",
  remembered: "The pass remembers.",
  results: ["An andon glows. The stream can be crossed.", "And the road north feels a little shorter."],
};

/** Areas in walking order along the journey. N3, N2 and N1 areas are not built yet. */
export const AREAS: readonly AreaDefinition[] = [KODAMA, KISO];

const ORDER: readonly JLPTLevel[] = ["N5", "N4", "N3", "N2"];

/** A level's own area, or until it is built, the furthest area before it on the road. */
export function areaForLevel(level: JLPTLevel): AreaDefinition {
  const reach = ORDER.indexOf(level);
  return [...AREAS].reverse().find((area) => ORDER.indexOf(area.level) <= reach) ?? KODAMA;
}

import { LEVELS, LEVEL_CHAPTERS, type JLPTLevel } from "./regions";

export type RoadId = JLPTLevel | "N1";

export type Road = {
  id: RoadId;
  /** The study level whose regions line this road. N1 is drawn on the journey before its regions exist. */
  level?: JLPTLevel;
  romaji: string;
  jp: string;
  /** OKLCH hue of this stretch of landscape. */
  hue: number;
  regions: readonly number[];
};

// The five Edo highways (五街道), one per JLPT level, walked in order from N5 to N1.
const HIGHWAYS: Record<RoadId, { romaji: string; jp: string; hue: number }> = {
  N5: { romaji: "Tōkaidō", jp: "東海道", hue: 230 },
  N4: { romaji: "Nakasendō", jp: "中山道", hue: 150 },
  N3: { romaji: "Kōshū Kaidō", jp: "甲州街道", hue: 320 },
  N2: { romaji: "Nikkō Kaidō", jp: "日光街道", hue: 40 },
  N1: { romaji: "Ōshū Kaidō", jp: "奥州街道", hue: 265 },
};

const isLevel = (id: RoadId): id is JLPTLevel => (LEVELS as readonly string[]).includes(id);

export const ROADS: readonly Road[] = (["N5", "N4", "N3", "N2", "N1"] as const).map((id) => ({
  id,
  ...HIGHWAYS[id],
  ...(isLevel(id) ? { level: id, regions: LEVEL_CHAPTERS[id] } : { regions: [] }),
}));

/** Every region checkpoint in journey order: each road's regions, road after road. */
export const JOURNEY_STOPS: readonly number[] = ROADS.flatMap((road) => road.regions);

export function roadOfLevel(level: JLPTLevel): Road {
  return ROADS.find((road) => road.level === level)!;
}

/** A region's 1-based position on the whole journey, or 0 when it is not on it. */
export function journeyNumber(ch: number): number {
  return JOURNEY_STOPS.indexOf(ch) + 1;
}

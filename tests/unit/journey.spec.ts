import { expect, test } from "@playwright/test";
import { CURRICULUM_VERSION, JOURNEY_STOPS, LEVELS, LEVEL_CHAPTERS, REGIONS, ROADS, journeyNumber, kanjiOfChapter, roadOfLevel } from "../../src/data";
import { isRoadSealed, journeyHere, journeySeals, nextOnRoad, roadSeals, stopState } from "../../src/lib/journey";
import { normalizeSave } from "../../src/lib/srs";
import { isNewTraveller } from "../../src/lib/hub";

const N5 = LEVEL_CHAPTERS.N5, N4 = LEVEL_CHAPTERS.N4;
const reviewing = { mastery: 2 as const, ivl: 1, ease: 2.5, due: 0, correct: 2, wrong: 0 };

test("one journey walks every road in level order, N5 to N1, with every region exactly once", () => {
  expect(ROADS.map((road) => road.id)).toEqual(["N5", "N4", "N3", "N2", "N1"]);
  expect(ROADS.map((road) => road.level)).toEqual([...LEVELS, undefined]);
  for (const level of LEVELS) expect(roadOfLevel(level).regions).toEqual(LEVEL_CHAPTERS[level]);
  // N1 is drawn on the journey before its regions exist.
  expect(ROADS.at(-1)!.regions).toEqual([]);
  expect(JOURNEY_STOPS).toEqual(LEVELS.flatMap((level) => LEVEL_CHAPTERS[level]));
  expect(new Set(JOURNEY_STOPS).size).toBe(REGIONS.length);
  expect(new Set(ROADS.map((road) => road.jp)).size).toBe(ROADS.length);
});

test("journey numbers count across roads, not within them", () => {
  expect(journeyNumber(N5[0]!)).toBe(1);
  expect(journeyNumber(N5.at(-1)!)).toBe(N5.length);
  expect(journeyNumber(N4[0]!)).toBe(N5.length + 1);
  expect(journeyNumber(LEVEL_CHAPTERS.N2.at(-1)!)).toBe(REGIONS.length);
  expect(journeyNumber(9999)).toBe(0);
});

test("a new traveller stands at the N5 trailhead, while every road's first checkpoint is already open", () => {
  const save = normalizeSave({});
  expect(journeyHere(save)).toEqual({ road: roadOfLevel("N5"), ch: N5[0] });
  for (const level of LEVELS) {
    expect(stopState(save, LEVEL_CHAPTERS[level][0]!)).toEqual({ status: "open", steps: 0, perfect: false });
    expect(stopState(save, LEVEL_CHAPTERS[level][1]!).status).toBe("locked");
  }
  expect(journeySeals(save)).toBe(0);
});

test("the learner's place follows the road they travel and its first open, unsealed checkpoint", () => {
  const save = normalizeSave({ curriculumVersion: CURRICULUM_VERSION, selectedLevel: "N4", clearedChapters: [N4[0]], stack: { perfectGates: [N4[0]] }, checkpointSteps: { learned: [N4[1]], stacked: [N4[1]], rescued: [] } });
  expect(journeyHere(save)).toEqual({ road: roadOfLevel("N4"), ch: N4[1] });
  expect(stopState(save, N4[0]!)).toEqual({ status: "sealed", steps: 0, perfect: true });
  expect(stopState(save, N4[1]!)).toEqual({ status: "open", steps: 2, perfect: false });
  expect(stopState(save, N4[2]!).status).toBe("locked");
  expect(roadSeals(save, roadOfLevel("N4"))).toBe(1);
  expect(journeySeals(save)).toBe(1);
  // Other roads keep their own place.
  expect(nextOnRoad(save, roadOfLevel("N5"))).toBe(N5[0]);
});

test("mastery progress opens the next checkpoint on the trail before its seal", () => {
  const progress = Object.fromEntries(kanjiOfChapter(N5[0]!).map((k) => [k.c, reviewing]));
  const save = normalizeSave({ curriculumVersion: CURRICULUM_VERSION, progress });
  expect(stopState(save, N5[1]!).status).toBe("open");
  // The unsealed first checkpoint is still the one the map points to.
  expect(journeyHere(save).ch).toBe(N5[0]);
});

test("a sealed road has no next checkpoint; the uncharted N1 road is never sealed", () => {
  const save = normalizeSave({ curriculumVersion: CURRICULUM_VERSION, clearedChapters: [...N5] });
  expect(isRoadSealed(save, roadOfLevel("N5"))).toBe(true);
  expect(journeyHere(save)).toEqual({ road: roadOfLevel("N5"), ch: undefined });
  expect(isRoadSealed(save, roadOfLevel("N4"))).toBe(false);
  expect(isRoadSealed(save, ROADS.at(-1)!)).toBe(false);
  expect(journeySeals(save)).toBe(N5.length);
});

test("only a traveller who has not taken a single step is greeted by the title card", () => {
  const fresh = normalizeSave({ curriculumVersion: CURRICULUM_VERSION });
  expect(isNewTraveller(fresh)).toBe(true);
  expect(isNewTraveller({ ...fresh, runsCompleted: 1 })).toBe(false);
  expect(isNewTraveller({ ...fresh, progress: { 一: reviewing } })).toBe(false);
  expect(isNewTraveller({ ...fresh, clearedChapters: [N5[0]!] })).toBe(false);
  expect(isNewTraveller({ ...fresh, checkpointSteps: { learned: [N5[0]!], stacked: [], rescued: [] } })).toBe(false);
  // Choosing a road alone is not a step on it.
  expect(isNewTraveller({ ...fresh, selectedLevel: "N4" })).toBe(true);
});

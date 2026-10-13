import { expect, test } from "@playwright/test";
import { AREAS, KISO, KODAMA, areaForLevel } from "../../src/components/game/forest/areas";
import { approachOf, distance, findPath, movePlayer, riverX, treesOf, walkable, WORLD } from "../../src/components/game/forest/world";

test("each JLPT level walks its own area, and unbuilt levels continue on the furthest one", () => {
  expect(AREAS.map((area) => [area.id, area.level, area.chapter])).toEqual([["kodama", "N5", 1], ["kiso", "N4", 2]]);
  expect(areaForLevel("N5")).toBe(KODAMA);
  expect(areaForLevel("N4")).toBe(KISO);
  expect(areaForLevel("N3")).toBe(KISO);
  expect(areaForLevel("N2")).toBe(KISO);
});

for (const area of AREAS) {
  test(`${area.id}: every landmark is reached in order with real movement and collision`, () => {
    expect(walkable(area.start, 0, area)).toBe(true);
    let p = { ...area.start };
    area.sites.forEach((site, restored) => {
      const target = approachOf(site);
      expect(walkable(target, restored, area), `${site.name} approach`).toBe(true);
      const path = findPath(p, target, restored, area);
      expect(path.length, `${site.name} path`).toBeGreaterThan(0);
      let budget = 4000;
      for (const step of path)
        while (distance(p, step) >= 6 && budget-- > 0)
          p = movePlayer(p, step.x - p.x, step.y - p.y, 1 / 60, restored, area);
      expect(budget, `${site.name} budget`).toBeGreaterThan(0);
      // Close enough that the interaction button appears.
      expect(distance(p, site)).toBeLessThan(90);
    });
  });

  test(`${area.id}: the water only opens at the restored crossing`, () => {
    const { y } = area.crossing;
    const farBank = approachOf(area.sites[2]);
    for (const restored of [0, 1]) {
      expect(walkable({ x: riverX(y, area), y }, restored, area)).toBe(false);
      expect(findPath(area.start, farBank, restored, area)).toEqual([]);
    }
    expect(walkable({ x: riverX(y, area), y }, 2, area)).toBe(true);
    expect(walkable({ x: riverX(y + 140, area), y: y + 140 }, 2, area)).toBe(false);
  });

  test(`${area.id}: every firefly can be collected once the way is open`, () => {
    for (const mote of area.motes) {
      expect(walkable(mote, 2, area), `${mote.x},${mote.y}`).toBe(true);
      expect(findPath(area.start, mote, 2, area).length, `${mote.x},${mote.y}`).toBeGreaterThan(0);
    }
  });

  test(`${area.id}: buildings are solid, scenery stays clear of paths, water and the shrine`, () => {
    for (const r of area.blocked) expect(walkable({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }, 3, area)).toBe(false);
    const trees = treesOf(area);
    expect(trees.length).toBeGreaterThan(60);
    expect(treesOf(area)).toBe(trees);
    for (const tree of trees) {
      expect(Math.abs(tree.x - riverX(tree.y, area))).toBeGreaterThan(100);
      expect(distance(tree, area.sites[2])).toBeGreaterThan(165);
      expect(area.trees.variants).toContain(tree.variant);
    }
    for (const site of area.sites) {
      expect(site.x).toBeGreaterThan(90);
      expect(site.x).toBeLessThan(WORLD.width - 90);
    }
  });
}

test("Kodama's original layout is transcribed exactly", () => {
  expect(KODAMA.start).toEqual({ x: 300, y: 690 });
  expect(KODAMA.sites.map((s) => [s.x, s.y])).toEqual([[470, 598], [674, 466], [1110, 326]]);
  expect(KODAMA.crossing).toEqual({ x: 796, y: 466, halfHeight: 34 });
  // The same 135 trees the single-area world grew, first and last unchanged.
  const trees = treesOf(KODAMA);
  expect(trees).toHaveLength(135);
  expect(trees[0]).toEqual({ x: 89.95609938725829, y: 880.6887294724584, size: 1.1443812885088847, variant: 2 });
  expect(trees.at(-1)).toEqual({ x: 222.7578149549663, y: 227.69752429798245, size: 1.0967184860026464, variant: 2 });
  expect(approachOf(KODAMA.sites[0])).toEqual({ x: 438, y: 625 });
});

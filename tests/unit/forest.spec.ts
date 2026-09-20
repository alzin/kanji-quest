import { test, expect } from "@playwright/test";
import {
  findPath,
  movePlayer,
  SITES,
  START,
  walkable,
  riverX,
  distance,
} from "../../src/components/game/forest/world";

test("the river only opens at the restored bridge, never elsewhere", () => {
  for (const restored of [0, 1]) {
    expect(walkable({ x: riverX(466), y: 466 }, restored)).toBe(false);
    expect(findPath(START, { x: 930, y: 466 }, restored)).toEqual([]);
  }
  expect(walkable({ x: riverX(466), y: 466 }, 2)).toBe(true);
  expect(walkable({ x: riverX(600), y: 600 }, 2)).toBe(false);
});

test("all objectives can be reached in order using actual movement and collision", () => {
  let p = { ...START };
  SITES.forEach((site, restored) => {
    const path = findPath(p, { x: site.x - 32, y: site.y + 27 }, restored);
    expect(path.length).toBeGreaterThan(0);
    let budget = 2000;
    for (const target of path) {
      while (distance(p, target) >= 6 && budget-- > 0)
        p = movePlayer(p, target.x - p.x, target.y - p.y, 1 / 60, restored);
    }
    expect(budget).toBeGreaterThan(0);
    expect(distance(p, site)).toBeLessThan(90);
  });
});

test("movement normalizes diagonals, bounds delta, and cannot tunnel through the river", () => {
  const direct = movePlayer(START, 1, 0, 0.016, 0),
    diagonal = movePlayer(START, 1, 1, 0.016, 0);
  expect(distance(START, direct)).toBeCloseTo(distance(START, diagonal));
  expect(distance(START, movePlayer(START, 1, 0, 90, 0))).toBeLessThan(10);
  let p = { x: 660, y: 466 };
  for (let i = 0; i < 1000; i++) p = movePlayer(p, 1, 0, 0.016, 0);
  expect(p.x).toBeLessThan(riverX(466) - 70);
});

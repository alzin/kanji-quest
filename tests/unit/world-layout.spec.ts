import { expect, test } from "@playwright/test";
import { JOURNEY_STOPS, ROADS } from "../../src/data";
import { UNCHARTED_STOPS, WORLD_WIDTH, nodeOfRegion, worldLayout } from "../../src/components/game/world/layout";

test("every checkpoint of every road is one stop on the world map, in journey order, then the uncharted north", () => {
  const { nodes } = worldLayout();
  expect(nodes).toHaveLength(JOURNEY_STOPS.length + UNCHARTED_STOPS);
  expect(nodes.filter((n) => n.ch !== undefined).map((n) => n.ch)).toEqual([...JOURNEY_STOPS]);
  expect(nodes.slice(JOURNEY_STOPS.length).every((n) => n.road.id === "N1" && n.ch === undefined)).toBe(true);
  nodes.forEach((node, i) => expect(node.index).toBe(i));
  for (const road of ROADS.filter((r) => r.level))
    road.regions.forEach((ch, i) => expect(nodeOfRegion(ch)).toMatchObject({ road, regionIndex: i }));
});

test("the journey climbs north without doubling back, inside the world, with room around every stop", () => {
  const { nodes, height, summit } = worldLayout();
  for (let i = 1; i < nodes.length; i++) {
    expect(nodes[i]!.y).toBeLessThan(nodes[i - 1]!.y);
    expect(Math.hypot(nodes[i]!.x - nodes[i - 1]!.x, nodes[i]!.y - nodes[i - 1]!.y)).toBeGreaterThan(60);
  }
  for (const node of nodes) {
    expect(node.x).toBeGreaterThan(80);
    expect(node.x).toBeLessThan(WORLD_WIDTH - 80);
    expect(node.y).toBeGreaterThan(0);
    expect(node.y).toBeLessThan(height);
  }
  expect(summit.y).toBeGreaterThan(0);
  expect(summit.y).toBeLessThan(nodes.at(-1)!.y);
});

test("each road's land tiles the world from the coast to the summit, with its gate inside it", () => {
  const { bands, nodes, height } = worldLayout();
  expect(bands.map((b) => b.road.id)).toEqual(["N5", "N4", "N3", "N2", "N1"]);
  expect(bands[0]!.bottom).toBe(height);
  expect(bands.at(-1)!.top).toBe(0);
  bands.forEach((band, i) => {
    if (i > 0) expect(band.bottom).toBe(bands[i - 1]!.top);
    expect(band.gate.y).toBeGreaterThan(band.top);
    expect(band.gate.y).toBeLessThan(band.bottom);
    for (const node of nodes.filter((n) => n.road === band.road)) {
      expect(node.y).toBeGreaterThan(band.top);
      expect(node.y).toBeLessThan(band.bottom);
    }
  });
});

test("the camp sits at the trailhead on the coast: inside the world, below the first stop and clear of it", () => {
  const { camp, nodes, height } = worldLayout();
  const first = nodes[0]!;
  expect(camp.x).toBeGreaterThan(60);
  expect(camp.x).toBeLessThan(WORLD_WIDTH - 60);
  expect(camp.y).toBeGreaterThan(first.y);
  expect(camp.y).toBeLessThan(height);
  // The tent's tap area (180×140 around its centre) never covers the first stop's 30 px hit circle.
  expect(Math.abs(camp.x - first.x)).toBeGreaterThan(90 + 30);
});

import { ROADS, type Road } from "@/data";

/**
 * The Kanji Journey overworld, laid out bottom to top: N5 on the southern coast, N1 in the
 * snowbound north. Pure geometry, so positions are testable without Phaser.
 */
export type WorldNode = {
  /** Position along the whole journey, 0 at the N5 trailhead. */
  index: number;
  /** Region ID, absent for the uncharted N1 stretch. */
  ch?: number;
  road: Road;
  roadIndex: number;
  /** Position within its road, 0-based. */
  regionIndex: number;
  x: number;
  y: number;
};

export type Band = {
  road: Road;
  roadIndex: number;
  /** World y of the band's top and bottom edges; bands tile the world without gaps. */
  top: number;
  bottom: number;
  gate: { x: number; y: number };
};

export const WORLD_WIDTH = 1440;
const SPACING = 78;
const GATE_GAP = 150;
// Room below the trailhead for the coast, so phones can raise it above the checkpoint panel.
const BOTTOM = 680;
const TOP = 460;
const AMPLITUDE = 250;
/** Stops drawn for N1 before its regions exist. */
export const UNCHARTED_STOPS = 10;

const pathX = (i: number) =>
  Math.round(WORLD_WIDTH / 2 + AMPLITUDE * Math.sin(i * 0.45) + 50 * Math.sin(i * 0.13));

export type WorldLayout = {
  nodes: WorldNode[];
  bands: Band[];
  height: number;
  summit: { x: number; y: number };
  /** The camp tent at the trailhead (its base): tapping it opens the Camp panel. */
  camp: { x: number; y: number };
};

let cached: WorldLayout | undefined;

export function worldLayout(): WorldLayout {
  if (cached) return cached;
  const stops = ROADS.reduce((n, road) => n + (road.regions.length || UNCHARTED_STOPS), 0);
  const height = BOTTOM + TOP + stops * SPACING + ROADS.length * GATE_GAP;
  const nodes: WorldNode[] = [];
  const bands: Band[] = [];
  let y = height - BOTTOM;
  ROADS.forEach((road, roadIndex) => {
    const gateY = y;
    y -= GATE_GAP;
    const count = road.regions.length || UNCHARTED_STOPS;
    const first = nodes.length;
    for (let regionIndex = 0; regionIndex < count; regionIndex++) {
      const index = nodes.length;
      nodes.push({ index, road, roadIndex, regionIndex, x: pathX(index), y, ...(road.regions[regionIndex] !== undefined ? { ch: road.regions[regionIndex]! } : {}) });
      y -= SPACING;
    }
    const before = nodes[first - 1];
    bands.push({
      road,
      roadIndex,
      top: 0,
      bottom: roadIndex === 0 ? height : gateY + GATE_GAP / 2,
      gate: { x: Math.round(before ? (before.x + nodes[first]!.x) / 2 : nodes[first]!.x), y: gateY },
    });
  });
  // Each band reaches up to where the next one begins; the last runs to the top edge.
  bands.forEach((band, i) => { band.top = bands[i + 1]?.bottom ?? 0; });
  const last = nodes[nodes.length - 1]!;
  const first = nodes[0]!;
  cached = { nodes, bands, height, summit: { x: WORLD_WIDTH / 2, y: last.y - 190 }, camp: { x: first.x - 150, y: first.y + 110 } };
  return cached;
}

/** The node standing for a region, or undefined for an unknown region. */
export function nodeOfRegion(ch: number): WorldNode | undefined {
  return worldLayout().nodes.find((node) => node.ch === ch);
}

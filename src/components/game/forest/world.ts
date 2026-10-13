import { KODAMA, type AreaDefinition, type Site } from "./areas";

/** Save-free, renderer-independent exploration rules. World units are twice the art pixels. */
export type Point = { x: number; y: number };
export const WORLD = { width: 1536, height: 960, speed: 185, radius: 12 };
// Kodama Woods, kept as named exports for the original single-area callers.
export const START: Point = KODAMA.start;
export const SITES = KODAMA.sites;
export const TRAIL: readonly Point[] = KODAMA.trail;
export const MOTES: readonly Point[] = KODAMA.motes;
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}
export const onTrail = (p: Point, width = 70, area: AreaDefinition = KODAMA) =>
  area.trail.some((a, i) => i > 0 && segmentDistance(p, area.trail[i - 1]!, a) < width);
export const riverX = (y: number, area: AreaDefinition = KODAMA) =>
  area.water.base + Math.sin(y / area.water.period) * area.water.amplitude;
/** Where travel to a landmark stops: just off it, on the approach side. */
export const approachOf = (site: Site): Point => ({
  x: site.x + (site.approach?.x ?? -32),
  y: site.y + (site.approach?.y ?? 27),
});
export function seeded(seed = 82) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}
export type Tree = { x: number; y: number; size: number; variant: number };
const forests = new Map<AreaDefinition["id"], Tree[]>();
/** Deterministic scenery: the same area always grows the same trees, clear of paths and water. */
export function treesOf(area: AreaDefinition): Tree[] {
  const cached = forests.get(area.id);
  if (cached) return cached;
  const rng = seeded(area.trees.seed),
    pool = area.trees.variants;
  const trees = Array.from({ length: area.trees.count }, () => ({
    x: 40 + rng() * 1456,
    y: 40 + rng() * 900,
    size: 0.8 + rng() * 0.5,
    variant: pool[Math.floor(rng() * pool.length)]!,
  })).filter(
    (p) =>
      !onTrail(p, 110, area) &&
      !onTrail({ x: p.x, y: p.y - 105 * p.size }, 110 * p.size + 42, area) &&
      Math.abs(p.x - riverX(p.y, area)) > 100 &&
      distance(p, area.sites[2]) > 165 &&
      distance(p, area.start) > 100 &&
      area.clearings.every((c) => distance(p, c) > c.r),
  );
  forests.set(area.id, trees);
  return trees;
}
export const TREES = treesOf(KODAMA);
export function walkable(p: Point, restored: number, area: AreaDefinition = KODAMA) {
  if (
    p.x < 90 ||
    p.x > WORLD.width - 90 ||
    p.y < 100 ||
    p.y > WORLD.height - 70
  )
    return false;
  if (
    Math.abs(p.x - riverX(p.y, area)) < 72 &&
    !(restored >= 2 && Math.abs(p.y - area.crossing.y) < area.crossing.halfHeight)
  )
    return false;
  if (area.blocked.some((r) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1)) return false;
  return !treesOf(area).some((tree) => distance(p, tree) < 21 * tree.size);
}
export function movePlayer(
  p: Point,
  dx: number,
  dy: number,
  seconds: number,
  restored: number,
  area: AreaDefinition = KODAMA,
): Point {
  const length = Math.hypot(dx, dy);
  if (!length) return p;
  const step = (WORLD.speed * Math.min(0.05, seconds)) / length;
  const next = { ...p };
  if (walkable({ x: p.x + dx * step, y: p.y }, restored, area)) next.x += dx * step;
  if (walkable({ x: next.x, y: p.y + dy * step }, restored, area))
    next.y += dy * step;
  return next;
}
/** Bounded grid search makes tap-to-walk work around trees and the river. */
export function findPath(
  start: Point,
  target: Point,
  restored: number,
  area: AreaDefinition = KODAMA,
): Point[] {
  const step = 24,
    cols = 64,
    rows = 40;
  const cell = (p: Point) => ({
    x: Math.round(p.x / step),
    y: Math.round(p.y / step),
  });
  const a = cell(start),
    b = cell(target),
    key = (x: number, y: number) => y * cols + x;
  if (!walkable(target, restored, area)) return [];
  const queue = [a],
    parents = new Map<number, number>([[key(a.x, a.y), -1]]);
  let found = -1;
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]!,
      ck = key(c.x, c.y);
    if (c.x === b.x && c.y === b.y) {
      found = ck;
      break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = c.x + dx!,
        y = c.y + dy!,
        k = key(x, y);
      if (
        x < 0 ||
        y < 0 ||
        x >= cols ||
        y >= rows ||
        parents.has(k) ||
        !walkable({ x: x * step, y: y * step }, restored, area)
      )
        continue;
      parents.set(k, ck);
      queue.push({ x, y });
    }
  }
  if (found < 0) return [];
  const path: Point[] = [target];
  while (parents.get(found) !== -1) {
    path.push({ x: (found % cols) * step, y: Math.floor(found / cols) * step });
    found = parents.get(found)!;
  }
  return path.reverse();
}

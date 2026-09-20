/** Save-free, renderer-independent exploration rules. World units are twice the art pixels. */
export type Point = { x: number; y: number };
export const WORLD = { width: 1536, height: 960, speed: 185, radius: 12 };
export const START: Point = { x: 300, y: 690 };
export const SITES = [
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
] as const;
export const TRAIL: Point[] = [
  START,
  { x: 360, y: 650 },
  SITES[0],
  { x: 560, y: 550 },
  SITES[1],
  { x: 920, y: 466 },
  { x: 1020, y: 400 },
  SITES[2],
  { x: 1200, y: 310 },
];
export const MOTES: Point[] = [
  { x: 372, y: 650 },
  { x: 542, y: 566 },
  { x: 632, y: 490 },
  { x: 914, y: 466 },
  { x: 1008, y: 410 },
];
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
export const onTrail = (p: Point, width = 70) =>
  TRAIL.some((a, i) => i > 0 && segmentDistance(p, TRAIL[i - 1]!, a) < width);
export const riverX = (y: number) => 796 + Math.sin(y / 145) * 22;
export function seeded(seed = 82) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}
const rng = seeded();
export const TREES = Array.from({ length: 235 }, () => ({
  x: 40 + rng() * 1456,
  y: 40 + rng() * 900,
  size: 0.8 + rng() * 0.5,
  variant: Math.floor(rng() * 3),
})).filter(
  (p) =>
    !onTrail(p, 110) &&
    !onTrail({ x: p.x, y: p.y - 105 * p.size }, 110 * p.size + 42) &&
    Math.abs(p.x - riverX(p.y)) > 100 &&
    distance(p, SITES[2]) > 165 &&
    distance(p, START) > 100,
);
export function walkable(p: Point, restored: number) {
  if (
    p.x < 90 ||
    p.x > WORLD.width - 90 ||
    p.y < 100 ||
    p.y > WORLD.height - 70
  )
    return false;
  if (
    Math.abs(p.x - riverX(p.y)) < 72 &&
    !(restored >= 2 && Math.abs(p.y - 466) < 34)
  )
    return false;
  if (p.x > 1040 && p.x < 1180 && p.y > 175 && p.y < 276) return false;
  return !TREES.some((tree) => distance(p, tree) < 21 * tree.size);
}
export function movePlayer(
  p: Point,
  dx: number,
  dy: number,
  seconds: number,
  restored: number,
): Point {
  const length = Math.hypot(dx, dy);
  if (!length) return p;
  const step = (WORLD.speed * Math.min(0.05, seconds)) / length;
  const next = { ...p };
  if (walkable({ x: p.x + dx * step, y: p.y }, restored)) next.x += dx * step;
  if (walkable({ x: next.x, y: p.y + dy * step }, restored))
    next.y += dy * step;
  return next;
}
/** Bounded grid search makes tap-to-walk work around trees and the river. */
export function findPath(
  start: Point,
  target: Point,
  restored: number,
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
  if (!walkable(target, restored)) return [];
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
        !walkable({ x: x * step, y: y * step }, restored)
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

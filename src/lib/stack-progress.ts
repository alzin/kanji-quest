import type { SaveData } from "./srs";

export type StackProgress = {
  bestSheet: number; bestMarathon: number; bestSprintMs: number; sheetsCleared: number; lastSealDay: string;
  quests: { day: string; sheets: number; redeems: number; typed: number };
  freezes: { count: number; granted: number; lastUsedDay: string };
  cosmetics: { owned: string[]; stamp: string; paper: string };
  perfectGates: number[];
  playDay: string; playMs: number; strokeDay: string;
};

export const COSMETICS = [
  { id: "hanko", name: "Classic seal", kind: "stamp", cost: 0, mark: "字" },
  { id: "sakura", name: "Sakura seal", kind: "stamp", cost: 80, mark: "花" },
  { id: "wave", name: "Wave seal", kind: "stamp", cost: 120, mark: "波" },
  { id: "washi", name: "Warm washi", kind: "paper", cost: 0, mark: "紙" },
  { id: "indigo", name: "Indigo paper", kind: "paper", cost: 100, mark: "藍" },
  { id: "moss", name: "Moss paper", kind: "paper", cost: 100, mark: "苔" },
] as const;

export function localDay(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function emptyStack(): StackProgress {
  return {
    bestSheet: 0, bestMarathon: 0, bestSprintMs: 0, sheetsCleared: 0, lastSealDay: "",
    quests: { day: "", sheets: 0, redeems: 0, typed: 0 }, freezes: { count: 0, granted: 0, lastUsedDay: "" },
    cosmetics: { owned: ["hanko", "washi"], stamp: "hanko", paper: "washi" }, perfectGates: [],
    playDay: "", playMs: 0, strokeDay: "",
  };
}

const obj = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(v))) : 0;
const date = (v: unknown): string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : "";
};

export function normalizeStack(value: unknown, validGates: readonly number[]): StackProgress {
  const s = obj(value), q = obj(s["quests"]), f = obj(s["freezes"]), c = obj(s["cosmetics"]);
  const owned = [...new Set(["hanko", "washi", ...(Array.isArray(c["owned"]) ? c["owned"].filter((id): id is string => typeof id === "string" && COSMETICS.some((x) => x.id === id)) : [])])];
  return {
    bestSheet: num(s["bestSheet"]), bestMarathon: num(s["bestMarathon"]), bestSprintMs: num(s["bestSprintMs"]), sheetsCleared: num(s["sheetsCleared"]), lastSealDay: date(s["lastSealDay"]),
    quests: { day: date(q["day"]), sheets: num(q["sheets"]), redeems: num(q["redeems"]), typed: num(q["typed"]) },
    freezes: { count: Math.min(3, num(f["count"])), granted: Math.min(7, num(f["granted"])), lastUsedDay: date(f["lastUsedDay"]) },
    cosmetics: {
      owned,
      stamp: COSMETICS.find((x) => x.kind === "stamp" && x.id === c["stamp"] && owned.includes(x.id))?.id ?? "hanko",
      paper: COSMETICS.find((x) => x.kind === "paper" && x.id === c["paper"] && owned.includes(x.id))?.id ?? "washi",
    },
    perfectGates: Array.isArray(s["perfectGates"]) ? [...new Set(s["perfectGates"].filter((id): id is number => typeof id === "number" && validGates.includes(id)))].sort((a, b) => a - b) : [],
    playDay: date(s["playDay"]), playMs: num(s["playMs"]), strokeDay: date(s["strokeDay"]),
  };
}

/** Calendar ordinals, not elapsed hours: DST cannot spend a freeze. */
export function dayGap(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);
}

export function stackOf(save: SaveData): StackProgress { return save.stack ?? emptyStack(); }
export function copyStack(save: SaveData): StackProgress {
  const s = stackOf(save);
  return { ...s, quests: { ...s.quests }, freezes: { ...s.freezes }, cosmetics: { ...s.cosmetics, owned: [...s.cosmetics.owned] }, perfectGates: [...s.perfectGates] };
}

export function dailyQuests(save: SaveData, now = Date.now()) {
  const day = localDay(now), q = stackOf(save).quests;
  const seed = [...day].reduce((v, c) => v * 31 + c.charCodeAt(0) >>> 0, 0);
  const goals = [
    { key: "sheets", label: "Clear 2 sheets", target: 2 },
    { key: "redeems", label: "Wash 3 ink tiles", target: 3 },
    { key: "typed", label: "Complete one typed seal", target: 1 },
  ] as const;
  return [...goals.slice(seed % 3), ...goals.slice(0, seed % 3)].map((g) => ({ ...g, value: q.day === day ? Math.min(g.target, q[g.key]) : 0 }));
}

export function ensureStackDay(s: StackProgress, now: number) {
  const today = localDay(now);
  if (s.quests.day !== today) s.quests = { day: today, sheets: 0, redeems: 0, typed: 0 };
  if (s.playDay !== today) { s.playDay = today; s.playMs = 0; }
}

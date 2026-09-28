/** Shared, serializable identities for Firefly Rescue. Keep backend validation in sync. */
export type RunnerDifficulty = "standard" | "relaxed";
export type LanternId = "amber" | "jade" | "azure" | "rose";
export const SPIRITS = [
  { id: "komorebi", name: "Komorebi", title: "The sunbeam moth", stage: 0, color: "#f7d47c", shape: "moth" },
  { id: "take", name: "Take", title: "The bamboo keeper", stage: 0, color: "#a8dda3", shape: "leaf" },
  { id: "kohaku", name: "Kohaku", title: "The amber fox", stage: 0, color: "#f8b079", shape: "fox" },
  { id: "mizu", name: "Mizu", title: "The river wanderer", stage: 1, color: "#9cdde7", shape: "fox" },
  { id: "shizuku", name: "Shizuku", title: "The little raindrop", stage: 1, color: "#b6cafa", shape: "leaf" },
  { id: "kawa", name: "Kawa", title: "The water lantern", stage: 1, color: "#8be1cc", shape: "moth" },
  { id: "hoshi", name: "Hoshi", title: "The fallen star", stage: 2, color: "#ffe5a3", shape: "moth" },
  { id: "tsuki", name: "Tsuki", title: "The moon rabbit", stage: 2, color: "#dfc1f5", shape: "leaf" },
  { id: "akari", name: "Akari", title: "The shrine guardian", stage: 2, color: "#ffabb4", shape: "fox" },
] as const;
export type SpiritId = typeof SPIRITS[number]["id"];
export const LANTERNS = [
  { id: "amber", name: "First light", color: "#f7d47c", required: 0 },
  { id: "jade", name: "Grove glow", color: "#a8dda3", required: 3 },
  { id: "azure", name: "River glass", color: "#9cdde7", required: 6 },
  { id: "rose", name: "Dawn blossom", color: "#ffabb4", required: 9 },
] as const;
export const STAGES = [
  { name: "Bamboo dusk", subtitle: "Follow the first lights", kanji: "竹" },
  { name: "Moonlit river", subtitle: "Carry them across the water", kanji: "川" },
  { name: "Lantern ridge", subtitle: "Bring every little light home", kanji: "灯" },
] as const;
/**
 * Stage times of the word gates. They sit further apart than the longest sight window, so each
 * gate's words are chosen after the previous answer and only one lantern call is ever live.
 * The last stage stops early to keep its six-second shrine approach. Client-only; the backend never sees these.
 */
export const GATE_TIMES = [3.8, 7.4, 11, 14.6, 18.2, 21.8, 25.4, 29] as const;
export const gateTimesOf = (stage: number): readonly number[] => stage === 2 ? GATE_TIMES.filter((time) => time <= 23.2) : GATE_TIMES;
export const GATES_PER_ADVENTURE = gateTimesOf(0).length + gateTimesOf(1).length + gateTimesOf(2).length;
/** intro: meet a new word. reading: word → its kana. listen: heard kana → its written word. */
export type GateMode = "intro" | "reading" | "listen";
export type TrailId = "grove" | "bramble" | "bridge" | "moonpath";
export const TRAILS = {
  grove: { name: "Firefly Grove", kanji: "森", boon: "Firefly magnet", description: "Nearby fireflies drift to your lantern. A generous, gentle trail.", risk: "Gentle trail", stage: 1 },
  bramble: { name: "Bramble Run", kanji: "棘", boon: "Longer Burst", description: "Burst for 1.5 seconds. Brave the thorns to find an extra spirit.", risk: "Extra rescue", stage: 1 },
  bridge: { name: "Quiet Bridge", kanji: "橋", boon: "One-hit shield", description: "A quiet crossing. Your shield protects one heart and your chain.", risk: "Gentle trail", stage: 2 },
  moonpath: { name: "Moonpath", kanji: "月", boon: "Third Burst charge", description: "Carry three charges and gain one now. One more spirit awaits.", risk: "Extra rescue", stage: 2 },
} as const;

import type { JLPTLevel } from "@/data";
import { LANTERNS, SPIRITS, type LanternId, type SpiritId } from "./firefly-catalog";
import type { SaveData } from "./srs";

export type RunnerProgress = {
  best: Record<JLPTLevel, { standard: number; relaxed: number }>;
  rescued: SpiritId[];
  equippedLantern: LanternId;
  tutorialSeen: boolean;
};

export function emptyRunner(): RunnerProgress {
  return {
    best: { N5: { standard: 0, relaxed: 0 }, N4: { standard: 0, relaxed: 0 }, N3: { standard: 0, relaxed: 0 } },
    rescued: [], equippedLantern: "amber", tutorialSeen: false,
  };
}

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const score = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value))) : 0;

export function normalizeRunner(value: unknown): RunnerProgress {
  const raw = object(value), best = object(raw["best"]), result = emptyRunner();
  for (const level of ["N5", "N4", "N3"] as const) {
    const records = object(best[level]);
    result.best[level] = { standard: score(records["standard"]), relaxed: score(records["relaxed"]) };
  }
  // Canonical order also makes cloud comparison independent of rescue order.
  result.rescued = SPIRITS.filter((spirit) => Array.isArray(raw["rescued"]) && raw["rescued"].includes(spirit.id)).map((spirit) => spirit.id);
  result.equippedLantern = LANTERNS.find((lantern) => lantern.id === raw["equippedLantern"] && lantern.required <= result.rescued.length)?.id ?? "amber";
  result.tutorialSeen = raw["tutorialSeen"] === true;
  return result;
}

export function runnerOf(save: SaveData): RunnerProgress { return save.runner ?? emptyRunner(); }

export function copyRunner(save: SaveData): RunnerProgress {
  const runner = runnerOf(save);
  return { ...runner, best: { N5: { ...runner.best.N5 }, N4: { ...runner.best.N4 }, N3: { ...runner.best.N3 } }, rescued: [...runner.rescued] };
}

export function unlockedLanterns(save: SaveData) {
  return LANTERNS.filter((lantern) => lantern.required <= runnerOf(save).rescued.length);
}

export function hasRunnerProgress(save: SaveData): boolean {
  const runner = runnerOf(save);
  return runner.tutorialSeen || runner.rescued.length > 0 || Object.values(runner.best).some((records) => records.standard > 0 || records.relaxed > 0);
}

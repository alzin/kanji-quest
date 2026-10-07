import type { SaveData } from "./srs";

/** Every region checkpoint is the same planned sequence. The typed seal follows the last step. */
export const CHECKPOINT_STEPS = [
  { id: "learn", label: "Learn & write", short: "Learn" },
  { id: "stack", label: "Stack & recall", short: "Stack" },
  { id: "rescue", label: "Firefly Rescue", short: "Rescue" },
] as const;
export type CheckpointStep = typeof CHECKPOINT_STEPS[number]["id"];

/**
 * Regions whose steps are complete, one sorted list per step. Steps complete in order, so each
 * list is a subset of the one before it. A stamped seal removes its region from every list.
 */
export type CheckpointSteps = { learned: number[]; stacked: number[]; rescued: number[] };
export const STEP_LIST = { learn: "learned", stack: "stacked", rescue: "rescued" } as const satisfies Record<CheckpointStep, keyof CheckpointSteps>;

export function emptyCheckpointSteps(): CheckpointSteps {
  return { learned: [], stacked: [], rescued: [] };
}

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function normalizeCheckpointSteps(value: unknown, validRegions: readonly number[]): CheckpointSteps {
  const raw = object(value);
  const list = (field: keyof CheckpointSteps, within?: readonly number[]) => {
    const ids = raw[field];
    return Array.isArray(ids) ? [...new Set(ids.filter((id): id is number => typeof id === "number" && validRegions.includes(id) && (!within || within.includes(id))))].sort((a, b) => a - b) : [];
  };
  const learned = list("learned");
  const stacked = list("stacked", learned);
  return { learned, stacked, rescued: list("rescued", stacked) };
}

export function checkpointStepsOf(save: SaveData): CheckpointSteps { return save.checkpointSteps ?? emptyCheckpointSteps(); }

export function copyCheckpointSteps(save: SaveData): CheckpointSteps {
  const steps = checkpointStepsOf(save);
  return { learned: [...steps.learned], stacked: [...steps.stacked], rescued: [...steps.rescued] };
}

/** How many of a region's steps are complete, counted in order (0–3). */
export function completedSteps(save: SaveData, ch: number): number {
  const steps = checkpointStepsOf(save);
  return steps.rescued.includes(ch) ? 3 : steps.stacked.includes(ch) ? 2 : steps.learned.includes(ch) ? 1 : 0;
}

/** Where a region's checkpoint continues: its first incomplete step, else the typed seal. */
export function nextCheckpointStep(save: SaveData, ch: number): CheckpointStep | "seal" {
  return CHECKPOINT_STEPS[completedSteps(save, ch)]?.id ?? "seal";
}

export function stepIndex(step: CheckpointStep): number {
  return CHECKPOINT_STEPS.findIndex((s) => s.id === step);
}

export function hasCheckpointSteps(save: SaveData): boolean {
  return checkpointStepsOf(save).learned.length > 0;
}

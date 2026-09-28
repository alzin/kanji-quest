/** Authored lane silhouettes. Simulation mirrors and sequences these using its seed. */
export const HAZARD_PATTERNS: ReadonlyArray<{ id: string; rows: ReadonlyArray<readonly number[]> }> = [
  { id: "weave", rows: [[0, 1], [1, 2], [0, 1]] },
  { id: "stepping-stones", rows: [[0], [2], [1]] },
  { id: "bamboo-gate", rows: [[0, 2], [0], [1, 2]] },
  { id: "long-bend", rows: [[0, 1], [0, 1], [0, 2]] },
];

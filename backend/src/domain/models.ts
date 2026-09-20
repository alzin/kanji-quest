export type User = { id: string; email: string; name: string; picture: string | null };

/** Identity accepted only after the authentication adapter verifies Google's token. */
export type GoogleIdentity = { subject: string; email: string; name: string; picture: string | null };

export type CardProgress = {
  mastery: 0 | 1 | 2 | 3;
  ivl: number;
  ease: number;
  due: number;
  correct: number;
  wrong: number;
  rt?: number;
  prod?: number;
  fl?: number;
};

export type StackProgress = {
  bestSheet: number;
  bestMarathon: number;
  bestSprintMs: number;
  sheetsCleared: number;
  lastSealDay: string;
  quests: { day: string; sheets: number; redeems: number; typed: number };
  freezes: { count: number; granted: number; lastUsedDay: string };
  cosmetics: { owned: string[]; stamp: string; paper: string };
  perfectGates: number[];
  playDay: string;
  playMs: number;
  strokeDay: string;
};

export type SaveData = {
  curriculumVersion: number;
  unlockedChapters: number[];
  progress: Record<string, CardProgress>;
  streak: { count: number; last: string };
  coins: number;
  runsCompleted: number;
  gatesCleared: number;
  clearedChapters: number[];
  selectedLevel: "N5" | "N4";
  stack?: StackProgress;
};

/** Version zero means that the account has never uploaded a save. */
export type ProgressSnapshot = { save: SaveData | null; version: number };

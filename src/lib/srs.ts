import { allKanji, kanjiByChar, kanjiOfChapter, CHAPTER_COUNT } from "@/data/n5";
import type { Kanji } from "@/data/n5/types";
import { useSyncExternalStore } from "react";

// ---------- Types ----------

export type Mastery = 0 | 1 | 2 | 3; // unseen, learning, reviewing, mastered

export type CardProgress = {
  mastery: Mastery;
  ivl: number; // interval in days
  ease: number;
  due: number; // epoch ms
  correct: number;
  wrong: number;
};

export type SaveData = {
  progress: Record<string, CardProgress>;
  streak: { count: number; last: string }; // last = YYYY-MM-DD
  coins: number;
  runsCompleted: number;
  gatesCleared: number; // chapter boss gates cleared
};

const KEY = "kanji-dash-v1";

const emptySave = (): SaveData => ({
  progress: {},
  streak: { count: 0, last: "" },
  coins: 0,
  runsCompleted: 0,
  gatesCleared: 0,
});

// ---------- Store ----------

let state: SaveData = emptySave();
let hydrated = false;
const listeners = new Set<() => void>();

function load() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = { ...emptySave(), ...JSON.parse(raw) };
  } catch {
    state = emptySave();
  }
}

function save() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function emit() {
  save();
  listeners.forEach((l) => l());
}

export function subscribe(cb: () => void) {
  load();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSnapshot(): SaveData {
  load();
  return state;
}

const SERVER_SNAPSHOT = emptySave();
export function getServerSnapshot(): SaveData {
  return SERVER_SNAPSHOT;
}

export function useSave(): SaveData {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function mutate(fn: (s: SaveData) => void) {
  load();
  fn(state);
  emit();
}

// ---------- Progress helpers ----------

export function getCard(s: SaveData, c: string): CardProgress {
  return (
    s.progress[c] ?? { mastery: 0, ivl: 0, ease: 2.5, due: 0, correct: 0, wrong: 0 }
  );
}

export function chapterMasteryPct(s: SaveData, ch: number): number {
  const ks = kanjiOfChapter(ch);
  if (!ks.length) return 0;
  const pts = ks.reduce((acc, k) => acc + getCard(s, k.c).mastery, 0);
  return Math.round((pts / (ks.length * 3)) * 100);
}

export function isChapterUnlocked(s: SaveData, ch: number): boolean {
  if (ch === 1) return true;
  return chapterMasteryPct(s, ch - 1) >= 55;
}

export function isGateCleared(s: SaveData, ch: number): boolean {
  return s.gatesCleared >= ch;
}

export function n5MasteryPct(s: SaveData): number {
  const pts = allKanji.reduce((acc, k) => acc + getCard(s, k.c).mastery, 0);
  return Math.round((pts / (allKanji.length * 3)) * 100);
}

export function dueCount(s: SaveData): number {
  const now = Date.now();
  return allKanji.filter((k) => {
    const p = s.progress[k.c];
    return p && p.mastery > 0 && p.mastery < 3 && p.due <= now;
  }).length;
}

export function streakCount(s: SaveData): number {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (s.streak.last === today) return s.streak.count;
  if (s.streak.last === yesterday) return s.streak.count;
  return 0;
}

// ---------- Question building ----------

export type QuestionType = "meaning" | "reading" | "vocab";

export type Question = {
  kanji: Kanji;
  type: QuestionType;
  prompt: string; // big text shown on the gate
  sub: string; // small helper text
  choices: string[]; // 3 choices, one correct
  answer: string;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function readingOf(k: Kanji): string {
  const kun = k.kun !== "—" ? (k.kun.split(",")[0] ?? "").replace(/[()]/g, "") : "";
  const on = k.on !== "—" ? (k.on.split(",")[0] ?? "").trim() : "";
  return kun || on;
}

export function buildQuestion(k: Kanji): Question {
  const pool = allKanji.filter((x) => x.c !== k.c);
  const type: QuestionType = pick(["meaning", "reading", "vocab"] as QuestionType[]);

  if (type === "meaning") {
    const distractors = shuffle(pool).slice(0, 2).map((x) => x.m);
    const choices = shuffle([k.m, ...distractors]);
    return { kanji: k, type, prompt: k.c, sub: "What does this kanji mean?", choices, answer: k.m };
  }
  if (type === "reading") {
    const correct = readingOf(k);
    const distractors = shuffle(pool.map(readingOf).filter((r) => r && r !== correct)).slice(0, 2);
    const choices = shuffle([correct, ...distractors]);
    return { kanji: k, type, prompt: k.c, sub: "Pick the correct reading", choices, answer: correct };
  }
  // vocab: which word uses this kanji?
  const correct = pick(k.vocab);
  const distractors = shuffle(pool.filter((x) => x.vocab.length)).slice(0, 2).map((x) => pick(x.vocab));
  const choices = shuffle([correct, ...distractors].map((v) => `${v.w} (${v.r})`));
  return {
    kanji: k,
    type,
    prompt: k.c,
    sub: "Which word uses this kanji?",
    choices,
    answer: `${correct.w} (${correct.r})`,
  };
}

// ---------- Run queue ----------

const NEW_PER_RUN = 5;
const MAX_REVIEWS = 15;

export function buildRunQueue(s: SaveData): Question[] {
  const now = Date.now();
  const seen = allKanji.filter((k) => {
    const p = s.progress[k.c];
    return p && p.mastery > 0 && p.mastery < 3 && p.due <= now && isChapterUnlocked(s, k.ch);
  });
  seen.sort((a, b) => getCard(s, a.c).due - getCard(s, b.c).due);
  const reviews = seen.slice(0, MAX_REVIEWS);

  const fresh = allKanji.filter((k) => !s.progress[k.c] && isChapterUnlocked(s, k.ch));
  fresh.sort((a, b) => a.ch - b.ch);
  const news = fresh.slice(0, NEW_PER_RUN);

  const queue = shuffle([...reviews, ...news]).map(buildQuestion);
  return queue;
}

export function buildGateQuiz(ch: number): Question[] {
  return shuffle(kanjiOfChapter(ch)).slice(0, 12).map(buildQuestion);
}

// ---------- Grading ----------

export function grade(c: string, correct: boolean) {
  mutate((s) => {
    const p = getCard(s, c);
    const now = Date.now();
    if (correct) {
      p.correct += 1;
      if (p.mastery === 0) {
        p.mastery = 1;
        p.ivl = 0.02; // ~30 min
      } else if (p.mastery === 1) {
        p.mastery = 2;
        p.ivl = 1;
      } else {
        p.ivl = Math.round(p.ivl * p.ease * 10) / 10;
        if (p.ivl >= 21) p.mastery = 3;
      }
      p.ease = Math.min(3, p.ease + 0.08);
    } else {
      p.wrong += 1;
      p.mastery = p.mastery === 0 ? 1 : p.mastery;
      if (p.mastery === 3) p.mastery = 2;
      p.ivl = Math.max(0.01, p.ivl * 0.4);
      p.ease = Math.max(1.3, p.ease - 0.2);
    }
    p.due = now + p.ivl * 86400000;
    s.progress[c] = p;
  });
}

export function touchStreak() {
  mutate((s) => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (s.streak.last === today) return;
    s.streak.count = s.streak.last === yesterday ? s.streak.count + 1 : 1;
    s.streak.last = today;
  });
}

export function finishRun(earned: number) {
  mutate((s) => {
    s.coins += earned;
    s.runsCompleted += 1;
  });
  touchStreak();
}

export function clearGate(ch: number) {
  mutate((s) => {
    if (s.gatesCleared < ch) s.gatesCleared = ch;
    s.coins += 50;
  });
  touchStreak();
}

export { kanjiByChar, CHAPTER_COUNT };

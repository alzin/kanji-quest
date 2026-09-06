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
  clearedChapters: number[]; // exact seals earned (not the highest chapter)
};

const KEY = "kanji-dash-v1";

const emptySave = (): SaveData => ({
  progress: {},
  streak: { count: 0, last: "" },
  coins: 0,
  runsCompleted: 0,
  gatesCleared: 0,
  clearedChapters: [],
});

const DAY_MS = 86_400_000;
const MAX_TIMESTAMP = 8_640_000_000_000_000;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function nonnegative(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(value, Number.MAX_SAFE_INTEGER) : fallback;
}

function count(value: unknown): number {
  return Math.floor(nonnegative(value));
}

function validChapter(ch: number): boolean {
  return Number.isInteger(ch) && ch >= 1 && ch <= CHAPTER_COUNT;
}

// Validate the persistence boundary so old/partial saves cannot poison arithmetic.
export function normalizeSave(value: unknown): SaveData {
  const raw = record(value);
  const progress: SaveData["progress"] = {};
  for (const [c, value] of Object.entries(record(raw["progress"]))) {
    if (!kanjiByChar.has(c) || value === null || typeof value !== "object") continue;
    const p = record(value);
    progress[c] = {
      mastery: Math.min(3, count(p["mastery"])) as Mastery,
      ivl: Math.min(MAX_TIMESTAMP / DAY_MS, nonnegative(p["ivl"])),
      ease: Math.min(3, Math.max(1.3, nonnegative(p["ease"], 2.5))),
      due: Math.min(MAX_TIMESTAMP, Math.round(nonnegative(p["due"]))),
      correct: count(p["correct"]),
      wrong: count(p["wrong"]),
    };
  }
  const clearedChapters = Array.isArray(raw["clearedChapters"])
    ? [...new Set(raw["clearedChapters"].filter((ch): ch is number => typeof ch === "number" && validChapter(ch)))].sort((a, b) => a - b)
    : Array.from({ length: Math.min(CHAPTER_COUNT, count(raw["gatesCleared"])) }, (_, i) => i + 1);
  const streak = record(raw["streak"]);
  const last = typeof streak["last"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(streak["last"])
    && Number.isFinite(Date.parse(`${streak["last"]}T12:00:00Z`))
    && new Date(`${streak["last"]}T12:00:00Z`).toISOString().slice(0, 10) === streak["last"]
    ? streak["last"] : "";
  return {
    progress,
    streak: { count: last ? count(streak["count"]) : 0, last },
    coins: count(raw["coins"]),
    runsCompleted: count(raw["runsCompleted"]),
    gatesCleared: clearedChapters.length,
    clearedChapters,
  };
}

// ---------- Store ----------

let state: SaveData = emptySave();
let hydrated = false;
const listeners = new Set<() => void>();
let timeUpdate: number | undefined;

function notify() {
  listeners.forEach((listener) => listener());
  scheduleTimeUpdate();
}

function refreshClock() {
  state = { ...state };
  notify();
}

function scheduleTimeUpdate() {
  if (typeof window === "undefined" || !window.setTimeout) return;
  window.clearTimeout(timeUpdate);
  if (!listeners.size) return;
  const now = Date.now();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  let next = midnight.getTime();
  for (const k of allKanji) {
    const p = state.progress[k.c];
    if (p && p.mastery > 0 && p.due > now && isChapterUnlocked(state, k.ch)) next = Math.min(next, p.due);
  }
  timeUpdate = window.setTimeout(refreshClock, Math.max(1, next - now));
}

function load() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = normalizeSave(JSON.parse(raw));
  } catch {
    state = emptySave();
  }
  window.addEventListener?.("storage", (event) => {
    if ((event.key !== KEY && event.key !== null) || event.storageArea !== window.localStorage) return;
    try {
      state = event.newValue ? normalizeSave(JSON.parse(event.newValue)) : emptySave();
      notify();
    } catch {
      // An invalid external write cannot replace the current valid snapshot.
    }
  });
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
  notify();
}

export function subscribe(cb: () => void) {
  load();
  if (!listeners.size && typeof window !== "undefined") {
    window.addEventListener?.("focus", refreshClock);
    window.document?.addEventListener("visibilitychange", refreshClock);
  }
  listeners.add(cb);
  scheduleTimeUpdate();
  return () => {
    listeners.delete(cb);
    if (!listeners.size && typeof window !== "undefined") {
      window.clearTimeout?.(timeUpdate);
      window.removeEventListener?.("focus", refreshClock);
      window.document?.removeEventListener("visibilitychange", refreshClock);
    }
  };
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
  // useSyncExternalStore requires a new snapshot identity for every change.
  const next = { ...state, progress: { ...state.progress }, streak: { ...state.streak }, clearedChapters: [...state.clearedChapters] };
  fn(next);
  state = next;
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
  return masteryPct(pts, ks.length * 3);
}

function masteryPct(points: number, total: number): number {
  if (!total) return 0;
  return points === total ? 100 : Math.min(99, Math.round(points * 100 / total));
}

export function isChapterUnlocked(s: SaveData, ch: number): boolean {
  if (!validChapter(ch)) return false;
  if (ch === 1) return true;
  const previous = kanjiOfChapter(ch - 1);
  const points = previous.reduce((sum, k) => sum + getCard(s, k.c).mastery, 0);
  return points * 100 >= previous.length * 3 * 55;
}

export function isGateCleared(s: SaveData, ch: number): boolean {
  return validChapter(ch) && s.clearedChapters.includes(ch);
}

export function n5MasteryPct(s: SaveData): number {
  const pts = allKanji.reduce((acc, k) => acc + getCard(s, k.c).mastery, 0);
  return masteryPct(pts, allKanji.length * 3);
}

export function dueCount(s: SaveData, now = Date.now()): number {
  return allKanji.filter((k) => {
    const p = s.progress[k.c];
    return p && p.mastery > 0 && p.due <= now && isChapterUnlocked(s, k.ch);
  }).length;
}

function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function calendarDays(now: number) {
  const date = new Date(now);
  const today = localDay(date);
  date.setDate(date.getDate() - 1); // calendar arithmetic also handles DST changes
  return { today, yesterday: localDay(date) };
}

export function streakCount(s: SaveData, now = Date.now()): number {
  const { today, yesterday } = calendarDays(now);
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
  const kun = k.kun !== "—" ? (k.kun.split(",")[0] ?? "").replace(/[()]/g, "").trim() : "";
  const on = k.on !== "—" ? (k.on.split(",")[0] ?? "").trim() : "";
  return kun || on;
}

function normalizedReading(reading: string): string {
  return reading.replace(/[()\s]/g, "").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

function meanings(k: Kanji): string[] {
  return k.m.toLowerCase().split(";").map((m) => m.trim());
}

export function buildQuestion(k: Kanji, type: QuestionType = pick(["meaning", "reading", "vocab"])): Question {
  const pool = allKanji.filter((x) => x.c !== k.c);

  if (type === "meaning") {
    const correctMeanings = new Set(meanings(k));
    const distractors = shuffle([...new Set(pool.filter((x) => !meanings(x).some((m) => correctMeanings.has(m))).map((x) => x.m))]).slice(0, 2);
    const choices = shuffle([k.m, ...distractors]);
    return { kanji: k, type, prompt: k.c, sub: "What does this kanji mean?", choices, answer: k.m };
  }
  if (type === "reading") {
    const correct = readingOf(k);
    const validReadings = new Set(`${k.kun},${k.on}`.split(",").map(normalizedReading));
    const uniqueReadings = new Map(pool.map(readingOf).filter((r) => r && !validReadings.has(normalizedReading(r))).map((r) => [normalizedReading(r), r]));
    const distractors = shuffle([...uniqueReadings.values()]).slice(0, 2);
    const choices = shuffle([correct, ...distractors]);
    return { kanji: k, type, prompt: k.c, sub: "Pick the correct reading", choices, answer: correct };
  }
  // vocab: which word uses this kanji?
  const correct = pick(k.vocab.filter((v) => v.w.includes(k.c)));
  const distractors = shuffle([...new Set(pool.flatMap((x) => x.vocab).filter((v) => !v.w.includes(k.c)).map((v) => `${v.w} (${v.r})`))]).slice(0, 2);
  const choices = shuffle([`${correct.w} (${correct.r})`, ...distractors]);
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

export const NEW_PER_RUN = 5;
export const MAX_REVIEWS = 15;

export function buildRunQueue(s: SaveData, now = Date.now()): Question[] {
  const seen = allKanji.filter((k) => {
    const p = s.progress[k.c];
    return p && p.mastery > 0 && p.due <= now && isChapterUnlocked(s, k.ch);
  });
  seen.sort((a, b) => getCard(s, a.c).due - getCard(s, b.c).due);
  const reviews = seen.slice(0, MAX_REVIEWS);

  const fresh = allKanji.filter((k) => getCard(s, k.c).mastery === 0 && isChapterUnlocked(s, k.ch));
  fresh.sort((a, b) => a.ch - b.ch);
  const news = fresh.slice(0, NEW_PER_RUN);

  const queue = shuffle([...reviews, ...news]).map((k) => buildQuestion(k));
  return queue;
}

export function buildGateQuiz(ch: number): Question[] {
  return shuffle(kanjiOfChapter(ch)).slice(0, 12).map((k) => buildQuestion(k));
}

// ---------- Grading ----------

export function grade(c: string, correct: boolean, now = Date.now()) {
  if (!kanjiByChar.has(c)) return;
  mutate((s) => {
    const p = { ...getCard(s, c) };
    if (correct) {
      p.correct = Math.min(Number.MAX_SAFE_INTEGER, p.correct + 1);
      // Checkpoint rehearsal records the answer, but cannot fast-forward SRS.
      if (p.mastery > 0 && p.due > now) {
        s.progress[c] = p;
        return;
      }
      if (p.mastery === 0) {
        p.mastery = 1;
        p.ivl = 0.02; // ~30 min
      } else if (p.mastery === 1) {
        p.mastery = 2;
        p.ivl = 1;
      } else {
        p.ivl = Math.max(0.1, Math.round(p.ivl * p.ease * 10) / 10);
        if (p.ivl >= 21) p.mastery = 3;
      }
      p.ease = Math.min(3, Math.round((p.ease + 0.08) * 100) / 100);
    } else {
      p.wrong = Math.min(Number.MAX_SAFE_INTEGER, p.wrong + 1);
      p.mastery = p.mastery === 0 ? 1 : p.mastery;
      if (p.mastery === 3) p.mastery = 2;
      p.ivl = Math.max(0.01, p.ivl * 0.4);
      p.ease = Math.max(1.3, Math.round((p.ease - 0.2) * 100) / 100);
    }
    p.ivl = Math.min(MAX_TIMESTAMP / DAY_MS, p.ivl);
    p.due = Math.min(MAX_TIMESTAMP, now + Math.round(p.ivl * DAY_MS));
    s.progress[c] = p;
  });
}

function updateStreak(s: SaveData, now: number) {
  const { today, yesterday } = calendarDays(now);
  if (s.streak.last === today) return;
  s.streak.count = s.streak.last === yesterday ? Math.min(Number.MAX_SAFE_INTEGER, s.streak.count + 1) : 1;
  s.streak.last = today;
}

export function touchStreak(now = Date.now()) {
  mutate((s) => updateStreak(s, now));
}

export function finishRun(earned: number) {
  if (!Number.isSafeInteger(earned) || earned < 0) return;
  mutate((s) => {
    s.coins = Math.min(Number.MAX_SAFE_INTEGER, s.coins + earned);
    s.runsCompleted = Math.min(Number.MAX_SAFE_INTEGER, s.runsCompleted + 1);
    updateStreak(s, Date.now());
  });
}

export function clearGate(ch: number): number {
  load();
  if (!validChapter(ch) || isGateCleared(state, ch)) return 0;
  const earned = Math.min(50, Number.MAX_SAFE_INTEGER - state.coins);
  mutate((s) => {
    s.clearedChapters = [...s.clearedChapters, ch].sort((a, b) => a - b);
    s.gatesCleared = s.clearedChapters.length;
    s.coins += earned;
    updateStreak(s, Date.now());
  });
  return earned;
}

export { kanjiByChar, CHAPTER_COUNT };

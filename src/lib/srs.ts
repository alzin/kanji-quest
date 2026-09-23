import { allKanji, kanjiByChar, kanjiOfChapter, kanjiOfLevel, levelOfChapter, LEVEL_CHAPTERS, CHAPTER_COUNT, CURRICULUM_VERSION, REGIONS, LEGACY_CHAPTERS, type JLPTLevel } from "@/data";
import type { Kanji, Vocab } from "@/data/n5/types";
import {
  meaningChoices, readingChoices, vocabKana, wordSegments,
  type PromptSegment, type WordCard,
} from "./words";
import { useSyncExternalStore } from "react";
import { COSMETICS, copyStack, dayGap, emptyStack, ensureStackDay, normalizeStack, stackOf, type StackProgress } from "./stack-progress";


export type Mastery = 0 | 1 | 2 | 3; // unseen, learning, reviewing, mastered

export type CardProgress = {
  mastery: Mastery;
  ivl: number; // interval in days
  ease: number;
  due: number; // epoch ms
  correct: number;
  wrong: number;
  rt?: number; // response-time EMA in milliseconds; zero means unmeasured
  prod?: number;
  fl?: number;
};

export type SaveData = {
  curriculumVersion: number;
  unlockedChapters: number[]; // access retained across migration and later review mistakes
  progress: Record<string, CardProgress>;
  streak: { count: number; last: string }; // last = YYYY-MM-DD
  coins: number;
  runsCompleted: number;
  gatesCleared: number; // chapter boss gates cleared
  clearedChapters: number[]; // exact seals earned (not the highest chapter)
  selectedLevel: JLPTLevel;
  stack?: StackProgress;
};

const LEGACY_KEY = "kanji-dash-v1";
export const GUEST_SAVE_KEY = "kanji-dash-guest-v1";

const emptySave = (): SaveData => ({
  curriculumVersion: CURRICULUM_VERSION,
  unlockedChapters: [],
  progress: {},
  streak: { count: 0, last: "" },
  coins: 0,
  runsCompleted: 0,
  gatesCleared: 0,
  clearedChapters: [],
  selectedLevel: "N5",
  stack: emptyStack(),
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
  return levelOfChapter(ch) !== undefined;
}

function chapterIds(value: unknown, valid = validChapter): number[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((ch): ch is number => typeof ch === "number" && valid(ch)))].sort((a, b) => a - b)
    : [];
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
      rt: Math.min(600_000, nonnegative(p["rt"])),
      prod: count(p["prod"]),
      fl: count(p["fl"]),
    };
  }
  const currentCurriculum = raw["curriculumVersion"] === CURRICULUM_VERSION;
  const legacySeals = Array.isArray(raw["clearedChapters"])
    ? chapterIds(raw["clearedChapters"], (ch) => LEGACY_CHAPTERS.includes(ch))
    // A legacy high-water mark can only describe the original six N5 gates.
    : LEGACY_CHAPTERS.slice(0, Math.min(6, count(raw["gatesCleared"])));
  const clearedChapters = currentCurriculum
    ? chapterIds(raw["clearedChapters"])
    : REGIONS.filter((r) => legacySeals.includes(r.legacyChapter)).map((r) => r.id).sort((a, b) => a - b);
  const unlockedChapters = currentCurriculum ? chapterIds(raw["unlockedChapters"]) : [];
  if (!currentCurriculum && (Object.keys(progress).length || legacySeals.length || count(raw["runsCompleted"]))) {
    const n4Open = LEGACY_CHAPTERS.slice(0, 6).every((ch) => legacySeals.includes(ch));
    for (const ch of LEGACY_CHAPTERS) {
      if (ch > 6 && !n4Open) continue;
      const previous = REGIONS.filter((r) => r.legacyChapter === ch - 1).flatMap((r) => [...r.chars]);
      const points = previous.reduce((sum, c) => sum + (progress[c]?.mastery ?? 0), 0);
      if (ch === 1 || ch === 7 || legacySeals.includes(ch) || points * 100 >= previous.length * 3 * 55) {
        unlockedChapters.push(...REGIONS.filter((r) => r.legacyChapter === ch).map((r) => r.id));
      }
    }
  }
  const streak = record(raw["streak"]);
  const last = typeof streak["last"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(streak["last"])
    && Number.isFinite(Date.parse(`${streak["last"]}T12:00:00Z`))
    && new Date(`${streak["last"]}T12:00:00Z`).toISOString().slice(0, 10) === streak["last"]
    ? streak["last"] : "";
  const normalized: SaveData = {
    curriculumVersion: CURRICULUM_VERSION,
    unlockedChapters,
    progress,
    streak: { count: last ? count(streak["count"]) : 0, last },
    coins: count(raw["coins"]),
    runsCompleted: count(raw["runsCompleted"]),
    gatesCleared: clearedChapters.length,
    clearedChapters,
    selectedLevel: raw["selectedLevel"] === "N4" ? "N4" : "N5",
    stack: normalizeStack(raw["stack"], REGIONS.map((r) => r.id)),
  };
  retainChapterAccess(normalized);
  return normalized;
}


let state: SaveData = emptySave();
let hydrated = false;
let persistAccount: ((save: SaveData) => void) | undefined;
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
    const raw = window.sessionStorage.getItem(GUEST_SAVE_KEY);
    if (raw) state = normalizeSave(JSON.parse(raw));
  } catch {
    state = emptySave();
  }
}

function save() {
  if (persistAccount) {
    persistAccount(state);
    return;
  }
  try {
    window.sessionStorage.setItem(GUEST_SAVE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Account transport owns persistence only after the server identifies its user. */
export function setProgressPersistence(writer?: (save: SaveData) => void) {
  persistAccount = writer;
}

/** Loading a cloud snapshot is not a gameplay mutation and must not enqueue a write. */
export function replaceSave(value: unknown) {
  load();
  state = normalizeSave(value);
  notify();
}

export function resetGuestSave() {
  persistAccount = undefined;
  try { window.sessionStorage.removeItem(GUEST_SAVE_KEY); } catch { /* Private browsing may deny storage. */ }
  replaceSave(emptySave());
}

export function readLegacySave(): SaveData | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    return raw ? normalizeSave(JSON.parse(raw)) : null;
  } catch {
    return null;
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
  const next = { ...state, progress: { ...state.progress }, streak: { ...state.streak }, stack: copyStack(state), clearedChapters: [...state.clearedChapters], unlockedChapters: [...state.unlockedChapters] };
  retainChapterAccess(next);
  fn(next);
  retainChapterAccess(next);
  state = next;
  emit();
}


export function getCard(s: SaveData, c: string): CardProgress {
  return (
    s.progress[c] ?? { mastery: 0, ivl: 0, ease: 2.5, due: 0, correct: 0, wrong: 0, rt: 0, prod: 0, fl: 0 }
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
  const level = levelOfChapter(ch)!;
  if (!isLevelUnlocked(s, level)) return false;
  const road = LEVEL_CHAPTERS[level];
  if (ch === road[0] || isGateCleared(s, ch) || s.unlockedChapters.includes(ch)) return true;
  const previousId = road[road.indexOf(ch) - 1]!;
  if (isGateCleared(s, previousId)) return true;
  const previous = kanjiOfChapter(previousId);
  const points = previous.reduce((sum, k) => sum + getCard(s, k.c).mastery, 0);
  return points * 100 >= previous.length * 3 * 55;
}

function retainChapterAccess(s: SaveData) {
  s.unlockedChapters = [...new Set([...s.unlockedChapters, ...REGIONS
    .filter((r) => r.id !== LEVEL_CHAPTERS[r.level][0] && isChapterUnlocked(s, r.id))
    .map((r) => r.id)])].sort((a, b) => a - b);
}

export function isGateCleared(s: SaveData, ch: number): boolean {
  return validChapter(ch) && s.clearedChapters.includes(ch);
}

export function isLevelCleared(s: SaveData, level: JLPTLevel): boolean {
  return LEVEL_CHAPTERS[level].every((ch) => isGateCleared(s, ch));
}

export function isLevelUnlocked(s: SaveData, level: JLPTLevel): boolean {
  return level === "N5" || isLevelCleared(s, "N5");
}

/** Browsing a locked road never changes the level of a daily lesson. */
export function learningLevel(s: SaveData): JLPTLevel {
  return s.selectedLevel === "N4" && isLevelUnlocked(s, "N4") ? "N4" : "N5";
}

export function selectLevel(level: JLPTLevel) {
  if (level !== "N5" && level !== "N4") return;
  mutate((s) => { s.selectedLevel = level; });
}

export function levelMasteryPct(s: SaveData, level: JLPTLevel): number {
  const kanji = kanjiOfLevel(level);
  const pts = kanji.reduce((acc, k) => acc + getCard(s, k.c).mastery, 0);
  return masteryPct(pts, kanji.length * 3);
}

export function n5MasteryPct(s: SaveData): number {
  return levelMasteryPct(s, "N5");
}

export function newKanji(s: SaveData): Kanji[] {
  for (const ch of LEVEL_CHAPTERS[learningLevel(s)]) {
    if (!isChapterUnlocked(s, ch)) continue;
    const fresh = kanjiOfChapter(ch).filter((k) => getCard(s, k.c).mastery === 0);
    if (fresh.length) return fresh.slice(0, NEW_PER_RUN);
  }
  return [];
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
  const missed = dayGap(today, s.streak.last) - 1;
  if (missed > 0 && missed <= stackOf(s).freezes.count) return s.streak.count;
  return 0;
}


export type QuestionType = "reading" | "meaning";

export type Question = {
  kanji: Kanji; // the kanji this card grades
  vocab: Vocab; // the word it is being practised inside
  type: QuestionType;
  prompt: string; // the word as plain text
  segments: PromptSegment[]; // the word split for furigana and highlighting
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

// Reading is the core drill; meaning keeps the word tied to something concrete.
const TYPE_WEIGHTS: QuestionType[] = ["reading", "reading", "meaning"];

/** A card asks about a whole word, so the kanji is learned in the company it keeps. */
export function buildQuestion(
  k: Kanji,
  type: QuestionType = pick(TYPE_WEIGHTS),
  vocab: Vocab = pick(k.vocab),
): Question {
  const card: WordCard = { kanji: k, vocab, kana: vocabKana(vocab) };
  const base = {
    kanji: k,
    vocab,
    type,
    prompt: vocab.w,
    segments: wordSegments(vocab, k),
  };

  if (type === "reading") {
    const choices = shuffle([card.kana, ...readingChoices(card)]);
    return { ...base, sub: "How is this word read?", choices, answer: card.kana };
  }
  const choices = shuffle([vocab.m, ...meaningChoices(card)]);
  return { ...base, sub: "What does this word mean?", choices, answer: vocab.m };
}


export const NEW_PER_RUN = 5;
export const MAX_REVIEWS = 5;

export function buildRunQueue(s: SaveData, now = Date.now()): Question[] {
  const seen = allKanji.filter((k) => {
    const p = s.progress[k.c];
    return p && p.mastery > 0 && p.due <= now && isChapterUnlocked(s, k.ch);
  });
  seen.sort((a, b) => getCard(s, a.c).due - getCard(s, b.c).due);
  const reviews = seen.slice(0, MAX_REVIEWS);

  const news = newKanji(s);

  const queue = shuffle([...reviews, ...news]).map((k) => buildQuestion(k));
  return queue;
}

export function buildGateQuiz(ch: number): Question[] {
  return shuffle(kanjiOfChapter(ch)).map((k) => buildQuestion(k));
}

const CONFUSABLES = ["末未", "持待", "土士", "日目", "人入", "右石", "牛午", "千干"];

/** Across unlocked regions: twelve reviews, four new cards, then reading partners. */
export function buildStackQueue(s: SaveData, now = Date.now()): Question[] {
  const available = allKanji.filter((k) => isChapterUnlocked(s, k.ch));
  const due = available.filter((k) => getCard(s, k.c).mastery > 0 && getCard(s, k.c).due <= now)
    .sort((a, b) => getCard(s, a.c).due - getCard(s, b.c).due);
  const reviews = due.slice(0, 12);
  for (const group of CONFUSABLES) {
    if (!reviews.some((k) => group.includes(k.c))) continue;
    for (const k of available) {
      const p = getCard(s, k.c);
      if (reviews.length < 12 && group.includes(k.c) && !reviews.includes(k) && p.mastery > 0 && p.due <= now + 2 * DAY_MS) reviews.push(k);
    }
  }
  // Put new words first in preparation, but select them late in the sheet composer.
  return [...reviews, ...newKanji(s).slice(0, 4)].map((k) => {
    const p = getCard(s, k.c);
    return buildQuestion(k, "reading", k.vocab[(p.correct + p.wrong) % k.vocab.length]!);
  });
}

export function recordProduction(c: string, stroke = false, now = Date.now()) {
  if (!kanjiByChar.has(c)) return;
  mutate((s) => {
    const stack = s.stack!;
    ensureStackDay(stack, now);
    if (stroke && stack.strokeDay === localDay(new Date(now))) return;
    if (stroke) stack.strokeDay = localDay(new Date(now));
    const p = { ...getCard(s, c) };
    p.prod = Math.min(Number.MAX_SAFE_INTEGER, (p.prod ?? 0) + 1);
    if (p.mastery === 2 && p.ivl >= 21 && p.prod >= 2) p.mastery = 3;
    s.progress[c] = p;
  });
}

export function recordTypedSeal(now = Date.now()) {
  mutate((s) => { ensureStackDay(s.stack!, now); s.stack!.quests.typed++; });
}

export function recordStackSheet(result: { score: number; elapsed: number; cleared: boolean; redeemed: number; kind: "daily" | "fluency" | "marathon" | "checkpoint" }, now = Date.now()) {
  mutate((s) => {
    const stack = s.stack!;
    ensureStackDay(stack, now);
    const score = count(result.score), ms = count(result.elapsed * 1000);
    stack.playMs = Math.min(Number.MAX_SAFE_INTEGER, stack.playMs + ms);
    stack.quests.redeems = Math.min(Number.MAX_SAFE_INTEGER, stack.quests.redeems + count(result.redeemed));
    if (result.kind === "marathon") stack.bestMarathon = Math.max(stack.bestMarathon, score);
    else stack.bestSheet = Math.max(stack.bestSheet, score);
    if (result.cleared) {
      stack.sheetsCleared = Math.min(Number.MAX_SAFE_INTEGER, stack.sheetsCleared + 1);
      stack.quests.sheets = Math.min(Number.MAX_SAFE_INTEGER, stack.quests.sheets + 1);
      if (result.kind === "fluency" && ms > 0) stack.bestSprintMs = stack.bestSprintMs ? Math.min(stack.bestSprintMs, ms) : ms;
    }
  });
}

export function awardDailySeal(now = Date.now()) {
  mutate((s) => { s.stack!.lastSealDay = localDay(new Date(now)); });
}

export function perfectGate(ch: number): number {
  if (!isGateCleared(getSnapshot(), ch)) return 0;
  mutate((s) => {
    if (!s.stack!.perfectGates.includes(ch)) s.stack!.perfectGates.push(ch);
    s.coins = Math.min(Number.MAX_SAFE_INTEGER, s.coins + 10);
  });
  return 10;
}

export function buyCosmetic(id: string): boolean {
  const item = COSMETICS.find((x) => x.id === id);
  if (!item) return false;
  const s = getSnapshot(), owned = stackOf(s).cosmetics.owned.includes(id);
  if (!owned && s.coins < item.cost) return false;
  mutate((next) => {
    const cosmetics = next.stack!.cosmetics;
    if (!cosmetics.owned.includes(id)) { next.coins -= item.cost; cosmetics.owned.push(id); }
    cosmetics[item.kind] = id;
  });
  return true;
}


export function grade(c: string, correct: boolean, now = Date.now(), placement?: { rt: number; fallTime: number; hinted: boolean }) {
  if (!kanjiByChar.has(c)) return;
  mutate((s) => {
    const p = { ...getCard(s, c) };
    if (placement) {
      const rt = Math.min(600_000, Math.max(0, placement.rt));
      p.rt = Math.round(p.rt ? p.rt * 0.75 + rt * 0.25 : rt);
      p.fl = correct && !placement.hinted && rt < placement.fallTime * 400 ? Math.min(Number.MAX_SAFE_INTEGER, (p.fl ?? 0) + 1) : 0;
      // Extra play records retrievals, never moves a review that is not due.
      if (p.mastery > 0 && p.due > now) {
        if (correct) p.correct = Math.min(Number.MAX_SAFE_INTEGER, p.correct + 1);
        else p.wrong = Math.min(Number.MAX_SAFE_INTEGER, p.wrong + 1);
        s.progress[c] = p;
        return;
      }
    }
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
      } else if (p.mastery === 1 && !placement?.hinted) {
        p.mastery = 2;
        p.ivl = 1;
      } else if (p.mastery >= 2) {
        p.ivl = Math.max(0.1, Math.round(p.ivl * p.ease * 10) / 10);
        if (p.ivl >= 21 && (p.prod ?? 0) >= 2) p.mastery = 3;
      }
      const gain = placement ? (placement.rt < placement.fallTime * 400 ? 0.12 : placement.rt > placement.fallTime * 800 ? 0.04 : 0.08) : 0.08;
      p.ease = Math.min(3, Math.round((p.ease + gain) * 100) / 100);
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
  const stack = s.stack ??= emptyStack();
  const missed = dayGap(today, s.streak.last) - 1;
  const freeze = missed > 0 && missed <= stack.freezes.count;
  if (freeze) { stack.freezes.count -= missed; stack.freezes.lastUsedDay = today; }
  s.streak.count = s.streak.last === yesterday || freeze ? Math.min(Number.MAX_SAFE_INTEGER, s.streak.count + 1) : 1;
  s.streak.last = today;
  [3, 7, 30].forEach((milestone, i) => {
    if (s.streak.count >= milestone && !(stack.freezes.granted & (1 << i))) {
      stack.freezes.count = Math.min(3, stack.freezes.count + 1);
      stack.freezes.granted |= 1 << i;
    }
  });
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
  if (!isChapterUnlocked(state, ch)) return 0;
  const earned = Math.min(50, Number.MAX_SAFE_INTEGER - state.coins);
  mutate((s) => {
    s.clearedChapters = [...s.clearedChapters, ch].sort((a, b) => a - b);
    s.gatesCleared = s.clearedChapters.length;
    s.coins += earned;
    updateStreak(s, Date.now());
  });
  return earned;
}

export { kanjiByChar, CHAPTER_COUNT, vocabKana };
export type { PromptSegment, WordCard };

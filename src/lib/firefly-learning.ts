import { kanjiOfChapter, kanjiOfLevel, levelOfChapter, type JLPTLevel } from "@/data";
import type { Kanji, Vocab } from "@/data/n5/types";
import { GATES_PER_ADVENTURE, type GateMode, type RunnerDifficulty, type SpiritId } from "./firefly-catalog";
import { commitRunnerAdventure, getCard, getProgressGeneration, getSnapshot, grade, isChapterUnlocked, learningLevel, newKanji, type SaveData } from "./srs";
import { hasKanji } from "./kana";
import { readingChoices, vocabKana, wordChoices, wordSegments, type PromptSegment, type WordCard } from "./words";

/** At most this many first recalls per adventure move the long-term schedule. */
export const MAX_GRADED = 5;
/** Gates until a word returns: after its introduction, after one and two correct answers, and after a miss. */
export const SPACING = { intro: 2, first: 3, second: 6, miss: 2 } as const;
/** A new word grades only once this many gates have passed since it was introduced. */
export const NEW_WORD_GRADE_GAP = 3;
/** New words per adventure, by the number of due reviews it carries. */
const FRESH_BY_DUE = [4, 4, 3, 3, 2, 1];

export type CardOrigin = "due" | "fresh" | "practice";
export type DeckCard = { kanji: Kanji; origin: CardOrigin; /** Index of the first word to practise. */ word: number };
export type AdventureDeck = {
  seed: number; level: JLPTLevel; difficulty: RunnerDifficulty; cards: DeckCard[];
  /** Kanji of the player's unlocked chapters: the first source of look-alike words. */
  unlocked: Kanji[];
  /** The region whose checkpoint this adventure is the rescue step of. */
  checkpoint?: number;
};
export type PlannedGate = {
  index: number;
  kanji: Kanji;
  vocab: Vocab;
  kana: string;
  mode: GateMode;
  labels: [string, string, string];
  answer: 0 | 1 | 2;
  segments: PromptSegment[];
  /** First meetings run the trail in slow motion. */
  slow: boolean;
  resolved: boolean;
  correct?: boolean;
  graded?: boolean;
};
export type AdventureRecallEvent = { gate: number; word: string; kanji: string; mode: GateMode; origin: CardOrigin; correct: boolean; graded: boolean };
export type WordSummary = { word: string; kana: string; meaning: string; kanji: string; attempts: boolean[]; introduced: boolean; graded: boolean };
export type AdventureLearningTotals = {
  introductions: number;
  recallTotal: number;
  recallCorrect: number;
  scheduledGraded: number;
  scheduledCorrect: number;
};
export type AdventureTerminalResult = {
  arcadeScore: number;
  delivered: boolean;
  deliveredSpiritIds: SpiritId[];
  learning: AdventureLearningTotals;
  summary: WordSummary[];
  earned: number;
  newSpirits: SpiritId[];
  best: number;
  previousBest: number;
  /** A checkpoint adventure reached the shrine, completing its region's rescue step. */
  stepCompleted: boolean;
};
type CardRun = {
  readonly kanji: Kanji;
  readonly origin: CardOrigin;
  readonly order: number;
  /** The word currently practised for this kanji. */
  word: number;
  state: "waiting" | "learning" | "settled";
  /** Consecutive correct answers credited this adventure; three settles a word. */
  step: number;
  nextAt: number;
  planned: number;
  asks: number;
  lastAsked: number;
  lastMode?: GateMode;
  lastCorrect?: boolean;
  introducedAt: number | null;
};
export type AdventureLedger = {
  readonly deck: AdventureDeck;
  readonly generation: number;
  readonly cards: Map<string, CardRun>;
  readonly gates: Map<number, PlannedGate>;
  scheduledCorrect: number;
  scheduledGraded: number;
  recallCorrect: number;
  recallTotal: number;
  closed: boolean;
  /** Gate index of the most recent miss, so its spoken correction is never talked over. */
  lastMiss: number;
  readonly introduced: Set<string>;
  readonly attempted: Set<string>;
  readonly recalls: AdventureRecallEvent[];
};

function randomFrom(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0; return state / 0x1_0000_0000; };
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const wordsOf = (kanji: readonly Kanji[]): WordCard[] => kanji.flatMap((k) => k.vocab.map((vocab) => ({ kanji: k, vocab, kana: vocabKana(vocab) })));
const levelPools = new Map<JLPTLevel, WordCard[]>();
function levelPool(level: JLPTLevel): WordCard[] {
  let pool = levelPools.get(level);
  if (!pool) levelPools.set(level, pool = wordsOf(kanjiOfLevel(level)));
  return pool;
}
const unlockedPools = new WeakMap<AdventureDeck, WordCard[]>();
function unlockedPool(deck: AdventureDeck): WordCard[] {
  let pool = unlockedPools.get(deck);
  if (!pool) unlockedPools.set(deck, pool = wordsOf(deck.unlocked));
  return pool;
}
/** Listen gates show bare written words, so only words the player can read without furigana qualify. */
const listenable = (kanji: Kanji, vocab: Vocab) => hasKanji(vocab.w) && wordSegments(vocab, kanji).every((segment) => !segment.furigana);

/** Chooses the adventure's words at launch. Which word each gate asks is decided as the gate comes into sight. */
export function createAdventureDeck(save: SaveData, difficulty: RunnerDifficulty, seed: number, now = Date.now()): AdventureDeck {
  const level = learningLevel(save), random = randomFrom(seed);
  const available = kanjiOfLevel(level).filter((kanji) => isChapterUnlocked(save, kanji.ch));
  const known = available.filter((kanji) => getCard(save, kanji.c).mastery > 0);
  const due = known.filter((kanji) => getCard(save, kanji.c).due <= now)
    .sort((a, b) => getCard(save, a.c).due - getCard(save, b.c).due).slice(0, MAX_GRADED);
  const fresh = newKanji(save).slice(0, FRESH_BY_DUE[due.length] ?? 1);
  // A small familiar set lets each practised word come back several times.
  const practice = shuffle(known.filter((kanji) => !due.includes(kanji)), random).slice(0, 6);
  // Reviews alternate a kanji's words across sessions, as the other modes do.
  const rotation = (kanji: Kanji) => { const p = getCard(save, kanji.c); return (p.correct + p.wrong) % kanji.vocab.length; };
  const cards: DeckCard[] = [
    ...due.map((kanji) => ({ kanji, origin: "due" as const, word: rotation(kanji) })),
    ...fresh.map((kanji) => ({ kanji, origin: "fresh" as const, word: Math.floor(random() * kanji.vocab.length) })),
    ...practice.map((kanji) => ({ kanji, origin: "practice" as const, word: rotation(kanji) })),
  ];
  // Every valid curriculum has a starting chapter; the fallback also handles partial saves.
  if (!cards.length) cards.push({ kanji: available[0] ?? kanjiOfLevel("N5")[0]!, origin: "practice", word: 0 });
  return { seed: seed >>> 0, level, difficulty, cards, unlocked: available };
}

/**
 * A region checkpoint's rescue: every gate asks one of that region's kanji, in the words just
 * learned and stacked. Due kanji grade their first ask as usual, an unmet kanji is introduced on
 * the trail, and the rest is practice. Familiar kanji move to their next word after each right
 * answer, so every word of the region comes round.
 */
export function createCheckpointDeck(save: SaveData, chapter: number, difficulty: RunnerDifficulty, seed: number, now = Date.now()): AdventureDeck {
  const level = levelOfChapter(chapter) ?? "N5", random = randomFrom(seed);
  const region = shuffle(kanjiOfChapter(chapter), random);
  const isDue = (kanji: Kanji) => getCard(save, kanji.c).mastery > 0 && getCard(save, kanji.c).due <= now;
  const rotation = (kanji: Kanji) => { const p = getCard(save, kanji.c); return (p.correct + p.wrong) % kanji.vocab.length; };
  // Reviews lead the trail, oldest first, as on any adventure.
  const due = region.filter(isDue).sort((a, b) => getCard(save, a.c).due - getCard(save, b.c).due);
  const cards: DeckCard[] = [
    ...due.map((kanji) => ({ kanji, origin: "due" as const, word: rotation(kanji) })),
    ...region.filter((kanji) => !isDue(kanji)).map((kanji) => getCard(save, kanji.c).mastery === 0
      ? { kanji, origin: "fresh" as const, word: Math.floor(random() * kanji.vocab.length) }
      : { kanji, origin: "practice" as const, word: rotation(kanji) }),
  ];
  const unlocked = kanjiOfLevel(level).filter((kanji) => isChapterUnlocked(save, kanji.ch));
  return { seed: seed >>> 0, level, difficulty, cards, unlocked: unlocked.length ? unlocked : kanjiOfChapter(chapter), checkpoint: chapter };
}

/** The words a player can meet before the adventure: its reviews and new words, else a few familiar ones. */
export function deckWords(deck: AdventureDeck): { kanji: Kanji; vocab: Vocab; origin: CardOrigin }[] {
  const focus = deck.cards.filter((card) => card.origin !== "practice");
  return (focus.length ? focus : deck.cards.slice(0, 6)).map((card) => ({ kanji: card.kanji, vocab: card.kanji.vocab[card.word]!, origin: card.origin }));
}

export function createAdventureLedger(deck: AdventureDeck): AdventureLedger {
  const cards = new Map<string, CardRun>(deck.cards.map((card, order) => [card.kanji.c, {
    kanji: card.kanji, origin: card.origin, word: card.word, order, state: "waiting", step: 0,
    nextAt: 0, planned: 0, asks: 0, lastAsked: -Infinity, introducedAt: null,
  }]));
  return {
    deck, generation: getProgressGeneration(), cards, gates: new Map(), scheduledCorrect: 0, scheduledGraded: 0,
    recallCorrect: 0, recallTotal: 0, closed: false, lastMiss: -Infinity, introduced: new Set(), attempted: new Set(), recalls: [],
  };
}

export function isAdventureLedgerCurrent(ledger: AdventureLedger): boolean {
  return ledger.generation === getProgressGeneration();
}

function pickCard(ledger: AdventureLedger, index: number): { card: CardRun; intro: boolean } {
  const cards = [...ledger.cards.values()];
  const inFlight = new Set([...ledger.gates.values()].filter((gate) => !gate.resolved).map((gate) => gate.kanji.c));
  // Never the word that just passed, while anything else is available.
  const free = (card: CardRun) => !inFlight.has(card.kanji.c) && card.lastAsked < index - 1;
  const learning = cards.filter((card) => card.state === "learning");
  const ready = learning.filter(free);
  const byNext = (a: CardRun, b: CardRun) => a.nextAt - b.nextAt || a.order - b.order;
  const byRest = (a: CardRun, b: CardRun) => a.lastAsked - b.lastAsked || a.asks - b.asks || a.order - b.order;
  const waitingFresh = cards.find((card) => card.origin === "fresh" && card.state === "waiting");
  // A word introduced now still has room for its spaced recalls.
  const canIntroduce = !!waitingFresh && index <= GATES_PER_ADVENTURE - 5;

  const overdue = ready.filter((card) => card.nextAt <= index).sort(byNext)[0];
  if (overdue) return { card: overdue, intro: false };
  const review = cards.find((card) => card.origin === "due" && card.state === "waiting");
  if (review) return { card: review, intro: false };
  if (canIntroduce && learning.every((card) => card.step >= 2)) return { card: waitingFresh, intro: true };
  const nearlyDue = ready.filter((card) => card.nextAt <= index + 1).sort(byNext)[0];
  if (nearlyDue) return { card: nearlyDue, intro: false };
  const familiar = cards.filter((card) => free(card) && (card.state === "settled" || (card.state === "waiting" && card.origin === "practice"))).sort(byRest)[0];
  if (familiar) return { card: familiar, intro: false };
  // With nothing familiar to practise, a second new word may join one still being learned.
  if (canIntroduce && learning.filter((card) => card.step < 2).length < 2) return { card: waitingFresh, intro: true };
  const early = ready.sort(byNext)[0];
  if (early) return { card: early, intro: false };
  // Tiny decks may repeat a word sooner than planned.
  const idle = cards.filter((card) => !inFlight.has(card.kanji.c));
  return { card: (idle.length ? idle : cards).sort(byRest)[0]!, intro: false };
}

/** Decides the words on a gate as it comes into sight. Calling again for the same gate returns the same plan. */
export function planGate(ledger: AdventureLedger, index: number): PlannedGate {
  const existing = ledger.gates.get(index);
  if (existing) return existing;
  const { card, intro } = pickCard(ledger, index);
  const kanji = card.kanji;
  if (card.state === "waiting") {
    card.state = "learning";
    // Familiar words start two correct answers from settled; new words start from their introduction.
    card.step = card.origin === "fresh" ? 0 : 2;
  }
  // A new word keeps its introduced form all adventure. Familiar kanji move on to their next
  // word after a correct answer; a missed word comes back exactly as it was.
  if (card.origin !== "fresh" && card.planned > 0 && card.lastCorrect !== false) card.word = (card.word + 1) % kanji.vocab.length;
  const vocab = kanji.vocab[card.word]!;
  // Reading asks come first, for any recall that will be graded, and right after a miss so its
  // spoken correction is never talked over. A missed word retries the same kind; otherwise they alternate.
  const graded = card.origin !== "practice" && !ledger.attempted.has(kanji.c) &&
    (card.origin === "due" || (card.introducedAt !== null && index - card.introducedAt >= NEW_WORD_GRADE_GAP));
  const mode: GateMode = intro ? "intro"
    : card.asks === 0 || graded || ledger.lastMiss === index - 1 || !listenable(kanji, vocab) ? "reading"
    : card.lastCorrect === false ? card.lastMode ?? "reading"
    : card.lastMode === "reading" ? "listen" : "reading";
  const slow = intro || (card.origin === "fresh" && card.asks === 0);
  card.planned++;
  card.lastMode = mode;
  if (intro) { card.introducedAt = index; card.nextAt = index + SPACING.intro; }
  const kana = vocabKana(vocab), random = randomFrom((ledger.deck.seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  let labels: [string, string, string], answer: 0 | 1 | 2;
  if (mode === "intro") {
    labels = [vocab.w, vocab.w, vocab.w];
    answer = 1;
  } else {
    const word: WordCard = { kanji, vocab, kana };
    const right = mode === "reading" ? kana : vocab.w;
    const wrong = mode === "reading" ? readingChoices(word, random) : wordChoices(word, random, 2, [unlockedPool(ledger.deck), levelPool(ledger.deck.level)]);
    // Both generators fall back to the whole curriculum; this only guards malformed data.
    for (const other of levelPool(ledger.deck.level)) {
      if (wrong.length >= 2) break;
      const label = mode === "reading" ? other.kana : other.vocab.w;
      if (label !== right && !wrong.includes(label)) wrong.push(label);
    }
    labels = shuffle([right, ...wrong.slice(0, 2)], random) as [string, string, string];
    answer = labels.indexOf(right) as 0 | 1 | 2;
  }
  const gate: PlannedGate = { index, kanji, vocab, kana, mode, labels, answer, segments: wordSegments(vocab, kanji), slow, resolved: false };
  ledger.gates.set(index, gate);
  return gate;
}

/** The simulation's view of a planned gate. */
export function gateContent(gate: PlannedGate) {
  return { labels: gate.labels, answer: gate.answer, card: gate.kanji.c, word: gate.vocab.w, mode: gate.mode, slow: gate.slow };
}

/**
 * Records one resolved gate and reschedules its word within the adventure.
 * Returns whether a long-term SRS grade was recorded, never whether a lane was safe.
 */
export function recordGate(ledger: AdventureLedger, result: { gate: number; correct: boolean }): boolean {
  if (ledger.closed || !isAdventureLedgerCurrent(ledger)) return false;
  const gate = ledger.gates.get(result.gate);
  if (!gate || gate.resolved) return false;
  const card = ledger.cards.get(gate.kanji.c)!;
  const correct = gate.mode === "intro" || result.correct;
  gate.resolved = true;
  gate.correct = correct;
  card.lastAsked = result.gate;
  const event: AdventureRecallEvent = { gate: result.gate, word: gate.vocab.w, kanji: gate.kanji.c, mode: gate.mode, origin: card.origin, correct, graded: false };
  ledger.recalls.push(event);
  if (gate.mode === "intro") {
    ledger.introduced.add(gate.kanji.c);
    return false;
  }
  card.asks++;
  card.lastCorrect = correct;
  ledger.recallTotal++;
  if (!correct) ledger.lastMiss = result.gate;
  if (correct) {
    ledger.recallCorrect++;
    card.step++;
    if (card.step >= 3) card.state = "settled";
    else { card.state = "learning"; card.nextAt = result.gate + (card.step === 1 ? SPACING.first : SPACING.second); }
  } else {
    card.step = 0;
    card.state = "learning";
    card.nextAt = result.gate + SPACING.miss;
  }

  // Only the first eligible recall of a due or newly taught kanji touches its schedule.
  if (card.origin === "practice" || ledger.attempted.has(gate.kanji.c)) return false;
  if (card.origin === "fresh" && (card.introducedAt === null || result.gate - card.introducedAt < NEW_WORD_GRADE_GAP)) return false;
  ledger.attempted.add(gate.kanji.c);
  if (ledger.scheduledGraded >= MAX_GRADED) return false;
  const save = getSnapshot(), progress = getCard(save, gate.kanji.c), now = Date.now();
  if (!isChapterUnlocked(save, gate.kanji.ch)) return false;
  // A due card may have been reviewed elsewhere while this adventure was open.
  if (progress.mastery > 0 ? progress.due > now : !ledger.introduced.has(gate.kanji.c)) return false;
  ledger.scheduledGraded++;
  if (correct) ledger.scheduledCorrect++;
  event.graded = gate.graded = true;
  grade(gate.kanji.c, correct, now);
  return true;
}

/** Every word actually met on the trail, in the order it first appeared. */
export function adventureSummary(ledger: AdventureLedger): WordSummary[] {
  const words = new Map<string, WordSummary>();
  for (const gate of [...ledger.gates.values()].filter((g) => g.resolved).sort((a, b) => a.index - b.index)) {
    const entry = words.get(gate.vocab.w) ?? { word: gate.vocab.w, kana: gate.kana, meaning: gate.vocab.m, kanji: gate.kanji.c, attempts: [], introduced: false, graded: false };
    if (gate.mode === "intro") entry.introduced = true;
    else entry.attempts.push(!!gate.correct);
    if (gate.graded) entry.graded = true;
    words.set(gate.vocab.w, entry);
  }
  return [...words.values()];
}

export function finishAdventure(ledger: AdventureLedger, result: { score: number; rescued: SpiritId[]; delivered: boolean }): AdventureTerminalResult | null {
  if (ledger.closed || !isAdventureLedgerCurrent(ledger)) return null;
  ledger.closed = true;
  const receipt = commitRunnerAdventure({
    ...result, level: ledger.deck.level, difficulty: ledger.deck.difficulty, scheduledCorrect: ledger.scheduledCorrect,
    ...(ledger.deck.checkpoint === undefined ? {} : { checkpoint: ledger.deck.checkpoint }),
  });
  return {
    ...receipt, arcadeScore: result.score, delivered: result.delivered,
    deliveredSpiritIds: result.delivered ? [...new Set(result.rescued)] : [],
    learning: {
      introductions: ledger.introduced.size, recallTotal: ledger.recallTotal, recallCorrect: ledger.recallCorrect,
      scheduledGraded: ledger.scheduledGraded, scheduledCorrect: ledger.scheduledCorrect,
    },
    summary: adventureSummary(ledger),
  };
}

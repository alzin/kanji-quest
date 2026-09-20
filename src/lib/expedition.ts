import { allKanji } from "@/data";
import { buildQuestion, getCard, isChapterUnlocked, learningLevel, newKanji, type Question, type SaveData } from "./srs";
import { vocabKana } from "./words";

export type TrailPath = "river" | "shrine";
export type TrailCharm = "firefly" | "moss";
export type Encounter = { id: string; question: Question; kind: "meaning" | "reading" | "recall"; retry: boolean };
export type TrailAnswer = { encounter: Encounter; correct: boolean; assisted: boolean };
export type TrailState = { queue: Encounter[]; index: number; answers: TrailAnswer[]; combo: number; bestCombo: number; light: number; charm?: TrailCharm };

/** Four words per expedition. Due reviews take priority; free practice never opens locked content. */
export function expeditionWords(save: SaveData, now = Date.now()): Question[] {
  const available = allKanji.filter((k) => isChapterUnlocked(save, k.ch));
  const reviews = available.filter((k) => getCard(save, k.c).mastery > 0 && getCard(save, k.c).due <= now)
    .sort((a, b) => getCard(save, a.c).due - getCard(save, b.c).due);
  const practice = available.filter((k) => getCard(save, k.c).mastery > 0)
    .sort((a, b) => getCard(save, a.c).due - getCard(save, b.c).due);
  const unique = [...new Map([...reviews, ...newKanji(save), ...practice].map((k) => [k.c, k])).values()].slice(0, 4);
  return unique.map((k) => {
    const card = getCard(save, k.c);
    return buildQuestion(k, "reading", k.vocab[(card.correct + card.wrong) % k.vocab.length]!);
  });
}

/** Interleave two retrieval styles before production. Never test the same word back to back. */
export function createTrail(words: Question[], path: TrailPath): TrailState {
  const styles = path === "river" ? ["meaning", "reading"] as const : ["reading", "meaning"] as const;
  const queue: Encounter[] = styles.flatMap((kind, round) => words.map((q, i) => ({
    id: `${round}-${i}`, kind, retry: false, question: buildQuestion(q.kanji, kind, q.vocab),
  })));
  words.slice(0, 2).forEach((q, i) => queue.push({ id: `recall-${i}`, kind: "recall", retry: false, question: { ...q, answer: vocabKana(q.vocab) } }));
  return { queue, index: 0, answers: [], combo: 0, bestCombo: 0, light: 0 };
}

/** One recovery attempt after other words. Recovery earns light, never extra coins or SRS grades. */
export function answerTrail(state: TrailState, correct: boolean, assisted = false): TrailState {
  const encounter = state.queue[state.index];
  if (!encounter) return state;
  const queue = [...state.queue];
  if (!correct && !encounter.retry) queue.splice(Math.min(queue.length, state.index + 3), 0, { ...encounter, id: `${encounter.id}-retry`, retry: true });
  const combo = correct && !assisted ? state.combo + 1 : 0;
  const bonus = correct && !assisted && state.charm === "firefly" ? 1 : 0;
  const guidedLight = state.charm === "moss" ? 3 : 1;
  return { queue, index: state.index + 1, answers: [...state.answers, { encounter, correct, assisted }],
    combo, bestCombo: Math.max(state.bestCombo, combo),
    ...(state.charm ? { charm: state.charm } : {}),
    light: state.light + (correct ? assisted ? guidedLight : 2 + bonus + (combo > 0 && combo % 3 === 0 ? 1 : 0) : 0) };
}

export function trailSummary(state: TrailState) {
  const first = state.answers.filter((a) => !a.encounter.retry);
  const correct = first.filter((a) => a.correct && !a.assisted).length;
  const characters = [...new Set(first.map((a) => a.encounter.question.kanji.c))];
  return { correct, total: first.length, earned: correct * 3, accuracy: Math.round(correct / Math.max(1, first.length) * 100),
    recovered: state.answers.filter((a) => a.encounter.retry && a.correct).length,
    cards: characters.map((c) => {
      const attempts = first.filter((a) => a.encounter.question.kanji.c === c);
      return { c, correct: attempts.every((a) => a.correct && !a.assisted),
        produced: attempts.some((a) => a.encounter.kind === "recall" && a.correct && !a.assisted) };
    }) };
}

export function explorerRank(save: SaveData) {
  const xp = Object.values(save.progress).reduce((n, p) => n + p.correct, 0) * 10;
  return { xp, level: Math.floor(xp / 200) + 1, progress: xp % 200,
    title: xp < 200 ? "Trail beginner" : xp < 1000 ? "Lantern keeper" : xp < 3000 ? "Forest wayfinder" : "Kanji guardian", curriculum: learningLevel(save) };
}

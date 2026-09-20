import { answerTrail, type TrailState } from "@/lib/expedition";
import { buildQuestion, type Question } from "@/lib/srs";

export type DashEvidence = Record<
  string,
  { correct: boolean; assisted: boolean }
>;
export const dashQuestions = (words: Question[]) =>
  words.map((q, i) =>
    buildQuestion(q.kanji, i % 2 ? "meaning" : "reading", q.vocab),
  );

/** Finishing a retry lights the route; it never erases an earlier missed word. */
export function recordDashAnswer(
  evidence: DashEvidence,
  q: Question,
  correct: boolean,
  assisted = false,
): DashEvidence {
  const before = evidence[q.kanji.c];
  return {
    ...evidence,
    [q.kanji.c]: {
      correct: (before?.correct ?? true) && correct,
      assisted: (before?.assisted ?? false) || assisted,
    },
  };
}

export function completeLanternDash(
  state: TrailState,
  questions: Question[],
  evidence: DashEvidence,
): TrailState {
  if (state.answers.some((a) => a.encounter.id.startsWith("dash-")))
    return state;
  const encounters = questions.map((question, i) => ({
    id: `dash-${i}`,
    question,
    kind: question.type,
    retry: false,
  }));
  const prefix = state.queue.slice(0, state.index);
  let next: TrailState = { ...state, queue: [...prefix, ...encounters] };
  for (const encounter of encounters) {
    const result = evidence[encounter.question.kanji.c];
    next = answerTrail(
      next,
      result?.correct ?? false,
      result?.assisted ?? true,
    );
    // Corrections and retries take place inside the dash, not as extra shrine cards.
    next = {
      ...next,
      queue: next.queue.filter((e) => !e.id.startsWith("dash-") || !e.retry),
    };
  }
  return { ...next, queue: [...next.queue, ...state.queue.slice(state.index)] };
}

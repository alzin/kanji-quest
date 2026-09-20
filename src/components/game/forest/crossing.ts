import { answerTrail, type TrailState } from "@/lib/expedition";
import type { StackPlacement } from "../stack-math";

export type CrossingRecall = { correct: boolean; assisted: boolean };
export type CrossingRecalls = Record<string, CrossingRecall>;

/** A retry can repair the bridge, but cannot rewrite the first independent recall. */
export function recordCrossingRecall(
  previous: CrossingRecalls,
  event: StackPlacement,
): CrossingRecalls {
  const key = event.word.q.kanji.c;
  const before = previous[key];
  return {
    ...previous,
    [key]: {
      correct: (before?.correct ?? true) && event.correct,
      assisted: (before?.assisted ?? false) || event.hinted,
    },
  };
}

/** Replace the four reading cards with the crossing's evidence, keeping all other encounters. */
export function completeCrossing(
  state: TrailState,
  recalls: CrossingRecalls,
): TrailState {
  const pending = state.queue.slice(state.index);
  const readings = pending.filter((e) => e.kind === "reading" && !e.retry);
  if (!readings.length) return state;
  let next: TrailState = {
    ...state,
    queue: [...state.queue.slice(0, state.index), ...readings],
  };
  for (const encounter of readings) {
    const result = recalls[encounter.question.kanji.c];
    // Recovery already happened on the board, so do not add a second reading retry.
    next = answerTrail(
      next,
      result?.correct ?? false,
      result?.assisted ?? true,
    );
    next = {
      ...next,
      queue: next.queue.filter(
        (e) =>
          !e.id.endsWith("-retry") ||
          state.queue.some((old) => old.id === e.id),
      ),
    };
  }
  return {
    ...next,
    queue: [...next.queue, ...pending.filter((e) => e.kind !== "reading")],
  };
}

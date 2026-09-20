import { useMemo, useRef, useState } from "react";
import type { Question } from "@/lib/srs";
import { composeSheets } from "../stack-seed";
import { RiverStackGame } from "./RiverStackGame";
import { recordCrossingRecall, type CrossingRecalls } from "./crossing";

export function CrossingEncounter({
  words,
  paused,
  onPause,
  onComplete,
}: {
  words: Question[];
  paused: boolean;
  onPause: () => void;
  onComplete: (recalls: CrossingRecalls) => void;
}) {
  // Same vocabulary as the lantern; separate homophones so every partner is unambiguous.
  const sheets = useMemo(
    () =>
      composeSheets(words.map((q) => ({ q, mastery: 1, fresh: false, rt: 0 }))),
    [words],
  );
  const [stage, setStage] = useState<"intro" | "play" | "retry" | "complete">(
    "intro",
  );
  const [sheet, setSheet] = useState(0),
    [attempt, setAttempt] = useState(0);
  const recalls = useRef<CrossingRecalls>({}),
    finished = useRef(false);
  if (stage === "play")
    return (
      <RiverStackGame
        key={`${sheet}-${attempt}`}
        words={sheets[sheet]!}
        title={`Crossing ${sheet + 1} / ${sheets.length}`}
        seed={5417 + sheet * 7919 + attempt * 37}
        forest
        paused={paused}
        onPause={onPause}
        onPlacement={(event) => {
          recalls.current = recordCrossingRecall(recalls.current, event);
        }}
        onFinish={(stats) => {
          if (finished.current) return;
          finished.current = true;
          if (!stats.cleared) setStage("retry");
          else if (sheet + 1 < sheets.length) {
            setSheet((value) => value + 1);
            setStage("intro");
          } else setStage("complete");
        }}
      />
    );
  return (
    <div className="river-intro" data-testid="crossing-intro">
      <span className="forest-eyebrow">02 / THE FORGOTTEN CROSSING</span>
      <span className="river-intro-seal" aria-hidden="true">
        川
      </span>
      <h2>
        {stage === "complete"
          ? "A way across."
          : stage === "retry"
            ? "The river can wait."
            : "Words make a bridge."}
      </h2>
      <p>
        {stage === "complete"
          ? "You brought the scattered words together. Their light can rebuild the crossing — the shrine is waiting on the other bank."
          : stage === "retry"
            ? "The stones filled the river. Let’s give them some room and try again. Your first attempts still count toward your learning."
            : "The lantern revealed these words. Now match their written forms, readings, and meanings to bring the crossing back."}
      </p>
      {stage !== "complete" && (
        <>
          <div
            className="river-example"
            aria-label="Match a written word with its reading"
          >
            <span lang="ja">{sheets[sheet]?.[0]?.q.vocab.w}</span>
            <i>↔</i>
            <span lang="ja">{sheets[sheet]?.[0]?.q.answer}</span>
          </div>
          <p className="river-fine">
            Tap a lane, then tap it again to drop. Partners below or beside you
            count. Stones fall automatically. Choose Calm Water in the help menu
            if you want to drop them at your own pace.
          </p>
        </>
      )}
      <button
        className="forest-primary"
        disabled={paused || !words.length}
        onClick={() => {
          if (stage === "complete") {
            onComplete(recalls.current);
            return;
          }
          if (stage === "retry") setAttempt((value) => value + 1);
          finished.current = false;
          setStage("play");
        }}
      >
        {stage === "complete"
          ? "Restore the crossing"
          : stage === "retry"
            ? "Try the stones again"
            : "Place the word stones"}
        <span aria-hidden="true">→</span>
      </button>
      <button className="forest-text-button" onClick={onPause}>
        Pause adventure
      </button>
    </div>
  );
}

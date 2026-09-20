import { useMemo, useRef, useState } from "react";
import type { Question } from "@/lib/srs";
import { LanternRunnerGame } from "./LanternRunnerGame";
import {
  dashQuestions,
  recordDashAnswer,
  type DashEvidence,
} from "./lantern-dash";

export function LanternDashEncounter({
  words,
  paused,
  onPause,
  onComplete,
}: {
  words: Question[];
  paused: boolean;
  onPause: () => void;
  onComplete: (questions: Question[], evidence: DashEvidence) => void;
}) {
  const questions = useMemo(() => dashQuestions(words), [words]);
  const evidence = useRef<DashEvidence>({}),
    finished = useRef(false);
  const [stage, setStage] = useState<"intro" | "play" | "retry" | "complete">(
    "intro",
  );
  const [attempt, setAttempt] = useState(0);
  if (stage === "play")
    return (
      <LanternRunnerGame
        key={attempt}
        questions={questions}
        title="Carry the lantern to the shrine"
        forest
        paused={paused}
        onPause={onPause}
        onAnswer={(q, correct, assisted) => {
          evidence.current = recordDashAnswer(
            evidence.current,
            q,
            correct,
            assisted,
          );
        }}
        onFinish={(stats) => {
          if (finished.current) return;
          finished.current = true;
          setStage(
            stats.correct + stats.wrong === questions.length && stats.wrong < 3
              ? "complete"
              : "retry",
          );
        }}
      />
    );
  return (
    <div className="dash-intro" data-testid="dash-intro">
      <span className="forest-eyebrow">THE MIST TRAIL · 灯</span>
      <span className="dash-intro-lantern" aria-hidden="true">
        灯
      </span>
      <h2>
        {stage === "complete"
          ? "The light made it home."
          : stage === "retry"
            ? "Aki kept an ember."
            : "Carry a little light."}
      </h2>
      <p>
        {stage === "complete"
          ? "Your lantern has lifted the mist from the shrine approach. Step back onto the trail and make your final offering."
          : stage === "retry"
            ? "The mist caught the lantern, but its ember is safe. Try the route again. Earlier mistakes still count toward your learning."
            : "The bridge is open, but mist hides the way ahead. Carry the lantern through four word gates to reveal the shrine’s path."}
      </p>
      {stage !== "complete" && (
        <>
          <ol>
            <li>Choose the reading or meaning shown on each gate.</li>
            <li>Tap a path, press 1–3, or use ↑ ↓ to change lanes.</li>
            <li>You have three hearts. Misses pause for a word with Aki.</li>
          </ol>
          <p className="dash-fine">
            Aki can light the correct path if you need help. Guided answers
            don’t earn independent recall credit.
          </p>
        </>
      )}
      <button
        className="forest-primary"
        disabled={paused}
        onClick={() => {
          if (stage === "complete") {
            onComplete(questions, evidence.current);
            return;
          }
          finished.current = false;
          setAttempt((v) => v + 1);
          setStage("play");
        }}
      >
        {stage === "complete"
          ? "Return to the shrine path"
          : stage === "retry"
            ? "Try the mist trail again"
            : "Begin the lantern dash"}
        <span aria-hidden="true">→</span>
      </button>
      <button className="forest-text-button" onClick={onPause}>
        Pause adventure
      </button>
    </div>
  );
}

import { RunResults } from "@/components/RunResults";
import { Expedition } from "@/components/Expedition";
import { LessonFlash } from "@/components/LessonFlash";
import { StackSession, type StackMode } from "@/components/StackSession";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { RunnerGame } from "@/components/game/RunnerGame";
import { RunPreparation } from "@/components/RunPreparation";
import { checkpointPassed, dailyRunReward, type RunnerStats } from "@/components/game/runner-math";
import { play } from "@/lib/sfx";
import {
  buildRunQueue, buildGateQuiz, grade, finishRun, clearGate,
  getCard, getSnapshot, isChapterUnlocked, isGateCleared, learningLevel, selectLevel, type Question,
} from "@/lib/srs";
import { CHAPTER_NAMES, LEVEL_CHAPTERS, kanjiOfChapter, levelOfChapter } from "@/data";

export const Route = createFileRoute("/run")({
  validateSearch: (s: Record<string, unknown>): { gate?: number | undefined; mode?: "runner" | "stack" | "expedition"; practice?: StackMode } => {
    const g = s["gate"];
    const n = typeof g === "number" ? g : typeof g === "string" && /^\d+$/.test(g) ? parseInt(g) : NaN;
    const mode = s["mode"] === "runner" ? "runner" as const : s["mode"] === "stack" ? "stack" as const : s["mode"] === "expedition" ? "expedition" as const : undefined;
    const practice: StackMode | undefined = s["practice"] === "fluency" || s["practice"] === "marathon" ? s["practice"] : undefined;
    return { gate: levelOfChapter(n) ? n : undefined, ...(mode ? { mode } : {}), ...(practice ? { practice } : {}) };
  },
  head: () => ({
    meta: [
      { title: "Play — Kanji Dash" },
      { name: "description", content: "Explore the Spirit Trail, weave words in Tsumiji, or read your way through Torii Run. A little kanji adventure every day." },
      { property: "og:title", content: "Play — Kanji Dash" },
      { property: "og:description", content: "Learn kanji through forest expeditions, word puzzles, and running adventures." },
    ],
  }),
  component: RunPage,
});

function RunPage() {
  const { gate, mode, practice } = useSearch({ from: "/run" });
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  // The saved review queue is only available in this browser, after hydration.
  if (!ready) return (
    <div className="game-viewport flex flex-col items-center justify-center gap-4 bg-paper" role="status">
      <span aria-hidden="true" className="font-serif text-5xl font-bold text-primary/30">走</span>
      <span className="text-sm font-bold text-muted-foreground">Preparing your run…</span>
    </div>
  );
  if (mode === "expedition" && gate === undefined) return <Expedition />;
  return mode !== "runner" ? <StackSession key={`${gate ?? "daily"}-${practice}`} gate={gate} kind={practice ?? "daily"} /> : <RunSession key={gate ?? "daily"} gate={gate} />;
}

function RunSession({ gate }: { gate: number | undefined }) {
  const [session, setSession] = useState(0);
  const [prepared, setPrepared] = useState(false);
  const { questions, level, blockedGate } = useMemo(() => {
    void session;
    const s = getSnapshot();
    const blockedGate = gate !== undefined && !isChapterUnlocked(s, gate);
    return {
      level: learningLevel(s),
      blockedGate,
      questions: gate ? (blockedGate ? [] : buildGateQuiz(gate)) : buildRunQueue(s),
    };
  }, [gate, session]);

  const [lesson, setLesson] = useState<Question | null>(null);
  const [results, setResults] = useState<null | (RunnerStats & { earned: number })>(null);
  const finished = useRef(false);

  const restart = () => {
    finished.current = false;
    setPrepared(false);
    setLesson(null);
    setResults(null);
    setSession((value) => value + 1);
  };

  const title = gate ? `${CHAPTER_NAMES[gate]!.name} — Checkpoint` : level === "N4" ? "Daily run · N4" : "Daily run";
  const pendingCheckpoint = !gate ? LEVEL_CHAPTERS[level].find((ch) => isChapterUnlocked(getSnapshot(), ch) && !isGateCleared(getSnapshot(), ch)) : undefined;

  // One ceremony per results object: the hanko thump for 合格, an open question for 再挑戦,
  // the rising koto phrase for 完了 and a quiet page turn when the hearts ran out.
  useEffect(() => {
    if (!results) return;
    const total = questions.length;
    const opts = { earned: results.earned };
    if (gate) play(checkpointPassed(results.correct, total) ? "checkpointPassed" : "checkpointFailed", opts);
    else play(results.correct + results.wrong < total ? "runEnded" : "runComplete", opts);
  }, [results, gate, questions]);

  if (blockedGate && !results) {
    const gateLevel = levelOfChapter(gate!)!;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 py-12 text-center">
        <div aria-hidden="true" className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-border text-muted-foreground">
          <AppIcon name="lock" className="h-8 w-8" />
        </div>
        <h1 className="mt-6 font-serif text-3xl font-bold">This {gateLevel} checkpoint is locked</h1>
        <p className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-muted-foreground">{gateLevel === "N4" ? `Earn all ${LEVEL_CHAPTERS.N5.length} N5 seals first. ` : ""}Clear the previous checkpoint or reach 55% mastery progress in that region to continue.</p>
        <Link to="/map" onClick={() => selectLevel(gateLevel)} className="mt-8 inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground shadow-e1 transition-colors hover:bg-primary-hover">View the {gateLevel} road</Link>
      </div>
    );
  }

  if (questions.length === 0 && !results) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 py-12 text-center">
        <div aria-hidden="true" className="flex h-20 w-20 rotate-[-8deg] items-center justify-center rounded-full border-4 border-primary font-serif text-3xl font-bold text-primary opacity-90">完</div>
        <h1 className="mt-6 font-serif text-3xl font-bold">{pendingCheckpoint !== undefined ? "Ready for your checkpoint" : "Nothing to run right now"}</h1>
        <p className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-muted-foreground">
          {pendingCheckpoint !== undefined ? `You’ve met this region’s words. Prepare its ${kanjiOfChapter(pendingCheckpoint).length}-word checkpoint to earn a seal and open the next region.` : "There are no new kanji or reviews due in your unlocked regions. Come back later, or visit the dojo to practice strokes."}
        </p>
        {/* One filled button — the single best next step — then quiet alternatives. */}
        <div className="mt-8 flex w-full max-w-xs flex-col gap-2.5">
          {pendingCheckpoint !== undefined
            ? <Link to="/run" search={{ gate: pendingCheckpoint }} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground shadow-e1 transition-colors hover:bg-primary-hover">Prepare checkpoint</Link>
            : <Link to="/practice" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground shadow-e1 transition-colors hover:bg-primary-hover">Practice in the dojo</Link>}
          {pendingCheckpoint !== undefined && <Link to="/practice" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-5 py-3 font-bold transition-colors hover:bg-secondary">Stroke dojo</Link>}
          <Link to="/" className="inline-flex min-h-12 items-center justify-center rounded-xl px-5 py-3 font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Back home</Link>
        </div>
      </div>
    );
  }

  if (!prepared) return <RunPreparation key={session} questions={questions} title={title} onStart={() => setPrepared(true)} />;

  return (
    <div className="game-viewport overflow-hidden bg-paper">
      {!results && (
        <RunnerGame
          key={`${session}-${gate ?? "daily"}`}
          questions={questions}
          title={title}
          onAnswer={(q, correct) => {
            const masteryBefore = getCard(getSnapshot(), q.kanji.c).mastery;
            grade(q.kanji.c, correct);
            // The long-term goal reached inside the loop (the engine drops it when a milestone bell just rang).
            if (correct && masteryBefore < 3 && getCard(getSnapshot(), q.kanji.c).mastery === 3) play("mastered");
            if (!correct) {
              setLesson(q);
              (window as any).__kanjiDashPause?.(true);
            }
          }}
          onFinish={(stats) => {
            if (finished.current) return;
            finished.current = true;
            const earned = gate
              ? (checkpointPassed(stats.correct, questions.length) ? clearGate(gate) : 0)
              : dailyRunReward(stats);
            finishRun(gate ? 0 : earned);
            setLesson(null);
            setResults({ ...stats, earned });
          }}
        />
      )}

      {/* Lesson flash on wrong answer */}
      {lesson && !results && (
        <LessonFlash lesson={lesson} onDismiss={() => setLesson(null)} />
      )}

      {results && <RunResults gate={gate} questions={questions} results={results} pendingCheckpoint={pendingCheckpoint} restart={restart} />}
    </div>
  );
}

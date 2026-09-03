import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RunnerGame } from "@/components/game/RunnerGame";
import { KanjiDetail } from "@/components/KanjiDetail";
import {
  buildRunQueue, buildGateQuiz, grade, finishRun, clearGate,
  getSnapshot, type Question,
} from "@/lib/srs";
import { CHAPTER_NAMES, CHAPTER_COUNT } from "@/data/n5";

export const Route = createFileRoute("/run")({
  validateSearch: (s: Record<string, unknown>) => {
    const g = s["gate"];
    const n = typeof g === "number" ? g : typeof g === "string" && /^\d+$/.test(g) ? parseInt(g) : NaN;
    return { gate: Number.isFinite(n) ? Math.min(CHAPTER_COUNT, Math.max(1, n)) : undefined };
  },
  head: () => ({
    meta: [
      { title: "Run — Kanji Dash" },
      { name: "description", content: "A kanji run session: steer through answer gates and clear today's review queue." },
      { property: "og:title", content: "Run — Kanji Dash" },
      { property: "og:description", content: "Steer through kanji gates in today's run." },
    ],
  }),
  component: RunPage,
});

function RunPage() {
  const { gate } = useSearch({ from: "/run" });
  const navigate = useNavigate();
  const [session, setSession] = useState(0);
  const questions = useMemo<Question[]>(() => {
    void session;
    const s = getSnapshot();
    return gate ? buildGateQuiz(gate) : buildRunQueue(s);
  }, [gate, session]);

  const [lesson, setLesson] = useState<Question | null>(null);
  const [results, setResults] = useState<null | { correct: number; wrong: number; bestCombo: number }>(null);

  const title = gate ? `${CHAPTER_NAMES[gate]!.name} — Checkpoint` : "Daily run";

  if (questions.length === 0 && !results) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 text-center">
        <div className="font-serif text-6xl font-bold text-primary">完</div>
        <h1 className="mt-4 font-serif text-2xl font-bold">Nothing to run right now</h1>
        <p className="mt-2 max-w-sm text-muted-foreground">
          Every unlocked kanji is already mastered or not yet due. Come back later, or visit the dojo to practice strokes.
        </p>
        <div className="mt-6 flex gap-3">
          <Link to="/" className="rounded-lg bg-primary px-5 py-2.5 font-bold text-primary-foreground">Home</Link>
          <Link to="/practice" className="rounded-lg border border-border px-5 py-2.5 font-bold">Stroke dojo</Link>
        </div>
      </div>
    );
  }

  const pass = results ? results.correct / Math.max(1, results.correct + results.wrong) >= 0.7 : false;

  return (
    <div className="fixed inset-0 bg-paper">
      {!results && (
        <RunnerGame
          key={`${session}-${gate ?? "daily"}`}
          questions={questions}
          title={title}
          onAnswer={(q, correct) => {
            grade(q.kanji.c, correct);
            if (!correct) {
              setLesson(q);
              (window as any).__kanjiDashPause?.(true);
            }
          }}
          onFinish={(stats) => {
            const wrongCount = questions.length - stats.correct;
            const finalStats = { ...stats, wrong: wrongCount };
            setResults(finalStats);
            if (gate) {
              if (stats.correct / questions.length >= 0.7) clearGate(gate);
              else finishRun(0);
            } else {
              finishRun(Math.round(stats.correct * 2 + stats.bestCombo));
            }
          }}
        />
      )}

      {/* Lesson flash on wrong answer */}
      {lesson && !results && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg">
            <div className="mb-3 text-center font-serif text-xl font-bold text-paper">Lesson flash — 復習</div>
            <KanjiDetail kanji={lesson.kanji} />
            <div className="mt-3 rounded-lg bg-card p-3 text-center text-sm">
              The answer was <b className="font-serif text-lg">{lesson.answer}</b>
            </div>
            <button
              onClick={() => {
                setLesson(null);
                (window as any).__kanjiDashPause?.(false);
              }}
              className="mt-4 w-full rounded-lg bg-primary py-3 font-serif text-lg font-bold text-primary-foreground shadow"
            >
              Keep running
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="flex min-h-screen items-center justify-center bg-paper px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            {gate && pass ? (
              <div className="mx-auto flex h-24 w-24 rotate-[-8deg] items-center justify-center rounded-full border-4 border-primary font-serif text-4xl font-bold text-primary">
                合格
              </div>
            ) : (
              <div className="font-serif text-5xl font-bold">{gate ? "再挑戦" : "完了"}</div>
            )}
            <h1 className="mt-4 font-serif text-2xl font-bold">
              {gate ? (pass ? "Checkpoint cleared!" : "Not yet — train and return") : "Run complete!"}
            </h1>
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-secondary p-3">
                <div className="font-serif text-2xl font-bold text-[#2e5238]">{results.correct}</div>
                <div className="text-xs font-bold text-muted-foreground">Correct</div>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <div className="font-serif text-2xl font-bold text-primary">{results.wrong}</div>
                <div className="text-xs font-bold text-muted-foreground">Missed</div>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <div className="font-serif text-2xl font-bold text-accent">×{results.bestCombo}</div>
                <div className="text-xs font-bold text-muted-foreground">Best combo</div>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-2">
              {!gate && (
                <button
                  onClick={() => { setResults(null); setSession((x) => x + 1); }}
                  className="rounded-lg bg-primary py-3 font-serif font-bold text-primary-foreground"
                >
                  Run again
                </button>
              )}
              {gate && !pass && (
                <button
                  onClick={() => { setResults(null); setSession((x) => x + 1); }}
                  className="rounded-lg bg-primary py-3 font-serif font-bold text-primary-foreground"
                >
                  Retry checkpoint
                </button>
              )}
              <button
                onClick={() => navigate({ to: gate ? "/map" : "/" })}
                className="rounded-lg border border-border py-3 font-bold"
              >
                {gate ? "Back to map" : "Back home"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

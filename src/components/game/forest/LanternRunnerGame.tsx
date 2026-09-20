import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/lib/account";
import { useGameMusic } from "@/lib/music";
import { play, unlock } from "@/lib/sfx";
import { vocabKana, type Question } from "@/lib/srs";
import { MusicToggle } from "../../MusicToggle";
import { SoundToggle } from "../../SoundToggle";
import { WordAudio } from "../../WordAudio";
import { WordRuby } from "../../WordRuby";
import {
  advanceRunner,
  createRunnerState,
  getDecisionX,
  getGameLayout,
  getGateSpeed,
  getRunnerRemaining,
  getRunnerStats,
  resizeRunner,
  type RunnerStats,
  type RunnerState,
} from "../runner-math";
import type { DashView } from "./LanternRunnerScene";

type Props = {
  questions: Question[];
  title: string;
  onAnswer: (q: Question, correct: boolean, assisted?: boolean) => void;
  onFinish: (stats: RunnerStats) => void;
  forest?: boolean;
  paused?: boolean;
  onPause?: () => void;
};
type HUD = {
  hearts: number;
  combo: number;
  score: number;
  left: number;
  lane: number;
  question: Question | null;
  choices: (string | null)[];
  seconds: string;
};

export function LanternRunnerGame({
  questions,
  title,
  onAnswer,
  onFinish,
  forest = false,
  paused: externalPause = false,
  onPause,
}: Props) {
  const account = useAccount();
  const host = useRef<HTMLDivElement>(null),
    timerBar = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(false),
    [paused, setPaused] = useState(false);
  const [lesson, setLesson] = useState<Question | null>(null),
    [announcement, setAnnouncement] = useState("");
  const [guided, setGuided] = useState(false);
  const guidance = useRef(false);
  guidance.current = guided;
  const [layout, setLayout] = useState(() => getGameLayout(390, 844));
  const [hud, setHud] = useState<HUD>({
    hearts: 3,
    combo: 0,
    score: 0,
    left: questions.length,
    lane: 1,
    question: questions[0] ?? null,
    choices: [],
    seconds: "3.0",
  });
  const controls = useRef({ blocked: true, local: false, lesson: false });
  controls.current.blocked =
    externalPause ||
    account.prompt ||
    controls.current.local ||
    controls.current.lesson;
  const callbacks = useRef({ onAnswer, onFinish, onPause });
  callbacks.current = { onAnswer, onFinish, onPause };
  const select = useRef<(lane: number) => void>(() => {}),
    pause = useRef<(value?: boolean, correction?: boolean) => void>(() => {});
  const pausedDialog = useRef<HTMLDialogElement>(null),
    lessonDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (paused && !controls.current.lesson && !forest)
      pausedDialog.current?.showModal();
    else pausedDialog.current?.close();
  }, [paused, forest]);
  useEffect(() => {
    if (lesson) lessonDialog.current?.showModal();
    else lessonDialog.current?.close();
  }, [lesson]);

  useEffect(() => {
    let disposed = false,
      loaded = false,
      finished = false,
      signature = "";
    let width = host.current!.clientWidth,
      height = host.current!.clientHeight;
    const s = createRunnerState(questions, width, height);
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let game: { destroy: (remove: boolean) => void } | undefined;
    const refresh = () => {
      if (disposed) return;
      const gate = s.gates.find((g) => g.resolved === -1);
      const layout = getGameLayout(width, height);
      const seconds = gate
        ? Math.max(
            0,
            (gate.x - getDecisionX(layout)) / getGateSpeed(width, layout),
          )
        : 0;
      if (timerBar.current)
        timerBar.current.style.transform = `scaleX(${Math.min(1, seconds / 3)})`;
      const next: HUD = {
        hearts: s.hearts,
        combo: s.combo,
        score: s.score,
        left: getRunnerRemaining(s, questions.length),
        lane: s.targetLane,
        question: gate?.q ?? null,
        choices: gate?.laneChoices ?? [],
        seconds: seconds.toFixed(1),
      };
      const key = JSON.stringify(next);
      if (key !== signature) {
        signature = key;
        setHud(next);
      }
    };
    const setPause = (value = !controls.current.local, correction = false) => {
      if (correction) controls.current.lesson = value;
      else if (forest) {
        if (value) callbacks.current.onPause?.();
        return;
      } else controls.current.local = value;
      const blocked = controls.current.lesson || controls.current.local;
      controls.current.blocked = blocked;
      setPaused(blocked);
    };
    pause.current = setPause;
    const choose = (lane: number) => {
      if (
        !loaded ||
        disposed ||
        s.done ||
        controls.current.blocked ||
        lane < 0 ||
        lane > 2
      )
        return;
      unlock();
      if (s.targetLane !== lane) play("laneChange");
      s.targetLane = lane;
      refresh();
    };
    select.current = choose;
    const answer = (q: Question, correct: boolean) => {
      callbacks.current.onAnswer(q, correct, guidance.current);
      setAnnouncement(
        `${correct ? "Light carried" : "A word to remember"} · ${q.vocab.w} · ${vocabKana(q.vocab)} · ${q.vocab.m}`,
      );
      play(correct ? "correct" : "wrong", { combo: s.combo });
      if (forest && !correct && !s.done) {
        setPause(true, true);
        setLesson(q);
      }
      return !controls.current.blocked;
    };
    const bridge = window as unknown as {
      __kanjiDashPause?: (value: boolean) => void;
      __kanjiDashRunner?: () => RunnerState;
    };
    const external = (value: boolean) => setPause(value, true);
    const inspect = () => JSON.parse(JSON.stringify(s));
    bridge.__kanjiDashPause = external;
    bridge.__kanjiDashRunner = inspect;
    const key = (e: KeyboardEvent) => {
      if (
        e.isComposing ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "Escape") {
        // Corrections must be acknowledged; Esc cannot silently skip learning.
        if (controls.current.lesson) {
          e.preventDefault();
          return;
        }
        if (!forest) {
          e.preventDefault();
          setPause();
        }
        return;
      }
      if (controls.current.blocked) return;
      if (["ArrowUp", "w", "W"].includes(e.key)) {
        e.preventDefault();
        choose(s.targetLane - 1);
      } else if (["ArrowDown", "s", "S"].includes(e.key)) {
        e.preventDefault();
        choose(s.targetLane + 1);
      } else if (/^[1-3]$/.test(e.key)) {
        e.preventDefault();
        choose(Number(e.key) - 1);
      }
    };
    const hide = () => {
        if (document.hidden) setPause(true);
      },
      blur = () => setPause(true);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", hide);
    const view: DashView = {
      state: s,
      paused: true,
      reducedMotion: media.matches,
      resize: (nextWidth, nextHeight) => {
        if (width !== nextWidth || height !== nextHeight)
          resizeRunner(s, width, height, nextWidth, nextHeight);
        width = nextWidth;
        height = nextHeight;
        setLayout(getGameLayout(width, height));
        refresh();
      },
      ready: () => {
        if (!disposed) {
          loaded = true;
          clearTimeout(timeout);
          setReady(true);
        }
      },
      tick: (seconds) => {
        view.paused = controls.current.blocked || !loaded;
        view.reducedMotion = media.matches;
        if (disposed || finished) return;
        if (!view.paused)
          advanceRunner(s, questions, width, height, seconds, answer);
        refresh();
        if (s.done && !finished) {
          finished = true;
          callbacks.current.onFinish(getRunnerStats(s));
        }
      },
    };
    const timeout = setTimeout(() => {
      if (!disposed) setError(true);
    }, 20000);
    import("./LanternRunnerScene")
      .then(({ mountLanternRunner }) => {
        if (!disposed && host.current)
          game = mountLanternRunner(host.current, view);
      })
      .catch(() => {
        if (!disposed) {
          clearTimeout(timeout);
          setError(true);
        }
      });
    return () => {
      disposed = true;
      clearTimeout(timeout);
      game?.destroy(true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", hide);
      if (bridge.__kanjiDashPause === external) delete bridge.__kanjiDashPause;
      if (bridge.__kanjiDashRunner === inspect) delete bridge.__kanjiDashRunner;
      select.current = () => {};
      pause.current = () => {};
    };
  }, [questions, forest]);

  const q = hud.question,
    blocked = !ready || controls.current.blocked;
  return (
    <section
      className={`dash-game ${forest ? "dash-game-forest" : ""}`}
      data-testid="lantern-dash"
      aria-label="Lantern Dash"
      onPointerDown={() => unlock()}
    >
      {!forest && <DashMusic paused={blocked} />}
      <div
        ref={host}
        className="dash-canvas"
        role="img"
        aria-label="Kanji runner game"
        onPointerDown={(e) => {
          const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
          if (y >= layout.laneTop && y <= layout.laneBottom)
            select.current(
              Math.min(
                2,
                Math.floor(((y - layout.laneTop) / layout.laneSpan) * 3),
              ),
            );
        }}
      />
      <div className="dash-vignette" aria-hidden="true" />
      <header className="dash-hud">
        <div className="dash-name">
          <span className="forest-eyebrow">THE SPIRIT TRAIL</span>
          <h1>Lantern Dash</h1>
          <span className="dash-subtitle">
            {title} · <b>{hud.left} left</b>
          </span>
        </div>
        <div className="dash-totals">
          <span
            aria-label={`${hud.hearts} of 3 hearts`}
            className="dash-hearts"
          >
            {[0, 1, 2].map((i) => (
              <i key={i} className={i < hud.hearts ? "lit" : ""}>
                ♥
              </i>
            ))}
          </span>
          <span className="dash-combo">×{hud.combo}</span>
          <span className="dash-score">
            {hud.score.toLocaleString()}
            <small>POINTS</small>
          </span>
        </div>
      </header>
      {q && (
        <div
          className="dash-question"
          style={{ top: layout.questionTop, height: layout.questionHeight }}
        >
          <span className="forest-eyebrow">
            {q.type === "meaning" ? "FOLLOW THE MEANING" : "FOLLOW THE READING"}
          </span>
          <div className="dash-prompt" data-testid="dash-word" lang="ja">
            {q.segments.map((seg, i) =>
              seg.furigana ? (
                <ruby key={i}>
                  {seg.t}
                  <rt>{seg.furigana}</rt>
                </ruby>
              ) : (
                <span key={i}>{seg.t}</span>
              ),
            )}
          </div>
          <div className="dash-timer">
            <div ref={timerBar} />
          </div>
          <span className="sr-only">{hud.seconds} seconds to choose</span>
        </div>
      )}
      <div
        className="dash-lane-choices"
        role="group"
        aria-label="Choose a forest path"
        style={{
          top: layout.laneTop,
          height: layout.laneSpan,
          width: layout.signWidth,
        }}
      >
        {hud.choices.map((choice, lane) => (
          <button
            key={lane}
            className={guided && choice === q?.answer ? "dash-guided" : ""}
            data-testid={`dash-lane-${lane}`}
            disabled={blocked || choice === null}
            aria-pressed={hud.lane === lane}
            aria-label={`Path ${lane + 1}: ${choice ?? "Closed"}${guided && choice === q?.answer ? ", Aki’s path" : ""}`}
            onClick={() => select.current(lane)}
          >
            <kbd>{lane + 1}</kbd>
            <span lang={q?.type === "reading" ? "ja" : "en"}>
              {choice ?? "—"}
            </span>
            <i aria-hidden="true">
              {guided && choice === q?.answer
                ? "✧"
                : hud.lane === lane
                  ? "◆"
                  : "◇"}
            </i>
          </button>
        ))}
      </div>
      <div className="dash-route" aria-hidden="true">
        <span>RIVERBANK</span>
        <i>
          <b
            style={{
              width: `${((questions.length - hud.left) / Math.max(1, questions.length)) * 100}%`,
            }}
          />
        </i>
        <span>SHRINE</span>
      </div>
      <footer className="dash-controls">
        <button
          className="dash-pause-button"
          aria-label={paused || externalPause ? "Resume game" : "Pause game"}
          aria-pressed={paused || externalPause}
          onClick={() => pause.current()}
        >
          {paused || externalPause ? "▶" : "Ⅱ"}
        </button>
        <span className="dash-control-hint">
          ↑ ↓ / 1 2 3 <small>Choose a path · tap on touch</small>
        </span>
        {forest && (
          <button
            className="dash-guide-button"
            disabled={blocked || guided}
            aria-pressed={guided}
            onClick={() => setGuided(true)}
          >
            {guided ? "Aki is guiding" : "Ask Aki"}
          </button>
        )}
        <WordAudio
          reading={q ? vocabKana(q.vocab) : ""}
          wordKey={q}
          paused={blocked}
          variant="hud"
        />
        {!forest && (
          <>
            <SoundToggle variant="hud" />
            <MusicToggle compact />
          </>
        )}
      </footer>
      <div role="status" className="sr-only">
        {announcement}
      </div>
      {!ready && (
        <div className="dash-loading" role={error ? "alert" : "status"}>
          <span>灯</span>
          <p>{error ? "The trail couldn’t load." : "Lighting the way…"}</p>
          {error && (
            <button
              className="forest-primary"
              onClick={() => location.reload()}
            >
              Reload the trail
            </button>
          )}
        </div>
      )}
      {!forest && (
        <dialog
          ref={pausedDialog}
          className="forest-dialog dash-pause"
          aria-label="Run paused"
          onCancel={(e) => {
            e.preventDefault();
            pause.current(false);
          }}
        >
          <span className="forest-eyebrow">A QUIET MOMENT</span>
          <h2>Keep the lantern close.</h2>
          <p>
            Your path will wait. Choose the correct reading or meaning before
            the gates reach you.
          </p>
          <button
            className="forest-primary"
            onClick={() => pause.current(false)}
          >
            Resume the dash
          </button>
          <Link to="/camp" className="forest-text-button">
            Return to camp
          </Link>
        </dialog>
      )}
      {forest && lesson && (
        <dialog
          ref={lessonDialog}
          className="forest-dialog dash-lesson"
          aria-label="Aki’s trail lesson"
          onCancel={(e) => e.preventDefault()}
        >
          <span className="forest-eyebrow">AKI · A WORD ALONG THE WAY</span>
          <h2>Let’s keep this one close.</h2>
          <WordRuby
            vocab={lesson.vocab}
            focus={lesson.kanji.c}
            className="dash-lesson-word"
          />
          <p>
            {vocabKana(lesson.vocab)} · {lesson.vocab.m}
          </p>
          <p>{lesson.kanji.mn}</p>
          <button
            className="forest-primary"
            onClick={() => {
              setLesson(null);
              pause.current(false, true);
            }}
          >
            Keep running
          </button>
        </dialog>
      )}
    </section>
  );
}
function DashMusic({ paused }: { paused: boolean }) {
  useGameMusic("run", paused);
  return null;
}

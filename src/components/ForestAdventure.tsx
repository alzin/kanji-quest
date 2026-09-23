import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ForestCanvas } from "./game/forest/ForestCanvas";
import type { ForestBridge } from "./game/forest/ForestScene";
import { SITES } from "./game/forest/world";
import {
  answerTrail,
  createTrail,
  expeditionWords,
  trailSummary,
} from "@/lib/expedition";
import {
  awardDailySeal,
  finishRun,
  getSnapshot,
  grade,
  learningLevel,
  recordProduction,
  recordTypedSeal,
  vocabKana,
} from "@/lib/srs";
import { acceptsReading } from "@/lib/production";
import { play, unlock } from "@/lib/sfx";
import { useGameMusic } from "@/lib/music";
import { useAccount } from "@/lib/account";
import { MusicToggle } from "./MusicToggle";
import { SoundToggle } from "./SoundToggle";
import { WordAudio } from "./WordAudio";
import { CrossingEncounter } from "./game/forest/CrossingEncounter";
import { completeCrossing } from "./game/forest/crossing";
import { LanternDashEncounter } from "./game/forest/LanternDashEncounter";
import { completeLanternDash } from "./game/forest/lantern-dash";

function ForestDialog({
  children,
  label,
  close,
  className = "",
}: {
  children: ReactNode;
  label: string;
  close: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      className={`forest-dialog ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      {children}
    </dialog>
  );
}

export function ForestAdventure() {
  const account = useAccount();
  const [words] = useState(() => expeditionWords(getSnapshot()));
  const [level] = useState(() => learningLevel(getSnapshot()));
  const [trail, setTrail] = useState(() => createTrail(words, "river"));
  const [restored, setRestored] = useState(0);
  const [delivered, setDelivered] = useState(false);
  const [ready, setReady] = useState(false),
    [near, setNear] = useState<number | null>(null);
  const [encounter, setEncounter] = useState(false),
    [journal, setJournal] = useState(false),
    [paused, setPaused] = useState(false);
  const [introduced, setIntroduced] = useState(false),
    [results, setResults] = useState(false);
  const [studyWord, setStudyWord] = useState(0);
  const [motes, setMotes] = useState(0),
    [hinted, setHinted] = useState(false),
    [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    value: string;
    next: ReturnType<typeof answerTrail>;
  } | null>(null);
  const [toast, setToast] = useState(""),
    [welcome, setWelcome] = useState(true);
  const locked = useRef(false),
    saved = useRef(false),
    action = useRef(() => {}),
    continueButton = useRef<HTMLButtonElement>(null),
    inputField = useRef<HTMLInputElement>(null);
  const [bridge] = useState<ForestBridge>(() => ({
    blocked: true,
    restored: 0,
    preview: false,
    reducedMotion: false,
    onReady: () => setReady(true),
    onNear: setNear,
    onInteract: () => action.current(),
    onMote: (count) => {
      setMotes(count);
      play("correct");
    },
  }));
  bridge.blocked =
    !ready || paused || journal || encounter || results || account.prompt;
  bridge.restored = restored;
  bridge.delivered = delivered;
  const dash = restored === 2 && !delivered;
  const current = trail.queue[trail.index],
    q = current?.question;
  const site = SITES[Math.min(restored, 2)]!;
  const summary = trailSummary(trail);
  useGameMusic(
    dash && encounter
      ? "run"
      : restored === 2
        ? "shrine"
        : encounter && restored === 1
          ? "puzzle"
          : "forest",
    paused || !ready || account.prompt,
  );
  action.current = () => {
    if (near === null || bridge.blocked || restored >= 3) return;
    unlock();
    setWelcome(false);
    if (!introduced) setJournal(true);
    else setEncounter(true);
  };
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      bridge.reducedMotion = media.matches;
    };
    update();
    media.addEventListener("change", update);
    const hide = () => {
      if (document.hidden) setPaused(true);
    };
    const blur = () => setPaused(true);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("blur", blur);
    return () => {
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("blur", blur);
    };
  }, [bridge]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (feedback) continueButton.current?.focus();
    else if (encounter && current?.kind === "recall")
      inputField.current?.focus();
  }, [feedback, encounter, current?.id]);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (
        account.prompt ||
        e.repeat ||
        e.isComposing ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "Escape" && !encounter && !journal && !results && !paused) {
        e.preventDefault();
        setPaused(true);
      }
      if (
        encounter &&
        restored !== 1 &&
        !dash &&
        !paused &&
        !feedback &&
        current?.kind !== "recall" &&
        /^[1-3]$/.test(e.key)
      ) {
        const value = q?.choices[Number(e.key) - 1];
        if (value) {
          e.preventDefault();
          answer(value);
        }
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  });
  function answer(value: string) {
    if (!current || locked.current || paused || account.prompt || !encounter)
      return;
    locked.current = true;
    const correct =
      current.kind === "recall"
        ? acceptsReading(current.question.vocab, value)
        : value === current.question.answer;
    const next = answerTrail(trail, correct, hinted);
    setFeedback({ correct, value, next });
    play(correct ? "correct" : "wrong", { combo: next.combo });
    if (correct) bridge.celebrate?.();
  }
  const advance = useCallback(() => {
    if (!feedback || paused || account.prompt) return;
    const next = feedback.next;
    setTrail(next);
    setFeedback(null);
    setHinted(false);
    setInput("");
    locked.current = false;
    const resolved = next.answers.filter((a) => !a.encounter.retry).length;
    const complete = next.index >= next.queue.length;
    const nextRestored = complete
      ? 3
      : resolved >= words.length * 2
        ? 2
        : resolved >= words.length
          ? 1
          : 0;
    if (nextRestored > restored) {
      setRestored(nextRestored);
      setEncounter(false);
      setNear(null);
      setToast(SITES[nextRestored - 1]!.reward);
      play("sealEarned");
    }
    if (complete && !saved.current) {
      saved.current = true;
      const result = trailSummary(next),
        now = Date.now();
      for (const card of result.cards) {
        grade(card.c, card.correct, now, {
          rt: 0,
          fallTime: 0,
          hinted: !card.correct,
        });
        if (card.produced) recordProduction(card.c, false, now);
      }
      if (next.answers.some((a) => a.encounter.kind === "recall"))
        recordTypedSeal(now);
      finishRun(result.earned);
      awardDailySeal(now);
      play("runComplete", { earned: result.earned });
      // Let the player see the restored shrine before opening the report.
      setToast("The forest remembers. Your discoveries have been recorded.");
    }
  }, [feedback, paused, account.prompt, words.length, restored]);
  useEffect(() => {
    if (!feedback?.correct || paused || account.prompt || !encounter || journal)
      return;
    const timer = setTimeout(advance, 1000);
    return () => clearTimeout(timer);
  }, [feedback, paused, account.prompt, encounter, journal, advance]);
  const closeJournal = () => {
    const first = !introduced;
    setJournal(false);
    setIntroduced(true);
    if (first && near !== null) setEncounter(true);
  };

  return (
    <main
      className="forest-game"
      data-testid="forest-adventure"
      data-paused={paused}
      onPointerDown={() => unlock()}
    >
      <ForestCanvas bridge={bridge} />
      <div className="forest-vignette" aria-hidden="true" />
      {!ready && (
        <div className="forest-loading">
          <span className="forest-seal">森</span>
          <p>Finding the forest path…</p>
        </div>
      )}
      <header className="forest-hud">
        <Link
          to="/"
          className="forest-wordmark"
          aria-label="Kanji Dash title screen"
        >
          <span className="forest-seal">森</span>
          <span>
            KANJI DASH<small>THE SPIRIT TRAIL</small>
          </span>
        </Link>
        <div className="forest-hud-right">
          <span className="forest-motes" title="Optional fireflies found">
            ✦ <b>{motes}</b>
            <small>/ 5</small>
          </span>
          <button
            className="forest-icon-button"
            onClick={() => setJournal(true)}
            aria-label="Open field notes"
            title="Field notes"
          >
            ▤
          </button>
          <button
            className="forest-icon-button"
            onClick={() => setPaused(true)}
            aria-label="Pause adventure"
            title="Pause"
          >
            Ⅱ
          </button>
        </div>
      </header>
      <div className="forest-objective">
        <span className="forest-eyebrow">
          CHAPTER 01 <span>•</span> {level} WOODLANDS
        </span>
        <h1>
          {restored === 3
            ? "The forest remembers."
            : dash
              ? "Carry light through the mist"
              : site.objective}
        </h1>
        <div
          className="forest-seals"
          aria-label={`${restored} of 3 landmarks restored`}
        >
          {["Lantern", "Crossing", "Shrine"].map((name, i) => (
            <span
              key={name}
              className={i < restored ? "done" : i === restored ? "active" : ""}
            >
              <i>{i < restored ? "✓" : "◇"}</i>
              {name}
            </span>
          ))}
        </div>
        {restored < 3 && (
          <button
            className="forest-track"
            disabled={!ready || bridge.blocked}
            onClick={() => {
              setWelcome(false);
              bridge.navigate?.();
            }}
          >
            Follow the trail <span>↗</span>
          </button>
        )}
      </div>
      <div className="forest-location" aria-hidden="true">
        <span>木霊の森</span>
        <small>KODAMA WOODS</small>
        <i />
      </div>
      <div className="forest-bottom">
        {welcome && ready && (
          <div className="forest-guide">
            <span className="forest-guide-portrait" aria-hidden="true">
              狐
            </span>
            <div>
              <span>
                AKI <small>YOUR TRAIL COMPANION</small>
              </span>
              <p>
                The forest has forgotten its words.
                <br />
                Come on. Let’s find its first light.
              </p>
            </div>
            <button
              aria-label="Dismiss Aki’s welcome"
              onClick={() => setWelcome(false)}
            >
              ×
            </button>
          </div>
        )}
        {toast && (
          <div className="forest-toast" role="status">
            ✦ {toast}
          </div>
        )}
        {restored === 3 ? (
          <button
            className="forest-primary forest-interact"
            onClick={() => setResults(true)}
          >
            View your discoveries <span aria-hidden="true">→</span>
          </button>
        ) : near !== null && !bridge.blocked ? (
          <button
            className="forest-primary forest-interact"
            onClick={() => action.current()}
          >
            <kbd>E</kbd>
            {dash ? "Run the mist trail" : site.verb}
            <span aria-hidden="true">→</span>
          </button>
        ) : (
          <div className="forest-controls">
            <span>
              <kbd>W A S D</kbd> / <kbd>↑ ← ↓ →</kbd> Walk
            </span>
            <i /> <span>Click or tap to explore</span>
          </div>
        )}
      </div>

      {journal && (
        <ForestDialog label="Field notes" close={closeJournal}>
          <div className="forest-dialog-top">
            <span className="forest-eyebrow">YOUR FIELD NOTES</span>
            <button
              className="forest-close"
              onClick={closeJournal}
              aria-label="Close field notes"
            >
              ×
            </button>
          </div>
          <h2>Words for the road.</h2>
          <p>
            Take a moment to meet these words. Their meanings will wake the
            lantern; their readings will rebuild the crossing. Carry that light
            through the mist, then offer the words at the shrine.
          </p>
          <div className="forest-word-list">
            {words.map((word, index) => (
              <button
                key={word.kanji.c}
                onClick={() => setStudyWord(index)}
                aria-pressed={studyWord === index}
              >
                <strong lang="ja">{word.vocab.w}</strong>
                <span>
                  <span lang="ja">{vocabKana(word.vocab)}</span>
                  <small>{word.vocab.m}</small>
                </span>
                <span aria-hidden="true">
                  {studyWord === index ? "♪" : "›"}
                </span>
              </button>
            ))}
          </div>
          {words[studyWord] && (
            <div className="forest-journal-audio">
              <WordAudio
                reading={vocabKana(words[studyWord]!.vocab)}
                wordKey={words[studyWord]!.vocab.w}
                paused={paused}
              />
            </div>
          )}
          {!words.length && (
            <p>
              No words are available in your unlocked regions. Visit camp to
              choose a learning level.
            </p>
          )}
          <p className="forest-fine">
            No timer. If a word slips away, Aki will help you find it again.
          </p>
          <button className="forest-primary" onClick={closeJournal}>
            Ready for the trail <span aria-hidden="true">→</span>
          </button>
        </ForestDialog>
      )}

      {encounter && restored === 1 && (
        <ForestDialog
          label="The forgotten crossing"
          close={() => setPaused(true)}
          className="forest-crossing-dialog"
        >
          <CrossingEncounter
            words={words}
            paused={paused || account.prompt}
            onPause={() => setPaused(true)}
            onComplete={(recalls) => {
              setTrail((state) => completeCrossing(state, recalls));
              setRestored(2);
              setEncounter(false);
              setNear(null);
              setToast(SITES[1].reward);
              play("sealEarned");
            }}
          />
        </ForestDialog>
      )}
      {encounter && dash && (
        <ForestDialog
          label="The mist trail"
          close={() => setPaused(true)}
          className="forest-dash-dialog"
        >
          <LanternDashEncounter
            words={words}
            paused={paused || account.prompt}
            onPause={() => setPaused(true)}
            onComplete={(questions, evidence) => {
              setTrail((state) =>
                completeLanternDash(state, questions, evidence),
              );
              setDelivered(true);
              setEncounter(false);
              setToast("The mist lifts. Your lantern has lit the shrine path.");
              play("sealEarned");
            }}
          />
        </ForestDialog>
      )}
      {encounter && restored !== 1 && !dash && q && current && (
        <ForestDialog
          label={site.name}
          close={() => setPaused(true)}
          className="forest-encounter"
        >
          <div className="forest-dialog-top">
            <span className="forest-eyebrow">
              {current.retry ? "A WORD RETURNS" : site.name}
            </span>
            <button
              className="forest-close"
              onClick={() => setPaused(true)}
              aria-label="Pause encounter"
            >
              Ⅱ
            </button>
          </div>
          <div className="forest-encounter-progress">
            {Array.from(
              { length: words.length * 3 + Math.min(2, words.length) },
              (_, i) => (
                <i
                  key={i}
                  className={
                    i < trail.answers.filter((a) => !a.encounter.retry).length
                      ? "complete"
                      : ""
                  }
                />
              ),
            )}
          </div>
          <h2>
            {current.kind === "meaning"
              ? "Every word holds a little light."
              : current.kind === "reading"
                ? "Give the river its voice."
                : "What does the forest remember?"}
          </h2>
          <p>
            {current.kind === "recall"
              ? "Recall the reading. Hiragana, katakana, or romaji."
              : current.kind === "meaning"
                ? "Choose the meaning to kindle the lantern."
                : "Choose the reading to restore the crossing."}
          </p>
          <div
            className={`forest-question ${feedback ? (feedback.correct ? "correct" : "learning") : ""}`}
            lang="ja"
            data-testid="forest-word"
          >
            {q.vocab.w}
          </div>
          {current.kind === "recall" ? (
            <form
              className="forest-recall"
              onSubmit={(e) => {
                e.preventDefault();
                if (input.trim()) answer(input);
              }}
            >
              <label htmlFor="forest-reading" className="sr-only">
                Word reading
              </label>
              <input
                id="forest-reading"
                ref={inputField}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type the reading…"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={!!feedback || paused}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.nativeEvent.isComposing)
                    e.preventDefault();
                }}
              />
              <button
                className="forest-primary"
                disabled={!input.trim() || !!feedback || paused}
              >
                Offer the word <span aria-hidden="true">↵</span>
              </button>
            </form>
          ) : (
            <div
              className="forest-answers"
              role="group"
              aria-label="Choose an answer"
            >
              {q.choices.map((choice, i) => (
                <button
                  key={choice}
                  disabled={!!feedback || paused}
                  onClick={() => answer(choice)}
                  className={
                    feedback
                      ? choice === q.answer
                        ? "correct"
                        : choice === feedback.value
                          ? "wrong"
                          : ""
                      : ""
                  }
                >
                  <kbd>{i + 1}</kbd>
                  <span lang={current.kind === "reading" ? "ja" : "en"}>
                    {choice}
                  </span>
                  {feedback && choice === q.answer && <b>✓</b>}
                </button>
              ))}
            </div>
          )}
          {feedback ? (
            <div className="forest-feedback" role="status">
              <strong>
                {feedback.correct
                  ? hinted
                    ? "Found it together."
                    : "A little more light."
                  : "Let’s keep this word close."}
              </strong>
              <p>
                <span lang="ja">
                  {q.vocab.w} · {vocabKana(q.vocab)}
                </span>{" "}
                · {q.vocab.m}
              </p>
              {!feedback.correct && (
                <small>
                  {q.kanji.mn}{" "}
                  {!current.retry && "You’ll meet this word again."}
                </small>
              )}
              {!feedback.correct && (
                <button
                  ref={continueButton}
                  className="forest-primary"
                  onClick={advance}
                >
                  Continue <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          ) : (
            <div className="forest-hint">
              {hinted ? (
                <p>
                  <span lang="ja">{vocabKana(q.vocab)}</span> · {q.vocab.m}
                  <small>
                    {q.kanji.mn}
                    <br />
                    Guided answers help you learn, but don’t earn recall credit.
                  </small>
                </p>
              ) : (
                <button onClick={() => setHinted(true)}>
                  ✧ Ask Aki for a hint
                </button>
              )}
            </div>
          )}
          <div className="forest-encounter-foot">
            <span>✦ {feedback?.next.light ?? trail.light} light gathered</span>
            <span>{feedback?.next.combo ?? trail.combo} recall streak</span>
          </div>
        </ForestDialog>
      )}

      {results && (
        <ForestDialog
          label="Adventure complete"
          close={() => setResults(false)}
          className="forest-results"
        >
          <span className="forest-result-seal">森</span>
          <span className="forest-eyebrow">KODAMA WOODS · RESTORED</span>
          <h2>The forest remembers.</h2>
          <p>
            A lantern glows. A river can be crossed.
            <br />
            And a few more words feel like old friends.
          </p>
          <div className="forest-result-stats">
            <div>
              <b>
                3<small>/3</small>
              </b>
              <span>places restored</span>
            </div>
            <div>
              <b>+{summary.earned}</b>
              <span>mon earned</span>
            </div>
            <div>
              <b>
                {motes}
                <small>/5</small>
              </b>
              <span>fireflies found</span>
            </div>
          </div>
          <p>
            {summary.correct} of {summary.total} encounters recalled
            independently.{" "}
            {summary.recovered > 0 &&
              `${summary.recovered} missed ${summary.recovered === 1 ? "word" : "words"} recovered.`}{" "}
            {account.user
              ? "Your discoveries are recorded in your progress."
              : "Your discoveries are saved in this tab. Visit camp to sign in and keep them across devices."}
          </p>
          <div className="forest-discoveries">
            {words.map((word) => (
              <span key={word.kanji.c} lang="ja">
                {word.vocab.w}
                <small>{word.vocab.m}</small>
              </span>
            ))}
          </div>
          <Link to="/camp" className="forest-primary">
            Return to camp <span aria-hidden="true">→</span>
          </Link>
          <button
            className="forest-text-button"
            onClick={() => setResults(false)}
          >
            Stay a little longer
          </button>
        </ForestDialog>
      )}

      {paused && (
        <ForestDialog
          label="Adventure paused"
          close={() => setPaused(false)}
          className="forest-pause"
        >
          <span className="forest-eyebrow">A QUIET MOMENT</span>
          <h2>The forest can wait.</h2>
          <p>
            Finish the three landmarks to save your discoveries. There’s no
            hurry.
          </p>
          <button
            className="forest-primary"
            onClick={() => {
              setPaused(false);
              unlock();
            }}
          >
            Back to the trail <span aria-hidden="true">→</span>
          </button>
          <div className="forest-audio">
            <SoundToggle variant="inline" />
            <MusicToggle compact />
          </div>
          <Link to="/" className="forest-text-button">
            {saved.current ? "Return to title" : "Leave unfinished adventure"}
          </Link>
        </ForestDialog>
      )}
    </main>
  );
}

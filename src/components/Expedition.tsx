import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CHAPTER_NAMES, LEVEL_CHAPTERS } from "@/data";
import { awardDailySeal, finishRun, getCard, getSnapshot, grade, isChapterUnlocked, isGateCleared, learningLevel, recordProduction, recordTypedSeal, vocabKana } from "@/lib/srs";
import { answerTrail, createTrail, expeditionWords, trailSummary, type TrailPath, type TrailState } from "@/lib/expedition";
import { acceptsReading } from "@/lib/production";
import { play, unlock } from "@/lib/sfx";
import { TrailEmblem } from "./TrailEmblem";
import { AppIcon } from "./AppIcon";
import { SoundToggle } from "./SoundToggle";
import { WordAudio } from "./WordAudio";
import { MusicToggle } from "./MusicToggle";
import { useGameMusic } from "@/lib/music";
import { TrailCompanion, type CompanionMood } from "./TrailCompanion";
import { AnswerEffects, AnimatedNumber } from "./AnswerEffects";

function PauseDialog({ resume }: { resume: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="trail-pause" onCancel={(e) => { e.preventDefault(); resume(); }} aria-labelledby="pause-title">
    <TrailEmblem kind="leaf" /><h2 id="pause-title">Rest a little.</h2><p>The forest will wait. This trail’s progress is recorded when you finish.</p>
    <button autoFocus className="trail-button trail-button-primary" onClick={resume}>Back to the trail</button>
    <Link to="/" className="trail-button trail-button-quiet">Leave unfinished trail</Link>
  </dialog>;
}

export function Expedition() {
  const [frozen] = useState(() => {
    const save = getSnapshot(), words = expeditionWords(save);
    return { words, fresh: words.filter((q) => getCard(save, q.kanji.c).mastery === 0), level: learningLevel(save) };
  });
  const [stage, setStage] = useState<"intro" | "learn" | "play" | "camp" | "results">("intro");
  const [path, setPath] = useState<TrailPath>("river");
  const [study, setStudy] = useState(0);
  const [trail, setTrail] = useState<TrailState>(() => createTrail([], "river"));
  const [feedback, setFeedback] = useState<{ correct: boolean; value: string; next: TrailState } | null>(null);
  const [input, setInput] = useState("");
  const [hinted, setHinted] = useState(false);
  const [paused, setPaused] = useState(false);
  const locked = useRef(false), completed = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null), continueRef = useRef<HTMLButtonElement>(null);
  const current = trail.queue[trail.index];
  const q = current?.question;
  useGameMusic(current?.kind === "recall" ? "shrine" : "forest", paused);
  const baseTotal = frozen.words.length * 2 + Math.min(2, frozen.words.length);
  const resolved = trail.answers.filter((a) => !a.encounter.retry).length;
  const firstRound = resolved < frozen.words.length;
  const checkpoint = LEVEL_CHAPTERS[frozen.level].find((ch) => isChapterUnlocked(getSnapshot(), ch) && !isGateCleared(getSnapshot(), ch));

  function choosePath(next: TrailPath) {
    unlock(); setPath(next); setTrail(createTrail(frozen.words, next));
    setStage(frozen.fresh.length ? "learn" : "play");
    play("sheet");
  }
  function answer(value: string) {
    if (locked.current || !current || stage !== "play" || paused) return;
    locked.current = true;
    const correct = current.kind === "recall" ? acceptsReading(current.question.vocab, value) : value === current.question.answer;
    const next = answerTrail(trail, correct, hinted);
    setFeedback({ correct, value, next });
    play(correct ? next.combo > 0 && next.combo % 3 === 0 ? "comboMilestone" : "correct" : "wrong", { combo: next.combo });
  }
  function advance() {
    if (!feedback) return;
    const next = feedback.next;
    setTrail(next); setFeedback(null); setInput(""); setHinted(false); locked.current = false;
    if (next.index < next.queue.length) {
      if (!next.charm && next.answers.filter((a) => !a.encounter.retry).length >= frozen.words.length) setStage("camp");
      return;
    }
    if (!completed.current) {
      completed.current = true;
      const summary = trailSummary(next);
      const now = Date.now();
      for (const card of summary.cards) {
        // One grade per kanji, preserving due dates for optional same-day practice.
        grade(card.c, card.correct, now, { rt: 0, fallTime: 0, hinted: !card.correct });
        if (card.produced) recordProduction(card.c, false, now);
      }
      if (next.answers.some((a) => a.encounter.kind === "recall")) recordTypedSeal(now);
      finishRun(summary.earned); awardDailySeal(now); play("runComplete", { earned: summary.earned });
    }
    setStage("results");
  }

  useEffect(() => {
    if (feedback) continueRef.current?.focus({ preventScroll: true });
    else if (stage === "play" && current?.kind === "recall" && !paused) inputRef.current?.focus();
  }, [feedback, current?.id, stage, paused]);
  useEffect(() => {
    if (stage !== "play") return;
    const visibility = () => { if (document.hidden) setPaused(true); };
    document.addEventListener("visibilitychange", visibility);
    const keys = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing || paused) return;
      if (e.key === "Escape") { e.preventDefault(); setPaused(true); return; }
      if (feedback && e.key === "Enter") { e.preventDefault(); advance(); return; }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!feedback && current?.kind !== "recall" && /^[1-3]$/.test(e.key)) {
        const value = q?.choices[Number(e.key) - 1];
        if (value) { e.preventDefault(); answer(value); }
      }
    };
    window.addEventListener("keydown", keys);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("keydown", keys); };
  });

  const summary = trailSummary(trail);
  const light = feedback?.next.light ?? trail.light;
  const lit = Math.min(5, Math.floor(light / 4));
  const studyWord = frozen.fresh[study];
  const combo = feedback?.next.combo ?? trail.combo;
  const earned = trailSummary(feedback?.next ?? trail).earned;
  const mood: CompanionMood = feedback ? feedback.correct ? combo > 0 && combo % 3 === 0 ? "celebrate" : "correct" : "miss" : stage === "results" || stage === "camp" ? "celebrate" : "idle";
  const message = feedback ? feedback.correct ? combo > 0 && combo % 3 === 0 ? `${combo} in a row! Look how you glow!` : hinted ? "We found it together. Keep that word close." : current?.retry ? "You remembered! That’s how we grow." : ["You did it! Another spark for the forest.", "That’s the one! Let’s keep wandering.", "I knew you had a little light in you."][trail.index % 3]! : "It’s okay. Let’s keep this word and try again." : stage === "intro" ? "I’m Aki! Come on, let’s wake the forest." : stage === "learn" ? "A new word is a little friend. Say hello!" : stage === "camp" ? "I found something for you! Pick a charm." : stage === "results" ? "Look what we did together. See you again?" : current?.kind === "recall" ? "A quiet breath. You know this one." : "I’ll carry the lantern. You find the words.";
  return <div className={`expedition-page path-${path}`} data-testid="expedition" data-paused={paused}>
    <header className="expedition-header"><Link to="/" className="expedition-brand"><TrailEmblem /><span>Kanji Dash <small>THE SPIRIT TRAIL</small></span></Link><div><SoundToggle variant="inline" /><MusicToggle compact />{stage === "play" && <button className="trail-button trail-button-quiet" onClick={() => setPaused(true)} aria-label="Pause adventure">Ⅱ <span>Pause</span></button>}{stage !== "play" && <Link to="/" className="trail-button trail-button-quiet">Back to camp</Link>}</div></header>
    <main>
      <section className="expedition-world" aria-label={`${lit} of 5 lanterns glowing`}>
        <img src={`${import.meta.env.BASE_URL}art/spirit-forest.webp`} alt="" width="1536" height="1024" />
        <div className="expedition-world-shade" />
        <div className="expedition-world-title"><span>{frozen.level} · {stage === "results" ? "A LITTLE WISER" : path === "river" ? "THE RIVER PATH" : "THE SHRINE PATH"}</span><h1>{stage === "results" ? "You brought a little light." : stage === "camp" ? "A gift from the forest." : stage === "play" ? current?.retry ? "A word worth revisiting." : current?.kind === "recall" ? "The shrine of remembering." : "The forest is listening." : "Every word lights the way."}</h1></div>
        <div className="expedition-lanterns" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <div key={i} className={i < lit ? "lit" : ""}><TrailEmblem /><span>{i + 1}</span></div>)}</div>
        <TrailCompanion mood={mood} message={message} reactionKey={current?.id ?? stage} paused={paused} className="expedition-companion" />
        {stage === "play" && <div className="trail-live-score" aria-label={`${light} light, ${earned} mon, ${combo} recall streak`}><span><TrailEmblem /><b><AnimatedNumber value={light} /></b> light</span><span><b><AnimatedNumber value={earned} /></b> mon</span><span key={combo} className={combo > 1 ? "flow-active" : ""}>✦ ×{combo} <small>FLOW</small></span></div>}
        <div className="forest-mote mote-one" /><div className="forest-mote mote-two" />
      </section>

      <div className="expedition-content">
        {stage === "intro" && <section className="expedition-panel trail-intro">
          <span className="trail-eyebrow">A SMALL ADVENTURE, JUST FOR YOU</span><h2>Choose your way into the woods.</h2><p>Meet {frozen.words.length} words. Use their meanings and readings to kindle lanterns.<br className="desktop-break" /> At the shrine, call two words back from memory.</p>
          <div className="trail-route-choice"><button onClick={() => choosePath("river")} className="route-river"><span className="route-symbol">川</span><span className="mode-tag">MEANING FIRST</span><h3>The river path</h3><p>Start with what words mean,<br />then find their sound.</p><span className="route-action">Follow the river <AppIcon name="arrow" /></span></button><button onClick={() => choosePath("shrine")} className="route-shrine"><TrailEmblem kind="gate" /><span className="mode-tag">READING FIRST</span><h3>The shrine path</h3><p>Start with how words sound,<br />then uncover their meaning.</p><span className="route-action">Follow the lanterns <AppIcon name="arrow" /></span></button></div>
          <p className="trail-soft-note">No timer. No lost lives. Missed words return for a second chance.</p>
        </section>}

        {stage === "camp" && <section className="expedition-panel trail-intro" data-testid="trail-camp">
          <span className="trail-eyebrow">A MOMENT AT THE CLEARING</span><h2>Take a charm for the road.</h2><p>Your words have woken the forest spirits. Choose a gift for the rest of this expedition.</p>
          <div className="trail-route-choice"><button className="route-shrine" onClick={() => { setTrail({ ...trail, charm: "firefly" }); setStage("play"); play("sealEarned"); }}><TrailEmblem kind="spark" /><span className="mode-tag">TRUST YOUR RECALL</span><h3>Firefly charm</h3><p>Gather +1 extra light for every correct answer without a hint.</p><span className="route-action">Carry the firefly <AppIcon name="arrow" /></span></button><button className="route-river" onClick={() => { setTrail({ ...trail, charm: "moss" }); setStage("play"); play("sealEarned"); }}><TrailEmblem kind="leaf" /><span className="mode-tag">LEARN WITH A GUIDE</span><h3>Moss charm</h3><p>Correct answers with a hint give 3 light instead of 1.</p><span className="route-action">Carry the moss <AppIcon name="arrow" /></span></button></div>
          <p className="trail-soft-note">Charms change your lantern light. Independent recall still earns your mon and mastery progress.</p>
        </section>}
        {stage === "learn" && studyWord && <section className="expedition-panel trail-study" aria-label="Meet your trail words">
          <div className="trail-panel-top"><span className="trail-eyebrow">PACK A LITTLE KNOWLEDGE</span><span>{study + 1} / {frozen.fresh.length} new words</span></div>
          <h2>Before we set off…</h2><p>Take a moment with this word. You’ll meet it on the trail.</p>
          <div className="trail-study-word"><span lang="ja">{studyWord.vocab.w}</span><strong lang="ja">{vocabKana(studyWord.vocab)}</strong><small>{studyWord.vocab.r} · {studyWord.vocab.m}</small></div>
          <WordAudio reading={vocabKana(studyWord.vocab)} wordKey={studyWord.vocab.w} paused={paused} />
          <div className="trail-memory-note"><TrailEmblem kind="leaf" /><p><b>{studyWord.kanji.c} · {studyWord.kanji.m}</b>{studyWord.kanji.mn}</p></div>
          <button className="trail-button trail-button-primary" onClick={() => { if (study + 1 < frozen.fresh.length) setStudy(study + 1); else setStage("play"); play("sheet"); }}>{study + 1 < frozen.fresh.length ? "Meet the next word" : "Step onto the trail"}<AppIcon name="arrow" /></button>
        </section>}

        {stage === "play" && current && q && <section className="expedition-panel trail-encounter" data-testid="trail-encounter">
          <div className="trail-panel-top"><span className="trail-eyebrow">{current.retry ? "SECOND CHANCE" : current.kind === "recall" ? "FINAL CHALLENGE · RECALL" : `CHAPTER ${firstRound ? "01" : "02"} · ${current.kind === "meaning" ? "DISCOVER" : "RECOGNIZE"}`}</span><span>{resolved} / {baseTotal} encounters</span></div>
          <div className="trail-meter encounter-meter"><span style={{ width: `${resolved / Math.max(1, baseTotal) * 100}%` }} /></div>
          <div className="trail-encounter-heading"><h2>{current.kind === "recall" ? "Can you recall its reading?" : current.kind === "reading" ? "Give this word its voice." : "What does this word mean?"}</h2><p>{current.retry ? "You’ve seen this one. Take your time and try again." : current.kind === "recall" ? "No choices this time. Type hiragana, katakana, or romaji." : "Recall the word to send a little light into the forest."}</p></div>
          <div className="trail-word-stage"><div className={`trail-word ${feedback ? feedback.correct ? "word-correct" : "word-learning" : ""}`} lang="ja">{q.vocab.w}</div>{feedback && <AnswerEffects key={current.id} correct={feedback.correct} light={feedback.next.light - trail.light} mon={earned - summary.earned} combo={combo} lostCombo={trail.combo > 0} />}</div>
          {current.kind === "recall" ? <form className="trail-recall" onSubmit={(e) => { e.preventDefault(); if (input.trim()) answer(input); }}><label className="sr-only" htmlFor="trail-reading">Word reading</label><input ref={inputRef} id="trail-reading" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type the reading…" autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={!!feedback || paused} onKeyDown={(e) => { if (e.nativeEvent.isComposing && e.key === "Enter") e.preventDefault(); }} /><button className="trail-button trail-button-primary" disabled={!input.trim() || !!feedback || paused}>Light the lantern <AppIcon name="arrow" /></button></form>
            : <div className="trail-answers" role="group" aria-label="Choose an answer">{q.choices.map((choice, i) => <button key={choice} disabled={!!feedback || paused} onClick={() => answer(choice)} className={feedback ? choice === q.answer ? "answer-correct" : choice === feedback.value ? "answer-wrong" : "" : ""}><kbd>{i + 1}</kbd><span lang={current.kind === "reading" ? "ja" : "en"}>{choice}</span>{feedback && choice === q.answer && <AppIcon name="check" />}</button>)}</div>}
          {feedback ? <div className={`trail-feedback ${feedback.correct ? "correct" : "learning"}`} role="status"><div><TrailEmblem kind={feedback.correct ? "spark" : "leaf"} /><div><strong>{feedback.correct ? hinted ? "Found it with a little help." : feedback.next.combo > 0 && feedback.next.combo % 3 === 0 ? `${feedback.next.combo} in a row! A little extra glow.` : current.retry ? "Welcome back, familiar word." : "A little more light." : current.retry ? "Keep this one in your field notes." : "A new chance to remember."}</strong><p><span lang="ja">{q.vocab.w} · {vocabKana(q.vocab)}</span> · {q.vocab.m}</p>{!feedback.correct && <small>{q.kanji.mn} {!current.retry && "This word will return shortly."}</small>}</div></div><WordAudio reading={vocabKana(q.vocab)} wordKey={current.id} paused={paused} /><button ref={continueRef} className="trail-button trail-button-primary" onClick={advance}>{feedback.next.index >= feedback.next.queue.length ? "Gather your discoveries" : "Continue along the trail"}<AppIcon name="arrow" /></button></div>
            : <div className="trail-hint">{hinted ? <p><b>A note from your guide:</b> <span lang="ja">{vocabKana(q.vocab)}</span> · {q.vocab.m}<br />{q.kanji.mn}<small>Guided answers help you learn; they don’t count as independent recall.</small></p> : <button onClick={() => setHinted(true)}><TrailEmblem kind="leaf" /> A little help?</button>}</div>}
          <div className="trail-encounter-foot"><span><TrailEmblem /> {light} light gathered{trail.charm && <span className="charm-chip" title={trail.charm === "firefly" ? "+1 light for independent recall" : "3 light for guided answers"}>{trail.charm === "firefly" ? "✧ Firefly" : "❧ Moss"}</span>}</span><span>{(feedback?.next.combo ?? trail.combo) > 1 ? `${feedback?.next.combo ?? trail.combo} recall streak` : "Take your time. The forest will wait."}</span></div>
        </section>}

        {stage === "results" && <section className="expedition-panel trail-results" data-testid="trail-results"><span className="trail-result-seal"><TrailEmblem kind={lit === 5 ? "lantern" : "leaf"} /></span><span className="trail-eyebrow">EXPEDITION COMPLETE</span><h2>{lit === 5 ? "Five lanterns. A brighter forest." : "Every encounter is a step forward."}</h2><p>{summary.correct} of {summary.total} encounters recalled without help.{summary.recovered > 0 ? ` You also recovered ${summary.recovered} missed ${summary.recovered === 1 ? "word" : "words"}.` : " Your next reviews are scheduled."}</p><div className="trail-results-stats"><div><strong>{lit}<small>/5</small></strong><span>lanterns lit</span></div><div><strong>+{summary.earned}</strong><span>mon collected</span></div><div><strong>{trail.bestCombo}</strong><span>best recall streak</span></div></div>
          <h3>Your discoveries</h3><div className="trail-discoveries">{frozen.words.map((word) => <div key={word.kanji.c}><span lang="ja">{word.vocab.w}</span><strong lang="ja">{vocabKana(word.vocab)}</strong><small>{word.vocab.m}</small><b>{summary.cards.find((c) => c.c === word.kanji.c)?.correct ? "Recalled independently" : "Keep practising"}</b></div>)}</div>
          <p className="trail-soft-note">Mastery grows through spaced practice. Today, you took another step.</p><div className="trail-result-actions"><Link to="/" className="trail-button trail-button-primary">Back to camp<AppIcon name="arrow" /></Link>{checkpoint !== undefined && <Link to="/run" search={{ gate: checkpoint }} className="trail-button trail-button-quiet">Next: {CHAPTER_NAMES[checkpoint]!.name} seal</Link>}</div>
        </section>}
        <p className="expedition-bottom"><TrailEmblem kind="leaf" /> Small steps make familiar paths.</p>
      </div>
    </main>
    {paused && <PauseDialog resume={() => setPaused(false)} />}
  </div>;
}

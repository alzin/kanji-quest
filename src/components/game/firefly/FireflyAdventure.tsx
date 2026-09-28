import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAccount, openAccountPrompt, deferAutomaticSavePrompts } from "@/lib/account";
import { useSave, getSnapshot, learningLevel, equipRunnerLantern, markRunnerTutorial, vocabKana } from "@/lib/srs";
import { createAdventureDeck, createAdventureLedger, deckWords, finishAdventure, gateContent, isAdventureLedgerCurrent, planGate, recordGate, type AdventureDeck, type AdventureLedger, type PlannedGate } from "@/lib/firefly-learning";
import { runnerOf } from "@/lib/firefly-progress";
import { GATES_PER_ADVENTURE, SPIRITS, STAGES, TRAILS, LANTERNS, type RunnerDifficulty, type SpiritId, type LanternId, type TrailId } from "@/lib/firefly-catalog";
import { useGameMusic } from "@/lib/music";
import { play, unlock } from "@/lib/sfx";
import { SoundToggle } from "../../SoundToggle";
import { MusicToggle } from "../../MusicToggle";
import { WordAudio, primeSpeech, speakReading } from "../../WordAudio";
import { advanceWithGates, burst, chooseLane, chooseTrail, createFireflyState, getFireflyResult, multiplierOf, takeGateResults, type FireflyEntity, type FireflyState, type GateResult } from "./simulation";
import type { FireflyView } from "./FireflyScene";

type Ticket = { deck: AdventureDeck; ledger: AdventureLedger; lantern: LanternId; collected: SpiritId[]; tutorial: boolean };
type Receipt = NonNullable<ReturnType<typeof finishAdventure>>;

const STALL_SECONDS = 1;
let seedSerial = 0;
const nextSeed = () => (Date.now() ^ (++seedSerial * 2654435761)) >>> 0;

export function SpiritMark({ id, hidden = false }: { id: SpiritId; hidden?: boolean }) {
  const spirit = SPIRITS.find(s => s.id === id)!;
  return <span className={`ff-spirit ff-spirit-${spirit.shape} ${hidden ? "ff-spirit-hidden" : ""}`} style={{ "--spirit": spirit.color } as CSSProperties} aria-hidden="true">
    <i /><b /><em />
  </span>;
}

function Panel({ children, label, onClose }: { children: ReactNode; label: string; onClose?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current!; d.showModal(); return () => d.close(); }, []);
  return <dialog ref={ref} className="ff-dialog" aria-label={label} onCancel={e => { e.preventDefault(); onClose?.(); }}>
    {onClose && <button className="ff-close" aria-label="Close" onClick={onClose}>×</button>}{children}
  </dialog>;
}

export function FireflyAdventure() {
  const save = useSave(), progress = runnerOf(save), account = useAccount();
  const [difficulty, setDifficulty] = useState<RunnerDifficulty>("standard");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [drawer, setDrawer] = useState<"collection" | "study" | null>(null);
  // One seed serves both the optional preview and the adventure it leads into.
  const [seed, setSeed] = useState(nextSeed);
  useEffect(() => deferAutomaticSavePrompts(), []);
  useEffect(() => { void import("./FireflyScene").catch(() => { /* Play retains the loading/retry boundary. */ }); }, []);
  const start = () => {
    unlock();
    // Mobile browsers only speak after a tap; this tap unlocks the trail's voice.
    primeSpeech();
    const current = getSnapshot(), runner = runnerOf(current);
    const deck = createAdventureDeck(current, difficulty, seed);
    setDrawer(null);
    setSeed(nextSeed());
    setTicket({ deck, ledger: createAdventureLedger(deck), lantern: runner.equippedLantern, collected: [...runner.rescued], tutorial: !runner.tutorialSeen });
  };
  if (ticket) return <FireflyRun key={ticket.deck.seed} ticket={ticket} onAgain={start} onExit={() => setTicket(null)} />;
  const count = progress.rescued.length, level = learningLevel(save), best = progress.best[level][difficulty];
  const preview = drawer === "study" ? deckWords(createAdventureDeck(save, difficulty, seed)) : [];
  return <main className="ff-shell ff-lobby" aria-label="Firefly Rescue">
    <div className="ff-landscape" aria-hidden="true" />
    <nav className="ff-nav"><Link to="/camp">← Camp</Link><span>LANTERN DASH</span><div><button className="ff-save" onClick={openAccountPrompt}>{account.user ? "My account" : "Save progress"}</button><button onClick={() => setDrawer("collection")}>Spirit journal <b>{count}/9</b></button></div></nav>
    <div className="ff-lobby-content">
      <div className="ff-eyebrow"><span /> A LITTLE LIGHT. A BIG ADVENTURE.</div>
      <h1>Firefly<br /><em>Rescue</em><span lang="ja">灯を、ともに。</span></h1>
      <p className="ff-intro">Somewhere in the forest, a little light is waiting for you.</p>
      <p className="ff-description">Run with Aki and steer by the words.<br />Break the spirit cages. Bring your glowing friends home.</p>
      <div className="ff-mode" role="group" aria-label="Adventure difficulty">
        <button aria-pressed={difficulty === "standard"} onClick={() => setDifficulty("standard")}>Adventure <small>3 hearts</small></button>
        <button aria-pressed={difficulty === "relaxed"} onClick={() => setDifficulty("relaxed")}>Gentle journey <small>5 hearts · slower trail</small></button>
      </div>
      <button className="ff-primary ff-play" onClick={start} disabled={account.prompt}><span>Light the lantern</span><span aria-hidden="true">↗</span></button>
      <div className="ff-play-meta"><span>{GATES_PER_ADVENTURE} word gates · about 2 minutes · {level}</span>{best > 0 && <span>Best {best.toLocaleString()}</span>}</div>
      <button className="ff-text-button" onClick={() => setDrawer("study")}>Meet the words first <span>optional →</span></button>
    </div>
    <div className="ff-lobby-spirit" aria-hidden="true"><SpiritMark id="komorebi" /><span>One more light to bring home.</span></div>
    <footer className="ff-lobby-footer"><span><b>01</b> Steer by the words</span><span><b>02</b> Burst to rescue</span><span><b>03</b> Find your way home</span></footer>
    {drawer === "collection" && <Panel label="Spirit journal" onClose={() => setDrawer(null)}>
      <p className="ff-eyebrow">LITTLE LIGHTS, SAFE AT HOME</p><h2>Your spirit journal</h2><p>{count} of 9 woodland friends found. Bring them to the shrine to keep their stories.</p>
      <div className="ff-collection">{SPIRITS.map(s => <div key={s.id} className={progress.rescued.includes(s.id) ? "found" : ""}><SpiritMark id={s.id} hidden={!progress.rescued.includes(s.id)} /><strong>{progress.rescued.includes(s.id) ? s.name : "Unknown"}</strong><small>{progress.rescued.includes(s.id) ? s.title : STAGES[s.stage].name}</small></div>)}</div>
      <h3>A lantern of your own</h3><div className="ff-lanterns">{LANTERNS.map(l => <button key={l.id} disabled={count < l.required} aria-pressed={l.id === progress.equippedLantern} onClick={() => equipRunnerLantern(l.id)}><i style={{ background: l.color }} /><span>{l.name}<small>{count < l.required ? `Find ${l.required} spirits` : l.id === progress.equippedLantern ? "Equipped" : "Equip"}</small></span></button>)}</div>
    </Panel>}
    {drawer === "study" && <Panel label="Words along the trail" onClose={() => setDrawer(null)}>
      <p className="ff-eyebrow">A MOMENT WITH AKI</p><h2>Words along the trail</h2><p>Take your time. New words are introduced on the trail too, and each one comes back several times.</p>
      <div className="ff-study">{preview.map(w => <div key={w.vocab.w}><strong lang="ja">{w.vocab.w}</strong><span lang="ja">{w.origin === "fresh" ? "New · " : ""}{vocabKana(w.vocab)}</span><small>{w.vocab.m}</small><WordAudio reading={vocabKana(w.vocab)} wordKey={w.vocab.w} autoPlay={false} /></div>)}</div>
      <button className="ff-primary" onClick={start}>I’m ready for the forest →</button>
    </Panel>}
  </main>;
}

function nearestGate(s: FireflyState) {
  return s.events.find(e => e.kind === "gate" && !e.resolved && e.content && e.time - s.elapsed <= s.sight + 1e-6);
}

function snapshot(s: FireflyState) {
  const cage = s.events.some(e => e.kind === "cage" && !e.resolved && e.time - s.elapsed <= 2.4);
  return {
    phase: s.phase, stage: s.stage, time: s.stageTime, elapsed: s.elapsed, hearts: s.hearts, maxHearts: s.maxHearts, charges: s.charges,
    maxCharges: s.maxCharges, recharge: s.recharge, score: s.score, chain: s.chain, rescued: [...s.rescued], shield: s.shield, magnet: s.magnet,
    trails: [...s.trails], lane: s.lane, gate: nearestGate(s)?.gate ?? null, gatesResolved: s.gatesResolved, gatesCorrect: s.gatesCorrect, cage,
    pace: Math.round(s.pace * 10) / 10, streak: s.gateStreak,
  };
}

const CALL_EYEBROW = { intro: "NEW WORD · WALK THROUGH THE LIGHT", reading: "HOW IS IT READ?", listen: "WHICH WORD DID YOU HEAR?" } as const;

function Segments({ gate }: { gate: PlannedGate }) {
  return <>{gate.segments.map((segment, i) => segment.furigana ? <ruby key={i}>{segment.t}<rt>{segment.furigana}</rt></ruby> : <span key={i}>{segment.t}</span>)}</>;
}

/** The last answered word, repeated under the next prompt. */
type Echo = { gate: PlannedGate; correct: boolean; firstMiss: boolean };

/** The prompt for the nearest gate. Its height is fixed so the trail beneath never jumps. */
function LanternCall({ gate, echo, idle, subtitle, badges, progress, paused }: { gate: PlannedGate | undefined; echo: Echo | null; idle: string; subtitle: string; badges: ReactNode; progress: string; paused: boolean }) {
  const mode = gate?.mode;
  const hint = mode === "reading" ? "Steer into the right reading" : mode === "listen" ? "Steer into the word you heard" : "Word gates light up here";
  return <>
    <div className="ff-call-top"><span className="ff-eyebrow">{mode ? CALL_EYEBROW[mode] : idle}</span><span className="ff-call-badges">{badges}<b>{progress}</b></span></div>
    <div className="ff-call-main">
      {!gate && <p className="ff-call-idle">{subtitle}</p>}
      {gate && mode === "intro" && <><strong lang="ja" className="ff-call-word">{gate.vocab.w}</strong><span lang="ja" className="ff-call-kana">{gate.kana}</span></>}
      {gate && mode === "reading" && <strong lang="ja" className="ff-call-word"><Segments gate={gate} /></strong>}
      {gate && mode === "listen" && <strong lang="ja" className="ff-call-word ff-call-heard">{gate.kana}</strong>}
      {gate && (mode === "listen" || mode === "intro") && <WordAudio variant="hud" reading={gate.kana} wordKey={`gate-${gate.index}`} paused={paused} className="ff-call-audio" />}
    </div>
    {gate && mode === "intro"
      ? <p className="ff-call-sub ff-call-meaning"><b>{gate.vocab.m}</b> · {gate.kanji.mn}</p>
      : echo
        ? <p className={`ff-call-sub ff-echo ${echo.correct ? "" : "ff-echo-miss"}`} data-testid="ff-echo"><span aria-hidden="true">{echo.correct ? "✓" : "↺"}</span> <b lang="ja">{echo.gate.vocab.w}</b> <span lang="ja">{echo.gate.kana}</span> · {echo.gate.vocab.m}{!echo.correct && <em>{echo.firstMiss ? " · hearts safe, back soon" : " · back soon"}</em>}</p>
        : <p className="ff-call-sub">{hint}</p>}
  </>;
}

function FireflyRun({ ticket, onAgain, onExit }: { ticket: Ticket; onAgain: () => void; onExit: () => void }) {
  const account = useAccount(), save = useSave();
  const [state] = useState(() => createFireflyState({ seed: ticket.deck.seed, difficulty: ticket.deck.difficulty, collected: ticket.collected }));
  const [hud, setHud] = useState(() => snapshot(state));
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false), [paused, setPaused] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null), [announcement, setAnnouncement] = useState("");
  const [echo, setEcho] = useState<Echo | null>(null);
  const misses = useRef(0);
  const [moved, setMoved] = useState(false), [bursted, setBursted] = useState(false);
  const host = useRef<HTMLDivElement>(null), call = useRef<HTMLElement>(null), gameView = useRef<FireflyView | null>(null);
  const trackTop = useRef(150);
  const control = useRef({ blocked: true, external: false });
  const invalid = !isAdventureLedgerCurrent(ticket.ledger);
  control.current.blocked = !ready || paused || account.prompt || invalid || !!receipt;
  control.current.external = account.prompt || invalid;
  if (gameView.current) gameView.current.paused = control.current.blocked;
  useGameMusic(hud.phase === "running" ? "run" : "shrine", !ready || paused || account.prompt || invalid || !!receipt);
  const refresh = () => setHud(snapshot(state));
  const select = (lane: number) => {
    if (control.current.blocked) return;
    if (chooseLane(state, lane)) { unlock(); play("laneChange"); setMoved(true); refresh(); }
  };
  const doBurst = () => {
    if (control.current.blocked) return;
    if (burst(state)) { unlock(); play("hardDrop"); setBursted(true); refresh(); }
  };
  const actions = useRef({ select, doBurst, togglePause: () => setPaused(p => !p) });
  actions.current = { select, doBurst, togglePause: () => setPaused(p => !p) };
  useEffect(() => {
    if (moved && bursted && ticket.tutorial) markRunnerTutorial();
  }, [moved, bursted, ticket.tutorial]);

  // Pausing or finishing silences any word still being spoken.
  useEffect(() => { if (paused || receipt) window.speechSynthesis?.cancel(); }, [paused, receipt]);

  // The trail emerges just below the lantern call, whatever its rendered height.
  useEffect(() => {
    const banner = call.current, field = host.current;
    if (!banner || !field) return;
    const measure = () => {
      trackTop.current = banner.getBoundingClientRect().bottom - field.getBoundingClientRect().top + 16;
      if (gameView.current) gameView.current.trackTop = trackTop.current;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(banner); observer.observe(field); measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false, game: { destroy: (remove: boolean) => void } | undefined;
    let lastHud = "", lastCue = 0, terminal = false, finishTimer: ReturnType<typeof setTimeout> | undefined;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let feedback: GateResult[] = [];
    // Results are recorded before the next gate is planned, even inside one long frame.
    const flush = () => {
      for (const result of takeGateResults(state)) { recordGate(ticket.ledger, result); feedback.push(result); }
    };
    const provide = (entity: Readonly<FireflyEntity>) => {
      flush();
      const content = gateContent(planGate(ticket.ledger, entity.gate ?? 0));
      void document.fonts?.load('20px "Zen Kaku Gothic New"', content.labels.join("")).catch(() => undefined);
      return content;
    };
    const gateResolved = (result: GateResult) => {
      const gate = ticket.ledger.gates.get(result.gate);
      if (!gate) return;
      if (result.mode === "intro") play("gateIntro");
      else if (result.correct) play(result.charged ? "gateStreak" : "gateHit", { combo: state.gateStreak });
      else { play("gateMiss"); speakReading(gate.kana); }
      if (!result.correct) misses.current++;
      setEcho({ gate, correct: result.correct, firstMiss: !result.correct && misses.current === 1 });
    };
    const view: FireflyView = {
      state, lantern: ticket.lantern, paused: true, reducedMotion: media.matches, trackTop: trackTop.current,
      ready: () => { if (!disposed) { clearTimeout(loadTimer); setReady(true); } },
      tick: (seconds) => {
        if (disposed) return;
        view.paused = control.current.blocked;
        // A sighted gate receives its words within the same frame, then the frame finishes.
        // A stalled frame is discarded like a pause: nobody could see or answer its gates.
        if (!control.current.blocked && seconds <= STALL_SECONDS) advanceWithGates(state, seconds, provide);
        flush();
        const resolved = feedback;
        feedback = [];
        resolved.forEach(gateResolved);
        if (state.lastEvent && state.lastEvent.serial !== lastCue) {
          lastCue = state.lastEvent.serial;
          const cue = state.lastEvent;
          if (cue.kind === "rescue") {
            play("mastered"); setAnnouncement(`${SPIRITS.find(s => s.id === cue.spirit)?.name ?? "A spirit"} rescued!`);
          } else if (cue.kind === "hit") { play("wrong", { hearts: state.hearts }); setAnnouncement("A thorn caught your lantern. Keep going!"); }
          else if (cue.kind === "shield") { play("stamp"); setAnnouncement("Your shield protected the lantern."); }
          else if (cue.kind === "firefly" && state.chain % 10 === 0) play("chain", { combo: multiplierOf(state.chain) });
          else if (cue.kind === "fork") play("sheet");
        }
        const signature = `${Math.floor(state.elapsed * 10)}:${state.phase}:${state.lane}:${state.charges}:${state.score}:${state.gatesResolved}:${nearestGate(state)?.gate}:${state.lastEvent?.serial}`;
        if (signature !== lastHud) {
          lastHud = signature; setHud(snapshot(state));
        }
        if (!terminal && (state.phase === "delivery" || state.phase === "lost")) {
          terminal = true;
          play(state.phase === "delivery" ? "runComplete" : "runEnded");
          // The outcome is final now. The celebration delays presentation only,
          // so leaving or closing during it cannot discard an earned delivery.
          const result = finishAdventure(ticket.ledger, getFireflyResult(state));
          finishTimer = setTimeout(() => {
            if (!disposed && result) setReceipt(result);
          }, state.phase === "delivery" ? 1800 : 650);
        }
      },
    };
    gameView.current = view;
    const loadTimer = setTimeout(() => { if (!disposed) setFailed(true); }, 15000);
    import("./FireflyScene").then(({ mountFirefly }) => {
      if (!disposed && host.current) game = mountFirefly(host.current, view);
    }).catch(() => { if (!disposed) setFailed(true); });
    const motion = () => { view.reducedMotion = media.matches; };
    media.addEventListener("change", motion);
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("dialog, input, select, textarea")) return;
      if (control.current.external) return;
      if (e.key === "Escape") { if (state.phase === "running") { e.preventDefault(); actions.current.togglePause(); } return; }
      if (e.repeat && e.code === "Space") { e.preventDefault(); return; }
      if (["ArrowLeft", "a", "A", "ArrowRight", "d", "D", "1", "2", "3", " "].includes(e.key)) e.preventDefault();
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") actions.current.select(state.lane - 1);
      else if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") actions.current.select(state.lane + 1);
      else if (/^[123]$/.test(e.key)) actions.current.select(Number(e.key) - 1);
      else if (e.code === "Space") actions.current.doBurst();
    };
    const blur = () => { if (state.phase === "running") { control.current.blocked = true; setPaused(true); } };
    const hide = () => { if (document.hidden) blur(); };
    window.addEventListener("keydown", key); window.addEventListener("blur", blur); document.addEventListener("visibilitychange", hide);
    // A read-only development probe supports deterministic browser QA without exposing controls in production.
    const bridge = window as typeof window & { __fireflyInspect?: () => unknown };
    const inspect = () => {
      const gate = nearestGate(state);
      return {
        ...snapshot(state), next: state.events.filter(e => !e.resolved && e.time >= state.elapsed && e.time < state.elapsed + 4).map(e => structuredClone(e)),
        gate: gate?.content ? { id: gate.id, index: gate.gate, mode: gate.content.mode, answer: gate.content.answer, labels: [...gate.content.labels], lead: gate.time - state.elapsed } : null,
        pace: state.pace, graded: ticket.ledger.scheduledGraded, scheduledCorrect: ticket.ledger.scheduledCorrect,
        recalls: ticket.ledger.recalls.map(r => ({ ...r })),
      };
    };
    if (import.meta.env.DEV) bridge.__fireflyInspect = inspect;
    return () => {
      disposed = true; clearTimeout(loadTimer); clearTimeout(finishTimer); game?.destroy(true); gameView.current = null;
      media.removeEventListener("change", motion); window.removeEventListener("keydown", key); window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", hide);
      if (bridge.__fireflyInspect === inspect) delete bridge.__fireflyInspect;
    };
  }, [state, ticket]);

  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const count = runnerOf(save).rescued.length, nextMilestone = [3, 6, 9].find(n => n > count);
  const gate = hud.gate === null ? undefined : ticket.ledger.gates.get(hud.gate);
  const trail = hud.stage === 2 && hud.time >= 24 ? "THE SHRINE IS JUST AHEAD" : hud.trails.length ? TRAILS[hud.trails[hud.trails.length - 1]!].name.toUpperCase() : "FOLLOW THE FIREFLIES";
  const summary = receipt?.summary ?? [];
  const asked = summary.reduce((n, w) => n + w.attempts.length, 0), right = summary.reduce((n, w) => n + w.attempts.filter(Boolean).length, 0);
  const sightings = summary.reduce((n, w) => n + w.attempts.length + Number(w.introduced), 0);
  return <main className="ff-shell ff-playing" data-testid="firefly-adventure">
    <aside className="ff-side ff-side-left" aria-hidden="true"><span>灯</span><p>A little courage.<br />A little light.</p></aside>
    <div className="ff-playfield">
      <div ref={host} className="ff-canvas" role="img" aria-label="A lantern runner steering Aki through word gates and rescuing forest spirits" onPointerDown={e => {
        if (control.current.blocked || state.phase !== "running") return;
        pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId);
      }} onPointerUp={e => {
        const p = pointer.current; pointer.current = null;
        if (!p || p.id !== e.pointerId) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) select(state.lane + (dx > 0 ? 1 : -1));
        else if (Math.abs(dx) < 15 && Math.abs(dy) < 15) select(Math.min(2, Math.max(0, Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.clientWidth * 3))));
      }} onPointerCancel={() => { pointer.current = null; }} />
      <header className="ff-hud">
        <div><span className="ff-eyebrow">{ticket.deck.difficulty === "relaxed" ? "GENTLE JOURNEY" : "FIREFLY RESCUE"}</span><strong>{STAGES[hud.stage].name}</strong></div>
        <button className="ff-pause" aria-label="Pause adventure" disabled={!ready || !!receipt || invalid || hud.phase === "delivery" || hud.phase === "lost"} onClick={() => setPaused(true)}>Ⅱ</button>
        <div className="ff-hearts" aria-label={`${hud.hearts} of ${hud.maxHearts} hearts`}>{Array.from({ length: hud.maxHearts }, (_, i) => <span key={i} className={i < hud.hearts ? "" : "empty"}>♥</span>)}</div>
        <div className="ff-tally"><span aria-label={`${hud.rescued.length} spirits rescued`}>✧ <b>{hud.rescued.length}</b></span><span data-testid="firefly-score">{hud.score.toLocaleString()} <small>×{multiplierOf(hud.chain)}</small></span></div>
        <div className="ff-progress" aria-label={`Stage ${hud.stage + 1} of 3`}>{[0, 1, 2].map(i => <i key={i}><b style={{ transform: `scaleX(${i < hud.stage ? 1 : i === hud.stage ? hud.time / 30 : 0})` }} /></i>)}</div>
      </header>
      <section ref={call} className={`ff-call ff-call-${gate?.mode ?? "idle"} ${ready && hud.phase === "running" && !receipt ? "" : "ff-call-hidden"}`} data-testid="ff-call" data-mode={gate?.mode ?? "idle"} aria-hidden="true">
        <LanternCall gate={gate} echo={echo} paused={paused || !!receipt} idle={trail} subtitle={STAGES[hud.stage].subtitle} progress={`${hud.gatesResolved}/${GATES_PER_ADVENTURE}`}
          badges={<>{hud.streak >= 3 && <i className="ff-call-streak">🔥{hud.streak}</i>}{hud.shield && <i title="Shield">◇</i>}{hud.magnet && <i title="Magnet">✧</i>}<i className="ff-call-pace" data-testid="ff-pace">⚡{hud.pace.toFixed(1)}×</i></>} />
      </section>
      <p className="sr-only" aria-live="polite">{gate ? gate.mode === "intro" ? `New word: ${gate.vocab.w}, read ${gate.kana}, meaning ${gate.vocab.m}.` : `${gate.mode === "reading" ? `How is ${gate.vocab.w} read?` : `Which word is read ${gate.kana}?`} Path 1 ${gate.labels[0]}, path 2 ${gate.labels[1]}, path 3 ${gate.labels[2]}.` : ""}</p>
      {ready && hud.phase === "running" && !receipt && <>
        {ticket.tutorial && hud.stage === 0 && !moved && hud.time < 3.4 && <div className="ff-tutorial" role="status">Swipe or use ← → to change lanes</div>}
        {ticket.tutorial && hud.stage === 0 && hud.cage && !bursted && !hud.rescued.length && <div className="ff-tutorial" role="status">Burst when the golden cage reaches you</div>}
        <footer className="ff-controls">
          <div className="ff-steer"><button aria-label="Move left" onClick={() => select(state.lane - 1)}>←</button><button aria-label="Move right" onClick={() => select(state.lane + 1)}>→</button></div>
          <button className="ff-burst" aria-label={`Lantern Burst, ${hud.charges} charges`} disabled={!hud.charges || paused || account.prompt} onClick={doBurst}><span>✦</span><b>BURST<small>{hud.charges ? `${hud.charges} / ${hud.maxCharges} · SPACE` : `${Math.ceil(12 - hud.recharge)}s to glow`}</small></b><i style={{ transform: `scaleX(${hud.charges ? 1 : hud.recharge / 12})` }} /></button>
        </footer>
      </>}
      <div className="ff-announcement" role="status" key={announcement}>{announcement}</div>
      {hud.phase === "delivery" && !receipt && <div className="ff-delivery"><span>おかえり</span><h2>Welcome home,<br />little lights.</h2></div>}
      {!ready && <div className="ff-loading" role={failed ? "alert" : "status"}><span>灯</span><h2>{failed ? "The trail couldn’t load." : "Waking the fireflies…"}</h2>{failed && <button className="ff-primary" onClick={onExit}>Back to the lantern</button>}</div>}
    </div>
    <aside className="ff-side ff-side-right" aria-hidden="true"><p>THE SPIRIT TRAIL</p><div>{STAGES.map((stage, i) => <span key={stage.name} className={i === hud.stage ? "active" : ""}><i>{stage.kanji}</i>{stage.name}</span>)}</div><small>MOVE ← → / 1 2 3<br />BURST SPACE</small></aside>
    {invalid && <Panel label="Your progress changed"><p className="ff-eyebrow">A FRESH START</p><h2>Your trail has changed.</h2><p>Your account or saved progress changed. Start a new adventure with the current save.</p><button className="ff-primary" onClick={onExit}>Return to the lantern</button></Panel>}
    {!invalid && paused && !receipt && <Panel label="Adventure paused" onClose={() => setPaused(false)}><p className="ff-eyebrow">A QUIET MOMENT</p><h2>Keep the lantern close.</h2><p>Your little friends will wait.</p><button className="ff-primary" onClick={() => setPaused(false)}>Back to the trail →</button><div className="ff-audio"><SoundToggle variant="inline" /><MusicToggle /></div><button className="ff-text-button" onClick={onExit}>Leave this adventure</button></Panel>}
    {!invalid && !paused && !receipt && hud.phase === "fork" && <Panel label="Choose your next trail"><p className="ff-eyebrow">TWO PATHS. YOUR ADVENTURE.</p><h2>Where shall we go?</h2><p>Take a gift from the forest. It stays with you until you reach home.</p><div className="ff-forks">{(hud.stage === 0 ? ["grove", "bramble"] : ["bridge", "moonpath"]).map(id => {
      const trail = TRAILS[id as TrailId]; return <button key={id} onClick={() => { chooseTrail(state, id as TrailId); play("paceUp"); setAnnouncement(`${trail.boon} received · the trail quickens`); refresh(); }}><span className="ff-fork-kanji">{trail.kanji}</span><small>{trail.risk}</small><h3>{trail.name}</h3><b>+ {trail.boon}</b><p>{trail.description}</p><span className="ff-fork-go">Take this path →</span></button>;
    })}</div></Panel>}
    {receipt && <Panel label="Adventure results"><p className="ff-eyebrow">{hud.phase === "delivery" ? "THE FOREST REMEMBERS" : "THERE’S ALWAYS ANOTHER TRAIL"}</p><h2>{hud.phase === "delivery" ? "Every light has a home." : "Rest your lantern."}</h2><p>{hud.phase === "delivery" ? `${hud.rescued.length} little ${hud.rescued.length === 1 ? "spirit followed" : "spirits followed"} you safely to the shrine.` : "The forest kept your friends safe. Try another path and bring them home."}</p>
      <div className="ff-results-spirits">{hud.rescued.map(id => <div key={id}><SpiritMark id={id} /><small>{SPIRITS.find(s => s.id === id)!.name}</small>{receipt.newSpirits.includes(id) && <b>NEW FRIEND</b>}</div>)}{!hud.rescued.length && <div><SpiritMark id="komorebi" hidden /><small>A little light is waiting</small></div>}</div>
      <div className="ff-result-score"><strong>{hud.score.toLocaleString()}</strong><span>{hud.score > receipt.previousBest ? "A NEW PERSONAL BEST" : `BEST ${receipt.best.toLocaleString()}`} · {ticket.deck.difficulty.toUpperCase()}</span></div>
      {summary.length > 0 && <section className="ff-words" data-testid="ff-words" aria-label="Words on this trail">
        <p className="ff-words-total"><b>{summary.length}</b> {summary.length === 1 ? "word" : "words"} · <b>{sightings}</b> sightings · <b>{right}/{asked}</b> right{receipt.earned > 0 && <> · +{receipt.earned} mon</>}</p>
        <div className="ff-words-list">{summary.map(w => <div key={w.word} data-testid="ff-word-row"><b lang="ja">{w.word}</b><span><span lang="ja">{w.kana}</span><small>{w.meaning}</small></span><i role="img" aria-label={`${w.attempts.filter(Boolean).length} of ${w.attempts.length} right`}>{w.attempts.map((ok, i) => <em key={i} className={ok ? "ok" : "miss"} />)}</i>{w.introduced && <strong>NEW</strong>}</div>)}</div>
      </section>}
      <p className="ff-collection-progress">{count}/9 friends found{nextMilestone ? ` · ${nextMilestone - count} more for your next lantern` : " · Every lantern unlocked"}</p>
      <button className="ff-primary" onClick={onAgain}>Run again <span>↗</span></button>
      <button className="ff-text-button" onClick={onExit}>Back to the lantern & spirit journal</button>
    </Panel>}
  </main>;
}

import { useEffect, useRef, useState } from "react";
import { vocabKana, type PromptSegment, type Question } from "@/lib/srs";
import { play, playWhenReady, unlock } from "@/lib/sfx";
import { SoundToggle } from "@/components/SoundToggle";
import {
  advanceEffects, comboTier, createEffects, drawDamageVignette, drawEffectsBehindRunner, drawEffectsFront,
  drawEffectsScenery, drawEffectsUnderGates, drawLastHeartVignette, getBracket, getDecisionTimerBar, getPauseFade,
  getPauseTitle, getRunnerPose, getShake, getStampFor, getSunScale, getWrongMark, isMilestone, measureEcho,
  milestoneKanji, noteResume, setBracketLane, setReducedMotion, spawnCorrect, spawnEcho, spawnFootfall,
  spawnLaneChange, spawnMilestone, spawnWrong, type DrawFonts, type EffectsState,
} from "./effects";
import {
  advanceRunner, COMPACT_CLEAR_SECONDS, createRunnerState, getDecisionX, getGameLayout, getGateOpacity, getGateSpeed,
  getPreviewX, getRunnerRemaining, getRunnerStats, RUNNER_HEARTS, RUNNER_LANES as LANES,
  type GameLayout, type RunnerGate as Gate, type RunnerStats,
} from "./runner-math";

type Props = {
  questions: Question[];
  onAnswer: (q: Question, correct: boolean) => void; // grade + maybe lesson flash
  onFinish: (stats: RunnerStats) => void;
  title: string;
};

const SPAN_GAP = 3;
const TAU = Math.PI * 2;
const INK = "#1c1a17";
const VERMILLION = "#c0392b";
const GOLD = "#d8b24a";
const PAPER = "#f7f2e7";
const STAMP_ROTATION = -8 * (Math.PI / 180);
/** Complete CSS font strings for the effects module (it caches them per size). */
const FONTS: DrawFonts = {
  serif: (px) => `800 ${px}px "Shippori Mincho B1", serif`,
  sans: (px) => `700 ${px}px "Zen Kaku Gothic New", sans-serif`,
};

/** The word as the echo pill shows it: kanji + kana, plus the meaning on meaning questions. */
function echoText(q: Question): string {
  const kana = vocabKana(q.vocab);
  return q.type === "meaning" ? `${q.prompt} ${kana} · ${q.vocab.m}` : `${q.prompt} ${kana}`;
}

/** HUD combo colour tiers: ×1-2 indigo, ×3-4 gold, ×5+ vermillion. */
function comboClass(combo: number): string {
  // Gold is too faint for 16 px text on the paper card, so the ×3-4 tier uses a darker amber.
  return combo >= 5 ? "text-primary" : combo >= 3 ? "text-[#8a6a14]" : "text-accent";
}

export function RunnerGame({ questions, onAnswer, onFinish, title }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ hearts: RUNNER_HEARTS, combo: 0, score: 0, left: questions.length });
  const [announcement, setAnnouncement] = useState("");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const lessonPausedRef = useRef(false);
  const frameTimeRef = useRef<number | null>(null);
  const fxRef = useRef<EffectsState | null>(null);
  const lessonResumeRef = useRef<(() => void) | null>(null);
  const updatePaused = (value: boolean) => {
    // Hidden tabs may suspend animation frames; never charge that gap on resume.
    frameTimeRef.current = performance.now();
    pausedRef.current = lessonPausedRef.current || value;
    setPaused(pausedRef.current);
  };
  // Esc and the pause button: the clapper follows the state we are about to enter (blur/hidden pauses stay silent).
  const togglePause = () => {
    const next = lessonPausedRef.current || !pausedRef.current;
    if (next !== pausedRef.current) {
      // The resume clapper may be the first sound after returning from the background.
      if (next) play("pause"); else playWhenReady("resume");
      if (!next && fxRef.current) noteResume(fxRef.current);
    }
    updatePaused(!pausedRef.current);
  };

  // external pause (lesson flash)
  useEffect(() => {
    (window as any).__kanjiDashPause = (p: boolean) => {
      lessonPausedRef.current = p;
      updatePaused(p);
      if (!p) lessonResumeRef.current?.();
    };
    return () => {
      delete (window as any).__kanjiDashPause;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const initialBounds = canvas.getBoundingClientRect();
    const s = createRunnerState(questions, Math.max(1, initialBounds.width), Math.max(1, initialBounds.height));
    setHud({ hearts: s.hearts, combo: s.combo, score: s.score, left: questions.length });
    // Cosmetic effects: reduced motion is read here (never at render) and followed live.
    let motionQuery: MediaQueryList | null = null;
    try {
      motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      motionQuery = null;
    }
    const fx = createEffects({ reducedMotion: motionQuery?.matches ?? false, seed: 7 });
    fxRef.current = fx;
    const onMotionChange = (event: MediaQueryListEvent) => setReducedMotion(fx, event.matches);
    motionQuery?.addEventListener?.("change", onMotionChange);
    let prevRun = 0;
    let lastMiss: Question | null = null;
    let skyGradient: CanvasGradient | null = null;
    let skyWidth = 0;
    let skyHeight = 0;
    let stampFontPx = 0;
    let stampFont = "";
    const dashBuffer = [0, 0];
    let raf = 0;
    frameTimeRef.current = performance.now();
    let pixelRatio = window.devicePixelRatio || 1;
    let previousWidth = 0;
    let previousHeight = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const width = Math.max(1, r.width);
      const height = Math.max(1, r.height);

      // Preserve each gate's progress toward the player when a phone rotates.
      if (previousWidth > 0 && (Math.abs(width - previousWidth) > 0.5 || Math.abs(height - previousHeight) > 0.5) && s.gates.length) {
        const previousLayout = getGameLayout(previousWidth, previousHeight);
        const nextLayout = getGameLayout(width, height);
        const previousDecisionX = getDecisionX(previousLayout);
        const nextDecisionX = getDecisionX(nextLayout);
        const previousRunway = Math.max(
          1,
          getPreviewX(previousWidth, previousLayout) - previousDecisionX,
        );
        const nextRunway = Math.max(1, getPreviewX(width, nextLayout) - nextDecisionX);
        for (const gate of s.gates) {
          gate.x = nextDecisionX
            + (gate.x - previousDecisionX) * (nextRunway / previousRunway);
        }
      }

      pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      previousWidth = width;
      previousHeight = height;
    };
    resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    // Only a real lane change ticks and flashes, so a tap in the current lane never spams.
    const changeLane = (lane: number, dir: -1 | 1) => {
      if (lane === s.targetLane) return;
      s.targetLane = lane;
      play("laneChange", { dir });
      spawnLaneChange(fx, { dir, lane });
    };
    const moveLane = (dir: -1 | 1) => {
      if (pausedRef.current) return;
      changeLane(Math.max(0, Math.min(LANES - 1, s.targetLane + dir)), dir);
    };
    const onKey = (e: KeyboardEvent) => {
      unlock(); // keydown is user activation
      if (e.key === "Escape") { e.preventDefault(); togglePause(); return; }
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") { e.preventDefault(); moveLane(-1); }
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") { e.preventDefault(); moveLane(1); }
    };
    const onBlur = () => updatePaused(true);
    const onVisibilityChange = () => {
      if (document.hidden) updatePaused(true);
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const onPointer = (e: PointerEvent) => {
      if (pausedRef.current) return; // a lane flash spawned under the pause wash would freeze there
      const r = canvas.getBoundingClientRect();
      const y = e.clientY - r.top;
      const layout = getGameLayout(r.width, r.height);
      const lane = Math.floor(((y - layout.laneTop) / layout.laneSpan) * LANES);
      if (lane >= 0 && lane < LANES) changeLane(lane, lane < s.targetLane ? -1 : 1);
    };
    // pointerdown grants no user activation on touch; the lift does, so it unlocks audio for the next tap.
    const onPointerUp = () => unlock();
    window.addEventListener("keydown", onKey);
    canvas.addEventListener("pointerdown", onPointer);
    canvas.addEventListener("pointerup", onPointerUp);

    const laneY = (lane: number, layout: GameLayout) =>
      layout.laneTop + layout.laneSpan * ((lane + 0.5) / LANES);

    // Echo pill above the runner: measured once at spawn, centre clamped to the canvas, kept off the question panel.
    const spawnWordEcho = (q: Question, score: string, color: "moss" | "vermillion", lifeSeconds: number) => {
      const W = canvas.width / pixelRatio;
      const H = canvas.height / pixelRatio;
      const layout = getGameLayout(W, H);
      const text = echoText(q);
      const m = measureEcho(ctx, FONTS, text, score, Math.min(W - 24, 240));
      const half = m.width / 2;
      const x = Math.max(12 + half, Math.min(W - 12 - half, layout.playerX));
      const y = Math.max(
        laneY(s.lane, layout) - 50,
        layout.compact ? layout.questionTop + layout.questionHeight + 8 : layout.laneTop,
      );
      spawnEcho(fx, { text: m.text, score: m.score, width: m.width, fontPx: m.fontPx, x, y, color, lifeSeconds });
    };
    lessonResumeRef.current = () => {
      // "Keep running": re-expose the missed word in vermillion and lean into the next gate.
      if (lastMiss) spawnWordEcho(lastMiss, "", "vermillion", 1.2);
      lastMiss = null;
      noteResume(fx);
    };

    // 「 」 lock-in brackets: two 14 px L strokes, `inset` px outside the sign rectangle.
    const drawBrackets = (x0: number, y0: number, x1: number, y1: number, inset: number) => {
      ctx.strokeStyle = VERMILLION;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x0 - inset + 14, y0 - inset);
      ctx.lineTo(x0 - inset, y0 - inset);
      ctx.lineTo(x0 - inset, y0 - inset + 14);
      ctx.moveTo(x1 + inset - 14, y1 + inset);
      ctx.lineTo(x1 + inset, y1 + inset);
      ctx.lineTo(x1 + inset, y1 + inset - 14);
      ctx.stroke();
    };

    // Vermillion 印 stamp: circle, paper inner ring and the kanji, rotated -8° and scaled about (cx, cy).
    const drawStamp = (cx: number, cy: number, r: number, scale: number, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy);
      ctx.rotate(STAMP_ROTATION);
      ctx.scale(scale, scale);
      ctx.fillStyle = VERMILLION;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, r - 4.5, 0, TAU);
      ctx.stroke();
      const px = Math.round(r * 1.1);
      if (px !== stampFontPx) {
        stampFontPx = px;
        stampFont = FONTS.serif(px);
      }
      ctx.font = stampFont;
      ctx.fillStyle = PAPER;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("印", 0, 1);
      ctx.restore();
    };

    // Brush × over the chosen sign: each stroke is revealed with a line dash over 60 ms of gate.sinceResolved.
    const drawCross = (cx: number, cy: number, half: number, since: number, instant: boolean) => {
      const length = half * 2 * Math.SQRT2;
      const p1 = instant ? 1 : Math.min(1, since / 0.06);
      const p2 = instant ? 1 : Math.max(0, Math.min(1, (since - 0.06) / 0.06));
      if (p1 <= 0) return;
      ctx.strokeStyle = VERMILLION;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      if (p1 < 1) {
        dashBuffer[0] = length * p1;
        dashBuffer[1] = length;
        ctx.setLineDash(dashBuffer);
      }
      ctx.beginPath();
      ctx.moveTo(cx - half, cy - half);
      ctx.lineTo(cx + half, cy + half);
      ctx.stroke();
      if (p2 > 0) {
        if (p2 < 1) {
          dashBuffer[0] = length * p2;
          dashBuffer[1] = length;
          ctx.setLineDash(dashBuffer);
        } else if (p1 < 1) {
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.moveTo(cx + half, cy - half);
        ctx.lineTo(cx - half, cy + half);
        ctx.stroke();
      }
      if (p1 < 1 || p2 < 1) ctx.setLineDash([]);
      ctx.lineCap = "butt";
    };

    // Gold outline (4 -> 1.5 px, alpha .9 -> 0) and a small ○ at the left edge of the sign that was right.
    const drawCorrectOutline = (x0: number, y0: number, w: number, h: number, since: number, window: number, instant: boolean) => {
      const u = instant ? 0 : Math.min(1, since / window);
      const alpha = 0.9 * (1 - u);
      if (alpha <= 0.01) return;
      const base = ctx.globalAlpha;
      ctx.globalAlpha = base * alpha;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 4 - 2.5 * u;
      roundRect(ctx, x0 - 3, y0 - 3, w + 6, h + 6, 10);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x0 + 10, y0 + h / 2, 5, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = base;
    };

    let finishReported = false;
    const finish = () => {
      if (finishReported) return;
      finishReported = true;
      onFinish(getRunnerStats(s));
    };

    const frame = (t: number) => {
      const dt = Math.max(0, (t - (frameTimeRef.current ?? t)) / 1000);
      frameTimeRef.current = t;
      const W = canvas.width / pixelRatio;
      const H = canvas.height / pixelRatio;
      const layout = getGameLayout(W, H);
      // Effects advance on wall-clock dt (clamped inside) so a miss shake finishes under the lesson blur;
      // the shake is a canvas transform only, so the element's box never moves.
      advanceEffects(fx, dt, pausedRef.current);
      const shake = getShake(fx);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, shake.x * pixelRatio, shake.y * pixelRatio);

      if (!pausedRef.current && !s.done) {
        advanceRunner(s, questions, W, H, dt, (question, correct) => {
          const gate = s.gates.find((g) => g.q === question);
          const chosenLane = Math.round(s.lane);
          const kana = vocabKana(question.vocab);
          if (correct) {
            play("correct", { combo: s.combo });
            const milestone = isMilestone(s.combo);
            if (milestone) {
              play("comboMilestone", { combo: s.combo });
              spawnMilestone(fx, s.combo);
            }
            if (gate) spawnCorrect(fx, { x: layout.playerX, y: laneY(gate.correctLane, layout), gate, combo: s.combo });
            spawnWordEcho(question, s.combo >= 2 ? `+${100 * s.combo} ×${s.combo}` : "+100", "moss", 0.9);
            setAnnouncement(milestone ? `Correct: ${kana}. ${s.combo} in a row!` : `Correct: ${kana}`);
          } else {
            play("wrong", { hearts: s.hearts });
            if (gate) spawnWrong(fx, { x: layout.playerX, y: laneY(chosenLane, layout), gate, chosenLane });
            lastMiss = question;
            setAnnouncement(`Missed. The answer was ${question.answer}`);
          }
          onAnswer(question, correct);
          setHud({
            hearts: s.hearts, combo: s.combo, score: s.score,
            left: getRunnerRemaining(s, questions.length),
          });
          return !pausedRef.current;
        });
      }
      if (s.done) finish();

      // ---------- render ----------
      // sky (washi paper wash), cached per size and overdrawn 8 px so the shake never shows the canvas edge
      if (!skyGradient || skyWidth !== W || skyHeight !== H) {
        skyGradient = ctx.createLinearGradient(0, 0, 0, H);
        skyGradient.addColorStop(0, "#f3ead8");
        skyGradient.addColorStop(0.7, "#efe2c8");
        skyGradient.addColorStop(1, "#e8d7b8");
        skyWidth = W;
        skyHeight = H;
      }
      ctx.fillStyle = skyGradient;
      ctx.fillRect(-8, -8, W + 16, H + 16);

      // sun (vermillion hanko circle; breathes on a combo milestone)
      const sunX = W * 0.78;
      const sunY = H * 0.16;
      const sunR = H * 0.075 * getSunScale(fx);
      ctx.fillStyle = VERMILLION;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;

      // parallax mountains
      const drawHills = (speed: number, color: string, base: number, amp: number) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, H);
        const off = (s.dist * speed) % 400;
        for (let x = -400; x <= W + 400; x += 400) {
          const px = x - off;
          ctx.lineTo(px, base);
          ctx.lineTo(px + 200, base - amp);
          ctx.lineTo(px + 400, base);
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fill();
      };
      drawHills(0.15, "#b9c4b1", H * 0.5, H * 0.16);
      drawHills(0.3, "#8fa08b", H * 0.58, H * 0.12);
      // speed lines, milestone sun rays and the desktop milestone seal live in the sky band
      drawEffectsScenery(ctx, fx, { W, H, compact: layout.compact, sunX, sunY, sunR, fonts: FONTS });

      // ground (overdrawn 8 px for the shake)
      const groundY = Math.min(H, layout.laneBottom + (layout.compact ? 10 : 30));
      ctx.fillStyle = "#d9c9a3";
      ctx.fillRect(-8, groundY, W + 16, H - groundY + 8);
      ctx.fillStyle = "#c9b78d";
      const goff = s.dist % 60;
      for (let x = -60; x < W + 60; x += 60) {
        ctx.fillRect(x - goff, groundY + 4, 24, 4);
      }

      // torii decoration passing by
      const toriiOff = (s.dist * 0.9) % 900;
      for (let x = -900; x < W + 900; x += 900) {
        const px = x - toriiOff;
        const gy = groundY;
        ctx.fillStyle = "#b03a2e";
        ctx.fillRect(px, gy - 130, 8, 130);
        ctx.fillRect(px + 62, gy - 130, 8, 130);
        ctx.fillRect(px - 12, gy - 140, 104, 10);
        ctx.fillRect(px - 4, gy - 116, 88, 7);
      }

      // lanes
      for (let l = 0; l < LANES; l++) {
        const y = laneY(l, layout);
        ctx.strokeStyle = "rgba(60,50,30,0.25)";
        ctx.setLineDash([14, 18]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, y + layout.signHeight / 2);
        ctx.lineTo(W, y + layout.signHeight / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // lane tap flash band and the word echo pill (behind the signs, so an incoming sign occludes them)
      drawEffectsUnderGates(ctx, fx, layout, W, FONTS);

      // gates
      const activeGate = s.gates
        .filter((g) => g.resolved === -1)
        .reduce<Gate | null>((nearest, g) => (!nearest || g.x < nearest.x ? g : nearest), null);

      const wordFont = (size: number) => `800 ${size}px "Shippori Mincho B1", serif`;
      const rubyFont = (size: number) => `700 ${size}px "Zen Kaku Gothic New", sans-serif`;

      // A span is as wide as its kanji or its furigana, whichever needs more room.
      const measureWord = (segments: PromptSegment[], wordSize: number, rubySize: number) => {
        const widths = segments.map((segment) => {
          ctx.font = wordFont(wordSize);
          const base = ctx.measureText(segment.t).width;
          ctx.font = rubyFont(rubySize);
          const ruby = segment.furigana ? ctx.measureText(segment.furigana).width : 0;
          return Math.max(base, ruby) + SPAN_GAP;
        });
        return { widths, total: widths.reduce((sum, value) => sum + value, 0) };
      };

      const drawQuestion = (g: Gate, x: number, y: number, width: number, height: number) => {
        ctx.fillStyle = "rgba(28,26,23,0.9)";
        roundRect(ctx, x - width / 2, y, width, height, 10);
        ctx.fill();

        const pad = height * 0.07;
        const helperFontSize = Math.max(10, Math.min(layout.compact ? 12 : 13, height * 0.15));
        const hasRuby = g.q.segments.some((segment) => segment.furigana);
        const rubySize = hasRuby ? Math.max(8, Math.min(13, height * 0.16)) : 0;
        const rubyGap = hasRuby ? 2 : 0;
        let wordSize = Math.max(
          14,
          Math.min(layout.compact ? 40 : 54, height - pad * 2 - rubySize - rubyGap - helperFontSize - 4),
        );

        // Long words shrink rather than spill past the panel.
        const maxWidth = width - 16;
        let measured = measureWord(g.q.segments, wordSize, rubySize);
        while (measured.total > maxWidth && wordSize > 12) {
          wordSize -= 1;
          measured = measureWord(g.q.segments, wordSize, rubySize);
        }

        const rubyBaseline = y + pad + rubySize;
        const wordBaseline = rubyBaseline + rubyGap + wordSize * 0.82;
        let spanX = x - measured.total / 2;
        g.q.segments.forEach((segment, i) => {
          const spanWidth = measured.widths[i]!;
          const center = spanX + spanWidth / 2;
          if (segment.focus) {
            ctx.fillStyle = "rgba(216,178,74,0.2)";
            roundRect(
              ctx,
              center - spanWidth / 2 + 1,
              wordBaseline - wordSize * 0.86,
              spanWidth - 2,
              wordSize * 1.06,
              5,
            );
            ctx.fill();
          }
          if (segment.furigana) {
            ctx.font = rubyFont(rubySize);
            ctx.fillStyle = "rgba(247,242,231,0.66)";
            ctx.fillText(segment.furigana, center, rubyBaseline);
          }
          ctx.font = wordFont(wordSize);
          ctx.fillStyle = segment.focus ? "#f0c469" : "#f7f2e7";
          ctx.fillText(segment.t, center, wordBaseline);
          spanX += spanWidth;
        });

        ctx.font = rubyFont(helperFontSize);
        ctx.fillStyle = "#d8b24a";
        ctx.fillText(g.q.sub, x, y + height - pad, width - 12);
      };

      ctx.textAlign = "center";
      // Lock-in: the brackets follow the runner's lane while the next gate is within 0.6 s of the decision line.
      const decisionX = getDecisionX(layout);
      const tLeft = activeGate ? (activeGate.x - decisionX) / getGateSpeed(W, layout) : Infinity;
      const bracketLane = Math.round(s.lane);
      setBracketLane(fx, bracketLane, activeGate !== null && tLeft <= 0.6);
      const bracket = getBracket(fx);
      if (layout.compact && activeGate) {
        const panelW = Math.min(226, W - 24);
        drawQuestion(activeGate, W / 2, layout.questionTop, panelW, layout.questionHeight);
        if (tLeft <= 1.5) {
          // decision timer: a gold bar shrinking under the panel tells WHEN; the brackets tell WHICH
          ctx.fillStyle = GOLD;
          ctx.fillRect(W / 2 - panelW / 2, layout.questionTop + layout.questionHeight + 1, panelW * getDecisionTimerBar(fx, tLeft), 3);
          ctx.strokeStyle = INK;
          ctx.globalAlpha = 0.12;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 6]);
          ctx.beginPath();
          ctx.moveTo(decisionX, layout.laneTop);
          ctx.lineTo(decisionX, layout.laneBottom);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          ctx.fillStyle = VERMILLION;
          ctx.beginPath();
          ctx.moveTo(decisionX - 3.5, layout.laneTop - 7);
          ctx.lineTo(decisionX + 3.5, layout.laneTop - 7);
          ctx.lineTo(decisionX, layout.laneTop - 1);
          ctx.closePath();
          ctx.fill();
        }
      }

      for (const g of s.gates) {
        // On compact screens, reveal one moving decision at a time.
        if (layout.compact && g.resolved === -1 && g !== activeGate) continue;
        const bx = g.x;
        if (!layout.compact) {
          drawQuestion(g, bx, layout.questionTop, 240, layout.questionHeight);
        }

        const gateAlpha = getGateOpacity(g, layout);
        const stamp = g.resolved === 1 ? getStampFor(fx, g) : null;
        const wrongMark = g.resolved === 0 ? getWrongMark(fx, g) : null;
        const locking = bracket !== null && g === activeGate;
        // lane signposts (a finished gate fades away on phones)
        ctx.globalAlpha = gateAlpha;
        for (let l = 0; l < LANES; l++) {
          const choice = g.laneChoices[l];
          if (choice == null) continue;
          const y = laneY(l, layout);
          const isCorrect = g.resolved === 1 && l === g.correctLane;
          const isWrong = g.resolved === 0 && l === g.correctLane;
          const x0 = bx - layout.signWidth / 2;
          const y0 = y - layout.signHeight / 2;
          // The locking sign grows 5%; the stamped sign squashes under the slam. Both scale about the centre.
          let sx = 1;
          let sy = 1;
          if (locking && bracket && l === bracketLane) {
            sx = bracket.signScale;
            sy = bracket.signScale;
          } else if (stamp && isCorrect) {
            sx = stamp.signSquash.sx;
            sy = stamp.signSquash.sy;
          }
          const scaled = sx !== 1 || sy !== 1;
          if (scaled) {
            ctx.save();
            ctx.translate(bx, y);
            ctx.scale(sx, sy);
            ctx.translate(-bx, -y);
          }
          ctx.fillStyle =
            g.resolved === -1 ? "#fdfaf2" : isCorrect ? "#4a7c59" : isWrong ? "#4a7c59" : "#e8dcc0";
          ctx.strokeStyle = g.resolved === -1 ? "#8a7a55" : isCorrect || isWrong ? "#2e5238" : "#b5a67f";
          ctx.lineWidth = 2.5;
          roundRect(ctx, x0, y0, layout.signWidth, layout.signHeight, 8);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = g.resolved === -1 ? "#1c1a17" : isCorrect || isWrong ? "#f7f2e7" : "#6b5d40";
          let fontSize = choice.length > 14 ? 13 : choice.length > 8 ? 16 : 20;
          ctx.font = `700 ${fontSize}px "Zen Kaku Gothic New", "Shippori Mincho B1", sans-serif`;
          while (fontSize > 10 && ctx.measureText(choice).width > layout.signWidth - 18) {
            fontSize -= 1;
            ctx.font = `700 ${fontSize}px "Zen Kaku Gothic New", "Shippori Mincho B1", sans-serif`;
          }
          ctx.fillText(choice, bx, y + fontSize * 0.32, layout.signWidth - 16);
          if (locking && bracket && l === bracketLane) {
            drawBrackets(x0, y0, x0 + layout.signWidth, y0 + layout.signHeight, bracket.inset);
          }
          if (scaled) ctx.restore();

          if (stamp && isCorrect) {
            drawStamp(bx + layout.signWidth * 0.28, y, layout.signHeight * 0.55, stamp.scale, stamp.alpha * (layout.compact ? gateAlpha : 1));
          }
          if (wrongMark && l === wrongMark.chosenLane) {
            // The lesson pause freezes sinceResolved at 0, so draw the × instantly under the blur.
            drawCross(bx, y, Math.min(16, layout.signHeight * 0.36), g.sinceResolved, fx.reducedMotion || pausedRef.current);
          }
          if (isWrong) {
            drawCorrectOutline(
              x0, y0, layout.signWidth, layout.signHeight, g.sinceResolved,
              Math.min(0.6, layout.compact ? COMPACT_CLEAR_SECONDS : 0.6), fx.reducedMotion,
            );
          }
        }
        ctx.globalAlpha = 1;
      }

      // player: ink runner blob
      const px = layout.playerX;
      const py = laneY(s.lane, layout);
      const run = Math.sin(s.dist * 0.05);
      if (run * prevRun < 0) spawnFootfall(fx, px - 10, py + 22); // foot plant on each stride zero crossing
      prevRun = run;
      drawEffectsBehindRunner(ctx, fx, { px, py, combo: s.combo });
      const pose = getRunnerPose(fx, run, s.targetLane - s.lane);
      ctx.save();
      ctx.translate(px, py + pose.dy);
      ctx.rotate(pose.rot);
      ctx.scale(pose.sx, pose.sy);
      ctx.translate(-px, -py);
      if (s.bump > 0 && fx.reducedMotion) {
        // the hop replaces this flat pulse unless motion is reduced
        ctx.fillStyle = `rgba(74,124,89,${s.bump})`;
        ctx.beginPath();
        ctx.arc(px, py, 44, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(px, py - 8, 16, 0, TAU); // body
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px + 10, py - 26, 9, 0, TAU); // head
      ctx.fill();
      // headband (vermillion; the tail whips longer from combo tier 2)
      ctx.strokeStyle = VERMILLION;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(px + 2, py - 30);
      ctx.lineTo(px + 18, py - 30);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px + 1, py - 30);
      ctx.lineTo(comboTier(s.combo) >= 2 ? px - 20 - run * 6 : px - 14 - run * 4, py - 36);
      ctx.stroke();
      // legs
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.moveTo(px, py + 4);
      ctx.lineTo(px + run * 14, py + 24);
      ctx.moveTo(px, py + 4);
      ctx.lineTo(px - run * 14, py + 24);
      ctx.stroke();
      ctx.restore();

      // damage: a short wash then an edge vignette; last heart: a breathing edge
      drawDamageVignette(ctx, fx, W, H, s.flash);
      if (s.hearts <= 1) drawLastHeartVignette(ctx, fx, W, H);
      // footfall dust and ink/gold particles
      drawEffectsFront(ctx, fx, W, H);

      // pause overlay (fades in over 150 ms; hiding is instant)
      if (pausedRef.current && !s.done) {
        const fade = getPauseFade(fx);
        const pauseTitle = getPauseTitle(fx);
        ctx.fillStyle = "#000000";
        ctx.globalAlpha = 0.45 * fade;
        ctx.fillRect(-8, -8, W + 16, H + 16);
        ctx.globalAlpha = fade;
        ctx.fillStyle = "#f3ead8";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.save();
        ctx.translate(W / 2, H / 2 - H * 0.06);
        ctx.rotate(pauseTitle.rot);
        ctx.scale(pauseTitle.scale, pauseTitle.scale);
        ctx.font = `bold ${H * 0.07}px serif`;
        ctx.fillText("一時停止", 0, 0);
        ctx.restore();
        ctx.font = `${H * 0.03}px sans-serif`;
        ctx.fillText(layout.compact ? "Tap ▶ to resume" : "Press Esc to resume", W / 2, H / 2 + H * 0.04);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("pointerdown", onPointer);
      canvas.removeEventListener("pointerup", onPointerUp);
      motionQuery?.removeEventListener?.("change", onMotionChange);
      fxRef.current = null;
      lessonResumeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full touch-none" aria-label="Kanji runner game" />
      {/* HUD */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-1.5 p-2 sm:justify-between sm:gap-2 sm:p-4"
      >
        <div className="min-w-0 flex-1 rounded-lg border border-border bg-card/90 px-2.5 py-1.5 shadow-sm backdrop-blur sm:flex-none sm:px-3 sm:py-2">
          <div className="line-clamp-2 text-[9px] font-bold uppercase leading-tight tracking-widest text-muted-foreground sm:text-[10px]">{title}</div>
          <div className="mt-1 flex items-center gap-1.5 text-base leading-none sm:mt-0 sm:gap-2 sm:text-lg">
            {Array.from({ length: RUNNER_HEARTS }).map((_, i) => (
              // heart-out plays once when a heart flips to the border colour; heart-last breathes on the final heart
              <span key={i} className={i < hud.hearts ? (hud.hearts === 1 ? "text-primary heart-last" : "text-primary") : "text-border heart-out"}>♥</span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5 sm:gap-2">
          <div className={`relative rounded-lg border border-border bg-card/90 px-2 py-1.5 text-right shadow-sm backdrop-blur sm:px-3 sm:py-2${isMilestone(hud.combo) ? " hud-glow" : ""}`}>
            <div className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground sm:text-[10px]">Combo</div>
            {/* keyed so the pop replays on every change; the text stays exactly ×N with no child elements */}
            <div key={hud.combo} className={`font-serif text-base font-bold leading-tight sm:text-lg ${comboClass(hud.combo)}${hud.combo > 0 ? " hud-pop" : ""}`}>×{hud.combo}</div>
            {isMilestone(hud.combo) && (
              <span key={`tag-${hud.combo}`} aria-hidden className="combo-tag">{milestoneKanji(hud.combo)}連</span>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card/90 px-2 py-1.5 text-right shadow-sm backdrop-blur sm:px-3 sm:py-2">
            <div className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground sm:text-[10px]">Score</div>
            <div key={hud.score} className={`font-serif text-base font-bold leading-tight sm:text-lg${hud.score > 0 ? " score-tick" : ""}`}>{hud.score.toLocaleString()}</div>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={togglePause}
        aria-label={paused ? "Resume game" : "Pause game"}
        aria-pressed={paused}
        className="absolute bottom-2 left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-paper/30 bg-ink/80 text-lg font-bold text-paper shadow backdrop-blur sm:bottom-4 sm:left-4"
      >
        {paused ? "▶" : "Ⅱ"}
      </button>
      <div
        className="pointer-events-none absolute inset-x-14 bottom-2 flex justify-center px-1 sm:inset-x-16 sm:bottom-4"
      >
        <div className="max-w-full rounded-full bg-ink/70 px-3 py-1.5 text-center text-[11px] font-bold text-paper sm:px-4 sm:text-xs">
          <span className="mr-2">{hud.left} left</span>
          <span className="sm:hidden">Tap a lane to answer</span>
          <span className="hidden sm:inline">↑ ↓ / W S to change lane · tap a lane on touch · Esc to pause</span>
        </div>
      </div>
      <SoundToggle variant="hud" className="absolute bottom-2 right-2 z-10 sm:bottom-4 sm:right-4" />
      {/* one live region for answers and milestones (updated once per answer) */}
      <div role="status" className="sr-only">{announcement}</div>
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

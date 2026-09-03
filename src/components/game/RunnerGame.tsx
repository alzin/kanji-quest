import { useEffect, useRef, useState } from "react";
import type { Question } from "@/lib/srs";

type Props = {
  questions: Question[];
  onAnswer: (q: Question, correct: boolean) => void; // grade + maybe lesson flash
  onFinish: (stats: { correct: number; wrong: number; bestCombo: number }) => void;
  title: string;
};

type Gate = {
  q: Question;
  x: number; // world px of the decision line
  correctLane: number;
  laneChoices: (string | null)[]; // per lane
  resolved: -1 | 0 | 1; // -1 pending, 0 wrong, 1 correct
};

const LANES = 3;
const GATE_SPACING = 560;
const SPEED = 300; // px/s

export function RunnerGame({ questions, onAnswer, onFinish, title }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ hearts: 3, combo: 0, score: 0, left: questions.length });
  const [paused, setPaused] = useState(false);
  const stateRef = useRef({
    lane: 1,
    targetLane: 1,
    hearts: 3,
    combo: 0,
    bestCombo: 0,
    score: 0,
    dist: 0,
    qi: 0,
    gates: [] as Gate[],
    done: false,
    flash: 0, // red flash timer
    bump: 0, // correct answer glow
  });
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  // external pause (lesson flash)
  useEffect(() => {
    (window as any).__kanjiDashPause = (p: boolean) => setPaused(p);
    return () => {
      delete (window as any).__kanjiDashPause;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * devicePixelRatio;
      canvas.height = r.height * devicePixelRatio;
    };
    resize();
    window.addEventListener("resize", resize);

    const spawnGate = (qi: number, startX: number): Gate | null => {
      if (qi >= questions.length) return null;
      const q = questions[qi];
      const order = [0, 1, 2].sort(() => Math.random() - 0.5);
      const laneChoices: (string | null)[] = [null, null, null];
      let correctLane = 0;
      order.forEach((lane, i) => {
        laneChoices[lane] = q.choices[i];
        if (q.choices[i] === q.answer) correctLane = lane;
      });
      return { q, x: startX, correctLane, laneChoices, resolved: -1 };
    };

    const s = stateRef.current;
    s.gates = [];
    let nextX = 700;
    for (let i = 0; i < 3; i++) {
      const g = spawnGate(s.qi, nextX);
      if (g) s.gates.push(g);
      s.qi++;
      nextX += GATE_SPACING;
    }

    const moveLane = (dir: number) => {
      s.targetLane = Math.max(0, Math.min(LANES - 1, s.targetLane + dir));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") { e.preventDefault(); moveLane(-1); }
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") { e.preventDefault(); moveLane(1); }
    };
    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const y = (e.clientY - r.top) / r.height;
      const laneH = 0.62; // lanes occupy middle band
      const top = 0.24;
      const lane = Math.floor(((y - top) / laneH) * LANES);
      if (lane >= 0 && lane < LANES) s.targetLane = lane;
    };
    window.addEventListener("keydown", onKey);
    canvas.addEventListener("pointerdown", onPointer);

    const laneY = (lane: number, h: number) => h * 0.24 + h * 0.62 * ((lane + 0.5) / LANES);

    const finish = () => {
      if (s.done) return;
      s.done = true;
      onFinish({ correct: s.score > 0 ? Math.round(s.score / 100) : 0, wrong: 3 - s.hearts + (s.hearts <= 0 ? 0 : 0), bestCombo: s.bestCombo });
    };

    const frame = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      const W = canvas.width / devicePixelRatio;
      const H = canvas.height / devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

      if (!pausedRef.current && !s.done) {
        s.dist += SPEED * dt;
        s.lane += (s.targetLane - s.lane) * Math.min(1, dt * 14);
        s.flash = Math.max(0, s.flash - dt);
        s.bump = Math.max(0, s.bump - dt);

        // scroll gates
        for (const g of s.gates) g.x -= SPEED * dt;

        const playerX = W * 0.22;
        for (const g of s.gates) {
          if (g.resolved === -1 && g.x <= playerX) {
            const lane = Math.round(s.lane);
            const correct = lane === g.correctLane;
            g.resolved = correct ? 1 : 0;
            if (correct) {
              s.combo += 1;
              s.bestCombo = Math.max(s.bestCombo, s.combo);
              s.score += 100 * Math.max(1, s.combo);
              s.bump = 0.5;
            } else {
              s.combo = 0;
              s.hearts -= 1;
              s.flash = 0.6;
            }
            onAnswer(g.q, correct);
            setHud({ hearts: s.hearts, combo: s.combo, score: s.score, left: questions.length - (s.qi - s.gates.filter((x) => x.resolved === -1).length) });
          }
        }

        // remove passed gates, spawn new
        s.gates = s.gates.filter((g) => g.x > -200);
        const lastGateX = s.gates.length ? Math.max(...s.gates.map((g) => g.x)) : 300;
        while (s.qi < questions.length && s.gates.length < 3) {
          const g = spawnGate(s.qi, lastGateX + GATE_SPACING * (s.gates.length ? 1 : 1));
          if (g) s.gates.push(g);
          s.qi++;
          if (s.gates.length) break;
        }
        if (s.qi >= questions.length && s.gates.length === 0) finish();
        if (s.hearts <= 0) finish();
      }

      // ---------- render ----------
      // sky (washi paper wash)
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#f3ead8");
      sky.addColorStop(0.7, "#efe2c8");
      sky.addColorStop(1, "#e8d7b8");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // sun (vermillion hanko circle)
      ctx.fillStyle = "#c0392b";
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(W * 0.78, H * 0.16, H * 0.075, 0, Math.PI * 2);
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

      // ground
      ctx.fillStyle = "#d9c9a3";
      ctx.fillRect(0, H * 0.24 + H * 0.62 + 30, W, H);
      ctx.fillStyle = "#c9b78d";
      const goff = s.dist % 60;
      for (let x = -60; x < W + 60; x += 60) {
        ctx.fillRect(x - goff, H * 0.24 + H * 0.62 + 34, 24, 4);
      }

      // torii decoration passing by
      const toriiOff = (s.dist * 0.9) % 900;
      for (let x = -900; x < W + 900; x += 900) {
        const px = x - toriiOff;
        const gy = H * 0.24 + H * 0.62 + 30;
        ctx.fillStyle = "#b03a2e";
        ctx.fillRect(px, gy - 130, 8, 130);
        ctx.fillRect(px + 62, gy - 130, 8, 130);
        ctx.fillRect(px - 12, gy - 140, 104, 10);
        ctx.fillRect(px - 4, gy - 116, 88, 7);
      }

      // lanes
      for (let l = 0; l < LANES; l++) {
        const y = laneY(l, H);
        ctx.strokeStyle = "rgba(60,50,30,0.25)";
        ctx.setLineDash([14, 18]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, y + 26);
        ctx.lineTo(W, y + 26);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // gates
      ctx.textAlign = "center";
      for (const g of s.gates) {
        // question banner above lanes
        const bx = g.x;
        ctx.fillStyle = "rgba(28,26,23,0.88)";
        roundRect(ctx, bx - 70, H * 0.03, 140, H * 0.16, 10);
        ctx.fill();
        ctx.fillStyle = "#f7f2e7";
        ctx.font = `800 ${Math.min(54, H * 0.09)}px "Shippori Mincho B1", serif`;
        ctx.fillText(g.q.prompt, bx, H * 0.125);
        ctx.font = `700 ${Math.min(13, H * 0.022)}px "Zen Kaku Gothic New", sans-serif`;
        ctx.fillStyle = "#d8b24a";
        ctx.fillText(g.q.sub, bx, H * 0.165);

        // lane signposts
        for (let l = 0; l < LANES; l++) {
          const choice = g.laneChoices[l];
          if (choice == null) continue;
          const y = laneY(l, H);
          const isCorrect = g.resolved === 1 && l === g.correctLane;
          const isWrong = g.resolved === 0 && l === g.correctLane;
          ctx.fillStyle =
            g.resolved === -1 ? "#fdfaf2" : isCorrect ? "#4a7c59" : isWrong ? "#4a7c59" : "#e8dcc0";
          ctx.strokeStyle = g.resolved === -1 ? "#8a7a55" : isCorrect || isWrong ? "#2e5238" : "#b5a67f";
          ctx.lineWidth = 2.5;
          roundRect(ctx, bx - 95, y - 26, 190, 52, 8);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = g.resolved === -1 ? "#1c1a17" : isCorrect || isWrong ? "#f7f2e7" : "#6b5d40";
          const fontSize = choice.length > 14 ? 13 : choice.length > 8 ? 16 : 20;
          ctx.font = `700 ${fontSize}px "Zen Kaku Gothic New", "Shippori Mincho B1", sans-serif`;
          ctx.fillText(choice, bx, y + 6);
        }
      }

      // player: ink runner blob
      const px = W * 0.22;
      const py = laneY(s.lane, H);
      const run = Math.sin(s.dist * 0.05);
      if (s.bump > 0) {
        ctx.fillStyle = `rgba(74,124,89,${s.bump})`;
        ctx.beginPath();
        ctx.arc(px, py, 44, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#1c1a17";
      ctx.beginPath();
      ctx.arc(px, py - 8, 16, 0, Math.PI * 2); // body
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px + 10, py - 26, 9, 0, Math.PI * 2); // head
      ctx.fill();
      // headband (vermillion)
      ctx.strokeStyle = "#c0392b";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(px + 2, py - 30);
      ctx.lineTo(px + 18, py - 30);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px + 1, py - 30);
      ctx.lineTo(px - 14 - run * 4, py - 36);
      ctx.stroke();
      // legs
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#1c1a17";
      ctx.beginPath();
      ctx.moveTo(px, py + 4);
      ctx.lineTo(px + run * 14, py + 24);
      ctx.moveTo(px, py + 4);
      ctx.lineTo(px - run * 14, py + 24);
      ctx.stroke();

      // damage flash
      if (s.flash > 0) {
        ctx.fillStyle = `rgba(192,57,43,${s.flash * 0.35})`;
        ctx.fillRect(0, 0, W, H);
      }

      // heart empty vignette
      if (s.hearts <= 1) {
        ctx.strokeStyle = "rgba(192,57,43,0.35)";
        ctx.lineWidth = 14;
        ctx.strokeRect(0, 0, W, H);
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onPointer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full touch-none" aria-label="Kanji runner game" />
      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 sm:p-4">
        <div className="rounded-lg border border-border bg-card/90 px-3 py-2 shadow-sm backdrop-blur">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</div>
          <div className="flex items-center gap-2 text-lg">
            {Array.from({ length: 3 }).map((_, i) => (
              <span key={i} className={i < hud.hearts ? "text-primary" : "text-border"}>♥</span>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <div className="rounded-lg border border-border bg-card/90 px-3 py-2 text-right shadow-sm backdrop-blur">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Combo</div>
            <div className="font-serif text-lg font-bold text-accent">×{Math.max(1, hud.combo)}</div>
          </div>
          <div className="rounded-lg border border-border bg-card/90 px-3 py-2 text-right shadow-sm backdrop-blur">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Score</div>
            <div className="font-serif text-lg font-bold">{hud.score.toLocaleString()}</div>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <div className="rounded-full bg-ink/70 px-4 py-1.5 text-xs font-bold text-paper">
          ↑ ↓ / W S to change lane · tap a lane on touch
        </div>
      </div>
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

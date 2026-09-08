import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { Kanji } from "@/data/n5/types";
import { play } from "@/lib/sfx";
import { evaluateTrace } from "@/lib/stroke-math";

const SIZE = 320;

// Trace-over practice: draw strokes on top of a faint guide glyph.
// "Check" measures how much of the glyph's ink you covered.
export function StrokePractice({ kanji }: { kanji: Kanji }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const guideRef = useRef<HTMLCanvasElement>(null);
  const activePointer = useRef<number | null>(null);
  const instructionsId = useId();
  const [strokes, setStrokes] = useState(0);
  const [result, setResult] = useState<null | { pct: number; pass: boolean }>(null);
  // Counts Check presses; it keys the guide canvas so the failed-check pulse replays.
  const [resultCount, setResultCount] = useState(0);

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kanji.c]);

  // Layout effect: the guide canvas remounts on every Check (keyed by resultCount),
  // so the glyph must be back before the browser paints that frame.
  useLayoutEffect(() => {
    let cancelled = false;
    const drawGuide = () => {
      if (cancelled) return;
      const ctx = guideRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.font = `800 ${SIZE * 0.72}px "Shippori Mincho B1", serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#29251e";
      ctx.fillText(kanji.c, SIZE / 2, SIZE / 2 + SIZE * 0.03);
    };
    drawGuide();
    // The visible guide and coverage mask must use the same loaded font.
    void document.fonts.ready.then(drawGuide);
    return () => { cancelled = true; };
  }, [kanji.c, resultCount]);

  const reset = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (activePointer.current !== null && canvas.hasPointerCapture(activePointer.current)) {
      canvas.releasePointerCapture(activePointer.current);
    }
    activePointer.current = null;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    setStrokes(0);
    setResult(null);
  };

  // sample the guide glyph's target pixels
  const targetPixels = (): Uint8Array => {
    const data = guideRef.current!.getContext("2d")!.getImageData(0, 0, SIZE, SIZE).data;
    const mask = new Uint8Array(SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) mask[i] = (data[i * 4 + 3] ?? 0) > 100 ? 1 : 0;
    return mask;
  };

  const check = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const drawn = ctx.getImageData(0, 0, SIZE, SIZE).data;
    const target = targetPixels();
    const drawnMask = new Uint8Array(SIZE * SIZE);
    for (let i = 0; i < drawnMask.length; i++) drawnMask[i] = (drawn[i * 4 + 3] ?? 0) > 60 ? 1 : 0;
    const verdict = evaluateTrace(target, drawnMask, SIZE, SIZE);
    setResult(verdict);
    setResultCount((n) => n + 1);
    // Inside the Check click (boot()'s gesture listener has already unlocked audio).
    play(verdict.pass ? "dojoPass" : "dojoFail");
  };

  const pos = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * SIZE,
      y: ((e.clientY - r.top) / r.height) * SIZE,
    };
  };

  const endStroke = (e: PointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // The brush lifting off the paper. Only after an active stroke (the guard
    // above), never in onPointerDown; a no-op until audio is unlocked and running.
    play("strokeEnd");
  };

  return (
    <div className="min-w-0">
      {/* Reserve phone viewport space for the header, touch controls, and bottom tabs. */}
      <div className="relative mx-auto w-full max-w-[clamp(204px,calc(100svh_-_450px_-_env(safe-area-inset-top,0px)_-_env(safe-area-inset-bottom,0px)),320px)] overflow-hidden rounded-xl border-2 border-border bg-paper shadow-inner md:max-w-[320px]">
        <canvas
          key={resultCount}
          ref={guideRef}
          width={SIZE}
          height={SIZE}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 block aspect-square w-full opacity-20 ${result && !result.pass ? "guide-pulse" : ""}`}
        />
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          aria-label={`Trace ${kanji.c}`}
          aria-describedby={instructionsId}
          className="relative z-10 block aspect-square w-full touch-none select-none"
          onPointerDown={(e) => {
            if (activePointer.current !== null || e.button !== 0) return;
            e.preventDefault();
            activePointer.current = e.pointerId;
            canvasRef.current!.setPointerCapture(e.pointerId);
            const ctx = canvasRef.current!.getContext("2d")!;
            const p = pos(e);
            ctx.strokeStyle = "#b03a2e";
            ctx.fillStyle = "#b03a2e";
            ctx.lineWidth = 14;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            // A short finger tap should leave ink as well as count as a stroke.
            ctx.beginPath();
            ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            setStrokes((s) => s + 1);
            setResult(null);
          }}
          onPointerMove={(e) => {
            if (activePointer.current !== e.pointerId) return;
            const ctx = canvasRef.current!.getContext("2d")!;
            const p = pos(e);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onLostPointerCapture={endStroke}
        />
        {/* Hanko badge for a pass; the role="status" text below stays the accessible result. */}
        {result?.pass && (
          <div aria-hidden="true" className="dojo-stamp">
            印
          </div>
        )}
      </div>
      <div className="mt-2 text-sm sm:mt-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-muted-foreground">
            Your strokes: <b key={strokes} className={`tabular-nums text-foreground${strokes > 0 ? " hud-pop-left" : ""}`}>{strokes}</b>
          </span>
          <span className="text-muted-foreground">Guide: {kanji.strokes} {kanji.strokes === 1 ? "stroke" : "strokes"}</span>
        </div>
        <p
          id={instructionsId}
          role={result ? "status" : undefined}
          className={`mt-1 flex min-h-10 items-center text-xs leading-5 ${result ? `font-bold ${result.pass ? "text-[#2e5238]" : "text-primary"}` : "text-muted-foreground"}`}
        >
          {result
            ? result.pass
              ? `Stamped! About ${result.pct}% coverage. Beautiful brushwork.`
              : `About ${result.pct}% coverage. Trace more of the guide and stay on the lines.`
            : "Swipe outside the square to scroll."}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3">
          <button type="button" onClick={reset} className="min-h-11 rounded-lg border border-border px-4 py-2.5 font-bold transition-colors hover:bg-secondary active:bg-secondary">
            Clear
          </button>
          <button type="button" onClick={check} disabled={strokes === 0} className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-bold text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">
            Check
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, type CSSProperties } from "react";

export function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const from = previous.current; previous.current = value;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setDisplay(value); return; }
    let frame = 0, start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const progress = Math.min(1, (now - start) / 480);
      setDisplay(Math.round(from + (value - from) * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <><span aria-hidden="true">{display.toLocaleString()}</span><span className="sr-only">{value.toLocaleString()}</span></>;
}

export function AnswerEffects({ correct, light, mon, combo, lostCombo }: { correct: boolean; light: number; mon: number; combo: number; lostCombo: boolean }) {
  return <div className={`answer-effects ${correct ? "is-correct" : "is-miss"}`} aria-hidden="true" data-testid="answer-effects">
    <span className="answer-ring" />
    {correct && Array.from({ length: 10 }, (_, i) => <i key={i} style={{ "--angle": `${i * 36}deg`, "--distance": `${65 + i % 3 * 16}px`, "--delay": `${i % 3 * 30}ms` } as CSSProperties}>✦</i>)}
    <div className="answer-score-pop"><strong>{correct ? `+${light} light` : "Keep going!"}</strong><span>{correct ? mon > 0 ? `+${mon} mon` : "A word made clearer" : lostCombo ? "A fresh start for your streak" : "Every try helps you learn"}</span></div>
    {correct && combo > 0 && combo % 3 === 0 && <span className="answer-combo-banner">✦ {combo} IN A ROW ✦</span>}
  </div>;
}

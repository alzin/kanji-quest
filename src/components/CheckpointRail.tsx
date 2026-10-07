import { CHECKPOINT_STEPS } from "@/lib/checkpoint-steps";

/**
 * A region checkpoint's three planned steps, then its seal. Segments rather than boxes, so the
 * rail never wraps on a phone; a narrow rail shows short names and keeps the full ones for
 * screen readers. `done` counts completed steps; `current` is the step on screen.
 */
export function CheckpointRail({ done, current, className = "" }: { done: number; current: number | "seal" | null; className?: string }) {
  return (
    <ol aria-label="Checkpoint steps" className={`checkpoint-rail ${className}`}>
      {CHECKPOINT_STEPS.map((step, i) => (
        <li key={step.id} data-state={i < done ? "done" : i === current ? "current" : "todo"} aria-current={i === current ? "step" : undefined}>
          <span aria-hidden="true" className="checkpoint-rail-bar" />
          <span className="checkpoint-rail-label">
            <span className="checkpoint-rail-number">{i + 1}. </span>
            <span className="checkpoint-rail-full">{step.label}</span>
            <span className="checkpoint-rail-short" aria-hidden="true">{step.short}</span>
            {i < done && <span className="sr-only"> · complete</span>}
          </span>
        </li>
      ))}
      <li className="checkpoint-rail-seal" data-state={current === "seal" ? "current" : "todo"} aria-current={current === "seal" ? "step" : undefined}>
        <span aria-hidden="true">印</span>
        <span className="sr-only">Typed seal</span>
      </li>
    </ol>
  );
}

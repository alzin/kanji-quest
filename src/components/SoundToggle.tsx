import type { JSX } from "react";
import { playWhenReady, setSoundEnabled, useSoundEnabled } from "@/lib/sfx";

// The only mute UI. "hud" is the 44 px round button RunnerGame positions with
// className; "inline" is the ghost button in the Home hero action row.
// aria-pressed reports the muted state (the button "presses" the mute).
export function SoundToggle({ variant, className }: { variant: "hud" | "inline"; className?: string }): JSX.Element {
  const enabled = useSoundEnabled();
  const muted = !enabled;
  const base = variant === "hud"
    ? "flex h-11 w-11 items-center justify-center rounded-full border border-paper/30 bg-ink/80 text-paper shadow backdrop-blur active:scale-90"
    : "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary";

  const onClick = () => {
    const next = !enabled;
    setSoundEnabled(next);
    if (next) playWhenReady("unmute"); // we are inside a click; plays once resume() settles
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      aria-pressed={muted}
      className={className ? `${base} ${className}` : base}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" fillOpacity="0.35" />
        <g opacity={muted ? 0.35 : 1}>
          <path d="M16 9.5a3.5 3.5 0 0 1 0 5" />
          <path d="M18.5 7a7 7 0 0 1 0 10" />
        </g>
        {/* Slash: dashoffset 0 draws it (muted), 24 hides it; styles.css transitions .sound-toggle-slash. */}
        <path
          className="sound-toggle-slash"
          d="M4 4l16 16"
          strokeWidth="2"
          strokeDasharray="24"
          strokeDashoffset={muted ? 0 : 24}
        />
      </svg>
      {variant === "inline" && <span>{muted ? "Sound off" : "Sound on"}</span>}
    </button>
  );
}

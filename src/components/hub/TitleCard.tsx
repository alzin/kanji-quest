import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { openAccountPrompt, useAccount } from "@/lib/account";

/**
 * The title card over the overworld: the first thing a new traveller sees, with the whole
 * journey already drawn behind it. Starting simply sets them down at the trailhead.
 */
export function TitleCard({ onStart }: { onStart: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const start = useRef<HTMLButtonElement>(null);
  const account = useAccount();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    start.current?.focus();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="hub-title"
      aria-labelledby="hub-title-heading"
      onCancel={(event) => {
        event.preventDefault();
        onStart();
      }}
    >
      <div className="hub-title-inner">
        <div className="forest-wordmark hub-title-brand">
          <span className="forest-seal" aria-hidden="true">森</span>
          <span>KANJI DASH<small>A JAPANESE LEARNING ADVENTURE</small></span>
        </div>
        <span className="forest-eyebrow hub-title-eyebrow"><i /> THE SPIRIT TRAIL</span>
        <h1 id="hub-title-heading">
          A little Japanese.
          <br />
          <em>A whole new world.</em>
        </h1>
        <p>
          The forest has forgotten its words. Walk its five old roads with Aki, wake their lanterns, and earn a seal at every checkpoint — from your first 一 all the way north.
        </p>
        <button ref={start} type="button" className="forest-primary hub-title-start" onClick={onStart} data-sfx="tap">
          Start your journey <span aria-hidden="true">→</span>
        </button>
        <span className="forest-title-note">
          CHAPTER 01 <i /> KODAMA WOODS <i /> ABOUT 5 MINUTES
        </span>
        <footer className="hub-title-footer">
          {!account.user && (
            <button type="button" onClick={openAccountPrompt} disabled={account.phase === "checking"}>
              Already travelling? Sign in
            </button>
          )}
          <span>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </span>
        </footer>
      </div>
      <div className="hub-title-caption" aria-hidden="true">
        <span>木霊の森</span>
        <small>There’s a story in every word.</small>
      </div>
    </dialog>
  );
}

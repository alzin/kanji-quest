import { useCallback, useEffect, useRef, useState } from "react";
import { setVoiceEnabled, useVoiceEnabled } from "@/lib/voice-preference";
import { duckMusic, releaseMusicDuck } from "@/lib/music";

/** Speak kana so words with multiple kanji readings use the lesson's exact reading.
 *  "inline" is the labelled pair used on the study pages; "hud" is the 44 px round pair
 *  that sits in the run's bottom control row beside pause and mute. */
export function WordAudio({ reading, wordKey, paused = false, variant = "inline", className = "" }: {
  reading: string;
  wordKey: unknown;
  paused?: boolean;
  variant?: "inline" | "hud";
  className?: string;
}) {
  const enabled = useVoiceEnabled();
  const [status, setStatus] = useState<"ready" | "unavailable" | "blocked">("ready");
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  const stop = useCallback(() => {
    if (!current.current) return;
    current.current.onend = null;
    current.current.onerror = null;
    releaseMusicDuck(current.current);
    current.current = null;
    window.speechSynthesis?.cancel();
  }, []);
  const speak = useCallback(() => {
    if (!enabled || paused || !reading || document.hidden) return;
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setStatus("unavailable");
      return;
    }
    stop();
    const speech = new SpeechSynthesisUtterance(reading);
    speech.lang = "ja-JP";
    speech.rate = 0.85;
    const voice = window.speechSynthesis.getVoices().find((v) => /^ja(?:[-_]|$)/i.test(v.lang));
    if (voice) speech.voice = voice;
    const finished = () => { releaseMusicDuck(speech); if (current.current === speech) current.current = null; };
    speech.onend = finished;
    speech.onerror = (event) => {
      finished();
      if (event.error !== "interrupted" && event.error !== "canceled") setStatus("blocked");
    };
    current.current = speech;
    duckMusic(speech);
    setStatus("ready");
    try { window.speechSynthesis.speak(speech); }
    catch { finished(); setStatus("blocked"); }
  }, [enabled, paused, reading, stop]);

  useEffect(() => {
    speak();
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      stop();
    };
  }, [speak, stop, wordKey]);

  const replayDisabled = !enabled || paused || !reading || status === "unavailable";
  const replayTitle = status === "blocked"
    ? "Tap to play. Japanese speech may need to be enabled on your device."
    : "Automatically reads each word in Japanese. Use Voice to mute.";

  if (variant === "hud") {
    // Same shape as the pause and mute circles so the run has one control language.
    const hud = "flex h-11 w-11 items-center justify-center rounded-full border border-paper/30 bg-ink/80 text-paper shadow backdrop-blur active:scale-90 disabled:opacity-40";
    return <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <button type="button" onClick={() => setVoiceEnabled(!enabled)}
        aria-label={enabled ? "Mute Japanese voice" : "Unmute Japanese voice"}
        aria-pressed={!enabled} title={enabled ? "Japanese voice on" : "Japanese voice off"} className={hud}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" fill="currentColor" fillOpacity="0.35" />
          <path d="M6 11a6 6 0 0 0 12 0" />
          <path d="M12 17v4" />
          <path className="sound-toggle-slash" d="M4 4l16 16" strokeWidth="2"
            strokeDasharray="24" strokeDashoffset={enabled ? 24 : 0} />
        </svg>
      </button>
      <button type="button" onClick={speak} disabled={replayDisabled}
        aria-label="Replay Japanese pronunciation" title={replayTitle} className={hud}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 11a8 8 0 1 0-1.6 4.8" />
          <path d="M20 5v6h-6" />
        </svg>
      </button>
    </div>;
  }

  const buttonClass = "min-h-11 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold shadow-e1 transition-colors hover:bg-secondary disabled:opacity-40 disabled:hover:bg-card";
  return <div className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
    <button type="button" onClick={() => setVoiceEnabled(!enabled)}
      aria-label={enabled ? "Mute Japanese voice" : "Unmute Japanese voice"}
      aria-pressed={!enabled} className={buttonClass}>
      {enabled ? "Voice on" : "Voice off"}
    </button>
    <button type="button" onClick={speak} disabled={replayDisabled}
      aria-label="Replay Japanese pronunciation" title={replayTitle} className={buttonClass}>
      {status === "unavailable" ? "Speech unavailable" : status === "blocked" ? "Tap to hear Japanese" : "Hear Japanese"}
    </button>
  </div>;
}

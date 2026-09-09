import { useCallback, useEffect, useRef, useState } from "react";
import { setVoiceEnabled, useVoiceEnabled } from "@/lib/voice-preference";

/** Speak kana so words with multiple kanji readings use the lesson's exact reading. */
export function WordAudio({ reading, wordKey, paused = false, className = "" }: {
  reading: string;
  wordKey: unknown;
  paused?: boolean;
  className?: string;
}) {
  const enabled = useVoiceEnabled();
  const [status, setStatus] = useState<"ready" | "unavailable" | "blocked">("ready");
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  const stop = useCallback(() => {
    if (!current.current) return;
    current.current.onend = null;
    current.current.onerror = null;
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
    speech.onerror = (event) => {
      if (event.error !== "interrupted" && event.error !== "canceled") setStatus("blocked");
    };
    current.current = speech;
    setStatus("ready");
    try { window.speechSynthesis.speak(speech); }
    catch { setStatus("blocked"); }
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

  const buttonClass = "min-h-11 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold disabled:opacity-40";
  return <div className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
    <button type="button" onClick={() => setVoiceEnabled(!enabled)}
      aria-label={enabled ? "Mute Japanese voice" : "Unmute Japanese voice"}
      aria-pressed={!enabled} className={buttonClass}>
      {enabled ? "Voice on" : "Voice off"}
    </button>
    <button type="button" onClick={speak}
    disabled={!enabled || paused || !reading || status === "unavailable"}
    aria-label="Replay Japanese pronunciation"
    title={status === "blocked" ? "Tap to play. Japanese speech may need to be enabled on your device." : "Automatically reads each word in Japanese. Use Voice to mute."}
    className={buttonClass}>
    {status === "unavailable" ? "Speech unavailable" : status === "blocked" ? "Tap to hear Japanese" : "Hear Japanese"}
    </button>
  </div>;
}

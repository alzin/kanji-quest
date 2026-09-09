import { useSyncExternalStore } from "react";

const VOICE_PREF_KEY = "kanji-dash-voice";
const listeners = new Set<() => void>();
let enabled = true;

function getVoiceEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try { enabled = window.localStorage.getItem(VOICE_PREF_KEY) !== "off"; }
  catch { /* Keep the in-memory preference when storage is unavailable. */ }
  return enabled;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === VOICE_PREF_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setVoiceEnabled(value: boolean): void {
  enabled = value;
  try { window.localStorage.setItem(VOICE_PREF_KEY, value ? "on" : "off"); }
  catch { /* The setting still works for this session. */ }
  listeners.forEach((listener) => listener());
}

export function useVoiceEnabled(): boolean {
  return useSyncExternalStore(subscribe, getVoiceEnabled, () => true);
}

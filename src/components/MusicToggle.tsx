import { useMusicEnabled, setMusicEnabled } from "@/lib/music";
import { useSoundEnabled } from "@/lib/sfx";

export function MusicToggle({ compact = false }: { compact?: boolean }) {
  const enabled = useMusicEnabled(), sound = useSoundEnabled();
  return <button type="button" className={`music-toggle ${compact ? "music-compact" : ""}`} aria-label={enabled ? "Mute background music" : "Enable background music"} aria-pressed={!enabled}
    title={!sound && enabled ? "Music enabled. Unmute game sound to hear it." : enabled ? "Woodland soundtrack on" : "Woodland soundtrack off"} onClick={() => setMusicEnabled(!enabled)}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13M9 8l11-2" /><ellipse cx="6" cy="18" rx="3" ry="2.5" /><ellipse cx="17" cy="16" rx="3" ry="2.5" />{!enabled && <path d="m3 3 18 18" />}</svg>
    {!compact && <span>Music {enabled ? "on" : "off"}</span>}
  </button>;
}

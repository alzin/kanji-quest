import { LEVELS, LEVEL_CHAPTERS, kanjiOfLevel, type JLPTLevel } from "@/data";
import { isLevelUnlocked, selectLevel, useSave } from "@/lib/srs";

export function LevelSelector({ level, preview = false, onChange }: { level: JLPTLevel; preview?: boolean; onChange?: () => void }) {
  const save = useSave();
  const n4Unlocked = isLevelUnlocked(save, "N4");
  return (
    <div className="mt-4">
      {/* Two options, so a segmented control rather than two cards: a sunken track with
          the selected segment raised out of it (light from the sky). */}
      <div role="group" aria-label="JLPT level" className="flex gap-1 rounded-xl border border-border bg-surface-sunken p-1">
        {LEVELS.map((option) => {
          const locked = !isLevelUnlocked(save, option);
          return (
            <button key={option} type="button" aria-pressed={option === level} disabled={locked && !preview}
              onClick={() => { selectLevel(option); onChange?.(); }}
              className={`min-h-11 flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${option === level ? "bg-card text-primary shadow-e1" : "text-muted-foreground hover:text-foreground"}`}>
              {option} <span className="ml-1 text-xs font-normal">{kanjiOfLevel(option).length} kanji{locked ? preview ? " · Preview" : " · Locked" : ""}</span>
            </button>
          );
        })}
      </div>
      {!n4Unlocked && <p className="mt-2 text-xs text-muted-foreground">Earn all {LEVEL_CHAPTERS.N5.length} N5 checkpoint seals to unlock N4 lessons and runs.</p>}
      {n4Unlocked && level === "N4" && <p className="mt-2 text-xs text-muted-foreground">New N4 words, with due N5 reviews to keep your foundation strong.</p>}
    </div>
  );
}

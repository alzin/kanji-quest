import { LEVELS, LEVEL_CHAPTERS, kanjiOfLevel, previousLevel, type JLPTLevel } from "@/data";
import { isLevelUnlocked, selectLevel, useSave } from "@/lib/srs";

export function LevelSelector({ level, onChange }: { level: JLPTLevel; onChange?: () => void }) {
  const save = useSave();
  const prerequisite = previousLevel(level);
  const nextLocked = LEVELS.find((option) => !isLevelUnlocked(save, option));
  const unlockTarget = !isLevelUnlocked(save, level) ? level : nextLocked;
  const unlockPrerequisite = unlockTarget ? previousLevel(unlockTarget) : undefined;
  return (
    <div className="mt-4">
      <div role="group" aria-label="JLPT level" className="flex gap-1 rounded-xl border border-border bg-surface-sunken p-1">
        {LEVELS.map((option) => {
          const locked = !isLevelUnlocked(save, option);
          return (
            <button key={option} type="button" aria-pressed={option === level}
              onClick={() => { selectLevel(option); onChange?.(); }}
              className={`min-h-11 min-w-0 flex-1 rounded-lg px-2 py-2 text-sm font-bold transition-colors ${option === level ? "bg-card text-primary shadow-e1" : "text-muted-foreground hover:text-foreground"}`}>
              {option} <span className="block text-xs font-normal sm:ml-1 sm:inline">{kanjiOfLevel(option).length} kanji{locked ? " · Preview" : ""}</span>
            </button>
          );
        })}
      </div>
      {unlockPrerequisite && <p className="mt-2 text-xs text-muted-foreground">Earn all {LEVEL_CHAPTERS[unlockPrerequisite].length} {unlockPrerequisite} checkpoint seals to unlock {unlockTarget} lessons and runs.</p>}
      {prerequisite && isLevelUnlocked(save, level) && <p className="mt-2 text-xs text-muted-foreground">New {level} words, with due {level === "N3" ? "N5 and N4" : "N5"} reviews to keep your foundation strong.</p>}
    </div>
  );
}

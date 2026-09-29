import { LEVELS, kanjiOfLevel, type JLPTLevel } from "@/data";
import { selectLevel } from "@/lib/srs";

export function LevelSelector({ level, onChange }: { level: JLPTLevel; onChange?: () => void }) {
  return (
    <div className="mt-4">
      <div role="group" aria-label="JLPT level" className="flex gap-1 rounded-xl border border-border bg-surface-sunken p-1">
        {LEVELS.map((option) => (
          <button key={option} type="button" aria-pressed={option === level}
            onClick={() => { selectLevel(option); onChange?.(); }}
            className={`min-h-11 min-w-0 flex-1 rounded-lg px-2 py-2 text-sm font-bold transition-colors ${option === level ? "bg-card text-primary shadow-e1" : "text-muted-foreground hover:text-foreground"}`}>
            {option} <span className="block text-xs font-normal sm:ml-1 sm:inline">{kanjiOfLevel(option).length} kanji</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Start at any level. Your progress is saved separately for each road.</p>
    </div>
  );
}

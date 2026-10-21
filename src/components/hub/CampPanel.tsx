import { Link } from "@tanstack/react-router";
import { AppIcon } from "@/components/AppIcon";
import { ReminderSetting } from "@/components/DailyReminder";
import { InstallApp } from "@/components/InstallApp";
import { MusicToggle } from "@/components/MusicToggle";
import { SiteFooter } from "@/components/SiteFooter";
import { SoundToggle } from "@/components/SoundToggle";
import { LEVELS, kanjiOfLevel } from "@/data";
import { explorerRank } from "@/lib/expedition";
import { dueCount, learningLevel, levelMasteryPct, selectLevel, streakCount, useSave } from "@/lib/srs";
import { localDay, stackOf } from "@/lib/stack-progress";
import { GameDrawer } from "./GameDrawer";

/** The camp at the trailhead: who you are on the journey, today's quests, other ways to play, settings. */
export function CampPanel({ onClose, onShowTitle }: { onClose: () => void; onShowTitle: () => void }) {
  const save = useSave();
  const level = learningLevel(save), rank = explorerRank(save), due = dueCount(save);
  const all = kanjiOfLevel(save.selectedLevel);
  const mastered = all.filter((k) => save.progress[k.c]?.mastery === 3).length;
  const encountered = all.filter((k) => (save.progress[k.c]?.mastery ?? 0) > 0).length;
  const stack = stackOf(save), today = localDay();
  const quests = [
    { title: "Follow your curiosity", detail: "Walk today’s trail", done: save.streak.last === today, to: "/run", mode: "expedition" },
    { title: "Trust your memory", detail: "Complete a typed recall challenge", done: stack.quests.day === today && stack.quests.typed > 0, to: "/run", mode: "expedition" },
    { title: "Make your mark", detail: "Trace a kanji in the dojo", done: stack.strokeDay === today, to: "/practice", mode: undefined },
  ] as const;
  const completed = quests.filter((q) => q.done).length;

  return (
    <GameDrawer label="Your camp" eyebrow="野営 · CAMP" title="Your camp" onClose={onClose} className="camp-drawer">
      <section className="camp-rank" aria-label="Your journey so far">
        <div className="camp-rank-top">
          <span className="camp-rank-mark" aria-hidden="true">旅</span>
          <div>
            <small>LEVEL {rank.level} EXPLORER</small>
            <strong>{rank.title}</strong>
          </div>
        </div>
        <div className="camp-xp">
          <span>Every recall is a step forward</span>
          <b>{rank.progress} / 200 XP</b>
        </div>
        <div className="world-meter" aria-hidden="true"><span style={{ width: `${rank.progress / 2}%` }} /></div>
        <dl className="camp-stats">
          <div><dt>Day streak</dt><dd data-testid="stat-streak">{streakCount(save)}</dd></div>
          <div><dt>Mon</dt><dd data-testid="stat-mon">{save.coins}</dd></div>
          <div><dt>Sessions</dt><dd data-testid="stat-runs">{save.runsCompleted}</dd></div>
        </dl>
      </section>

      <section className="camp-section" aria-labelledby="camp-quests">
        <div className="camp-section-head">
          <h3 id="camp-quests">Today’s little quests</h3>
          <b>{completed}/3</b>
        </div>
        <div className="camp-quests">
          {quests.map((q) => (
            <Link key={q.title} to={q.to} search={q.mode ? { mode: q.mode } : {}} className="camp-quest" data-done={q.done || undefined}>
              <span className="camp-quest-check" aria-hidden="true">{q.done ? "✓" : ""}</span>
              <span><strong>{q.title}</strong><small>{q.detail}</small></span>
              <span aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
        <p className="camp-fine">
          {completed === 3 ? "A lovely day’s work. See you on the trail." : due ? `${due} ${due === 1 ? "word is" : "words are"} ready to meet you again.` : "A small adventure is enough for today."}
        </p>
      </section>

      <section className="camp-section" aria-labelledby="camp-flow">
        <div className="camp-section-head"><h3 id="camp-flow">Other ways to play</h3></div>
        <div className="camp-modes">
          <Link to="/run" search={{ mode: "stack" }} className="camp-mode">
            <span className="camp-mode-glyph" aria-hidden="true">積</span>
            <span><strong>Word Weaver</strong><small>Stack falling words from memory</small></span>
          </Link>
          <Link to="/run" search={{ mode: "runner" }} className="camp-mode">
            <span className="camp-mode-glyph" aria-hidden="true">灯</span>
            <span><strong>Lantern Dash</strong><small>Carry fireflies down the trail</small></span>
          </Link>
          <Link to="/practice" className="camp-mode">
            <span className="camp-mode-glyph" aria-hidden="true">筆</span>
            <span><strong>Stroke Dojo</strong><small>Trace each kanji, stroke by stroke</small></span>
          </Link>
          <Link to="/collection" className="camp-mode">
            <span className="camp-mode-glyph" aria-hidden="true">字</span>
            <span><strong>Kanji Collection</strong><small>Every kanji you have met</small></span>
          </Link>
        </div>
      </section>

      <section className="camp-section" aria-labelledby="camp-road">
        <div className="camp-section-head"><h3 id="camp-road">Your road</h3></div>
        <div role="group" aria-label="JLPT level" className="camp-levels">
          {LEVELS.map((l) => (
            <button key={l} type="button" aria-label={`${l} ${kanjiOfLevel(l).length} kanji`} aria-pressed={l === save.selectedLevel} title={`Study ${l}`} onClick={() => selectLevel(l)}>
              {l}
            </button>
          ))}
        </div>
        <p className="camp-fine">Start at any level. Your next adventure uses {level}.</p>
        <p className="camp-count"><strong>{encountered}</strong> / {all.length} kanji discovered</p>
        <div className="world-meter" aria-hidden="true"><span style={{ width: `${encountered / all.length * 100}%` }} /></div>
        <small className="camp-fine" data-testid="mastery-summary">{mastered}/{all.length} mastered · {levelMasteryPct(save, save.selectedLevel)}% mastery progress</small>
      </section>

      <section className="camp-section" aria-labelledby="camp-settings">
        <div className="camp-section-head"><h3 id="camp-settings">Settings</h3></div>
        <div className="camp-settings">
          <SoundToggle variant="inline" />
          <MusicToggle />
        </div>
        <ReminderSetting />
        <InstallApp />
        <button type="button" className="forest-text-button camp-title-link" onClick={onShowTitle}>
          <AppIcon name="seal" className="h-4 w-4" /> View the title screen
        </button>
      </section>
      <SiteFooter />
    </GameDrawer>
  );
}

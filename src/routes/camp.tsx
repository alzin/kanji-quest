import { createFileRoute, Link } from "@tanstack/react-router";
import { Nav } from "@/components/Nav";
import { SiteFooter } from "@/components/SiteFooter";
import { InstallApp } from "@/components/InstallApp";
import { SoundToggle } from "@/components/SoundToggle";
import { AppIcon } from "@/components/AppIcon";
import { TrailEmblem } from "@/components/TrailEmblem";
import { TrailCompanion } from "@/components/TrailCompanion";
import { useSave, dueCount, learningLevel, levelMasteryPct, streakCount, isChapterUnlocked, isGateCleared, isLevelUnlocked, selectLevel } from "@/lib/srs";
import { CHAPTER_NAMES, LEVEL_CHAPTERS, LEVELS, previousLevel, kanjiOfLevel } from "@/data";
import { explorerRank } from "@/lib/expedition";
import { localDay, stackOf } from "@/lib/stack-progress";

export const Route = createFileRoute("/camp")({
  head: () => ({ meta: [
    { title: "Kanji Dash — A little adventure. A little wiser." },
    { name: "description", content: "Follow the Spirit Trail. Discover kanji, restore forest lanterns, and build lasting recall through short daily adventures." },
    { property: "og:title", content: "Kanji Dash — Your daily kanji adventure" },
    { property: "og:description", content: "A quiet forest. A curious mind. Learn Japanese through recall, rhythm, and discovery." },
  ] }),
  component: Home,
});

function Home() {
  const save = useSave();
  const level = learningLevel(save), rank = explorerRank(save), due = dueCount(save);
  const road = LEVEL_CHAPTERS[level];
  const checkpoint = road.find((ch) => isChapterUnlocked(save, ch) && !isGateCleared(save, ch));
  const chapter = checkpoint ?? road[road.length - 1]!;
  const region = CHAPTER_NAMES[chapter]!;
  const collectionLevel = save.selectedLevel;
  const preview = !isLevelUnlocked(save, collectionLevel);
  const all = kanjiOfLevel(collectionLevel), mastered = all.filter((k) => save.progress[k.c]?.mastery === 3).length;
  const encountered = all.filter((k) => (save.progress[k.c]?.mastery ?? 0) > 0).length;
  const stack = stackOf(save), today = localDay();
  const quests = [
    { title: "Follow your curiosity", detail: "Complete a practice session", done: save.streak.last === today, to: "/run", mode: "expedition" },
    { title: "Trust your memory", detail: "Complete a typed recall challenge", done: stack.quests.day === today && stack.quests.typed > 0, to: "/run", mode: "expedition" },
    { title: "Make your mark", detail: "Trace a kanji in the dojo", done: stack.strokeDay === today, to: "/practice", mode: undefined },
  ] as const;
  const completed = quests.filter((q) => q.done).length;
  return <div className="app-shell spirit-home">
    <Nav />
    <main className="trail-home-main">
      <div className="trail-greeting"><span><span className="trail-dot" /> YOUR DAILY DOSE OF DISCOVERY</span><span>一日一歩 <span className="greeting-translation">· One day, one step.</span></span></div>
      <section className="trail-hero" aria-labelledby="adventure-title">
        <img className="trail-hero-art" src={`${import.meta.env.BASE_URL}art/spirit-forest.webp`} alt="A small fox on a winding forest path toward a lantern-lit shrine" fetchPriority="high" width="1536" height="1024" />
        <div className="trail-hero-wash" />
        <TrailCompanion className="home-companion" message="I’m Aki. Let’s find a little magic." />
        <div className="trail-hero-copy">
          <span className="trail-eyebrow"><TrailEmblem kind="leaf" /> THE SPIRIT TRAIL</span>
          <h1 id="adventure-title">A little adventure.<br />A little <em>wiser.</em></h1>
          <p>The forest has forgotten its words.<br />Help bring them back, one kanji at a time.</p>
          <Link to="/run" search={{ mode: "expedition" }} className="trail-button trail-button-primary" data-sfx="tap">{save.runsCompleted ? "Continue your adventure" : "Begin your adventure"}<AppIcon name="arrow" /></Link>
          <span className="trail-session-note"><span className="trail-dot" /> 4 words · about 5 minutes · your pace</span>
        </div>
        <div className="trail-location"><TrailEmblem kind="gate" /><div><span>YOUR NEXT DESTINATION</span><strong>{region.name}</strong><small>{region.jp} · {level}</small></div><span className="location-number">{String(road.indexOf(chapter) + 1).padStart(2, "0")}</span></div>
        <div className="forest-mote mote-one" /><div className="forest-mote mote-two" /><div className="forest-mote mote-three" />
      </section>
      <section className="trail-player-strip" aria-label="Your journey so far">
        <div className="trail-rank"><span className="trail-rank-icon"><TrailEmblem kind="leaf" /></span><div><small>LEVEL {rank.level} EXPLORER</small><strong>{rank.title}</strong></div></div>
        <div className="trail-xp"><div><span>Every recall is a step forward</span><b>{rank.progress} / 200 XP</b></div><div className="trail-meter"><span style={{ width: `${rank.progress / 2}%` }} /></div></div>
        <div className="trail-strip-stat"><AppIcon name="flame" /><strong data-testid="stat-streak">{streakCount(save)}</strong><span>day streak</span></div>
        <div className="trail-strip-stat"><AppIcon name="coin" /><strong data-testid="stat-mon">{save.coins}</strong><span>mon collected</span></div>
      </section>
      <div className="trail-home-grid">
        <div>
          <div className="trail-section-heading"><div><span className="trail-eyebrow">FIND YOUR FLOW</span><h2>How will you wander today?</h2></div><SoundToggle variant="inline" /></div>
          <div className="trail-modes">
            <Link to="/run" search={{ mode: "stack" }} className="trail-mode mode-stack"><span className="mode-tag">RECALL + RHYTHM</span><div className="mode-art stack-art" aria-hidden="true"><span>木</span><span>山</span><span>川</span><span>火</span></div><h3>Word Weaver</h3><p>Find the match.<br /> Let the words fall into place.</p><span className="mode-bottom">Play Tsumiji <AppIcon name="arrow" /></span></Link>
            <Link to="/run" search={{ mode: "runner" }} className="trail-mode mode-runner"><span className="mode-tag">QUICK THINKING</span><div className="mode-art runner-art" aria-hidden="true"><TrailEmblem kind="gate" /><span>走</span><i /></div><h3>Lantern Dash</h3><p>Carry a little light.<br /> Find the path to the shrine.</p><span className="mode-bottom">Take a run <AppIcon name="arrow" /></span></Link>
            <Link to="/practice" className="trail-mode mode-dojo"><span className="mode-tag">SLOW + MINDFUL</span><div className="mode-art dojo-art" aria-hidden="true"><span>永</span><i /></div><h3>The Ink Dojo</h3><p>Follow each stroke.<br /> Make a lasting impression.</p><span className="mode-bottom">Pick up the brush <AppIcon name="arrow" /></span></Link>
          </div>
          <section className="trail-road" aria-label="Your next checkpoint"><div className="trail-road-top"><div><span className="trail-eyebrow">THE ROAD AHEAD</span><h2>A world, one word at a time.</h2></div><Link to="/map">Explore the map <AppIcon name="arrow" /></Link></div><div className="trail-road-stops">{road.slice(Math.max(0, road.indexOf(chapter) - 1), Math.max(0, road.indexOf(chapter) - 1) + 4).map((ch) => {
            const unlocked = isChapterUnlocked(save, ch), cleared = isGateCleared(save, ch);
            return <Link key={ch} to={unlocked ? "/run" : "/map"} search={unlocked ? { gate: ch } : {}} className={`trail-stop ${ch === chapter ? "current" : ""} ${cleared ? "cleared" : ""}`}><span className="trail-stop-mark">{cleared ? <AppIcon name="check" /> : unlocked ? <TrailEmblem kind="gate" /> : <AppIcon name="lock" />}</span><strong>{CHAPTER_NAMES[ch]!.name}</strong><small>{cleared ? "Seal earned" : ch === chapter ? "Your next seal" : unlocked ? "Open to explore" : "Still to discover"}</small></Link>;
          })}</div></section>
        </div>
        <aside className="trail-sidebar">
          <section className="trail-daily"><div className="trail-daily-title"><TrailEmblem /><span>TODAY’S LITTLE QUESTS</span><b>{completed}/3</b></div><p>Good things grow with a little care.</p><div className="trail-quest-list">{quests.map((q) => <Link key={q.title} to={q.to} search={q.mode ? { mode: q.mode } : {}} className={`trail-quest ${q.done ? "done" : ""}`}><span className="quest-check">{q.done ? "✓" : ""}</span><span><strong>{q.title}</strong><small>{q.detail}</small></span><span aria-hidden="true">›</span></Link>)}</div><div className="trail-daily-foot"><TrailEmblem kind="spark" /><span>{completed === 3 ? "A lovely day’s work. See you on the trail." : due ? `${due} ${due === 1 ? "word is" : "words are"} ready to meet you again.` : "A small adventure is enough for today."}</span></div></section>
          <section className="trail-collection"><div className="trail-collection-title"><h2>Your field notes</h2><div role="group" aria-label="JLPT level">{LEVELS.map((l) => <button key={l} aria-label={`${l} ${kanjiOfLevel(l).length} kanji${!isLevelUnlocked(save, l) ? " · Preview" : ""}`} aria-pressed={l === collectionLevel} title={!isLevelUnlocked(save, l) ? `Preview ${l}; earn the ${previousLevel(l)} seals to unlock lessons` : `Study ${l}`} onClick={() => selectLevel(l)}>{l}</button>)}</div></div>{preview && <p>Browsing {collectionLevel}. Your daily adventure continues on {level} until you earn the required seals.</p>}<p><strong>{encountered}</strong> / {all.length} kanji discovered</p><div className="trail-meter"><span style={{ width: `${encountered / all.length * 100}%` }} /></div><div className="trail-field-characters" aria-hidden="true">{all.slice(0, 6).map((k) => <span key={k.c} className={(save.progress[k.c]?.mastery ?? 0) > 0 ? "seen" : ""}>{k.c}</span>)}</div><Link to="/collection">Open your collection <AppIcon name="arrow" /></Link><small data-testid="mastery-summary">{mastered}/{all.length} mastered · {levelMasteryPct(save, collectionLevel)}% mastery progress</small></section>
        </aside>
      </div>
      <div className="trail-bottom-note"><TrailEmblem kind="leaf" /><p>No rush. Small steps. A little more Japanese than yesterday.</p><span><span data-testid="stat-runs">{save.runsCompleted}</span> sessions explored</span></div>
      <InstallApp />
    </main>
    <SiteFooter />
  </div>;
}

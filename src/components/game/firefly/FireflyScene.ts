import Phaser from "phaser";
import { LANTERNS, SPIRITS, type LanternId } from "@/lib/firefly-catalog";
import { makeForestArt } from "../forest/art";
import { makeFireflyArt } from "./art";
import { multiplierOf, type FireflyEntity, type FireflyState } from "./simulation";

export type FireflyView = {
  state: FireflyState; paused: boolean; reducedMotion: boolean; lantern: LanternId;
  /** Canvas y where the trail emerges below the lantern call. */
  trackTop: number;
  tick: (seconds: number) => void; ready: () => void;
};
const LABEL_FONT = '"Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
const palettes = [
  { sky: 0x143d39, bottom: 0x071f24, path: 0x2a4c42, edge: 0x486952, accent: 0x96bf83 },
  { sky: 0x183d51, bottom: 0x0c243a, path: 0x345052, edge: 0x627975, accent: 0xa4d9de },
  { sky: 0x312f4f, bottom: 0x152633, path: 0x49464f, edge: 0x736779, accent: 0xe5ba88 },
];
/** Scale of the far end of the trail; objects grow to full size as they reach Aki. */
const FAR = .68;
/** Approach curve: things linger in the distance and rush in at the end, like real depth. */
const PERSPECTIVE = 1.5;
const CHEERS = [
  { streak: 8, jp: "かんぺき!", en: "PERFECT" },
  { streak: 5, jp: "さいこう!", en: "AWESOME" },
  { streak: 3, jp: "すごい!", en: "GREAT" },
  { streak: 0, jp: "いいね!", en: "NICE" },
] as const;
const CALLOUT_GLYPHS = "はじめまして!かんぺきさいこうすごいいいねおしいスピードアップ";
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

type Projection = { y: number; k: number };
type Particle = { kind: "spark" | "shard" | "dust" | "confetti" | "ring"; x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; color: number; gravity: number };

class FireflyScene extends Phaser.Scene {
  private paint!: Phaser.GameObjects.Graphics;
  private actors!: Phaser.GameObjects.Graphics;
  private effects!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private glow!: Phaser.GameObjects.Image;
  private hero!: Phaser.GameObjects.Sprite;
  private ghosts: Phaser.GameObjects.Sprite[] = [];
  private fox!: Phaser.GameObjects.Sprite;
  private trees: Phaser.GameObjects.Image[] = [];
  private spirits = new Map<string, Phaser.GameObjects.Sprite>();
  private rescues = new Map<string, { age: number; lane: number }>();
  private labels: Phaser.GameObjects.Text[] = [];
  private labelKeys: string[] = [];
  private gateAges = new Map<number, number>();
  private particles: Particle[] = [];
  private cheer!: Phaser.GameObjects.Text;
  private cheerSub!: Phaser.GameObjects.Text;
  private cheerAt = -9;
  private pops: { text: Phaser.GameObjects.Text; at: number; x: number; y: number }[] = [];
  private flash = { at: -9, color: 0xffffff, strength: 0 };
  private hopAt = -9;
  private stumbleAt = -9;
  private punchAt = -9;
  private surgeAt = -9;
  private trail: number[] = [];
  private lean = 0;
  private run = 0;
  private lastStep = 0;
  private lastStage = 0;
  private last = 0;
  private age = 0;
  constructor(private view: FireflyView, private host: HTMLElement) { super("firefly-rescue"); }
  create() {
    makeForestArt(this, true); makeFireflyArt(this);
    const resolution = Math.min(2, window.devicePixelRatio || 1);
    this.paint = this.add.graphics().setDepth(0);
    for (let i = 0; i < 18; i++) this.trees.push(this.add.image(0, 0, `forest-tree-${i % 3}`).setDepth(2));
    this.actors = this.add.graphics().setDepth(3);
    this.glow = this.add.image(0, 0, "forest-glow").setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < 12; i++) {
      this.labels.push(this.add.text(0, 0, "", { fontFamily: LABEL_FONT, fontSize: "20px", color: "#f5e9c8", align: "center" })
        .setOrigin(.5).setDepth(5).setVisible(false).setResolution(resolution));
      this.labelKeys.push("");
    }
    // Japanese glyphs arrive in font subsets; redraw labels once a subset lands.
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    const redraw = () => { this.labelKeys.fill(""); this.cheer.updateText(); };
    fonts?.addEventListener("loadingdone", redraw);
    void fonts?.load(`40px ${LABEL_FONT}`, CALLOUT_GLYPHS).catch(() => undefined);
    this.events.once("destroy", () => fonts?.removeEventListener("loadingdone", redraw));
    for (let i = 0; i < 2; i++) this.ghosts.push(this.add.sprite(0, 0, "forest-player", 4).setOrigin(.5, .85).setDepth(6.5).setVisible(false));
    this.hero = this.add.sprite(0, 0, "forest-player", 4).setOrigin(.5, .85).setDepth(7);
    this.fox = this.add.sprite(0, 0, "forest-fox", 0).setOrigin(.5, .8).setDepth(7);
    this.effects = this.add.graphics().setDepth(8);
    this.overlay = this.add.graphics().setDepth(9);
    this.cheer = this.add.text(0, 0, "", { fontFamily: LABEL_FONT, fontSize: "40px", fontStyle: "bold", color: "#ffe08a", stroke: "#2f1f0c", strokeThickness: 7, align: "center" })
      .setOrigin(.5).setDepth(10).setVisible(false).setResolution(resolution);
    this.cheerSub = this.add.text(0, 0, "", { fontFamily: LABEL_FONT, fontSize: "12px", fontStyle: "bold", color: "#fff4d6", stroke: "#10262a", strokeThickness: 4, align: "center" })
      .setOrigin(.5).setDepth(10).setVisible(false).setResolution(resolution).setLetterSpacing(2);
    for (let i = 0; i < 3; i++) {
      const text = this.add.text(0, 0, "", { fontFamily: LABEL_FONT, fontSize: "18px", fontStyle: "bold", color: "#fff1b8", stroke: "#2b2210", strokeThickness: 4 })
        .setOrigin(.5).setDepth(10).setVisible(false).setResolution(resolution);
      this.pops.push({ text, at: -9, x: 0, y: 0 });
    }
    // One sizing owner: Phaser RESIZE reads cached parent bounds, which can
    // overwrite a ResizeObserver update during mobile rotation. With NONE,
    // the settled host dimensions control both the world and display size.
    const resize = () => {
      const { clientWidth: width, clientHeight: height } = this.host;
      if (width > 0 && height > 0) {
        if (this.scale.width !== width || this.scale.height !== height) this.scale.resize(width, height);
        this.game.canvas.style.width = `${width}px`;
        this.game.canvas.style.height = `${height}px`;
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(this.host); resize();
    this.events.once("shutdown", () => observer.disconnect());
    this.events.once("destroy", () => observer.disconnect());
    this.last = performance.now();
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      this.game.canvas.dataset["ready"] = "true"; this.view.ready();
    });
  }
  private spirit(key: string, id: string, x: number, y: number, scale: number, frame: number) {
    let image = this.spirits.get(key);
    if (!image) {
      image = this.add.sprite(x, y, `rescue-${id}`, frame).setDepth(6);
      this.spirits.set(key, image);
    }
    image.setVisible(true).setPosition(x, y).setFrame(frame).setScale(scale);
  }
  private label(index: number, text: string, x: number, y: number, size: number, color: string, alpha: number, scale: number) {
    const label = this.labels[index]!, key = `${text}|${size}|${color}`;
    if (this.labelKeys[index] !== key) {
      this.labelKeys[index] = key;
      label.setText(text).setFontSize(size).setColor(color).updateText();
    }
    label.setVisible(true).setPosition(x, y).setAlpha(alpha).setScale(scale);
  }
  private burstOf(kind: Particle["kind"], x: number, y: number, count: number, speed: [number, number], colors: number[], extra: Partial<Particle> = {}) {
    for (let i = 0; i < count && this.particles.length < 220; i++) {
      const angle = Math.random() * Math.PI * 2, v = speed[0] + Math.random() * (speed[1] - speed[0]);
      this.particles.push({
        kind, x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - (kind === "spark" ? 80 : 0), age: 0,
        life: .45 + Math.random() * .4, size: 1.8 + Math.random() * 2.2, color: colors[i % colors.length]!, gravity: 320, ...extra,
      });
    }
  }
  private say(main: string, sub: string, color: string) {
    this.cheer.setText(main).setColor(color);
    this.cheerSub.setText(sub);
    this.cheerAt = this.age;
  }
  private popScore(text: string, x: number, y: number) {
    const slot = this.pops.reduce((oldest, pop) => (pop.at < oldest.at ? pop : oldest));
    slot.text.setText(text);
    Object.assign(slot, { at: this.age, x, y });
  }
  /** A gate has just been answered: celebrate a hit, cushion a miss. */
  private react(e: FireflyEntity, laneAt: (lane: number, k: number) => number, plateY: number, w: number) {
    const s = this.view.state, c = e.content!, still = this.view.reducedMotion;
    const intro = c.mode === "intro", hit = intro || e.chosen === c.answer;
    const x = laneAt(e.chosen ?? 1, 1);
    const fontSize = Math.round(Math.min(46, w * .105));
    this.cheer.setFontSize(fontSize);
    if (hit) {
      const charged = !intro && s.gateStreak > 0 && s.gateStreak % 3 === 0;
      this.burstOf("spark", x, plateY, still ? 8 : charged ? 44 : 28, [120, charged ? 380 : 300], [0xffe59c, 0xfff6d8, 0xf7c96b, 0xbff0a8]);
      this.particles.push({ kind: "ring", x, y: plateY, vx: 0, vy: 0, age: 0, life: .5, size: 18, color: charged ? 0xfff0b0 : 0xffe59c, gravity: 0 });
      if (!still && (charged || s.gateStreak >= 5)) {
        for (let i = 0; i < 26; i++) {
          this.particles.push({ kind: "confetti", x: Math.random() * w, y: plateY - 220 - Math.random() * 60, vx: (Math.random() - .5) * 90, vy: 40 + Math.random() * 80,
            age: 0, life: 1.1 + Math.random() * .5, size: 3 + Math.random() * 2, color: [0xf7d47c, 0xa8dda3, 0x9cdde7, 0xffabb4, 0xdfc1f5][i % 5]!, gravity: 220 });
        }
      }
      this.flash = { at: this.age, color: charged ? 0xffe39a : 0xfff2c4, strength: charged ? .24 : .12 };
      if (!still) { this.hopAt = this.age; this.punchAt = this.age; }
      const cheer = intro ? { jp: "はじめまして!", en: "NEW WORD" } : CHEERS.find((tier) => s.gateStreak >= tier.streak)!;
      this.say(cheer.jp, charged ? `${cheer.en} · +1 BURST` : s.gateStreak >= 8 ? `${cheer.en} ×${s.gateStreak}` : cheer.en, charged ? "#fff1a8" : "#ffe08a");
      this.popScore(`+${intro ? 25 : 50 * multiplierOf(Math.max(0, s.chain - 1))}`, x, plateY - 34);
    } else {
      this.burstOf("shard", x, plateY, still ? 4 : 14, [80, 220], [0x7a3a42, 0xc98a86, 0x4a2a31], { gravity: 620 });
      this.flash = { at: this.age, color: 0xff8a7a, strength: .15 };
      if (!still) { this.cameras.main.shake(200, .007); this.stumbleAt = this.age; }
      this.say("おしい!", "SO CLOSE · IT COMES BACK", "#ffc9b8");
    }
  }
  /** Word gates: three lantern plates per row. After a choice, the right word glows and drifts to Aki. */
  private drawGates(f: Phaser.GameObjects.Graphics, w: number, plateH: number, heroX: number, heroY: number, project: (lead: number) => Projection, laneAt: (lane: number, k: number) => number) {
    const v = this.view, s = v.state;
    const plateW = Math.min(150, w * .27);
    let used = 0;
    for (const e of s.events) {
      if (e.kind !== "gate" || !e.content) continue;
      const lead = e.time - s.elapsed;
      if (lead > s.sight) continue;
      let progress = 0;
      if (e.resolved) {
        if (!this.gateAges.has(e.id)) {
          this.gateAges.set(e.id, this.age);
          this.react(e, laneAt, heroY - plateH * .65, w);
        }
        progress = Math.min(1, (this.age - this.gateAges.get(e.id)!) / .85);
        if (progress >= 1) continue;
      }
      const c = e.content, intro = c.mode === "intro", hit = intro || e.chosen === c.answer;
      const enter = Math.min(1, (s.sight - lead) / .35);
      const { y: ground, k } = e.resolved ? { y: heroY, k: 1 } : project(lead);
      const y = ground - plateH * .65 * k;
      for (let lane = 0; lane < 3; lane++) {
        const x = laneAt(lane, k), answer = intro || lane === c.answer, chosen = e.resolved && e.chosen === lane;
        let alpha = enter, scale = k, px = x, py = y;
        let fill = intro ? 0x6b5731 : 0x163b3d, stroke = intro ? 0xffd98a : 0xd9c48b, text = intro ? "#fff3cf" : "#f5e9c8";
        if (e.resolved) {
          if (hit) {
            if (chosen) { scale = 1 + progress * .35; alpha = 1 - progress; fill = 0x3d6b4a; stroke = 0xfff0b8; }
            else alpha = Math.max(0, 1 - progress * 2.5) * .35;
          } else if (chosen) {
            fill = 0x4a2a31; stroke = 0xc98a86; text = "#e8c2bb"; alpha = Math.max(0, 1 - progress * 1.6) * .75;
            if (!v.reducedMotion) py = y + progress * 26;
          } else if (answer) {
            // The right word comes to Aki so the miss ends on the correct form.
            fill = 0x2f5b45; stroke = 0xfff0b8; text = "#fff6d2"; alpha = 1 - Math.max(0, progress - .65) / .35;
            if (!v.reducedMotion) { const ease = 1 - Math.pow(1 - progress, 3); px = x + (heroX - x) * ease; py = y - ease * 46; }
          } else alpha = Math.max(0, 1 - progress * 2.5) * .25;
        }
        if (alpha <= .01) continue;
        const pw = plateW * scale, ph = plateH * scale;
        f.fillStyle(0x08171c, .3 * alpha).fillEllipse(px, py + ph * .95, pw * .85, 11 * scale);
        f.lineStyle(3 * scale, 0x8d685e, alpha).lineBetween(px - pw / 2 + 6, py - ph / 2 - 7, px - pw / 2 + 6, py + ph * .9)
          .lineBetween(px + pw / 2 - 6, py - ph / 2 - 7, px + pw / 2 - 6, py + ph * .9);
        f.fillStyle(0xa66452, alpha).fillRoundedRect(px - pw / 2 - 5, py - ph / 2 - 12 * scale, pw + 10, 7 * scale, 3);
        if (intro || (e.resolved && answer && !hit)) f.fillStyle(0xffe6a0, .1 * alpha).fillCircle(px, py, pw * .62);
        f.fillStyle(fill, .95 * alpha).fillRoundedRect(px - pw / 2, py - ph / 2, pw, ph, 10 * scale);
        f.lineStyle(2, stroke, .85 * alpha).strokeRoundedRect(px - pw / 2, py - ph / 2, pw, ph, 10 * scale);
        // Long readings wrap onto two lines rather than shrinking past legibility on small phones.
        const chars = [...c.labels[lane]!];
        let word = chars.join(""), fit = (plateW - 14) / Math.max(1.6, chars.length) * 1.02;
        if (fit < 13 && chars.length > 4) {
          const half = Math.ceil(chars.length / 2);
          word = `${chars.slice(0, half).join("")}\n${chars.slice(half).join("")}`;
          fit = Math.min((plateW - 14) / half * 1.02, plateH * .4);
        }
        const size = Math.round(Math.max(13, Math.min(plateH * .56, fit)));
        if (used < this.labels.length) this.label(used++, word, px, py + 1, size, text, alpha, scale);
      }
    }
    for (let i = used; i < this.labels.length; i++) this.labels[i]!.setVisible(false);
  }
  private drawEffects(w: number, h: number, step: number) {
    const fx = this.effects, still = this.view.reducedMotion;
    fx.clear();
    this.particles = this.particles.filter((p) => (p.age += step) < p.life);
    for (const p of this.particles) {
      p.vy += p.gravity * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      const t = p.age / p.life, fade = 1 - t;
      if (p.kind === "ring") fx.lineStyle(3 * fade + 1, p.color, fade * .9).strokeCircle(p.x, p.y, p.size + t * 90);
      else if (p.kind === "dust") fx.fillStyle(p.color, .3 * fade).fillCircle(p.x, p.y, p.size * (1 + t * 1.6));
      else if (p.kind === "confetti") fx.fillStyle(p.color, Math.min(1, fade * 2)).fillRect(p.x, p.y, p.size * (1 + Math.sin(p.age * 14) * .6), p.size);
      else if (p.kind === "shard") fx.fillStyle(p.color, fade).fillRect(p.x - p.size, p.y - p.size * .6, p.size * 2.4, p.size * 1.4);
      else {
        fx.fillStyle(p.color, fade * .25).fillCircle(p.x, p.y, p.size * 2.6);
        fx.fillStyle(p.color, fade).fillCircle(p.x, p.y, p.size);
      }
    }
    // The callout pops in, holds, then drifts up and fades.
    const t = this.age - this.cheerAt;
    const visible = t >= 0 && t < 1.05;
    this.cheer.setVisible(visible); this.cheerSub.setVisible(visible);
    if (visible) {
      const pop = still ? 1 : t < .12 ? .5 + t / .12 * .75 : t < .24 ? 1.25 - (t - .12) / .12 * .25 : 1;
      const alpha = t < .72 ? 1 : 1 - (t - .72) / .33, rise = still ? 0 : t * 22;
      const y = h * .4 - rise;
      this.cheer.setPosition(w / 2, y).setScale(pop).setAlpha(alpha);
      this.cheerSub.setPosition(w / 2, y + this.cheer.height * .5 * pop + 10).setAlpha(alpha);
    }
    for (const pop of this.pops) {
      const age = this.age - pop.at, show = age >= 0 && age < .8;
      pop.text.setVisible(show);
      if (show) pop.text.setPosition(pop.x, pop.y - age * 60).setAlpha(1 - age / .8).setScale(still ? 1 : 1 + Math.max(0, .18 - age) * 2);
    }
    const o = this.overlay, flash = this.age - this.flash.at;
    o.clear();
    if (flash >= 0 && flash < .3) o.fillStyle(this.flash.color, this.flash.strength * (1 - flash / .3) * (still ? .5 : 1)).fillRect(0, 0, w, h);
    const punch = this.age - this.punchAt;
    this.cameras.main.setZoom(!still && punch >= 0 && punch < .22 ? 1 + .035 * (1 - punch / .22) : 1);
  }
  override update() {
    const now = performance.now(), dt = Math.max(0, (now - this.last) / 1000);
    this.last = now;
    this.view.tick(dt);
    const v = this.view, s = v.state, w = this.scale.width, h = this.scale.height;
    const moving = !v.paused && (s.phase === "running" || s.phase === "delivery");
    const step = moving ? Math.min(.1, dt) : 0;
    this.age += step;
    const a = v.reducedMotion ? 0 : this.age;
    const p = palettes[s.stage]!, g = this.paint, f = this.actors;
    const unit = Math.max(1.1, Math.min(1.65, w / 280));
    const heroY = h * .72;
    // Everything travels from just below the lantern call to Aki over one sight window;
    // the start leaves room for a whole gate plate so no word enters under the call.
    const plateH = Math.max(40, Math.min(58, w * .125));
    const top = Math.min(heroY - 120, Math.max(60, v.trackTop + plateH * 1.15 + 12));
    const span = heroY - top, slope = span * PERSPECTIVE / s.sight;
    const project = (lead: number): Projection => {
      if (lead >= 0) { const d = Math.max(0, 1 - lead / s.sight); return { y: top + span * Math.pow(d, PERSPECTIVE), k: FAR + (1 - FAR) * d }; }
      return { y: heroY - lead * slope, k: Math.min(1.25, 1 - lead / s.sight * (1 - FAR)) };
    };
    const laneAt = (lane: number, k: number) => w / 2 + (lane - 1) * w * .3 * (.8 + .2 * (k - FAR) / (1 - FAR));
    // Side scenery keeps pace with the ground beside Aki, where speed is felt most.
    const heroX = laneAt(s.playerLane, 1), travel = s.elapsed * slope;
    const lantern = Phaser.Display.Color.HexStringToColor(LANTERNS.find(l => l.id === v.lantern)!.color).color;
    if (s.stage !== this.lastStage) {
      this.lastStage = s.stage;
      this.surgeAt = this.age;
      this.say("スピードアップ!", "THE TRAIL QUICKENS", "#bfeaff");
    }
    g.clear(); f.clear(); this.spirits.forEach(sprite => sprite.setVisible(false));
    g.fillGradientStyle(p.sky, p.sky, p.bottom, p.bottom).fillRect(0, 0, w, h);
    // The path breathes through vegetation; the river uses the same readable crossing.
    g.fillStyle(p.edge, .35).fillRoundedRect(w * .055, 0, w * .89, h, 45);
    g.fillStyle(p.path, .85).fillRoundedRect(w * .09, -50, w * .82, h + 100, 70);
    g.fillStyle(0xd2d8ad, .035).fillRect(w * .12, 0, w * .76, h);
    // Ground detail is pinned to the trail, so it shares the depth of everything on it.
    const near = -(h - heroY) / slope - .2;
    for (let n = Math.ceil((s.elapsed + near) / .17); n * .17 < s.elapsed + s.sight; n++) {
      const { y, k } = project(n * .17 - s.elapsed), x = w / 2 + (hash(n) - .5) * w * .74 * (.8 + .2 * (k - FAR) / (1 - FAR));
      g.fillStyle(n % 3 === 0 ? p.accent : p.edge, .15).fillRoundedRect(x, y, (8 + n % 5 * 3) * k, (3 + n % 3 * 2) * k, 2);
    }
    for (let n = Math.ceil((s.elapsed + near) / .55); n * .55 < s.elapsed + s.sight; n++) {
      const { y, k } = project(n * .55 - s.elapsed);
      for (let lane = 0; lane < 3; lane++) g.fillStyle(p.accent, .05).fillEllipse(laneAt(lane, k), y, w * .21 * k, 30 * k);
    }
    if (s.stage === 1) {
      for (let side = 0; side < 2; side++) {
        g.fillStyle(0x193e5c, .8).fillRect(side ? w * .91 : 0, 0, w * .09, h);
        for (let i = 0; i < 15; i++) {
          const y = (i * 75 + travel * .9) % h;
          g.lineStyle(1, 0x92d7e1, .18).lineBetween(side ? w - 26 : 3, y, side ? w - 4 : 24, y);
        }
      }
    }
    for (let i = 0; i < this.trees.length; i++) {
      const side = i % 2, y = ((Math.floor(i / 2) * 150 + travel) % (h + 220)) - 100;
      this.trees[i]!.setPosition(side ? w + 20 + i % 3 * 8 : -20 - i % 3 * 8, y)
        .setScale((.9 + (i % 3) * .15) * unit).setTint(s.stage === 2 ? 0x8c93b3 : s.stage === 1 ? 0x7ca8ad : 0xbad3a6).setAlpha(.9);
    }
    if (s.stage === 0) for (let i = 0; i < 12; i++) {
      const x = i < 6 ? i * 6 - 8 : w - (i - 6) * 6 + 8, y = ((i * 81 + travel * .85) % (h + 200)) - 100;
      g.fillStyle(0x65826a, .42).fillRect(x, y, 4, 160);
      for (let n = 0; n < 5; n++) g.fillStyle(0xa6ba88, .25).fillRect(x - 1, y + n * 30, 6, 2);
    }
    // Lanterns mark the last ascent and frame the delivery.
    if (s.stage === 2) for (let i = 0; i < 10; i++) {
      const x = i % 2 ? w * .94 : w * .06, y = (Math.floor(i / 2) * 165 + travel) % (h + 165) - 50;
      g.lineStyle(2, 0x8d685e).lineBetween(x, y - 30, x, y + 30);
      g.fillStyle(0xf3bd79, .11).fillCircle(x, y, 28);
      g.fillStyle(0xdea773).fillRoundedRect(x - 7, y - 9, 14, 18, 4);
      g.lineStyle(1, 0x7a5647).strokeRoundedRect(x - 7, y - 9, 14, 18, 4);
    }
    // Speed lines rise with the pace and surge when a new stage begins.
    const surge = Math.max(0, 1 - (this.age - this.surgeAt) / 1.6);
    const rush = v.reducedMotion || !moving ? 0 : Math.min(1, Math.max(0, (s.pace - .95) / .45) + surge * .8 + (s.burstRemaining > 0 ? .4 : 0));
    if (rush > 0) for (let i = 0; i < 16; i++) {
      const x = w * (.06 + hash(i + 40) * .88), length = (26 + hash(i) * 40) * (1 + rush);
      const y = top + ((i * 97 + travel * 2.4) % (h - top + length)) - length;
      g.lineStyle(i % 3 === 0 ? 2 : 1, 0xf2f6df, (.05 + hash(i + 7) * .12) * rush).lineBetween(x, y, x, y + length);
    }
    if (s.stage === 2 && s.stageTime > 24) {
      const y = s.phase === "delivery" ? heroY - 130 : -110 + (s.stageTime - 24) / 6 * (heroY - 20);
      g.fillStyle(0xf5cb85, .07).fillCircle(w / 2, y + 65, 160);
      g.fillStyle(0xa66452).fillRect(w * .19, y, 13, 145).fillRect(w * .81 - 13, y, 13, 145);
      g.fillStyle(0xc58661).fillRect(w * .14, y - 7, w * .72, 15).fillRect(w * .19, y + 24, w * .62, 9);
      g.fillStyle(0x243c3c).fillRoundedRect(w * .1, y - 17, w * .8, 14, 5);
      g.fillStyle(lantern).fillRoundedRect(w / 2 - 10, y + 25, 20, 27, 3);
    }
    const frame = v.reducedMotion ? 0 : Math.floor(this.run) % 4;
    for (const e of s.events) {
      const lead = e.time - s.elapsed;
      if (e.kind === "gate" || lead > s.sight || lead < -.7 || e.resolved) continue;
      const { y, k } = project(lead), x = laneAt(e.lane, k);
      if (e.kind === "firefly") {
        f.fillStyle(0xf9d66c, .07).fillCircle(x, y, 16 * k);
        f.fillStyle(0xffe59c, .9).fillEllipse(x, y, 7 * k, 9 * k);
        f.fillStyle(0xffffdd).fillRect(x - 1, y - 3 * k, 2, 4 * k);
        f.lineStyle(1, 0xffe9a5, .5).lineBetween(x - 7 * k, y - 1, x + 7 * k, y - 1);
      } else if (e.kind === "hazard") {
        const radius = 24 * unit * k, u = k;
        f.fillStyle(0x081d24, .4).fillEllipse(x, y + 13 * u, radius * 2, 18 * u);
        f.fillStyle(0x593e4b).fillRoundedRect(x - radius, y - 8 * u, radius * 2, 22 * u, 6);
        f.lineStyle(3, 0xa87379).lineBetween(x - radius + 4, y + 6 * u, x + radius - 4, y - 3 * u);
        for (let j = 0; j < 5; j++) {
          const bx = x - radius + 9 * u + j * (radius * 2 - 18 * u) / 4;
          f.fillStyle(0xc28b87).fillTriangle(bx - 5 * u, y, bx, y - (19 + j % 2 * 5) * u, bx + 4 * u, y + u);
        }
        f.fillStyle(0xf3c6a2).fillTriangle(x - 4 * u, y - 29 * u, x, y - 36 * u, x + 4 * u, y - 29 * u);
      } else if (e.spirit) {
        const color = Phaser.Display.Color.HexStringToColor(SPIRITS.find(t => t.id === e.spirit)!.color).color, c = unit * k;
        f.fillStyle(color, .08).fillCircle(x, y, 40 * k);
        this.spirit(e.id.toString(), e.spirit, x, y, 1.05 * c, frame);
        f.lineStyle(3, 0xd7b881).strokeRoundedRect(x - 22 * c, y - 25 * c, 44 * c, 49 * c, 14 * k);
        f.lineStyle(1.5, 0xe5c58f, .8);
        f.lineBetween(x - 10 * c, y - 22 * c, x - 10 * c, y + 23 * c);
        f.lineBetween(x + 10 * c, y - 22 * c, x + 10 * c, y + 23 * c);
        f.fillStyle(0xffdc93).fillRect(x - 5 * k, y + 19 * c, 10 * k, 8 * k);
        f.lineStyle(1, 0xf6d699, .45).strokeCircle(x, y - 30 * c, 5 * k);
      }
    }
    this.drawGates(f, w, plateH, heroX, heroY, project, laneAt);

    // Aki runs: the stride quickens with the pace, each footfall lifts dust,
    // lane changes lean into the turn, a hit hops through the gate and a miss stumbles.
    if (moving && s.phase === "running") this.run += step * 9 * s.pace;
    const stride = Math.floor(this.run);
    if (stride !== this.lastStep) {
      this.lastStep = stride;
      if (!v.reducedMotion && stride % 2 === 0 && s.phase === "running") {
        this.particles.push({ kind: "dust", x: heroX + (stride % 4 === 0 ? -6 : 6) * unit, y: heroY - 2, vx: (Math.random() - .5) * 30, vy: slope * s.pace,
          age: 0, life: .42, size: 3 * unit, color: 0xd9dcb8, gravity: 0 });
      }
    }
    const drift = s.lane - s.playerLane;
    const hop = this.age - this.hopAt, stumble = this.age - this.stumbleAt;
    const lift = hop >= 0 && hop < .34 ? Math.sin(hop / .34 * Math.PI) * 16 * unit : 0;
    const wobble = stumble >= 0 && stumble < .45 ? Math.sin(stumble * 38) * (1 - stumble / .45) * .28 : 0;
    const bob = v.reducedMotion || s.phase !== "running" ? 0 : Math.abs(Math.sin(this.run * Math.PI / 2)) * 2.6 * unit;
    this.lean += (Math.max(-.3, Math.min(.3, drift * .24)) - this.lean) * Math.min(1, dt * 16);
    const heroTop = heroY - lift - bob;
    this.trail.unshift(heroX);
    this.trail.length = Math.min(this.trail.length, 8);
    this.ghosts.forEach((ghost, i) => {
      const x = this.trail[(i + 1) * 3], show = !v.reducedMotion && x !== undefined && Math.abs(drift) > .05;
      ghost.setVisible(show);
      if (show) ghost.setPosition(x, heroTop).setScale(unit).setFrame(4 + frame).setRotation(this.lean).setTint(lantern).setAlpha(.3 - i * .13);
    });
    const burst = s.burstRemaining > 0;
    if (burst) {
      f.fillStyle(lantern, .12).fillEllipse(heroX, heroTop - 15, 115, 160);
      f.lineStyle(2, lantern, .65).strokeEllipse(heroX, heroTop - 15, 100, 120);
      for (let i = 0; i < 5; i++) f.lineStyle(2, lantern, .24).lineBetween(heroX - 32 + i * 16, heroY + 10, heroX - 32 + i * 16, heroY + 62 + i % 2 * 15);
    }
    if (s.shield) f.lineStyle(2, 0xb7deed, .7).strokeCircle(heroX, heroTop - 15, 36 * unit);
    f.fillStyle(0x061a1f, .35).fillEllipse(heroX, heroY + 2, (30 - lift * .6) * unit, 9 * unit);
    const flare = Math.max(0, 1 - hop / .5);
    this.glow.setPosition(heroX + 20, heroTop - 15).setTint(lantern).setScale((burst ? 2.7 : 1.65) + flare * .6).setAlpha(.85);
    this.hero.setPosition(heroX, heroTop).setScale(unit).setFrame(4 + frame).setRotation(this.lean + wobble)
      .setAlpha(s.immunityRemaining > 0 && !burst && !v.reducedMotion ? .6 + Math.sin(a * 30) * .3 : 1);
    const foxBob = v.reducedMotion || s.phase !== "running" ? 0 : Math.abs(Math.sin(this.run * Math.PI / 2 + 1)) * 2 * unit;
    this.fox.setPosition(heroX - 25 * unit, heroY + 19 - foxBob).setScale(unit * .8).setFrame(frame).setRotation(this.lean * .6);
    const swing = v.reducedMotion ? 0 : Math.sin(this.run * Math.PI / 2) * 2;
    f.lineStyle(2, 0xd4ae6b).lineBetween(heroX + 16 * unit, heroTop - 24, heroX + 23 * unit, heroTop - 24 + swing);
    f.fillStyle(lantern).fillRoundedRect(heroX + 20 * unit, heroTop - 21 + swing, 10 * unit, 14 * unit, 3);
    s.rescued.forEach((id, i) => {
      if (!this.rescues.has(id)) {
        const cage = s.events.find(e => e.kind === "cage" && e.spirit === id);
        this.rescues.set(id, { age: this.age, lane: cage?.lane ?? s.lane });
      }
      const rescue = this.rescues.get(id)!;
      const progress = v.reducedMotion ? 1 : Math.min(1, (this.age - rescue.age) / .7);
      const row = Math.floor(i / 4), col = i % 4;
      let x = s.phase === "delivery" ? w / 2 + Math.cos(i / Math.max(1, s.rescued.length) * Math.PI * 2 + a * .25) * w * .26 : heroX + (col - 1.5) * 24;
      let y = s.phase === "delivery" ? heroY - 105 + Math.sin(i / Math.max(1, s.rescued.length) * Math.PI * 2 + a * .25) * 45 : heroY + 46 + row * 22 + Math.sin(a * 2 + i) * 3;
      if (progress < 1) {
        const origin = laneAt(rescue.lane, 1), ease = 1 - Math.pow(1 - progress, 3);
        x = origin + (x - origin) * ease;
        y = heroY + (y - heroY) * ease - Math.sin(progress * Math.PI) * 42;
        f.lineStyle(2, 0xffdfa3, (1 - progress) * .8).strokeCircle(origin, heroY - 12, 25 + progress * 55);
        for (let shard = 0; shard < 8; shard++) {
          const angle = shard / 8 * Math.PI * 2, radius = 24 + progress * 45;
          const sx = origin + Math.cos(angle) * radius, sy = heroY - 12 + Math.sin(angle) * radius;
          f.lineStyle(3, 0xffdfa3, 1 - progress).lineBetween(sx, sy, sx + Math.cos(angle) * 9, sy + Math.sin(angle) * 9);
        }
      }
      this.spirit(`follower-${id}`, id, x, y, (.85 + (1 - progress) * .35) * unit, frame);
    });
    // Quiet motes remain outside the route so collectibles are unmistakable.
    for (let i = 0; i < 20; i++) {
      const x = i % 2 ? w - 12 - i % 4 * 7 : 12 + i % 4 * 7;
      const y = ((i * 71 + a * 8) % h);
      f.fillStyle(p.accent, .25 + Math.sin(a + i) * .1).fillCircle(x, y, 1.4);
    }
    g.fillGradientStyle(0x061d25, 0x061d25, 0x061d25, 0x061d25, .85, .85, 0, 0).fillRect(0, 0, w, 125);
    g.fillGradientStyle(0x061d25, 0x061d25, 0x061d25, 0x061d25, 0, 0, .95, .95).fillRect(0, h - 110, w, 110);
    this.drawEffects(w, h, step);
    this.game.canvas.dataset["phase"] = s.phase;
    this.game.canvas.dataset["lane"] = String(s.lane);
  }
}
export function mountFirefly(host: HTMLElement, view: FireflyView) {
  return new Phaser.Game({
    type: Phaser.AUTO, parent: host, backgroundColor: "#102e31", pixelArt: true,
    scale: { mode: Phaser.Scale.NONE, width: host.clientWidth, height: host.clientHeight },
    fps: { target: 60, limit: 60 }, audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false }, scene: [new FireflyScene(view, host)],
  });
}

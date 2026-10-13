import Phaser from "phaser";
import type { RoadId } from "@/data";
import type { StopState } from "@/lib/journey";
import type { Grade } from "../forest/areas";
import { makeForestArt, regradeTexture } from "../forest/art";
import { seeded } from "../forest/world";
import { worldLayout, WORLD_WIDTH, type WorldNode } from "./layout";

/** What the map shows. React derives it from the save; the scene only draws it. */
export type WorldView = {
  states: ReadonlyMap<number, StopState>;
  /** Journey index of the learner's next checkpoint (or their sealed road's last stop). */
  here: number;
};

export type WorldBridge = {
  view: WorldView;
  /** Bumped whenever `view` changes, so the scene redraws only then. */
  version: number;
  blocked: boolean;
  reducedMotion: boolean;
  selected: number | null;
  onReady: () => void;
  /** The avatar arrived at a stop by tap, keys or travel. */
  onArrive: (index: number) => void;
  /** The camera's centre moved into another road's land. */
  onRoad: (road: RoadId) => void;
  /** The camp tent at the trailhead was tapped. */
  onCamp: () => void;
  /** Journey index to stand on at start instead of `view.here` (a return from a checkpoint). */
  focus?: number;
  walkTo?: (index: number) => void;
  step?: (direction: 1 | -1) => void;
  showRoad?: (road: RoadId) => void;
  recenter?: () => void;
  /** Sleep the whole loop while a panel or the title covers the map (the last frame stays drawn). */
  sleep?: (asleep: boolean) => void;
};

type Season = {
  ground: [string, string, string, string];
  road: number;
  /** Tree species, each recoloured by one of the season's grades (picked at random). */
  trees: readonly number[];
  grades: readonly Grade[];
  weather: "petal" | "rain" | "leaf" | "snow";
  sky: number;
};

const SAME: Grade = { hue: 0, sat: 1, light: 1 };
// South to north, one year: spring woods, rainy season, autumn, first snow, deep winter.
const SEASONS: Record<RoadId, Season> = {
  N5: { ground: ["#3b6a49", "#447652", "#30593e", "#e9b9c8"], road: 0xb9a978, trees: [0, 1, 2], grades: [SAME], weather: "petal", sky: 0x2b5a45 },
  N4: { ground: ["#2e5550", "#38625b", "#264840", "#8fa8dc"], road: 0x8b9087, trees: [3, 3, 0], grades: [{ hue: 16, sat: 0.7, light: 0.88 }], weather: "rain", sky: 0x22423e },
  N3: { ground: ["#6a5a35", "#7a683b", "#5a4a2c", "#c8643a"], road: 0xc6a46c, trees: [0, 1, 2], grades: [{ hue: -100, sat: 1.25, light: 1.12 }, { hue: -128, sat: 1.35, light: 1.05 }, { hue: -82, sat: 1.1, light: 1.1 }], weather: "leaf", sky: 0x5a4a2c },
  N2: { ground: ["#7d8c83", "#93a198", "#6c7b72", "#e6ecea"], road: 0xb6bab0, trees: [3, 3, 0], grades: [{ hue: 8, sat: 0.4, light: 1.3 }], weather: "snow", sky: 0x6c7b72 },
  N1: { ground: ["#c5d0d5", "#d9e2e6", "#b1bfc5", "#ffffff"], road: 0xeaf0f2, trees: [3], grades: [{ hue: 20, sat: 0.18, light: 1.75 }], weather: "snow", sky: 0xb1bfc5 },
};

// Weather is decoration around the camera: capped, paused with the map, off for reduced motion.
const MAX_WEATHER = 150;
const WALK_SPEED = 4.5; // stops per second
const LONGEST_WALK = 2.4; // seconds; far travel speeds up instead of dragging on

export class WorldScene extends Phaser.Scene {
  private bridge: WorldBridge;
  private layout = worldLayout();
  private path!: Phaser.Curves.Spline;
  private player!: Phaser.GameObjects.Sprite;
  private fox!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private trail!: Phaser.GameObjects.Graphics;
  private rings!: Phaser.GameObjects.Graphics;
  private stops: { node: WorldNode; image: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }[] = [];
  private hereFlag!: Phaser.GameObjects.Container;
  private selectRing!: Phaser.GameObjects.Ellipse;
  private weather = new Map<Season["weather"], Phaser.GameObjects.Particles.ParticleEmitter>();
  private at = 0;
  private walk: { from: number; to: number; elapsed: number; duration: number } | null = null;
  private walking = 0;
  private version = -1;
  private road: RoadId | null = null;
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private following = true;
  private weatherStill = false;
  private elapsed = 0;
  private followY = 0;
  private waves!: Phaser.GameObjects.Graphics;
  private coast = 0;

  constructor(bridge: WorldBridge) {
    super("world");
    this.bridge = bridge;
    this.at = bridge.focus ?? bridge.view.here;
  }

  create() {
    makeForestArt(this);
    this.makeTextures();
    const { nodes, bands, height, summit } = this.layout;
    this.path = new Phaser.Curves.Spline(nodes.map((n) => new Phaser.Math.Vector2(n.x, n.y)));

    for (const band of bands) {
      this.add.tileSprite(0, band.top, WORLD_WIDTH, band.bottom - band.top, `world-ground-${band.road.id}`).setOrigin(0).setDepth(-100);
    }
    // Soft seams where one season gives way to the next.
    const seams = this.add.graphics().setDepth(-95);
    for (const band of bands.slice(1)) {
      const below = SEASONS[bands[band.roadIndex - 1]!.road.id].sky;
      for (let k = 0; k < 6; k++) seams.fillStyle(below, 0.12).fillRect(0, band.bottom - k * 14, WORLD_WIDTH, 14);
    }

    // The Tōkaidō sets out from the coast: sand, sea, and a camp at the trailhead.
    const shore = this.add.graphics().setDepth(-96);
    const coast = height - 260;
    shore.fillStyle(0xd8c48e, 1).fillRect(0, coast - 70, WORLD_WIDTH, 80);
    shore.fillStyle(0xc9b47d, 1).fillRect(0, coast - 20, WORLD_WIDTH, 30);
    shore.fillStyle(0x2f7f88, 1).fillRect(0, coast, WORLD_WIDTH, 260);
    shore.fillStyle(0x266c78, 1).fillRect(0, coast + 90, WORLD_WIDTH, 170);
    this.waves = this.add.graphics().setDepth(-94);
    this.coast = coast;
    const first = nodes[0]!;
    const camp = this.add.graphics().setDepth(first.y + 120);
    const { x: tx, y: ty } = this.layout.camp;
    camp.fillStyle(0xffd98a, 0.14).fillEllipse(tx + 10, ty - 28, 210, 130);
    camp.fillStyle(0x172f2b, 0.25).fillEllipse(tx, ty, 110, 30);
    camp.fillStyle(0xd4a775).fillTriangle(tx, ty - 78, tx - 54, ty - 3, tx + 55, ty - 3);
    camp.fillStyle(0xf0cf92).fillTriangle(tx, ty - 78, tx - 37, ty - 8, tx + 13, ty - 8);
    camp.fillStyle(0x38493b).fillTriangle(tx, ty - 59, tx - 13, ty - 3, tx + 23, ty - 3);
    // A small fire and a signboard: the camp is a place you can visit.
    camp.fillStyle(0x6b4a2e).fillRect(tx + 62, ty - 6, 18, 4);
    camp.fillStyle(0xf0a64a).fillTriangle(tx + 71, ty - 24, tx + 62, ty - 6, tx + 80, ty - 6);
    camp.fillStyle(0xffe1a1).fillTriangle(tx + 71, ty - 15, tx + 67, ty - 6, tx + 75, ty - 6);
    const campBoard = this.add.graphics();
    campBoard.fillStyle(0x1b2e29, 0.88).fillRoundedRect(-64, -15, 128, 30, 7);
    campBoard.lineStyle(2, 0xe9c580, 0.85).strokeRoundedRect(-64, -15, 128, 30, 7);
    this.add.container(tx, ty + 32, [
      campBoard,
      this.add.text(0, 0, "野営 · CAMP", { fontFamily: "sans-serif", fontSize: "12px", fontStyle: "bold", color: "#f4e8cc", letterSpacing: 2 }).setOrigin(0.5),
    ]).setDepth(first.y + 121);
    const campZone = this.add.zone(tx, ty - 22, 180, 140).setInteractive({ useHandCursor: true }).setDepth(first.y + 122);
    campZone.on("pointerup", () => { if (!this.drag?.moved && !this.bridge.blocked) this.bridge.onCamp(); });
    this.add.text(first.x, coast - 92, "出発 · THE JOURNEY BEGINS", { fontFamily: "serif", fontSize: "16px", color: "#2a3b33" }).setOrigin(0.5).setDepth(first.y + 121);

    this.drawRoad();
    this.trail = this.add.graphics().setDepth(-80);
    this.rings = this.add.graphics().setDepth(-70);
    this.plantTrees();

    for (const band of bands) {
      const { road, gate } = band;
      if (road.level) {
        this.add.image(gate.x, gate.y + 40, "forest-torii").setScale(1.6).setOrigin(0.5, 1).setDepth(gate.y + 40);
      } else {
        // The northern barrier: closed until N1's regions are charted.
        this.add.image(gate.x, gate.y + 30, "forest-shrine-0").setScale(1.4).setOrigin(0.5, 1).setDepth(gate.y + 30).setTint(0xdfe8ec);
      }
      const side = gate.x > WORLD_WIDTH / 2 ? -1 : 1;
      const sign = this.add.container(gate.x + side * 190, gate.y - 10).setDepth(gate.y + 60);
      const board = this.add.graphics();
      board.fillStyle(0x1b2e29, 0.86).fillRoundedRect(-118, -34, 236, 68, 8);
      board.lineStyle(2, 0xe9c580, 0.8).strokeRoundedRect(-118, -34, 236, 68, 8);
      sign.add([
        board,
        this.add.text(0, -14, `${road.id} · ${road.jp}`, { fontFamily: "serif", fontSize: "22px", color: "#f4e8cc" }).setOrigin(0.5),
        this.add.text(0, 14, road.level ? road.romaji.toUpperCase() : "白河の関 · UNCHARTED", { fontFamily: "sans-serif", fontSize: "11px", color: "#e9c580", letterSpacing: 3 }).setOrigin(0.5),
      ]);
    }
    this.add.image(summit.x, summit.y + 40, "forest-shrine-1").setScale(1.6).setOrigin(0.5, 1).setDepth(summit.y + 40).setTint(0xf2f6f8);
    this.add.text(summit.x, summit.y + 70, "頂 · JOURNEY’S END", { fontFamily: "serif", fontSize: "18px", color: "#3a4a52" }).setOrigin(0.5).setDepth(summit.y + 70);

    for (const node of nodes) {
      const image = this.add.image(node.x, node.y, "world-stop-locked").setDepth(node.y + 1);
      const label = this.add.text(node.x, node.y + 1, "", { fontFamily: "serif", fontSize: "15px", fontStyle: "bold", color: "#f4e8cc", stroke: "#1b2e29", strokeThickness: 3 }).setOrigin(0.5).setDepth(node.y + 2);
      if (node.ch !== undefined) {
        image.setInteractive({ useHandCursor: true, hitArea: new Phaser.Geom.Circle(24, 24, 30), hitAreaCallback: Phaser.Geom.Circle.Contains });
        image.on("pointerup", () => { if (!this.drag?.moved && !this.bridge.blocked) this.walkTo(node.index); });
      }
      this.stops.push({ node, image, label });
    }

    this.selectRing = this.add.ellipse(0, 0, 70, 70).setStrokeStyle(3, 0xffe1a1, 0.95).setVisible(false).setDepth(height);
    const flagText = this.add.text(0, -18, "YOU ARE HERE", { fontFamily: "sans-serif", fontSize: "11px", fontStyle: "bold", color: "#243e32", backgroundColor: "#eccb8a", padding: { x: 6, y: 3 }, letterSpacing: 2 }).setOrigin(0.5, 1);
    const gem = this.add.text(0, -10, "◆", { fontFamily: "serif", fontSize: "18px", color: "#ffe2a5", stroke: "#354d3f", strokeThickness: 4 }).setOrigin(0.5);
    this.hereFlag = this.add.container(0, 0, [flagText, gem]).setDepth(height + 1);

    const start = this.pointAt(this.at);
    this.shadow = this.add.ellipse(start.x, start.y, 34, 13, 0x132e29, 0.38);
    this.player = this.add.sprite(start.x, start.y, "forest-player", 4).setOrigin(0.5, 0.95).setScale(1.7);
    this.fox = this.add.sprite(start.x - 30, start.y + 20, "forest-fox", 0).setOrigin(0.5, 0.92).setScale(1.55);

    this.makeWeather();
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, height);
    this.resize();
    this.scale.on("resize", this.resize, this);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12, 0, this.followY);
    this.cameras.main.centerOn(start.x, start.y);
    this.setupInput();

    this.bridge.walkTo = (index) => this.walkTo(index);
    this.bridge.step = (direction) => this.walkTo(Math.round(this.at) + direction);
    this.bridge.recenter = () => this.walkTo(this.bridge.view.here);
    this.bridge.sleep = (asleep) => {
      if (asleep) this.game.loop.sleep();
      else this.game.loop.wake();
    };
    this.bridge.showRoad = (road) => {
      const band = this.layout.bands.find((b) => b.road.id === road);
      if (!band) return;
      this.following = false;
      this.cameras.main.stopFollow();
      this.cameras.main.pan(band.gate.x, band.gate.y - 260, this.bridge.reducedMotion ? 0 : 700, "Sine.easeInOut");
    };
    // Destroying the game (leaving the map) emits "destroy", not "shutdown": tear down on both.
    const teardown = () => {
      this.scale?.off("resize", this.resize, this);
      delete this.bridge.walkTo;
      delete this.bridge.step;
      delete this.bridge.recenter;
      delete this.bridge.showRoad;
      delete this.bridge.sleep;
    };
    this.events.once("shutdown", teardown);
    this.events.once("destroy", teardown);

    this.refresh();
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      this.game.canvas.dataset["ready"] = "true";
      this.bridge.onReady();
    });
  }

  private makeTextures() {
    const canvas = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
      const el = document.createElement("canvas");
      el.width = w;
      el.height = h;
      const c = el.getContext("2d")!;
      c.imageSmoothingEnabled = false;
      draw(c);
      this.textures.addCanvas(key, el);
    };
    for (const [id, season] of Object.entries(SEASONS)) {
      canvas(`world-ground-${id}`, 64, 64, (c) => {
        const random = seeded(id.charCodeAt(1) * 31);
        c.fillStyle = season.ground[0];
        c.fillRect(0, 0, 64, 64);
        for (let i = 0; i < 70; i++) {
          c.fillStyle = season.ground[random() > 0.5 ? 1 : 2];
          c.fillRect(Math.floor(random() * 64), Math.floor(random() * 64), 1 + Math.floor(random() * 3), 1);
        }
        for (let i = 0; i < 3; i++) {
          c.fillStyle = season.ground[3];
          c.fillRect(Math.floor(random() * 62), Math.floor(random() * 62), 2, 2);
        }
      });
    }
    const stop = (key: string, fill: string, rim: string, glyph?: { text: string; color: string }, glow?: string) =>
      canvas(key, 48, 48, (c) => {
        c.fillStyle = "#10201d55";
        c.beginPath();
        c.ellipse(24, 40, 18, 6, 0, 0, 7);
        c.fill();
        if (glow) {
          const g = c.createRadialGradient(24, 22, 2, 24, 22, 24);
          g.addColorStop(0, glow);
          g.addColorStop(1, "#00000000");
          c.fillStyle = g;
          c.fillRect(0, 0, 48, 48);
        }
        c.fillStyle = rim;
        c.beginPath();
        c.arc(24, 22, 17, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = fill;
        c.beginPath();
        c.arc(24, 22, 14, 0, Math.PI * 2);
        c.fill();
        if (glyph) {
          c.fillStyle = glyph.color;
          c.font = "bold 17px serif";
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText(glyph.text, 24, 23);
        }
      });
    stop("world-stop-sealed", "#b8442f", "#e6c28a", { text: "印", color: "#f6e9cf" });
    stop("world-stop-perfect", "#b8442f", "#f2c447", { text: "印", color: "#fff3cf" }, "#f6d36a66");
    stop("world-stop-open", "#3d5a4c", "#efcb7e", undefined, "#ffd98a88");
    stop("world-stop-locked", "#4a5752", "#6f7c76");
    stop("world-stop-ghost", "#c9d4d899", "#e8eef1aa");
    canvas("world-petal", 4, 3, (c) => { c.fillStyle = "#f3c4d2"; c.fillRect(0, 0, 4, 2); c.fillStyle = "#e9a6bb"; c.fillRect(1, 2, 2, 1); });
    canvas("world-leaf", 4, 4, (c) => { c.fillStyle = "#d8743c"; c.fillRect(0, 1, 4, 2); c.fillStyle = "#b8542c"; c.fillRect(1, 0, 2, 4); });
    canvas("world-snow", 3, 3, (c) => { c.fillStyle = "#ffffff"; c.fillRect(1, 0, 1, 3); c.fillRect(0, 1, 3, 1); });
  }

  private pointAt(at: number): Phaser.Math.Vector2 {
    const last = this.layout.nodes.length - 1;
    return this.path.getPoint(Math.max(0, Math.min(last, at)) / last);
  }

  /** The road itself: a broad path in each season's colour with a dotted footpath on top. */
  private drawRoad() {
    const { nodes } = this.layout;
    const road = this.add.graphics().setDepth(-90);
    for (let i = 0; i < nodes.length - 1; i++) {
      const color = SEASONS[nodes[i]!.road.id].road;
      const points = Array.from({ length: 9 }, (_, k) => this.pointAt(i + k / 8));
      road.lineStyle(34, 0x10201d, 0.22).strokePoints(points.map((p) => new Phaser.Math.Vector2(p.x, p.y + 4)));
      road.lineStyle(28, color, 1).strokePoints(points);
      road.lineStyle(20, Phaser.Display.Color.ValueToColor(color).lighten(8).color, 1).strokePoints(points);
    }
  }

  /** The walked stretch, lit gold from each seal to the next stop; plus step progress arcs. */
  private drawTrail() {
    const { nodes } = this.layout;
    const { states } = this.bridge.view;
    this.trail.clear();
    this.rings.clear();
    for (let i = 0; i < nodes.length - 1; i++) {
      const ch = nodes[i]!.ch;
      const state = ch === undefined ? undefined : states.get(ch);
      const points = Array.from({ length: 9 }, (_, k) => this.pointAt(i + k / 8));
      if (state?.status === "sealed") this.trail.lineStyle(6, 0xf0c873, 0.9).strokePoints(points);
      else
        for (let k = 0; k < points.length; k += 2) this.trail.fillStyle(0x10201d, 0.28).fillCircle(points[k]!.x, points[k]!.y, 2);
    }
    for (const node of nodes) {
      const state = node.ch === undefined ? undefined : states.get(node.ch);
      if (state?.status !== "open") continue;
      for (let s = 0; s < 4; s++) {
        const start = -Math.PI / 2 + (s * Math.PI) / 2 + 0.12;
        this.rings.lineStyle(4, s < state.steps ? 0xf0c873 : 0x10201d, s < state.steps ? 1 : 0.35);
        this.rings.beginPath().arc(node.x, node.y - 2, 26, start, start + Math.PI / 2 - 0.24).strokePath();
      }
    }
  }

  private plantTrees() {
    const { nodes } = this.layout;
    const random = seeded(733);
    const samples = Array.from({ length: (nodes.length - 1) * 4 + 1 }, (_, k) => this.pointAt(k / 4));
    for (const node of nodes) {
      const season = SEASONS[node.road.id];
      for (let k = 0; k < 11; k++) {
        const x = 20 + random() * (WORLD_WIDTH - 40),
          y = node.y - 40 + random() * 80,
          size = 0.7 + random() * 0.5,
          variant = season.trees[Math.floor(random() * season.trees.length)]!,
          grade = Math.floor(random() * season.grades.length);
        // Keep the whole tree, canopy included, off the road, its stops and the gates.
        const scale = size * 1.5,
          halfWidth = 46 * scale + 34,
          canopyTop = y - 112 * scale - 40;
        const covers = (p: { x: number; y: number }) => Math.abs(p.x - x) < halfWidth && p.y > canopyTop && p.y < y + 34;
        const near = samples.slice(Math.max(0, (node.index - 5) * 4), (node.index + 6) * 4);
        if (near.some(covers)) continue;
        if (this.layout.bands.some((b) => covers(b.gate) || covers({ x: b.gate.x + 190, y: b.gate.y }) || covers({ x: b.gate.x - 190, y: b.gate.y }))) continue;
        const key = `world-tree-${node.road.id}-${grade}-${variant}`;
        regradeTexture(this, `forest-tree-${variant}`, key, season.grades[grade]!);
        this.add.image(x, y, key).setOrigin(0.5, 0.91).setScale(scale).setDepth(y);
      }
    }
  }

  private makeWeather() {
    const camera = this.cameras.main;
    const zone = {
      type: "random" as const,
      source: {
        getRandomPoint: (point: Phaser.Types.Math.Vector2Like) => {
          const view = camera.worldView;
          point.x = view.x - 60 + Math.random() * (view.width + 160);
          point.y = view.y - 20 - Math.random() * 40;
        },
      },
    };
    const life = { onEmit: () => ((camera.worldView.height + 80) / 90) * 1000 };
    const config: Record<Season["weather"], [string, Phaser.Types.GameObjects.Particles.ParticleEmitterConfig]> = {
      petal: ["world-petal", { speedY: { min: 50, max: 90 }, speedX: { min: -40, max: 30 }, rotate: { min: 0, max: 360 }, scale: { min: 1.2, max: 2 }, frequency: 120, lifespan: life }],
      rain: ["forest-rain", { speedY: { min: 560, max: 700 }, speedX: { min: -110, max: -80 }, rotate: 9, scaleY: { min: 1.2, max: 2 }, alpha: { start: 0.65, end: 0.25 }, frequency: 18, quantity: 2, lifespan: { onEmit: () => ((camera.worldView.height + 80) / 620) * 1000 } }],
      leaf: ["world-leaf", { speedY: { min: 60, max: 110 }, speedX: { min: -70, max: 10 }, rotate: { min: 0, max: 360 }, scale: { min: 1.3, max: 2.1 }, frequency: 140, lifespan: life }],
      snow: ["world-snow", { speedY: { min: 40, max: 80 }, speedX: { min: -25, max: 25 }, scale: { min: 0.9, max: 1.8 }, alpha: { min: 0.6, max: 1 }, frequency: 70, lifespan: life }],
    };
    for (const [kind, [texture, settings]] of Object.entries(config) as [Season["weather"], (typeof config)[Season["weather"]]][]) {
      const emitter = this.add.particles(0, 0, texture, { ...settings, emitZone: zone, maxAliveParticles: MAX_WEATHER, emitting: false });
      emitter.setDepth(this.layout.height + 2);
      this.weather.set(kind, emitter);
    }
  }

  private setupInput() {
    const camera = this.cameras.main;
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => { this.drag = { x: pointer.x, y: pointer.y, moved: false }; });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.drag || !pointer.isDown || this.bridge.blocked) return;
      const dx = pointer.x - this.drag.x,
        dy = pointer.y - this.drag.y;
      if (!this.drag.moved && Math.hypot(dx, dy) < 8) return;
      this.drag.moved = true;
      this.following = false;
      camera.stopFollow();
      camera.scrollX -= dx / camera.zoom;
      camera.scrollY -= dy / camera.zoom;
      this.drag.x = pointer.x;
      this.drag.y = pointer.y;
    });
    this.input.on("pointerup", () => { this.time.delayedCall(0, () => { this.drag = null; }); });
    this.input.on("wheel", (_p: Phaser.Input.Pointer, _o: unknown, dx: number, dy: number) => {
      if (this.bridge.blocked) return;
      this.following = false;
      camera.stopFollow();
      camera.scrollX += dx / camera.zoom;
      camera.scrollY += dy / camera.zoom;
    });
    const keys = (event: KeyboardEvent) => {
      if (this.bridge.blocked || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      // North is up the map and further along the journey.
      const direction = key === "arrowup" || key === "w" || key === "arrowright" || key === "d" ? 1 : key === "arrowdown" || key === "s" || key === "arrowleft" || key === "a" ? -1 : 0;
      if (!direction || event.repeat && this.walk) return;
      event.preventDefault();
      this.walkTo(Math.round(this.at) + direction);
    };
    window.addEventListener("keydown", keys);
    const release = () => window.removeEventListener("keydown", keys);
    this.events.once("shutdown", release);
    this.events.once("destroy", release);
  }

  private resize() {
    // Fill the width on wide screens; on phones keep stops large enough to tap.
    const zoom = Math.max(0.62, Math.min(1.25, this.scale.width / WORLD_WIDTH));
    this.cameras.main.setZoom(zoom);
    // Narrow screens put the checkpoint panel under the avatar, so keep the avatar high.
    this.followY = this.scale.width < 700 ? -(this.scale.height * 0.08) / zoom : 0;
    this.cameras.main.setFollowOffset(0, this.followY);
  }

  private walkTo(index: number) {
    const target = Math.max(0, Math.min(this.layout.nodes.length - 1, index));
    this.following = true;
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12, 0, this.followY);
    const distance = Math.abs(target - this.at);
    if (distance < 0.01) {
      this.bridge.onArrive(target);
      return;
    }
    const duration = this.bridge.reducedMotion ? 0 : Math.min(LONGEST_WALK, distance / WALK_SPEED);
    this.walk = { from: this.at, to: target, elapsed: 0, duration };
    if (!duration) this.finishWalk();
  }

  private finishWalk() {
    if (!this.walk) return;
    this.at = this.walk.to;
    this.walk = null;
    this.bridge.onArrive(Math.round(this.at));
  }

  /** Redraw stop states, the lit trail and the "you are here" flag after a save change. */
  private refresh() {
    this.version = this.bridge.version;
    const { states, here } = this.bridge.view;
    for (const { node, image, label } of this.stops) {
      const state = node.ch === undefined ? undefined : states.get(node.ch);
      const key = !state ? "world-stop-ghost" : state.status === "sealed" ? (state.perfect ? "world-stop-perfect" : "world-stop-sealed") : state.status === "open" ? "world-stop-open" : "world-stop-locked";
      image.setTexture(key).setAlpha(state?.status === "locked" ? 0.88 : 1);
      label.setText(!state || state.status === "sealed" ? "" : String(node.regionIndex + 1)).setColor(state?.status === "open" ? "#ffe9b8" : "#c2ccc6");
    }
    this.drawTrail();
    const flag = this.layout.nodes[here]!;
    this.hereFlag.setPosition(flag.x, flag.y - 28);
  }

  override update(_time: number, delta: number) {
    if (this.bridge.version !== this.version) this.refresh();
    this.game.loop.setFPSLimit(this.bridge.blocked ? 20 : 60);
    if (!this.bridge.blocked) this.elapsed += Math.min(delta, 50);
    const t = this.bridge.reducedMotion ? 0 : this.elapsed / 1000;

    let moving = false,
      north = true;
    if (this.walk && !this.bridge.blocked) {
      this.walk.elapsed += delta / 1000;
      const f = Math.min(1, this.walk.elapsed / this.walk.duration);
      const eased = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
      north = this.walk.to > this.walk.from;
      this.at = this.walk.from + (this.walk.to - this.walk.from) * eased;
      moving = true;
      if (f >= 1) this.finishWalk();
    }
    const p = this.pointAt(this.at);
    this.player.setPosition(p.x, p.y).setDepth(p.y + 3);
    this.shadow.setPosition(p.x, p.y + 1).setDepth(p.y + 2);
    if (moving) {
      this.walking += delta;
      this.player.setFrame((north ? 1 : 0) * 4 + (Math.floor(this.walking / 120) % 4));
    } else this.player.setFrame(0);
    const behind = this.pointAt(this.at - (north ? 0.45 : -0.45));
    this.fox.setPosition(behind.x - 18, behind.y + 12).setDepth(behind.y + 2).setFrame(moving ? Math.floor(this.walking / 140) % 4 : 0).setFlipX(behind.x > p.x);

    this.hereFlag.y = this.layout.nodes[this.bridge.view.here]!.y - 28 + Math.sin(t * 2.4) * 4;
    this.waves.clear().lineStyle(2, 0xbfe3df, 0.45);
    for (let i = 0; i < 22; i++) {
      const y = this.coast + 14 + (i % 6) * 38,
        x = ((i * 173 + t * (18 + (i % 3) * 6)) % (WORLD_WIDTH + 80)) - 40;
      this.waves.lineBetween(x, y, x + 26, y);
    }
    const selected = this.bridge.selected === null ? undefined : this.layout.nodes[this.bridge.selected];
    this.selectRing.setVisible(!!selected);
    if (selected) this.selectRing.setPosition(selected.x, selected.y - 2).setScale(1 + Math.sin(t * 4) * 0.05);

    // The land under the camera's centre sets the weather and the HUD's road.
    const centre = this.cameras.main.worldView.centerY;
    const band = this.layout.bands.find((b) => centre >= b.top && centre < b.bottom) ?? this.layout.bands[0]!;
    if (band.road.id !== this.road) {
      this.road = band.road.id;
      for (const [kind, emitter] of this.weather) emitter.emitting = kind === SEASONS[band.road.id].weather && !this.bridge.reducedMotion;
      this.bridge.onRoad(band.road.id);
    }
    const still = this.bridge.blocked || this.bridge.reducedMotion;
    if (still !== this.weatherStill) {
      this.weatherStill = still;
      for (const emitter of this.weather.values()) {
        if (still) emitter.pause();
        else emitter.resume();
        emitter.setVisible(!this.bridge.reducedMotion);
      }
    }
    if (!this.following && this.walk) this.following = true;

    // Read-only diagnostics for QA, like the forest's.
    const canvas = this.game.canvas.dataset;
    canvas["stop"] = String(Math.round(this.at));
    canvas["here"] = String(this.bridge.view.here);
    canvas["road"] = band.road.id;
    const view = this.cameras.main.worldView, zoom = this.cameras.main.zoom;
    canvas["campX"] = String(Math.round((this.layout.camp.x - view.x) * zoom));
    canvas["campY"] = String(Math.round((this.layout.camp.y - 22 - view.y) * zoom));
  }
}

export function mountWorld(parent: HTMLElement, bridge: WorldBridge) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#2b5a45",
    pixelArt: true,
    antialias: false,
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    audio: { noAudio: true },
    scene: [new WorldScene(bridge)],
    render: { roundPixels: true },
  });
}

import Phaser from "phaser";
import { KODAMA, type AreaDefinition } from "./areas";
import { grader, makeForestArt } from "./art";
import {
  approachOf,
  distance,
  findPath,
  movePlayer,
  riverX,
  seeded,
  treesOf,
  WORLD,
  type Point,
} from "./world";

export type ForestBridge = {
  blocked: boolean;
  restored: number;
  delivered?: boolean;
  preview: boolean;
  reducedMotion: boolean;
  /** The stretch of the Spirit Trail to build. Defaults to Kodama Woods. */
  area?: AreaDefinition;
  onReady: () => void;
  onNear: (site: number | null) => void;
  onInteract: () => void;
  onMote: (count: number) => void;
  navigate?: () => void;
  celebrate?: () => void;
};

// Rain is decoration: a hard cap keeps phones at frame rate however long the walk.
const MAX_RAIN = 260;

/** Deterministic 0–1 noise for scenery that must not consume the seeded streams. */
const noise = (n: number) => {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

export class ForestScene extends Phaser.Scene {
  private bridge: ForestBridge;
  private area: AreaDefinition;
  private player!: Phaser.GameObjects.Sprite;
  private fox!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private foxShadow!: Phaser.GameObjects.Ellipse;
  private pos: Point;
  private foxPos: Point;
  private rain?: Phaser.GameObjects.Particles.ParticleEmitter;
  private rainStill = false;
  private keys = new Set<string>();
  private path: Point[] = [];
  private near: number | null = null;
  private direction = 0;
  private walking = 0;
  private lastRestored = -1;
  private lastDelivered = false;
  private landmarks!: Phaser.GameObjects.Group;
  private marker!: Phaser.GameObjects.Container;
  private ripples!: Phaser.GameObjects.Graphics;
  private motes: {
    sprite: Phaser.GameObjects.Image;
    glow: Phaser.GameObjects.Image;
    point: Point;
    taken: boolean;
  }[] = [];
  private elapsed = 0;
  private lastBlocked = false;
  private fpsLimit = 0;
  constructor(bridge: ForestBridge) {
    super("forest");
    this.bridge = bridge;
    this.area = bridge.area ?? KODAMA;
    this.pos = { ...this.area.start };
    this.foxPos = { x: this.area.start.x - 42, y: this.area.start.y + 18 };
  }

  create() {
    const area = this.area,
      shrine = area.shrine;
    makeForestArt(this, false, area);
    this.add
      .image(0, 0, "forest-ground")
      .setOrigin(0)
      .setScale(2)
      .setDepth(-100);
    this.ripples = this.add.graphics().setDepth(-90);
    const random = seeded(401);
    for (const tree of treesOf(area))
      this.add
        .image(tree.x, tree.y, `forest-tree-${tree.variant}`)
        .setOrigin(0.5, 0.91)
        .setScale(tree.size * 1.9)
        .setDepth(tree.y);
    for (let i = 0; i < 32; i++) {
      const y = 80 + i * 27,
        x = riverX(y, area) + (i % 2 ? 88 : -94);
      if (Math.abs(y - area.crossing.y) > 55)
        this.add
          .image(x, y, "forest-rock")
          .setScale(1.2 + random())
          .setOrigin(0.5, 0.8)
          .setDepth(y);
    }
    this.add
      .image(shrine.x, shrine.y, "forest-shrine-0")
      .setScale(2)
      .setOrigin(0.5, 1)
      .setDepth(shrine.y - 5);
    this.add
      .image(shrine.x - 1, shrine.y + 114, "forest-torii")
      .setScale(1.6)
      .setOrigin(0.5, 1)
      .setDepth(shrine.y + 112);
    for (const p of area.shrineLanterns)
      this.add
        .image(p.x, p.y, "forest-lantern-0")
        .setScale(1.5)
        .setOrigin(0.5, 1)
        .setDepth(p.y);
    for (const prop of area.props) {
      if (prop.kind === "inn") {
        this.add.ellipse(prop.x, prop.y - 2, 330, 40, 0x10201d, 0.3).setDepth(prop.y - 1);
        this.add.image(prop.x, prop.y, "forest-inn").setScale(2).setOrigin(0.5, 1).setDepth(prop.y);
        continue;
      }
      const { x, y } = prop;
      const camp = this.add.graphics().setDepth(y + 6);
      camp.fillStyle(0x172f2b, 0.25).fillEllipse(x, y, 110, 30);
      camp.fillStyle(0xd4a775).fillTriangle(x, y - 78, x - 54, y - 3, x + 55, y - 3);
      camp.fillStyle(0xf0cf92).fillTriangle(x, y - 78, x - 37, y - 8, x + 13, y - 8);
      camp.fillStyle(0x38493b).fillTriangle(x, y - 59, x - 13, y - 3, x + 23, y - 3);
      camp.lineStyle(3, 0x69553a).lineBetween(x, y - 79, x, y + 1);
    }
    this.landmarks = this.add.group();
    this.shadow = this.add.ellipse(
      this.pos.x,
      this.pos.y + 1,
      34,
      13,
      0x132e29,
      0.38,
    );
    this.foxShadow = this.add.ellipse(
      this.foxPos.x,
      this.foxPos.y + 1,
      30,
      10,
      0x132e29,
      0.3,
    );
    this.player = this.add
      .sprite(this.pos.x, this.pos.y, "forest-player", 0)
      .setOrigin(0.5, 0.95)
      .setScale(1.7);
    this.fox = this.add
      .sprite(this.foxPos.x, this.foxPos.y, "forest-fox", 0)
      .setOrigin(0.5, 0.92)
      .setScale(1.55);
    for (const point of area.motes)
      this.motes.push({
        point,
        taken: false,
        glow: this.add
          .image(point.x, point.y - 12, "forest-glow")
          .setScale(0.8)
          .setDepth(point.y + 10),
        sprite: this.add
          .image(point.x, point.y - 12, "forest-spark")
          .setScale(1.8)
          .setDepth(point.y + 11),
      });
    const ring = this.add
      .ellipse(0, 0, 68, 26)
      .setStrokeStyle(2, 0xefce89, 0.75);
    const gem = this.add
      .text(0, -94, "◆", {
        fontFamily: "serif",
        fontSize: "24px",
        color: "#ffe2a5",
        stroke: "#354d3f",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.marker = this.add
      .container(area.sites[0].x, area.sites[0].y, [ring, gem])
      .setDepth(1800);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.resize();
    this.scale.on("resize", this.resize, this);
    if (this.bridge.preview) this.cameras.main.centerOn(area.previewCenter.x, area.previewCenter.y);
    else
      this.cameras.main.startFollow(
        this.player,
        true,
        this.bridge.reducedMotion ? 1 : 0.09,
        this.bridge.reducedMotion ? 1 : 0.09,
        -40,
        10,
      );
    const down = (event: KeyboardEvent) => {
      if (
        this.bridge.blocked ||
        this.bridge.preview ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      const key = event.key.toLowerCase();
      if (
        key === " " &&
        (event.target instanceof HTMLButtonElement ||
          event.target instanceof HTMLAnchorElement)
      )
        return;
      if (
        [
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          "w",
          "a",
          "s",
          "d",
          "e",
          " ",
        ].includes(key)
      ) {
        event.preventDefault();
        this.keys.add(key);
      }
      if ((key === "e" || key === " ") && !event.repeat && this.near !== null)
        this.bridge.onInteract();
    };
    const up = (event: KeyboardEvent) =>
      this.keys.delete(event.key.toLowerCase());
    const blur = () => {
      this.keys.clear();
      this.path = [];
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.bridge.blocked || this.bridge.preview) return;
      const p = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const site = area.sites[this.bridge.restored];
      if (site && distance(p, site) < 65 && this.near !== null) {
        this.bridge.onInteract();
        return;
      }
      this.path = findPath(
        this.pos,
        site && distance(p, site) < 65 ? approachOf(site) : p,
        this.bridge.restored,
        area,
      );
      if (this.path.length) {
        const dot = this.add
          .ellipse(p.x, p.y, 22, 9)
          .setStrokeStyle(2, 0xf7df9e)
          .setDepth(999);
        this.tweens.add({
          targets: dot,
          alpha: 0,
          scale: 1.8,
          duration: this.bridge.reducedMotion ? 80 : 650,
          onComplete: () => dot.destroy(),
        });
      }
    });
    this.bridge.navigate = () => {
      const site = area.sites[this.bridge.restored];
      if (!site || this.bridge.blocked) return;
      this.path = findPath(this.pos, approachOf(site), this.bridge.restored, area);
    };
    this.bridge.celebrate = () => this.burst(this.pos.x, this.pos.y - 35);
    // Unmounting destroys the game, which emits "destroy" rather than "shutdown": handle both.
    const teardown = () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      this.scale?.off("resize", this.resize, this);
      delete this.bridge.navigate;
      delete this.bridge.celebrate;
    };
    this.events.once("shutdown", teardown);
    this.events.once("destroy", teardown);
    const rays = this.add.graphics().setDepth(1600);
    rays.fillStyle(0xffe6a8, 0.035);
    for (const x of area.rays)
      rays.fillTriangle(x, 0, x - 230, 740, x - 95, 740);
    if (area.weather === "rain") this.makeRain();
    this.refreshLandmarks();
    // Keep the loading screen until textures have actually reached the renderer.
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      this.game.canvas.dataset["ready"] = "true";
      this.bridge.onReady();
    });
  }
  private resize() {
    const w = this.scale.width,
      h = this.scale.height;
    this.cameras.main.setZoom(
      this.bridge.preview
        ? Math.max(w / 1430, h / 850)
        : w < 600
          ? 0.92
          : Math.min(1.45, Math.max(1, h / 650)),
    );
    if (this.bridge.preview) this.cameras.main.centerOn(this.area.previewCenter.x, this.area.previewCenter.y);
  }
  /** Wind-blown rain spawned just above whatever the camera can see, in world space. */
  private makeRain() {
    const camera = this.cameras.main;
    this.rain = this.add.particles(0, 0, "forest-rain", {
      emitZone: {
        type: "random",
        source: {
          getRandomPoint: (point) => {
            const view = camera.worldView;
            point.x = view.x - 80 + Math.random() * (view.width + 220);
            point.y = view.y - 30 - Math.random() * 60;
          },
        },
      },
      speedY: { min: 560, max: 700 },
      speedX: { min: -110, max: -80 },
      rotate: 9,
      scaleX: 1.5,
      scaleY: { min: 1.2, max: 2.1 },
      alpha: { start: 0.7, end: 0.3 },
      // Each drop lives only as long as it takes to cross the visible world, so the cap buys density.
      lifespan: { onEmit: () => ((camera.worldView.height + 90) / 630) * 1000 },
      frequency: 16,
      quantity: 3,
      maxAliveParticles: MAX_RAIN,
    });
    this.rain.setDepth(1700);
  }
  private burst(x: number, y: number) {
    if (this.bridge.reducedMotion) return;
    for (let i = 0; i < 16; i++) {
      const theta = (i / 16) * Math.PI * 2;
      const spark = this.add
        .image(x, y, "forest-spark")
        .setDepth(1900)
        .setScale(0.9 + (i % 3) * 0.4);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(theta) * 75,
        y: y + Math.sin(theta) * 55 - 24,
        alpha: 0,
        duration: 950,
        ease: "Cubic.Out",
        onComplete: () => spark.destroy(),
      });
    }
  }
  private refreshLandmarks() {
    const restored = this.bridge.preview ? 2 : this.bridge.restored;
    const delivered = !!(
      this.bridge.preview ||
      this.bridge.delivered ||
      restored >= 3
    );
    if (restored === this.lastRestored && delivered === this.lastDelivered)
      return;
    const lightArrived = delivered && !this.lastDelivered;
    this.lastDelivered = delivered;
    const before = this.lastRestored;
    this.lastRestored = restored;
    this.landmarks.clear(true, true);
    const { sites, crossing, shrine } = this.area;
    const tone = grader(this.area.grade),
      hex = (color: number) => parseInt(tone(`#${color.toString(16).padStart(6, "0")}`).slice(1, 7), 16);
    const lantern = this.add
      .image(sites[0].x, sites[0].y, `forest-lantern-${restored >= 1 ? 1 : 0}`)
      .setScale(2)
      .setOrigin(0.5, 1)
      .setDepth(sites[0].y);
    this.landmarks.add(lantern);
    if (restored >= 1)
      this.landmarks.add(
        this.add.image(sites[0].x, sites[0].y - 82, "forest-glow").setScale(2).setDepth(sites[0].y + 1),
      );
    // The crossing, drawn around the point where it spans the water.
    const cx = crossing.x,
      cy = crossing.y;
    const bridge = this.add.graphics().setDepth(cy - 41);
    if (restored >= 2) {
      bridge.fillStyle(0x172d2a, 0.45).fillRect(cx - 86, cy - 22, 178, 68);
      for (let x = cx - 82; x < cx + 95; x += 13) {
        bridge.fillStyle(hex(x % 2 ? 0xa17d4d : 0xb08c56)).fillRect(x, cy - 37, 12, 70);
        bridge.fillStyle(hex(0xd3ac6a)).fillRect(x, cy - 35, 11, 3);
        bridge.fillStyle(hex(0x775e3d)).fillRect(x + 3, cy + 3, 5, 2);
      }
      for (const y of [cy - 38, cy + 31]) {
        bridge.fillStyle(hex(0x6b5033)).fillRect(cx - 91, y, 190, 5);
        bridge.fillStyle(hex(0xd7b178)).fillRect(cx - 91, y - 3, 190, 3);
        for (const x of [cx - 86, cx - 37, cx + 25, cx + 88])
          bridge.fillStyle(hex(0x9f7847)).fillRect(x, y - 18, 6, 22);
      }
    } else {
      for (const x of [cx - 91, cx - 78, cx + 79, cx + 92]) {
        bridge.fillStyle(hex(0x6d6044)).fillRect(x, cy - 30, 11, 62);
        bridge.fillStyle(hex(0xa18b58)).fillRect(x, cy - 28, 9, 3);
      }
    }
    this.landmarks.add(bridge);
    if (!delivered && !this.bridge.preview) {
      const mist = this.add.graphics().setDepth(shrine.y + 150);
      mist.fillStyle(0xb7c6ac, 0.28).fillEllipse(shrine.x - 20, shrine.y + 72, 280, 115);
      mist.fillStyle(0xd8d5b5, 0.19).fillEllipse(shrine.x + 30, shrine.y + 25, 255, 85);
      mist.fillStyle(0x9fae9c, 0.2).fillEllipse(shrine.x - 60, shrine.y + 119, 245, 65);
      this.landmarks.add(mist);
    } else if (delivered) {
      for (const x of [shrine.x - 64, shrine.x + 62])
        this.landmarks.add(
          this.add.image(x, shrine.y + 75, "forest-glow").setScale(1.4).setDepth(shrine.y + 117),
        );
      if (lightArrived && !this.bridge.preview) this.burst(shrine.x, shrine.y + 70);
    }
    if (restored >= 3) {
      this.add
        .image(shrine.x, shrine.y, "forest-shrine-1")
        .setScale(2)
        .setOrigin(0.5, 1)
        .setDepth(shrine.y - 4);
      this.add.image(shrine.x, shrine.y - 48, "forest-glow").setScale(3).setDepth(shrine.y - 3);
      for (const p of this.area.shrineLanterns)
        this.add
          .image(p.x, p.y, "forest-lantern-1")
          .setScale(1.5)
          .setOrigin(0.5, 1)
          .setDepth(p.y + 1);
    }
    if (before >= 0 && restored > before) {
      const site = sites[restored - 1]!;
      this.burst(site.x, site.y - 70);
      if (!this.bridge.reducedMotion)
        this.cameras.main.flash(400, 237, 219, 158, false);
    }
  }
  override update(_time: number, delta: number) {
    this.refreshLandmarks();
    const blocked = this.bridge.blocked || this.bridge.preview;
    // Menus need a still world, not 60 expensive canvas composites behind a dialog.
    const fps = this.bridge.blocked ? 12 : this.bridge.preview ? 24 : 60;
    if (this.fpsLimit !== fps) {
      this.fpsLimit = fps;
      this.game.loop.setFPSLimit(fps);
    }
    if (blocked && !this.lastBlocked) {
      this.keys.clear();
      this.path = [];
    }
    this.lastBlocked = blocked;
    if (!this.bridge.blocked) this.elapsed += Math.min(delta, 50);
    const t = this.bridge.reducedMotion ? 0 : this.elapsed / 1000;
    let dx = 0,
      dy = 0;
    if (!blocked) {
      dx =
        Number(this.keys.has("d") || this.keys.has("arrowright")) -
        Number(this.keys.has("a") || this.keys.has("arrowleft"));
      dy =
        Number(this.keys.has("s") || this.keys.has("arrowdown")) -
        Number(this.keys.has("w") || this.keys.has("arrowup"));
      if (dx || dy) this.path = [];
      else if (this.path.length) {
        const next = this.path[0]!;
        dx = next.x - this.pos.x;
        dy = next.y - this.pos.y;
        if (Math.hypot(dx, dy) < 6) {
          this.path.shift();
          dx = 0;
          dy = 0;
        }
      }
      const next = movePlayer(
        this.pos,
        dx,
        dy,
        delta / 1000,
        this.bridge.restored,
        this.area,
      );
      if (distance(this.pos, next) > 0.1) {
        this.walking += delta;
        this.direction =
          Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 2) : dy > 0 ? 0 : 1;
        this.player.setFrame(
          this.direction * 4 + (Math.floor(this.walking / 130) % 4),
        );
      } else this.player.setFrame(this.direction * 4);
      this.pos = next;
      const gap = distance(this.pos, this.foxPos);
      if (gap > 47) {
        const fraction = Math.min(
          1,
          (gap - 47) / gap,
          ((delta / 1000) * 200) / gap,
        );
        this.foxPos.x += (this.pos.x - this.foxPos.x) * fraction;
        this.foxPos.y += (this.pos.y - this.foxPos.y) * fraction;
        this.fox
          .setFrame(Math.floor(this.walking / 140) % 4)
          .setFlipX(this.pos.x < this.foxPos.x);
      } else this.fox.setFrame(0);
      for (const mote of this.motes)
        if (!mote.taken && distance(this.pos, mote.point) < 32) {
          mote.taken = true;
          mote.sprite.setVisible(false);
          mote.glow.setVisible(false);
          this.burst(mote.point.x, mote.point.y - 12);
          this.bridge.onMote(this.motes.filter((m) => m.taken).length);
        }
    }
    this.player.setPosition(this.pos.x, this.pos.y).setDepth(this.pos.y);
    this.shadow.setPosition(this.pos.x, this.pos.y).setDepth(this.pos.y - 1);
    this.fox.setPosition(this.foxPos.x, this.foxPos.y).setDepth(this.foxPos.y);
    this.foxShadow
      .setPosition(this.foxPos.x, this.foxPos.y)
      .setDepth(this.foxPos.y - 1);
    const site = this.area.sites[this.bridge.restored];
    const near =
      site && distance(this.pos, site) < 90 ? this.bridge.restored : null;
    if (near !== this.near) {
      this.near = near;
      this.bridge.onNear(near);
    }
    this.marker.setVisible(!!site && !this.bridge.preview);
    if (site) this.marker.setPosition(site.x, site.y + Math.sin(t * 2) * 3);
    this.ripples.clear().lineStyle(1, 0xa3d8bc, 0.3);
    for (let i = 0; i < 35; i++) {
      const y = (i * 31 + t * 9) % WORLD.height,
        x = riverX(y, this.area) - 42 + ((i * 19) % 69);
      this.ripples.lineBetween(x, y, x + 13, y);
    }
    if (this.rain) {
      // Rain holds still with the world: in menus, on pause and for reduced motion.
      const still = blocked || this.bridge.reducedMotion;
      if (still !== this.rainStill) {
        this.rainStill = still;
        if (still) this.rain.pause();
        else this.rain.resume();
        this.rain.setVisible(!this.bridge.reducedMotion);
      }
      if (!this.bridge.reducedMotion) {
        // Rings on the wet ground: each one grows, fades, then lands somewhere new in view.
        const view = this.cameras.main.worldView;
        for (let i = 0; i < 14; i++) {
          const cycle = t * 1.15 + i * 0.37,
            n = Math.floor(cycle),
            phase = cycle - n;
          const x = view.x + noise(i * 31 + n * 7.13) * view.width,
            y = view.y + noise(i * 17 + n * 3.71 + 0.5) * view.height;
          this.ripples.lineStyle(1, 0xc9dde3, 0.32 * (1 - phase));
          this.ripples.strokeEllipse(x, y, 4 + phase * 18, 2 + phase * 7);
        }
      }
    }
    for (const [i, mote] of this.motes.entries())
      if (!mote.taken) {
        mote.sprite.y = mote.point.y - 13 + Math.sin(t * 2 + i) * 5;
        mote.glow.setAlpha(0.6 + Math.sin(t + i) * 0.15);
      }
    // Read-only diagnostics for QA; no gameplay bypasses or writable global state.
    this.game.canvas.dataset["area"] = this.area.id;
    this.game.canvas.dataset["playerX"] = String(Math.round(this.pos.x));
    this.game.canvas.dataset["playerY"] = String(Math.round(this.pos.y));
    this.game.canvas.dataset["restored"] = String(this.bridge.restored);
    this.game.canvas.dataset["lanternDelivered"] = String(
      !!this.bridge.delivered,
    );
  }
}

export function mountForest(parent: HTMLElement, bridge: ForestBridge) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: grader((bridge.area ?? KODAMA).grade)("#284c3e"),
    pixelArt: true,
    antialias: false,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth,
      height: parent.clientHeight,
    },
    audio: { noAudio: true },
    scene: [new ForestScene(bridge)],
    render: { roundPixels: true },
  });
}

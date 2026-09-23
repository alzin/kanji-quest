import Phaser from "phaser";
import { makeForestArt } from "./art";
import {
  getDecisionX,
  getGameLayout,
  getGateOpacity,
  type RunnerState,
} from "../runner-math";

export type DashView = {
  state: RunnerState;
  paused: boolean;
  reducedMotion: boolean;
  tick: (seconds: number) => void;
  resize: (width: number, height: number) => void;
  ready: () => void;
};

class LanternRunnerScene extends Phaser.Scene {
  private ground!: Phaser.GameObjects.Graphics;
  private gates!: Phaser.GameObjects.Graphics;
  private player!: Phaser.GameObjects.Sprite;
  private fox!: Phaser.GameObjects.Sprite;
  private glow!: Phaser.GameObjects.Image;
  private lantern!: Phaser.GameObjects.Graphics;
  private trees: {
    image: Phaser.GameObjects.Image;
    index: number;
    layer: number;
  }[] = [];
  private last = 0;
  constructor(private view: DashView) {
    super("lantern-dash");
  }
  create() {
    makeForestArt(this);
    this.ground = this.add.graphics().setDepth(-20);
    for (let layer = 0; layer < 2; layer++)
      for (let i = 0; i < 14; i++) {
        const image = this.add
          .image(0, 0, `forest-tree-${i % 3}`)
          .setOrigin(0.5, 1)
          .setDepth(-10 + layer);
        this.trees.push({ image, index: i, layer });
      }
    this.gates = this.add.graphics().setDepth(0);
    this.glow = this.add.image(0, 0, "forest-glow").setDepth(3);
    this.lantern = this.add.graphics().setDepth(6);
    this.player = this.add
      .sprite(0, 0, "forest-player", 12)
      .setOrigin(0.5, 0.95)
      .setDepth(5);
    this.fox = this.add
      .sprite(0, 0, "forest-fox", 0)
      .setOrigin(0.5, 0.95)
      .setDepth(4)
      .setFlipX(true);
    const resize = () => this.view.resize(this.scale.width, this.scale.height);
    resize();
    this.scale.on("resize", resize);
    this.events.once("shutdown", () => this.scale.off("resize", resize));
    this.last = performance.now();
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      this.game.canvas.dataset["ready"] = "true";
      this.view.ready();
    });
  }
  override update() {
    const now = performance.now();
    this.view.tick(Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const v = this.view,
      s = v.state,
      width = this.scale.width,
      height = this.scale.height;
    const layout = getGameLayout(width, height),
      laneY = (lane: number) =>
        layout.laneTop + (layout.laneSpan * (lane + 0.5)) / 3;
    const dist = v.reducedMotion ? 0 : s.dist,
      g = this.ground,
      gatePaint = this.gates;
    g.clear();
    gatePaint.clear();
    g.fillGradientStyle(0x173c37, 0x375c48, 0x233f2e, 0x102e2a).fillRect(
      0,
      0,
      width,
      height,
    );
    g.fillStyle(0xe0cc86, 0.07).fillTriangle(
      width * 0.65,
      0,
      width * 0.1,
      height,
      width * 0.4,
      height,
    );
    g.fillStyle(0xe0cc86, 0.045).fillTriangle(
      width * 0.68,
      0,
      width * 0.45,
      height,
      width * 0.68,
      height,
    );
    for (const tree of this.trees) {
      const space = (width + 300) / 13;
      const x =
        ((((tree.index * space - dist * (0.12 + tree.layer * 0.15)) %
          (width + 300)) +
          width +
          300) %
          (width + 300)) -
        130;
      tree.image
        .setPosition(x, layout.laneTop + 18 - tree.layer * 9)
        .setScale(tree.layer ? 1.2 : 0.8)
        .setAlpha(tree.layer ? 0.8 : 0.35);
    }
    for (let lane = 0; lane < 3; lane++) {
      const y = laneY(lane),
        h = Math.min(95, layout.laneSpan / 3 - 14);
      g.fillStyle(0x122f29, 0.45).fillRect(0, y + h * 0.38, width, 8);
      g.fillStyle(lane === s.targetLane ? 0x758465 : 0x536c4c, 0.85).fillRect(
        0,
        y - h * 0.3,
        width,
        h * 0.7,
      );
      g.lineStyle(2, 0xc6c38a, lane === s.targetLane ? 0.45 : 0.16).lineBetween(
        0,
        y - h * 0.3,
        width,
        y - h * 0.3,
      );
      for (let i = 0; i < Math.ceil(width / 75) + 1; i++) {
        const x =
          (((i * 75 - dist * 0.75) % (width + 75)) + width + 75) % (width + 75);
        g.fillStyle(0xc6ba7a, 0.22).fillRect(x, y + ((i % 3) - 1) * 9, 17, 3);
        g.fillStyle(0x223e2d, 0.45).fillRect(x + 31, y + h * 0.32 + 7, 3, 6);
      }
    }
    const current = s.gates.find((gate) => gate.resolved === -1);
    for (const gate of s.gates) {
      if (gate !== current && gate.resolved === -1) continue;
      const alpha = getGateOpacity(gate, layout);
      if (gate.x < -50 || gate.x > width + 120 || !alpha) continue;
      // Three torii portals share one decision line. Light marks the chosen lane, not the answer.
      for (let lane = 0; lane < 3; lane++) {
        const y = laneY(lane),
          x = gate.x - (getDecisionX(layout) - layout.playerX),
          h = Math.min(100, layout.laneSpan / 3 - 12);
        const selected = lane === s.targetLane;
        gatePaint
          .fillStyle(gate.resolved === 1 ? 0xe9c779 : 0x98633e, alpha)
          .fillRect(x - 23, y - h * 0.75, 6, h);
        gatePaint.fillRect(x + 17, y - h * 0.75, 6, h);
        gatePaint
          .fillStyle(selected ? 0xf0cc81 : 0xc7975b, alpha)
          .fillRect(x - 34, y - h * 0.78, 68, 7);
        gatePaint.fillRect(x - 27, y - h * 0.57, 54, 4);
        if (selected)
          gatePaint
            .fillStyle(0xf9d692, 0.12 * alpha)
            .fillRect(x - 16, y - h * 0.6, 32, h * 0.8);
      }
      if (gate.resolved === 1 && !v.reducedMotion)
        for (let i = 0; i < 10; i++) {
          const t = gate.sinceResolved,
            a = i * 2.399;
          gatePaint
            .fillStyle(0xffe4a5, Math.max(0, 1 - t))
            .fillCircle(
              layout.playerX + Math.cos(a) * (15 + t * 80),
              laneY(s.targetLane) - 30 + Math.sin(a) * (15 + t * 60),
              2,
            );
        }
    }
    const py = laneY(v.reducedMotion ? s.targetLane : s.lane),
      scale = layout.compact ? 1.7 : 2.3;
    const frame = v.paused || v.reducedMotion ? 0 : Math.floor(s.dist / 22) % 4;
    this.player
      .setFrame(12 + frame)
      .setPosition(layout.playerX, py)
      .setScale(scale);
    this.fox
      .setFrame(frame)
      .setPosition(layout.playerX - (layout.compact ? 34 : 54), py + 13)
      .setScale(scale * 0.7);
    const lx = layout.playerX + 12 * scale,
      ly = py - 7 * scale;
    this.glow
      .setPosition(lx, ly)
      .setScale(layout.compact ? 1.0 : 1.5)
      .setAlpha(0.8);
    this.lantern
      .clear()
      .lineStyle(2, 0xe2c58c)
      .lineBetween(lx, ly - 12 * scale, lx, ly - 5 * scale);
    this.lantern
      .fillStyle(0xf9d28b)
      .fillRoundedRect(
        lx - 4 * scale,
        ly - 5 * scale,
        8 * scale,
        10 * scale,
        2,
      );
    this.lantern
      .lineStyle(2, 0xa27842)
      .strokeRoundedRect(
        lx - 4 * scale,
        ly - 5 * scale,
        8 * scale,
        10 * scale,
        2,
      );
    this.lantern
      .lineStyle(1, 0xffe5a9)
      .lineBetween(lx, ly - 3 * scale, lx, ly + 3 * scale);
    gatePaint
      .lineStyle(1, 0xe9d199, 0.18)
      .lineBetween(
        layout.playerX,
        layout.laneTop - 10,
        layout.playerX,
        layout.laneBottom,
      );
    if (s.flash > 0 && !v.reducedMotion)
      gatePaint
        .lineStyle(8, 0xc97e52, s.flash)
        .strokeRect(4, 4, width - 8, height - 8);
    this.game.canvas.dataset["lane"] = String(s.targetLane);
  }
}
export function mountLanternRunner(host: HTMLElement, view: DashView) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    backgroundColor: "#183d33",
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: host.clientWidth,
      height: host.clientHeight,
    },
    fps: { target: 60, limit: 60 },
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false },
    scene: [new LanternRunnerScene(view)],
  });
}

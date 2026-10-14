import Phaser from "phaser";
import { landingRow, type StackState } from "../stack-math";
import { vocabKana } from "@/lib/words";

export type RiverView = {
  state: StackState;
  paused: boolean;
  reducedMotion: boolean;
  guided: boolean;
  tick: (seconds: number) => void;
  ready: () => void;
};

const CONDENSED = 0.82,
  MIN_FONT = 9;

/** Disposable presentation only. The shared stack simulation owns every placement and reward. */
class RiverStackScene extends Phaser.Scene {
  private paint!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private labelKeys: string[] = [];
  private riverTime = 0;
  private lastTick = 0;
  /** The playfield in CSS pixels; the renderer itself is `pixelRatio` times larger. */
  size = { width: 0, height: 0, pixelRatio: 1 };
  constructor(private view: RiverView) {
    super("river-stones");
  }
  create() {
    this.lastTick = performance.now();
    this.paint = this.add.graphics();
    for (let i = 0; i < this.view.state.cols * this.view.state.rows + 1; i++) {
      this.labels.push(
        this.add
          .text(0, 0, "", {
            fontFamily:
              '"Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", sans-serif',
            fontSize: "20px",
            color: "#f3eacb",
            align: "center",
            padding: { top: 0, bottom: 0 },
          })
          .setOrigin(0.5),
      );
    }
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      this.game.canvas.dataset["ready"] = "true";
      this.view.ready();
    });
  }
  override update(_time: number, delta: number) {
    const v = this.view,
      s = v.state;
    const now = performance.now();
    v.tick(Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;
    if (!this.paint || !this.sys.isActive()) return;
    if (!v.paused && !v.reducedMotion) this.riverTime += delta / 1000;
    const g = this.paint,
      { width, height, pixelRatio } = this.size;
    const camera = this.cameras.main;
    if (camera.zoom !== pixelRatio) camera.setOrigin(0, 0).setZoom(pixelRatio);
    const cw = width / s.cols,
      ch = height / s.rows;
    g.clear();
    g.fillGradientStyle(0x163f3d, 0x163f3d, 0x102b31, 0x102b31, 1);
    g.fillRect(0, 0, width, height);
    for (let c = 0; c < s.cols; c++) {
      g.fillStyle(c % 2 ? 0x96c4ab : 0x142e2c, 0.045).fillRect(
        c * cw,
        0,
        cw,
        height,
      );
      g.lineStyle(1, 0xa2d4be, 0.1).lineBetween(c * cw, 0, c * cw, height);
      for (let r = 0; r < 4; r++) {
        const y =
          ((r * height) / 4 + this.riverTime * (9 + c * 2) + c * 43) % height;
        g.lineStyle(1, 0x7fabaa, 0.18).lineBetween(
          c * cw + cw * 0.32,
          y,
          c * cw + cw * 0.65,
          y,
        );
      }
    }
    this.labels.forEach((label) => label.setVisible(false));
    let labelIndex = 0;
    const draw = (
      text: string,
      col: number,
      row: number,
      kind: string,
      falling = false,
      clearing = false,
    ) => {
      const x = col * cw + 3,
        y = row * ch + 3,
        w = cw - 6,
        h = ch - 6;
      const ink = kind === "G";
      g.fillStyle(0x051e21, 0.65).fillRoundedRect(x, y + 4, w, h, 6);
      g.fillStyle(
        ink ? 0x444c49 : falling ? 0xe1bb6c : 0x325c52,
      ).fillRoundedRect(x, y, w, h - 2, 6);
      g.lineStyle(
        falling ? 2 : 1,
        ink ? 0x7e8580 : falling ? 0xffe0a0 : 0x84a38a,
        falling ? 1 : 0.6,
      ).strokeRoundedRect(x, y, w, h - 2, 6);
      g.lineStyle(1, falling ? 0xffedbe : 0xb3c6a0, 0.35).lineBetween(
        x + 8,
        y + 4,
        x + w - 8,
        y + 4,
      );
      if (clearing)
        g.fillStyle(0xf7dfa2, 0.55).fillRoundedRect(x, y, w, h - 2, 6);
      const index = labelIndex++,
        label = this.labels[index]!;
      const size = Math.min(kind === "K" ? 29 : 22, ch * 0.54, cw * 0.32);
      const color = falling ? "#283d30" : ink ? "#c7ccc0" : "#f1ebd1";
      const key = `${text}:${kind}:${size}:${color}:${w}:${h}:${pixelRatio}`;
      // Phaser text styles upload a new texture: only rebuild glyphs when their content or size changes.
      if (this.labelKeys[index] !== key) {
        this.labelKeys[index] = key;
        const maxW = w - 8,
          maxH = h - 6;
        label
          .setStyle({
            fontSize: size,
            color,
            resolution: pixelRatio,
            wordWrap: {
              width: kind === "M" ? Math.max(20, maxW) : 0,
              useAdvancedWrap: false,
            },
          })
          .setText(text)
          .setScale(1);
        // Long words are re-rendered at a smaller font size rather than scaled
        // down, which would throw away glyph pixels. They may also narrow to a
        // condensed face (長体) so five-kana words stay legible on a phone.
        for (let fontSize = size, i = 0; i < 4; i++) {
          const fit = Math.min(
            maxW / (Math.max(1, label.width) * CONDENSED),
            maxH / Math.max(1, label.height),
          );
          if (fit >= 1) break;
          const next = Math.max(MIN_FONT, Math.floor(fontSize * fit));
          if (next === fontSize) break;
          label.setFontSize((fontSize = next));
        }
        label.setScale(
          Math.max(CONDENSED, Math.min(1, maxW / Math.max(1, label.width))),
          1,
        );
      }
      label.setPosition(x + w / 2, y + (h - 2) / 2).setVisible(true);
    };
    for (let r = 0; r < s.rows; r++)
      for (let c = 0; c < s.cols; c++) {
        const tile = s.board[r]![c];
        if (tile)
          draw(
            tile.kind === "G"
              ? `${s.words[tile.word]!.q.vocab.w}\n${vocabKana(s.words[tile.word]!.q.vocab)}`
              : tile.text,
            c,
            r,
            tile.kind,
            false,
            s.clearIds.includes(tile.id),
          );
      }
    const p = s.current;
    if (p) {
      const row = landingRow(s, p.column);
      if (row >= 0) {
        g.fillStyle(0xeacd80, 0.08).fillRect(
          p.column * cw,
          0,
          cw,
          (row + 1) * ch,
        );
        g.lineStyle(2, 0xe2c47d, 0.65).strokeRoundedRect(
          p.column * cw + 4,
          row * ch + 4,
          cw - 8,
          ch - 8,
          6,
        );
      }
      if (v.guided)
        for (let r = 0; r < s.rows; r++)
          for (let c = 0; c < s.cols; c++) {
            if (s.board[r]![c]?.id === p.target)
              g.lineStyle(3, 0xffdf8d, 1).strokeRoundedRect(
                c * cw + 2,
                r * ch + 2,
                cw - 4,
                ch - 4,
                7,
              );
          }
      const q = s.words[p.word]!.q;
      draw(
        p.kind === "K"
          ? q.vocab.w
          : p.kind === "R"
            ? vocabKana(q.vocab)
            : q.vocab.m,
        v.reducedMotion ? p.column : p.x,
        p.y,
        p.kind,
        true,
      );
    }
    this.game.canvas.dataset["phase"] = s.phase;
    this.game.canvas.dataset["boardWidth"] = String(width);
  }
}

const devicePixels = () =>
  Math.min(3, Math.max(1, window.devicePixelRatio || 1));

export function mountRiverStack(host: HTMLElement, view: RiverView) {
  const scene = new RiverStackScene(view);
  scene.size = {
    width: host.clientWidth,
    height: host.clientHeight,
    pixelRatio: devicePixels(),
  };
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    backgroundColor: "#163f3d",
    antialias: true,
    scale: {
      // The forest dialog changes size without a window resize. Observe its
      // actual playfield and resize the renderer and cameras together.
      mode: Phaser.Scale.NONE,
      width: Math.round(host.clientWidth * scene.size.pixelRatio),
      height: Math.round(host.clientHeight * scene.size.pixelRatio),
    },
    fps: { target: 60, limit: 60 },
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false },
    scene: [scene],
  });
  // Draw at the screen's real pixel density: a 1x canvas stretched over a
  // retina phone blurs every glyph. The camera zoom keeps layout in CSS pixels.
  const resize = () => {
    if (!game.isBooted) return;
    const width = host.clientWidth,
      height = host.clientHeight,
      pixelRatio = devicePixels();
    if (width <= 0 || height <= 0) return;
    scene.size = { width, height, pixelRatio };
    const pxW = Math.round(width * pixelRatio),
      pxH = Math.round(height * pixelRatio);
    if (game.scale.width !== pxW || game.scale.height !== pxH)
      game.scale.resize(pxW, pxH);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  game.events.once(Phaser.Core.Events.READY, resize);
  return {
    destroy(removeCanvas: boolean) {
      observer.disconnect();
      game.events.off(Phaser.Core.Events.READY, resize);
      game.destroy(removeCanvas);
    },
  };
}

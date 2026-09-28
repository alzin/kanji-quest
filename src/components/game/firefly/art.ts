import type Phaser from "phaser";
import { SPIRITS } from "@/lib/firefly-catalog";

/** Whole four-frame strips use one scale and a shared bottom-centre anchor. */
export function makeFireflyArt(scene: Phaser.Scene) {
  for (const spirit of SPIRITS) {
    const key = `rescue-${spirit.id}`;
    if (scene.textures.exists(key)) continue;
    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 32;
    const c = canvas.getContext("2d")!;
    for (let frame = 0; frame < 4; frame++) {
      c.save(); c.translate(frame * 32, frame % 2);
      c.fillStyle = spirit.color;
      if (spirit.shape === "moth") {
        c.fillRect(3, 10 + frame % 2 * 2, 9, 9); c.fillRect(20, 10 + frame % 2 * 2, 9, 9);
        c.fillRect(6, 19, 6, 5); c.fillRect(20, 19, 6, 5);
      } else if (spirit.shape === "fox") {
        c.beginPath(); c.moveTo(7, 13); c.lineTo(7, 3); c.lineTo(14, 11); c.fill();
        c.beginPath(); c.moveTo(18, 11); c.lineTo(25, 3); c.lineTo(25, 14); c.fill();
      } else {
        c.fillRect(11, 3, 3, 11); c.fillRect(19, 3, 3, 11);
      }
      c.fillRect(9, 11, 14, 14); c.fillRect(6, 14, 20, 7);
      c.fillRect(12, 24, 8, 3);
      c.fillStyle = "#fff9dc"; c.fillRect(11, 13, 10, 9);
      c.fillStyle = "#273d45"; c.fillRect(11, 16, 2, 3); c.fillRect(19, 16, 2, 3);
      c.fillStyle = "#d6b189"; c.fillRect(15, 20, 2, 1);
      c.restore();
    }
    const texture = scene.textures.addCanvas(key, canvas)!;
    for (let f = 0; f < 4; f++) texture.add(f, 0, f * 32, 0, 32, 32);
  }
}

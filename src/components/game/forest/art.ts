import type Phaser from "phaser";
import { onTrail, riverX, seeded, WORLD } from "./world";

/** Original fixed-palette pixel art. All character frames share a 32×40 foot anchor. */
export function makeForestArt(scene: Phaser.Scene) {
  function texture(
    key: string,
    w: number,
    h: number,
    draw: (c: CanvasRenderingContext2D) => void,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext("2d")!;
    c.imageSmoothingEnabled = false;
    draw(c);
    scene.textures.addCanvas(key, canvas);
  }
  const rect = (
    c: CanvasRenderingContext2D,
    color: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), w, h);
  };
  const poly = (
    c: CanvasRenderingContext2D,
    color: string,
    points: number[][],
  ) => {
    c.fillStyle = color;
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x!, y!) : c.moveTo(x!, y!)));
    c.closePath();
    c.fill();
  };
  texture("forest-ground", WORLD.width / 2, WORLD.height / 2, (c) => {
    const random = seeded(16);
    rect(c, "#27483d", 0, 0, 768, 480);
    for (let y = 0; y < 480; y += 4)
      for (let x = 0; x < 768; x += 4) {
        const p = { x: x * 2, y: y * 2 },
          trail = onTrail(p, 58),
          edge = !trail && onTrail(p, 70);
        const colors = trail
          ? ["#7c8157", "#84885a", "#8d8e61", "#929363"]
          : edge
            ? ["#516647", "#5a704c", "#687c50"]
            : ["#31543f", "#345943", "#385b43", "#3a5e45", "#3e6247"];
        rect(c, colors[Math.floor(random() * colors.length)]!, x, y, 4, 4);
      }
    // Scattered leaves, tiny flowers, grass tufts and worn path stones.
    for (let i = 0; i < 10500; i++) {
      const x = Math.floor(random() * 768),
        y = Math.floor(random() * 480),
        trail = onTrail({ x: x * 2, y: y * 2 }, 53);
      const shade = random();
      rect(
        c,
        trail
          ? shade > 0.5
            ? "#a2a271"
            : "#707a52"
          : shade > 0.75
            ? "#68834d"
            : shade > 0.4
              ? "#466c49"
              : "#294d3d",
        x,
        y,
        1 + Math.floor(random() * 3),
        1,
      );
      if (!trail && shade > 0.93) rect(c, "#729455", x + 1, y - 2, 1, 3);
      if (!trail && shade > 0.993) {
        rect(c, "#d9c68a", x, y - 2, 2, 2);
        rect(c, "#537c50", x, y, 1, 3);
      }
    }
    // Continuous river and stepped moss banks.
    for (let y = 0; y < 480; y++) {
      const x = Math.round(riverX(y * 2) / 2);
      rect(c, "#203e37", x - 44, y, 88, 1);
      rect(c, "#668476", x - 38, y, 76, 1);
      rect(c, "#326d70", x - 34, y, 68, 1);
      rect(c, "#347c7f", x - 27, y, 54, 1);
      rect(c, "#3b8586", x - 16, y, 33, 1);
      if (y % 14 === 0) {
        rect(
          c,
          "#77aaa0",
          x - 24 + random() * 26,
          y,
          12 + Math.floor(random() * 16),
          1,
        );
        rect(c, "#4c9290", x - 13 + random() * 20, y + 3, 12, 1);
      }
    }
    // Shrine courtyard, individually weathered paving stones.
    for (let y = 132; y < 173; y += 10)
      for (let x = 506; x < 599; x += 15) {
        rect(c, "#647770", x, y, 14, 9);
        rect(c, "#84938a", x + 1, y, 12, 2);
        if (random() > 0.65) rect(c, "#4d7350", x, y + 6, 4, 3);
      }
    // Flowers around the shrine clearing.
    for (let i = 0; i < 95; i++) {
      const t = random() * Math.PI * 2,
        radius = 70 + random() * 32;
      const x = 555 + Math.cos(t) * radius,
        y = 148 + Math.sin(t) * radius * 0.6;
      rect(c, "#799759", x, y, 1, 4);
      rect(c, random() > 0.5 ? "#e6ce91" : "#b7b4cc", x - 1, y, 3, 2);
    }
  });
  for (let v = 0; v < 3; v++)
    texture(`forest-tree-${v}`, 100, 126, (c) => {
      const random = seeded(100 + v),
        colors = [
          ["#15382f", "#1b4838", "#286042", "#3b774b", "#58884e"],
          ["#173e35", "#20543d", "#326946", "#477d4f", "#699350"],
          ["#153b36", "#1b4b3e", "#2b6045", "#3d7450", "#59834e"],
        ][v]!;
      c.fillStyle = "#112c2a66";
      c.beginPath();
      c.ellipse(50, 114, 40, 9, -0.15, 0, 7);
      c.fill();
      rect(c, "#263c31", 44, 71, 15, 45);
      rect(c, "#655c3e", 46, 64, 9, 48);
      rect(c, "#847249", 47, 72, 3, 35);
      poly(c, "#443f2d", [
        [45, 97],
        [34, 114],
        [47, 111],
        [57, 116],
        [66, 115],
        [56, 102],
      ]);
      poly(c, colors[0]!, [
        [47, 6],
        [65, 12],
        [72, 26],
        [85, 31],
        [86, 43],
        [96, 57],
        [94, 74],
        [86, 82],
        [74, 88],
        [61, 96],
        [34, 93],
        [18, 85],
        [9, 72],
        [5, 55],
        [13, 39],
        [24, 31],
        [28, 15],
      ]);
      poly(c, colors[1]!, [
        [44, 8],
        [64, 15],
        [72, 33],
        [84, 39],
        [92, 55],
        [87, 71],
        [72, 78],
        [52, 86],
        [30, 81],
        [17, 74],
        [12, 53],
        [25, 34],
        [30, 19],
      ]);
      poly(c, colors[2]!, [
        [40, 12],
        [59, 13],
        [64, 25],
        [75, 32],
        [80, 46],
        [72, 57],
        [54, 62],
        [43, 73],
        [25, 65],
        [17, 54],
        [29, 34],
        [30, 23],
      ]);
      poly(c, colors[3]!, [
        [39, 16],
        [53, 17],
        [57, 29],
        [68, 35],
        [69, 47],
        [54, 49],
        [44, 58],
        [28, 54],
        [32, 35],
      ]);
      for (let i = 0; i < 100; i++) {
        const x = 15 + random() * 66,
          y = 15 + random() * 61;
        if (((x - 47) / 34) ** 2 + ((y - 46) / 34) ** 2 < 1)
          rect(
            c,
            colors[Math.floor(random() * 4) + 1]!,
            x,
            y,
            3 + Math.floor(random() * 7),
            2 + Math.floor(random() * 3),
          );
      }
      rect(c, "#9fa776", 33, 25, 6, 2);
      rect(c, "#819458", 30, 29, 4, 2);
    });
  texture("forest-rock", 30, 23, (c) => {
    poly(c, "#284c3e", [
      [2, 16],
      [7, 7],
      [20, 4],
      [29, 12],
      [28, 19],
      [10, 22],
    ]);
    poly(c, "#63766c", [
      [4, 13],
      [9, 4],
      [20, 3],
      [27, 10],
      [25, 18],
      [8, 18],
    ]);
    poly(c, "#94a090", [
      [8, 11],
      [10, 5],
      [19, 4],
      [24, 10],
      [19, 13],
    ]);
    rect(c, "#719155", 4, 14, 9, 3);
    rect(c, "#859a5d", 6, 12, 5, 3);
  });
  for (let lit = 0; lit < 2; lit++)
    texture(`forest-lantern-${lit}`, 36, 66, (c) => {
      rect(c, "#283b36", 7, 61, 25, 4);
      rect(c, "#6e7a6d", 10, 55, 20, 7);
      rect(c, "#9d9e80", 13, 52, 14, 4);
      rect(c, "#58685e", 16, 31, 8, 22);
      rect(c, "#8b9177", 16, 32, 3, 22);
      rect(c, "#283c37", 10, 17, 20, 18);
      rect(c, lit ? "#ffce70" : "#6d7965", 13, 20, 14, 11);
      if (lit) {
        rect(c, "#fff1b5", 16, 21, 6, 9);
        rect(c, "#9b683d", 19, 20, 1, 13);
      }
      poly(c, "#536f5f", [
        [5, 19],
        [10, 14],
        [13, 12],
        [16, 8],
        [24, 8],
        [27, 13],
        [34, 19],
      ]);
      rect(c, "#91a07a", 11, 13, 17, 2);
      rect(c, "#b0aa7c", 18, 3, 4, 5);
    });
  for (let lit = 0; lit < 2; lit++)
    texture(`forest-shrine-${lit}`, 124, 122, (c) => {
      rect(c, "#2a4038", 5, 111, 114, 8);
      rect(c, "#6a7c70", 11, 106, 102, 8);
      rect(c, "#9ba28b", 16, 101, 92, 6);
      rect(c, "#693e32", 25, 45, 76, 55);
      rect(c, "#a66343", 30, 44, 66, 54);
      rect(c, "#c18a55", 34, 52, 57, 44);
      rect(c, "#553d30", 45, 58, 35, 42);
      rect(c, lit ? "#e7b65d" : "#343e33", 50, 63, 25, 32);
      if (lit) rect(c, "#ffdf8b", 57, 69, 11, 24);
      for (const x of [28, 87]) {
        rect(c, "#804833", x, 42, 9, 58);
        rect(c, "#cd8a57", x, 43, 3, 54);
      }
      poly(c, "#182f2c", [
        [1, 49],
        [17, 37],
        [43, 17],
        [62, 8],
        [83, 21],
        [108, 38],
        [123, 48],
        [106, 54],
        [18, 54],
      ]);
      poly(c, "#37574b", [
        [8, 44],
        [29, 30],
        [62, 13],
        [93, 32],
        [117, 45],
        [102, 48],
        [24, 48],
      ]);
      for (let y = 27; y < 46; y += 6)
        rect(c, "#5c7460", 53 - (y - 20), y, (y - 20) * 2 + 18, 2);
      rect(c, "#96a078", 45, 15, 34, 3);
      rect(c, "#c3ab77", 57, 5, 10, 9);
      rect(c, "#dcc087", 36, 53, 53, 2);
      for (const x of [40, 54, 70, 83]) rect(c, "#e6d6ad", x, 54, 3, 8);
      rect(c, "#374f3a", 17, 97, 17, 5);
      rect(c, "#68824b", 19, 94, 11, 4);
    });
  texture("forest-torii", 120, 106, (c) => {
    for (const x of [22, 87]) {
      rect(c, "#572f2b", x + 3, 18, 11, 85);
      rect(c, "#ad6046", x, 17, 10, 83);
      rect(c, "#d58e61", x, 18, 3, 76);
      rect(c, "#4e5145", x - 3, 97, 17, 7);
    }
    rect(c, "#a5573e", 11, 31, 101, 8);
    rect(c, "#d98958", 11, 31, 101, 2);
    poly(c, "#1c3530", [
      [2, 6],
      [25, 12],
      [94, 12],
      [119, 6],
      [117, 16],
      [96, 22],
      [24, 22],
      [4, 16],
    ]);
    rect(c, "#c67951", 20, 20, 82, 6);
    rect(c, "#d6ad6d", 55, 24, 12, 21);
    rect(c, "#714b34", 60, 28, 2, 12);
  });
  texture("forest-player", 128, 160, (c) => {
    for (let dir = 0; dir < 4; dir++)
      for (let f = 0; f < 4; f++) {
        c.save();
        c.translate(f * 32, dir * 40);
        const bob = f % 2,
          leg = f === 1 ? 2 : f === 3 ? -2 : 0;
        rect(c, "#253b36", 9, 34, 6, 4 - (leg > 0 ? 2 : 0));
        rect(c, "#253b36", 18, 34, 6, 4 - (leg < 0 ? 2 : 0));
        rect(c, "#947446", 10, 29 + leg / 2, 5, 6);
        rect(c, "#b0925b", 18, 29 - leg / 2, 5, 6);
        rect(c, "#344b46", 8, 19 - bob, 17, 14);
        rect(c, "#e2ad5d", 9, 19 - bob, 15, 11);
        rect(c, "#f1cd7b", 10, 20 - bob, 4, 9);
        rect(c, "#b7774f", 5, 22 - bob, 4, 9);
        rect(c, "#f0c791", 5, 28 - bob, 4, 3);
        rect(c, "#b7774f", 24, 22 - bob, 4, 8);
        rect(c, "#f0c791", 24, 27 - bob, 4, 3);
        rect(c, "#523e32", 9, 8 - bob, 16, 13);
        rect(c, "#f0c791", 11, 12 - bob, 12, 9);
        if (dir === 1) rect(c, "#573f32", 10, 12 - bob, 14, 9);
        else {
          rect(
            c,
            "#383b30",
            dir === 2 ? 11 : dir === 3 ? 21 : 13,
            16 - bob,
            2,
            2,
          );
          if (dir === 0) rect(c, "#383b30", 20, 16 - bob, 2, 2);
        }
        rect(c, "#bc633f", 9, 20 - bob, 16, 3);
        rect(c, "#e38b51", dir === 2 ? 24 : 8, 21 - bob, 4, 7);
        poly(c, "#806442", [
          [3, 12 - bob],
          [9, 8 - bob],
          [12, 3 - bob],
          [22, 3 - bob],
          [25, 8 - bob],
          [30, 12 - bob],
          [29, 15 - bob],
          [4, 15 - bob],
        ]);
        rect(c, "#d5b56e", 8, 10 - bob, 19, 4);
        rect(c, "#f1d18b", 12, 5 - bob, 10, 4);
        rect(c, "#98844f", 6, 14 - bob, 23, 2);
        if (dir === 1) {
          rect(c, "#566d56", 11, 22 - bob, 12, 10);
          rect(c, "#91a075", 13, 24 - bob, 8, 6);
        }
        c.restore();
      }
  });
  const player = scene.textures.get("forest-player");
  for (let d = 0; d < 4; d++)
    for (let f = 0; f < 4; f++)
      player.add(d * 4 + f, 0, f * 32, d * 40, 32, 40);
  texture("forest-fox", 128, 32, (c) => {
    for (let f = 0; f < 4; f++) {
      c.save();
      c.translate(f * 32, f % 2);
      poly(c, "#ab6744", [
        [17, 19],
        [24, 10],
        [30, 10],
        [29, 18],
        [23, 24],
      ]);
      rect(c, "#f0d9ad", 26, 10, 5, 6);
      rect(c, "#c9824d", 7, 16, 17, 11);
      rect(c, "#e7b16b", 8, 16, 13, 8);
      rect(c, "#5b4935", 8, 26, 4, 3);
      rect(c, "#5b4935", 20, 26, 4, 3);
      poly(c, "#d59253", [
        [5, 18],
        [5, 6],
        [11, 11],
        [18, 10],
        [22, 5],
        [23, 19],
        [17, 25],
        [10, 24],
      ]);
      rect(c, "#f3dfb2", 8, 19, 12, 4);
      rect(c, "#242f28", 8, 15, 2, 2);
      rect(c, "#242f28", 18, 15, 2, 2);
      rect(c, "#303a2a", 13, 21, 2, 2);
      rect(c, "#669779", 7, 24, 15, 3);
      c.restore();
    }
  });
  for (let f = 0; f < 4; f++)
    scene.textures.get("forest-fox").add(f, 0, f * 32, 0, 32, 32);
  texture("forest-glow", 96, 96, (c) => {
    const g = c.createRadialGradient(48, 48, 0, 48, 48, 48);
    g.addColorStop(0, "#ffdf9977");
    g.addColorStop(0.3, "#f4c97633");
    g.addColorStop(1, "#ecc77800");
    c.fillStyle = g;
    c.fillRect(0, 0, 96, 96);
  });
  texture("forest-spark", 7, 7, (c) => {
    rect(c, "#fff0b2", 3, 0, 1, 7);
    rect(c, "#fff0b2", 0, 3, 7, 1);
    rect(c, "#ffffff", 2, 2, 3, 3);
  });
}

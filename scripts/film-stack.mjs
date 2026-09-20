// Reproducible 60 fps phone film using the same controls as a player.
// Start the production preview, then: node scripts/film-stack.mjs [url] [output-directory]
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { KANJI_CHARACTERS } from "../backend/src/domain/curriculum.ts";

const url = process.argv[2] ?? "http://localhost:4174";
const out = resolve(process.argv[3] ?? "artifacts.local/tsumiji");
const frames = join(out, "frames"); await mkdir(frames, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = []; page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
await page.clock.install();
await page.addInitScript((chars) => {
  Math.random = () => 0.999;
  sessionStorage.setItem("kanji-dash-save-prompt-v1", "9999");
  localStorage.setItem("kanji-dash-voice", "off");
  sessionStorage.setItem("kanji-dash-guest-v1", JSON.stringify({ curriculumVersion: 2, unlockedChapters: [], clearedChapters: [], selectedLevel: "N5", progress: Object.fromEntries([...chars].map((c, i) => [c, { mastery: 2, ivl: 1, ease: 2.5, due: i < 12 ? 1 : 8e12, correct: 0, wrong: 0 }])), streak: { count: 0, last: "" } }));
}, KANJI_CHARACTERS);
await page.goto(`${url}/run`, { waitUntil: "networkidle" });
await page.getByTestId("stack-start").waitFor();
await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
await page.getByTestId("stack-start").click();
await page.getByTestId("stack-game").waitFor();
await page.clock.runFor(34);
let frame = 0;
const capture = async (count) => {
  for (let i = 0; i < count; i++) {
    await page.clock.runFor(i % 3 === 0 ? 16 : 17);
    await page.screenshot({ path: join(frames, `${String(frame++).padStart(5, "0")}.png`) });
  }
};
const samples = [];
await page.screenshot({ path: join(out, "375-start.png") });
for (let sheet = 0; sheet < 2; sheet++) {
  for (let piece = 0; piece < 45; piece++) {
    const s = await page.evaluate(() => window.__kanjiDashStack?.());
    if (!s || s.done) break;
    if (!s.current) { await capture(30); continue; }
    const p = s.current;
    let column = -1;
    for (let c = 0; c < s.cols; c++) {
      const top = s.board.findIndex((row) => row[c] !== null), r = top < 0 ? s.rows - 1 : top - 1;
      if (r >= 0 && [[r + 1, c], [r, c - 1], [r, c + 1]].some(([rr, cc]) => s.board[rr]?.[cc]?.id === p.target)) { column = c; break; }
    }
    if (column < 0) throw new Error("No legal placement in film");
    await capture(30);
    await page.getByTestId(`stack-column-${column}`).click();
    await capture(15);
    await page.getByTestId(`stack-column-${column}`).click();
    await capture(36);
    samples.push({ sheet: sheet + 1, word: s.words[p.word].q.vocab.w, mastery: s.words[p.word].mastery, responseMs: Math.round((p.age + 0.75) * 1000) });
  }
  await page.screenshot({ path: join(out, `sheet-${sheet + 1}-result.png`) });
  if (sheet === 0) { await capture(60); await page.getByRole("button", { name: "Next sheet", exact: true }).click(); }
}
await capture(60);
await page.setViewportSize({ width: 320, height: 568 });
await page.clock.resume();
await page.goto(`${url}/run?practice=fluency`, { waitUntil: "domcontentloaded" });
await page.getByTestId("stack-start").waitFor();
await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
await page.getByTestId("stack-start").click();
await page.getByTestId("stack-game").waitFor(); await page.clock.runFor(16);
await page.screenshot({ path: join(out, "320-offline-fonts.png") });
await writeFile(join(out, "telemetry.json"), JSON.stringify({ fps: 60, frames: frame, viewport: "375x812", fonts: "blocked", errors, samples, note: "Scripted placements measure the recording, not human learning or guess rates." }, null, 2));
await browser.close();
if (errors.length) throw new Error(errors.join("\n"));
await new Promise((resolvePromise, reject) => {
  const ffmpeg = spawn("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "60", "-i", join(frames, "%05d.png"), "-frames:v", String(frame), "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264", "-crf", "23", "-pix_fmt", "yuv420p", join(out, "two-sheets-60fps.mp4")], { windowsHide: true, stdio: "inherit" });
  ffmpeg.on("error", reject); ffmpeg.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`ffmpeg: ${code}`)));
});
console.log(`Saved ${frame} frames and phone screenshots to ${out}`);

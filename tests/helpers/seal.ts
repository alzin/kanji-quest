import { expect, type Page } from "@playwright/test";
import { allKanji } from "../../src/data";

export const regionSteps = (learned: number[], stacked: number[] = [], rescued: number[] = []) => ({ learned, stacked, rescued });

/** Answers the three typed seal readings: each displayed word's own reading, or a wrong one. */
export async function typeSeal(page: Page, correct: (index: number) => boolean = () => true) {
  await expect(page.getByRole("heading", { name: "Typed Seal check" })).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await expect(page.getByText(`Reading ${i + 1} of 3`, { exact: false })).toBeVisible();
    const written = await page.locator(".stack-page > p.font-serif").textContent();
    const vocab = allKanji.flatMap((k) => k.vocab).find((v) => v.w === written)!;
    await page.getByLabel("Type the reading").fill(correct(i) ? vocab.f.map((f) => f.r || f.t).join("") : "ぬぬぬ");
    await page.getByRole("button", { name: "Check reading", exact: true }).click();
    await page.getByRole("button", { name: i === 2 ? "See my seal" : "Next reading", exact: true }).click();
  }
}

import { expect, type Page } from "@playwright/test";

export async function studyWords(page: Page) {
  await expect(page.getByRole("heading", { name: "Learn before you run", exact: true })).toBeVisible();
  const answers: { reading: string; meaning: string }[] = [];
  const words = page.getByRole("region", { name: "Words in this run" }).getByRole("button");
  const count = await words.count();
  for (let i = 0; i < count; i++) {
    await words.nth(i).click();
    answers.push({ reading: (await page.getByTestId("study-reading").textContent())!, meaning: (await page.getByTestId("study-meaning").textContent())! });
  }
  await page.getByRole("button", { name: "Check my recall", exact: true }).click();
  return answers;
}

export async function recallWords(page: Page, answers: { reading: string; meaning: string }[], { advanceClock = false, pauseClock = false } = {}) {
  if (pauseClock) {
    // Assertion and browser time must not advance the run after the final recall.
    // fastForward below still drives feedback and gameplay at explicit times.
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1_000)));
  }
  let checkIndex = 0;
  for (const type of ["reading", "meaning"] as const) {
    for (const answer of answers) {
      await expect(page.getByText(`Check ${++checkIndex} of ${answers.length * 2}`, { exact: true })).toBeVisible();
      await page.getByRole("region", { name: "Recall check" }).getByRole("button", { name: answer[type], exact: true }).click();
      if (advanceClock) {
        await expect(page.getByRole("region", { name: "Recall check" }).getByRole("status")).toContainText("Correct.");
        await page.clock.fastForward(800);
      }
    }
  }
  await expect(page.getByLabel("Kanji runner game")).toBeVisible();
}

export async function completePreparation(page: Page, options: { advanceClock?: boolean; pauseClock?: boolean } = {}) {
  await recallWords(page, await studyWords(page), options);
}

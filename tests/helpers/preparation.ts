import { expect, type Page } from "@playwright/test";

export async function studyWords(page: Page) {
  await expect(page.getByRole("heading", { name: "Learn before you run", exact: true })).toBeVisible();
  const answers: { reading: string; meaning: string }[] = [];
  const count = await page.getByRole("region", { name: "Words in this run" }).getByRole("button").count();
  for (let i = 0; i < count; i++) {
    answers.push({ reading: (await page.getByTestId("study-reading").textContent())!, meaning: (await page.getByTestId("study-meaning").textContent())! });
    await page.getByRole("button", { name: "I’ve studied this word", exact: true }).click();
  }
  await page.getByRole("button", { name: "Check my recall", exact: true }).click();
  return answers;
}

export async function recallWords(page: Page, answers: { reading: string; meaning: string }[]) {
  for (const type of ["reading", "meaning"] as const) {
    for (const answer of answers) {
      await page.getByRole("region", { name: "Recall check" }).getByRole("button", { name: answer[type], exact: true }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
    }
  }
  await expect(page.getByRole("heading", { name: "Ready for your run", exact: true })).toBeVisible();
}

export async function completePreparation(page: Page) {
  await recallWords(page, await studyWords(page));
  await page.getByRole("button", { name: "Start run", exact: true }).click();
}

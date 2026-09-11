import type { Page } from "@playwright/test";

export const SAVE_PROMPT_KEY = "kanji-dash-save-prompt-v1";

/**
 * Specs that are not about the save offer start out as a player who already
 * declined it, so a finished run never covers the screen they assert on.
 */
export async function silenceSavePrompt(page: Page) {
  await page.addInitScript((key) => sessionStorage.setItem(key, "9999"), SAVE_PROMPT_KEY);
}

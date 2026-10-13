import { expect, type Page } from "@playwright/test";

/** sessionStorage key set once a traveller dismisses the title card (src/lib/hub.ts). */
export const TITLE_SEEN_KEY = "kanji-dash-title-v1";

/** Start every page as a traveller who already pressed Start on the title card. */
export async function skipTitle(page: Page) {
  await page.addInitScript((key) => sessionStorage.setItem(key, "1"), TITLE_SEEN_KEY);
}

/** The Camp panel on the world map; it is plain DOM, so this does not wait for the canvas. */
export const campPanel = (page: Page) => page.getByRole("dialog", { name: "Your camp" });
export const journeyLog = (page: Page) => page.getByRole("dialog", { name: "Journey log" });

export async function openCamp(page: Page) {
  await page.goto("./?panel=camp", { waitUntil: "domcontentloaded" });
  await expect(campPanel(page)).toBeVisible();
}

export async function openJourneyLog(page: Page) {
  await page.goto("./?panel=journey", { waitUntil: "domcontentloaded" });
  await expect(journeyLog(page)).toBeVisible();
}

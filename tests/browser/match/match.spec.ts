import { expect, test, type Page } from "@playwright/test";

const baseURL = process.env.STARHAVEN_URL ?? "http://127.0.0.1:5173";

async function enterMatch(page: Page, url = baseURL): Promise<void> {
  await page.goto(url);
  await page.getByRole("button", { name: /start skirmish/i }).click();
  await expect(page.getByTestId("setup-screen")).toBeVisible();
  await page.getByRole("button", { name: /enter staging view/i }).click();
  await expect(page.getByTestId("playable-match")).toBeVisible();
}

test("setup enters the playable match and pause stops simulation ticks", async ({ page }) => {
  await enterMatch(page);
  await expect(page.getByTestId("runtime-placeholder")).toBeVisible();
  const tick = page.locator("[data-hud='tick']");
  await page.getByRole("button", { name: /^pause$/i }).click();
  await expect(page.getByTestId("pause-overlay")).toBeVisible();
  const beforePause = await tick.textContent();
  await page.waitForTimeout(180);
  expect(await tick.textContent()).toBe(beforePause);
  await page.getByRole("button", { name: /resume match/i }).click();
  await expect(page.getByTestId("pause-overlay")).toBeHidden();
  await page.getByRole("button", { name: /title/i }).click();
  await expect(page.getByTestId("title-screen")).toBeVisible();
});

test("vertical-slice demo reaches results and rematches with a new seed", async ({ page }) => {
  await enterMatch(page, baseURL + "/?demo=vertical-slice");
  await expect(page.getByTestId("results-screen")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("[data-result='faction']")).toHaveText(/Sunwoven|Gravemark/);
  await expect(page.locator("[data-result='balance']")).toHaveText("v1");
  const firstSeed = await page.locator("[data-result='seed']").textContent();
  await page.getByRole("button", { name: /rematch with new seed/i }).click();
  await expect(page.getByTestId("playable-match")).toBeVisible();
  const nextSeed = await page.locator("[data-hud='seed']").textContent();
  expect(nextSeed).not.toContain(firstSeed ?? "");
});

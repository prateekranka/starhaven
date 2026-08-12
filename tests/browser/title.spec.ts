import { expect, test } from "@playwright/test";

const baseURL = process.env.STARHAVEN_URL ?? "http://127.0.0.1:4173";

test("title screen reaches bounded setup placeholder", async ({ page }) => {
  await page.goto(baseURL);
  await expect(page.getByTestId("title-screen")).toBeVisible();
  await expect(page.getByRole("heading", { name: /hold the bright frontier/i })).toBeVisible();
  await page.getByRole("button", { name: /start skirmish/i }).click();
  await expect(page.getByTestId("setup-screen")).toBeVisible();
  await page.getByRole("button", { name: /enter staging view/i }).click();
  await expect(page.getByTestId("runtime-placeholder")).toBeVisible();
});

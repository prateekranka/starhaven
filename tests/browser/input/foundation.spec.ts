import { expect, test } from "@playwright/test";

test("foundation runtime mounts the WebGL2 match surface", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4173/?match=foundation");
  await expect(page.getByTestId("foundation-match")).toBeVisible();
  await expect(page.locator(".mode-chip")).toContainText("Idle");
  await page.waitForTimeout(250);
  expect(errors).toEqual([]);
});

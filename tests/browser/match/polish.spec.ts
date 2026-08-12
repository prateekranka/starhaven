import { expect, test } from "@playwright/test";

const baseURL = process.env.STARHAVEN_URL ?? "http://127.0.0.1:5173";

test("settings, touch targets, and order feedback work without hover", async ({ page }) => {
  await page.addInitScript(() => {
    const testWindow = window as unknown as Window & { __starhavenTestMessages: string[] };
    testWindow.__starhavenTestMessages = [];
    Object.defineProperty(window, "webkit", { configurable: true, value: { messageHandlers: { starhaven: { postMessage: (message: string) => testWindow.__starhavenTestMessages.push(message) } } } });
  });
  await page.goto(baseURL);
  await page.getByRole("button", { name: /start skirmish/i }).click();
  await page.getByRole("button", { name: /enter staging view/i }).click();
  await expect(page.getByTestId("playable-match")).toBeVisible();

  const actionHeights = await page.locator(".playable-actions button").evaluateAll((buttons) => buttons.map((button) => Number.parseFloat(getComputedStyle(button).minHeight)));
  expect(actionHeights.every((height) => height >= 44)).toBe(true);
  expect(await page.locator(".playable-match").evaluate((element) => getComputedStyle(element).touchAction)).toBe("none");
  await page.getByRole("button", { name: /move to engine/i }).click();
  await expect.poll(async () => page.evaluate(() => (window as unknown as Window & { __starhavenTestMessages: string[] }).__starhavenTestMessages.length)).toBeGreaterThan(0);
  const feedbackMessage = await page.evaluate(() => (window as unknown as Window & { __starhavenTestMessages: string[] }).__starhavenTestMessages.map((message) => JSON.parse(message)).find((message) => message.type === "feedback.haptic"));
  expect(feedbackMessage?.payload.kind).toBe("orderAccepted");

  await page.getByRole("button", { name: /open match settings/i }).click();
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await expect(page.locator("[data-setting='audioEnabled']")).toBeVisible();
  await expect(page.locator("[data-setting='hapticsEnabled']")).toBeVisible();
  await expect(page.locator("[data-setting='reducedMotion']")).toBeVisible();
  await expect(page.locator("[data-setting='renderQuality']")).toHaveValue("high");
  await page.locator("[data-setting='reducedMotion']").check();
  await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "true");
  await page.getByRole("button", { name: /done/i }).click();
});

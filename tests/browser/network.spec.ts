import { expect, test } from "@playwright/test";

const baseURL = process.env.STARHAVEN_URL ?? "http://127.0.0.1:4173";

test("title runtime requests stay on the page origin", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(baseURL);
  await page.waitForLoadState("networkidle");
  const pageOrigin = new URL(baseURL).origin;
  expect(requests.every((requestURL) => new URL(requestURL).origin === pageOrigin)).toBe(true);
});

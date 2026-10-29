import { test, expect, type Page } from "@playwright/test";
import { CatalogStore } from "../../packages/catalog-kit/src/store.mjs";
import { entry, catalog, policy, time } from "../../packages/catalog-kit/test/fixtures.mjs";

async function mockDirectory(page: Page, size = 80) {
  const store = new CatalogStore(":memory:", { now: () => Date.parse(time) }); store.publishPolicy(policy());
  store.publish(catalog(Array.from({ length: size }, (_, i) => entry({ repositoryId: i + 1, name: `Story Tool ${String(i).padStart(5, "0")}`, id: `tool-${i}`, official: i % 3 === 0, stars: i, translations: { "zh-CN": { name: `叙事工具 ${i}`, description: "一个叙事创作工具。" } } }))));
  const calls: string[] = [], errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (request.url().includes("catalog.json")) calls.push("BULK_SNAPSHOT"); });
  await page.route("http://127.0.0.1:8787/**", async (route) => {
    const url = new URL(route.request().url()); calls.push(url.pathname + url.search);
    try {
      let result;
      if (url.pathname === "/v1/catalog") result = store.list(Object.fromEntries(url.searchParams));
      else if (url.pathname === "/v1/policy") result = store.policy();
      else { const match = /^\/v1\/entries\/([^/]+)(\/versions)?$/.exec(url.pathname); if (!match) throw new Error("Unexpected API request"); const key = decodeURIComponent(match[1]); result = match[2] ? store.versions(key) : store.detail(key); }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result), headers: { "Access-Control-Allow-Origin": "*" } });
    } catch (error) { await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: (error as Error).message }) }); }
  });
  return { store, calls, errors };
}

for (const width of [390, 768, 1440]) test(`responsive directory and usable filters at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); const { store, errors } = await mockDirectory(page);
  try {
    await page.goto("/"); await expect(page.locator(".package-row")).toHaveCount(24);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("heading", { name: "Plugins." })).toBeVisible();
    if (width === 390) {
      await page.locator(".mobile-filter").click(); const sheet = page.getByRole("dialog"); await expect(sheet).toBeVisible();
      const bounds = await sheet.boundingBox(); expect(bounds!.y).toBe(0); expect(bounds!.x + bounds!.width).toBe(width);
      await sheet.getByRole("combobox", { name: "Category", exact: true }).click(); await page.getByRole("option", { name: "tools", exact: true }).click();
      await sheet.getByRole("button", { name: "Close", exact: true }).last().click();
    }
    expect(errors).toEqual([]);
  } finally { store.close(); }
});

test("10,000 packages use paginated API without bulk JSON; history restores page, filter and scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); const { store, calls } = await mockDirectory(page, 10_000);
  try {
    await page.goto("/"); await expect(page.locator(".package-row")).toHaveCount(24);
    await expect(page.locator(".results-meta")).toContainText("10K");
    expect(calls).not.toContain("BULK_SNAPSHOT"); expect(await page.locator("article").count()).toBe(24);
    await page.getByRole("tab", { name: "Community", exact: true }).click(); await expect(page).toHaveURL(/source=community/);
    await page.getByRole("button", { name: "Next", exact: true }).click(); await expect(page.locator(".pagination")).toContainText("Page 2");
    const firstName = await page.locator(".package-name > button").first().textContent();
    await page.evaluate(() => window.scrollTo(0, 850));
    await page.locator(".package-name > button").nth(6).click(); await expect(page.getByRole("dialog")).toBeVisible();
    const saved = await page.evaluate(() => window.history.state.covel.scroll);
    await page.goBack(); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.locator(".pagination")).toContainText("Page 2");
    await expect(page.locator(".package-name > button").first()).toHaveText(firstName!);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(saved, -1);
    await page.goBack(); await expect(page.locator(".pagination")).toContainText("Page 1");
    await expect(page).toHaveURL(/source=community/);
  } finally { store.close(); }
});

test("debounced bilingual search, version SHA, theme and errors have explicit states", async ({ page }) => {
  const { store, calls, errors } = await mockDirectory(page);
  try {
    await page.goto("/"); await expect(page.locator(".package-row")).toHaveCount(24);
    await page.getByRole("button", { name: "切换为中文" }).click();
    await page.getByRole("textbox").fill("叙事工具 7"); await expect(page).toHaveURL(/q=/); await expect(page.locator(".package-row").first()).toContainText("叙事工具");
    expect(calls.filter((url) => /[?&]q=/.test(url)).length).toBeGreaterThan(0);
    await page.locator(".package-name > button").first().click(); await expect(page.getByRole("dialog")).toContainText("a".repeat(40));
    await expect(page.getByRole("dialog")).toContainText("离线 ZIP"); await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Dark theme" }).click(); await expect(page.locator("html")).toHaveClass(/dark/);
    store.now = () => Date.parse("2027-01-01T00:00:00Z");
    await page.getByRole("textbox").fill("missing search"); await expect(page.getByRole("alert")).toContainText("目录暂时无法加载");
    expect(errors).toEqual([]);
  } finally { store.close(); }
});

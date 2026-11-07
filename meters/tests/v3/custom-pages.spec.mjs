import { test, expect } from "@playwright/test";
import { DESIGNER_URL } from "./config.mjs";
async function open(page) {
  await page.goto(
    DESIGNER_URL + "?test=1&db=pages-" +
      crypto.randomUUID(),
  );
  await page.waitForFunction(() => !!window.__studio);
}

test("Custom has a flat page list, no theme picker, and a cancellable starter chooser", async ({
  page,
}) => {
  await open(page);
  expect(
    await page.locator("#theme-picker,#themes,#themes-dialog").count(),
  ).toBe(0);
  await expect(
    page.getByRole("heading", { name: "Custom", exact: true }),
  ).toBeVisible();
  const before = await page.evaluate(() =>
    JSON.stringify(__studio.store.project),
  );
  await page.locator("#pageadd").click();
  await expect(
    page.getByRole("heading", { name: "Choose a starting screen" }),
  ).toBeVisible();
  expect(await page.locator("#page-starters button").count()).toBe(12);
  await expect(page.locator("#blank-page")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(() => JSON.stringify(__studio.store.project)),
  ).toBe(before);
  await page.locator("#pageadd").click();
  await page
    .locator("#page-starters button")
    .filter({ hasText: "Neon telemetry" })
    .click();
  expect(await page.locator("#page-list button").count()).toBe(3);
  await expect(page.locator("#collection-caption")).toHaveText(
    "Custom · Neon telemetry",
  );
  await page.locator("#undo").click();
  expect(
    await page.evaluate(() => JSON.stringify(__studio.store.project)),
  ).toBe(before);
});

test("blank is one page and page palettes/backgrounds never change another page", async ({
  page,
}) => {
  await open(page);
  const original = await page.evaluate(() =>
    JSON.stringify(__studio.store.project.themes[0].pages),
  );
  await page.locator("#pageadd").click();
  await page.locator("#blank-page").click();
  expect(await page.locator("#layers button").count()).toBe(0);
  await page.locator("#empty-theme").click();
  await page.getByLabel("Page name", { exact: true }).fill("My speed screen");
  await page.getByLabel("Page name", { exact: true }).dispatchEvent("change");
  await page.getByRole("button", { name: "Amber", exact: true }).click();
  await page.locator("#scope-back").click();
  await page.locator("#empty-background").click();
  expect(
    await page.getByLabel("Override on this page", { exact: true }).count(),
  ).toBe(0);
  await page.getByLabel("Background color", { exact: true }).fill("#123456");
  await page
    .getByLabel("Background color", { exact: true })
    .dispatchEvent("change");
  expect(
    await page.evaluate(() =>
      JSON.stringify(__studio.store.project.themes[0].pages.slice(0, 2)),
    ),
  ).toBe(original);
  await expect(page.locator("#collection-caption")).toHaveText(
    "Custom · My speed screen",
  );
});

test("old multi-theme drafts expose all pages without flattening away original data", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(async () => {
    const M = await import("./v3/model.mjs");
    __studio.command("Legacy fixture", (p) =>
      p.themes.push(M.starter("Track")),
    );
  });
  expect(await page.locator("#page-list button").count()).toBe(4);
  const pages = await page.evaluate(() =>
    __studio.store.project.themes.flatMap((t) => t.pages.map((p) => p.id)),
  );
  await page.locator("#pages").selectOption(pages.at(-1));
  await expect(page.locator("#collection-caption")).toHaveText(
    "Custom · Track telemetry",
  );
  await page.locator("#pageadd").click();
  await page.locator("#blank-page").click();
  expect(await page.locator("#page-list button").count()).toBe(5);
  await page.evaluate(() => __studio.flush());
  await page.reload();
  await page.waitForFunction(() => !!window.__studio);
  expect(await page.locator("#page-list button").count()).toBe(5);
  expect(await page.evaluate(() => __studio.store.project.themes.length)).toBe(
    2,
  );
});

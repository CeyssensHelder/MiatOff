import { test, expect } from "@playwright/test";
import { DESIGNER_URL } from "./config.mjs";
const base = DESIGNER_URL;

async function open(page, db = crypto.randomUUID(), extra = "&setup=1") {
  await page.goto(base + "?test=1&db=" + db + extra);
  await expect.poll(() => page.evaluate(() => !!window.__studio)).toBe(true);
  return db;
}
const dialog = (page) => page.locator("#setup-dialog");
const vehicle = (page) =>
  page.evaluate(() => JSON.parse(JSON.stringify(__studio.store.project.vehicle)));

test("first run asks for the car, applies a US preset, and does not ask again", async ({ page }) => {
  const db = await open(page);
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("#setup-title")).toHaveText("Your car");
  await page.locator("#setup-market").selectOption("US");
  const preset = await page.evaluate(async () => {
    const S = await import("./v3/car-setup.mjs");
    const c = S.resolveChoices({ market: "US" });
    return { id: c.preset.id, ratios: c.preset.ratios, redline: c.preset.rpm.red };
  });
  await page.locator("#setup-next").click();
  await expect(page.locator("#setup-title")).toHaveText("Units and summary");
  await expect(page.locator("#setup-unit-speed")).toHaveValue("mph");
  await expect(page.locator("#setup-unit-temperature")).toHaveValue("F");
  await expect(page.locator("#setup-summary-body tr")).toHaveCount(13);
  await page.locator("#setup-next").click();
  await expect(dialog(page)).toBeHidden();
  const v = await vehicle(page);
  expect(v.preset).toBe(preset.id);
  expect(v.units.speed).toBe("mph");
  expect(v.rpm.red).toBe(preset.redline);
  expect(v.ratios).toEqual(preset.ratios.map((r, i) => r ?? v.ratios[i]));
  // The Vehicle and units rows follow the new profile.
  await page.locator("#project-open").click();
  await page.locator("#vehicle-open").click();
  await expect(page.locator('#vehicle [data-vehicle="units.speed"]')).toHaveValue("mph");
  await expect(page.locator("#vehicle-summary")).toContainText(v.market);
  await page.keyboard.press("Escape");
  // Undo brings the default profile back in one step.
  await page.evaluate(() => __studio.store.undo());
  expect((await vehicle(page)).preset ?? null).toBe(null);
  await expect(page.locator('#vehicle [data-vehicle="units.speed"]')).toHaveValue("km/h");
  // Reload: the choice is remembered, so no dialog; the Project menu reopens it.
  await page.evaluate(() => __studio.flush());
  await open(page, db);
  await page.waitForTimeout(300);
  await expect(dialog(page)).toBeHidden();
  await page.locator("#project-open").click();
  await page.locator("#car-setup-open").click();
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("#setup-skip")).toHaveText("Cancel");
});

test("keeping the defaults leaves the legacy profile and is remembered", async ({ page }) => {
  const db = await open(page);
  const before = await vehicle(page);
  await page.locator("#setup-skip").click();
  await expect(dialog(page)).toBeHidden();
  expect(await vehicle(page)).toEqual(before);
  await open(page, db);
  await page.waitForTimeout(300);
  await expect(dialog(page)).toBeHidden();
});

test("an existing draft is asked once, prefilled from its vehicle", async ({ page }) => {
  const db = await open(page, undefined, "");
  await expect(dialog(page)).toBeHidden();
  await page.evaluate(() =>
    __studio.command("Edit vehicle", (p) => {
      p.vehicle.market = "UK";
    }),
  );
  await page.evaluate(() => __studio.flush());
  await open(page, db);
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("#setup-market")).toHaveValue("UK");
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await open(page, db);
  await page.waitForTimeout(300);
  await expect(dialog(page)).toBeHidden();
});

test("the Home designer never shows the car setup", async ({ page }) => {
  await page.goto(base + "?test=1&setup=1&mode=home&db=" + crypto.randomUUID());
  await page.waitForTimeout(800);
  await expect(dialog(page)).toBeHidden();
});

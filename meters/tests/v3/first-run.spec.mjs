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
  await expect(page.locator("#setup-title")).toHaveText("Choose your Mazda");
  await page.locator("#setup-next").click();
  await page.locator("#setup-market").selectOption("US");
  await page.locator("#setup-next").click();
  const preset = await page.evaluate(async () => {
    const S = await import("./v3/car-setup.mjs");
    const c = S.resolveChoices({ market: "US" });
    return { id: c.preset.id, ratios: c.preset.ratios, limit: c.preset.rpm.limit };
  });
  await page.locator("#setup-next").click();
  await expect(page.locator("#setup-title")).toHaveText("Units and summary");
  await expect(page.locator("#setup-unit-speed")).toHaveValue("mph");
  await expect(page.locator("#setup-unit-temperature")).toHaveValue("F");
  await expect(page.locator("#setup-summary-body tr")).toHaveCount(13);
  await expect(page.locator("#setup-margin")).toHaveValue("500");
  await page.locator("#setup-margin").selectOption("750");
  await expect(page.locator("#setup-summary-body")).toContainText("Red from" + (preset.limit - 750) + " rpm");
  await page.locator("#setup-next").click();
  await expect(dialog(page)).toBeHidden();
  const v = await vehicle(page);
  expect(v.preset).toBe(preset.id);
  expect(v.units.speed).toBe("mph");
  expect(v.rpm.limit).toBe(preset.limit);
  expect(v.rpm.red).toBe(preset.limit - 750);
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

test("the model narrows market choices, then market narrows the detailed specs", async ({ page }) => {
  await open(page);
  const model = page.locator("#setup-model");
  const market = page.locator("#setup-market");
  const engine = page.locator("#setup-engine");
  const drive = page.locator("#setup-drive");
  const next = page.locator("#setup-next");
  const back = page.locator("#setup-back");
  await expect(model).toHaveValue("MX-5");
  await expect(market).toBeHidden();
  await expect(engine).toBeHidden();
  await expect(model.locator("option")).toHaveText(["MX-5", "CX-5", "Mazda3"]);
  await model.selectOption("Mazda3");
  await next.click();
  await expect(market.locator("option")).toHaveText(["Continental Europe", "United Kingdom", "United States"]);
  await expect(engine).toBeHidden();
  await next.click();
  await expect(page.locator("#setup-preset")).toHaveText("2016 Mazda3 Center-Line (Germany)");
  await expect(page.locator("#setup-generation")).toHaveValue("BM");
  await back.click();
  await market.selectOption("UK");
  await next.click();
  await expect(page.locator("#setup-preset")).toHaveText("2018 Mazda3 Sport Black");
  await back.click();
  await back.click();
  await model.selectOption("CX-5");
  await next.click();
  await expect(market.locator("option")).toHaveText(["Continental Europe", "United States"]);
  await expect(market).toHaveValue("EU");
  await next.click();
  await expect(engine).toHaveValue("2.0");
  await back.click();
  await market.selectOption("US");
  await next.click();
  await expect(engine).toHaveValue("2.5");
  await expect(drive).toHaveValue("");
  await expect(next).toBeDisabled();
  await drive.selectOption("AWD");
  await expect(page.locator("#setup-preset")).toHaveText("2019 CX-5 Sport AWD");
  await next.click();
  await expect(page.locator("#setup-summary-body")).toContainText("calculated");
  await next.click();
  await expect(dialog(page)).toBeHidden();
  expect(await vehicle(page)).toMatchObject({
    preset: "cx5-kf-2019-us-sport-awd", finalDrive: 4.624, tyre: "225/65R17", year: 2019,
  });
  await page.locator("#project-open").click();
  await page.locator("#car-setup-open").click();
  await expect(model).toHaveValue("CX-5");
  await next.click();
  await expect(market).toHaveValue("US");
  await next.click();
  await expect(drive).toHaveValue("AWD");
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
  await page.locator("#setup-next").click();
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

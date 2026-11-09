// The car's Meters page (meters/index.html) in Chromium with generated custom pages: the CUSTOM group is the fifth
// row of the style menu, the picker shows at most eight pages and every page draws. Screenshots go to
// test-results/car for review. This is not a test on the car: Opera Presto and the CMU are not involved.
import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { carPages, serveMeters, starterProjects } from "./car-fixture.mjs";

let served, data;
test.beforeAll(async () => {
  data = await carPages(starterProjects()); // six starters, two pages each: twelve pages, the car keeps eight
  served = await serveMeters({ "/js/custom-pages.js": data.script });
  await mkdir("test-results/car", { recursive: true });
});
test.afterAll(async () => {
  await served?.close();
});

async function open(page, query) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  await page.setViewportSize({ width: 800, height: 480 });
  await page.goto(`${served.url}/index.html?src=sim&${query}`);
  await page.waitForTimeout(900);
  return errors;
}
const mode = (page) => page.locator("#stage").getAttribute("class");

test("CUSTOM is the fifth style row and the picker offers eight pages", async ({ page }) => {
  const errors = await open(page, "menu");
  await page.screenshot({ path: "test-results/car/style-menu.png" });
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter"); // open the fifth style
  await page.waitForTimeout(700);
  await page.screenshot({ path: "test-results/car/picker-eight.png" });
  for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight"); // past the end: stays on the last page
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  expect(await mode(page)).toBe("set-custom");
  expect(await page.locator("#dots span").count()).toBe(8);
  expect(await page.locator("#dots span.on").count()).toBe(1);
  expect(await page.locator("#dots span").last().getAttribute("class")).toBe("on");
  expect(errors).toEqual([]);
});

test("touch hits the fifth row and the eighth thumbnail", async ({ page }) => {
  const errors = await open(page, "menu");
  await page.mouse.click(400, 420); // fifth row (rows are 68 px high with five styles)
  await page.waitForTimeout(700);
  expect(await mode(page)).toBe("mode-menu");
  await page.mouse.click(650, 280); // eighth thumbnail: fourth column, second row
  await page.waitForTimeout(400);
  expect(await mode(page)).toBe("set-custom");
  expect(await page.locator("#dots span").last().getAttribute("class")).toBe("on");
  // The first four rows still open their own sets.
  await page.goto(`${served.url}/index.html?src=sim&menu`);
  await page.waitForTimeout(700);
  await page.mouse.click(400, 100);
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  expect(await mode(page)).toBe("set-street");
  expect(errors).toEqual([]);
});

for (let i = 0; i < 8; i++)
  test(`custom page ${i + 1} draws live data without errors`, async ({ page }) => {
    const errors = await open(page, `set=custom&page=${i}`);
    await page.waitForTimeout(1500);
    expect(await mode(page)).toBe("set-custom");
    await page.screenshot({ path: `test-results/car/page-${String(i + 1).padStart(2, "0")}.png` });
    // Not blank: the canvases hold more than one colour.
    const colours = await page.evaluate(() => {
      const seen = new Set();
      for (const id of ["bg", "fg"]) {
        const d = document.getElementById(id).getContext("2d").getImageData(0, 0, 800, 480).data;
        for (let k = 0; k < d.length; k += 4000) seen.add(d[k] + "," + d[k + 1] + "," + d[k + 2] + "," + d[k + 3]);
      }
      return seen.size;
    });
    expect(colours).toBeGreaterThan(3);
    expect(errors).toEqual([]);
  });

test("without custom pages the group is not in the menu", async ({ page }) => {
  const plain = await serveMeters();
  try {
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.setViewportSize({ width: 800, height: 480 });
    await page.goto(`${plain.url}/index.html?src=sim&menu`);
    await page.waitForTimeout(700);
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    expect(await mode(page)).toBe("set-y2077"); // the last of four styles
    await page.screenshot({ path: "test-results/car/four-styles.png" });
    expect(errors).toEqual([]);
  } finally {
    await plain.close();
  }
});

import { test, expect } from "@playwright/test";
import { contactFixture } from "./visual-fixture.mjs";
for (const name of [
  "Street",
  "Track",
  "Classic Analog",
  "Minimal",
  "Neon",
  "Retro Digital",
])
  test(name + " reviewed day/night pages", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1040 });
    await page.goto(
      "http://127.0.0.1:8890/designer/index.html?test=1&db=visual-" +
        crypto.randomUUID(),
    );
    await page.waitForFunction(() => !!window.__studio);
    await page.evaluate(contactFixture, name);
    await expect(page.locator("#visual-fixture")).toHaveScreenshot(
      name.toLowerCase().replaceAll(" ", "-") + ".png",
      { maxDiffPixels: 0 },
    );
  });

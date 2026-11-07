// Generates candidates only. A human/agent must inspect and copy approved PNGs into baselines.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { contactFixture } from "./visual-fixture.mjs";
const browser = await chromium.launch();
try {
  await mkdir("test-results/candidates", { recursive: true });
  for (const name of [
    "Street",
    "Track",
    "Classic Analog",
    "Minimal",
    "Neon",
    "Retro Digital",
  ]) {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1040 },
      deviceScaleFactor: 1,
    });
    await page.goto(
      "http://127.0.0.1:8890/designer/index.html?test=1&db=visual-" +
        crypto.randomUUID(),
    );
    await page.waitForFunction(() => !!window.__studio);
    await page.evaluate(contactFixture, name);
    await page.locator("#visual-fixture").screenshot({
      path:
        "test-results/candidates/" +
        name.toLowerCase().replaceAll(" ", "-") +
        ".png",
    });
    await page.close();
  }
} finally {
  await browser.close();
}

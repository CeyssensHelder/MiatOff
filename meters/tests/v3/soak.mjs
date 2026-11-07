// A wall-clock ten-minute soak in an isolated browser context and database.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
const browser = await chromium.launch(),
  context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  }),
  page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(
    "http://127.0.0.1:8890/designer/index.html?test=1&db=soak-" + Date.now(),
  );
  await page.waitForFunction(() => !!window.__studio);
  await page.evaluate(async () => {
    const M = await import("./v3/model.mjs");
    __studio.command("24-widget soak", (p) => {
      const types = [
        "number",
        "radial",
        "bar",
        "gmeter",
        "history",
        "power",
        "lap",
        "session",
        "shift",
        "warning",
        "label",
        "shape",
      ];
      p.themes[0].pages[0].widgets = Array.from({ length: 24 }, (_, i) =>
        Object.assign(M.widget(types[i % 12]), {
          x: (i % 6) * 132 + 4,
          y: Math.floor(i / 6) * 116 + 4,
          w: 124,
          h: 108,
          size: 32,
        }),
      );
    });
  });
  await page.locator("#play").click();
  const started = Date.now(),
    samples = [];
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 60000));
    const sample = await page.evaluate(() => ({
      time: __studio.sim.time,
      history: __studio.sim.history.length,
      caches: __studio.cacheStats(),
      undo: __studio.store.undoStack.length,
      frames: __studio.renderStats.frames,
      galleryFrames: __studio.renderStats.galleryFrames,
    }));
    samples.push(sample);
    console.log("SOAK", i + 1, JSON.stringify(sample));
    if (
      sample.history > 1200 ||
      sample.caches.finish > 64 ||
      sample.caches.background > 12
    )
      throw Error("Memory bounds exceeded");
  }
  await page.locator("#play").click();
  const before = await page.evaluate(() => __studio.renderStats.frames);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const after = await page.evaluate(() => __studio.renderStats.frames);
  const result = {
    elapsedMs: Date.now() - started,
    samples,
    errors,
    pausedFramesAdded: after - before,
  };
  const output = process.env.SOAK_OUTPUT ?? "artifacts/soak.json";
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2));
  if (errors.length || after - before > 1)
    throw Error("Soak errors or continued paused rendering");
  console.log("TEN MINUTE SOAK PASSED");
} finally {
  await browser.close();
}

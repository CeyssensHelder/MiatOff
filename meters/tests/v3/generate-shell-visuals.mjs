// Candidates only. Inspect before explicitly copying any PNG into baselines.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { shellStates, shellFixture } from "./shell-fixture.mjs";
const browser = await chromium.launch();
try {
  await mkdir("test-results/shell-candidates", { recursive: true });
  await mkdir("artifacts", { recursive: true });
  for (const state of shellStates) {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await shellFixture(page, state);
    await page.screenshot({
      path: `test-results/shell-candidates/ui-${state.name}.png`,
      mask: [page.locator("#save-status")],
      animations: "disabled",
    });
    await page.screenshot({
      path: `artifacts/review-${state.name}.png`,
      animations: "disabled",
    });
    await page.close();
  }
} finally {
  await browser.close();
}

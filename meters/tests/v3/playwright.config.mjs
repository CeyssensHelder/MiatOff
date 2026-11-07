import { defineConfig } from "@playwright/test";
export default defineConfig({
  testMatch: "*.spec.mjs",
  workers: 1,
  timeout: 30000,
  use: {
    browserName: "chromium",
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
  },
  snapshotPathTemplate: "{testDir}/baselines/{arg}{ext}",
  updateSnapshots: "none",
  reporter: "list",
});

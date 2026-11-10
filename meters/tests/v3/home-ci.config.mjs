// Self-contained Home browser checks, without platform-dependent screenshot comparisons.
import { defineConfig } from "@playwright/test";
import defaults from "./playwright.config.mjs";

process.env.METERS_DESIGNER_URL = "http://127.0.0.1:8898";
export default defineConfig({
  ...defaults,
  testMatch: "home.spec.mjs",
  webServer: {
    command: "node home-server.mjs",
    url: process.env.METERS_DESIGNER_URL + "/designer/index.html",
    reuseExistingServer: false,
    timeout: 30000,
  },
});

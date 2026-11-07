// Presentation-only fixtures: isolated drafts, frozen telemetry, loaded fonts.
export const shellStates = [
  { name: "basic", level: "Basic", width: 1366, height: 768 },
  { name: "advanced", level: "Advanced", width: 1366, height: 768 },
  { name: "expert", level: "Expert", width: 1366, height: 768 },
  { name: "phone", level: "Basic", width: 390, height: 844 },
];

export async function shellFixture(page, state) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(
    "http://127.0.0.1:8890/designer/index.html?test=1&db=shell-" +
      crypto.randomUUID(),
  );
  await page.waitForFunction(() => !!window.__studio);
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#layers-tab").click();
  await page
    .locator("#layers button")
    .filter({ hasText: "SPEED · Number" })
    .click();
  await page.getByRole("button", { name: state.level, exact: true }).click();
  if (state.level === "Expert") {
    for (const title of ["Content", "Appearance", "Effects"]) {
      await page
        .locator("#properties summary")
        .filter({ hasText: new RegExp("^" + title + "$") })
        .click();
    }
    await page.locator(".inspector-panel").evaluate((node) => {
      node.scrollTop = 0;
    });
  }
  await page.setViewportSize({ width: state.width, height: state.height });
  if (state.name === "phone") await page.locator("#inspector-tab").click();
  await page.evaluate(() => __studio.flush());
  await page.locator("#canvas").waitFor({ state: "visible" });
}

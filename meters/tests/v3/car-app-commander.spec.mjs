import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { serveMeters } from "./car-fixture.mjs";

// Model the HMI's controller listener in the outer document. Browser hit testing
// decides which document gets the next wheel event after a tap or mouse gesture.
const template = new URL("../../../meters-app/app/templates/MiatoffMeters/", import.meta.url);
let served;
test.beforeAll(async () => {
  served = await serveMeters({
    "/template.js": await readFile(new URL("js/MiatoffMetersTmplt.js", template)),
    "/template.css": await readFile(new URL("css/MiatoffMetersTmplt.css", template)),
    "/hmi.html": `<!doctype html><link rel="stylesheet" href="/template.css">
      <main></main><script>
        var log = { addSrcFile() {} }, framework = { registerTmpltLoaded() {} };
      </script><script src="/template.js"></script><script>
        MIATOFF_METERS_URL = "/index.html?src=sim";
        var t = new MiatoffMetersTmplt("miatoff", document.querySelector("main"), "meters", {});
        document.addEventListener("wheel", e => t.handleControllerEvent(e.deltaX > 0 ? "cw" : "ccw"));
        document.addEventListener("keydown", e => {
          if (e.key === "Enter") t.handleControllerEvent("select");
          if (e.key === "ArrowRight") t.handleControllerEvent("right");
          if (e.key === "Backspace") t.miatoffBack();
        });
      </script>`,
  });
});
test.afterAll(() => served?.close());
test.use({ hasTouch: true });

for (const input of ["touch", "mouse"]) {
  test(`Commander rotation still reaches Meters after ${input} input`, async ({ page }) => {
    await page.goto(served.url + "/hmi.html");
    const meters = page.frameLocator("iframe");
    const dots = meters.locator("#dots span");
    const stage = meters.locator("#stage");
    await expect(stage).toHaveClass("mode-menu");

    await page.evaluate(() => window.t.handleControllerEvent("cw")); // turn from Street to Track
    await page.keyboard.press("Enter");     // open Track's picker with the Commander
    if (input === "touch") await page.touchscreen.tap(100, 200);
    else await page.mouse.click(100, 200);
    await expect(stage).toHaveClass("set-track");
    await expect(dots.nth(0)).toHaveClass("on");
    await page.mouse.move(100, 200);        // next turn occurs where the screen was touched
    await page.mouse.wheel(120, 0);
    await expect(dots.nth(1)).toHaveClass("on");
    await page.mouse.wheel(-120, 0);
    await expect(dots.nth(0)).toHaveClass("on");

    if (input === "touch") {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 525, y: 220 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 250, y: 220 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
    } else {
      await page.mouse.move(525, 220);
      await page.mouse.down();
      await page.mouse.move(250, 220);
      await page.mouse.up();
    }
    await expect(dots.nth(1)).toHaveClass("on");
    await page.mouse.wheel(-120, 0);
    await expect(dots.nth(0)).toHaveClass("on");
    await page.keyboard.press("Backspace"); // return to picker, tilt and press
    await expect(stage).toHaveClass("mode-menu");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(stage).toHaveClass("set-track");
    await expect(dots.nth(1)).toHaveClass("on");
  });
}

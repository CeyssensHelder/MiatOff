// The car's Meters page (meters/index.html) in Chromium: custom pages work out the gear from their own gearing
// (ratios, final drive, rolling circumference); a page without complete gearing and the built-in styles use the
// ND1 1.5 table in app.js. This is not a test on the car: Opera Presto and the CMU are not involved.
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { carPages, gearProjects, metersRoot, serveMeters, OWN_GEARING } from "./car-fixture.mjs";

// Keeps the custom set's API and pages for the test (appended to the real custom.js, which app.js then calls).
const SHIM = `
;(function () {
    var make = window.MeterSets.custom;
    window.MeterSets.custom = function (A) { var pages = make(A); window.__custom = { A: A, pages: pages }; return pages; };
})();
`;

let served, data;
test.beforeAll(async () => {
  data = await carPages(gearProjects());
  const custom = await readFile(join(metersRoot, "js/custom.js"), "utf8");
  served = await serveMeters({ "/js/custom-pages.js": data.script, "/js/custom.js": custom + SHIM });
});
test.afterAll(async () => {
  await served?.close();
});

test("the generated pages carry the gearing only when it is complete", () => {
  const pages = JSON.parse(data.script.split("window.MeterCustomPages = ")[1].split(";\nwindow.MeterCustomImages")[0]);
  expect(pages.map((p) => p.name)).toEqual(["own", "bare", "stock"]);
  expect(pages[0].vehicle).toMatchObject(OWN_GEARING);
  expect(Object.keys(pages[1].vehicle).sort()).toEqual(["rpm", "units"]);
  expect(pages[2].vehicle.ratios).toEqual([5.087, 2.991, 2.035, 1.594, 1.286, 1]);
});

test("a custom page derives the gear from its own gearing, others from the ND1 table", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.setViewportSize({ width: 800, height: 480 });
  // A poll source that never answers: nothing but the test writes MeterData.target.
  await page.goto(`${served.url}/index.html?src=poll:/no-data.json&set=custom&page=0`);
  await page.waitForTimeout(600);
  const result = await page.evaluate(() => {
    const { A, pages } = window.__custom, T = window.MeterData.target;
    // Everything in one synchronous block, so no frame or poll runs in between.
    const read = (speed, rpm, gear) => {
      delete T.gear;
      if (gear !== undefined) { T.gear = gear; A.v.gear = gear; }
      T.speed = speed;
      T.rpm = rpm;
      A.v.clutch = 0;
      const now = 1e9 + Math.random() * 1e6; // a fresh time: no cached reading
      return { own: pages[0].state(now).gear, bare: pages[1].state(now).gear, stock: pages[2].state(now).gear, builtIn: A.gear() };
    };
    // The old hard-coded table, to show the default table did not change.
    const old = [0, 5.087, 2.991, 2.035, 1.594, 1.286, 1.0];
    for (let g = 1; g < old.length; g++) old[g] *= (2.866 * 60) / (1.89 * 3.6);
    return {
      // 80 km/h at 2803 rpm: 4th of the own gearing (35.0 rpm per km/h), 5th of the ND1 (32.5).
      fourth: read(80, 2803),
      // 60 km/h at 1682 rpm: 5th of the own gearing (28.0), 6th of the ND1 (25.3).
      fifth: read(60, 1682),
      // A gear the car reports wins on every page.
      reported: read(80, 2803, 2),
      tables: {
        own: pages[0].gearTable,
        bare: pages[1].gearTable,
        stock: pages[2].gearTable,
        nd1: A.gearTable([5.087, 2.991, 2.035, 1.594, 1.286, 1.0], 2.866, 1.89),
        old,
      },
    };
  });
  expect(result.fourth).toEqual({ own: 4, bare: 5, stock: 5, builtIn: 5 });
  expect(result.fifth).toEqual({ own: 5, bare: 6, stock: 6, builtIn: 6 });
  expect(result.reported).toEqual({ own: 2, bare: 2, stock: 2, builtIn: 2 });
  expect(result.tables.bare).toBeNull();
  expect(result.tables.stock).toEqual(result.tables.old);
  expect(result.tables.nd1).toEqual(result.tables.old); // bit for bit the table app.js used before
  expect(result.tables.own.length).toBe(6);
  expect(result.tables.own[4]).toBeCloseTo((1.0 * 4.1 * 60) / (1.95 * 3.6), 10);
  expect(errors).toEqual([]);
});

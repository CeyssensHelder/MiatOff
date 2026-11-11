// The car's Meters page (meters/index.html) in Chromium with a car profile from the designer's car setup
// (js/car-profile.js): the built-in styles take their RPM warnings, gearing and factory power figures from it, and
// keep the ND1 1.5 values when there is no profile or it is not sane. This is not a test on the car: Opera Presto
// and the CMU are not involved.
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { metersRoot, serveMeters } from "./car-fixture.mjs";

// Keeps the shared API for the test (appended to the real custom.js; app.js hands every set the same object).
const SHIM = `
;(function () {
    var make = window.MeterSets.custom;
    window.MeterSets.custom = function (A) { window.__A = A; return make(A); };
})();
`;
// ND1 2.0 automatic (US): cuts at 6800, red 500 rpm earlier.
const PROFILE = {
  label: "ND1 2.0 automatic (US)",
  preset: "nd1-20-at",
  rpm: { max: 8000, amber: 5800, red: 6300, shift: 6500, limit: 6800 },
  ratios: [3.538, 2.06, 1.404, 1, 0.713, 0.582],
  finalDrive: 3.454,
  circumference: 1.936,
  ratedPower: 160,
  powerRpm: 6000,
  ratedTorque: 200,
  torqueRpm: 4600,
  mass: 1080,
  units: { speed: "mph", distance: "mi", temperature: "F", power: "hp", torque: "lb-ft", consumption: "mpg US" },
};
const script = (profile) => `window.MeterCarProfile = ${JSON.stringify(profile)};\n`;
const SETS = ["street", "track", "cyber", "y2077", "y2077n"];

let custom;
test.beforeAll(async () => {
  custom = (await readFile(join(metersRoot, "js/custom.js"), "utf8")) + SHIM;
});

async function open(page, served, set = "custom") {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.setViewportSize({ width: 800, height: 480 });
  // A poll source that never answers: nothing but the test writes MeterData.target.
  await page.goto(`${served.url}/index.html?src=poll:/no-data.json&set=${set}`);
  await page.waitForTimeout(600);
  return errors;
}
// Gear for a speed (km/h) and rpm, worked out by app.js in one synchronous block.
const gearAt = (page, speed, rpm) =>
  page.evaluate(
    ([speed, rpm]) => {
      const A = window.__A, T = window.MeterData.target;
      delete T.gear;
      T.speed = speed;
      T.rpm = rpm;
      A.v.clutch = 0;
      return A.gear();
    },
    [speed, rpm],
  );
const perKmh = (ratio, p) => (ratio * p.finalDrive * 60) / (p.circumference * 3.6);

test("a car profile sets the RPM warnings, gearing and power figures of the built-in styles", async ({ page }) => {
  const served = await serveMeters({ "/js/custom.js": custom, "/js/car-profile.js": script(PROFILE) });
  try {
    const errors = await open(page, served);
    const rpm = await page.evaluate(() => ({ ...window.__A.RPM }));
    expect(rpm).toEqual({ low: 1000, ...PROFILE.rpm });
    // 3rd of the automatic at 80 km/h; the ND1 1.5 manual table would say 4th or 5th.
    expect(await gearAt(page, 80, Math.round(80 * perKmh(1.404, PROFILE)))).toBe(3);
    expect(await gearAt(page, 120, Math.round(120 * perKmh(0.582, PROFILE)))).toBe(6);
    expect(errors).toEqual([]);
  } finally {
    await served.close();
  }
});

test("every built-in style draws with a car profile", async ({ page }) => {
  const served = await serveMeters({ "/js/custom.js": custom, "/js/car-profile.js": script(PROFILE) });
  try {
    for (const set of SETS) {
      const errors = await open(page, served, set);
      // Drive through the warning zones so every rpm-dependent branch draws.
      for (const r of [3000, 5900, 6400, 6600, 6900]) {
        await page.evaluate((r) => {
          const T = window.MeterData.target;
          T.rpm = r;
          T.speed = 90;
        }, r);
        await page.waitForTimeout(80);
      }
      expect(errors, set).toEqual([]);
    }
  } finally {
    await served.close();
  }
});

test("without a profile, or with one that is not sane, the ND1 1.5 values stay", async ({ page }) => {
  const nd1 = { low: 1000, amber: 6500, red: 7000, shift: 7200, limit: 7500, max: 8000 };
  for (const profile of [null, { rpm: { max: 8000, amber: 7000, red: 6000, shift: 7200, limit: 7500 }, ratios: [0, 1] }]) {
    const served = await serveMeters({ "/js/custom.js": custom, "/js/car-profile.js": script(profile) });
    try {
      const errors = await open(page, served);
      expect(await page.evaluate(() => ({ ...window.__A.RPM }))).toEqual(nd1);
      // 80 km/h in 5th of the ND1 1.5 manual (32.5 rpm per km/h).
      expect(await gearAt(page, 80, 2600)).toBe(5);
      expect(errors).toEqual([]);
    } finally {
      await served.close();
    }
  }
});

// The drawn text of each built-in style: 100 km/h and 90 deg C show in the profile's units, and only there.
for (const set of ["street", "track", "cyber", "y2077"]) {
  for (const [name, profile] of [["US units", PROFILE], ["default (metric)", null]]) {
    test(`${set} draws speed and temperature in the ${name}`, async ({ page }) => {
      await page.addInitScript(() => {
        window.__drawn = new Set();
        window.__stream = [];
        const fill = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (s) {
          window.__drawn.add(String(s));
          window.__stream.push(String(s));
          return fill.apply(this, arguments);
        };
      });
      const served = await serveMeters({ "/js/custom.js": custom, "/js/car-profile.js": script(profile) });
      try {
        const errors = await open(page, served, set);
        await page.evaluate(() => {
          window.MeterData.target.speed = 100;
          window.MeterData.target.coolant = 90;
        });
        const want = profile ? ["62", "194"] : ["100", "90"];
        await expect
          .poll(async () => {
            const drawn = await page.evaluate(() => [...window.__drawn]);
            return want.every((s) => drawn.some((d) => d === s || d.indexOf(s) >= 0));
          })
          .toBe(true);
        const drawn = await page.evaluate(() => [...window.__drawn]);
        // Some styles draw spaced labels letter by letter, so also search the joined stream of one frame's calls.
        const stream = await page.evaluate(() => window.__stream.join(""));
        const has = (re) => drawn.some((d) => re.test(d)) || re.test(stream);
        if (profile) {
          expect(has(/mph/i), "mph").toBe(true);
          expect(has(/km\/h/i), "no km/h").toBe(false);
          expect(has(/194/), "194 F").toBe(true);
          expect(has(/90°C/), "no 90 C").toBe(false);
        } else {
          expect(has(/km\/h/i), "km/h").toBe(true);
          expect(has(/mph/i), "no mph").toBe(false);
          expect(has(/°F/), "no F").toBe(false);
        }
        expect(errors).toEqual([]);
      } finally {
        await served.close();
      }
    });
  }
}

test("the stick's default car-profile.js has no profile", async () => {
  const text = await readFile(join(metersRoot, "js/car-profile.js"), "utf8");
  expect(text).toMatch(/window\.MeterCarProfile = null;/);
});

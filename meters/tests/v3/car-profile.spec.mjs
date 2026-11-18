// The car's Meters page (meters/index.html) in Chromium with a car profile from the designer's car setup
// (js/car-profile.js): the built-in styles take their RPM warnings, gearing and factory power figures from it, and
// keep the ND1 1.5 values when there is no profile or it is not sane. This is not a test on the car: Opera Presto
// and the CMU are not involved.
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { defaults } from "../../designer/v3/model.mjs";
import { applyPreset, presetById } from "../../designer/v3/car-setup.mjs";
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

for (const [drive, finalDrive] of [["fwd", 4.325], ["awd", 4.624]]) {
  test(`the US CX-5 ${drive.toUpperCase()} uses its final drive to infer gear`, async ({ page }) => {
    const project = defaults();
    applyPreset(project, presetById("cx5-kf-2019-us-sport-" + drive), { market: "US" });
    const profile = project.vehicle;
    const served = await serveMeters({ "/js/custom.js": custom, "/js/car-profile.js": script(profile) });
    try {
      await open(page, served);
      const expected = { finalDrive, circumference: 2.275 };
      expect(await gearAt(page, 80, Math.round(80 * perKmh(1.452, expected)))).toBe(3);
      expect(await gearAt(page, 110, Math.round(110 * perKmh(0.599, expected)))).toBe(6);
      // The app's 12% tolerance can accept the other final drive. Check the thresholds too.
      expect(await gearAt(page, 100, 1750)).toBe(drive === "fwd" ? 6 : undefined);
    } finally {
      await served.close();
    }
  });
}

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

// The POWER page's chart. Its geometry is in PS and Nm (the top of the axis is V1 of both); the power axis on the left
// and the torque axis on the right are each labelled in the display unit, and the factory rings sit on their own axis.
const CHART = { x0: 312, y0: 44, y1: 384 };
const chartY = (canonical, v1) => CHART.y1 - (canonical / v1) * (CHART.y1 - CHART.y0);
async function powerPage(page, profile) {
  await page.addInitScript(() => {
    window.__text = [];
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s, x, y) {
      window.__text.push({ s: String(s), x, y, color: String(this.fillStyle), align: this.textAlign });
      return fill.apply(this, arguments);
    };
  });
  const served = await serveMeters({ "/js/custom.js": custom, "/js/car-profile.js": script(profile) });
  try {
    const errors = await open(page, served, "street&page=2");
    expect(errors).toEqual([]);
    const all = await page.evaluate(() => window.__text);
    expect(all.some((t) => t.s === "estimated at the crank"), "the POWER page is drawn").toBe(true);
    const C = await page.evaluate(() => window.MeterGauges.C);
    const numbers = (list) => list.filter((t) => /^\d+$/.test(t.s));
    // Tick labels: numbers right of the plot's left edge are right-aligned to it; the torque axis is past the plot.
    const left = numbers(all.filter((t) => t.align === "right" && t.x === CHART.x0 - 8));
    const legend = all.filter((t) => t.y === 18 && t.align === "left").map((t) => t.s);
    const plotRight = all.find((t) => t.s === "x1000 rpm").x;
    const right = numbers(all.filter((t) => t.align === "left" && t.x > plotRight));
    const ring = (color) => numbers(all.filter((t) => t.align === "center" && t.color === color && t.y < CHART.y1));
    return { all, C, left, right, legend, plotRight, power: ring(C.red), torque: ring(C.blue) };
  } finally {
    await served.close();
  }
}
const close = (got, want, what) => expect(Math.abs(got - want), `${what}: ${got} is not ${want}`).toBeLessThan(0.01);

test("the POWER page in metric units keeps its single PS/Nm axis", async ({ page }) => {
  const p = await powerPage(page, null);
  expect(p.left.map((t) => t.s)).toEqual(["0", "50", "100", "150"]);
  for (const t of p.left) {
    close(t.y, chartY(Number(t.s), 180), `tick ${t.s}`);
    expect(t.color).toBe(p.C.dim);
  }
  expect(p.right).toEqual([]);
  expect(p.plotRight).toBe(776);
  expect(p.legend).toEqual(["PS", "Nm", "o = factory"]);
  const at = (s) => p.all.find((t) => t.s === s && t.y === 18).x;
  expect([at("PS"), at("Nm"), at("o = factory")]).toEqual([320, 356, 396]);
  // ND1 1.5 factory figures: 131 PS drawn below its ring, 150 Nm above it.
  expect(p.power.map((t) => [t.s, t.y])).toEqual([["131", chartY(131, 180) + 22]]);
  expect(p.torque.map((t) => [t.s, t.y])).toEqual([["150", chartY(150, 180) - 20]]);
});

test("the default car's kW and lb-ft axes count in 25s, not just 50 and 100", async ({ page }) => {
  // Units only, so the factory figures and the 180 PS / 180 Nm top of the axes are the ND1 1.5's: 132 kW, 133 lb-ft.
  const p = await powerPage(page, { units: { ...PROFILE.units, power: "kW", torque: "lb-ft" } });
  const want = ["0", "25", "50", "75", "100", "125"];
  expect(p.left.map((t) => t.s)).toEqual(want);
  expect(p.right.map((t) => t.s)).toEqual(want);
  for (const t of p.left) close(t.y, chartY(Number(t.s) / 0.73549875, 180), `kW tick ${t.s}`);
  for (const t of p.right) close(t.y, chartY(Number(t.s) / 0.7375621493, 180), `lb-ft tick ${t.s}`);
});

for (const [units, hp, lbft, powerTicks, torqueTicks] of [
  [{ power: "hp", torque: "lb-ft" }, 0.9863200706, 0.7375621493, ["0", "50", "100", "150", "200"], ["0", "50", "100", "150"]],
  [{ power: "kW", torque: "Nm" }, 0.73549875, 1, ["0", "50", "100", "150"], ["0", "50", "100", "150", "200", "250"]],
  [{ power: "PS", torque: "lb-ft" }, 1, 0.7375621493, ["0", "50", "100", "150", "200", "250"], ["0", "50", "100", "150"]],
]) {
  test(`the POWER page in ${units.power} and ${units.torque} has an axis for each`, async ({ page }) => {
    // 160 PS and 200 Nm: the top of both axes is 250 PS and 250 Nm.
    const p = await powerPage(page, { ...PROFILE, units: { ...PROFILE.units, ...units } });
    expect(p.left.map((t) => t.s)).toEqual(powerTicks);
    expect(p.right.map((t) => t.s)).toEqual(torqueTicks);
    for (const t of p.left) {
      close(t.y, chartY(Number(t.s) / hp, 250), `${units.power} tick ${t.s}`);
      expect(t.color).toBe(p.C.red);
    }
    for (const t of p.right) {
      close(t.y, chartY(Number(t.s) / lbft, 250), `${units.torque} tick ${t.s}`);
      expect(t.color).toBe(p.C.blue);
      expect(t.x).toBeLessThan(800 - 30);                    // room for three digits on the 800 px screen
    }
    expect(p.legend).toEqual([units.power, units.torque, "o = factory"]);
    // The factory rings are labelled in the display unit and sit at that value on their own axis.
    expect(p.power.map((t) => t.s)).toEqual([String(Math.round(160 * hp))]);
    expect(p.torque.map((t) => t.s)).toEqual([String(Math.round(200 * lbft))]);
    close(p.power[0].y - 22, chartY(160, 250), "factory power ring");
    close(p.torque[0].y + 20, chartY(200, 250), "factory torque ring");
  });
}

test("the stick's default car-profile.js has no profile", async () => {
  const text = await readFile(join(metersRoot, "js/car-profile.js"), "utf8");
  expect(text).toMatch(/window\.MeterCarProfile = null;/);
});

// The designer's renderer (v3/renderer.mjs) and the car's ES5 port (js/custom.js) must draw the same pixels.
// Every starter page and a matrix of instruments (all types, variants, options and units) is drawn by both with
// the same frozen state; the images are compared in the same Chromium. Diff images of failures go to test-results/parity.
import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { carPages, serveMeters, starterProjects, matrixProjects } from "./car-fixture.mjs";

// A pixel counts as different when a colour channel is off by more than this; a page fails when more than
// MAX_BAD pixels (of 384000) differ. Anti-aliasing of the same path is identical, so the allowance is small.
const CHANNEL = 16;
const MAX_BAD = 10;

const PAGE = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:"MO Chakra";src:url("/fonts/ChakraPetch-Bold.ttf")}
@font-face{font-family:"MO Mono";src:url("/fonts/ShareTechMono-Regular.ttf")}
@font-face{font-family:"MO Condensed";src:url("/fonts/Rajdhani-Bold.ttf")}
@font-face{font-family:"MO Sport";src:url("/fonts/RussoOne-Regular.ttf")}
body{margin:0;background:#000}</style><body></body>`;

let served, data;
test.beforeAll(async () => {
  data = await carPages([...starterProjects(), ...matrixProjects()]);
  served = await serveMeters({ "/parity.html": PAGE });
});
test.afterAll(async () => {
  await served?.close();
});

test("car renderer matches the designer renderer for starters and the instrument matrix", async ({ page }) => {
  test.setTimeout(240000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(served.url + "/parity.html");
  await page.addScriptTag({ content: data.script });
  await page.addScriptTag({ url: "/js/units.js" });
  await page.addScriptTag({ url: "/js/custom.js" });
  const result = await page.evaluate(
    async ({ setups, channel, maxBad }) => {
      const R = await import("/designer/v3/renderer.mjs");
      for (const face of ["MO Chakra", "MO Mono", "MO Condensed", "MO Sport"])
        for (const weight of ["normal", "bold"]) await document.fonts.load(`${weight} 18px "${face}"`);
      await document.fonts.ready;
      const history = (span, seconds) =>
        Array.from({ length: Math.round(seconds * 10) }, (_, i) => {
          const t = 100 - seconds + i / 10;
          return {
            time: t,
            speed: 80 + Math.sin(t / 5) * 40,
            rpm: 3500 + Math.sin(t / 2) * 2000,
            coolant: 88 + Math.sin(t / 9) * 3,
            fuel: 70 - (i % 5) * 0.01,
            gLat: i % 97 === 0 ? null : Math.sin(t / 2) * 0.5,
            gLong: Math.cos(t / 2) * 0.3,
            throttle: 40 + Math.sin(t) * 30,
            power: 90 + Math.sin(t / 2) * 40,
            torque: 125 + Math.sin(t / 3) * 20,
          };
        });
      const normal = {
        time: 100, speed: 123, rpm: 4500, gear: 3, coolant: 90, iat: 32, outside: 18, fuel: 70, trip: 12.3,
        consumption: 6.8, gLat: 0.4, gLong: -0.2, throttle: 40, power: 95, torque: 130, maxSpeed: 156, maxRpm: 7200,
        maxG: 0.5, laps: 3, lap: "1:24.5", lastLap: "1:38.2", bestLap: "1:35.0", delta: "+3.2", history: history(0, 120),
      };
      const states = {
        normal,
        alarm: { ...normal, time: 100.2, speed: 201, rpm: 7300, gear: 5, coolant: 115, fuel: 10, gLat: 2.6, gLong: 0.5, throttle: 100 },
        flash: { ...normal, time: 100.1, rpm: 7250, coolant: 104, gear: -1, outside: -5, gLat: -1.1 },
        missing: Object.fromEntries(
          Object.keys(normal).map((k) => [k, ["time"].includes(k) ? 100 : k === "history" ? [] : ["maxSpeed", "maxRpm", "laps"].includes(k) ? 0 : null]),
        ),
      };
      const a = document.createElement("canvas"), b = document.createElement("canvas");
      a.width = b.width = 800;
      a.height = b.height = 480;
      const ca = a.getContext("2d", { willReadFrequently: true }), cb = b.getContext("2d", { willReadFrequently: true });
      // Start the image loads, then give them time.
      for (const [i, setup] of setups.entries()) {
        cb.clearRect(0, 0, 800, 480);
        window.MeterCustom.render(cb, window.MeterCustomPages[i], { ...states.normal });
      }
      for (const setup of setups) await R.prepareAssets(setup.assets);
      await new Promise((done) => setTimeout(done, 200));
      const rows = [], failures = [];
      for (const [i, setup] of setups.entries()) {
        const M = await import("/designer/v3/model.mjs");
        // Pages saved before the newer options existed get the designer's legacy defaults when it opens them.
        const theme = structuredClone(setup.themes[0]), p = theme.pages[0];
        p.widgets = p.widgets.map((w) => M.normalizeWidget(w, setup.vehicle, false));
        for (const [name, base] of Object.entries(states)) {
          ca.clearRect(0, 0, 800, 480);
          cb.clearRect(0, 0, 800, 480);
          R.render(ca, theme, p, setup.assets, { ...base, vehicle: setup.vehicle }, { mode: "night" });
          window.MeterCustom.render(cb, window.MeterCustomPages[i], { ...base });
          const da = ca.getImageData(0, 0, 800, 480).data, db = cb.getImageData(0, 0, 800, 480).data;
          let bad = 0, max = 0;
          const diff = new ImageData(800, 480);
          for (let k = 0; k < da.length; k += 4) {
            const d = Math.max(Math.abs(da[k] - db[k]), Math.abs(da[k + 1] - db[k + 1]), Math.abs(da[k + 2] - db[k + 2]), Math.abs(da[k + 3] - db[k + 3]));
            if (d > max) max = d;
            if (d > channel) {
              bad++;
              diff.data.set([255, 0, 255, 255], k);
            } else diff.data.set([da[k] >> 2, da[k + 1] >> 2, da[k + 2] >> 2, 255], k);
          }
          rows.push({ page: p.name, state: name, bad, max });
          if (bad > maxBad) {
            const out = document.createElement("canvas");
            out.width = 2400;
            out.height = 480;
            const o = out.getContext("2d");
            o.drawImage(a, 0, 0);
            o.drawImage(b, 800, 0);
            const t = document.createElement("canvas");
            t.width = 800;
            t.height = 480;
            t.getContext("2d").putImageData(diff, 0, 0);
            o.drawImage(t, 1600, 0);
            failures.push({ page: p.name, state: name, bad, image: out.toDataURL("image/png") });
          }
        }
      }
      return { rows, failures, pages: setups.length };
    },
    { setups: data.setups, channel: CHANNEL, maxBad: MAX_BAD },
  );
  await mkdir("test-results/parity", { recursive: true });
  const worst = [...result.rows].sort((x, y) => y.bad - x.bad).slice(0, 25);
  await writeFile("test-results/parity/summary.json", JSON.stringify({ pages: result.pages, worst, rows: result.rows }, null, 1));
  for (const f of result.failures)
    await writeFile(
      `test-results/parity/${f.page.replace(/[^a-z0-9]+/gi, "-")}-${f.state}.png`,
      Buffer.from(f.image.split(",")[1], "base64"),
    );
  console.log(`parity: ${result.pages} pages x 4 states, worst ${worst[0].bad} px (${worst[0].page}/${worst[0].state}), limit ${MAX_BAD}`);
  expect(errors).toEqual([]);
  expect(result.failures.map((f) => `${f.page}/${f.state}: ${f.bad} px`)).toEqual([]);
});

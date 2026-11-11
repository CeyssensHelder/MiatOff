// SPDX-License-Identifier: GPL-3.0-or-later
// What keeps custom pages quick and straight on the car's old browser: fixed parts are drawn once, the per-frame path
// sets no clip regions, unchanged instruments are skipped, numbers are not re-measured, and edges land on whole pixels.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../../js/custom.js", import.meta.url), "utf8");

function recorder() {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === "measureText") return (s) => { calls.push(["measureText", s]); return { width: String(s).length * 10 }; };
        if (["createLinearGradient", "createRadialGradient"].includes(key)) return () => ({ addColorStop() {} });
        return (...args) => { calls.push([key, ...args]); };
      },
      set(target, key, value) {
        if (key === "font") calls.push(["font", value]);
        target[key] = value;
        return true;
      },
    },
  );
  return { ctx, calls, named: (n) => calls.filter((c) => c[0] === n), reset: () => (calls.length = 0) };
}

const WIDGETS = [
  { type: "radial", variant: "arc", signal: "rpm", x: 20, y: 20, w: 300, h: 300, size: 56, tickLabels: "inside" },
  { type: "number", variant: "plain", signal: "speed", x: 340, y: 20, w: 200, h: 140, size: 60 },
  { type: "number", variant: "plain", signal: "coolant", x: 560, y: 20, w: 200, h: 140, size: 44 },
  { type: "shift", variant: "segmented", signal: "rpm", x: 340, y: 180, w: 437, h: 60, segments: 17, gap: 4 },
  { type: "bar", variant: "segmented", signal: "fuel", x: 340, y: 260, w: 437, h: 60, segments: 13, gap: 3 },
];

function load(widgets = WIDGETS) {
  const window = {},
    document = { createElement: () => ({ width: 0, height: 0, getContext: () => recorder().ctx }) };
  window.MeterCustomPages = [{ name: "T", style: { effect: "neon", radius: 14 }, vehicle: {}, background: { kind: "solid" }, widgets }];
  window.MeterCustomImages = {};
  const context = vm.createContext({ window, document, Image: function () {} });
  vm.runInContext(readFileSync(new URL("../../js/units.js", import.meta.url), "utf8"), context);
  vm.runInContext(source, context);
  const v = { speed: 80, rpm: 3000, coolant: 90, fuel: 50 },
    api = {
      v,
      felt: true,
      dyno: { live: {} },
      sess: { start: 1, laps: 0, maxSpeed: 0, maxRpm: 0, lap() {}, stop() { return false; } },
      gear: () => 3,
      fmtLap: () => "1:00.0",
      fmtDelta: () => "+0.1",
    };
  const pages = window.MeterSets.custom(api);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].split, true);
  return { page: pages[0], v };
}

test("the corners are not built with arcTo, which left steps in them on the car", () => {
  for (const file of ["custom.js", "gauges.js", "app.js"])
    assert.doesNotMatch(readFileSync(new URL(`../../js/${file}`, import.meta.url), "utf8"), /\.arcTo\(/, file);
});

test("scale labels, ticks and panels are drawn once, on the background layer", () => {
  const { page } = load(),
    bg = recorder(),
    fg = recorder();
  page.drawStatic(bg.ctx);
  const labels = bg.named("fillText").map((c) => c[1]);
  assert.ok(labels.some((t) => /k$/.test(t)), "the dial's scale labels are on the background");
  page.draw(fg.ctx, 1000);
  const live = fg.named("fillText").map((c) => c[1]);
  assert.deepEqual(live.filter((t) => /k$/.test(t)), [], "and are not drawn again per frame");
  assert.ok(live.includes("3000") && live.includes("80") && live.includes("90"));
});

test("a live frame sets no clip regions", () => {
  const { page, v } = load(),
    fg = recorder();
  page.drawStatic(recorder().ctx);
  page.draw(fg.ctx, 1000);
  assert.equal(fg.named("clip").length, 0);
  v.speed = 81;
  page.drawChanged(fg.ctx, 2000);
  assert.equal(fg.named("clip").length, 0);
});

test("only the instruments whose reading changed are redrawn", () => {
  const { page, v } = load(),
    fg = recorder();
  page.drawStatic(recorder().ctx);
  page.draw(fg.ctx, 1000);
  fg.reset();
  page.drawChanged(fg.ctx, 2000);
  assert.deepEqual(fg.calls.filter((c) => !["save", "restore"].includes(c[0])), [], "nothing changed, nothing drawn");
  v.speed = 81;
  page.drawChanged(fg.ctx, 3000);
  assert.deepEqual(fg.named("clearRect"), [["clearRect", 340, 20, 200, 140]], "only the speed instrument is wiped");
  assert.deepEqual(fg.named("fillText").map((c) => c[1]), ["81"]);
});

test("a changing number is measured once and keeps its size", () => {
  const { page, v } = load(),
    fg = recorder();
  page.drawStatic(recorder().ctx);
  page.draw(fg.ctx, 1000);
  fg.reset();
  for (let i = 1; i < 40; i++) {
    v.speed = 80 + (i % 19);
    v.coolant = 90 + (i % 9);
    page.draw(fg.ctx, 1000 + i * 40);
  }
  assert.equal(fg.named("measureText").length, 0, "same number of digits: no new measurement");
  const fonts = new Set(fg.named("font").map((c) => c[1]));
  assert.ok(fonts.size <= 3, `one size per number (${[...fonts].join("; ")})`);
});

test("bars, segments and panel edges land on whole pixels with equal gaps", () => {
  const { page, v } = load(),
    bg = recorder(),
    fg = recorder();
  page.drawStatic(bg.ctx);
  v.rpm = 7000;
  page.draw(fg.ctx, 1000);
  const rects = [...bg.named("fillRect"), ...fg.named("fillRect")].map((c) => c.slice(1, 5));
  assert.ok(rects.length > 30);
  for (const r of rects) assert.ok(r.every(Number.isInteger), `whole pixels: ${r}`);
  const shift = bg.named("fillRect").map((c) => c.slice(1, 5)).filter((r) => r[1] > 180 && r[1] < 260 && r[0] >= 340);
  for (let i = 1; i < shift.length; i++) assert.equal(shift[i][0] - shift[i - 1][0] - shift[i - 1][2], 4, "every gap is the same");
  // A 1 px border follows pixel centres, so its straight parts cover one row of pixels.
  const borders = bg.named("lineTo").filter((c) => [c[1], c[2]].some((n) => !Number.isInteger(n)));
  assert.ok(borders.length > 0);
});

test("a very thick dial stays inside its box", () => {
  const { page } = load([{ ...WIDGETS[0], thickness: 44 }]),
    fg = recorder();
  page.drawStatic(recorder().ctx);
  page.draw(fg.ctx, 1000);
  assert.equal(fg.named("clip").length, 1);
});

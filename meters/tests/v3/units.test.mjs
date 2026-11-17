// meters/js/units.js axis ticks: the POWER page keeps its chart geometry in PS and Nm and labels a power axis and a
// torque axis, each in the display unit. A tick is a round number of that unit placed at its canonical value.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const box = { window: {} };
vm.runInNewContext(readFileSync(new URL("../../js/units.js", import.meta.url), "utf8"), box);
const U = box.window.MeterUnits;
// Copies: arrays made inside the vm context are not deepEqual to ours.
const labels = (ticks) => [...ticks].map((t) => t.label);
const places = (ticks) => [...ticks].map((t) => t.at);
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} is not ${b}`);

test("metric ticks are the canonical values, for power and torque alike", () => {
  for (const units of [undefined, U.METRIC])
    for (const signal of ["power", "torque"]) {
      const ticks = U.ticks(signal, 180, units);
      assert.deepEqual(labels(ticks), ["0", "50", "100", "150"]);
      assert.deepEqual(places(ticks), [0, 50, 100, 150]);
    }
});

test("hp and lb-ft ticks are round in their own unit and sit at different PS and Nm values", () => {
  const units = { power: "hp", torque: "lb-ft" };
  const power = U.ticks("power", 180, units), torque = U.ticks("torque", 180, units);
  assert.deepEqual(labels(power), ["0", "50", "100", "150"]);     // 180 PS is 177.5 hp
  assert.deepEqual(labels(torque), ["0", "25", "50", "75", "100", "125"]);   // 180 Nm is 132.8 lb-ft: in 25s
  near(power[2].at, 100 / 0.9863200706, "100 hp in PS");
  near(torque[4].at, 100 / 0.7375621493, "100 lb-ft in Nm");
  // Each tick, shown in its unit, reads as its label.
  for (const t of power) near(U.display("power", t.at, units), Number(t.label), "power tick");
  for (const t of torque) near(U.display("torque", t.at, units), Number(t.label), "torque tick");
});

test("kW ticks count in 25s on the default axis and Nm stays canonical", () => {
  const units = { power: "kW", torque: "Nm" };
  const power = U.ticks("power", 180, units);
  assert.deepEqual(labels(power), ["0", "25", "50", "75", "100", "125"]);    // 180 PS is 132.4 kW
  near(power[2].at, 50 / 0.73549875, "50 kW in PS");
  assert.deepEqual(places(U.ticks("torque", 180, units)), [0, 50, 100, 150]);
});

test("a tick exactly at the top of the axis is kept", () => {
  assert.deepEqual(labels(U.ticks("power", 250)), ["0", "50", "100", "150", "200", "250"]);
  assert.deepEqual(labels(U.ticks("torque", 50 / 0.7375621493, { torque: "lb-ft" })), ["0", "25", "50"]);
});

test("the step grows with the axis, so there are never more than six ticks above 0", () => {
  assert.deepEqual(labels(U.ticks("power", 300)), ["0", "50", "100", "150", "200", "250", "300"]);
  assert.deepEqual(labels(U.ticks("power", 350)), ["0", "100", "200", "300"]);
  assert.deepEqual(labels(U.ticks("torque", 150 / 0.7375621493, { torque: "lb-ft" })),
    ["0", "25", "50", "75", "100", "125", "150"]);
  // Past 1000 the step goes on in 1, 2 and 5 times a power of ten.
  assert.deepEqual(labels(U.ticks("power", 8000)), ["0", "2000", "4000", "6000", "8000"]);
  assert.deepEqual(labels(U.ticks("power", 100000)), ["0", "20000", "40000", "60000", "80000", "100000"]);
  for (const max of [180, 250, 400, 900, 2500, 7500, 100000, 1e9])
    for (const units of [undefined, { power: "hp" }, { power: "kW" }]) {
      const n = U.ticks("power", max, units).length;
      assert.ok(n >= 3 && n <= 7, `${n} ticks up to ${max} (0 and at most six above it)`);
    }
});

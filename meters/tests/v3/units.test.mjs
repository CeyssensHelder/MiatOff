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
      const ticks = U.ticks(signal, 180, 50, units);
      assert.deepEqual(labels(ticks), ["0", "50", "100", "150"]);
      assert.deepEqual(places(ticks), [0, 50, 100, 150]);
    }
});

test("hp and lb-ft ticks are round in their own unit and sit at different PS and Nm values", () => {
  const units = { power: "hp", torque: "lb-ft" };
  const power = U.ticks("power", 180, 50, units), torque = U.ticks("torque", 180, 50, units);
  assert.deepEqual(labels(power), ["0", "50", "100", "150"]);     // 180 PS is 177.5 hp
  assert.deepEqual(labels(torque), ["0", "50", "100"]);           // 180 Nm is 132.8 lb-ft
  near(power[2].at, 100 / 0.9863200706, "100 hp in PS");
  near(torque[2].at, 100 / 0.7375621493, "100 lb-ft in Nm");
  // Each tick, shown in its unit, reads as its label.
  for (const t of power) near(U.display("power", t.at, units), Number(t.label), "power tick");
  for (const t of torque) near(U.display("torque", t.at, units), Number(t.label), "torque tick");
});

test("kW ticks stop below the top of the axis and Nm stays canonical", () => {
  const units = { power: "kW", torque: "Nm" };
  const power = U.ticks("power", 180, 50, units);
  assert.deepEqual(labels(power), ["0", "50", "100"]);            // 180 PS is 132.4 kW
  near(power[1].at, 50 / 0.73549875, "50 kW in PS");
  assert.deepEqual(places(U.ticks("torque", 180, 50, units)), [0, 50, 100, 150]);
});

test("a tick exactly at the top of the axis is kept", () => {
  assert.deepEqual(labels(U.ticks("power", 250, 50)), ["0", "50", "100", "150", "200", "250"]);
  assert.deepEqual(labels(U.ticks("torque", 50 / 0.7375621493, 50, { torque: "lb-ft" })), ["0", "50"]);
});

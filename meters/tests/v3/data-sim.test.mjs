// meters/js/data.js, the built-in simulator (?src=sim): it drives with the gearing and rev limits of the car profile
// (js/car-profile.js), and with the ND1 1.5 values without one. A preview on the PC, not a test on the car.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../../js/data.js", import.meta.url), "utf8");

// Every sample the simulator emits in `seconds` of driving, without its noise (Math.random fixed at the middle), or
// with the noise at the top of its range (random 0.999).
function drive(profile, seconds = 300, random = 0.5) {
  const window = profile === undefined ? {} : { MeterCarProfile: profile };
  const box = { window, Date, Math: Object.assign(Object.create(Math), { random: () => random }) };
  vm.runInNewContext(source, box);
  const d = window.MeterData, samples = [];
  d.start("sim");
  for (let i = 0, last = "{}"; i < seconds * 100; i++) {
    d.tick(0.01);
    const now = JSON.stringify(d.target);
    if (now !== last) samples.push(JSON.parse(now));
    last = now;
  }
  return samples;
}

// The gear the Meters app would derive (app.js derivedGear): the closest one within 12 % of rpm per km/h.
function gearOf(sample, car) {
  let best = 0, err = 0.12;
  car.ratios.forEach((ratio, k) => {
    const e = Math.abs(sample.rpm / sample.speed / (ratio * car.finalDrive * 60 / (car.circumference * 3.6)) - 1);
    if (e < err) { err = e; best = k + 1; }
  });
  return best;
}
// Pulling in gear: the only part of the lap where rpm follows the speed closely enough to tell the gear.
const pulling = (s) => !s.clutch && s.throttle === 100 && s.speed > 25 && s.rpm > 1200;
const peak = (samples, key) => Math.max(...samples.map((s) => s[key]));
const laps = (samples) => samples.filter((s, i) => s.brake && !samples[i - 1].brake).length;

const ND1 = { ratios: [5.087, 2.991, 2.035, 1.594, 1.286, 1.0], finalDrive: 2.866, circumference: 1.89 };
const AUTO = { ratios: [3.538, 2.06, 1.404, 1.0, 0.713, 0.582], finalDrive: 4.1, circumference: 1.89 };
const THREE = { ratios: [3.2, 1.8, 1.0], finalDrive: 3.9, circumference: 2.0 };
const LOW_REVS = { amber: 4000, red: 4500, shift: 4800, limit: 5000, max: 6000 };

test("without a car profile the simulator drives the ND1 1.5 as before", () => {
  const stock = drive(undefined);
  // Figures of the simulator before it read the car profile.
  assert.equal(stock.length, 2727);
  assert.ok(Math.abs(stock[99].speed - 119.966325) < 1e-5, `speed ${stock[99].speed}`);
  assert.ok(Math.abs(stock[99].rpm - 6145.668804) < 1e-5, `rpm ${stock[99].rpm}`);
  assert.equal(stock[99].gear, 3);
  assert.ok(Math.abs(peak(stock, "rpm") - 7354.817782) < 1e-5);
  assert.ok(Math.abs(peak(stock, "speed") - 156.708843) < 1e-5);
  assert.equal(peak(stock, "gear"), 4);
  for (const s of stock.filter(pulling)) assert.equal(gearOf(s, ND1), s.gear);
});

test("a profile without complete, sane gearing or rev limits keeps the ND1 1.5 values", () => {
  const stock = JSON.stringify(drive(undefined));
  const partial = [
    null,
    "auto",
    {},
    { ratios: AUTO.ratios, finalDrive: 4.1 },                              // no circumference
    { ratios: [3.5, 0, 1.4], finalDrive: 4.1, circumference: 1.89 },       // a gear without a ratio
    { ratios: [], finalDrive: 4.1, circumference: 1.89 },
    { ratios: AUTO.ratios, finalDrive: "4.1", circumference: 1.89 },
    { ratios: "3.5,2.0", finalDrive: 4.1, circumference: 1.89 },           // not a list: must not throw either
    { ratios: { length: 2, 0: 3.5, 1: 2.0 }, finalDrive: 4.1, circumference: 1.89 },
    { rpm: { amber: 7000, red: 6000, shift: 7200, limit: 7500, max: 8000 } },   // out of order
    { rpm: { amber: 4000, red: 4500, shift: 4800, limit: 5000 } },         // no max
  ];
  for (const profile of partial) assert.equal(JSON.stringify(drive(profile)), stock, JSON.stringify(profile));
});

test("the simulator drives with the gearing of the car profile", () => {
  for (const car of [AUTO, THREE]) {
    const samples = drive(car), inGear = samples.filter(pulling);
    assert.ok(inGear.length > 500, "enough samples in gear");
    for (const s of inGear) assert.equal(gearOf(s, car), s.gear, `${s.speed} km/h at ${s.rpm} rpm`);
    assert.ok(laps(samples) > 3, "it keeps lapping");
  }
});

test("a car with fewer gears never gets a gear it does not have", () => {
  for (const ratios of [[3.2, 1.8, 1.0], [2.5, 1.0], [1.0]]) {
    const car = { ratios, finalDrive: 3.9, circumference: 2.0 }, samples = drive(car);
    assert.equal(peak(samples, "gear"), Math.min(4, ratios.length));
    assert.ok(samples.every((s) => s.gear >= 1 && isFinite(s.rpm) && isFinite(s.speed) && isFinite(s.gLong)));
    assert.ok(laps(samples) > 3, "it keeps lapping");
  }
});

test("the gears beyond the fourth of a ten-speed stay unused, as on the ND1", () => {
  const car = { ratios: [4.7, 2.99, 2.15, 1.77, 1.52, 1.28, 1.0, 0.85, 0.69, 0.64], finalDrive: 3.55, circumference: 2.2 };
  const samples = drive(car);
  assert.equal(peak(samples, "gear"), 4);
  for (const s of samples.filter(pulling)) assert.equal(gearOf(s, car), s.gear);
});

test("the simulator shifts between the shift point and the limiter of the car profile", () => {
  const samples = drive({ ...ND1, rpm: LOW_REVS });
  assert.ok(peak(samples, "rpm") > LOW_REVS.shift, `peak ${peak(samples, "rpm")}`);
  assert.ok(peak(samples, "rpm") < LOW_REVS.limit, `peak ${peak(samples, "rpm")}`);
  assert.equal(peak(samples, "gear"), 4);
  // The rev limits alone are enough: the gearing stays the ND1's.
  assert.equal(JSON.stringify(drive({ rpm: LOW_REVS })), JSON.stringify(samples));
  // And the ND1's own limits, given as a profile, change nothing.
  const nd1 = { amber: 6500, red: 7000, shift: 7200, limit: 7500, max: 8000 };
  assert.equal(JSON.stringify(drive({ rpm: nd1 })), JSON.stringify(drive(undefined)));
});

test("the shift point stays under the limiter when the profile puts them together", () => {
  const rpm = { amber: 6000, red: 6500, shift: 7000, limit: 7000, max: 8000 };
  const samples = drive({ rpm }, 300, 0.999);   // the rpm noise at its highest
  assert.ok(peak(samples, "rpm") < rpm.limit, `peak ${peak(samples, "rpm")}`);
  assert.ok(peak(samples, "rpm") > rpm.limit - 200, `peak ${peak(samples, "rpm")}`);
});

test("a gear too tall to reach its shift point pulls away, then ends the run", () => {
  // 6300 rpm in this single gear is 300 km/h: the simulated engine runs out of pull long before. It starts weak
  // (about 0.5 m/s² at standstill), so it must still pull away instead of braking at once.
  for (const finalDrive of [2.5, 2.0]) {
    const samples = drive({ ratios: [1.0], finalDrive, circumference: 2.0 }, 600);
    assert.ok(peak(samples, "speed") > 100, `peak ${peak(samples, "speed")} km/h`);
    assert.ok(samples.filter((s) => s.throttle === 100).length > samples.length / 2, "mostly at full throttle");
    assert.ok(laps(samples) > 3, `${laps(samples)} laps`);
    assert.ok(peak(samples, "rpm") < 6300);
  }
});

test("a gear that runs out of pull moves up only into a gear that pulls harder", () => {
  // A tall 3rd: it ends on drag at about 135 km/h, where 4th pulls even less, so the odd laps brake from 3rd.
  const car = { ratios: [3.5, 2.2, 0.9, 0.6], finalDrive: 2.9, circumference: 1.95 }, samples = drive(car);
  assert.equal(peak(samples, "gear"), 3);
  assert.ok(laps(samples) > 3, `${laps(samples)} laps`);
});

test("app.js reads the car profile through the same check as the simulator", () => {
  const app = readFileSync(new URL("../../js/app.js", import.meta.url), "utf8");
  assert.match(app, /D\.carProfile\(W\.MeterCarProfile\)/);
  assert.doesNotMatch(app, /function carProfile\(/);
});

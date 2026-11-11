import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../../designer/v3/model.mjs";
import { CommandStore } from "../../designer/v3/commands.mjs";
import { PRESETS, MARKETS, MARKET_UNITS } from "../../designer/v3/presets.mjs";
import {
  applyPreset,
  circumferenceFor,
  resolveChoices,
  findPreset,
  choicesFromVehicle,
  markEdited,
  presetValues,
  warningRpm,
  MARGINS,
  SPEC_FIELDS,
} from "../../designer/v3/car-setup.mjs";

test("circumference follows the tyre size and matches the legacy 1.89 m for 195/50R16", () => {
  assert.equal(circumferenceFor("195/50R16"), 1.889);
  assert.ok(Math.abs(circumferenceFor("205/45R17") - 1.935) < 0.002);
  assert.equal(circumferenceFor("bad"), null);
});

test("presets are well formed and their sourced fields name a source", () => {
  const ids = new Set();
  for (const p of PRESETS) {
    assert.match(p.id, /^[a-z0-9-]{1,40}$/);
    assert.ok(!ids.has(p.id), "duplicate " + p.id);
    ids.add(p.id);
    assert.ok(["ND1", "ND2"].includes(p.generation));
    assert.ok(["1.5", "2.0"].includes(p.engine));
    assert.ok(["manual", "automatic"].includes(p.transmission));
    assert.ok(p.markets.length && p.markets.every((m) => MARKETS.includes(m)));
    assert.ok(p.bodies.length && p.bodies.every((b) => ["roadster", "RF"].includes(b)));
    for (const t of p.tyres) assert.ok(circumferenceFor(t), p.id + " tyre " + t);
    assert.deepEqual(Object.keys(p.rpm), ["limit"], p.id + " carries only the limiter");
    assert.ok(Number.isInteger(p.rpm.limit) && p.rpm.limit > 5000, p.id + " limit");
    assert.equal(p.ratios.length, 6, p.id + " has six gears");
    const cited = new Set(p.sources.flatMap((s) => s.fields));
    for (const f of p.verified) {
      const root = f.split(".")[0];
      assert.ok(cited.has(f) || cited.has(root), `${p.id}: ${f} is verified but no source lists it`);
    }
    for (const s of p.sources) assert.match(s.url, /^https:\/\//, p.id);
  }
  for (const m of MARKETS) assert.ok(MARKET_UNITS[m], m);
});

test("each preset applied to a default project still validates", () => {
  for (const p of PRESETS)
    for (const market of p.markets)
      for (const body of p.bodies) {
        const project = M.defaults();
        applyPreset(project, p, { market, body, tyre: p.tyres[0] });
        M.validate(project);
        const v = project.vehicle;
        assert.equal(v.preset, p.id);
        assert.equal(v.market, market);
        assert.equal(v.body, body);
        assert.equal(v.tyre, p.tyres[0] ?? null);
        if (p.tyres[0]) assert.equal(v.circumference, circumferenceFor(p.tyres[0]));
        assert.deepEqual(v.units, MARKET_UNITS[market]);
        for (const f of ["cda", "crr", "eff"]) assert.ok(v.assumed.includes(f));
        const values = presetValues(p, { body, tyre: p.tyres[0] });
        for (const f of SPEC_FIELDS)
          assert.equal(v.assumed.includes(f), !values[f].sourced, `${p.id} ${f}`);
      }
});

test("dashboard warnings come before the limiter so there is time to react", () => {
  assert.deepEqual(warningRpm(7500), { max: 8000, amber: 6500, red: 7000, shift: 7200, limit: 7500 });
  assert.deepEqual(warningRpm(6800, 0), { max: 8000, amber: 6300, red: 6800, shift: 6800, limit: 6800 });
  for (const limit of [6800, 7500])
    for (const m of MARGINS) {
      const r = warningRpm(limit, m);
      assert.ok(0 < r.amber && r.amber <= r.red && r.red <= r.shift && r.shift <= r.limit && r.limit <= r.max && r.max <= 15000);
      assert.equal(r.limit - r.red, m);
    }
  const project = M.defaults(),
    p = PRESETS.find((x) => x.rpm.limit === 7500);
  applyPreset(project, p, { market: p.markets[0], margin: 750 });
  assert.deepEqual(project.vehicle.rpm, warningRpm(7500, 750));
  assert.equal(project.vehicle.assumed.includes("rpm.red"), false, "warnings are a choice, not an assumption");
  assert.equal(choicesFromVehicle(project.vehicle).margin, 750);
  assert.equal(choicesFromVehicle(M.defaults().vehicle).margin, 500, "legacy profile: red 7000, limit 7500");
  markEdited(project.vehicle, "rpm.red");
  assert.doesNotMatch(project.vehicle.provenance, /edited by hand/);
});

test("choices only offer what exists for the region", () => {
  for (const market of MARKETS) {
    const { options } = resolveChoices({ market });
    for (const g of options.generation)
      assert.ok(PRESETS.some((p) => p.generation === g && p.markets.includes(market)));
  }
  const { choices, preset } = resolveChoices({ market: "EU", generation: "nope" });
  assert.ok(preset, "falls back to an existing preset");
  assert.equal(findPreset(choices), preset);
});

test("applying a preset converts custom scales and undoes in one step", () => {
  const us = PRESETS.find((p) => p.markets.includes("US"));
  assert.ok(us, "a US preset exists");
  const c = new CommandStore(M.defaults());
  const w = c.project.themes[0].pages[0].widgets[0];
  M.bind(w, "speed");
  w.scale = { mode: "custom", unit: "km/h", min: 0, max: 200 };
  const before = M.clone(c.project.vehicle);
  c.command("Car setup", () => applyPreset(c.project, us, { market: "US" }));
  const after = c.project.themes[0].pages[0].widgets[0];
  assert.equal(c.project.vehicle.units.speed, "mph");
  assert.equal(after.scale.unit, "mph");
  assert.ok(Math.abs(after.scale.max - 124.27) < 0.05);
  c.undo();
  assert.deepEqual(c.project.vehicle, before);
  assert.equal(c.project.themes[0].pages[0].widgets[0].scale.unit, "km/h");
});

test("a hand edit of a preset value marks it assumed; the default profile maps back to choices", () => {
  const project = M.defaults();
  const p = PRESETS[0];
  applyPreset(project, p, { market: p.markets[0] });
  project.vehicle.assumed = project.vehicle.assumed.filter((f) => f !== "finalDrive");
  markEdited(project.vehicle, "finalDrive");
  markEdited(project.vehicle, "ratios.2");
  assert.ok(project.vehicle.assumed.includes("finalDrive"));
  assert.ok(project.vehicle.assumed.includes("ratios"));
  assert.match(project.vehicle.provenance, /edited by hand/);
  M.validate(project);
  const legacy = M.defaults().vehicle;
  markEdited(legacy, "finalDrive");
  assert.equal(legacy.assumed, undefined, "no preset, nothing to mark");
  const choices = choicesFromVehicle(legacy);
  assert.equal(choices.market, "EU");
  assert.equal(choices.generation, "ND1");
});

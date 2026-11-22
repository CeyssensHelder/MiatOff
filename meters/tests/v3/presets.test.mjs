import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../../designer/v3/model.mjs";
import { CommandStore } from "../../designer/v3/commands.mjs";
import {
  PRESETS, MARKETS, MARKET_UNITS, VEHICLE_MODELS, VEHICLE_ENGINES, VEHICLE_BODIES,
} from "../../designer/v3/presets.mjs";
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
  marginOf,
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
    assert.ok(Object.values(VEHICLE_MODELS).flat().includes(p.generation));
    assert.ok(VEHICLE_ENGINES.includes(p.engine));
    assert.ok(["manual", "automatic"].includes(p.transmission));
    assert.ok(p.markets.length && p.markets.every((m) => MARKETS.includes(m)));
    assert.ok(p.bodies.length && p.bodies.every((b) => VEHICLE_BODIES.includes(b)));
    for (const t of p.tyres) assert.ok(circumferenceFor(t), p.id + " tyre " + t);
    assert.deepEqual(Object.keys(p.rpm), ["limit"], p.id + " carries only the limiter");
    assert.ok(Number.isInteger(p.rpm.limit) && p.rpm.limit > p.powerRpm, p.id + " limit");
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
        const reopened = JSON.parse(JSON.stringify(project));
        M.validate(reopened);
        assert.equal(resolveChoices(choicesFromVehicle(reopened.vehicle)).preset.id, p.id);
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

test("every model and market in the picker has a preset", () => {
  for (const [model, generations] of Object.entries(VEHICLE_MODELS)) {
    const { options } = resolveChoices({ model });
    assert.ok(options.market.length, model);
    for (const market of options.market) {
      const details = resolveChoices({ model, market });
      for (const generation of details.options.generation)
        assert.ok(generations.includes(generation) &&
          PRESETS.some((p) => p.generation === generation && p.markets.includes(market)));
    }
  }
  const { choices, preset } = resolveChoices({ market: "EU", generation: "nope" });
  assert.ok(preset, "falls back to an existing preset");
  assert.equal(findPreset(choices), preset);
});

test("market and model filter the configurations and an ambiguous drivetrain needs a choice", () => {
  const jp = resolveChoices({ market: "JP" });
  assert.deepEqual(jp.options.model, Object.keys(VEHICLE_MODELS));
  assert.deepEqual(jp.options.market, ["EU", "UK", "US", "JP"]);
  const euMazda3 = resolveChoices({ market: "EU", model: "Mazda3" }).preset;
  assert.equal(euMazda3.generation, "BM");
  assert.equal(euMazda3.finalDrive, 3.619);
  assert.deepEqual(resolveChoices({ model: "Mazda3" }).options.market, ["EU", "UK", "US"]);
  const fallback = resolveChoices({ model: "CX-5", market: "UK", units: MARKET_UNITS.UK });
  assert.deepEqual(fallback.options.market, ["EU", "US", "AU"]);
  assert.equal(fallback.choices.market, "EU");
  assert.deepEqual(fallback.choices.units, MARKET_UNITS.EU);
  assert.deepEqual(fallback.options.engine, ["2.0"]);
  assert.throws(() => applyPreset(M.defaults(), fallback.preset, { market: "UK" }), /not listed for UK/);
  const us = resolveChoices({ market: "US", model: "CX-5" });
  assert.deepEqual(us.options.engine, ["2.5"]);
  assert.deepEqual(us.options.drive, ["FWD", "AWD"]);
  assert.equal(us.preset, null);
  for (const [drive, finalDrive] of [["FWD", 4.325], ["AWD", 4.624]]) {
    const { preset } = resolveChoices({ ...us.choices, drive });
    assert.equal(preset.finalDrive, finalDrive);
    const project = M.defaults();
    applyPreset(project, preset, { market: "US" });
    assert.equal(project.vehicle.finalDrive, finalDrive);
    assert.equal(choicesFromVehicle(project.vehicle).drive, drive);
  }
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

test("outputs of one engine need an explicit version, like FWD or AWD", () => {
  const base = { model: "Mazda2", market: "EU", generation: "DJ", engine: "1.5", transmission: "manual" };
  let r = resolveChoices(base);
  assert.equal(r.preset, null, "no silent pick between 75, 90 and 115 PS");
  assert.deepEqual(r.options.version, [
    "mazda2-dj-2022-eu-g75-mt", "mazda2-dj-2022-eu-g90-mt", "mazda2-dj-2022-eu-g115-mt",
  ]);
  r = resolveChoices({ ...base, version: "mazda2-dj-2022-eu-g115-mt" });
  assert.equal(r.preset.ratedPower, 115);
  assert.deepEqual(r.options.tyre, ["185/60R16"]);
  r = resolveChoices({ ...base, transmission: "automatic" });
  assert.equal(r.preset.id, "mazda2-dj-2022-eu-g90-at");
  assert.deepEqual(r.options.version, []);
  r = resolveChoices({ model: "CX-3", market: "EU", generation: "DK", engine: "2.0", transmission: "manual" });
  assert.equal(r.preset, null, "drivetrain first");
  assert.deepEqual(r.options.version, []);
  r = resolveChoices({ model: "CX-3", market: "EU", generation: "DK", engine: "2.0", transmission: "manual", drive: "AWD" });
  assert.equal(r.preset.ratedPower, 150);
});

test("every family offers a European market", () => {
  for (const model of Object.keys(VEHICLE_MODELS)) {
    if (["CX-8", "CX-9"].includes(model)) continue; // not sold in Europe
    const markets = new Set(PRESETS.filter((p) => VEHICLE_MODELS[model].includes(p.generation)).flatMap((p) => p.markets));
    assert.ok(markets.has("EU"), model);
  }
});

test("the Fiat and Abarth 124 Spider share the 1.4 turbo and are told apart by version", () => {
  const eu = { model: "124 Spider", market: "EU", generation: "348", engine: "1.4T", transmission: "manual" };
  let r = resolveChoices(eu);
  assert.equal(r.preset, null);
  assert.deepEqual(r.options.version, ["fiat124-348-eu-mt", "abarth124-348-mt"]);
  r = resolveChoices({ ...eu, version: "abarth124-348-mt" });
  assert.equal(r.preset.ratedTorque, 250);
  assert.deepEqual(r.options.body, ["roadster"]);
  r = resolveChoices({ ...eu, market: "AU" });
  assert.equal(r.preset.id, "abarth124-348-mt", "only the Abarth was sold in Australia");
  r = resolveChoices({ ...eu, market: "US", version: "fiat124-348-us-mt" });
  assert.equal(r.preset.rpm.limit, 6250);
});

test("a custom margin is any 0-2000 rpm in steps of 50 and survives reopening", () => {
  assert.equal(marginOf(1210), 1200);
  assert.equal(marginOf("875"), 900);
  assert.equal(marginOf(5000), 2000);
  assert.equal(marginOf(-10), 0);
  assert.equal(marginOf(null), 500);
  assert.equal(marginOf("x"), 500);
  assert.equal(resolveChoices({ market: "EU", margin: 1200 }).choices.margin, 1200);
  const project = M.defaults(),
    p = PRESETS.find((x) => x.rpm.limit === 5000);
  applyPreset(project, p, { market: p.markets[0], margin: 2000 });
  const r = project.vehicle.rpm;
  assert.ok(1000 < r.amber && r.amber <= r.red && r.red <= r.shift && r.shift <= r.limit && r.limit <= r.max, JSON.stringify(r));
  assert.equal(choicesFromVehicle(project.vehicle).margin, 2000);
});

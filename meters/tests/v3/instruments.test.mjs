// SPDX-License-Identifier: GPL-3.0-or-later
// Newer instrument options: old documents keep their look, colour zones, starters and the simulator.
import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../../designer/v3/model.mjs";
import { Simulator } from "../../designer/v3/simulation.mjs";

const newer = ["valuePosition", "zones", "shiftLead", "colorRamp", "readout"];

test("documents saved before the newer options keep their original appearance", () => {
  const project = M.defaults();
  for (const w of project.themes[0].pages.flatMap((p) => p.widgets))
    for (const key of newer) delete w[key];
  const migrated = M.validate(M.migrate(project));
  for (const w of migrated.themes[0].pages.flatMap((p) => p.widgets)) {
    assert.equal(w.valuePosition, "below");
    assert.deepEqual(w.zones, { mode: "off", base: null, steps: [] });
    assert.equal(w.shiftLead, 0);
    assert.equal(w.colorRamp, false);
    assert.equal(w.readout, false);
  }
  // Values that are present survive migration unchanged.
  const current = M.defaults(),
    dial = current.themes[0].pages[0].widgets[0];
  dial.zones = { mode: "custom", base: "#3355ff", steps: [{ at: 5000, color: "#ff0000" }] };
  assert.deepEqual(M.migrate(current).themes[0].pages[0].widgets[0].zones, dial.zones);
});

test("new instruments use the newer options", () => {
  const w = M.widget("radial");
  assert.equal(w.valuePosition, "center");
  assert.equal(w.zones.mode, "auto");
  assert.equal(M.widget("shift").colorRamp, true);
  assert.equal(M.widget("shift").shiftLead, 1500);
  assert.equal(M.widget("gmeter").readout, true);
});

test("automatic colour zones follow the vehicle RPM and reading thresholds", () => {
  const v = M.vehicle(),
    style = { ...M.defaultStyle, warningColor: "#ff0000" },
    rpm = Object.assign(M.widget("radial"), { signal: "rpm" }),
    zone = M.zones(rpm, v, style);
  assert.deepEqual(zone.steps.map((s) => s.at), [v.rpm.amber, v.rpm.red]);
  assert.equal(M.zoneColor(zone, v.rpm.amber - 1), null);
  assert.equal(M.zoneColor(zone, v.rpm.amber), "#ffba55");
  assert.equal(M.zoneColor(zone, v.rpm.red + 10), "#ff0000");
  assert.equal(M.zoneColor(zone, null), null);
  const fuel = M.zones(Object.assign(M.widget("number"), { signal: "fuel" }), v, style);
  assert.equal(M.zoneColor(fuel, 5), "#ff0000", "low fuel is coloured");
  assert.equal(M.zoneColor(fuel, 50), null, "normal fuel uses the normal colour");
  const off = M.zones(Object.assign(M.widget("number"), { zones: { mode: "off", base: null, steps: [] } }), v, style);
  assert.deepEqual(off, { base: null, steps: [] });
});

test("custom colour zones are validated", () => {
  const bad = (zones) => {
    const p = M.defaults();
    p.themes[0].pages[0].widgets[0].zones = zones;
    assert.throws(() => M.validate(p), /Colour zones/);
  };
  bad({ mode: "custom", base: null, steps: [{ at: 10, color: "#ff0000" }, { at: 5, color: "#00ff00" }] });
  bad({ mode: "custom", base: "red", steps: [] });
  bad({ mode: "custom", base: null, steps: Array.from({ length: 5 }, (_, i) => ({ at: i, color: "#ffffff" })) });
  bad({ mode: "sometimes", base: null, steps: [] });
  const ok = M.defaults();
  ok.themes[0].pages[0].widgets[0].zones = {
    mode: "custom",
    base: "#3355ff",
    steps: [{ at: 4000, color: null }, { at: 6500, color: "#ff0000" }],
  };
  M.validate(ok);
});

test("every starter has its own valid layout without overlaps or undersized instruments", () => {
  const layouts = new Set();
  for (const name of M.names) {
    const p = M.defaults(),
      t = M.starter(name);
    p.themes = [t];
    p.initialTheme = t.id;
    M.validate(p);
    layouts.add(JSON.stringify(t.pages.map((pg) => pg.widgets.map((w) => [w.type, w.x, w.y, w.w, w.h]))));
    for (const pg of t.pages)
      pg.widgets.forEach((w, i) => {
        const [mw, mh] = M.registry[w.type].minSize;
        assert.ok(w.w >= mw && w.h >= mh, `${name} ${pg.name} ${w.type} is undersized`);
        for (const other of pg.widgets.slice(i + 1))
          assert.ok(!M.intersects(w, other), `${name} ${pg.name}: ${w.type} overlaps ${other.type}`);
      });
  }
  assert.equal(layouts.size, M.names.length, "each starter has a different layout");
  for (const font of M.fonts) assert.equal(typeof font, "string");
});

test("simulated acceleration keeps speed, RPM and gear consistent with the gearing", () => {
  const v = M.vehicle(),
    s = new Simulator();
  s.setScenario("acceleration");
  s.running = true;
  for (let i = 0; i < 40; i++) {
    s.step(0.25, v);
    const st = s.state,
      perKmh = (v.ratios[st.gear - 1] * v.finalDrive * 60) / (v.circumference * 3.6);
    assert.ok(Math.abs(st.rpm - st.speed * perKmh) < 1, `gear ${st.gear}: ${st.speed} km/h at ${st.rpm} rpm`);
    assert.ok(st.rpm <= v.rpm.shift + 1);
  }
});

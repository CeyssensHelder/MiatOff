import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../../designer/v3/model.mjs";
import { CommandStore } from "../../designer/v3/commands.mjs";
import { Simulator, formatTime } from "../../designer/v3/simulation.mjs";
import { moveGroup, pairs, preflight } from "../../designer/v3/layout.mjs";

test("preflight accepts touching edges and gaps, but detects positive overlap", () => {
  const project = M.defaults(),
    theme = project.themes[0],
    page = theme.pages[0];
  const a = Object.assign(M.widget(), { x: 24, y: 24, w: 240, h: 160 });
  const b = { ...M.widget(), w: 240, h: 160 };
  page.widgets = [a, b];
  const ctx = { save() {}, restore() {} };
  const check = () =>
    preflight(
      ctx,
      theme,
      page,
      { vehicle: project.vehicle },
      "night",
      () => {},
    );
  for (const [x, y] of [
    [264, 24],
    [24, 184],
    [264, 184],
    [265, 24],
  ]) {
    Object.assign(b, { x, y });
    assert.deepEqual(check(), [], `Valid adjacency at ${x}, ${y}`);
  }
  Object.assign(b, { x: 263.5, y: 24 });
  assert.deepEqual(
    check().map((issue) => issue.kind),
    ["overlap"],
  );
});
test("all six starter documents validate and round trip", () => {
  for (const name of M.names) {
    const s = M.defaults();
    s.themes = [M.starter(name)];
    s.initialTheme = s.themes[0].id;
    assert.deepEqual(M.validate(M.migrate(JSON.parse(JSON.stringify(s)))), s);
  }
});
test("transactions roll back project and selection, ignore no-ops and bound history", () => {
  const c = new CommandStore(M.defaults(), { selection: ["original"] });
  const before = M.clone(c.project);
  assert.throws(() =>
    c.command("invalid", () => {
      c.project.themes[0].name = "x";
      c.view.selection = [];
      c.project.vehicle.rpm.max = NaN;
    }),
  );
  assert.deepEqual(c.project, before);
  assert.deepEqual(c.view.selection, ["original"]);
  c.command("noop", () => {});
  assert.equal(c.undoStack.length, 0);
  for (let i = 0; i < 110; i++)
    c.command("name", () => (c.project.themes[0].name = "Theme " + i));
  assert.equal(c.undoStack.length, 100);
  c.begin();
  c.project.themes[0].name = "cancel";
  c.cancel();
  assert.equal(c.project.themes[0].name, "Theme 109");
  c.undo();
  assert.equal(c.project.themes[0].name, "Theme 108");
  c.redo();
  assert.equal(c.project.themes[0].name, "Theme 109");
});
test("signal defaults preserve explicit caption and geometry", () => {
  const w = M.widget("radial");
  w.labelMode = "custom";
  w.label = "My speed";
  w.x = 100;
  M.bind(w, "speed");
  assert.equal(w.label, "My speed");
  assert.equal(w.x, 100);
  assert.equal(M.range(w, M.vehicle()).max, 260);
  assert.equal(w.signal, "speed");
  for (const type of ["gmeter", "lap", "session", "power"])
    assert.equal(M.widget(type).signal, null);
});
test("unit conversion and reciprocal endpoints reject infinite scales transactionally", () => {
  assert.ok(Math.abs(M.toUnit(100, "speed", "mph") - 62.137) < 0.01);
  assert.equal(M.toUnit(null, "speed", "mph"), null);
  const c = new CommandStore(M.defaults());
  const w = c.project.themes[0].pages[0].widgets[0];
  M.bind(w, "consumption");
  w.scale = { mode: "custom", unit: "L/100km", min: 0, max: 20 };
  assert.throws(() =>
    c.command("units", () => M.setUnits(c.project, "consumption", "mpg UK")),
  );
  assert.equal(c.project.vehicle.units.consumption, "L/100km");
  assert.equal(c.project.themes[0].pages[0].widgets[0].scale.min, 0);
});
test("simulator is deterministic, pause freezes history and stats, missing samples are gaps", () => {
  const a = new Simulator(42),
    b = new Simulator(42),
    v = M.vehicle();
  for (let i = 0; i < 50; i++) assert.deepEqual(a.step(0.1, v), b.step(0.1, v));
  a.running = false;
  const old = M.clone(a.state);
  a.step(10, v);
  assert.deepEqual(a.state, old);
  a.running = true;
  a.setScenario("missing");
  const max = a.maxSpeed;
  a.step(0.2, v);
  assert.equal(a.maxSpeed, max);
  assert.equal(a.history.at(-1).speed, null);
  a.resetSession();
  assert.equal(a.deltaMs, null);
  assert.equal(a.maxRpm, 0);
  assert.equal(formatTime(60000), "1:00.0");
});
test("group clamping preserves offsets and pair exemptions only suppress selected collision", () => {
  const a = { id: "a", x: 20, y: 20, w: 100, h: 100 },
    b = { id: "b", x: 140, y: 20, w: 100, h: 100 };
  moveGroup([a, b], -100, 600);
  assert.equal(a.x, 0);
  assert.equal(b.x, 120);
  assert.equal(a.y, 380);
  const p = {
    widgets: [a, { ...b, x: 50 }],
    overlaps: [{ a: "a", b: "b", reason: "intentional" }],
  };
  assert.equal(pairs(p).length, 0);
});
test("ten minute deterministic soak bounds history", () => {
  const s = new Simulator(),
    v = M.vehicle();
  for (let i = 0; i < 6000; i++) s.step(0.1, v);
  assert.ok(s.history.length <= 1200);
  assert.ok(s.time > 599);
});
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { arrangePage } from "../../designer/v3/layout.mjs";
test("real legacy v2 starters migrate preserving layout, vehicle and explicit overrides", () => {
  const context = vm.createContext({ window: {}, console });
  for (const path of [
    "../../js/designer-runtime.js",
    "../../designer/model.js",
  ])
    vm.runInContext(
      readFileSync(new URL(path, import.meta.url), "utf8"),
      context,
    );
  for (const name of M.names) {
    const old = context.window.StudioModel.defaults();
    old.themes = [context.window.StudioModel.starter(name)];
    old.themes[0].pages[0].widgets[0].label = "My tachometer";
    old.themes[0].pages[0].widgets[0].color = "#123456";
    const raw = JSON.parse(JSON.stringify(old)),
      s = M.validate(M.migrate(raw));
    assert.deepEqual(raw.vehicle, s.vehicle);
    assert.deepEqual(
      s.themes[0].pages[0].widgets.map((w) => [w.x, w.y, w.w, w.h]),
      raw.themes[0].pages[0].widgets.map((w) => [w.x, w.y, w.w, w.h]),
    );
    assert.equal(s.themes[0].pages[0].widgets[0].label, "My tachometer");
    assert.equal(s.themes[0].pages[0].widgets[0].style.color, "#123456");
    assert.deepEqual(M.migrate(s), s);
    assert.equal(raw.version, 2);
  }
});
test("optional vehicle preset, tyre and assumed fields are validated and migrated unchanged", () => {
  const withVehicle = (patch) => {
    const s = M.defaults();
    Object.assign(s.vehicle, patch);
    return s;
  };
  M.validate(M.defaults()); // documents without the fields stay valid
  for (const patch of [
    {},
    { preset: null, tyre: null },
    { preset: "nd1-15-eu", tyre: "195/50R16", assumed: ["rpm.limit", "mass"] },
    { assumed: [] },
    { assumed: Array(30).fill("mass") },
  ])
    M.validate(withVehicle(patch));
  const kept = withVehicle({
    preset: "nd1-15-eu",
    tyre: "195/50R16",
    assumed: ["rpm.limit"],
  });
  kept.version = 2;
  const m = M.migrate(kept);
  assert.equal(m.vehicle.preset, "nd1-15-eu");
  assert.equal(m.vehicle.tyre, "195/50R16");
  assert.deepEqual(m.vehicle.assumed, ["rpm.limit"]);
  const bad = [
    [{ preset: 5 }, /Invalid vehicle preset/],
    [{ preset: "" }, /Invalid vehicle preset/],
    [{ preset: "Upper" }, /Invalid vehicle preset/],
    [{ preset: "a".repeat(41) }, /Invalid vehicle preset/],
    [{ tyre: 195 }, /Invalid tyre size/],
    [{ tyre: "195/50r16" }, /Invalid tyre size/],
    [{ tyre: "195/50R16\n" }, /Invalid tyre size/],
    [{ tyre: "19/50R16" }, /Invalid tyre size/],
    [{ assumed: "mass" }, /Invalid assumed fields/],
    [{ assumed: [5] }, /Invalid assumed fields/],
    [{ assumed: ["rpm_limit"] }, /Invalid assumed fields/],
    [{ assumed: ["a".repeat(41)] }, /Invalid assumed fields/],
    [{ assumed: Array(31).fill("mass") }, /Invalid assumed fields/],
  ];
  for (const [patch, message] of bad)
    assert.throws(() => M.validate(withVehicle(patch)), message);
});
test("future versions, invalid bindings, fractions, flags and references fail explicitly", () => {
  for (const change of [
    (s) => (s.version = 99),
    (s) => (s.themes[0].pages[0].widgets[0].signal = "arbitrary"),
    (s) => (s.themes[0].pages[0].widgets[0].segments = 1.5),
    (s) => (s.themes[0].pages[0].widgets[0].locked = 1),
    (s) =>
      s.themes[0].pages[0].groups.push({
        id: "g",
        name: "Bad",
        locked: false,
        widgetIds: ["missing"],
      }),
  ]) {
    const s = M.defaults();
    change(s);
    assert.throws(() => M.validate(s));
  }
});
test("arrangement preserves explicit overlap pairs and respects locked widgets", () => {
  const a = Object.assign(M.widget(), { x: 50, y: 50, w: 120, h: 100 }),
    b = Object.assign(M.widget(), { x: 60, y: 60, w: 120, h: 100 }),
    fixed = Object.assign(M.widget(), {
      x: 400,
      y: 200,
      w: 100,
      h: 100,
      locked: true,
    }),
    p = {
      widgets: [a, b, fixed],
      groups: [],
      overlaps: [{ a: a.id, b: b.id, reason: "Overlay" }],
    };
  const r = arrangePage(p, [a.id, b.id, fixed.id]);
  assert.equal(r.widgets[1].x - r.widgets[0].x, 10);
  assert.deepEqual(r.widgets[2], fixed);
  assert.deepEqual(p.widgets[0], a);
  assert.throws(() => arrangePage(p, [a.id], { gap: -1 }));
});
test("recording replay retains seeded phase and manual events", () => {
  const a = new Simulator(42),
    v = M.vehicle();
  a.step(15, v);
  a.startRecording();
  a.step(0.5, v);
  a.setManual("speed", 123);
  const expected = a.step(0.5, v).speed,
    r = a.stopRecording(),
    b = new Simulator();
  b.playRecording(r);
  assert.equal(b.step(1, v).speed, expected);
  assert.ok(Math.abs(b.state.rpm - a.state.rpm) < 0.001);
});
test("temperature typography and canonical conversion use actual degree symbols", () => {
  const v = M.vehicle();
  assert.equal(M.displayUnit("coolant", v), "\u00b0C");
  assert.equal(M.toUnit(0, "coolant", "\u00b0F"), 32);
  assert.equal(M.fromUnit(212, "coolant", "\u00b0F"), 100);
});
test("image assets are immutable through rollback and shared by undo snapshots", () => {
  const s = M.defaults();
  s.assets.a = { data: "data:image/png;base64,YQ==", width: 1, height: 1 };
  const c = new CommandStore(s);
  assert.throws(() =>
    c.command("Invalid image edit", () => (c.project.assets.a.data = "broken")),
  );
  assert.equal(c.project.assets.a.data, "data:image/png;base64,YQ==");
  c.command("Name", () => (c.project.themes[0].name = "Changed"));
  assert.equal(c.undoStack[0].project.assets.a, c.project.assets.a);
});
test("v1 migration preserves layout, colors, manual scales and vehicle", () => {
  const old = {
    version: 1,
    kind: "MetersSetup",
    vehicle: M.vehicle(),
    themes: [
      {
        version: 1,
        kind: "ThemeDocument",
        id: "v1-theme",
        name: "Legacy",
        author: "",
        pages: [
          {
            name: "Drive",
            widgets: [
              {
                type: "number",
                signal: "speed",
                x: 40,
                y: 80,
                w: 240,
                h: 160,
                min: 0,
                max: 260,
                size: 60,
                color: "#123456",
                font: "Arial",
                label: "My speed",
              },
            ],
          },
        ],
      },
    ],
    initialTheme: "v1-theme",
    initialPage: 0,
  };
  const s = M.validate(M.migrate(old)),
    w = s.themes[0].pages[0].widgets[0];
  assert.deepEqual([w.x, w.y, w.w, w.h], [40, 80, 240, 160]);
  assert.equal(w.style.textColor, "#123456");
  assert.deepEqual(w.scale, { mode: "custom", unit: "km/h", min: 0, max: 260 });
  assert.equal(s.themes[0].background.kind, "solid");
  assert.deepEqual(s.vehicle, old.vehicle);
  assert.equal(old.version, 1);
});
test("legacy reciprocal custom scales retain manual mode and sorted endpoints", () => {
  const old = M.defaults();
  old.version = 2;
  old.vehicle.units.consumption = "mpg UK";
  const w = old.themes[0].pages[0].widgets[0];
  w.signal = "consumption";
  w.autoScale = false;
  w.min = 5;
  w.max = 20;
  const s = M.validate(M.migrate(old)),
    scale = s.themes[0].pages[0].widgets[0].scale;
  assert.equal(scale.mode, "custom");
  assert.ok(scale.min < scale.max);
  w.min = 0;
  const fallback = M.validate(M.migrate(old)).themes[0].pages[0].widgets[0];
  assert.equal(fallback.scale.mode, "custom");
  assert.deepEqual([fallback.scale.min, fallback.scale.max], [0, 80]);
  assert.equal(fallback.legacyScaleSource.min, 0);
});
test("recordings preserve active lap, comparisons and peak statistics", () => {
  const v = M.vehicle(),
    a = new Simulator();
  a.step(15, v);
  a.startRecording();
  a.step(1, v);
  a.lap();
  a.step(1, v);
  const recording = a.stopRecording(),
    b = new Simulator();
  b.playRecording(recording);
  b.step(2, v);
  assert.equal(b.lastLapMs, a.lastLapMs);
  assert.equal(b.laps, a.laps);
  assert.ok(b.maxG >= recording.track.maxG);
  const invalid = {
    ...recording,
    track: { ...recording.track, history: [{ time: 0, rpm: NaN }] },
  };
  const time = b.time;
  assert.throws(() => b.playRecording(invalid));
  assert.equal(b.time, time);
});
test("undo memory accounts for unique retained image bytes and total commands", () => {
  const c = new CommandStore(M.defaults());
  for (let i = 0; i < 12; i++)
    c.command(
      "Image replacement",
      () =>
        (c.project.assets = {
          a: {
            data:
              "data:image/png;base64," +
              "A".repeat(900000) +
              String(i).padStart(4, "0"),
            width: 1,
            height: 1,
          },
        }),
    );
  assert.ok(c.historyBytes() <= 16 * 1024 * 1024);
  assert.ok(c.undoStack.length < 12);
  for (let i = 0; i < 4; i++) c.undo();
  assert.ok(c.undoStack.length + c.redoStack.length <= 100);
  assert.ok(c.historyBytes() <= 16 * 1024 * 1024);
});
test("migration retains legacy inherited text ink as well as accent color", () => {
  const old = M.defaults();
  old.version = 2;
  old.themes[0].style = {
    color: "#123456",
    font: "Arial",
    effect: "flat",
    intensity: 0.5,
  };
  const t = M.migrate(old).themes[0];
  assert.equal(t.style.color, "#123456");
  assert.equal(t.style.textColor, "#123456");
  assert.equal(t.style.captionColor, "#123456");
  assert.equal(t.dayStyle.textColor, "#101820");
});

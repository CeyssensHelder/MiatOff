// SPDX-License-Identifier: GPL-3.0-or-later
// A custom page that fails to draw must not stop the car's Meters app: app.js schedules the next frame only after
// drawing, so custom.js catches the error, shows a notice on that page and keeps the other pages working.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as M from "../../designer/v3/model.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));

function generatedPages() {
  const dir = mkdtempSync(join(tmpdir(), "miatoff-guard-")),
    projects = join(dir, "projects.json"),
    out = join(dir, "custom-pages.js");
  writeFileSync(projects, JSON.stringify([M.defaults()]));
  const r = spawnSync("python", [join(here, "custom_pages_tool.py"), projects, out, join(dir, "setups.json")], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return readFileSync(out, "utf8");
}

// A canvas stand-in that records text and can be told to fail on arcs.
function canvas(log, failArcs) {
  const ctx = new Proxy(
    {},
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === "measureText") return (s) => ({ width: String(s).length * 10 });
        if (key === "arc" && failArcs.on) return () => { throw Error("arc failed"); };
        if (key === "fillText") return (s) => log.push(String(s));
        if (["createLinearGradient", "createRadialGradient"].includes(key)) return () => ({ addColorStop() {} });
        if (key === "getImageData") return () => ({ data: [] });
        return () => {};
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    },
  );
  return { getContext: () => ctx, width: 800, height: 480, ctx };
}

test("a page that throws while drawing shows a notice and does not throw into the app", () => {
  const log = [],
    failArcs = { on: false },
    window = {},
    document = { createElement: () => canvas([], { on: false }) };
  const context = vm.createContext({ window, document, Image: function () {} });
  vm.runInContext(generatedPages(), context);
  vm.runInContext(readFileSync(new URL("../../js/custom.js", import.meta.url), "utf8"), context);
  const api = {
    v: { speed: 80, rpm: 3000, gLat: 0.1, gLong: 0 },
    felt: true,
    dyno: { live: {} },
    sess: { start: 1, laps: 0, maxSpeed: 0, maxRpm: 0, lap() {}, stop() { return false; } },
    gear: () => 3,
    fmtLap: () => "1:00.0",
    fmtDelta: () => "+0.1",
  };
  const pages = window.MeterSets.custom(api);
  assert.ok(pages.length >= 2, "the default project gives two pages");
  const c = canvas(log, failArcs).ctx;
  failArcs.on = true; // every dial and G-meter arc now throws
  assert.doesNotThrow(() => pages[0].drawStatic(c));
  assert.doesNotThrow(() => pages[0].draw(c, Date.now()));
  assert.ok(log.includes("This custom page could not be drawn."), "the broken page says so");
  assert.equal(pages[0].failed, true);
  assert.doesNotThrow(() => pages.tick(Date.now()));
  // The other page is unaffected once arcs work again.
  failArcs.on = false;
  log.length = 0;
  assert.doesNotThrow(() => pages[1].draw(c, Date.now()));
  assert.equal(pages[1].failed, undefined);
  assert.ok(!log.includes("This custom page could not be drawn."));
});

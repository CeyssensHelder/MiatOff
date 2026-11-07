// Fixtures for the car-side tests: designer pages as the car receives them, and a static server for meters/.
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "../../designer/v3/model.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
export const metersRoot = resolve(here, "../..");
const repoRoot = resolve(here, "../../..");
export const starterNames = M.names;

// A 1x1 PNG, enough to exercise the image background path.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function project(themes, assets = {}, vehicle = undefined) {
  const base = M.defaults();
  return {
    ...base,
    themes,
    assets,
    vehicle: vehicle ?? base.vehicle,
    initialTheme: themes[0].id,
    initialPage: 0,
  };
}
export function starterProjects() {
  return M.names.map((name) => project([M.starter(name)]));
}

// One page per case: [name, type, variant, signal, widget changes, page changes].
function cases() {
  const out = [];
  const add = (name, type, variant, signal, change = {}, page = {}) =>
    out.push([name, type, variant, signal, change, page]);
  for (const v of ["plain", "framed", "inset"]) {
    add(`number ${v}`, "number", v, "speed", { size: 120, w: 368, h: 232 });
    add(`number ${v} gear`, "number", v, "gear", { size: 200, w: 232, h: 328 });
  }
  add("number sparkline", "number", "plain", "coolant", { sparkline: true, w: 368, h: 232, size: 80 });
  add("number mph", "number", "plain", "speed", { w: 300, h: 200 }, { units: { speed: "mph" } });
  add("number fahrenheit", "number", "framed", "outside", { decimals: 1, w: 300, h: 200 }, { units: { temperature: "F" } });
  add("number mpg", "number", "plain", "consumption", { w: 300, h: 200 }, { units: { consumption: "mpg UK" } });
  add("number fuel", "number", "plain", "fuel", { w: 300, h: 200 });
  for (const unit of ["label", "value", "separate", "hidden"])
    add(`number unit ${unit}`, "number", "plain", "speed", { unitPosition: unit, w: 300, h: 220, size: 90 });
  for (const pos of ["top", "bottom", "hidden"])
    add(`number caption ${pos}`, "number", "framed", "rpm", { labelPosition: pos, w: 300, h: 220, size: 90 });
  add("number custom caption", "number", "plain", "speed", { labelMode: "custom", label: "TOP SPEED", w: 300, h: 200 });
  for (const v of ["arc", "needle", "segmented"])
    for (const place of ["center", "below"])
      for (const labels of ["inside", "outside"]) {
        add(`radial ${v} ${place} ${labels} rpm`, "radial", v, "rpm", { valuePosition: place, tickLabels: labels, w: 360, h: 416, size: 64 });
        add(`radial ${v} ${place} ${labels} speed`, "radial", v, "speed", { valuePosition: place, tickLabels: labels, w: 300, h: 300, size: 56, ticks: 10 });
      }
  add("radial step 500", "radial", "arc", "rpm", { tickStep: 500, abbreviate: false, w: 360, h: 416 });
  add("radial step 20", "radial", "needle", "speed", { tickStep: 20, valuePosition: "below", w: 360, h: 416 });
  add("radial sweep 360", "radial", "arc", "coolant", { sweep: 360, w: 300, h: 300, thickness: 14 });
  add("radial sweep 180", "radial", "arc", "fuel", { sweep: 180, w: 300, h: 300 });
  add("radial thin", "radial", "needle", "throttle", { w: 200, h: 200, thickness: 3 });
  add("radial small", "radial", "arc", "outside", { w: 160, h: 140, thickness: 5 });
  add("radial zones auto coolant", "radial", "arc", "coolant", { w: 300, h: 300 });
  add("radial zones custom", "radial", "arc", "speed", { w: 300, h: 300, zones: { mode: "custom", base: "#3ddc84", steps: [{ at: 100, color: "#ffba55" }, { at: 180, color: "#ff657a" }] } });
  add("radial zones off", "radial", "arc", "rpm", { w: 300, h: 300, zones: { mode: "off", base: null, steps: [] } });
  add("radial custom scale", "radial", "arc", "speed", { w: 300, h: 300, scale: { mode: "custom", unit: "km/h", min: 0, max: 100 }, ticks: 5 });
  add("radial warning custom", "radial", "needle", "coolant", { w: 300, h: 300, warning: { mode: "custom", threshold: 80, direction: "above" } });
  add("radial mph", "radial", "arc", "speed", { w: 300, h: 300 }, { units: { speed: "mph" } });
  add("radial legacy", "radial", "arc", "rpm", { w: 360, h: 416, legacy: true });
  for (const v of ["continuous", "segmented", "dotted"]) {
    add(`bar ${v} h`, "bar", v, "rpm", { w: 600, h: 100 });
    add(`bar ${v} v`, "bar", v, "throttle", { w: 120, h: 300, orientation: "vertical", segments: 12 });
    add(`bar ${v} zones`, "bar", v, "speed", { w: 600, h: 100, zones: { mode: "custom", base: null, steps: [{ at: 120, color: "#ffba55" }] } });
  }
  add("bar legacy", "bar", "segmented", "rpm", { w: 600, h: 100, legacy: true });
  for (const v of ["circle", "octagon", "rounded"]) {
    add(`gmeter ${v}`, "gmeter", v, null, { w: 360, h: 416 });
    add(`gmeter ${v} bare`, "gmeter", v, null, { w: 360, h: 416, grid: false, trail: false, peaks: false, readout: false });
    add(`gmeter ${v} range 4`, "gmeter", v, null, { w: 300, h: 340, gRange: 4 });
    add(`gmeter ${v} small`, "gmeter", v, null, { w: 180, h: 200 });
  }
  add("gmeter legacy", "gmeter", "circle", null, { w: 360, h: 416, legacy: true });
  for (const v of ["led", "rectangles"]) {
    add(`shift ${v}`, "shift", v, null, { w: 752, h: 80, segments: 12, gap: 8 });
    add(`shift ${v} no ramp`, "shift", v, null, { w: 600, h: 90, colorRamp: false, shiftLead: 0 });
    add(`shift ${v} lead`, "shift", v, null, { w: 600, h: 90, shiftLead: 3000 });
  }
  add("shift legacy", "shift", "led", null, { w: 600, h: 90, legacy: true });
  for (const v of ["icon", "text"]) {
    add(`warning ${v}`, "warning", v, "coolant", { w: 300, h: 120, label: "HOT" });
    add(`warning ${v} fuel`, "warning", v, "fuel", { w: 300, h: 120, label: "LOW FUEL" });
  }
  for (const v of ["line", "area"]) {
    add(`history ${v}`, "history", v, "rpm", { w: 368, h: 240 });
    add(`history ${v} long`, "history", v, "speed", { w: 600, h: 300, window: 90, grid: false });
  }
  add("history lateral", "history", "line", "gLat", { w: 368, h: 240, window: 10 });
  add("power", "power", "curves", null, { w: 368, h: 300 });
  add("power small", "power", "curves", null, { w: 260, h: 200, powerMax: 150, torqueMax: 200 }, { units: { power: "kW", torque: "lb-ft" } });
  for (const v of ["full", "compact"]) add(`lap ${v}`, "lap", v, null, { w: 400, h: 240, size: 72 });
  add("session cards", "session", "cards", null, { w: 368, h: 192, size: 40 });
  add("session stacked", "session", "cards", null, { w: 220, h: 300, showRpm: false });
  add("label", "label", "text", null, { w: 300, h: 80, label: "DRIVE MODE", size: 40 });
  for (const v of ["rectangle", "rounded", "octagon"]) add(`shape ${v}`, "shape", v, null, { w: 200, h: 100 });
  for (const o of ["horizontal", "vertical", "diagonal", "custom"])
    add(`shape line ${o}`, "shape", "line", null, { w: 240, h: 120, orientation: o, thickness: 6, lineStart: "round", lineEnd: "arrow", startX: 0.1, startY: 0.8, endX: 0.9, endY: 0.2 });
  for (const effect of ["flat", "framed", "raised", "inset", "neon"])
    for (const font of M.fonts)
      add(`effect ${effect} ${font}`, "number", effect === "inset" ? "inset" : "plain", "speed", { w: 300, h: 200, size: 90 }, { style: { effect, font } });
  add("style big radius", "number", "plain", "rpm", { w: 300, h: 200, style: { radius: 40, borderWidth: 4, captionSize: 24, captionAlign: "center", align: "center" } });
  add("style right aligned", "number", "plain", "speed", { w: 300, h: 200, unitPosition: "separate", style: { align: "right", captionAlign: "right", unitAlign: "right" } });
  for (const kind of ["solid", "linear", "radial", "grid", "carbon", "noise"])
    add(`background ${kind}`, "number", "framed", "speed", { w: 300, h: 200, size: 90 }, { background: { kind, dim: 0.2 } });
  add("background image", "number", "framed", "speed", { w: 300, h: 200, size: 90 }, { background: { kind: "image", asset: "pixel", fit: "cover", opacity: 0.6, dim: 0.1 }, image: true });
  return out;
}

// One v3 project per case (a case may change the vehicle units or carry an image), ready for the Python split.
export function matrixProjects() {
  return cases().map(([name, type, variant, signal, raw, page]) => {
    const theme = M.starter("Street");
    const w = M.widget(type, variant);
    if (signal) M.bind(w, signal);
    const { legacy, style, ...change } = raw;
    Object.assign(w, { x: 20, y: 20 }, change);
    if (style) w.style = style;
    if (legacy)
      for (const k of ["valuePosition", "zones", "shiftLead", "colorRamp", "readout", "tickLabels", "tickStep"]) delete w[k];
    const p = { id: M.id("page"), name, widgets: [w], groups: [], overlaps: [] };
    if (page.style) p.style = { ...page.style };
    if (page.background) p.background = { ...M.background(), ...page.background };
    theme.pages = [p];
    const vehicle = M.vehicle();
    Object.assign(vehicle.units, page.units ?? {});
    return project([theme], page.image ? { pixel: { data: PNG, width: 1, height: 1 } } : {}, vehicle);
  });
}

// Run the Python builder step: projects in, the car's custom-pages.js and the validated setups out.
export async function carPages(projects) {
  const folder = await mkdtemp(join(tmpdir(), "miatoff-car-"));
  const input = join(folder, "projects.json"),
    script = join(folder, "custom-pages.js"),
    setups = join(folder, "setups.json");
  await writeFile(input, JSON.stringify(projects));
  const run = spawnSync(process.env.PYTHON || "python", [join(here, "custom_pages_tool.py"), input, script, setups], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  if (run.status !== 0) throw Error("custom_pages_tool failed: " + run.stderr + run.stdout);
  return { script: await readFile(script, "utf8"), setups: JSON.parse(await readFile(setups, "utf8")), folder };
}

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".json": "application/json",
  ".txt": "text/plain",
};
// A static server for meters/. `overrides` maps URL paths to file contents (the generated custom-pages.js).
export async function serveMeters(overrides = {}) {
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
      if (overrides[path] !== undefined) {
        response.writeHead(200, { "content-type": types[extname(path)] || "text/plain", "cache-control": "no-store" });
        return response.end(overrides[path]);
      }
      const file = resolve(metersRoot, "." + path);
      if (file !== metersRoot && !file.startsWith(metersRoot + sep)) throw Error("outside");
      const info = await stat(file);
      if (!info.isFile()) throw Error("not a file");
      response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done) => server.close(done)),
  };
}

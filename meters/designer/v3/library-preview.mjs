// SPDX-License-Identifier: GPL-3.0-or-later
import { validate, fonts } from "./model.mjs";
import { decodeAssets } from "./persistence.mjs";
import { prepareAssets, render } from "./renderer.mjs";
import { Simulator } from "./simulation.mjs";
const $ = (id) => document.getElementById(id),
  canvas = $("canvas"),
  sim = new Simulator();
let setup,
  theme,
  raf = 0,
  last = 0;
function draw(now) {
  raf = 0;
  if (!setup || document.hidden) return;
  sim.step(last ? Math.min(0.1, (now - last) / 1000) : 0, setup.vehicle, {
    force: !sim.state.vehicle,
  });
  last = now;
  const screen = canvas.parentElement;
  const scale = Math.min(
    Math.max(1, screen.clientWidth - 26) / 800,
    Math.max(1, screen.clientHeight - 26) / 480,
  );
  canvas.style.width = 800 * scale + "px";
  canvas.style.height = 480 * scale + "px";
  render(
    canvas.getContext("2d"),
    theme,
    theme.pages[Number($("preview-page").value)],
    setup.assets,
    sim.state,
    { mode: $("preview-mode").value },
  );
  if (sim.running) invalidate();
}
function invalidate() {
  if (!raf && !document.hidden) raf = requestAnimationFrame(draw);
}
try {
  const key = new URLSearchParams(location.search).get("theme");
  if (!key)
    throw Error("Choose Preview next to a custom theme in MiatOff builder.");
  const response = await fetch(
    "/api/builder/themes/" + encodeURIComponent(key),
    { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error || "This saved theme could not be loaded.");
  setup = validate(data);
  await decodeAssets(setup);
  await prepareAssets(setup.assets);
  await Promise.all(
    fonts.filter((font) => font !== "Arial").map((font) =>
      document.fonts.load(`18px "${font}"`),
    ),
  );
  await document.fonts.ready;
  theme = setup.themes[0];
  document.title = theme.name + " · MiatOff preview";
  $("preview-title").textContent = theme.name;
  theme.pages.forEach((page, i) =>
    $("preview-page").add(new Option(page.name, String(i))),
  );
  $("preview-page").value = String(setup.initialPage);
  $("preview-page").disabled = false;
  $("preview-play").disabled = false;
  $("preview-status").textContent =
    "Saved library copy. Simulation only; this view never edits your browser draft.";
  sim.running = false;
  $("preview-play").onclick = () => {
    sim.running = !sim.running;
    last = 0;
    $("preview-play").textContent = sim.running
      ? "Pause simulation"
      : "Play simulation";
    $("preview-state").textContent =
      "Simulated · " + (sim.running ? "Playing" : "Paused");
    invalidate();
  };
  $("preview-page").onchange = $("preview-mode").onchange = invalidate;
  $("preview-scenario").onchange = () => {
    sim.setScenario($("preview-scenario").value);
    sim.step(0, setup.vehicle, { force: true });
    invalidate();
  };
  new ResizeObserver(invalidate).observe(canvas.parentElement);
  document.addEventListener("visibilitychange", () => {
    last = 0;
    invalidate();
  });
  invalidate();
} catch (error) {
  $("preview-status").classList.add("error");
  $("preview-status").textContent =
    "Preview unavailable: " +
    error.message +
    " Re-send the theme from the editor or refresh the builder library.";
}

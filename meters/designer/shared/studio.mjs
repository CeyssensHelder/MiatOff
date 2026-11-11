// SPDX-License-Identifier: GPL-3.0-or-later
// One designer, two modes: Meters (this page) and the Home menu (a same-origin frame). The header is shared: the
// Meters | Home menu switch, and each mode's main actions in the same places.
const $ = (id) => document.getElementById(id),
  frame = $("home-studio"),
  tabs = [$("mode-meters"), $("mode-home")],
  homeActions = document.querySelector(".home-actions");
let meters, home, active, metersCaption;
function showError(text) {
  $("notice").hidden = false;
  $("status").textContent = text;
}
// Meters wires this too once it has loaded; Home mode may run without Meters.
$("dismiss-notice").addEventListener("click", () => {
  $("notice").hidden = true;
});
function setTabs(mode, busy = false) {
  for (const tab of tabs) {
    tab.setAttribute("aria-pressed", String(tab.dataset.mode === mode));
    tab.disabled = busy;
  }
}
// The Home designer's state, shown by the shared header.
function homeChrome(state) {
  $("home-undo").disabled = !state.undo;
  $("home-redo").disabled = !state.redo;
  $("home-try").textContent = state.trying ? "Back to design" : "Preview";
  $("home-try").setAttribute("aria-pressed", String(state.trying));
  $("home-save-status").textContent = state.saveStatus || "";
}
for (const [id, action] of [
  ["home-undo", "undo"],
  ["home-redo", "redo"],
  ["home-try", "try"],
  ["home-send", "send"],
  ["home-export", "export"],
])
  $(id).onclick = () => home?.act(action);
async function loadHome() {
  const url = new URL("../home/index.html", import.meta.url);
  url.search = location.search;
  await new Promise((resolve, reject) => {
    // An iframe reports no load errors, so a page that never arrives must time out.
    const timeout = setTimeout(
      () => reject(Error("Mazda Home did not load")),
      20000,
    );
    frame.onload = () => {
      clearTimeout(timeout);
      resolve();
    };
    frame.src = url.href;
  });
  const designer = frame.contentWindow.HomeDesigner;
  if (!designer) throw Error("Mazda Home did not start");
  await designer.ready;
  designer.onChrome(homeChrome);
  return designer;
}
// The Home frame fills the window below the header, whose height depends on the window width.
function placeFrame() {
  const top = Math.round(document.querySelector(".studio-header").getBoundingClientRect().bottom);
  frame.style.top = top + "px";
  frame.style.height = `calc(100dvh - ${top}px)`;
}
new ResizeObserver(placeFrame).observe(document.querySelector(".studio-header"));
function show(mode) {
  document.body.dataset.designerMode = mode;
  frame.hidden = mode !== "home";
  homeActions.hidden = mode !== "home";
  placeFrame();
}
async function switchMode(mode) {
  if (mode === active) return;
  setTabs(active ?? mode, true);
  const previous = active;
  try {
    if (active === "meters") {
      metersCaption = $("collection-caption").textContent;
      await meters.setDesignerActive(false);
    }
    if (active === "home") await home.setActive(false);
    if (mode === "meters") {
      meters ??= await import("../v3/app.mjs");
      show("meters");
      await meters.setDesignerActive(true);
    } else {
      home ??= await loadHome();
      show("home");
      await home.setActive(true);
    }
    active = mode;
    $("collection-caption").textContent =
      mode === "home"
        ? "Home screen · PC preview"
        : (metersCaption ?? $("collection-caption").textContent);
    document.title = document.querySelector(".brand strong").textContent =
      mode === "home" ? "MiatOff Home Designer" : "MiatOff Meters Designer";
    const url = new URL(location.href);
    url.searchParams.set("mode", mode);
    history.replaceState(null, "", url);
  } catch (e) {
    // Put the previous mode back on screen and running, so nothing is left paused behind the wrong tab.
    if (previous) {
      show(previous);
      try {
        if (previous === "meters") await meters.setDesignerActive(true);
        else await home.setActive(true);
      } catch {}
    }
    showError("Could not switch designer: " + e.message);
    setTabs(previous ?? "meters");
    // Opening straight into Home failed: fall back to Meters rather than an empty page.
    if (!previous && mode === "home") return switchMode("meters");
    return;
  }
  setTabs(active);
}
for (const tab of tabs) tab.onclick = () => switchMode(tab.dataset.mode);
// With the focus on the shared header (not in the Home frame), undo and redo still reach the Home menu.
addEventListener("keydown", (e) => {
  if (active !== "home" || !home || !(e.ctrlKey || e.metaKey)) return;
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === "z" || k === "y") {
    e.preventDefault();
    home.act(k === "y" || e.shiftKey ? "redo" : "undo");
  }
});
await switchMode(
  new URLSearchParams(location.search).get("mode") === "home"
    ? "home"
    : "meters",
);

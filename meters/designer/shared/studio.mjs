// SPDX-License-Identifier: GPL-3.0-or-later
const selector = document.getElementById("designer-mode"),
  frame = document.getElementById("home-studio");
let meters, home, active, metersCaption;
function showError(text) {
  document.getElementById("notice").hidden = false;
  document.getElementById("status").textContent = text;
}
// Meters wires this too once it has loaded; Home mode may run without Meters.
document
  .getElementById("dismiss-notice")
  .addEventListener("click", () => {
    document.getElementById("notice").hidden = true;
  });
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
  return designer;
}
function show(mode) {
  document.body.dataset.designerMode = mode;
  frame.hidden = mode !== "home";
}
async function switchMode(mode) {
  selector.disabled = true;
  const previous = active;
  try {
    if (active === "meters") {
      metersCaption = document.getElementById("collection-caption").textContent;
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
    selector.value = mode;
    document.getElementById("collection-caption").textContent =
      mode === "home"
        ? "Home screen · PC preview"
        : (metersCaption ??
          document.getElementById("collection-caption").textContent);
    document.title = document.querySelector(".brand strong").textContent =
      mode === "home" ? "MiatOff Home Designer" : "MiatOff Meters Designer";
    const url = new URL(location.href);
    url.searchParams.set("mode", mode);
    history.replaceState(null, "", url);
  } catch (e) {
    // Put the previous mode back on screen and running, so nothing is left paused behind a wrong selector.
    selector.value = previous ?? "meters";
    if (previous) {
      show(previous);
      try {
        if (previous === "meters") await meters.setDesignerActive(true);
        else await home.setActive(true);
      } catch {}
    }
    showError("Could not switch designer: " + e.message);
    selector.disabled = false;
    // Opening straight into Home failed: fall back to Meters rather than an empty page.
    if (!previous && mode === "home") return switchMode("meters");
  } finally {
    selector.disabled = false;
  }
}
selector.onchange = () => switchMode(selector.value);
await switchMode(
  new URLSearchParams(location.search).get("mode") === "home"
    ? "home"
    : "meters",
);

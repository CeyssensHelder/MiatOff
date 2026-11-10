// SPDX-License-Identifier: GPL-3.0-or-later
const selector = document.getElementById("designer-mode"),
  frame = document.getElementById("home-studio");
let meters, home, active, metersCaption;
async function switchMode(mode) {
  selector.disabled = true;
  try {
    if (active === "meters") {
      metersCaption = document.getElementById("collection-caption").textContent;
      await meters.setDesignerActive(false);
    }
    if (active === "home") await home.setActive(false);
    if (mode === "meters") {
      meters ??= await import("../v3/app.mjs");
      document.body.dataset.designerMode = "meters";
      frame.hidden = true;
      await meters.setDesignerActive(true);
    } else {
      if (!home) {
        const url = new URL("../home/index.html", import.meta.url);
        url.search = location.search;
        await new Promise((resolve, reject) => {
          frame.onload = resolve;
          frame.onerror = reject;
          frame.src = url.href;
        });
        home = frame.contentWindow.HomeDesigner;
        await home.ready;
      }
      document.body.dataset.designerMode = "home";
      frame.hidden = false;
      await home.setActive(true);
    }
    active = mode;
    selector.value = mode;
    document.getElementById("collection-caption").textContent =
      mode === "home"
        ? "Home screen · PC preview"
        : (metersCaption ??
          document.getElementById("collection-caption").textContent);
    document.querySelector(".brand strong").textContent =
      mode === "home" ? "Mazda Home Designer" : "Meters Designer";
    const url = new URL(location.href);
    url.searchParams.set("mode", mode);
    history.replaceState(null, "", url);
  } catch (e) {
    document.getElementById("notice").hidden = false;
    document.getElementById("status").textContent =
      "Could not switch designer: " + e.message;
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

// SPDX-License-Identifier: GPL-3.0-or-later
// PC preview of a Home menu as the car draws it: the car's own script (meters/js/miatoff-home.js) against a
// stand-in for Mazda's MainMenuCtrl with the same methods. None of Mazda's files are used.
const $ = (id) => document.getElementById(id);
const key = new URLSearchParams(location.search).get("menu") || "";
const NAMES = {
  app: "Applications",
  ent: "Entertainment",
  com: "Communication",
  nav: "Navigation",
  set: "Settings",
};
function fit() {
  $("screen").style.transform = `scale(${$("frame").clientWidth / 800})`;
}
addEventListener("resize", fit);
fit();
window.log = {
  // On the PC no list ever opens after a list route; that message is only meaningful in the car.
  error: (text) => {
    if (!/did not come/.test(text)) $("log").textContent = text;
  },
  debug() {},
  info() {},
};
window.MiatOffHomeCoins = false; // the PC has none of Mazda's coin pictures
window.MiatOffHomeFontBase = "/fonts/"; // the Meters fonts, served by the designer
// The screen is scaled to the window: touches in screen pixels, as the car reports them.
window.MiatOffHomePoint = (evt) => {
  const b = $("screen").getBoundingClientRect();
  return {
    pageX: ((evt.clientX - b.left) * 800) / b.width,
    pageY: ((evt.clientY - b.top) * 480) / b.height,
  };
};
window.framework = {
  registerCtrlLoaded() {},
  common: { beep() {}, stealFocus() {} },
  getCurrentApp: () => "system",
  getCurrCtxtId: () => "HomeScreen",
  getAppInstance: () => null,
};
// Stand-in for Mazda's control: same constructor order and methods. It only shows if the design is refused.
window.MainMenuCtrl = function (uiaId, parentDiv, controlId, properties) {
  this.uiaId = uiaId;
  this.controlId = controlId;
  this.properties = { appData: null, selectCallback: null, ...properties };
  this.createStructure();
  parentDiv.appendChild(this.divElt);
  this.init();
};
Object.assign(window.MainMenuCtrl.prototype, {
  createStructure() {
    this.divElt = document.createElement("div");
    this.divElt.style.cssText =
      "position:absolute;inset:0;display:grid;place-items:center;color:#9aa7b8;font-size:20px";
    this.divElt.textContent = "Mazda's own Home would show here.";
  },
  init() {},
  handleControllerEvent: () => "ignored",
  startTransitionFrom() {},
  endTransitionTo() {},
  getContextCapture: () => ({}),
  restoreContext() {},
  finishPartialActivity() {},
  cleanUp() {},
  setText() {},
  getRemoteUiButtonStatus() {},
});
function describe(ctrl, params) {
  const m = ctrl._mo,
    item = m && m.view[m.order[m.focus]].item;
  if (!item) return "Mazda's " + NAMES[params.icon] + " opens.";
  const r = item.route;
  return r.icon
    ? `${item.label}: Mazda's own ${NAMES[r.icon]} button route.`
    : `${item.label}: opens ${r.list}, then selects ${r.appName ? "MiatOff Meters" : r.events.join(" or ")} there, as a tap would. If that is not available, the list stays open.`;
}
async function start() {
  try {
    if (!/^[a-z0-9-]+$/.test(key)) throw Error("Open this preview from the MiatOff app.");
    const [designResponse, listResponse] = await Promise.all([
      fetch(`/api/builder/home/${key}/car`, { cache: "no-store" }),
      fetch("/api/builder/home", { cache: "no-store" }),
    ]);
    const design = await designResponse.json();
    if (!designResponse.ok) throw Error(design.error || "Menu not found");
    const menu = ((await listResponse.json()).menus || []).find((m) => m.id === key);
    if (menu) {
      $("title").textContent = menu.name + " · Home menu preview";
      document.title = menu.name + " · MiatOff";
    }
    window.MiatOffHomeDesign = design;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/js/miatoff-home.js";
      s.onload = resolve;
      s.onerror = () => reject(Error("The car script did not load"));
      document.head.append(s);
    });
    window.framework.registerCtrlLoaded("MainMenuCtrl");
    const ctrl = new window.MainMenuCtrl("system", $("home"), "MainMenuCtrl1", {
      selectCallback: (c, appData, params) => ($("route").textContent = describe(c, params)),
    });
    ctrl.handleControllerEvent("acceptFocusInit");
    window.previewControl = ctrl;
    addEventListener("keydown", (e) => {
      const events = {
        ArrowLeft: ["ccw"],
        ArrowUp: ["ccw"],
        ArrowRight: ["cw"],
        ArrowDown: ["cw"],
        Enter: ["selectStart", "select"],
        " ": ["selectStart", "select"],
      }[e.key];
      if (!events) return;
      e.preventDefault();
      for (const id of events) ctrl.handleControllerEvent(id);
    });
  } catch (e) {
    $("log").textContent = e.message;
  }
}
start();

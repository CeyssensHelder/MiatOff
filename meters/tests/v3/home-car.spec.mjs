// The car's Home menu script (meters/js/miatoff-home.js) in Chromium, against a fake HMI with the shapes of
// Mazda Connect 74.00.324A (systemApp.js and MainMenuCtrl.js as read in a private dump; nothing of them is in
// this repository). When a dump is present, the same checks also run against the real MainMenuCtrl.js.
import { test, expect } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SERVER } from "./config.mjs";

const HARNESS = SERVER + "/designer/home/test-harness.html";
const ROOT = new URL("../../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
// This checkout, and the main checkout when this is a worktree below .worktrees/ (the dumps stay there).
const ROOTS = [ROOT, join(ROOT, "..", "..")];
function realControl() {
  for (const base of ROOTS.flatMap((root) => ["dumps/eu-74.00.324", "dumps", "miatoff-dumps"].map((d) => join(root, d)))) {
    const dir = base;
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const file = join(dir, name, "static/files/jci/gui/apps/system/controls/MainMenu/js/MainMenuCtrl.js");
      if (existsSync(file)) return readFileSync(file, "utf8");
    }
  }
  return null;
}

// A fake system app: Home's select callback sends Mazda's events; a list opens shortly after, with FM and
// Bluetooth available and DAB not, and a list item selected through the list callback sends its own event.
const FAKE_HMI = `
window.sent = [];
window.log = { error: (t) => (window.lastError = t), debug() {}, info() {}, addSrcFile() {} };
const lists = {
  Entertainment: [
    { appData: { appName: "fmradio", mmuiEvent: "SelectRadioFM" }, disabled: false },
    { appData: { appName: "dab", mmuiEvent: "SelectDAB" }, disabled: true },
    { appData: { appName: "btaudio", mmuiEvent: "SelectBTAudio" }, disabled: false },
    { appData: { appName: "androidauto", mmuiEvent: "SelectAndroidAuto" }, disabled: false },
  ],
  Applications: [{ appData: { appName: "miatoff", mmuiEvent: "Selectmiatoff" }, disabled: false }],
};
const sys = { _currentContextTemplate: null, _contextTable: {} };
for (const name of Object.keys(lists))
  sys._contextTable[name] = { controlProperties: { List2Ctrl: { selectCallback(listCtrl, appData) {
    window.framework.sendEventToMmui("system", appData.mmuiEvent);
  } } } };
const contexts = { SelectEntertainment: "Entertainment", SelectApplications: "Applications" };
window.framework = {
  ctxt: "HomeScreen",
  registerCtrlLoaded(name) { (window.registered = window.registered || []).push(name); },
  common: { beep() {}, stealFocus() {} },
  localize: { getLocStr: (app, id) => id },
  getCurrentApp: () => "system",
  getCurrCtxtId() { return this.ctxt; },
  getAppInstance: (id) => (id === "system" ? sys : null),
  sendEventToMmui(uiaId, eventId) {
    window.sent.push(eventId);
    const next = contexts[eventId];
    if (next) setTimeout(() => {
      window.framework.ctxt = next;
      sys._currentContextTemplate = { list2Ctrl: { dataList: { items: lists[next] } } };
    }, 150);
  },
};
window.homeSelect = (ctrl, appData, params) => {
  window.framework.sendEventToMmui("system", { app: "SelectApplications", ent: "SelectEntertainment",
    com: "SelectCommunication", nav: "SelectNavigation", set: "SelectSettings" }[params.icon]);
};
`;
// A stand-in with the control's constructor order and methods (not Mazda's code).
const STAND_IN = `
window.MainMenuCtrl = function (uiaId, parentDiv, controlId, properties) {
  this.uiaId = uiaId; this.controlId = controlId; this.properties = properties;
  this.createStructure(); parentDiv.appendChild(this.divElt); this.init();
};
["init", "handleControllerEvent", "startTransitionFrom", "endTransitionTo", "getContextCapture", "restoreContext",
 "finishPartialActivity", "cleanUp", "setText", "getRemoteUiButtonStatus"].forEach((name) => {
  window.MainMenuCtrl.prototype[name] = function () { return name === "handleControllerEvent" ? "ignored" : undefined; };
});
window.MainMenuCtrl.prototype.createStructure = function () {
  this.divElt = document.createElement("div"); this.divElt.id = "stock-home"; this.divElt.textContent = "stock";
};
framework.registerCtrlLoaded("MainMenuCtrl");
`;

async function open(page, { menu = "starter-cyber", design = null, control = STAND_IN } = {}) {
  await page.route(HARNESS, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body style="margin:0"><div id="status" style="height:64px"></div>
        <div id="parent" style="position:absolute;top:64px;left:0;width:800px;height:416px"></div></body></html>`,
    }),
  );
  await page.goto(HARNESS);
  await page.setViewportSize({ width: 800, height: 480 });
  await page.addScriptTag({ content: FAKE_HMI });
  const car = design ?? (await (await page.request.get(`${SERVER}/api/builder/home/${menu}/car`)).json());
  await page.evaluate((d) => (window.MiatOffHomeDesign = d), car);
  await page.addScriptTag({ url: "/js/miatoff-home.js" });
  await page.addScriptTag({ content: control });
  await page.evaluate(() => {
    window.ctrl = new window.MainMenuCtrl("system", document.getElementById("parent"), "MainMenuCtrl1", {
      selectCallback: window.homeSelect,
    });
    window.ctrl.handleControllerEvent("acceptFocusInit");
  });
  return car;
}
const knob = (page, ...events) =>
  page.evaluate((list) => list.map((e) => window.ctrl.handleControllerEvent(e)), events);
const press = (page) => knob(page, "selectStart", "select");

for (const [label, control] of [
  ["stand-in control", () => STAND_IN],
  ["Mazda's MainMenuCtrl.js from the dump", realControl],
]) {
  test.describe(label, () => {
    test.skip(!control(), "no dump with MainMenuCtrl.js on this computer");

    test("draws the design, follows the Commander order and routes every kind of destination", async ({ page }) => {
      const car = await open(page, { control: control() });
      await expect(page.locator(".MiatOffHome")).toHaveCount(1);
      for (const item of car.items) await expect(page.locator(".MiatOffHome")).toContainText(item.label);
      // Order: FM, DAB, Bluetooth, Entertainment, Android Auto, CarPlay, Settings.
      expect(await knob(page, "cw", "cw")).toEqual(["consumed", "consumed"]);
      await press(page);
      await expect.poll(() => page.evaluate(() => window.sent)).toEqual(["SelectEntertainment", "SelectBTAudio"]);
      // DAB is not available: the list stays open, nothing else is sent.
      await page.evaluate(() => {
        window.sent = [];
        window.framework.ctxt = "HomeScreen";
      });
      await page.waitForTimeout(1100); // input is blocked for a second after a choice, as in Mazda's control
      await knob(page, "ccw");
      await press(page);
      await page.waitForTimeout(600);
      expect(await page.evaluate(() => window.sent)).toEqual(["SelectEntertainment"]);
      // A factory button: Mazda's own route only.
      await page.evaluate(() => (window.sent = []));
      await page.waitForTimeout(1100);
      await knob(page, "cw", "cw", "cw", "cw", "cw", "cw", "cw");
      await press(page);
      expect(await page.evaluate(() => window.sent)).toEqual(["SelectSettings"]);
      await page.waitForTimeout(1100);
      expect(await knob(page, "upStart")).toEqual(["giveFocusUp"]);
      expect(await knob(page, "somethingElse")).toEqual(["ignored"]);
    });

    test("a touch selects the item under the finger; Meters goes through Applications", async ({ page }) => {
      const car = await open(page, { menu: "starter-track", control: control() });
      const meters = car.items.find((w) => w.opens === "meters");
      await page.mouse.click(meters.x + meters.w / 2, meters.y + meters.h / 2);
      await expect.poll(() => page.evaluate(() => window.sent)).toEqual(["SelectApplications", "Selectmiatoff"]);
    });

    test("a design that is not valid leaves Mazda's Home", async ({ page }) => {
      await open(page, { design: { version: 2 }, control: control() });
      await expect(page.locator(".MiatOffHome")).toHaveCount(0);
      expect(await page.evaluate(() => !!window.MainMenuCtrl.prototype.miatoffHome)).toBe(false);
    });
  });
}

test("an error while drawing falls back to the stock control", async ({ page }) => {
  await page.route(HARNESS, (route) => route.fulfill({ contentType: "text/html", body: "<body><div id=parent></div></body>" }));
  await page.goto(HARNESS);
  await page.addScriptTag({ content: FAKE_HMI });
  const car = await (await page.request.get(`${SERVER}/api/builder/home/starter-classic/car`)).json();
  await page.evaluate((d) => (window.MiatOffHomeDesign = d), car);
  await page.addScriptTag({ url: "/js/miatoff-home.js" });
  await page.addScriptTag({ content: STAND_IN });
  const result = await page.evaluate(() => {
    const original = document.createTextNode;
    document.createTextNode = () => {
      throw Error("broken");
    };
    try {
      window.ctrl = new window.MainMenuCtrl("system", document.getElementById("parent"), "c", {
        selectCallback: window.homeSelect,
      });
    } finally {
      document.createTextNode = original;
    }
    return [document.getElementById("stock-home")?.textContent, window.ctrl.handleControllerEvent("cw"), window.lastError];
  });
  expect(result[0]).toBe("stock");
  expect(result[1]).toBe("ignored");
  expect(result[2]).toContain("Mazda's Home stays");
});

test("a control without an expected method is not touched", async ({ page }) => {
  await page.route(HARNESS, (route) => route.fulfill({ contentType: "text/html", body: "<body></body>" }));
  await page.goto(HARNESS);
  await page.addScriptTag({ content: FAKE_HMI });
  const car = await (await page.request.get(`${SERVER}/api/builder/home/starter-classic/car`)).json();
  await page.evaluate((d) => (window.MiatOffHomeDesign = d), car);
  await page.addScriptTag({ url: "/js/miatoff-home.js" });
  await page.addScriptTag({ content: STAND_IN.replace('"setText", ', "") });
  expect(await page.evaluate(() => !!window.MainMenuCtrl.prototype.miatoffHome)).toBe(false);
  expect(await page.evaluate(() => window.lastError)).toContain("setText is missing");
});

test("the PC preview runs the car script", async ({ page }) => {
  await page.goto(SERVER + "/designer/home/car-preview.html?menu=starter-track");
  await expect(page.locator(".MiatOffHome")).toContainText("METERS");
  await page.keyboard.press("Enter");
  await expect(page.locator("#route")).toContainText("METERS: opens Applications");
  await page.waitForTimeout(1100); // the knob is ignored for a second after a choice, as in Mazda's control
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.locator("#route")).toContainText("NAVIGATION: Mazda's own Navigation button route");
});

import { test, expect } from "@playwright/test";
import { DESIGNER_URL } from "./config.mjs";
import { shellStates, shellFixture } from "./shell-fixture.mjs";
async function open(page) {
  await page.goto(
    DESIGNER_URL + "?test=1&db=ux-" +
      crypto.randomUUID(),
  );
  await page.waitForFunction(() => !!window.__studio);
  await page.evaluate(() => document.fonts.ready);
}
async function selectSpeed(page) {
  await page.locator("#layers-tab").click();
  await page
    .locator("#layers button")
    .filter({ hasText: "SPEED · Number" })
    .click();
}
test("Basic has a quiet contextual inspector and detail switching is non-mutating", async ({
  page,
}) => {
  await open(page);
  await expect(page.locator("#editing-detail")).toHaveAttribute(
    "aria-valuetext",
    "Basic",
  );
  await expect(page.locator("#inspector-empty")).toBeVisible();
  await selectSpeed(page);
  expect(
    await page
      .locator("#properties input:visible,#properties select:visible")
      .count(),
  ).toBeLessThanOrEqual(8);
  expect(await page.locator("#properties details:visible").count()).toBe(2);
  await page.evaluate(() => __studio.flush());
  const before = await page.evaluate(() => ({
    document: JSON.stringify(__studio.store.project),
    revision: __studio.persistence.revision,
    undo: __studio.store.undoStack.length,
  }));
  await page.getByRole("button", { name: "Expert", exact: true }).click();
  await page.getByRole("button", { name: "Basic", exact: true }).click();
  await page.waitForTimeout(650);
  expect(
    await page.evaluate(() => ({
      document: JSON.stringify(__studio.store.project),
      revision: __studio.persistence.revision,
      undo: __studio.store.undoStack.length,
    })),
  ).toEqual(before);
  await page.screenshot({ path: "artifacts/ui-basic.png" });
});
test("free canvas add workflow, appearance, resize, preview and export", async ({
  page,
}) => {
  await open(page);
  await page.locator("#pageadd").click();
  await page.locator("#blank-page").click();
  await page.locator("#add-instrument-open").click();
  await page.getByLabel("Search instruments").fill("number");
  await page
    .locator("#widget-gallery button")
    .filter({ hasText: "Number" })
    .click();
  await page.locator("#add-chosen").click();
  await page.getByLabel("Reading", { exact: true }).selectOption("speed");
  await page.getByRole("button", { name: "Raised", exact: true }).click();
  await page.locator("#resize-open").click();
  await page.locator("#resize-width").fill("300");
  await page.locator("#resize-height").fill("180");
  await page.getByRole("button", { name: "Apply size", exact: true }).click();
  expect(
    await page.evaluate(() => {
      const w = __studio.store.project.themes[0].pages.at(-1).widgets[0];
      return { signal: w.signal, effect: w.style.effect, w: w.w, h: w.h };
    }),
  ).toEqual({ signal: "speed", effect: "raised", w: 300, h: 180 });
  await page.locator("#preview").click();
  await expect(page.locator("#preview")).toHaveText("Exit preview");
  await page.locator("#preview").click();
  await page.locator("#export-open").click();
  const download = page.waitForEvent("download");
  await page.locator("#theme").click();
  expect((await download).suggestedFilename()).toBe("meters-page-v3.json");
});
test("Advanced and Expert expose distinct controls with stable selection", async ({
  page,
}) => {
  await open(page);
  await selectSpeed(page);
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page
    .locator("#properties summary")
    .filter({ hasText: "Layout" })
    .click();
  await expect(page.getByLabel("X position", { exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/ui-advanced.png" });
  await page.getByRole("button", { name: "Expert", exact: true }).click();
  await page
    .locator("#properties summary")
    .filter({ hasText: "Effects" })
    .click();
  await expect(page.getByLabel("Shadow blur", { exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/ui-expert.png" });
});
test("phone sheets keep focus and fit the canvas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#inspector-tab").click();
  await expect(page.locator("#tool-sheet")).toBeVisible();
  await expect(page.locator(".inspector-panel")).toBeVisible();
  await page.screenshot({ path: "artifacts/ui-phone.png" });
  await page.getByRole("button", { name: "Close tools sheet" }).click();
  await expect(page.locator("#inspector-tab")).toBeFocused();
});
test("invalid fields retain focus and block detail changes until corrected", async ({
  page,
}) => {
  await open(page);
  await selectSpeed(page);
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page
    .locator("#properties summary")
    .filter({ hasText: "Layout" })
    .click();
  const width = page
      .locator("#properties")
      .getByLabel("Width", { exact: true }),
    startWidth = await page.evaluate(
      () => __studio.store.project.themes[0].pages[0].widgets[1].w,
    );
  await width.fill("-1");
  await page.getByRole("button", { name: "Expert", exact: true }).click();
  await expect(page.locator("#editing-detail")).toHaveValue("1");
  await expect(width).toBeFocused();
  await expect(width).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.locator("#properties .field-error").filter({ hasText: "outside" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => __studio.store.project.themes[0].pages[0].widgets[1].w,
    ),
  ).toBe(startWidth);
  await width.fill("300");
  await page.getByRole("button", { name: "Expert", exact: true }).click();
  await expect(page.locator("#editing-detail")).toHaveValue("2");
  expect(
    await page.evaluate(
      () => __studio.store.project.themes[0].pages[0].widgets[1].w,
    ),
  ).toBe(300);
});
test("custom expert values survive preferences and reloading", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() =>
    __studio.command("Expert design", (p, v) => {
      const w = p.themes[0].pages[0].widgets[1];
      w.style.shadowBlur = 20;
      w.scale = { mode: "custom", unit: "km/h", min: 10, max: 300 };
      v.selection = [w.id];
    }),
  );
  await expect(page.locator("#custom-settings")).toBeVisible();
  const before = await page.evaluate(() =>
    JSON.stringify(__studio.store.project),
  );
  await page.locator("#reveal-custom").click();
  await expect(page.locator("#editing-detail")).toHaveValue("2");
  await page.getByRole("button", { name: "Basic", exact: true }).click();
  expect(
    await page.evaluate(() => JSON.stringify(__studio.store.project)),
  ).toBe(before);
  await page.evaluate(() => __studio.flush());
  await page.reload();
  await page.waitForFunction(() => !!window.__studio);
  await expect(page.locator("#editing-detail")).toHaveValue("0");
  expect(
    await page.evaluate(
      () =>
        __studio.store.project.themes[0].pages[0].widgets[1].style.shadowBlur,
    ),
  ).toBe(20);
});
test("mixed selections edit common properties and locked selections remain protected", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() =>
    __studio.command("Mixed fixture", (p, v) => {
      v.selection = p.themes[0].pages[0].widgets.slice(1, 3).map((w) => w.id);
    }),
  );
  await expect(page.getByLabel("Reading", { exact: true })).toHaveValue(
    "__mixed",
  );
  await page.getByLabel("Reading", { exact: true }).selectOption("fuel");
  expect(
    await page.evaluate(() =>
      __studio.store.project.themes[0].pages[0].widgets
        .slice(1, 3)
        .map((w) => w.signal),
    ),
  ).toEqual(["fuel", "fuel"]);
  await page.evaluate(() =>
    __studio.command(
      "Lock fixture",
      (p) => (p.themes[0].pages[0].widgets[1].locked = true),
    ),
  );
  await expect(page.getByLabel("Reading", { exact: true })).toBeDisabled();
  await expect(page.locator("#resize-open")).toBeDisabled();
});
test("theme, page and widget scopes stay separate", async ({ page }) => {
  await open(page);
  await page.locator("#empty-theme").click();
  await expect(page.getByLabel("Page name", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mint", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Amber", exact: true }).click();
  expect(
    await page.evaluate(
      () => __studio.store.project.themes[0].pages[0].style.color,
    ),
  ).toBe("#ffbf69");
  await page.locator("#scope-back").click();
  await expect(page.locator("#inspector-empty")).toBeVisible();
  await page.locator("#empty-background").click();
  await expect(
    page.getByLabel("Background type", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Page name", { exact: true })).toBeVisible();
  await page
    .getByLabel("Background type", { exact: true })
    .selectOption("solid");
  expect(
    await page.evaluate(
      () => __studio.store.project.themes[0].pages[0].background.kind,
    ),
  ).toBe("solid");
});
test("detail slider supports keyboard and workspace preferences survive reload", async ({
  page,
}) => {
  await open(page);
  await page.locator("#editing-detail").focus();
  await page.keyboard.press("End");
  await expect(page.locator("#editing-detail")).toHaveAttribute(
    "aria-valuetext",
    "Expert",
  );
  await page.keyboard.press("Home");
  await expect(page.locator("#editing-detail")).toHaveAttribute(
    "aria-valuetext",
    "Basic",
  );
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#editing-detail")).toHaveAttribute(
    "aria-valuetext",
    "Advanced",
  );
  await page.locator("#instruments-tab").click();
  await page.reload();
  await page.waitForFunction(() => !!window.__studio);
  await expect(page.locator("#editing-detail")).toHaveValue("1");
  await expect(page.locator("#instruments-tab")).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
test("selection survives closing a phone sheet with Escape", async ({
  page,
}) => {
  await open(page);
  await selectSpeed(page);
  const id = await page.evaluate(() => __studio.store.view.selection[0]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#inspector-tab").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#tool-sheet")).not.toBeVisible();
  expect(await page.evaluate(() => __studio.store.view.selection[0])).toBe(id);
});
test("preference storage failure does not block editing or draft persistence", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    }),
  );
  await open(page);
  await expect(page.locator("#save-status")).toContainText("Saved");
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await expect(page.locator("#editing-detail")).toHaveValue("1");
  await expect(page.locator("#status")).toContainText("session-only");
  await page.evaluate(async () => {
    __studio.command(
      "Work despite prefs",
      (p) => (p.themes[0].name = "Still editable"),
    );
    await __studio.flush();
  });
  expect(
    await page.evaluate(() => __studio.persistence.revision),
  ).toBeGreaterThan(1);
});
test("Expert has controls for every applicable registry property", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Expert", exact: true }).click();
  const failures = await page.evaluate(async () => {
    const M = await import("./v3/model.mjs");
    const failures = [];
    for (const [type, def] of Object.entries(M.registry)) {
      __studio.command("Coverage fixture", (p, v) => {
        const w = M.widget(type, def.variants.at(-1));
        w.labelMode = "custom";
        w.unitPosition = "separate";
        w.orientation = type === "shape" ? "custom" : "horizontal";
        w.sparkline = true;
        if (M.signalTypes.includes(type))
          w.warning = { mode: "custom", threshold: 50, direction: "above" };
        p.themes[0].pages[0].widgets = [w];
        v.selection = [w.id];
      });
      const keys = new Set(
        [...document.querySelectorAll("#properties [data-property]")].map(
          (n) => n.dataset.property,
        ),
      );
      for (const key of def.properties) {
        const expected =
          key === "threshold"
            ? "warning.threshold"
            : key === "direction"
              ? "warning.direction"
              : key === "zones"
                ? "zones.mode"
                : "widget." + key;
        if (!keys.has(expected)) failures.push(type + ": " + key);
      }
    }
    return failures;
  });
  expect(failures).toEqual([]);
});
test("ordinary property edits retain focus, selection and inspector scroll", async ({
  page,
}) => {
  await open(page);
  await selectSpeed(page);
  await page.getByLabel("Reading", { exact: true }).focus();
  await page.getByLabel("Reading", { exact: true }).selectOption("fuel");
  await expect(page.getByLabel("Reading", { exact: true })).toBeFocused();
  const selected = await page.evaluate(() => __studio.store.view.selection);
  await page.getByRole("button", { name: "Expert", exact: true }).click();
  await page
    .locator("#properties summary")
    .filter({ hasText: "Effects" })
    .click();
  const blur = page.getByLabel("Shadow blur", { exact: true });
  await blur.focus();
  const before = await page
    .locator(".inspector-panel")
    .evaluate((n) => n.scrollTop);
  await blur.fill("12");
  await blur.dispatchEvent("change");
  await expect(blur).toBeFocused();
  expect(
    await page.locator(".inspector-panel").evaluate((n) => n.scrollTop),
  ).toBe(before);
  expect(await page.evaluate(() => __studio.store.view.selection)).toEqual(
    selected,
  );
});
test("changing detail during a drag cancels the gesture without saving geometry", async ({
  page,
}) => {
  await open(page);
  await selectSpeed(page);
  await page.evaluate(() => __studio.flush());
  const before = await page.evaluate(() => ({
    document: JSON.stringify(__studio.store.project),
    undo: __studio.store.undoStack.length,
    revision: __studio.persistence.revision,
  }));
  const bounds = await page.locator("#canvas").boundingBox();
  await page.mouse.move(
    bounds.x + (bounds.width * 500) / 800,
    bounds.y + (bounds.height * 150) / 480,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + (bounds.width * 540) / 800,
    bounds.y + (bounds.height * 190) / 480,
  );
  await page.locator("#editing-detail").evaluate((n) => {
    n.value = "2";
    n.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.mouse.up();
  await page.waitForTimeout(650);
  expect(
    await page.evaluate(() => ({
      document: JSON.stringify(__studio.store.project),
      undo: __studio.store.undoStack.length,
      revision: __studio.persistence.revision,
    })),
  ).toEqual(before);
});

test("workspace fits all target viewports with keyboard and reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1366, 768],
    [1920, 1080],
    [2560, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const canvas = document
            .querySelector("#canvas")
            .getBoundingClientRect();
          return (
            document.documentElement.scrollWidth <= innerWidth &&
            canvas.width > 100 &&
            canvas.left >= 0 &&
            canvas.right <= innerWidth &&
            canvas.bottom <= innerHeight
          );
        }),
      )
      .toBe(true);
    await page.screenshot({
      path: `artifacts/workspace-${width}x${height}.png`,
    });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.locator("#pages-tab").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#instruments-tab")).toBeFocused();
  await expect(page.locator("#instruments-tab")).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("action and save feedback cannot erase an unresolved storage error", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    __studio.ui.saveStatus("Save failed: browser quota exceeded", true);
    __studio.ui.saveStatus("Saved just now");
    __studio.ui.notify("Theme exported");
  });
  await expect(page.locator("#notice")).toBeVisible();
  await expect(page.locator("#status")).toHaveText(
    "Save failed: browser quota exceeded",
  );
  await expect(page.locator("#save-status")).toHaveText("Saved just now");
  await page.locator("#dismiss-notice").click();
  await expect(page.locator("#notice")).toBeHidden();
});

for (const state of shellStates) {
  test(`reviewed ${state.name} editor shell`, async ({ page }) => {
    await shellFixture(page, state);
    await expect(page).toHaveScreenshot(`ui-${state.name}.png`, {
      mask: [page.locator("#save-status")],
    });
  });
}
test("colour zones start from the automatic zones and are edited and undone in the inspector", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page.locator("#layers-tab").click();
  await page
    .locator("#layers button")
    .filter({ hasText: "ENGINE RPM · Dial" })
    .click();
  const zones = () =>
    page.evaluate(
      () =>
        __studio.store.project.themes[0].pages[0].widgets.find(
          (w) => w.type === "radial",
        ).zones,
    );
  await page
    .locator("#properties summary")
    .filter({ hasText: "Colour zones" })
    .click();
  await page
    .getByLabel("Colour zones", { exact: true })
    .selectOption("custom");
  const custom = await zones();
  const vehicle = await page.evaluate(() => __studio.store.project.vehicle.rpm);
  expect(custom.mode).toBe("custom");
  expect(custom.steps.map((s) => s.at)).toEqual([vehicle.amber, vehicle.red]);
  await page.getByLabel("Zone 1 from (rpm)", { exact: true }).fill("5000");
  await page.getByLabel("Zone 1 from (rpm)", { exact: true }).press("Tab");
  expect((await zones()).steps[0].at).toBe(5000);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  expect((await zones()).steps).toHaveLength(3);
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+z");
  expect((await zones()).steps).toHaveLength(2);
  await page.getByLabel("Colour zones", { exact: true }).selectOption("off");
  expect(await zones()).toEqual({ mode: "off", base: null, steps: [] });
});
test("a page's look and background can be used on every page in one undoable step", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(async () => {
    const P = await import("./v3/pages.mjs");
    __studio.command("Add Neon page", (p) =>
      P.addPage(p, P.pageFromStarter("Neon", 0)),
    );
  });
  const pages = () =>
    page.evaluate(async () => {
      const M = await import("./v3/model.mjs"),
        t = __studio.store.project.themes[0];
      return t.pages.map((p) => ({
        style: M.pageTheme(t, p).style,
        background: p.background ?? t.background,
      }));
    });
  const before = await pages();
  expect(before.at(-1).style.color).not.toBe(before[0].style.color);
  await page.locator("#pages-tab").click();
  await page.locator("#open-theme-style").click();
  await page.locator('[data-apply="look"]').click();
  let after = await pages();
  expect(after.at(-1).style).toEqual(after[0].style);
  expect(after.at(-1).background).toEqual(before.at(-1).background);
  await page.locator("#scope-back").click();
  await page.locator("#open-background").click();
  await page.locator('[data-apply="background"]').click();
  after = await pages();
  expect(after.at(-1).background).toEqual(after[0].background);
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  expect(await pages()).toEqual(before);
});
test("a dial's value position is in Basic, and its scale step and label position in Advanced", async ({
  page,
}) => {
  await open(page);
  await page.locator("#layers-tab").click();
  await page
    .locator("#layers button")
    .filter({ hasText: "ENGINE RPM · Dial" })
    .click();
  const dial = () =>
    page.evaluate(() =>
      __studio.store.project.themes[0].pages[0].widgets.find(
        (w) => w.type === "radial",
      ),
    );
  await page.getByLabel("Value position", { exact: true }).selectOption("below");
  expect((await dial()).valuePosition).toBe("below");
  await expect(page.getByLabel("Scale labels", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page.getByLabel("Scale labels", { exact: true }).selectOption("outside");
  const step = page.getByLabel("Scale step (rpm, 0 = automatic)", { exact: true });
  await step.fill("10");
  await step.press("Tab");
  await expect(page.locator("#property-widget-tickStep-error")).toContainText(
    "more than 24 labels",
  );
  expect((await dial()).tickStep).toBe(0);
  await step.fill("1000");
  await step.press("Tab");
  expect(await dial()).toMatchObject({ tickLabels: "outside", tickStep: 1000 });
});

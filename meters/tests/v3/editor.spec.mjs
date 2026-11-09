import { test, expect } from "@playwright/test";
import { DESIGNER_URL } from "./config.mjs";
const base = DESIGNER_URL;

test("touching framed widgets are accepted while actual overlap is reported", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(async () => {
    const M = await import("./v3/model.mjs");
    __studio.command("Adjacent cards", (p) => {
      p.themes[0].pages[0].widgets = [24, 264].map((x) =>
        Object.assign(M.widget("number", "framed"), {
          x,
          y: 24,
          w: 240,
          h: 160,
        }),
      );
    });
  });
  await expect(page.locator("#layout-report")).toHaveText(
    "No measured layout issues",
  );
  await page.evaluate(() =>
    __studio.command("Overlap cards", (p) => {
      p.themes[0].pages[0].widgets[1].x -= 1;
    }),
  );
  await expect(page.locator("#layout-report")).toContainText("overlap:");
});
async function open(page, db = crypto.randomUUID()) {
  await page.goto(base + "?test=1&db=" + db);
  await expect.poll(() => page.evaluate(() => !!window.__studio)).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("button", { name: "Expert", exact: true }).click();
  return db;
}
test("boots isolated editor without errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator("#canvas")).toBeVisible();
  expect(errors).toEqual([]);
});
test("shared measurement: every variant, font, effect, units and unavailable data", async ({
  page,
}) => {
  await open(page);
  const failures = await page.evaluate(async () => {
    const M = await import("./v3/model.mjs"),
      L = await import("./v3/layout.mjs"),
      R = await import("./v3/renderer.mjs"),
      s = __studio.store.project,
      c = document.createElement("canvas");
    c.width = 800;
    c.height = 480;
    const ctx = c.getContext("2d"),
      failed = [];
    for (const type of Object.keys(M.registry))
      for (const variant of M.registry[type].variants)
        for (const effect of ["flat", "framed", "raised", "inset", "neon"])
          for (const font of ["Arial", "MO Chakra", "MO Mono"])
            for (const intensity of [0, 0.5, 1])
              for (const size of [
                [160, 104],
                [320, 240],
                [760, 440],
              ]) {
                const w = Object.assign(M.widget(type, variant), {
                  x: 16,
                  y: 16,
                  w: size[0],
                  h: size[1],
                  style: { effect, font, intensity },
                });
                if (type === "number") M.bind(w, "coolant");
                for (const unit of ["C", "F"]) {
                  s.vehicle.units.temperature = unit;
                  const state = { ...__studio.sim.state, coolant: 90 };
                  const m = L.measurement(ctx, w, s.themes[0], state);
                  R.renderWidget(ctx, w, m, state, { measureOnly: true });
                  for (const run of m.textRuns)
                    if (
                      !L.contains(run.box, run.bounds, L.TEXT_ROUNDING) ||
                      !L.contains(m.outer, run.bounds)
                    )
                      failed.push({
                        type,
                        variant,
                        effect,
                        font,
                        intensity,
                        size,
                        run,
                      });
                  state[w.signal] = null;
                  R.renderWidget(
                    ctx,
                    w,
                    L.measurement(ctx, w, s.themes[0], state),
                    state,
                    { measureOnly: true },
                  );
                }
              }
    return failed.slice(0, 12);
  });
  expect(failures).toEqual([]);
});
test("screenshot coolant/fuel cards remain inside effects", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(async () => {
    const M = await import("./v3/model.mjs");
    __studio.command("Cards", (p) => {
      const t = p.themes[0];
      t.pages[0].widgets = [
        "flat",
        "framed",
        "raised",
        "inset",
        "neon",
      ].flatMap((effect, i) =>
        ["coolant", "fuel"].map((signal, j) => {
          const w = Object.assign(M.widget("number"), {
            x: 16 + (i % 4) * 196,
            y: 40 + Math.floor(i / 4) * 220 + j * 110,
            w: 160,
            h: 104,
            size: 44,
            style: { effect, intensity: 1 },
          });
          M.bind(w, signal);
          return w;
        }),
      );
    });
    __studio.render();
  });
  await expect
    .poll(() => page.evaluate(() => __studio.measurements.length))
    .toBe(10);
  expect(
    await page.evaluate(() =>
      __studio.issues.filter((i) =>
        ["text-clipping", "internal-overlap"].includes(i.kind),
      ),
    ),
  ).toEqual([]);
  await page
    .locator("#canvas")
    .screenshot({ path: "test-results/effect-cards.png" });
});
test("signal changes, caption preservation, invalid edits, undo and keyboard", async ({
  page,
}) => {
  await open(page);
  await page.locator("#layers-tab").click();
  await page
    .locator("#layers button")
    .filter({ hasText: "ENGINE RPM" })
    .click();
  const original = await page.evaluate(
    () => __studio.store.project.themes[0].pages[0].widgets[0].x,
  );
  await page.getByLabel("Reading", { exact: true }).selectOption("speed");
  expect(
    await page.evaluate(
      () => __studio.store.project.themes[0].pages[0].widgets[0].label,
    ),
  ).toBe("SPEED");
  await page.getByLabel("Caption", { exact: true }).selectOption("custom");
  await page.getByLabel("Custom caption", { exact: true }).fill("My velocity");
  await page.getByLabel("Custom caption", { exact: true }).press("Tab");
  await page.getByLabel("Reading", { exact: true }).selectOption("rpm");
  await expect(page.getByLabel("Custom caption", { exact: true })).toHaveValue(
    "My velocity",
  );
  await page.locator("#canvas").focus();
  await page.keyboard.press("ArrowRight");
  expect(
    await page.evaluate(
      () => __studio.store.project.themes[0].pages[0].widgets[0].x,
    ),
  ).toBe(original + 1);
  await page.keyboard.press("Control+z");
  expect(
    await page.evaluate(
      () => __studio.store.project.themes[0].pages[0].widgets[0].x,
    ),
  ).toBe(original);
  await page
    .locator("#properties summary")
    .filter({ hasText: "Layout" })
    .click();
  const startWidth = await page.evaluate(
    () => __studio.store.project.themes[0].pages[0].widgets[0].w,
  );
  await page
    .locator("#properties")
    .getByLabel("Width", { exact: true })
    .fill("-1");
  await page
    .locator("#properties")
    .getByLabel("Width", { exact: true })
    .press("Tab");
  expect(
    await page.evaluate(
      () => __studio.store.project.themes[0].pages[0].widgets[0].w,
    ),
  ).toBe(startWidth);
});
test("save/reload, immutable assets, revisions and conflict refusal", async ({
  page,
  context,
}) => {
  const db = await open(page);
  await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 20;
    c.height = 20;
    c.getContext("2d").fillRect(0, 0, 20, 20);
    __studio.command("Image", (p) => {
      p.assets.image = { data: c.toDataURL(), width: 20, height: 20 };
      p.themes[0].background = {
        ...p.themes[0].background,
        kind: "image",
        asset: "image",
      };
    });
    await __studio.flush();
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!window.__studio)).toBe(true);
  expect(
    await page.evaluate(() => __studio.store.project.assets.image.width),
  ).toBe(20);
  const second = await context.newPage();
  await open(second, db);
  await page.evaluate(async () => {
    __studio.command("First tab", (p) => (p.themes[0].name = "First tab"));
    await __studio.flush();
  });
  await expect.poll(() => second.evaluate(() => __studio.conflict)).toBe(true);
  await second
    .getByRole("button", { name: "Export original / local work" })
    .isVisible();
  expect(
    await second.evaluate(() => __studio.store.project.themes[0].name),
  ).not.toBe("First tab");
});
test("corrupt legacy draft is retained and cannot autosave defaults", async ({
  page,
}) => {
  const db = crypto.randomUUID();
  await page.goto(base + "?test=1&db=bootstrap-" + crypto.randomUUID());
  await page.evaluate(async (name) => {
    await new Promise((resolve, reject) => {
      const r = indexedDB.open("studio-test-" + name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("drafts");
      r.onsuccess = () => {
        const tx = r.result.transaction("drafts", "readwrite");
        tx.objectStore("drafts").put(
          { version: 99, original: "retained" },
          "project",
        );
        tx.oncomplete = () => {
          r.result.close();
          resolve();
        };
      };
      r.onerror = () => reject(r.error);
    });
  }, db);
  await open(page, db);
  expect(await page.evaluate(() => __studio.recovery)).toBe(true);
  expect(
    await page.evaluate(async () => {
      const db = await __studio.persistence.open();
      return await new Promise((resolve) => {
        const r = db.transaction("drafts").objectStore("drafts").get("project");
        r.onsuccess = () => resolve(r.result);
      });
    }),
  ).toEqual({ version: 99, original: "retained" });
});
test("restoring a revision keeps the retained pre-v3 original", async ({
  page,
}) => {
  const db = crypto.randomUUID();
  await page.goto(base + "?test=1&db=bootstrap-" + crypto.randomUUID());
  await page.addScriptTag({ url: "../js/designer-runtime.js" });
  await page.evaluate(async (name) => {
    const legacy = window.MeterDesigner.defaults();
    legacy.vehicle.mass = 1234;
    await new Promise((resolve, reject) => {
      const r = indexedDB.open("studio-test-" + name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("drafts");
      r.onsuccess = () => {
        const tx = r.result.transaction("drafts", "readwrite");
        tx.objectStore("drafts").put(legacy, "project");
        tx.oncomplete = () => {
          r.result.close();
          resolve();
        };
      };
      r.onerror = () => reject(r.error);
    });
  }, db);
  await open(page, db);
  expect(
    (await page.evaluate(() => __studio.persistence.originalSource())).version,
  ).toBe(1);
  await page.evaluate(() =>
    __studio.command("Rename", (p) => {
      p.themes[0].name = "Edited";
    }),
  );
  await page.evaluate(() => __studio.flush());
  await open(page, db);
  await page.evaluate(() =>
    __studio.command("Rename again", (p) => {
      p.themes[0].name = "Edited twice";
    }),
  );
  await page.evaluate(() => __studio.flush());
  await open(page, db);
  await page.locator("#project-open").click();
  await page.locator("#revisions").click();
  await page.getByRole("button", { name: "Restore selected revision" }).click();
  await page.waitForTimeout(500);
  await page.evaluate(() => __studio.flush());
  const original = await page.evaluate(() =>
    __studio.persistence.originalSource(),
  );
  expect(original.version).toBe(1);
  expect(original.vehicle.mass).toBe(1234);
});
test("responsive layouts and paused render stay bounded", async ({ page }) => {
  await open(page);
  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1366, 768],
    [1920, 1080],
    [3440, 1440],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390) {
      await page.locator("#inspector-tab").click();
      await expect(page.locator(".inspector-panel")).toBeVisible();
      expect(
        (await page.locator("#inspector-tab").boundingBox()).height,
      ).toBeGreaterThanOrEqual(44);
      await page.getByRole("button", { name: "Close tools sheet" }).click();
    }
  }
});
test("24-widget warmed rendering profile and ten-minute simulated soak", async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const M = await import("./v3/model.mjs"),
      R = await import("./v3/renderer.mjs");
    const p = __studio.store.project,
      t = p.themes[0],
      page = t.pages[0];
    page.widgets = Array.from({ length: 24 }, (_, i) =>
      Object.assign(M.widget("number", "framed"), {
        x: (i % 6) * 132 + 4,
        y: Math.floor(i / 6) * 116 + 4,
        w: 124,
        h: 108,
        size: 32,
      }),
    );
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 480;
    const ctx = c.getContext("2d"),
      times = [];
    for (let i = 0; i < 150; i++) {
      const at = performance.now();
      R.render(ctx, t, page, {}, __studio.sim.state);
      if (i > 20) times.push(performance.now() - at);
    }
    __studio.sim.running = true;
    for (let i = 0; i < 6000; i++) __studio.sim.step(0.1, p.vehicle);
    __studio.sim.running = false;
    times.sort((a, b) => a - b);
    return {
      p95: times[Math.floor(times.length * 0.95)],
      history: __studio.sim.history.length,
      caches: R.cacheStats(),
    };
  });
  console.log("PERFORMANCE", JSON.stringify(result));
  expect(result.p95).toBeLessThan(16);
  expect(result.history).toBeLessThanOrEqual(1200);
  expect(result.caches.finish).toBeLessThanOrEqual(64);
});
test("invalid JSON imports preserve the project; theme imports preserve vehicle", async ({
  page,
}) => {
  await open(page);
  const before = await page.evaluate(() =>
    JSON.stringify(__studio.store.project),
  );
  await page.locator("#file").setInputFiles({
    name: "future.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":99,"kind":"MetersSetup"}'),
  });
  await expect(page.locator("#status")).toContainText("Import failed");
  expect(
    await page.evaluate(() => JSON.stringify(__studio.store.project)),
  ).toBe(before);
  const data = await page.evaluate(() =>
    JSON.stringify({
      version: 3,
      kind: "ThemeDocument",
      theme: __studio.store.project.themes[0],
      assets: {},
    }),
  );
  await page.evaluate(() =>
    __studio.command("Units", (p) => (p.vehicle.units.speed = "mph")),
  );
  await page.locator("#file").setInputFiles({
    name: "theme.json",
    mimeType: "application/json",
    buffer: Buffer.from(data),
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => __studio.store.project.themes.flatMap((t) => t.pages).length,
      ),
    )
    .toBe(4);
  expect(
    await page.evaluate(() => __studio.store.project.vehicle.units.speed),
  ).toBe("mph");
});
test("quota failure leaves the last committed draft readable", async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const previous = __studio.store.project.themes[0].name;
    __studio.persistence.save = async () => {
      throw new DOMException(
        "Storage full: export a backup",
        "QuotaExceededError",
      );
    };
    __studio.command(
      "Quota fixture",
      (p) => (p.themes[0].name = "Unsaved local work"),
    );
    await __studio.flush();
    const db = await __studio.persistence.open();
    const saved = await new Promise((resolve) => {
      const r = db
        .transaction("projects")
        .objectStore("projects")
        .get("current");
      r.onsuccess = () => resolve(r.result);
    });
    return { previous, saved: saved.document.themes[0].name };
  });
  expect(result.saved).toBe(result.previous);
  await expect(page.locator("#status")).toContainText("Save failed");
});
test("image upload cancelled when its captured target page is deleted", async ({
  page,
}) => {
  await open(page);
  const bytes = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    return c.toDataURL().split(",")[1];
  });
  await page.evaluate(() => {
    const original = createImageBitmap;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    window.releaseDecode = release;
    window.createImageBitmap = async (...args) => {
      await gate;
      return original(...args);
    };
  });
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#open-background").click();
  await page.locator("#image-upload").dispatchEvent("click");
  await (
    await chooser
  ).setFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: Buffer.from(bytes, "base64"),
  });
  await page.evaluate(() => {
    __studio.command("Delete upload target", (p) =>
      p.themes[0].pages.splice(0, 1),
    );
    releaseDecode();
  });
  await expect(page.locator("#status")).toContainText(
    "target page was deleted",
  );
  expect(
    await page.evaluate(
      () => Object.keys(__studio.store.project.assets).length,
    ),
  ).toBe(0);
});
test("revision compare-and-swap blocks a stale writer without BroadcastChannel", async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const { Persistence } = await import("./v3/persistence.mjs"),
      p = new Persistence(__studio.persistence.name);
    await p.load();
    await __studio.flush();
    try {
      await p.save(__studio.store.project, { session: "stale" });
      return false;
    } catch (e) {
      return e.constructor.name === "DraftConflict";
    } finally {
      p.close();
    }
  });
  expect(result).toBe(true);
});
test("normal starter pages have no clipping or internal overlap in either mode", async ({
  page,
}) => {
  await open(page);
  const failures = await page.evaluate(async () => {
    const M = await import("./v3/model.mjs"),
      L = await import("./v3/layout.mjs"),
      R = await import("./v3/renderer.mjs"),
      c = document.createElement("canvas").getContext("2d"),
      fail = [];
    for (const name of M.names) {
      const t = M.starter(name);
      for (const mode of ["night", "day"])
        for (const p of t.pages)
          for (const issue of L.preflight(
            c,
            t,
            p,
            __studio.sim.state,
            mode,
            R.renderWidget,
          ))
            if (["text-clipping", "internal-overlap"].includes(issue.kind))
              fail.push({ name, mode, page: p.name, ...issue });
    }
    return fail;
  });
  expect(failures).toEqual([]);
});
test("exports use referenced assets only and PNGs exclude guides", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 4;
    __studio.command(
      "Unused asset",
      (p) => (p.assets.unused = { data: c.toDataURL(), width: 4, height: 4 }),
    );
  });
  const download = page.waitForEvent("download");
  await page.locator("#export-open").click();
  await page.locator("#theme").click();
  const file = await download,
    fs = await import("node:fs/promises"),
    text = await fs.readFile(await file.path(), "utf8"),
    theme = JSON.parse(text);
  expect(theme.kind).toBe("ThemeDocument");
  expect(theme.assets).toEqual({});
  const clean = await page.evaluate(async () => {
    const R = await import("./v3/renderer.mjs"),
      c = document.createElement("canvas");
    c.width = 800;
    c.height = 480;
    const p = __studio.store.project;
    R.render(
      c.getContext("2d"),
      p.themes[0],
      p.themes[0].pages[0],
      p.assets,
      __studio.sim.state,
    );
    return c.toDataURL().split(",")[1];
  });
  const png = page.waitForEvent("download");
  await page.locator("#export-open").click();
  await page.locator("#snapshot").click();
  expect(await fs.readFile(await (await png).path())).toEqual(
    Buffer.from(clean, "base64"),
  );
});
test("group drag cancellation, clamping and arrangement are undoable", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(async () => {
    const M = await import("./v3/model.mjs");
    __studio.command("Group fixture", (p, v) => {
      const ws = [
        Object.assign(M.widget(), { x: 40, y: 40, w: 120, h: 100 }),
        Object.assign(M.widget(), { x: 180, y: 40, w: 120, h: 100 }),
      ];
      p.themes[0].pages[0].widgets = ws;
      v.selection = ws.map((w) => w.id);
    });
  });
  await page.locator("#layers-tab").click();
  await page.locator("#group").click();
  const original = await page.evaluate(() =>
    __studio.store.project.themes[0].pages[0].widgets.map((w) => [w.x, w.y]),
  );
  const bounds = await page.locator("#canvas").boundingBox();
  await page.mouse.move(
    bounds.x + (60 / 800) * bounds.width,
    bounds.y + (60 / 480) * bounds.height,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + (150 / 800) * bounds.width,
    bounds.y + (150 / 480) * bounds.height,
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(
    await page.evaluate(() =>
      __studio.store.project.themes[0].pages[0].widgets.map((w) => [w.x, w.y]),
    ),
  ).toEqual(original);
  await page.locator("#tidy-layout").click();
  await expect(page.locator("#apply-arrangement")).toBeVisible();
  expect(
    await page.evaluate(() =>
      __studio.store.project.themes[0].pages[0].widgets.map((w) => [w.x, w.y]),
    ),
  ).toEqual(original);
  await page.locator("#apply-arrangement").click();
  expect(
    await page.evaluate(
      () =>
        __studio.store.project.themes[0].pages[0].widgets[1].x -
        __studio.store.project.themes[0].pages[0].widgets[0].x,
    ),
  ).toBe(140);
  await page.locator("#undo").click();
  expect(
    await page.evaluate(() =>
      __studio.store.project.themes[0].pages[0].widgets.map((w) => [w.x, w.y]),
    ),
  ).toEqual(original);
});
test("component insertion is independent and style paste preserves bindings", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() =>
    __studio.command("Component fixture", (p) => {
      const w = structuredClone(p.themes[0].pages[0].widgets[2]);
      w.x = w.y = 0;
      w.id = "component-widget";
      p.library.push({
        id: "component",
        name: "Independent card",
        widgets: [w],
      });
    }),
  );
  await page.locator("#pageadd").click();
  await page.locator("#blank-page").click();
  await page
    .locator(".library-panel summary")
    .filter({ hasText: "Saved components" })
    .click();
  await page.locator("#components .preview-card").click();
  const inserted = await page.evaluate(
    () => __studio.store.project.themes[0].pages[2].widgets[0].id,
  );
  await page.getByLabel("Caption", { exact: true }).selectOption("custom");
  await page.getByLabel("Custom caption", { exact: true }).fill("Changed copy");
  await page.getByLabel("Custom caption", { exact: true }).press("Tab");
  expect(
    await page.evaluate(
      () => __studio.store.project.library[0].widgets[0].label,
    ),
  ).toBe("COOLANT");
  expect(inserted).not.toBe("component-widget");
  await page.locator(".selection-tools summary").click();
  await page.locator("#copy-style").click();
  await page.getByLabel("Reading", { exact: true }).selectOption("speed");
  await page.locator("#paste-style").click();
  expect(
    await page.evaluate(
      () => __studio.store.project.themes[0].pages[2].widgets[0].signal,
    ),
  ).toBe("speed");
});
test("ten revision retention, checkpoint and immutable image integrity", async ({
  page,
}) => {
  await open(page);
  const r = await page.evaluate(async () => {
    for (let i = 0; i < 13; i++) {
      __studio.command("Revision", (p) => (p.themes[0].name = "Revision " + i));
      await __studio.flush(i === 1 ? "Named checkpoint" : null);
    }
    const rows = await __studio.persistence.revisions();
    return {
      ordinary: rows.filter((r) => !r.name).length,
      named: rows.some((r) => r.name === "Named checkpoint"),
    };
  });
  expect(r).toEqual({ ordinary: 10, named: true });
});
test("malformed image import and deleted references leave last valid document intact", async ({
  page,
}) => {
  await open(page);
  const raw = await page.evaluate(() => {
      const p = structuredClone(__studio.store.project);
      p.assets.bad = {
        data: "data:image/png;base64,YQ==",
        width: 1,
        height: 1,
      };
      return JSON.stringify(p);
    }),
    before = await page.evaluate(() => JSON.stringify(__studio.store.project));
  await page.locator("#file").setInputFiles({
    name: "bad-image.json",
    mimeType: "application/json",
    buffer: Buffer.from(raw),
  });
  await expect(page.locator("#status")).toContainText("Import failed");
  expect(
    await page.evaluate(() => JSON.stringify(__studio.store.project)),
  ).toBe(before);
});
test("paused editor performs no continuing rendering; gallery playback is capped", async ({
  page,
}) => {
  await open(page);
  await page.waitForTimeout(250);
  const before = await page.evaluate(() => ({ ...__studio.renderStats }));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => __studio.renderStats.frames)).toBe(
    before.frames,
  );
  await page.locator("#play").click();
  const start = await page.evaluate(() => ({ ...__studio.renderStats }));
  await page.waitForTimeout(1050);
  await page.locator("#play").click();
  const end = await page.evaluate(() => ({ ...__studio.renderStats }));
  expect(end.frames - start.frames).toBeGreaterThan(10);
  expect(end.galleryFrames - start.galleryFrames).toBeLessThanOrEqual(6);
});
test("minimum/default/maximum/negative/large/missing readings and UK/US units remain bounded", async ({
  page,
}) => {
  await open(page);
  const failures = await page.evaluate(async () => {
    const M = await import("./v3/model.mjs"),
      L = await import("./v3/layout.mjs"),
      R = await import("./v3/renderer.mjs"),
      c = document.createElement("canvas").getContext("2d"),
      failed = [];
    for (const units of [
      {
        speed: "km/h",
        distance: "km",
        temperature: "C",
        power: "PS",
        torque: "Nm",
        consumption: "L/100km",
      },
      {
        speed: "mph",
        distance: "mi",
        temperature: "C",
        power: "hp",
        torque: "lb-ft",
        consumption: "mpg UK",
      },
      {
        speed: "mph",
        distance: "mi",
        temperature: "F",
        power: "kW",
        torque: "lb-ft",
        consumption: "mpg US",
      },
    ])
      for (const type of Object.keys(M.registry))
        for (const variant of M.registry[type].variants)
          for (const level of [
            "min",
            "normal",
            "max",
            "negative",
            "large",
            "missing",
          ]) {
            const w = Object.assign(M.widget(type, variant), {
                x: 16,
                y: 16,
                w: 320,
                h: 240,
                labelMode: "custom",
                label: "A VERY LONG INSTRUMENT CAPTION WITH IMPORTANT DETAILS",
              }),
              state = {
                ...__studio.sim.state,
                vehicle: { ...__studio.store.project.vehicle, units },
              };
            for (const [key, d] of Object.entries(M.signals))
              state[key] =
                level === "missing"
                  ? null
                  : level === "min"
                    ? d.min
                    : level === "max"
                      ? d.max
                      : level === "negative"
                        ? -5
                        : level === "large"
                          ? 999999
                          : (d.min + d.max) / 2;
            for (const size of [
              [96, 80],
              [320, 240],
              [760, 440],
            ]) {
              w.w = size[0];
              w.h = size[1];
              const m = L.measurement(
                c,
                w,
                __studio.store.project.themes[0],
                state,
              );
              R.renderWidget(c, w, m, state, { measureOnly: true });
              if (
                !L.contains(m.outer, m.panel) ||
                !L.contains(m.panel, m.content)
              )
                failed.push({ type, variant, level, size, geometry: true });
              for (const text of m.textRuns)
                if (
                  text.size < 8 ||
                  !L.contains(text.box, text.bounds, L.TEXT_ROUNDING) ||
                  !L.contains(m.outer, text.bounds)
                )
                  failed.push({ type, variant, level, size, text });
            }
          }
    return failed.slice(0, 10);
  });
  expect(failures).toEqual([]);
});
test("uploaded PNG normalizes, survives JSON sharing and reload, and deduplicates", async ({
  page,
}) => {
  await open(page);
  const bytes = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = 960;
    c.getContext("2d").fillRect(0, 0, 1600, 960);
    return c.toDataURL().split(",")[1];
  });
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#open-background").click();
  await page.locator("#image-upload").dispatchEvent("click");
  await (
    await chooser
  ).setFiles({
    name: "large-synthetic.png",
    mimeType: "image/png",
    buffer: Buffer.from(bytes, "base64"),
  });
  await expect
    .poll(() =>
      page.evaluate(() => Object.keys(__studio.store.project.assets).length),
    )
    .toBe(1);
  expect(
    await page.evaluate(() =>
      Object.values(__studio.store.project.assets).map((a) => [
        a.width,
        a.height,
      ]),
    ),
  ).toEqual([[800, 480]]);
  await page.evaluate(() => __studio.flush());
  await page.reload();
  await page.waitForFunction(() => !!window.__studio);
  expect(
    await page.evaluate(
      () => __studio.store.project.themes[0].pages[0].background.kind,
    ),
  ).toBe("image");
  const download = page.waitForEvent("download");
  await page.locator("#export-open").click();
  await page.locator("#theme").click();
  const fs = await import("node:fs/promises"),
    json = await fs.readFile(await (await download).path());
  await page.locator("#file").setInputFiles({
    name: "theme-image.json",
    mimeType: "application/json",
    buffer: json,
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => __studio.store.project.themes.flatMap((t) => t.pages).length,
      ),
    )
    .toBe(3);
  expect(
    await page.evaluate(
      () => Object.keys(__studio.store.project.assets).length,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(() => {
      const ts = __studio.store.project.themes;
      return (
        ts[0].pages[0].background.asset === ts[0].pages[2].background.asset
      );
    }),
  ).toBe(true);
});
test("automatic recording stop persists locally and no-op edits do not create revisions", async ({
  page,
}) => {
  await open(page);
  const revision = await page.evaluate(() => __studio.persistence.revision);
  await page.evaluate(() => __studio.command("No-op", () => {}));
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => __studio.persistence.revision)).toBe(
    revision,
  );
  await page.locator("#record").dispatchEvent("click");
  await page.evaluate(() => {
    __studio.sim.running = true;
    for (let i = 0; i < 300; i++)
      __studio.sim.step(1, __studio.store.project.vehicle);
    __studio.sim.running = false;
    __studio.render();
  });
  await expect(page.locator("#record")).toHaveText("Record preview");
  const recording = await page.evaluate(() =>
    JSON.parse(localStorage.getItem(__studio.persistence.name + "-recording")),
  );
  expect(recording.duration).toBe(300);
  expect(recording.kind).toBe("MetersRecording");
});
test("named checkpoint deletion preserves the current draft", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(async () => {
    await __studio.flush("Discardable checkpoint");
    const rows = await __studio.persistence.revisions(),
      named = rows.find((r) => r.name === "Discardable checkpoint");
    await __studio.persistence.deleteCheckpoint(
      named.key,
      __studio.store.assetRoots(),
    );
  });
  expect(
    await page.evaluate(async () =>
      (await __studio.persistence.revisions()).some(
        (r) => r.name === "Discardable checkpoint",
      ),
    ),
  ).toBe(false);
  await expect(page.locator("#collection-caption")).toContainText("Custom");
});
test("mixed 24-widget renderer stays within the warmed frame target", async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const M = await import("./v3/model.mjs"),
      R = await import("./v3/renderer.mjs"),
      s = __studio.sim,
      p = __studio.store.project,
      t = p.themes[0],
      page = t.pages[0];
    s.running = true;
    s.windowLimit = 120;
    for (let i = 0; i < 1200; i++) s.step(0.1, p.vehicle);
    s.running = false;
    const types = Object.keys(M.registry),
      effects = ["flat", "framed", "raised", "inset", "neon"];
    page.widgets = Array.from({ length: 24 }, (_, i) =>
      Object.assign(M.widget(types[i % types.length]), {
        x: (i % 6) * 132 + 4,
        y: Math.floor(i / 6) * 116 + 4,
        w: 124,
        h: 108,
        size: 32,
        window: 120,
        style: { effect: effects[i % 5] },
      }),
    );
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 480;
    const ctx = c.getContext("2d"),
      times = [];
    for (let i = 0; i < 180; i++) {
      const start = performance.now();
      R.render(ctx, t, page, {}, s.state);
      if (i >= 30) times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    return {
      p95Ms: times[Math.floor(times.length * 0.95)],
      historySamples: s.history.length,
      cacheSizes: R.cacheStats(),
      samples: times.length,
      description:
        "24 mixed widgets, 120-second charts, all five treatments, warmed canvas renderer",
    };
  });
  console.log("MIXED PERFORMANCE", JSON.stringify(result));
  expect(result.p95Ms).toBeLessThan(16);
  const fs = await import("node:fs/promises");
  await fs.mkdir("artifacts", { recursive: true });
  await fs.writeFile(
    "artifacts/performance.json",
    JSON.stringify(result, null, 2),
  );
});
test("retained original can be restored with corrected inherited colors and undone", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(async () => {
    const raw = structuredClone(__studio.store.project);
    raw.version = 2;
    raw.themes[0].style = {
      color: "#123456",
      font: "Arial",
      effect: "flat",
      intensity: 0.5,
    };
    __studio.persistence.original = raw;
    await __studio.flush();
    __studio.command(
      "Later edit",
      (p) => (p.themes[0].style.textColor = "#ffffff"),
    );
    await __studio.flush();
  });
  await page.locator("#project-open").click();
  await page.locator("#revisions").click();
  await page
    .getByRole("button", { name: "Restore original", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => __studio.store.project.themes[0].style.textColor),
    )
    .toBe("#123456");
  await page.getByRole("button", { name: "Close recovery revisions" }).click();
  await page.locator("#undo").click();
  expect(
    await page.evaluate(() => __studio.store.project.themes[0].style.textColor),
  ).toBe("#ffffff");
});

import { test, expect } from "@playwright/test";
import { DESIGNER_URL } from "./config.mjs";
async function open(page, id = crypto.randomUUID(), count = 5) {
  await page.goto(DESIGNER_URL + "?mode=home&test=1&db=" + id);
  await expect(page.locator("#designer-mode")).toBeEnabled();
  const f = page.frameLocator("#home-studio");
  await expect(f.locator("#items .choose")).toHaveCount(count);
  return f;
}
test("Home editing, mode isolation, undo, draft reload and invalid imports", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const f = await open(page);
  await f.locator("#add").click();
  await expect(f.locator("#items .choose")).toHaveCount(6);
  await f.locator("#name").fill("My gauges");
  await f.locator("#name").press("Tab");
  await f.locator("#opens").selectOption("meters");
  await f.locator("#x").fill("400");
  await f.locator("#x").press("Tab");
  await page.locator("#designer-mode").selectOption("meters");
  await expect(page.locator("#designer-mode")).toBeEnabled();
  await expect(page.locator("#canvas")).toBeVisible();
  await page.evaluate(() => {
    __studio.command("Remember Meters page", (p) => {
      p.themes[0].pages[0].name = "Remembered page";
    });
  });
  await page.locator("#designer-mode").selectOption("home");
  await expect(page.locator("#designer-mode")).toBeEnabled();
  await expect(f.locator("#name")).toHaveValue("My gauges");
  expect(
    await page.evaluate(() => __studio.store.project.themes[0].pages[0].name),
  ).toBe("Remembered page");
  await f.locator("#undo").click();
  await expect(f.locator("#x")).not.toHaveValue("400");
  await f.locator("#redo").click();
  await expect(f.locator("#x")).toHaveValue("400");
  await f.locator("#try").click();
  await f.locator("#next").click();
  await f.locator("#select").click();
  await expect(f.locator("#route")).toContainText("Simulated destination");
  await f.locator("#try").click();
  await expect(f.locator("#save-status")).toContainText("Saved");
  await page.reload();
  await expect(page.locator("#designer-mode")).toBeEnabled();
  await expect(f.locator("#items .choose")).toHaveCount(6);
  await f.locator("#file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(f.locator("#notice")).toContainText("Import failed");
  await expect(f.locator("#items .choose")).toHaveCount(6);
  expect(errors).toEqual([]);
});
test("Home conflict detection and responsive preview exports", async ({
  page,
  context,
}) => {
  const id = crypto.randomUUID(),
    f = await open(page, id);
  await f.locator("#add").click();
  await expect(f.locator("#save-status")).toContainText("Saved");
  const other = await context.newPage(),
    g = await open(other, id, 6);
  await g.locator("#items .choose").first().click();
  await g.locator("#name").fill("Other tab");
  await g.locator("#name").press("Tab");
  await expect(g.locator("#save-status")).toContainText("Saved");
  await expect(f.locator("#recovery")).toBeVisible();
  await f.locator("#reload").click();
  await expect(f.locator("#items")).toContainText("Other tab");
  for (const [width, height] of [
    [1366, 768],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: "../../../build/home-" + width + ".png",
      fullPage: true,
    });
  }
  const download = page.waitForEvent("download");
  await f.locator("#png").click();
  expect((await download).suggestedFilename()).toBe("mazda-home.png");
  await other.close();
});

test("Home artwork states, upload cancellation, pointer transforms and save failures", async ({
  page,
}) => {
  const f = await open(page);
  await f.locator("#items .choose").first().click();
  const frame = page.frames().find((f) => f.url().includes("/home/index.html"));
  async function png(color) {
    return Buffer.from(
      await frame.evaluate((color) => {
        const c = document.createElement("canvas");
        c.width = c.height = 8;
        const x = c.getContext("2d");
        x.fillStyle = color;
        x.fillRect(0, 0, 8, 8);
        return c.toDataURL().split(",")[1];
      }, color),
      "base64",
    );
  }
  for (const [field, color] of [
    ["normal", "#ff0000"],
    ["selected", "#0000ff"],
    ["bg-image", "#008000"],
  ]) {
    await f.locator("#" + field).setInputFiles({
      name: field + ".png",
      mimeType: "image/png",
      buffer: await png(color),
    });
    await expect
      .poll(() =>
        frame.evaluate(
          () => Object.keys(HomeDesigner.store.project.assets).length,
        ),
      )
      .toBe(field === "normal" ? 1 : field === "selected" ? 2 : 3);
  }
  await f.locator("#try").click();
  await expect
    .poll(() =>
      frame.evaluate(() =>
        Array.from(
          document
            .getElementById("canvas")
            .getContext("2d")
            .getImageData(80, 310, 1, 1).data,
        ).slice(0, 3),
      ),
    )
    .toEqual([0, 0, 255]);
  await f.locator("#next").click();
  await expect
    .poll(() =>
      frame.evaluate(() =>
        Array.from(
          document
            .getElementById("canvas")
            .getContext("2d")
            .getImageData(80, 310, 1, 1).data,
        ).slice(0, 3),
      ),
    )
    .toEqual([255, 0, 0]);
  await f.locator("#try").click();
  const download = page.waitForEvent("download");
  await f.locator("#export").click();
  const d = await download;
  const fs = await import("node:fs/promises");
  const doc = JSON.parse(await fs.readFile(await d.path(), "utf8"));
  expect(Object.keys(doc.assets)).toHaveLength(3);
  await f.locator("#file").setInputFiles({
    name: "roundtrip.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await expect
    .poll(() => frame.evaluate(() => HomeDesigner.store.view.selection.length))
    .toBe(0);
  expect(
    await frame.evaluate(
      () => Object.keys(HomeDesigner.store.project.assets).length,
    ),
  ).toBe(3);
  await f.locator("#items .choose").first().click();
  const bounds = await f.locator("#canvas").boundingBox();
  const before = await frame.evaluate(
    () => HomeDesigner.store.project.items[0].x,
  );
  await page.mouse.move(
    bounds.x + (80 * bounds.width) / 800,
    bounds.y + (310 * bounds.height) / 480,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + (120 * bounds.width) / 800,
    bounds.y + (310 * bounds.height) / 480,
  );
  await page.mouse.up();
  expect(
    await frame.evaluate(() => HomeDesigner.store.project.items[0].x),
  ).toBeGreaterThan(before);
  await f.locator("#undo").click();
  await expect(f.locator("#x")).toHaveValue(String(before));
  const beforeResize = await frame.evaluate(() => ({
    ...HomeDesigner.store.project.items[0],
  }));
  await page.mouse.move(
    bounds.x + ((beforeResize.x + beforeResize.w - 8) * bounds.width) / 800,
    bounds.y + ((beforeResize.y + beforeResize.h - 8) * bounds.height) / 480,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + ((beforeResize.x + beforeResize.w + 24) * bounds.width) / 800,
    bounds.y + ((beforeResize.y + beforeResize.h + 8) * bounds.height) / 480,
  );
  await page.mouse.up();
  expect(
    await frame.evaluate(() => HomeDesigner.store.project.items[0].w),
  ).toBeGreaterThan(beforeResize.w);
  await f.locator("#undo").click();
  await frame.evaluate(() => {
    const original = createImageBitmap;
    window.createImageBitmap = (...args) =>
      new Promise((resolve) => {
        window.finishUpload = () => original(...args).then(resolve);
      });
  });
  await f.locator("#normal").setInputFiles({
    name: "later.png",
    mimeType: "image/png",
    buffer: await png("#ffff00"),
  });
  await expect
    .poll(() => frame.evaluate(() => typeof window.finishUpload))
    .toBe("function");
  await page.locator("#designer-mode").selectOption("meters");
  await expect(page.locator("#designer-mode")).toBeEnabled();
  await frame.evaluate(() => window.finishUpload());
  await page.locator("#designer-mode").selectOption("home");
  await expect(page.locator("#designer-mode")).toBeEnabled();
  await expect(f.locator("#notice")).toContainText("Design changed");
  await frame.evaluate(() => {
    HomeDesigner.persistence.save = async () => {
      throw Error("Quota exceeded");
    };
  });
  await f.locator("#name").fill("Kept in memory");
  await f.locator("#name").press("Tab");
  await expect(f.locator("#notice")).toContainText("Save failed");
  await expect(f.locator("#name")).toHaveValue("Kept in memory");
});

test("Home import and New design replace the current design, and undo brings it back", async ({
  page,
}) => {
  const f = await open(page);
  const frame = page.frames().find((f) => f.url().includes("/home/index.html"));
  const doc = await frame.evaluate(() => {
    const d = structuredClone(HomeDesigner.store.project);
    d.items[0].label = "Imported";
    d.accent = "#123456";
    return d;
  });
  await f.locator("#file").setInputFiles({
    name: "other.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await expect(f.locator("#items .choose").first()).toHaveText("Imported");
  expect(await frame.evaluate(() => HomeDesigner.store.project.accent)).toBe(
    "#123456",
  );
  await f.locator("#undo").click();
  await expect(f.locator("#items .choose").first()).not.toHaveText("Imported");
  await f.locator("#redo").click();
  await expect(f.locator("#items .choose").first()).toHaveText("Imported");
  await f.locator("#reset").click();
  await expect(f.locator("#items .choose").first()).not.toHaveText("Imported");
  expect(await frame.evaluate(() => HomeDesigner.store.project.accent)).not.toBe(
    "#123456",
  );
});

test("Meters shortcuts do nothing while Mazda Home is shown", async ({
  page,
}) => {
  await page.goto(DESIGNER_URL + "?test=1&db=" + crypto.randomUUID());
  await expect(page.locator("#designer-mode")).toBeEnabled();
  await page.evaluate(() => {
    __studio.command("Name the page", (p) => {
      p.themes[0].pages[0].name = "Kept page";
    });
    const w = __studio.store.project.themes[0].pages[0].widgets.find(
      (w) => !w.locked && !w.hidden && w.role !== "background",
    );
    __studio.store.view.selection = [w.id];
  });
  const state = () =>
    page.evaluate(() =>
      JSON.stringify({
        project: __studio.store.project,
        undo: __studio.store.undoStack.length,
        redo: __studio.store.redoStack.length,
      }),
    );
  const before = await state();
  await page.locator("#designer-mode").selectOption("home");
  await expect(page.locator("#designer-mode")).toBeEnabled();
  await page.frameLocator("#home-studio").locator("#items .choose").first().waitFor();
  await page.locator(".brand").click();
  // Checked after every key, so one shortcut cannot hide what another did.
  for (const key of ["Delete", "Backspace", "ArrowLeft", "Control+D", "Control+Z"]) {
    await page.keyboard.press(key);
    expect(await state(), key).toBe(before);
  }
});

test("Home recovery: an unreadable draft can be exported, and the retained draft keeps its artwork", async ({
  page,
}) => {
  const id = crypto.randomUUID(),
    f = await open(page, id);
  let frame = page.frames().find((f) => f.url().includes("/home/index.html"));
  await f.locator("#items .choose").first().click();
  const icon = Buffer.from(
    await frame.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = c.height = 8;
      c.getContext("2d").fillRect(0, 0, 8, 8);
      return c.toDataURL().split(",")[1];
    }),
    "base64",
  );
  await f.locator("#normal").setInputFiles({ name: "i.png", mimeType: "image/png", buffer: icon });
  await expect(f.locator("#save-status")).toContainText("Saved");
  // Make the saved draft unreadable: a name the model refuses.
  await frame.evaluate(async (name) => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open(name, 2);
      r.onsuccess = () => resolve(r.result);
    });
    const t = db.transaction("projects", "readwrite"),
      s = t.objectStore("projects"),
      r = s.get("current");
    r.onsuccess = () => {
      r.result.document.items[0].label = "";
      s.put(r.result, "current");
    };
    await new Promise((resolve) => (t.oncomplete = resolve));
    db.close();
  }, "home-test-" + id);
  await page.reload();
  await expect(f.locator("#recovery")).toBeVisible();
  await expect(f.locator("#notice")).toContainText("Export saved draft");
  let download = page.waitForEvent("download");
  await f.locator("#export-saved").click();
  const fs = await import("node:fs/promises");
  const saved = JSON.parse(await fs.readFile(await (await download).path(), "utf8"));
  expect(saved.items[0].label).toBe("");
  expect(Object.values(saved.assets)[0].data).toMatch(/^data:image\/png/);
  await f.locator("#recover").click();
  await expect(f.locator("#recovery")).toBeHidden();
  await expect(f.locator("#export-original")).toBeVisible();
  // Push the replaced draft out of the short revision history; its artwork must survive collection.
  frame = page.frames().find((f) => f.url().includes("/home/index.html"));
  await frame.evaluate(async () => {
    for (let i = 0; i < 12; i++)
      await HomeDesigner.persistence.save(HomeDesigner.store.project, {
        session: "test",
        roots: [],
      });
  });
  download = page.waitForEvent("download");
  await f.locator("#export-original").click();
  const kept = JSON.parse(await fs.readFile(await (await download).path(), "utf8"));
  expect(kept.items[0].label).toBe("");
  expect(Object.values(kept.assets)[0].data).toMatch(/^data:image\/png/);
  // A second recovery would not be retained: it asks for an export first.
  await frame.evaluate(() => {
    document.getElementById("recovery").hidden = false;
  });
  await f.locator("#recover").click();
  await expect(f.locator("#notice")).toContainText("already retained");
});

test("A Home page that fails to load leaves Meters running and says so", async ({
  page,
}) => {
  await page.route("**/designer/home/index.html*", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto(DESIGNER_URL + "?test=1&db=" + crypto.randomUUID());
  await expect(page.locator("#designer-mode")).toBeEnabled();
  await page.locator("#designer-mode").selectOption("home");
  await expect(page.locator("#status")).toContainText("Could not switch designer");
  await expect(page.locator("#designer-mode")).toHaveValue("meters");
  await expect(page.locator("#canvas")).toBeVisible();
  await page.goto(DESIGNER_URL + "?mode=home&test=1&db=" + crypto.randomUUID());
  await expect(page.locator("#notice")).toBeVisible();
  await expect(page.locator("#status")).toContainText("Could not switch designer");
  await expect(page.locator("#designer-mode")).toHaveValue("meters");
  await expect(page.locator("#canvas")).toBeVisible();
});

test("Home WebP and multi-item artwork, refused coordinates and Backspace", async ({
  page,
}) => {
  const f = await open(page);
  const frame = page.frames().find((f) => f.url().includes("/home/index.html"));
  await f.locator("#items .choose").nth(0).click();
  await f.locator("#items .choose").nth(1).click({ modifiers: ["Shift"] });
  const webp = Buffer.from(
    await frame.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = c.height = 16;
      c.getContext("2d").fillRect(0, 0, 16, 16);
      return c.toDataURL("image/webp").split(",")[1];
    }),
    "base64",
  );
  await f.locator("#normal").setInputFiles({ name: "i.webp", mimeType: "image/webp", buffer: webp });
  await expect
    .poll(() =>
      frame.evaluate(() => {
        const [a, b] = HomeDesigner.store.project.items;
        return a.normal !== null && a.normal === b.normal;
      }),
    )
    .toBe(true);
  await f.locator("#normal").setInputFiles({ name: "i.gif", mimeType: "image/gif", buffer: webp });
  await expect(f.locator("#notice")).toContainText("Choose PNG/JPEG/WEBP up to 8 MiB");
  await f.locator("#items .choose").nth(0).click();
  const x = await f.locator("#x").inputValue();
  await f.locator("#x").fill("");
  await f.locator("#x").press("Tab");
  await expect(f.locator("#notice")).toContainText("Enter a number");
  await expect(f.locator("#x")).toHaveValue(x);
  await f.locator("#items .choose").nth(0).click();
  await f.locator("#items .choose").nth(0).press("Backspace");
  await expect(f.locator("#items .choose")).toHaveCount(4);
});

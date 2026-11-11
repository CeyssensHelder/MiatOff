import { test, expect } from "@playwright/test";
import { DESIGNER_URL } from "./config.mjs";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));

test("preview keeps a usable canvas on desktop and phone, including 100% zoom", async ({
  page,
}) => {
  await page.goto(
    DESIGNER_URL + "?test=1&db=preview-" +
      crypto.randomUUID(),
  );
  await page.waitForFunction(() => !!window.__studio);
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const zoom of ["fit", "100"]) {
      await page.getByLabel("Canvas zoom").selectOption(zoom);
      const before = await page.evaluate(() =>
        JSON.stringify(__studio.store.project),
      );
      await page.locator("#preview").click();
      await expect
        .poll(() =>
          page.locator("#canvas").evaluate((node) => {
            const r = node.getBoundingClientRect();
            return (
              r.width > 300 &&
              r.height > 180 &&
              r.left >= 0 &&
              r.right <= innerWidth &&
              r.bottom <= innerHeight
            );
          }),
        )
        .toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.locator("#preview")).toHaveText("Preview");
      expect(
        await page.evaluate(() => JSON.stringify(__studio.store.project)),
      ).toBe(before);
      await expect(page.getByLabel("Canvas zoom")).toHaveValue(zoom);
    }
  }
});

test.describe("local builder handoff with a temporary library", () => {
  let server, folder, base, database;
  test.beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), "miatoff-handoff-"));
    database = join(folder, "library.sqlite3");
    server = spawn(
      "python",
      [
        "-u",
        "tools/meters_designer.py",
        "--port",
        "0",
        "--no-browser",
        "--library-db",
        database,
      ],
      { cwd: root, windowsHide: true },
    );
    base = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error("Temporary designer server did not start")),
        10000,
      );
      server.once("error", reject);
      server.stdout.on("data", (data) => {
        const match = String(data).match(
          /Meters Designer: (http:\/\/127\.0\.0\.1:\d+)/,
        );
        if (match) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });
      server.stderr.on("data", () => {});
    });
  });
  test.afterAll(async () => {
    if (server && server.exitCode === null) {
      const ended = new Promise((resolve) => server.once("exit", resolve));
      server.kill();
      await ended;
    }
    if (folder) await rm(folder, { recursive: true, force: true });
  });
  async function open(page) {
    // Sending from another draft asks before removing builder pages; tests answer through these.
    page.dialogLog = [];
    page.dialogAnswer = true;
    page.on("dialog", (dialog) => {
      page.dialogLog.push(dialog.message());
      return page.dialogAnswer ? dialog.accept() : dialog.dismiss();
    });
    await page.goto(
      base + "/designer/index.html?test=1&db=handoff-" + crypto.randomUUID(),
    );
    await page.waitForFunction(() => !!window.__studio);
    return await page.evaluate(
      () => __studio.store.project.themes[0].pages[0].id,
    );
  }
  async function send(page) {
    await page
      .getByRole("button", { name: "Send to MiatOff", exact: true })
      .click();
    await expect(page.locator("#builder-feedback")).toContainText(
      "sent to MiatOff.",
    );
    await expect(page.locator("#builder-feedback")).not.toHaveClass(/error/);
  }

  test("sending and resending syncs every Custom page without modifying the browser draft", async ({
    page,
    request,
  }) => {
    const id = await open(page);
    await page.evaluate(() => __studio.flush());
    const before = await page.evaluate(() => ({
      document: JSON.stringify(__studio.store.project),
      undo: __studio.store.undoStack.length,
      revision: __studio.persistence.revision,
    }));
    await send(page);
    await send(page);
    await expect(page.locator("#builder-feedback")).toContainText(
      "All 2 Custom pages sent",
    );
    const rows = (
      await (await request.get(base + "/api/builder/pages")).json()
    ).themes.filter((row) => row.name === "DRIVE");
    expect(rows).toHaveLength(1);
    expect(rows[0].pages).toBe(1);
    expect(rows[0].selected).toBe(1);
    expect(
      await page.evaluate(() => ({
        document: JSON.stringify(__studio.store.project),
        undo: __studio.store.undoStack.length,
        revision: __studio.persistence.revision,
      })),
    ).toEqual(before);
    // Simulate the desktop checkbox using its actual repository API, never the live library.
    const result = spawnSync(
      "python",
      [
        "-c",
        "import sys;sys.path.insert(0,'tools');from meters_library import PageLibrary;PageLibrary(sys.argv[1]).select([])",
        database,
      ],
      { cwd: root, windowsHide: true },
    );
    expect(result.status, String(result.stderr)).toBe(0);
    await page.evaluate(() =>
      __studio.command("Rename", (p) => {
        p.themes[0].pages[0].name = "Updated custom page";
      }),
    );
    await send(page);
    const updated = (
      await (await request.get(base + "/api/builder/pages")).json()
    ).themes.find((row) => row.id === rows[0].id);
    expect(updated.name).toBe("Updated custom page");
    expect(updated.selected).toBe(0);
  });

  test("phone handoff, image round trip and read-only multi-page preview", async ({
    page,
    context,
    request,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const id = await open(page);
    await page.evaluate(() =>
      __studio.command("Synthetic image background", (p) => {
        const canvas = document.createElement("canvas");
        canvas.width = 20;
        canvas.height = 10;
        const c = canvas.getContext("2d");
        c.fillStyle = "#234567";
        c.fillRect(0, 0, 20, 10);
        p.assets.synthetic = {
          data: canvas.toDataURL("image/png"),
          width: 20,
          height: 10,
        };
        Object.assign(p.themes[0].background, {
          kind: "image",
          asset: "synthetic",
        });
      }),
    );
    const before = await page.evaluate(() =>
      JSON.stringify(__studio.store.project),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await send(page);
    const saved = (
      await (await request.get(base + "/api/builder/pages")).json()
    ).themes.find((row) => row.name === "DRIVE");
    const snapshot = await (
      await request.get(base + "/api/builder/pages/" + saved.id)
    ).json();
    expect(Object.keys(snapshot.assets)).toEqual(["synthetic"]);
    expect(snapshot.assets.synthetic.width).toBe(20);
    const preview = await context.newPage();
    preview.on("pageerror", (error) => errors.push(error.message));
    await preview.goto(base + "/designer/preview.html?theme=" + saved.id);
    await expect(preview.locator("#preview-title")).toHaveText("DRIVE");
    await expect(preview.locator("#preview-status")).toContainText(
      "never edits your browser draft",
    );
    expect(await preview.locator("#preview-page option").count()).toBe(1);

    await preview.locator("#preview-mode").selectOption("day");
    await preview.locator("#preview-play").click();
    await expect(preview.locator("#preview-state")).toHaveText(
      "Simulated · Playing",
    );
    await preview.locator("#preview-scenario").selectOption("missing");
    await preview.locator("#preview-play").click();
    await expect(preview.locator("#preview-state")).toHaveText(
      "Simulated · Paused",
    );
    const painted = await preview
      .locator("#canvas")
      .evaluate(
        (node) => node.getContext("2d").getImageData(400, 200, 1, 1).data[3],
      );
    expect(painted).toBe(255);
    expect(
      await page.evaluate(() => JSON.stringify(__studio.store.project)),
    ).toBe(before);
    expect(errors).toEqual([]);
  });

  test("Send includes pages from every former group and removes a deleted page from the active builder list", async ({
    page,
    request,
  }) => {
    await open(page);
    const last = await page.evaluate(async () => {
      const M = await import("./v3/model.mjs");
      __studio.command("Older grouped project", (p) =>
        p.themes.push(M.starter("Neon")),
      );
      return __studio.store.project.themes[1].pages[1].id;
    });
    await send(page);
    const before = (
      await (await request.get(base + "/api/builder/pages")).json()
    ).themes;
    expect(before).toHaveLength(4);
    expect(before.every((row) => row.pages === 1)).toBe(true);
    await page.locator("#pages").selectOption(last);
    await page.locator("#pagedel").click();
    await send(page);
    expect(
      (await (await request.get(base + "/api/builder/pages")).json()).themes,
    ).toHaveLength(3);
  });

  test("failed send keeps the draft and gives an actionable retry message", async ({
    page,
  }) => {
    await open(page);
    const before = await page.evaluate(() =>
      JSON.stringify(__studio.store.project),
    );
    await page.route("**/api/builder/pages", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Library storage is full. Export a backup and free space.",
        }),
      }),
    );
    await page
      .getByRole("button", { name: "Send to MiatOff", exact: true })
      .click();
    await expect(page.locator("#builder-feedback")).toHaveClass(/error/);
    await expect(page.locator("#builder-feedback")).toContainText(
      "Library storage is full",
    );
    await expect(page.locator("#builder-feedback")).toContainText(
      "draft is unchanged",
    );
    expect(
      await page.evaluate(() => JSON.stringify(__studio.store.project)),
    ).toBe(before);
    await expect(page.locator("#send-builder")).toBeEnabled();
  });

  test("saved preview errors are clear and do not open a blank editor draft", async ({
    page,
  }) => {
    await page.goto(base + "/designer/preview.html?theme=missing-theme");
    await expect(page.locator("#preview-status")).toHaveClass(/error/);
    await expect(page.locator("#preview-status")).toContainText(
      "Re-send the theme",
    );
    await expect(page.locator("#preview-play")).toBeDisabled();
    expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  });

  test("sending from a different draft asks before it removes builder pages, and cancel changes nothing", async ({
    page,
    context,
    request,
  }) => {
    const listPages = async () =>
      (await (await request.get(base + "/api/builder/pages")).json()).themes;
    await open(page); // draft A
    await send(page);
    const draftA = (await listPages()).map((row) => row.name).sort();
    expect(draftA).toContain("DRIVE");
    const idsA = (await listPages()).map((row) => row.id).sort();
    page.dialogLog.length = 0;
    await send(page); // same draft again: nothing to remove, no question
    expect(page.dialogLog).toEqual([]);

    const other = await context.newPage(); // draft B: fresh storage, new page ids
    await open(other);
    await other.evaluate(() =>
      __studio.command("Name draft B", (p) => {
        p.themes[0].pages[0].name = "Draft B page";
      }),
    );
    const draftBBefore = await other.evaluate(() =>
      JSON.stringify(__studio.store.project),
    );
    // Dismiss: nothing is sent, the builder list is unchanged, the draft is unchanged.
    other.dialogAnswer = false;
    await other
      .getByRole("button", { name: "Send to MiatOff", exact: true })
      .click();
    await expect(other.locator("#builder-feedback")).toContainText(
      "cancelled",
    );
    await expect(other.locator("#builder-feedback")).not.toHaveClass(/error/);
    expect(other.dialogLog).toHaveLength(1);
    expect(other.dialogLog[0]).toContain("Sending will remove");
    for (const name of draftA) expect(other.dialogLog[0]).toContain(name);
    expect(other.dialogLog[0]).toContain("Removed pages");
    expect((await listPages()).map((row) => row.id).sort()).toEqual(idsA);
    expect(
      await other.evaluate(() => JSON.stringify(__studio.store.project)),
    ).toBe(draftBBefore);
    await expect(other.locator("#send-builder")).toBeEnabled();

    // Accept: draft A's pages are retired (not deleted) and draft B's are in the list.
    other.dialogAnswer = true;
    await send(other);
    const after = await listPages();
    expect(after.map((row) => row.name)).toContain("Draft B page");
    for (const id of idsA) expect(after.map((row) => row.id)).not.toContain(id);
    const retired = spawnSync(
      "python",
      [
        "-c",
        "import sys,json;sys.path.insert(0,'tools');from meters_library import PageLibrary;print(json.dumps([r['id'] for r in PageLibrary(sys.argv[1]).list_retired()]))",
        database,
      ],
      { cwd: root, windowsHide: true },
    );
    expect(retired.status, String(retired.stderr)).toBe(0);
    const retiredIds = JSON.parse(String(retired.stdout));
    for (const id of idsA) expect(retiredIds).toContain(id);
  });

  test("a direct POST that would remove pages is refused unless the exact ids are confirmed", async ({
    page,
    request,
  }) => {
    await open(page);
    await send(page);
    const session = await (await request.get(base + "/api/builder/session")).json();
    const before = (await (await request.get(base + "/api/builder/pages")).json())
      .themes;
    // A different draft, posted without confirmation (what an older client would do).
    const otherDraft = await (async () => {
      const other = await page.context().newPage();
      await open(other);
      const doc = await other.evaluate(async () => {
        const { builderSnapshot } = await import("./v3/builder.mjs");
        return builderSnapshot(__studio.store.project);
      });
      await other.close();
      return doc;
    })();
    const headers = {
      "Content-Type": "application/json",
      Origin: base,
      "X-MiatOff-Token": session.token,
    };
    const refused = await request.post(base + "/api/builder/pages", {
      headers,
      data: otherDraft,
    });
    expect(refused.status()).toBe(409);
    const body = await refused.json();
    expect(body.removed.map((item) => item.id).sort()).toEqual(
      before.map((row) => row.id).sort(),
    );
    const wrong = await request.post(base + "/api/builder/pages", {
      headers: { ...headers, "X-MiatOff-Confirm-Removal": "screen-unknown" },
      data: otherDraft,
    });
    expect(wrong.status()).toBe(409);
    expect(
      (await (await request.get(base + "/api/builder/pages")).json()).themes.map(
        (row) => row.id,
      ),
    ).toEqual(before.map((row) => row.id));
    const planned = await request.post(base + "/api/builder/pages/plan", {
      headers,
      data: otherDraft,
    });
    expect(planned.status()).toBe(200);
    expect((await planned.json()).removed).toHaveLength(before.length);
    const bad = await request.post(base + "/api/builder/pages/plan", {
      headers: { ...headers, "X-MiatOff-Token": "wrong" },
      data: otherDraft,
    });
    expect(bad.status()).toBe(403);
  });
});

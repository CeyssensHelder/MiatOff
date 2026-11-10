import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../../designer/home/model.mjs";
import { CommandStore } from "../../designer/shared/commands.mjs";
test("Home migrations, asset references, independent order and transactional history", () => {
  const p = M.defaults();
  assert.equal(p.kind, "HomeMenuDocument");
  const order = [...p.order];
  const store = new CommandStore(
    p,
    { selection: [p.items[0].id] },
    { validate: M.validate },
  );
  store.command("resize", (p) => {
    p.items[0].w = 140;
    p.items.reverse();
  });
  assert.deepEqual(store.project.order, order);
  assert.equal(store.project.items.at(-1).w, 140);
  store.undo();
  assert.equal(store.project.items[0].w, 120);
  store.redo();
  assert.equal(store.project.items.at(-1).w, 140);
  assert.throws(() =>
    store.command("invalid", (p) => (p.items[0].opens = "javascript:alert(1)")),
  );
  assert.equal(store.project.items[0].opens, "settings");
  const legacy = globalThis.MiatOffMenu.defaults();
  const migrated = M.migrate(legacy);
  assert.equal(migrated.items[0].w, 120);
  assert.deepEqual(
    migrated.order,
    legacy.items.map((w) => w.id),
  );
  const v1 = {
    version: 1,
    layout: "row",
    background: "#17191d",
    accent: "#e04b46",
    items: legacy.items.map((w) => ({ id: w.id, label: w.label })),
  };
  assert.equal(M.migrate(v1).items[0].opens, "applications");
  assert.throws(() => M.migrate({ version: 3, kind: "MetersSetup" }));
  const bad = M.defaults();
  bad.order[0] = bad.order[1];
  assert.throws(() => M.validate(bad));
});
test("WebP dimensions are read from the header before decoding, and the type message names the limits", async () => {
  const { webpSize, normalizeImage } = await import(
    "../../designer/shared/images.mjs"
  );
  const header = (chunk, fill) => {
    const b = new Uint8Array(40);
    b.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
    b.set([..."WEBP"].map((c) => c.charCodeAt(0)), 8);
    b.set([...chunk].map((c) => c.charCodeAt(0)), 12);
    fill(b);
    return b;
  };
  // Extended: 24-bit width-1 and height-1.
  const vp8x = header("VP8X", (b) => {
    b.set([0x3f, 0x1f, 0x00], 24); // 7999 + 1
    b.set([0xdf, 0x01, 0x00], 27); // 479 + 1
  });
  assert.deepEqual(webpSize(vp8x), { width: 8000, height: 480 });
  // Lossy: start code, then 14-bit width and height.
  const vp8 = header("VP8 ", (b) => {
    b.set([0x9d, 0x01, 0x2a, 0x20, 0x03, 0xe0, 0x01], 23);
  });
  assert.deepEqual(webpSize(vp8), { width: 800, height: 480 });
  // Lossless: signature, then 14-bit width-1 and height-1 packed.
  const bits = 127 | (63 << 14);
  const vp8l = header("VP8L", (b) => {
    b[20] = 0x2f;
    b.set([bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, bits >>> 24], 21);
  });
  assert.deepEqual(webpSize(vp8l), { width: 128, height: 64 });
  assert.deepEqual(webpSize(new Uint8Array(40)), { width: 0, height: 0 });
  await assert.rejects(
    normalizeImage({ type: "image/gif", size: 1 }, {
      types: ["image/png", "image/jpeg", "image/webp"],
      maxBytes: 8388608,
    }),
    /Choose PNG\/JPEG\/WEBP up to 8 MiB/,
  );
  await assert.rejects(
    normalizeImage({ type: "image/gif", size: 1 }),
    /Choose PNG\/JPEG up to 10 MiB/,
  );
});

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

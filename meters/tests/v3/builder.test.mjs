import test from "node:test";
import assert from "node:assert/strict";
import {
  removalMessage,
  sendToBuilder,
  SendCancelled,
} from "../../designer/v3/builder.mjs";

function fakeServer(removed) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, headers: options.headers || {} });
    const reply = (body, status = 200) => ({
      ok: status < 400,
      status,
      json: async () => body,
    });
    if (url === "/api/builder/session")
      return reply({
        service: "MiatOffDesigner",
        protocol: 2,
        token: "t",
        testLibrary: true,
      });
    if (url === "/api/builder/pages/plan") return reply({ pages: 1, removed });
    return reply({ pages: 1, changed: true });
  };
  return calls;
}

test("the removal question names the pages and says they can be restored", () => {
  const text = removalMessage([
    { id: "a", name: "My page 1" },
    { id: "b", name: "My page 2" },
  ]);
  assert.match(text, /remove 2 pages from the MiatOff builder list: My page 1, My page 2\./);
  assert.match(text, /kept in Removed pages and can be restored there\. Continue\?/);
  assert.match(removalMessage([{ id: "a", name: "Only" }]), /remove 1 page from/);
  assert.match(
    removalMessage(Array.from({ length: 9 }, (_, i) => ({ id: "" + i, name: "P" + i }))),
    /and 3 more/,
  );
});

test("nothing to remove: no question, and no confirmation header", async () => {
  const calls = fakeServer([]);
  await sendToBuilder({}, { confirmRemoval: () => assert.fail("asked") });
  const post = calls.at(-1);
  assert.equal(post.url, "/api/builder/pages");
  assert.equal(post.headers["X-MiatOff-Confirm-Removal"], undefined);
});

test("declining the removal sends nothing", async () => {
  const calls = fakeServer([{ id: "a", name: "A" }]);
  await assert.rejects(
    sendToBuilder({}, { confirmRemoval: async () => false }),
    (error) => error instanceof SendCancelled && error.cancelled === true,
  );
  assert.deepEqual(
    calls.map((c) => c.url),
    ["/api/builder/session", "/api/builder/pages/plan"],
  );
});

test("accepting the removal sends the exact ids", async () => {
  const calls = fakeServer([
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ]);
  await sendToBuilder({}, { confirmRemoval: async () => true });
  assert.equal(calls.at(-1).headers["X-MiatOff-Confirm-Removal"], "a,b");
});

test("with no confirmation callback a removing send is cancelled", async () => {
  fakeServer([{ id: "a", name: "A" }]);
  await assert.rejects(sendToBuilder({}), SendCancelled);
});

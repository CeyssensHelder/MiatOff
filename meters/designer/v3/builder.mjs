// SPDX-License-Identifier: GPL-3.0-or-later
import { setupDocument } from "./exports.mjs";
import { clone } from "./model.mjs";
import { allPages } from "./pages.mjs";

export function builderSnapshot(project) {
  const snapshot = clone(
    setupDocument({
      ...project,
      library: [],
    }),
  );
  for (const { page, name } of allPages(snapshot)) page.name = name;
  return snapshot;
}

export function removalMessage(removed) {
  const names = removed.map((item) => item.name || "Untitled page");
  const shown = names.slice(0, 6).join(", ");
  const more = names.length > 6 ? `, and ${names.length - 6} more` : "";
  const count = names.length === 1 ? "1 page" : `${names.length} pages`;
  return (
    `Sending will remove ${count} from the MiatOff builder list: ${shown}${more}. ` +
    "They are kept in Removed pages and can be restored there. Continue?"
  );
}

export class SendCancelled extends Error {
  constructor() {
    super(
      "Sending was cancelled. Nothing was changed in the MiatOff builder or your draft.",
    );
    this.cancelled = true;
  }
}

// `confirmRemoval(removed)` is asked only when the send would remove builder pages that this
// draft does not contain (another browser, a new project, a restored revision). The server
// works out which pages those are; the editor does not guess page IDs itself.
async function connect(requireTestLibrary) {
  const session = await fetch("/api/builder/session", {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!session.ok)
    throw Error(
      "Restart MiatOff and reopen Meters Designer to enable the builder connection.",
    );
  const connection = await session.json();
  if (
    connection.service !== "MiatOffDesigner" ||
    connection.protocol !== 2 ||
    !connection.token
  )
    throw Error(
      "This server does not support sending themes to MiatOff builder.",
    );
  if (requireTestLibrary && !connection.testLibrary)
    throw Error("Test drafts can only send to a temporary test library.");
  return connection;
}

// The car chosen in the car setup, for the built-in Meters styles on the stick. The builder keeps the
// latest one; the payload carries it as js/car-profile.js.
export async function sendCarProfile(vehicle, label, { requireTestLibrary = false } = {}) {
  const connection = await connect(requireTestLibrary);
  const response = await fetch("/api/builder/car", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MiatOff-Token": connection.token,
    },
    body: JSON.stringify({ vehicle, label: String(label ?? "").slice(0, 60) }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok)
    throw Error(result.error || "The builder could not save the car.");
  return result;
}

export async function sendToBuilder(
  setup,
  { requireTestLibrary = false, confirmRemoval = async () => false } = {},
) {
  const connection = await connect(requireTestLibrary);
  const post = (path, extra = {}) =>
    fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MiatOff-Token": connection.token,
        ...extra,
      },
      body: JSON.stringify(setup),
      signal: AbortSignal.timeout(15000),
    });
  const planned = await post("/api/builder/pages/plan");
  const plan = await planned.json();
  if (!planned.ok)
    throw Error(plan.error || "The builder could not check this theme.");
  const removed = plan.removed || [];
  if (removed.length && !(await confirmRemoval(removed)))
    throw new SendCancelled();
  const response = await post(
    "/api/builder/pages",
    removed.length
      ? { "X-MiatOff-Confirm-Removal": removed.map((item) => item.id).join(",") }
      : {},
  );
  const result = await response.json();
  if (response.status === 409)
    throw Error(
      "The builder list changed while you were deciding. Press Send again to review the new list.",
    );
  if (!response.ok)
    throw Error(result.error || "The builder could not save this theme.");
  return result;
}

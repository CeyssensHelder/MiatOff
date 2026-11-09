import * as P from "./presentation.mjs";
import { Inspector } from "./inspector.mjs";
import { Workspace } from "./workspace.mjs";
import * as E from "./exports.mjs";
import { allPages, addPage, pageFromStarter, pageSnapshot } from "./pages.mjs";
import {
  builderSnapshot,
  sendToBuilder,
  removalMessage,
} from "./builder.mjs";
// SPDX-License-Identifier: GPL-3.0-or-later
import * as M from "./model.mjs";
import { CommandStore, snapshot } from "./commands.mjs";
import {
  Persistence,
  decodeAssets,
  normalizeImage,
  DraftConflict,
} from "./persistence.mjs";
import * as L from "./layout.mjs";
import * as R from "./renderer.mjs";
import { Simulator } from "./simulation.mjs";
const $ = (s) => document.getElementById(s),
  testMode = new URLSearchParams(location.search).get("test") === "1";
const namespace = testMode
    ? "studio-test-" +
      (new URLSearchParams(location.search).get("db") ?? crypto.randomUUID())
    : "miatoff-studio",
  persistence = new Persistence(namespace),
  session = M.id("session"),
  channel = new BroadcastChannel(namespace + "-changes");
let store,
  recovery = false,
  conflict = false,
  rawBackup = null,
  saveTimer,
  saveChain = Promise.resolve(),
  dirty = false,
  saving = false,
  mode = "night",
  preview = false,
  issues = [],
  measurements = [],
  drag = null,
  clipboard = null,
  styleClipboard = null,
  arrangement = null,
  raf = 0,
  lastFrame = 0,
  lastGallery = 0,
  bgDrag = false,
  uploadTarget = null,
  recordingFile = null,
  editGeneration = 0,
  alignmentGuides = [],
  lastPersistedRecording = null,
  renderStats = { frames: 0, galleryFrames: 0 };
const sim = new Simulator(),
  canvas = $("canvas"),
  ctx = canvas.getContext("2d");
let ui, editorInspector;
let restoreInputs = false;
function status(text, error = false) {
  if (error && /Save failed/.test(text)) ui?.saveStatus(text, true);
  else if (
    /^(Opening draft|Saved |Saving|Unsaved changes|Newer edits)/.test(text)
  )
    ui?.saveStatus(text, error);
  else ui?.notify(text, error);
}
function theme() {
  return (
    store.project.themes.find((t) =>
      t.pages.some((p) => p.id === store.view.pageId),
    ) ??
    store.project.themes.find((t) => t.id === store.view.themeId) ??
    store.project.themes[0]
  );
}
function page() {
  return (
    theme().pages.find((p) => p.id === store.view.pageId) ?? theme().pages[0]
  );
}
function renderTheme() {
  return M.pageTheme(theme(), page());
}
function activeBackground() {
  return mode === "day"
    ? (page().dayBackground ?? theme().dayBackground ?? theme().background)
    : (page().background ?? theme().background);
}
function selected() {
  return page().widgets.filter((w) => store.view.selection.includes(w.id));
}
function locked(w) {
  return (
    w.locked ||
    page().groups.some((g) => g.locked && g.widgetIds.includes(w.id))
  );
}
function movable() {
  return selected().filter((w) => !locked(w));
}
function normalizeView() {
  store.view.themeId = theme().id;
  store.view.pageId = page().id;
  store.view.selection = (store.view.selection ?? []).filter((k) =>
    page().widgets.some((w) => w.id === k),
  );
}
function attach(project) {
  store = new CommandStore(project, {
    themeId: project.initialTheme,
    pageId: project.themes.find((t) => t.id === project.initialTheme)?.pages[
      project.initialPage ?? 0
    ]?.id,
    selection: [],
  });
  normalizeView();
  store.subscribe((_store, { changed }) => {
    normalizeView();
    if (changed) {
      dirty = true;
      editGeneration++;
      requestSave();
    }
    update();
  });
  update();
}
function command(name, fn, { inline = false } = {}) {
  if (recovery || conflict) {
    status("Resolve recovery/conflict before editing", true);
    return;
  }
  try {
    return store.command(name, () => fn(store.project, store.view));
  } catch (e) {
    restoreInputs = true;
    inspector();
    restoreInputs = false;
    if (inline) ui.lastError = e.message;
    else status(e.message, true);
  }
}
function requestSave() {
  if (recovery || conflict) return;
  clearTimeout(saveTimer);
  status("Unsaved changes");
  saveTimer = setTimeout(() => flushSave(), 500);
}
async function flushSave(checkpoint = null) {
  clearTimeout(saveTimer);
  if (recovery || conflict) return;
  const generation = editGeneration,
    project = snapshot(store.project);
  project.initialTheme = theme().id;
  project.initialPage = theme().pages.findIndex((p) => p.id === page().id);
  saveChain = saveChain
    .catch(() => {})
    .then(async () => {
      saving = true;
      status("Saving…");
      try {
        await persistence.save(project, {
          session,
          checkpoint,
          roots: store.assetRoots(),
        });
        dirty = generation !== editGeneration;
        status(
          dirty
            ? "Newer edits waiting to save"
            : "Saved " + new Date().toLocaleTimeString(),
        );
        channel.postMessage({ revision: persistence.revision, session });
      } catch (e) {
        if (e instanceof DraftConflict) {
          conflict = true;
          showRecovery(e.message, store.project, true);
        }
        status("Save failed: " + e.message, true);
      } finally {
        saving = false;
      }
    });
  await saveChain;
}
channel.onmessage = (e) => {
  if (e.data.session !== session && e.data.revision > persistence.revision) {
    conflict = true;
    showRecovery(
      "Another tab saved a newer revision. Autosave is paused.",
      store.project,
      true,
    );
  }
};
window.addEventListener("beforeunload", (e) => {
  if (dirty || saving) {
    e.preventDefault();
    e.returnValue = "";
  }
});
function download(value, name, type = "application/json") {
  const blob =
      value instanceof Blob
        ? value
        : new Blob(
            [
              typeof value === "string"
                ? value
                : JSON.stringify(value, null, 2),
            ],
            { type },
          ),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function button(parent, text, action) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.onclick = action;
  parent.append(b);
  return b;
}
async function revisions(parent) {
  try {
    const original = await persistence.originalSource();
    if (original) {
      button(parent, "Export pre-migration original", () =>
        download(original, "meters-pre-v3-original.json"),
      );
      button(parent, "Restore original", async () => {
        try {
          const generation = editGeneration,
            p = M.validate(await decodeAssets(M.migrate(original)));
          if (generation !== editGeneration)
            throw Error("Project changed while decoding; retry restoration");
          command("Restore original", () => {
            store.project = p;
            store.view = {
              themeId: p.initialTheme,
              pageId: p.themes.find((t) => t.id === p.initialTheme).pages[
                p.initialPage
              ].id,
              selection: [],
            };
          });
        } catch (e) {
          status("Restore failed: " + e.message, true);
        }
      });
    }
    const rows = await persistence.revisions();
    if (!rows.length) return;
    const s = document.createElement("select");
    s.setAttribute("aria-label", "Recovery revision");
    rows.forEach((r) =>
      s.add(
        new Option(
          (r.name ?? "Autosave") + " · " + new Date(r.savedAt).toLocaleString(),
          r.key,
        ),
      ),
    );
    parent.append(s);
    const remove = button(parent, "Delete named checkpoint", async () => {
      try {
        if (
          !confirm(
            "Delete this named checkpoint? The current draft is retained.",
          )
        )
          return;
        await persistence.deleteCheckpoint(Number(s.value), store.assetRoots());
        parent.replaceChildren();
        await revisions(parent);
        status("Checkpoint deleted");
      } catch (e) {
        status(e.message, true);
      }
    });
    const reflect = () =>
      (remove.disabled = !rows.find((r) => r.key === Number(s.value))?.name);
    s.onchange = reflect;
    reflect();

    button(parent, "Restore selected revision", async () => {
      try {
        const p = M.validate(
          await decodeAssets(
            M.migrate(await persistence.restore(Number(s.value))),
          ),
        );
        await persistence.prepareReplacement();
        recovery = conflict = false;
        $("recovery").hidden = true;
        attach(p);
        await flushSave();
      } catch (e) {
        status(e.message, true);
      }
    });
  } catch (e) {
    status(e.message, true);
  }
}
async function showRecovery(message, original, isConflict = false) {
  recovery = !isConflict;
  clearTimeout(saveTimer);
  const box = $("recovery");
  box.hidden = false;
  box.replaceChildren();
  const p = document.createElement("p");
  p.textContent = message;
  box.append(p);
  button(box, "Retry / reload latest", () => location.reload());
  button(box, "Export original / local work", () =>
    download(original ?? rawBackup, "meters-recovery.json"),
  );
  button(box, "Start a new project", async () => {
    if (!confirm("Export the original and start a new project?")) return;
    if (original) download(original, "meters-original.json");
    try {
      await persistence.prepareReplacement();
      recovery = conflict = false;
      box.hidden = true;
      attach(M.defaults());
      await flushSave();
    } catch (e) {
      status(e.message, true);
    }
  });
  await revisions(box);
}
async function boot() {
  try {
    const loaded = await persistence.load();
    rawBackup = loaded?.raw;
    const p = loaded
      ? M.validate(await decodeAssets(M.migrate(loaded.raw)))
      : M.defaults();
    attach(p);
    if (!loaded || loaded.legacy || loaded.raw.version < 3) await flushSave();
    else
      status(
        "Saved " + new Date(loaded.savedAt ?? Date.now()).toLocaleTimeString(),
      );
  } catch (e) {
    recovery = true;
    attach(M.defaults());
    showRecovery(
      "Draft recovery required: " + e.message,
      rawBackup ?? persistence.lastRaw,
    );
    status("Original draft has not been overwritten", true);
  }
  await Promise.all(
    M.fonts.filter((font) => font !== "Arial").map((font) =>
      document.fonts.load(`18px "${font}"`),
    ),
  );
  await document.fonts.ready;
  invalidate();
}
function options(el, items, value) {
  const key = JSON.stringify(items);
  if (el.dataset.items !== key) {
    el.replaceChildren();
    items.forEach(([v, n]) => el.add(new Option(n, v)));
    el.dataset.items = key;
  }
  if (document.activeElement !== el) el.value = value;
}

function inspector() {
  if (!editorInspector) return;
  const panel = document.querySelector(".inspector-panel"),
    scroll = panel.scrollTop,
    context =
      ui.scope +
      ":" +
      ui.level +
      ":" +
      selected()
        .map((w) => w.id)
        .join();
  ui.refresh();
  editorInspector.render();
  if (editorInspector.lastContext === context) panel.scrollTop = scroll;
  editorInspector.lastContext = context;
}
function diagnostics() {
  issues = L.preflight(ctx, theme(), page(), sim.state, mode, R.renderWidget);
  const lum = (rgb) =>
      rgb
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0),
    hex = (s) =>
      lum(
        s
          .slice(1)
          .match(/../g)
          .map((v) => parseInt(v, 16)),
      );
  const bg = activeBackground(),
    sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = 800;
  sampleCanvas.height = 480;
  const sample = sampleCanvas.getContext("2d", { willReadFrequently: true });
  R.drawBackground(sample, bg, store.project.assets, mode);
  for (const w of page().widgets) {
    if (w.hidden) continue;
    const m = L.measurement(ctx, w, renderTheme(), sim.state, mode),
      s = m.style;
    let backgrounds = [hex(s.panelColor)],
      advisory = false;
    if (m.effect === "flat") {
      const r = m.content;
      advisory = [
        "image",
        "linear",
        "radial",
        "grid",
        "carbon",
        "noise",
      ].includes(bg.kind);
      backgrounds = [
        [r.x, r.y],
        [r.x + r.w, r.y],
        [r.x + r.w / 2, r.y + r.h / 2],
        [r.x, r.y + r.h],
        [r.x + r.w, r.y + r.h],
      ].map(([x, y]) =>
        lum(
          [
            ...sample.getImageData(
              Math.max(0, Math.min(799, Math.round(x))),
              Math.max(0, Math.min(479, Math.round(y))),
              1,
              1,
            ).data,
          ].slice(0, 3),
        ),
      );
    }
    for (const [name, color] of [
      ["value", s.textColor],
      ["caption", s.captionColor],
      ["unit", s.unitColor],
    ]) {
      if (
        (name === "unit" && w.unitPosition !== "separate") ||
        (name === "caption" && w.labelPosition === "hidden")
      )
        continue;
      const light = hex(color);
      if (
        backgrounds.some(
          (back) =>
            (Math.max(light, back) + 0.05) / (Math.min(light, back) + 0.05) < 3,
        )
      )
        issues.push({
          kind: "contrast",
          message: `Low ${name} contrast${advisory ? " (advisory sample of background)" : ""} near ${Math.round(m.content.x)}, ${Math.round(m.content.y)}`,
          widgetIds: [w.id],
        });
    }
  }
  const host = $("layout-report");
  host.replaceChildren();
  ui?.refresh();
  if (!issues.length) {
    host.textContent = "No measured layout issues";
    return;
  }
  for (const issue of issues) {
    const b = button(host, issue.kind + ": " + issue.message, () => {
      store.view.selection = issue.widgetIds;
      $("issues-dialog").close();
      update(false);
    });
    b.className = "issue";
  }
}
function update(check = true) {
  if (store)
    sim.windowLimit = Math.max(
      3,
      ...store.project.themes.flatMap((t) =>
        t.pages.flatMap((p) =>
          p.widgets
            .filter(
              (w) =>
                ["history", "power"].includes(w.type) ||
                (w.type === "number" && w.sparkline),
            )
            .map((w) => w.window),
        ),
      ),
    );
  if (!store) return;
  normalizeView();
  options(
    $("pages"),
    allPages(store.project).map(({ page, name }) => [page.id, name]),
    page().id,
  );
  layers();
  inspector();
  components();
  ui.refresh();
  $("undo").disabled = !store.undoStack.length;
  $("redo").disabled = !store.redoStack.length;
  for (const key of [
    "delete",
    "duplicate",
    "group",
    "copy",
    "copy-style",
    "component-save",
  ])
    $(key).disabled = !selected().length;
  $("group").disabled = selected().length < 2;
  $("group").title = selected().length < 2 ? "Select two or more widgets" : "";
  $("paste").disabled = !clipboard;
  $("paste-style").disabled = !styleClipboard || !selected().length;
  if (check) {
    sim.step(0, store.project.vehicle, { force: true });
    diagnostics();
  }
  invalidate();
}
function layers() {
  const host = $("layers"),
    key = JSON.stringify(
      page().widgets.map((w) => [
        w.id,
        w.label,
        w.locked,
        w.hidden,
        store.view.selection.includes(w.id),
      ]),
    );
  if (host.dataset.key === key) return;
  host.dataset.key = key;
  host.replaceChildren();
  for (const w of [...page().widgets].reverse()) {
    const row = document.createElement("div");
    row.className =
      "layer" + (store.view.selection.includes(w.id) ? " selected" : "");
    button(
      row,
      (locked(w) ? "🔒 " : "") +
        (w.label || P.instrumentNames[w.type]) +
        " · " +
        P.instrumentNames[w.type],
      (e) => select(w.id, e.shiftKey || $("multi-select").checked),
    );
    button(row, w.hidden ? "Show" : "Hide", () =>
      command("Visibility", () => (w.hidden = !w.hidden)),
    );
    host.append(row);
  }
}
function select(key, add = false) {
  const g = page().groups.find((g) => g.widgetIds.includes(key)),
    keys = g ? g.widgetIds : [key];
  if (add) {
    const s = new Set(store.view.selection);
    keys.forEach((k) => (s.has(k) ? s.delete(k) : s.add(k)));
    store.view.selection = [...s];
  } else store.view.selection = keys;
  ui.scope = "widget";
  update(false);
}
function add(type, variant) {
  command("Add widget", () => {
    const w = M.widget(type, variant);
    if (!L.place(w, page()))
      throw Error("No free space. Add a page or resize widgets.");
    page().widgets.push(w);
    store.view.selection = [w.id];
  });
}
const gallery = [];
const observer = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const item = gallery.find((i) => i.canvas === e.target);
    if (item) item.visible = e.isIntersecting;
  }
  invalidate();
});
function card(host, title, draw, action) {
  const b = document.createElement("button"),
    c = document.createElement("canvas");
  c.width = 240;
  c.height = 144;
  b.className = "preview-card";
  b.append(c, document.createTextNode(title));
  b.onclick = action;
  host.append(b);
  gallery.push({ canvas: c, draw, visible: false });
  observer.observe(c);
}
function createPage(name = null, index = 0) {
  const result = command("Add Custom page", () => {
    const p = pageFromStarter(name, index);
    const owner = addPage(store.project, p);
    store.view.themeId = owner.id;
    store.view.pageId = p.id;
    store.view.selection = [];
  });
  if (result !== undefined) $("new-page-dialog").close();
}
function galleries() {
  for (const name of M.names) {
    const source = M.starter(name);
    for (const [index, page] of source.pages.entries()) {
      card(
        $("page-starters"),
        `${name} ${index === 0 ? "driving" : "telemetry"}`,
        (c) => {
          c.save();
          c.scale(0.3, 0.3);
          R.render(c, source, page, {}, sim.state, { mode });
          c.restore();
        },
        () => createPage(name, index),
      );
    }
  }
  let chosen = null;
  const choose = (type) => {
    chosen = { type, variant: M.registry[type].variants[0] };
    $("instrument-choice").hidden = false;
    $("choice-name").textContent = P.instrumentNames[type];
    $("variant-choices").replaceChildren();
    for (const variant of M.registry[type].variants) {
      const b = button($("variant-choices"), variant, () => {
        chosen.variant = variant;
        for (const v of $("variant-choices").children)
          v.setAttribute("aria-pressed", String(v === b));
        invalidate();
      });
      b.setAttribute("aria-pressed", String(variant === chosen.variant));
    }
    for (const b of $("widget-gallery").querySelectorAll("button"))
      b.setAttribute("aria-pressed", String(b.dataset.type === type));
    invalidate();
  };
  for (const [type, def] of Object.entries(M.registry)) {
    const box = document.createElement("div");
    box.className = "library-item";
    box.dataset.search = (
      P.instrumentNames[type] +
      " " +
      type +
      " " +
      def.group
    ).toLowerCase();
    box.dataset.category = def.group;
    $("widget-gallery").append(box);
    const sample = M.widget(type);
    card(
      box,
      P.instrumentNames[type],
      (c) => {
        c.fillStyle = "#101824";
        c.fillRect(0, 0, 240, 144);
        Object.assign(sample, {
          variant: chosen?.type === type ? chosen.variant : def.variants[0],
          x: 0,
          y: 0,
        });
        const scale = Math.min(224 / sample.w, 128 / sample.h);
        c.save();
        c.translate(8, 8);
        c.scale(scale, scale);
        R.renderWidget(
          c,
          sample,
          L.measurement(c, sample, renderTheme(), sim.state, mode),
          sim.state,
        );
        c.restore();
      },
      () => choose(type),
    );
    box.querySelector("button").dataset.type = type;
  }
  const filter = () => {
    let visible = 0;
    for (const box of $("widget-gallery").children) {
      box.hidden =
        !box.dataset.search.includes(
          $("instrument-search").value.trim().toLowerCase(),
        ) ||
        ($("instrument-category").value !== "all" &&
          box.dataset.category !== $("instrument-category").value);
      if (!box.hidden) visible++;
    }
    $("library-empty").hidden = !!visible;
    invalidate();
  };
  $("instrument-search").oninput = filter;
  $("instrument-category").onchange = filter;
  $("add-chosen").onclick = () => {
    if (!chosen) return;
    const before = page().widgets.length;
    add(chosen.type, chosen.variant);
    if (page().widgets.length > before) {
      $("tool-sheet").close();
      ui.scope = "widget";
      inspector();
    }
  };
}
function components() {
  const host = $("components"),
    key = store.project.library.map((c) => c.id + c.name).join();
  if (host.dataset.key === key) return;
  host.dataset.key = key;
  for (let i = gallery.length - 1; i >= 0; i--)
    if (host.contains(gallery[i].canvas)) {
      observer.unobserve(gallery[i].canvas);
      gallery.splice(i, 1);
    }
  host.replaceChildren();
  for (const item of store.project.library) {
    const row = document.createElement("div");
    card(
      row,
      item.name,
      (c) => {
        c.fillStyle = "#101b29";
        c.fillRect(0, 0, 240, 144);
        const b = L.groupBounds(item.widgets),
          scale = Math.min(224 / b.w, 128 / b.h);
        c.save();
        c.translate(8, 8);
        c.scale(scale, scale);
        c.translate(-b.x, -b.y);
        item.widgets.forEach((w) =>
          R.renderWidget(
            c,
            w,
            L.measurement(c, w, renderTheme(), sim.state, mode),
            sim.state,
          ),
        );
        c.restore();
      },
      () => {
        clipboard = { widgets: M.clone(item.widgets) };
        paste();
      },
    );
    const exportButton = button(row, "Export", () =>
      download(
        { version: 3, kind: "MetersComponent", component: item },
        "meters-component.json",
      ),
    );
    const deleteButton = button(row, "Delete", () =>
      command(
        "Delete component",
        () =>
          (store.project.library = store.project.library.filter(
            (c) => c.id !== item.id,
          )),
      ),
    );
    exportButton.dataset.minDetail = deleteButton.dataset.minDetail = "2";
    host.append(row);
  }
}
function copy() {
  if (!selected().length) return;
  clipboard = { widgets: M.clone(selected()) };
  update(false);
}
function paste() {
  if (!clipboard) return;
  command("Paste widgets", () => {
    if (page().widgets.length + clipboard.widgets.length > 24)
      throw Error("Maximum 24 widgets");
    const ws = M.clone(clipboard.widgets),
      bounds = L.groupBounds(ws),
      target = {
        id: M.id("candidate"),
        ...bounds,
        hidden: false,
        role: "content",
      };
    if (!L.place(target, page()))
      throw Error("No free space for this selection");
    ws.forEach((w) => {
      w.id = M.id("widget");
      w.x += target.x - bounds.x;
      w.y += target.y - bounds.y;
      w.locked = false;
    });
    page().widgets.push(...ws);
    if (ws.length > 1)
      page().groups.push({
        id: M.id("group"),
        name: "Component copy",
        locked: false,
        widgetIds: ws.map((w) => w.id),
      });
    store.view.selection = ws.map((w) => w.id);
  });
}
function remove() {
  command("Delete widgets", () => {
    const removed = new Set(movable().map((w) => w.id));
    page().widgets = page().widgets.filter((w) => !removed.has(w.id));
    page().groups = page()
      .groups.map((g) => ({
        ...g,
        widgetIds: g.widgetIds.filter((k) => !removed.has(k)),
      }))
      .filter((g) => g.widgetIds.length);
    page().overlaps = page().overlaps.filter(
      (p) => !removed.has(p.a) && !removed.has(p.b),
    );
    store.view.selection = [];
  });
}
function clonePage(p) {
  const result = M.clone(p),
    ids = new Map(result.widgets.map((w) => [w.id, M.id("widget")]));
  result.id = M.id("page");
  result.widgets.forEach((w) => (w.id = ids.get(w.id)));
  result.groups.forEach((g) => {
    g.id = M.id("group");
    g.widgetIds = g.widgetIds.map((k) => ids.get(k));
  });
  result.overlaps = result.overlaps.map((p) => ({
    ...p,
    a: ids.get(p.a),
    b: ids.get(p.b),
  }));
  return result;
}
function arrange() {
  try {
    const ids =
      $("arrange-scope").value === "page"
        ? page().widgets.map((w) => w.id)
        : store.view.selection;
    if (!ids.length) throw Error("Select widgets or choose Whole page");
    arrangement = L.arrangePage(page(), ids, {
      gap: Number($("spacing").value),
    });
    $("apply-arrangement").hidden = $("cancel-arrangement").hidden = false;
    status("Arrangement preview: apply or cancel");
    invalidate();
  } catch (e) {
    status(e.message, true);
  }
}
function align(kind) {
  command("Align", () => {
    const ws = movable();
    if (ws.length < 2) return;
    const b = L.groupBounds(ws);
    for (const w of ws) {
      if (kind === "left") w.x = b.x;
      if (kind === "right") w.x = b.x + b.w - w.w;
      if (kind === "top") w.y = b.y;
      if (kind === "bottom") w.y = b.y + b.h - w.h;
      if (kind === "center-x") w.x = b.x + (b.w - w.w) / 2;
      if (kind === "center-y") w.y = b.y + (b.h - w.h) / 2;
    }
    if (kind.startsWith("distribute")) {
      const x = kind.endsWith("x"),
        key = x ? "x" : "y",
        size = x ? "w" : "h";
      ws.sort((a, b) => a[key] - b[key]);
      const gap =
        (b[size] - ws.reduce((n, w) => n + w[size], 0)) / (ws.length - 1);
      if (gap < 0) throw Error("Not enough space to distribute");
      let at = b[key];
      for (const w of ws) {
        w[key] = at;
        at += w[size] + gap;
      }
    }
  });
}
function actions() {
  $("guides").onchange = invalidate;
  for (const [id, direction] of [
    ["layer-up", 1],
    ["layer-down", -1],
  ])
    $(id).onclick = () =>
      command("Layer order", () => {
        const ws = page().widgets;
        for (const w of direction > 0 ? [...movable()].reverse() : movable()) {
          const i = ws.indexOf(w),
            j = i + direction;
          if (j >= 0 && j < ws.length) [ws[i], ws[j]] = [ws[j], ws[i]];
        }
      });
  $("pages").onchange = () => {
    store.view.pageId = $("pages").value;
    store.view.selection = [];
    update();
  };
  $("undo").onclick = () => store.undo();
  $("redo").onclick = () => store.redo();
  $("copy").onclick = copy;
  $("paste").onclick = paste;
  $("duplicate").onclick = () => {
    copy();
    paste();
  };
  $("delete").onclick = remove;
  $("deselect").onclick = () => {
    store.view.selection = [];
    update(false);
  };
  $("copy-style").onclick = () => {
    const w = selected()[0];
    if (w)
      styleClipboard = {
        style: M.clone(w.style),
        size: w.size,
        labelPosition: w.labelPosition,
        unitPosition: w.unitPosition,
      };
    update(false);
  };
  $("paste-style").onclick = () =>
    command("Paste style", () =>
      movable().forEach((w) => Object.assign(w, M.clone(styleClipboard))),
    );
  $("reset-style").onclick = () =>
    command("Reset style", () => movable().forEach((w) => (w.style = {})));
  $("use-defaults").onclick = () =>
    command("Signal defaults", () =>
      selected()
        .filter((w) => M.signalTypes.includes(w.type))
        .forEach((w) => {
          w.labelMode = "auto";
          M.bind(w, w.signal);
        }),
    );
  $("pageadd").onclick = () => ui.openDialog("new-page-dialog");
  $("blank-page").onclick = () => createPage();
  $("copy-page").onclick = () =>
    command("Duplicate page", () => {
      const p = clonePage(page());
      p.style = M.clone(renderTheme().style);
      p.dayStyle = M.clone(renderTheme().dayStyle);
      p.background = M.clone(page().background ?? theme().background);
      p.dayBackground = M.clone(page().dayBackground ?? theme().dayBackground);
      p.name = p.name.slice(0, 70) + " copy";
      const owner = addPage(store.project, p);
      store.view.themeId = owner.id;
      store.view.pageId = p.id;
      store.view.selection = [];
    });
  $("pagedel").onclick = () =>
    command("Delete page", () => {
      if (allPages(store.project).length === 1)
        throw Error("Keep one Custom page");
      const owner = theme(),
        key = page().id;
      owner.pages = owner.pages.filter((p) => p.id !== key);
      if (!owner.pages.length)
        store.project.themes = store.project.themes.filter(
          (t) => t.id !== owner.id,
        );
      const next = allPages(store.project)[0];
      store.view.themeId = next.owner.id;
      store.view.pageId = next.page.id;
      store.view.selection = [];
      store.project.initialTheme = store.view.themeId;
      store.project.initialPage = 0;
    });
  $("group").onclick = () =>
    command("Group", () => {
      if (selected().length < 2) throw Error("Select at least two widgets");
      if (
        page().groups.some((g) =>
          g.widgetIds.some((k) => store.view.selection.includes(k)),
        )
      )
        throw Error("Ungroup members first");
      page().groups.push({
        id: M.id("group"),
        name: "Group",
        locked: false,
        widgetIds: [...store.view.selection],
      });
    });
  $("ungroup").onclick = () =>
    command(
      "Ungroup",
      () =>
        (page().groups = page().groups.filter(
          (g) => !g.widgetIds.some((k) => store.view.selection.includes(k)),
        )),
    );
  $("lock-group").onclick = () =>
    command("Group lock", () => {
      const g = page().groups.find((g) =>
        g.widgetIds.some((k) => store.view.selection.includes(k)),
      );
      if (!g) throw Error("Select a group");
      g.locked = !g.locked;
    });
  $("allow-pair").onclick = () =>
    command("Allow overlap", () => {
      if (selected().length !== 2) throw Error("Select exactly two widgets");
      const [a, b] = selected();
      if (
        !page().overlaps.some(
          (p) =>
            (p.a === a.id && p.b === b.id) || (p.a === b.id && p.b === a.id),
        )
      )
        page().overlaps.push({
          a: a.id,
          b: b.id,
          reason: "Intentional composition",
        });
    });
  $("clear-pairs").onclick = () =>
    command(
      "Clear exemptions",
      () =>
        (page().overlaps = page().overlaps.filter(
          (p) =>
            !store.view.selection.includes(p.a) &&
            !store.view.selection.includes(p.b),
        )),
    );
  $("align").onchange = () => {
    if ($("align").value) align($("align").value);
    $("align").value = "";
  };
  $("tidy-layout").onclick = arrange;
  $("apply-arrangement").onclick = () => {
    if (arrangement)
      command("Apply arrangement", () => {
        theme().pages[theme().pages.findIndex((p) => p.id === page().id)] =
          arrangement;
      });
    arrangement = null;
    $("apply-arrangement").hidden = $("cancel-arrangement").hidden = true;
    invalidate();
  };
  $("cancel-arrangement").onclick = () => {
    arrangement = null;
    $("apply-arrangement").hidden = $("cancel-arrangement").hidden = true;
    invalidate();
  };
  $("preset").onchange = () => {
    const count = Number($("preset").value);
    if (count)
      command("Layout preset", () => {
        if (page().widgets.some(locked)) throw Error("Unlock widgets first");
        const cols = count === 2 ? 2 : count === 3 ? 3 : count === 4 ? 2 : 3,
          rows = Math.ceil(count / cols);
        page().widgets = Array.from({ length: count }, (_, i) =>
          Object.assign(
            page().widgets[i] ? M.clone(page().widgets[i]) : M.widget(),
            {
              x: 16 + (i % cols) * (784 / cols),
              y: 16 + Math.floor(i / cols) * (464 / rows),
              w: 784 / cols - 16,
              h: 464 / rows - 16,
            },
          ),
        );
        page().groups = [];
        page().overlaps = [];
        store.view.selection = [];
      });
    $("preset").value = "";
  };
  $("component-save").onclick = () => {
    const name = prompt("Component name", "My instrument");
    if (name)
      command("Save component", () => {
        const ws = M.clone(selected()),
          b = L.groupBounds(ws);
        ws.forEach((w) => {
          w.x -= b.x;
          w.y -= b.y;
          w.id = M.id("widget");
        });
        store.project.library.push({
          id: M.id("component"),
          name: name.slice(0, 80),
          widgets: ws,
        });
      });
  };
  $("mode").onchange = () => {
    mode = $("mode").value;
    update();
  };
  $("preview").onclick = () => {
    if (!ui.canPresent()) return;
    preview = !preview;
    document.body.classList.toggle("previewing", preview);
    $("preview").textContent = preview ? "Exit preview" : "Preview";
    $("preview").setAttribute("aria-pressed", String(preview));
    ui.fitCanvas();
    invalidate();
  };
  const send = async () => {
    if (recovery || conflict || !ui.canPresent()) return;
    const buttons = [$("send-builder"), $("send-builder-phone")];
    const feedback = $("builder-feedback");
    feedback.hidden = false;
    feedback.classList.remove("error");
    feedback.textContent = "Sending all Custom pages to MiatOff builder…";
    buttons.forEach((button) => (button.disabled = true));
    try {
      const setup = builderSnapshot(store.project);
      await decodeAssets(setup);
      const result = await sendToBuilder(setup, {
        requireTestLibrary: testMode,
        confirmRemoval: async (removed) => {
          feedback.textContent = "Waiting for your answer…";
          return window.confirm(removalMessage(removed));
        },
      });
      feedback.textContent = `All ${result.pages} Custom pages sent to MiatOff builder. Choose which pages to include in its Custom meters list.`;
    } catch (error) {
      if (error.cancelled) {
        feedback.textContent = error.message;
        return;
      }
      feedback.classList.add("error");
      feedback.textContent =
        "Custom pages were not sent. " +
        error.message +
        " Your browser draft is unchanged.";
    } finally {
      buttons.forEach((button) => (button.disabled = false));
    }
  };
  $("send-builder").onclick = send;
  $("send-builder-phone").onclick = send;
  $("zoom").onchange = () => {
    document
      .querySelector(".screen")
      .classList.toggle("actual", $("zoom").value === "100");
    ui.fitCanvas();
    invalidate();
  };
  $("check-layout").onclick = () => {
    diagnostics();
    invalidate();
  };
  $("snapshot").onclick = () => exportImage(false);
  $("contact-sheet").onclick = () => exportImage(true);
  $("setup").onclick = () =>
    download(E.setupDocument(store.project), "meters-setup-v3.json");
  $("theme").onclick = () =>
    download(
      E.themeDocument(
        pageSnapshot(store.project, theme(), page()),
        pageSnapshot(store.project, theme(), page()).themes[0],
      ),
      "meters-page-v3.json",
    );
  $("import").onclick = () => $("file").click();
  $("file").onchange = importDocument;
  $("image-upload").onclick = () => {
    uploadTarget = {
      themeId: theme().id,
      pageId: page().id,
      mode,
      override: true,
    };
    $("image").click();
  };
  $("image").onchange = uploadImage;
  $("image-remove").onclick = () =>
    command("Remove image", () => {
      const bg = activeBackground(true),
        key = bg.asset;
      bg.kind = "solid";
      delete bg.asset;
      const used = store.project.themes.some((t) =>
        [
          t.background,
          t.dayBackground,
          ...t.pages.flatMap((p) => [p.background, p.dayBackground]),
        ].some((b) => b?.asset === key),
      );
      if (!used) delete store.project.assets[key];
    });
  $("gradient-add").onclick = () =>
    command("Gradient stop", () => {
      const b = activeBackground(true);
      if (b.stops.length >= 8) throw Error("Maximum eight stops");
      b.stops.push({ at: 0.5, color: b.color2 });
      b.stops.sort((a, b) => a.at - b.at);
    });
  $("gradient-remove").onclick = () =>
    command("Remove stop", () => {
      const b = activeBackground(true);
      if (b.stops.length <= 2) throw Error("Keep two stops");
      b.stops.splice(b.stops.length - 2, 1);
    });
  $("crop").onclick = () => {
    bgDrag = !bgDrag;
    $("crop").textContent = bgDrag ? "Finish crop" : "Drag background crop";
  };
  $("checkpoint").onclick = async () => {
    const name = prompt("Checkpoint name");
    if (name) await flushSave(name.slice(0, 80));
  };
  $("revisions").onclick = async () => {
    const host = $("revision-panel");
    host.hidden = !host.hidden;
    if (!host.hidden) {
      host.replaceChildren();
      await revisions(host);
    }
  };
  $("play").onclick = () => {
    sim.running = !sim.running;
    ui.refresh();
    $("play").textContent = sim.running
      ? "Pause simulation"
      : "Play simulation";
    invalidate();
  };
  $("scenario").onchange = () => {
    sim.setScenario($("scenario").value);
    sim.step(0, store.project.vehicle, { force: true });
    diagnostics();
    invalidate();
  };
  $("lap").onclick = () => {
    if (!sim.lap())
      status("Lap needs at least 5 seconds of available telemetry");
    sim.step(0, store.project.vehicle, { force: true });
    invalidate();
  };
  $("reset").onclick = () => {
    sim.resetSession();
    sim.step(0, store.project.vehicle, { force: true });
    invalidate();
  };
  $("manual-clear").onclick = () => {
    sim.clearManual();
    for (const input of $("manual-inputs").querySelectorAll("input")) {
      input.value = "";
      input.checked = false;
    }
    sim.step(0, store.project.vehicle, { force: true });
    invalidate();
  };
  $("record").onclick = () => {
    if (sim.recording) {
      recordingFile = sim.stopRecording();
      persistRecording(recordingFile);
      $("record").textContent = "Record preview";
    } else {
      sim.startRecording();
      $("record").textContent = "Stop recording";
    }
  };
  $("record-export").onclick = () => {
    const r = sim.recording
      ? sim.stopRecording()
      : (recordingFile ?? sim.lastRecording);
    if (r) download(r, "meters-recording.json");
    else status("Record a preview first");
  };
  $("replay").onclick = () => {
    try {
      sim.playRecording(
        recordingFile ??
          JSON.parse(localStorage.getItem(namespace + "-recording") ?? "null"),
      );
      invalidate();
    } catch (e) {
      status(e.message, true);
    }
  };
  $("record-import").onclick = () => $("record-file").click();
  $("record-file").onchange = async () => {
    try {
      const f = $("record-file").files[0];
      if (!f) return;
      if (f.size > 1024 * 1024) throw Error("Recording too large");
      recordingFile = JSON.parse(await f.text());
      sim.playRecording(recordingFile);
      invalidate();
    } catch (e) {
      status(e.message, true);
    }
  };
}
async function importDocument() {
  try {
    const generation = editGeneration;
    const f = $("file").files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) throw Error("Maximum export size is 8 MiB");
    const raw = JSON.parse(await f.text());
    let next;
    if (raw.kind === "MetersComponent") {
      next = snapshot(store.project);
      const component = M.clone(raw.component);
      component.id = M.id("component");
      component.widgets.forEach((w) => (w.id = M.id("widget")));
      next.library.push(component);
    } else if (raw.kind === "ThemeDocument") {
      const incoming = M.migrate({
        version: raw.version,
        kind: "MetersSetup",
        themes: [
          Object.fromEntries(
            Object.entries(raw.theme ?? raw).filter(
              ([key]) => key !== "assets",
            ),
          ),
        ],
        vehicle: M.clone(store.project.vehicle),
        assets: raw.assets ?? {},
      });
      next = snapshot(store.project);
      const t = clonePageIds(incoming.themes[0]);
      const ids = new Map();
      for (const [key, a] of Object.entries(incoming.assets)) {
        const newId =
          Object.keys(next.assets).find(
            (k) => next.assets[k].data === a.data,
          ) ?? M.id("asset");
        ids.set(key, newId);
        next.assets[newId] = a;
      }
      for (const bg of [
        t.background,
        t.dayBackground,
        ...t.pages.flatMap((p) => [p.background, p.dayBackground]),
      ])
        if (bg?.asset) bg.asset = ids.get(bg.asset);
      for (const imported of t.pages) {
        imported.style = M.clone(M.pageTheme(t, imported).style);
        imported.dayStyle = M.clone(M.pageTheme(t, imported).dayStyle);
        imported.background ??= M.clone(t.background);
        imported.dayBackground ??= M.clone(t.dayBackground);
        addPage(next, imported);
      }
    } else next = M.migrate(raw);
    M.validate(next);
    await decodeAssets(next);
    if (generation !== editGeneration)
      throw Error(
        "Import cancelled because the project changed while decoding. Retry the import.",
      );
    command("Import document", () => {
      store.project = next;
      store.view = {
        themeId: next.themes[0].id,
        pageId: next.themes[0].pages[0].id,
        selection: [],
      };
    });
  } catch (e) {
    status("Import failed: " + e.message, true);
  } finally {
    $("file").value = "";
  }
}
function clonePageIds(t) {
  t = M.clone(t);
  t.id = M.id("theme");
  t.pages = t.pages.map((p) => clonePage(p));
  return t;
}
async function uploadImage() {
  try {
    const file = $("image").files[0];
    if (!file) return;
    const target = uploadTarget,
      a = await normalizeImage(file);
    const t = store.project.themes.find((t) => t.id === target.themeId),
      p = t?.pages.find((p) => p.id === target.pageId);
    if (!p) throw Error("Upload cancelled: its target page was deleted");
    command("Upload background", () => {
      let key = Object.keys(store.project.assets).find(
        (k) => store.project.assets[k].data === a.data,
      );
      if (!key) {
        if (Object.keys(store.project.assets).length >= 3)
          throw Error("Maximum three images; remove an unused image first");
        key = M.id("asset");
        store.project.assets[key] = a;
      }
      p[target.mode === "day" ? "dayBackground" : "background"] = {
        ...M.clone(
          target.mode === "day"
            ? (p.dayBackground ?? t.dayBackground ?? t.background)
            : (p.background ?? t.background),
        ),
        kind: "image",
        asset: key,
      };
    });
  } catch (e) {
    status("Image failed: " + e.message, true);
  } finally {
    $("image").value = "";
  }
}
async function exportImage(contact) {
  try {
    download(
      await E.png({
        theme: theme(),
        pages: contact
          ? allPages(store.project).map(({ page }) => page)
          : [page()],
        entries: contact
          ? allPages(store.project).map(({ owner, page }) => ({
              theme: owner,
              page,
            }))
          : null,
        assets: store.project.assets,
        state: sim.state,
        mode,
        contact,
      }),
      contact ? "meters-contact-sheet.png" : "meters-page.png",
      "image/png",
    );
  } catch (e) {
    status("PNG export failed: " + e.message, true);
  }
}
function manualControls() {
  for (const [key, d] of Object.entries(M.signals)) {
    const row = document.createElement("label"),
      n = document.createElement("input"),
      unavailable = document.createElement("input");
    n.type = "number";
    n.step = "any";
    n.placeholder = "Automatic";
    n.setAttribute("aria-label", d.label + " simulated value");
    unavailable.type = "checkbox";
    unavailable.setAttribute("aria-label", d.label + " unavailable");
    row.append(
      document.createTextNode(d.label + " (" + d.unit + ")"),
      n,
      unavailable,
    );
    n.onchange = () => {
      sim.setManual(key, Number(n.value));
      sim.step(0, store.project.vehicle, { force: true });
      invalidate();
    };
    unavailable.onchange = () => {
      if (unavailable.checked) sim.setManual(key, null);
      else sim.unavailable.delete(key);
      sim.step(0, store.project.vehicle, { force: true });
      invalidate();
    };
    $("manual-inputs").append(row);
  }
}
function vehicleControls() {
  const host = $("vehicle");
  const add = (label, path, level, choices = null) => {
    const row = document.createElement("label"),
      input = document.createElement(choices ? "select" : "input"),
      error = document.createElement("small");
    row.dataset.minDetail = String(level);
    row.textContent = label;
    input.dataset.vehicle = path;
    input.setAttribute("aria-label", label);
    if (choices) choices.forEach((v) => input.add(new Option(v, v)));
    else {
      input.type =
        path === "provenance" || path === "market" ? "text" : "number";
      input.step = "any";
    }
    error.className = "field-error";
    const value = path
      .split(".")
      .reduce((o, k) => o?.[k], store.project.vehicle);
    input.value = value ?? "";
    input.placeholder = value === null ? "Not verified" : "";
    input.onchange = () => {
      const result = command("Vehicle settings", () => {
        const keys = path.split("."),
          key = keys.pop();
        let object = store.project.vehicle;
        for (const k of keys) object = object[k];
        if (path.startsWith("units."))
          M.setUnits(store.project, key, input.value);
        else
          object[key] =
            input.value === ""
              ? null
              : input.type === "number"
                ? Number(input.value)
                : input.value;
      });
      if (result === undefined) {
        error.textContent = ui.lastError;
        input.setAttribute("aria-invalid", "true");
        input.focus();
      } else {
        error.textContent = "";
        input.removeAttribute("aria-invalid");
      }
    };
    row.append(input, error);
    host.append(row);
  };
  for (const [key, label, choices] of [
    ["generation", "Generation", ["ND1", "ND2"]],
    ["engine", "Engine (L)", ["1.5", "2.0"]],
    ["body", "Body", ["roadster", "RF"]],
    ["transmission", "Transmission", ["manual", "automatic"]],
  ])
    add(label, key, 0, choices);
  add("Model year", "year", 0);
  add("Market", "market", 0);
  for (const [key, choices] of Object.entries(M.unitChoices))
    add(P.readingName(key) + " units", "units." + key, 0, choices);
  for (const [key, label] of [
    ["max", "Gauge maximum"],
    ["amber", "Amber warning"],
    ["red", "Redline"],
    ["shift", "Shift warning"],
    ["limit", "Estimated limiter"],
  ])
    add(label + " (RPM)", "rpm." + key, 1);
  for (let i = 0; i < store.project.vehicle.ratios.length; i++)
    add("Gear " + (i + 1) + " ratio", "ratios." + i, 2);
  for (const [key, label] of [
    ["finalDrive", "Final drive"],
    ["circumference", "Rolling circumference (m)"],
    ["mass", "Running mass (kg)"],
    ["cda", "Drag area (m²)"],
    ["crr", "Rolling resistance"],
    ["eff", "Drivetrain efficiency"],
    ["ratedPower", "Rated power (PS)"],
    ["powerRpm", "Power peak (RPM)"],
    ["ratedTorque", "Rated torque (Nm)"],
    ["torqueRpm", "Torque peak (RPM)"],
    ["provenance", "Specification source / assumptions"],
  ])
    add(label, key, 2);
}
function point(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) * 800) / r.width,
    y: ((e.clientY - r.top) * 480) / r.height,
  };
}
function pointerActions() {
  for (const [selector, key, min, max, direction] of [
    [".library-panel", "library", 180, 360, 1],
    [".inspector-panel", "inspector", 230, 420, -1],
  ]) {
    const panel = document.querySelector(selector),
      handle = document.createElement("div");
    handle.className = "panel-resizer " + (direction < 0 ? "left" : "");
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-label", "Resize " + key + " panel");
    panel.append(handle);
    handle.onpointerdown = (e) => {
      const x = e.clientX,
        width = panel.getBoundingClientRect().width;
      handle.setPointerCapture(e.pointerId);
      handle.onpointermove = (move) => {
        const main = document.querySelector("main"),
          available =
            main.clientWidth -
            60 -
            300 -
            [...main.querySelectorAll(":scope > aside")]
              .filter((a) => a !== panel)
              .reduce((n, a) => n + a.getBoundingClientRect().width, 0);
        main.style.setProperty(
          "--" + key + "-width",
          Math.max(
            min,
            Math.min(max, available, width + (move.clientX - x) * direction),
          ) + "px",
        );
      };
      handle.onpointerup = () => {
        handle.onpointermove = null;
        ui.preferences.set({
          [key === "library" ? "leftWidth" : "rightWidth"]:
            panel.getBoundingClientRect().width,
        });
      };
    };
  }
  canvas.onpointerdown = (e) => {
    if (preview || recovery || conflict) return;
    const p = point(e);
    if (bgDrag) {
      store.begin();
      const bg = activeBackground(true);
      drag = { crop: true, p, start: M.clone(bg) };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    const sb = movable().length ? L.groupBounds(movable()) : null,
      hitSize =
        ((e.pointerType === "touch" ? 24 : 10) * 800) / canvas.clientWidth,
      groupResize =
        sb &&
        movable().length > 1 &&
        Math.abs(p.x - sb.x - sb.w) < hitSize &&
        Math.abs(p.y - sb.y - sb.h) < hitSize;
    const w = groupResize
      ? movable().at(-1)
      : [...page().widgets]
          .reverse()
          .find(
            (w) =>
              !w.hidden &&
              L.contains(
                (
                  measurements.find((m) => m.widgetId === w.id) ??
                  L.measurement(ctx, w, renderTheme(), sim.state, mode)
                ).outer,
                { x: p.x, y: p.y, w: 0, h: 0 },
              ),
          );
    if (!w) {
      store.view.selection = [];
      update();
      return;
    }
    if (!groupResize && !store.view.selection.includes(w.id))
      select(w.id, e.shiftKey || $("multi-select").checked);
    if (locked(w)) {
      status("This widget or its group is locked");
      return;
    }
    const ws = movable(),
      b = L.groupBounds(ws);
    store.begin();
    drag = {
      p,
      widgets: ws.map((w) => ({ id: w.id, x: w.x, y: w.y, w: w.w, h: w.h })),
      bounds: b,
      resize:
        groupResize || (p.x > b.x + b.w - hitSize && p.y > b.y + b.h - hitSize),
    };
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (!drag) return;
    const p = point(e),
      dx = p.x - drag.p.x,
      dy = p.y - drag.p.y;
    if (drag.crop) {
      const bg = activeBackground();
      bg.x = Math.max(0, Math.min(1, drag.start.x - dx / 800));
      bg.y = Math.max(0, Math.min(1, drag.start.y - dy / 480));
      invalidate();
      return;
    }
    const snap = Number($("snap").value),
      ws = drag.widgets.map((a) => {
        const w = page().widgets.find((w) => w.id === a.id);
        Object.assign(w, a);
        return w;
      });
    if (drag.resize) {
      const b = drag.bounds,
        sx = Math.max(0.1, (b.w + dx) / b.w),
        sy = Math.max(0.1, (b.h + dy) / b.h);
      ws.forEach((w) => {
        w.x = b.x + (w.x - b.x) * sx;
        w.y = b.y + (w.y - b.y) * sy;
        w.w = Math.max(24, Math.round((w.w * sx) / snap) * snap);
        w.h = Math.max(24, Math.round((w.h * sy) / snap) * snap);
      });
    } else {
      const guide = L.snapSelection(
        ws,
        page().widgets.filter((w) => !ws.includes(w)),
        Math.round(dx / snap) * snap,
        Math.round(dy / snap) * snap,
        $("guides").checked ? 4 : 0,
      );
      alignmentGuides = guide.guides;
      L.moveGroup(ws, guide.dx, guide.dy);
    }
    invalidate();
  };
  canvas.onpointerup = () => {
    if (!drag) return;
    drag = null;
    alignmentGuides = [];
    try {
      store.commit("Move / resize");
    } catch (e) {
      status(e.message, true);
    }
  };
  canvas.onpointercancel = () => {
    drag = null;
    alignmentGuides = [];
    store.cancel();
  };
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && e.target.closest("dialog[open]")) return;
    if (preview) {
      if (e.key === "Escape") $("preview").click();
      return;
    }
    if (
      /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) ||
      e.target.isContentEditable
    )
      return;
    const mod = e.ctrlKey || e.metaKey,
      k = e.key.toLowerCase();
    if (mod && ["a", "c", "v", "d", "z", "y"].includes(k)) e.preventDefault();
    if (mod && k === "a") {
      store.view.selection = page()
        .widgets.filter((w) => !w.hidden)
        .map((w) => w.id);
      update();
    } else if (mod && k === "c") copy();
    else if (mod && k === "v") paste();
    else if (mod && k === "d") {
      copy();
      paste();
    } else if (mod && k === "z") e.shiftKey ? store.redo() : store.undo();
    else if (mod && k === "y") store.redo();
    else if (k === "escape") {
      if (drag) {
        drag = null;
        store.cancel();
      } else {
        store.view.selection = [];
        update();
      }
    } else if (k === "delete" || k === "backspace") {
      e.preventDefault();
      remove();
    } else if (
      ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(k)
    ) {
      e.preventDefault();
      const step = e.shiftKey ? 8 : 1;
      command("Nudge", () =>
        L.moveGroup(
          movable(),
          k === "arrowleft" ? -step : k === "arrowright" ? step : 0,
          k === "arrowup" ? -step : k === "arrowdown" ? step : 0,
        ),
      );
    }
  });
}
function persistRecording(recording) {
  recordingFile = recording;
  lastPersistedRecording = recording;
  $("record").textContent = "Record preview";
  try {
    localStorage.setItem(namespace + "-recording", JSON.stringify(recording));
  } catch (e) {
    status(
      "Recording save failed: export it before closing. " + e.message,
      true,
    );
  }
}
function invalidate() {
  if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
}
function frame(now) {
  raf = 0;
  renderStats.frames++;
  if (document.hidden) return;
  const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  sim.step(dt, store.project.vehicle, { force: !sim.state.vehicle });
  if (sim.lastRecording && sim.lastRecording !== lastPersistedRecording)
    persistRecording(sim.lastRecording);
  measurements = R.render(
    ctx,
    theme(),
    arrangement ?? page(),
    store.project.assets,
    sim.state,
    {
      mode,
      guides: !preview && $("guides").checked,
      selection: preview ? [] : store.view.selection,
      issues: preview ? [] : issues,
    },
  );
  if (!preview && $("guides").checked) {
    ctx.save();
    ctx.strokeStyle = "#65e1c3";
    ctx.setLineDash([4, 4]);
    if (selected().length > 1) {
      const b = L.groupBounds(selected());
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = "#65e1c3";
      ctx.fillRect(b.x + b.w - 10, b.y + b.h - 10, 10, 10);
    }
    for (const g of alignmentGuides) {
      ctx.beginPath();
      if (g.axis === "x") {
        ctx.moveTo(g.at, 0);
        ctx.lineTo(g.at, 480);
      } else {
        ctx.moveTo(0, g.at);
        ctx.lineTo(800, g.at);
      }
      ctx.stroke();
    }
    for (const g of L.equalGaps(page().widgets)) {
      ctx.font = "12px Arial";
      ctx.fillStyle = "#65e1c3";
      ctx.textAlign = "center";
      ctx.fillText(
        g.gap.toFixed(0) + " px",
        g.axis === "x" ? (g.start + g.end) / 2 : g.at,
        g.axis === "x" ? g.at - 4 : (g.start + g.end) / 2,
      );
    }
    if (bgDrag) {
      const b = activeBackground(),
        a = store.project.assets[b.asset];
      if (a) {
        const scale = (b.fit === "contain" ? Math.min : Math.max)(
            800 / a.width,
            480 / a.height,
          ),
          w = a.width * scale,
          h = a.height * scale;
        ctx.strokeRect((800 - w) * b.x, (480 - h) * b.y, w, h);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(800 * b.x - 4, 480 * b.y - 4, 8, 8);
      }
    }
    ctx.restore();
  }
  if (!sim.running || now - lastGallery >= 200) {
    lastGallery = now;
    renderStats.galleryFrames++;
    for (const g of gallery) if (g.visible) g.draw(g.canvas.getContext("2d"));
  }
  if (sim.running) invalidate();
}
window.addEventListener("studio-assets-ready", () => {
  diagnostics();
  invalidate();
});
document.addEventListener("visibilitychange", () => {
  lastFrame = 0;
  if (!document.hidden) invalidate();
});
window.addEventListener("resize", invalidate);
sim.running = false;
$("play").textContent = "Play simulation";
const context = () =>
  store
    ? {
        project: store.project,
        theme: theme(),
        page: page(),
        selection: selected(),
        vehicle: store.project.vehicle,
        mode,
        issues,
        pages: allPages(store.project),
      }
    : null;
ui = new Workspace({
  namespace,
  context,
  inspector: () => editorInspector,
  renderInspector: () => inspector(),
  invalidate,
  command,
  selection: selected,
  locked,
  bounds: L.groupBounds,
  running: () => sim.running,
  cancelDrag: () => {
    if (drag) {
      drag = null;
      alignmentGuides = [];
      store.cancel();
    }
  },
  selectPage: (key) => {
    store.view.themeId = allPages(store.project).find(
      ({ page }) => page.id === key,
    ).owner.id;
    store.view.pageId = key;
    store.view.selection = [];
    update(false);
  },
});
editorInspector = new Inspector({
  host: $("properties"),
  title: $("inspector-title"),
  subtitle: $("inspector-subtitle"),
  empty: $("inspector-empty"),
  back: $("scope-back"),
  backgroundTools: $("background-tools"),
  customSummary: $("custom-settings"),
  styleSummary: $("style-summary"),
  context,
  scope: () => ui.scope,
  level: () => ui.level,
  preferences: ui.preferences,
  command: (name, fn) => command(name, fn, { inline: true }),
  locked,
  lastError: () => ui.lastError,
  restoreInputs: () => restoreInputs,
  paintVariant: (canvas, w, variant) => {
    const sample = M.clone(w);
    Object.assign(sample, { variant, x: 0, y: 0, w: 240, h: 160, size: 42 });
    const c = canvas.getContext("2d");
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.save();
    c.scale(canvas.width / 240, canvas.height / 160);
    R.renderWidget(
      c,
      sample,
      L.measurement(c, sample, renderTheme(), sim.state, mode),
      sim.state,
    );
    c.restore();
  },
  paintPreset: (canvas, w, effect) => {
    const sample = M.clone(w);
    P.applyAppearance(sample, effect);
    sample.x = sample.y = 0;
    sample.w = 160;
    sample.h = 104;
    sample.size = 32;
    const c = canvas.getContext("2d");
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.save();
    c.scale(canvas.width / 160, canvas.height / 104);
    R.renderWidget(
      c,
      sample,
      L.measurement(c, sample, renderTheme(), sim.state, mode),
      sim.state,
    );
    c.restore();
  },
});

await boot();
galleries();
manualControls();
vehicleControls();
actions();
pointerActions();
ui.init();
update();
for (const [type, def] of Object.entries(M.registry)) {
  def.create = (variant) => M.widget(type, variant);
  def.measure = L.measurement;
  def.render = R.renderWidget;
}
if (testMode)
  window.__studio = {
    get store() {
      return store;
    },
    sim,
    persistence,
    get issues() {
      return issues;
    },
    get measurements() {
      return measurements;
    },
    get recovery() {
      return recovery;
    },
    get conflict() {
      return conflict;
    },
    command,
    flush: flushSave,
    render() {
      sim.step(0, store.project.vehicle, { force: true });
      diagnostics();
      invalidate();
    },
    ui,
    editorInspector,
    cacheStats: R.cacheStats,
    renderStats,
  };

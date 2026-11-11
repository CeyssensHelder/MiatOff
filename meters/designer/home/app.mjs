// SPDX-License-Identifier: GPL-3.0-or-later
import * as M from "./model.mjs";
import { CommandStore } from "../shared/commands.mjs";
import { Persistence, DraftConflict } from "../shared/persistence.mjs";
import { normalizeImage } from "../shared/images.mjs";
import { EditorPreferences } from "../shared/preferences.mjs";
import { moveGroup, groupBounds, snapSelection } from "../shared/geometry.mjs";
const $ = (id) => document.getElementById(id),
  canvas = $("canvas"),
  ctx = canvas.getContext("2d");
// Inside the designer the shared header shows the main actions and the save status.
if (window.parent !== window) document.body.classList.add("embedded");
let chromeListener = null;
function chrome() {
  chromeListener?.({
    undo: !$("undo").disabled,
    redo: !$("redo").disabled,
    trying,
    saveStatus: $("save-status").textContent,
  });
}
const params = new URLSearchParams(location.search),
  namespace =
    params.get("test") === "1"
      ? "home-test-" + (params.get("db") || crypto.randomUUID())
      : "miatoff-home-studio";
const persistence = new Persistence(namespace, { validate: M.validate }),
  channel = new BroadcastChannel(namespace + "-changes"),
  session = crypto.randomUUID();
const store = new CommandStore(
  M.defaults(),
  { selection: [] },
  { validate: M.validate },
);
let active = true,
  trying = false,
  focused = null,
  drag = null,
  epoch = 0,
  generation = 0,
  blocked = false,
  dirty = false,
  timer,
  saveChain = Promise.resolve();
const bitmaps = new Map(),
  symbol = {
    applications: "▦",
    entertainment: "♫",
    communication: "☎",
    navigation: "➤",
    settings: "⚙",
    meters: "◴",
    bluetooth: "♪",
    fm: "FM",
    dab: "DAB",
    "android-auto": "AA",
    carplay: "CP",
  };
const selected = () =>
  store.project.items.filter((w) => store.view.selection.includes(w.id));
const unlocked = () => selected().filter((w) => !w.locked);
function notice(text = "") {
  $("notice").textContent = text;
}
function download(data, name, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function command(name, fn) {
  if (blocked) return notice("Resolve draft recovery before editing");
  try {
    store.command(name, (p) => {
      fn(p);
      // fn may replace store.project (import, new design): clean whatever is current now.
      store.project = M.clean(store.project);
    });
    notice();
  } catch (e) {
    notice(e.message);
    refresh();
  }
}
async function flush() {
  clearTimeout(timer);
  if (!dirty || blocked) return;
  const doc = M.clone(store.project),
    at = generation;
  saveChain = saveChain
    .catch(() => {})
    .then(async () => {
      if (blocked || at !== generation) return;
      try {
        await persistence.save(doc, { session, roots: store.assetRoots() });
        dirty = at !== generation;
        $("save-status").textContent = "Saved " + new Date().toLocaleTimeString();
        chrome();
        channel.postMessage({ session, revision: persistence.revision });
      } catch (e) {
        notice("Save failed: " + e.message);
        if (e instanceof DraftConflict) {
          blocked = true;
          $("recovery").hidden = false;
        }
      }
    });
  await saveChain;
}
function image(key) {
  if (!key) return null;
  const a = store.project.assets[key];
  if (!a) return null;
  if (!bitmaps.has(a.data)) {
    const img = new Image();
    img.onload = () => {
      if (active) draw();
    };
    img.src = a.data;
    bitmaps.set(a.data, img);
  }
  const img = bitmaps.get(a.data);
  return img.complete && img.naturalWidth ? img : null;
}
function draw(guides = true) {
  if (!active) return;
  const p = store.project;
  const used = new Set(Object.values(p.assets).map((a) => a.data));
  for (const key of bitmaps.keys()) if (!used.has(key)) bitmaps.delete(key);
  ctx.clearRect(0, 0, 800, 480);
  ctx.fillStyle = p.background.color;
  ctx.fillRect(0, 0, 800, 480);
  const bg = image(p.background.image);
  if (bg) {
    const scale = (p.background.fit === "contain" ? Math.min : Math.max)(
        800 / bg.width,
        480 / bg.height,
      ),
      w = bg.width * scale,
      h = bg.height * scale;
    ctx.drawImage(bg, (800 - w) / 2, (480 - h) / 2, w, h);
  }
  ctx.fillStyle = "#0009";
  ctx.fillRect(0, 0, 800, 50);
  ctx.fillRect(0, 438, 800, 42);
  ctx.fillStyle = "#fff";
  ctx.font = "16px Arial";
  ctx.textAlign = "left";
  ctx.fillText("MAZDA HOME · CONCEPT", 20, 31);
  ctx.fillText("HOME", 20, 465);
  const l = M.look(p);
  for (const w of p.items) {
    if (w.hidden) continue;
    // Without guides (the preview PNG) the editing selection is not drawn; Try menu focus is.
    const chosen = trying
      ? w.id === focused
      : guides && store.view.selection.includes(w.id);
    const img = image((chosen && w.selected) || w.normal);
    const box = M.artBox(w, l),
      band = M.labelHeight(l.labelSize);
    ctx.save();
    // As the car draws it: an outline frame, or none (then the selected picture shows focus, and an item
    // without a different selected picture gets the accent outline when chosen).
    const marked =
      chosen && (l.frame === "outline" || !w.selected || w.selected === w.normal);
    if (l.frame === "outline" || marked) {
      ctx.strokeStyle = chosen ? p.accent : "#8997aa";
      ctx.lineWidth = chosen ? 4 : 1;
      ctx.strokeRect(w.x + 2, w.y + 2, w.w - 4, w.h - 4);
    }
    if (img) {
      const s = Math.min(box.w / img.width, box.h / img.height);
      ctx.drawImage(
        img,
        box.x + (box.w - img.width * s) / 2,
        box.y + (box.h - img.height * s) / 2,
        img.width * s,
        img.height * s,
      );
    } else {
      const size = Math.min(box.w, box.h);
      ctx.fillStyle = "#e5eaf4";
      ctx.font = Math.min(size * 0.6, 40) + "px Arial";
      ctx.textAlign = "center";
      ctx.fillText(
        symbol[w.opens] || "•",
        w.x + w.w / 2,
        box.y + box.h / 2 + Math.min(size * 0.6, 40) * 0.35,
      );
    }
    ctx.beginPath();
    ctx.rect(w.x + 4, w.y, w.w - 8, w.h);
    ctx.clip();
    ctx.fillStyle = l.labelColor;
    ctx.font = `${l.labelSize}px "${l.font}", Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(w.label, w.x + w.w / 2, w.y + w.h - 4 - band / 2);
    ctx.textBaseline = "alphabetic";
    ctx.restore();
    if (guides && !trying && chosen && !w.locked) {
      ctx.fillStyle = "#65e1c3";
      ctx.fillRect(w.x + w.w - 10, w.y + w.h - 10, 10, 10);
    }
  }
}
function refresh() {
  const p = store.project,
    selection = selected(),
    w = selection[0];
  $("items").replaceChildren();
  for (const id of p.order) {
    const item = p.items.find((w) => w.id === id),
      row = document.createElement("div");
    row.className = "item-row";
    const choose = document.createElement("button");
    choose.className = "choose";
    choose.textContent = item.label + (item.hidden ? " (hidden)" : "");
    choose.setAttribute(
      "aria-pressed",
      String(store.view.selection.includes(id)),
    );
    choose.onclick = (e) => {
      store.view.selection = e.shiftKey
        ? [...new Set([...store.view.selection, id])]
        : [id];
      refresh();
    };
    row.append(choose);
    for (const delta of [-1, 1]) {
      const b = document.createElement("button");
      b.textContent = delta < 0 ? "↑" : "↓";
      b.setAttribute(
        "aria-label",
        (delta < 0 ? "Earlier " : "Later ") + item.label,
      );
      const n = p.order.indexOf(id);
      b.disabled = n + delta < 0 || n + delta >= p.order.length;
      b.onclick = () =>
        command("Commander order", (p) => {
          [p.order[n], p.order[n + delta]] = [p.order[n + delta], p.order[n]];
        });
      row.append(b);
    }
    $("items").append(row);
  }
  for (const key of [
    "x",
    "y",
    "w",
    "h",
    "name",
    "opens",
    "locked",
    "hidden",
    "normal",
    "selected",
  ]) {
    $(key).disabled = !w;
    if (!w) {
      if (["locked", "hidden"].includes(key)) $(key).checked = false;
      else if (!["normal", "selected"].includes(key)) $(key).value = "";
    }
    if (w) {
      if (["locked", "hidden"].includes(key)) $(key).checked = w[key];
      else if (!["normal", "selected"].includes(key))
        $(key).value = key === "name" ? w.label : w[key];
    }
  }
  if (document.activeElement !== $("menu-name"))
    $("menu-name").value = p.name || "";
  const l = M.look(p);
  $("look-frame").value = l.frame;
  $("look-font").value = l.font;
  $("look-color").value = l.labelColor;
  if (document.activeElement !== $("look-size")) $("look-size").value = l.labelSize;
  $("bg-color").value = p.background.color;
  $("bg-fit").value = p.background.fit;
  $("accent").value = p.accent;
  $("undo").disabled = blocked || !store.undoStack.length;
  $("redo").disabled = blocked || !store.redoStack.length;
  $("add").disabled = p.items.length >= 12;
  $("remove").disabled =
    !selection.length || selection.length >= p.items.length;
  $("duplicate-item").disabled = !w || p.items.length >= 12;
  $("navigation").hidden = !trying;
  $("try").textContent = trying ? "Back to design" : "Preview";
  $("inspector-subtitle").textContent = !w
    ? "Select an item to edit it."
    : selection.length > 1
      ? `${selection.length} items selected`
      : `${w.label} · opens ${M.destinations.find((d) => d.id === w.opens)?.label ?? w.opens}`;
  // Design checks: a count on the strip, the list in the dialog (as in Meters).
  const issues = M.checks(p, ctx);
  $("issues-open").textContent = issues.length
    ? `${issues.length} design ${issues.length === 1 ? "issue" : "issues"}`
    : "Design checks";
  $("issues-open").classList.toggle("has-issues", !!issues.length);
  const report = $("layout-report");
  report.replaceChildren();
  if (!issues.length) report.textContent = "No measured layout issues";
  for (const issue of issues) {
    const b = document.createElement("button");
    b.className = "issue";
    b.textContent = issue.kind + ": " + issue.message;
    b.onclick = () => {
      store.view.selection = issue.itemIds;
      $("issues-dialog").close();
      refresh();
    };
    report.append(b);
  }
  draw();
  chrome();
}
store.subscribe((_, { changed }) => {
  if (changed) {
    generation++;
    dirty = true;
    $("save-status").textContent = "Unsaved changes";
    clearTimeout(timer);
    timer = setTimeout(flush, 500);
  }
  refresh();
});
function navigate(delta) {
  const ids = store.project.order.filter(
    (id) => !store.project.items.find((w) => w.id === id).hidden,
  );
  if (!ids.length) {
    focused = null;
    return notice("No visible menu items");
  }
  focused =
    ids[
      Math.max(
        0,
        Math.min(ids.length - 1, Math.max(0, ids.indexOf(focused)) + delta),
      )
    ];
  draw();
}
function open() {
  const w = store.project.items.find((w) => w.id === focused);
  $("route").textContent = w
    ? "Simulated destination: " + w.opens
    : "Choose a visible item";
}
for (const d of M.destinations) {
  const o = document.createElement("option");
  o.value = d.id;
  o.textContent = d.label;
  $("opens").append(o);
}
for (const key of ["x", "y", "w", "h", "name", "opens", "locked", "hidden"])
  $(key).onchange = () => {
    if (["x", "y", "w", "h"].includes(key) && !/\S/.test($(key).value)) {
      notice("Enter a number");
      return refresh();
    }
    const value = ["locked", "hidden"].includes(key)
      ? $(key).checked
      : ["x", "y", "w", "h"].includes(key)
        ? Number($(key).value)
        : $(key).value;
    command("Edit item", () => {
      for (const w of selected())
        if (!w.locked || key === "locked")
          w[key === "name" ? "label" : key] = value;
    });
  };
function add(duplicate = false) {
  command(duplicate ? "Duplicate item" : "Add item", (p) => {
    if (p.items.length >= 12) throw Error("Maximum twelve items");
    const source = duplicate ? selected()[0] : M.defaults().items[0];
    const w = {
      ...M.clone(source),
      id: "item-" + crypto.randomUUID(),
      label: duplicate ? source.label : "New shortcut",
      locked: false,
    };
    w.x = Math.min(800 - w.w, w.x + 16);
    w.y = Math.min(480 - w.h, w.y + 16);
    p.items.push(w);
    p.order.push(w.id);
    store.view.selection = [w.id];
  });
}
$("add").onclick = () => add();
$("duplicate-item").onclick = () => add(true);
$("remove").onclick = () =>
  command("Delete items", (p) => {
    const ids = new Set(unlocked().map((w) => w.id));
    if (p.items.length === ids.size) throw Error("Keep one item");
    p.items = p.items.filter((w) => !ids.has(w.id));
    p.order = p.order.filter((id) => !ids.has(id));
    store.view.selection = [];
  });
$("undo").onclick = () => {
  if (!blocked) store.undo();
};
$("redo").onclick = () => {
  if (!blocked) store.redo();
};
$("try").onclick = () => {
  trying = !trying;
  focused = store.project.order.find(
    (id) => !store.project.items.find((w) => w.id === id).hidden,
  );
  refresh();
};
$("issues-open").onclick = () => $("issues-dialog").showModal();
for (const b of document.querySelectorAll("[data-close]"))
  b.onclick = () => b.closest("dialog").close();
$("previous").onclick = () => navigate(-1);
$("next").onclick = () => navigate(1);
$("select").onclick = open;
for (const k of ["back", "home"])
  $(k).onclick = () => {
    $("route").textContent = "Returned to simulated Home";
    navigate(0);
  };
for (const key of ["bg-color", "bg-fit", "accent"])
  $(key).onchange = () =>
    command("Background", (p) => {
      if (key === "accent") p.accent = $(key).value;
      else p.background[key === "bg-color" ? "color" : "fit"] = $(key).value;
    });
for (const kind of ["normal", "selected", "bg"]) {
  $(kind + "-clear").onclick = () =>
    command("Clear artwork", (p) => {
      if (kind === "bg") p.background.image = null;
      else for (const w of unlocked()) w[kind] = null;
    });
  $(kind === "bg" ? "bg-image" : kind).onchange = async (e) => {
    const input = e.target,
      file = input.files[0],
      targets = unlocked().map((w) => w.id),
      at = generation,
      token = epoch;
    if (!file) return;
    try {
      if (kind !== "bg" && !targets.length) throw Error("Select an unlocked item");
      const a = await normalizeImage(file, {
        types: ["image/png", "image/jpeg", "image/webp"],
        maxBytes: 8388608,
        maxPixels: 16777216,
        width: kind === "bg" ? 800 : 128,
        height: kind === "bg" ? 480 : 128,
      });
      if (token !== epoch || at !== generation)
        throw Error("Design changed while image loaded; choose it again");
      command("Upload artwork", (p) => {
        const ws = targets.map((id) => p.items.find((w) => w.id === id));
        if (kind !== "bg" && ws.some((w) => !w || w.locked))
          throw Error("Target item unavailable");
        let key = Object.keys(p.assets).find(
          (k) => p.assets[k].data === a.data,
        );
        if (!key) {
          key = "asset-" + crypto.randomUUID();
          p.assets[key] = a;
        }
        if (kind === "bg") p.background.image = key;
        else for (const w of ws) w[kind] = key;
      });
    } catch (e) {
      notice(e.message);
    } finally {
      input.value = "";
    }
  };
}
for (const delta of [-1, 1])
  $(delta < 0 ? "layer-back" : "layer-front").onclick = () =>
    command("Drawing order", (p) => {
      const id = selected()[0]?.id,
        n = p.items.findIndex((w) => w.id === id),
        next = n + delta;
      if (n >= 0 && next >= 0 && next < p.items.length)
        [p.items[n], p.items[next]] = [p.items[next], p.items[n]];
    });
$("align").onchange = () => {
  const kind = $("align").value;
  command("Align items", () => {
    const ws = unlocked();
    if (ws.length < 2) return;
    const b = groupBounds(ws);
    if (kind === "left" || kind === "top")
      for (const w of ws)
        w[kind === "left" ? "x" : "y"] = b[kind === "left" ? "x" : "y"];
    else {
      ws.sort((a, b) => a.x - b.x);
      const gap = (b.w - ws.reduce((s, w) => s + w.w, 0)) / (ws.length - 1);
      if (gap < 0) throw Error("Not enough space");
      let x = b.x;
      for (const w of ws) {
        w.x = x;
        x += w.w + gap;
      }
    }
  });
  $("align").value = "";
};
let prefStorage;
try {
  prefStorage = localStorage;
} catch {}
const preferences = new EditorPreferences(namespace, prefStorage, notice);
$("snap").value = preferences.value.sections.homeSnap === "1" ? "1" : "8";
$("snap").onchange = () =>
  preferences.set({
    sections: { ...preferences.value.sections, homeSnap: $("snap").value },
  });
let fullSize = preferences.value.sections.homeFull === true;
canvas.style.width = fullSize ? "800px" : "";
$("zoom").onclick = () => {
  fullSize = !fullSize;
  canvas.style.width = fullSize ? "800px" : "";
  preferences.set({
    sections: { ...preferences.value.sections, homeFull: fullSize },
  });
};
const point = (e) => {
  const b = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - b.left) * 800) / b.width,
    y: ((e.clientY - b.top) * 480) / b.height,
  };
};
canvas.onpointerdown = (e) => {
  if (e.button !== 0 || blocked) return;
  const p = point(e),
    w = [...store.project.items]
      .reverse()
      .find(
        (w) =>
          !w.hidden &&
          p.x >= w.x &&
          p.x <= w.x + w.w &&
          p.y >= w.y &&
          p.y <= w.y + w.h,
      );
  if (trying) {
    if (w) {
      focused = w.id;
      draw();
      open();
    }
    return;
  }
  if (!w) {
    store.view.selection = [];
    refresh();
    return;
  }
  store.view.selection = e.shiftKey
    ? [...new Set([...store.view.selection, w.id])]
    : store.view.selection.includes(w.id)
      ? store.view.selection
      : [w.id];
  refresh();
  if (w.locked) return;
  store.begin();
  drag = {
    start: p,
    items: M.clone(unlocked()),
    resize: p.x > w.x + w.w - 16 && p.y > w.y + w.h - 16,
  };
  canvas.setPointerCapture(e.pointerId);
  canvas.focus();
};
canvas.onpointermove = (e) => {
  if (!drag) return;
  const p = point(e),
    snap = Number($("snap").value),
    dx = Math.round((p.x - drag.start.x) / snap) * snap,
    dy = Math.round((p.y - drag.start.y) / snap) * snap;
  for (const original of drag.items)
    Object.assign(
      store.project.items.find((w) => w.id === original.id),
      original,
    );
  const ws = unlocked();
  if (drag.resize) {
    for (const w of ws) {
      w.w = Math.max(48, Math.min(800 - w.x, w.w + dx));
      w.h = Math.max(64, Math.min(480 - w.y, w.h + dy));
    }
  } else {
    const shift = snapSelection(
      ws,
      store.project.items.filter((w) => !store.view.selection.includes(w.id)),
      dx,
      dy,
    );
    moveGroup(ws, shift.dx, shift.dy);
  }
  draw();
};
canvas.onpointerup = () => {
  if (!drag) return;
  drag = null;
  try {
    store.commit("Transform items");
  } catch (e) {
    notice(e.message);
  }
};
canvas.onpointercancel = () => {
  drag = null;
  store.cancel();
  refresh();
};
window.addEventListener("keydown", (e) => {
  if (blocked) return;
  if (!active || e.target.matches("input,select,textarea")) return;
  const key = e.key.toLowerCase();
  if (trying) {
    if (key === "arrowleft") navigate(-1);
    else if (key === "arrowright") navigate(1);
    else if (key === "enter") open();
    else if (key === "escape") {
      trying = false;
      refresh();
    } else if (key === "home") $("home").click();
    else return;
    e.preventDefault();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && key === "z") {
    e.preventDefault();
    e.shiftKey ? store.redo() : store.undo();
  } else if ((e.ctrlKey || e.metaKey) && key === "d") {
    e.preventDefault();
    add(true);
  } else if (key === "delete" || key === "backspace") {
    e.preventDefault();
    $("remove").click();
  } else if (key.startsWith("arrow")) {
    e.preventDefault();
    const n = e.shiftKey ? 8 : 1;
    command("Nudge items", () =>
      moveGroup(
        unlocked(),
        key === "arrowleft" ? -n : key === "arrowright" ? n : 0,
        key === "arrowup" ? -n : key === "arrowdown" ? n : 0,
      ),
    );
  }
});
for (const [id, key] of [
  ["look-frame", "frame"],
  ["look-font", "font"],
  ["look-color", "labelColor"],
  ["look-size", "labelSize"],
])
  $(id).onchange = () =>
    command("Look", (p) => {
      const value =
        key === "labelSize" ? Math.round(Number($(id).value)) : $(id).value;
      p.look = { ...(p.look || {}), [key]: value };
    });
$("menu-name").onchange = () =>
  command("Rename menu", (p) => {
    const name = $("menu-name").value.trim();
    if (name) p.name = name;
    else delete p.name;
  });
// The MiatOff app keeps sent menus under "Your menus"; a menu with the same name is replaced.
$("send").onclick = async () => {
  $("send").disabled = true;
  try {
    const session = await fetch("/api/builder/session", { cache: "no-store" });
    if (!session.ok)
      throw Error("open the designer from the MiatOff app to send menus to it");
    const connection = await session.json();
    if (connection.service !== "MiatOffDesigner" || !connection.token)
      throw Error("this server cannot receive Home menus");
    if (params.get("test") === "1" && !connection.testLibrary)
      throw Error("test drafts can only send to a temporary test library");
    const response = await fetch("/api/builder/home", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MiatOff-Token": connection.token,
      },
      body: JSON.stringify(M.clean(store.project)),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(result.error || "MiatOff could not save this menu");
    notice(
      `Sent "${result.name}" (${result.items} items) to MiatOff. Choose it under Your menus in the app.`,
    );
  } catch (e) {
    notice("Not sent: " + e.message);
  } finally {
    $("send").disabled = false;
  }
};
$("export").onclick = () =>
  download(JSON.stringify(M.clean(store.project), null, 2), "mazda-home.json");
$("png").onclick = () => {
  draw(false);
  canvas.toBlob((b) => download(b, "mazda-home.png", "image/png"));
  draw();
};
$("import").onclick = () => $("file").click();
$("file").onchange = async () => {
  const file = $("file").files[0],
    at = generation,
    token = epoch;
  if (!file) return;
  try {
    if (file.size > 8388608) throw Error("Design exceeds 8 MiB");
    const next = await M.decode(M.migrate(JSON.parse(await file.text())));
    if (token !== epoch || at !== generation)
      throw Error("Design changed during import; retry");
    command("Import Home design", () => {
      store.project = next;
      store.view.selection = [];
    });
  } catch (e) {
    notice("Import failed: " + e.message);
  } finally {
    $("file").value = "";
  }
};
// The app's built-in menus, to start from (they are copied into this draft, with their artwork).
fetch("/api/builder/home", { cache: "no-store" })
  .then((r) => (r.ok ? r.json() : { menus: [] }))
  .then(({ menus = [] }) => {
    for (const m of menus.filter((m) => m.builtIn)) {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.name;
      $("starter").append(o);
    }
    $("starter").hidden = $("starter").closest("label").hidden = !menus.some(
      (m) => m.builtIn,
    );
  })
  .catch(() => {});
$("starter").onchange = async () => {
  const id = $("starter").value,
    at = generation,
    token = epoch;
  $("starter").value = "";
  if (!id) return;
  try {
    const response = await fetch(`/api/builder/home/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    const doc = await response.json();
    if (!response.ok) throw Error(doc.error || "Menu not found");
    const next = await M.decode(M.migrate(doc));
    if (token !== epoch || at !== generation)
      throw Error("Design changed while loading; retry");
    command("Start from " + (doc.name || "built-in"), () => {
      store.project = next;
      store.view.selection = [];
    });
  } catch (e) {
    notice("Could not start from that menu: " + e.message);
  }
};
$("reset").onclick = () =>
  command("New design", () => {
    store.project = M.defaults();
    store.view.selection = [];
  });
async function load() {
  blocked = true;
  epoch++;
  generation++;
  clearTimeout(timer);
  await saveChain;
  try {
    const saved = await persistence.load();
    if (saved) {
      store.project = await M.decode(M.migrate(saved.raw));
      store.view.selection = [];
      store.undoStack = [];
      store.redoStack = [];
    }
    blocked = false;
    dirty = !saved && dirty;
    $("recovery").hidden = true;
    notice();
    refresh();
  } catch (e) {
    blocked = true;
    notice(
      "Draft could not be opened: " +
        e.message +
        ". Use Export saved draft to keep a copy, then recover with a new design.",
    );
    $("recovery").hidden = false;
    refresh();
  }
  await showOriginal();
}
// Export a stored (packed) document with its artwork when that can still be read, else its layout alone.
async function exportStored(doc, name) {
  if (!doc) return notice("There is no saved draft to export.");
  let out = doc,
    note = "";
  try {
    out = await persistence.hydrate(doc);
  } catch (e) {
    note =
      " Its artwork could not be read (" +
      e.message +
      "), so the file has the layout only and cannot be imported as it is.";
  }
  download(JSON.stringify(out, null, 2), name);
  notice("Exported " + name + "." + note);
}
async function showOriginal() {
  $("export-original").hidden = !(await persistence
    .originalSource()
    .catch(() => null));
}
$("export-saved").onclick = async () => {
  try {
    await exportStored(
      await persistence.current(),
      "mazda-home-saved-draft.json",
    );
  } catch (e) {
    notice("Export failed: " + e.message);
  }
};
$("export-original").onclick = async () => {
  try {
    await exportStored(
      await persistence.originalSource(),
      "mazda-home-retained-draft.json",
    );
  } catch (e) {
    notice("Export failed: " + e.message);
  }
};
$("reload").onclick = load;
let recoverArmed = false;
$("recover").onclick = async () => {
  try {
    // Only the first draft replaced by a recovery is retained; a later one stays only in the short history.
    if (!recoverArmed && (await persistence.originalSource())) {
      recoverArmed = true;
      return notice(
        "A draft from an earlier recovery is already retained, so this saved draft would not be. " +
          "Use Export saved draft first, then press Recover with a new design again.",
      );
    }
    recoverArmed = false;
    epoch++;
    clearTimeout(timer);
    await saveChain;
    await persistence.prepareReplacement();
    // Retain what is being replaced now (possibly another tab's newer draft), not the draft this tab opened.
    persistence.original = (await persistence.current()) ?? persistence.original;
    blocked = false;
    store.project = M.defaults();
    store.view.selection = [];
    store.undoStack = [];
    store.redoStack = [];
    dirty = true;
    generation++;
    await flush();
    // The bar stays only if saving the new design was refused (a newer draft elsewhere).
    $("recovery").hidden = !blocked;
    refresh();
    await showOriginal();
  } catch (e) {
    blocked = true;
    notice("Recovery failed: " + e.message);
  }
};
channel.onmessage = (e) => {
  if (e.data.session !== session && e.data.revision > persistence.revision) {
    blocked = true;
    notice(
      "Another tab saved a newer Home draft. Reload it before editing; Export design keeps a copy of this tab's version.",
    );
    $("recovery").hidden = false;
    refresh();
  }
};
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
// Labels may use the Meters fonts; canvas text needs them loaded first.
Promise.all(
  M.fonts
    .filter((font) => font !== "Arial")
    .map((font) => document.fonts.load(`16px "${font}"`)),
)
  .then(() => active && refresh())
  .catch(() => {});
window.HomeDesigner = {
  // The shared header's buttons, and its view of this designer's state.
  act(name) {
    const button = { undo: "undo", redo: "redo", try: "try", send: "send", export: "export" }[name];
    if (button && !$(button).disabled) $(button).click();
  },
  onChrome(listener) {
    chromeListener = listener;
    chrome();
  },
  ready: load(),
  async setActive(value) {
    epoch++;
    active = value;
    if (!active) {
      if (drag) {
        drag = null;
        store.cancel();
      }
      await flush();
    } else refresh();
  },
  store,
  persistence,
};

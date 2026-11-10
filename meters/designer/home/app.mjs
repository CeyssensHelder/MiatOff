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
      store.project = M.clean(p);
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
        $("save-status").textContent = "Saved locally";
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
  for (const w of p.items) {
    if (w.hidden) continue;
    const chosen = trying
      ? w.id === focused
      : store.view.selection.includes(w.id);
    const img = image((chosen && w.selected) || w.normal);
    const size = Math.min(w.w - 8, w.h - 28);
    ctx.save();
    ctx.strokeStyle = chosen ? p.accent : "#8997aa";
    ctx.lineWidth = chosen ? 4 : 1;
    ctx.strokeRect(w.x + 2, w.y + 2, w.w - 4, w.h - 4);
    if (img) {
      const s = Math.min(size / img.width, size / img.height);
      ctx.drawImage(
        img,
        w.x + (w.w - img.width * s) / 2,
        w.y + 4,
        img.width * s,
        img.height * s,
      );
    } else {
      ctx.fillStyle = "#e5eaf4";
      ctx.font = Math.min(size * 0.6, 40) + "px Arial";
      ctx.textAlign = "center";
      ctx.fillText(symbol[w.opens] || "•", w.x + w.w / 2, w.y + size * 0.75);
    }
    ctx.beginPath();
    ctx.rect(w.x + 4, w.y, w.w - 8, w.h);
    ctx.clip();
    ctx.fillStyle = "#fff";
    ctx.font = "14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(w.label, w.x + w.w / 2, w.y + w.h - 8);
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
  $("bg-color").value = p.background.color;
  $("bg-fit").value = p.background.fit;
  $("accent").value = p.accent;
  $("undo").disabled = blocked || !store.undoStack.length;
  $("redo").disabled = blocked || !store.redoStack.length;
  $("add").disabled = p.items.length >= 12;
  $("remove").disabled =
    !selection.length || selection.length >= p.items.length;
  $("duplicate").disabled = !w || p.items.length >= 12;
  $("navigation").hidden = !trying;
  $("try").textContent = trying ? "Back to design" : "Try menu";
  const issues = M.checks(p, ctx);
  $("checks").replaceChildren(
    ...issues.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }),
  );
  $("check-count").textContent = "Design checks (" + issues.length + ")";
  draw();
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
$("duplicate").onclick = () => add(true);
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
      target = selected()[0]?.id,
      at = generation,
      token = epoch;
    if (!file) return;
    try {
      if (kind !== "bg" && !target) throw Error("Select an item");
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
        const w = p.items.find((w) => w.id === target);
        if (kind !== "bg" && (!w || w.locked))
          throw Error("Target item unavailable");
        let key = Object.keys(p.assets).find(
          (k) => p.assets[k].data === a.data,
        );
        if (!key) {
          key = "asset-" + crypto.randomUUID();
          p.assets[key] = a;
        }
        if (kind === "bg") p.background.image = key;
        else w[kind] = key;
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
canvas.style.width = fullSize ? "800px" : "100%";
$("zoom").onclick = () => {
  fullSize = !fullSize;
  canvas.style.width = fullSize ? "800px" : "100%";
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
  } else if (key === "delete") $("remove").click();
  else if (key.startsWith("arrow")) {
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
        "; export your current design or recover explicitly.",
    );
    $("recovery").hidden = false;
    refresh();
  }
}
$("reload").onclick = load;
$("recover").onclick = async () => {
  try {
    epoch++;
    clearTimeout(timer);
    await saveChain;
    await persistence.prepareReplacement();
    blocked = false;
    store.project = M.defaults();
    store.view.selection = [];
    store.undoStack = [];
    store.redoStack = [];
    dirty = true;
    generation++;
    await flush();
    $("recovery").hidden = blocked;
    refresh();
  } catch (e) {
    blocked = true;
    notice("Recovery failed: " + e.message);
  }
};
channel.onmessage = (e) => {
  if (e.data.session !== session && e.data.revision > persistence.revision) {
    blocked = true;
    notice(
      "Another tab saved a newer Home draft. Reload it before editing; export your current design to keep a copy.",
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
window.HomeDesigner = {
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

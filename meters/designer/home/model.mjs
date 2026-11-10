// SPDX-License-Identifier: GPL-3.0-or-later
import "./legacy.js";
const legacy = globalThis.MiatOffMenu;
export const destinations = legacy.destinations;
export const clone = (value) => structuredClone(value);
export function migrate(raw) {
  if (raw.kind === "HomeMenuDocument") return validate(clone(raw));
  const old = legacy.validate(raw),
    assets = {};
  function asset(data) {
    if (!data) return null;
    let key = Object.keys(assets).find((k) => assets[k].data === data);
    if (!key) {
      key = "asset-" + Object.keys(assets).length;
      assets[key] = { data };
    }
    return key;
  }
  return validate({
    kind: "HomeMenuDocument",
    version: 1,
    background: {
      color: old.background,
      image: asset(old.backgroundImage),
      fit: old.backgroundFit,
    },
    accent: old.accent,
    items: old.items
      .map((w, i) => ({
        ...w,
        opens: w.opens,
        normal: asset(w.icons.normal),
        selected: asset(w.icons.selected),
        ...(old.layout === "free"
          ? w.position
          : legacy.position(old.layout, i, old.items.length)),
        w: 120,
        h: 136,
        locked: false,
        hidden: false,
      }))
      .map(({ icons, position, ...w }) => w),
    order: old.items.map((w) => w.id),
    assets,
  });
}
export function defaults() {
  return migrate(legacy.defaults());
}
export function validate(p) {
  if (!p || p.kind !== "HomeMenuDocument" || p.version !== 1)
    throw Error("Choose a Home menu design");
  if (!Array.isArray(p.items) || p.items.length < 1 || p.items.length > 12)
    throw Error("Use 1 to 12 items");
  if (
    !p.assets ||
    typeof p.assets !== "object" ||
    Array.isArray(p.assets) ||
    Object.keys(p.assets).length > 25
  )
    throw Error("Invalid artwork table");
  const ids = new Set();
  const color = (x) => typeof x === "string" && /^#[a-f0-9]{6}$/i.test(x);
  if (
    !p.background ||
    !color(p.background.color) ||
    !color(p.accent) ||
    !["cover", "contain"].includes(p.background.fit)
  )
    throw Error("Invalid background");
  for (const a of Object.values(p.assets))
    if (
      typeof a.data !== "string" ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(a.data) ||
      a.data.length > 2796230
    )
      throw Error("Use embedded PNG artwork");
  const ref = (k) =>
    k === null || (typeof k === "string" && Object.hasOwn(p.assets, k));
  if (!ref(p.background.image)) throw Error("Missing background artwork");
  for (const w of p.items) {
    if (
      typeof w.id !== "string" ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(w.id) ||
      ids.has(w.id)
    )
      throw Error("Invalid item identity");
    ids.add(w.id);
    if (
      typeof w.label !== "string" ||
      !w.label.trim() ||
      w.label.length > 20 ||
      /[^\x20-\x7e]/.test(w.label)
    )
      throw Error("Use a name of 1 to 20 English characters");
    if (
      !destinations.some((d) => d.id === w.opens) ||
      !ref(w.normal) ||
      !ref(w.selected)
    )
      throw Error("Invalid destination or icon");
    if (typeof w.locked !== "boolean" || typeof w.hidden !== "boolean")
      throw Error("Invalid item visibility");
    for (const k of ["x", "y", "w", "h"])
      if (!Number.isFinite(w[k])) throw Error("Invalid item dimensions");
    if (
      w.x < 0 ||
      w.y < 0 ||
      w.w < 48 ||
      w.h < 64 ||
      w.x + w.w > 800 ||
      w.y + w.h > 480
    )
      throw Error("Keep items inside the screen (minimum 48 by 64)");
  }
  if (
    !Array.isArray(p.order) ||
    p.order.length !== ids.size ||
    new Set(p.order).size !== ids.size ||
    p.order.some((k) => !ids.has(k))
  )
    throw Error("Invalid Commander order");
  if (new TextEncoder().encode(JSON.stringify(p)).length > 8388608)
    throw Error("Design exceeds 8 MiB");
  return p;
}
export async function decode(p) {
  for (const a of Object.values(p.assets)) {
    const blob = await (await fetch(a.data)).blob();
    if (blob.size > 2097152) throw Error("Artwork exceeds 2 MiB");
    const b = await createImageBitmap(blob);
    try {
      if (b.width < 1 || b.height < 1 || b.width > 800 || b.height > 480)
        throw Error("Artwork exceeds 800 by 480");
      a.width = b.width;
      a.height = b.height;
    } finally {
      b.close();
    }
  }
  return p;
}
export function clean(p) {
  p = clone(p);
  const refs = new Set([
    p.background.image,
    ...p.items.flatMap((w) => [w.normal, w.selected]),
  ]);
  for (const k of Object.keys(p.assets)) if (!refs.has(k)) delete p.assets[k];
  return validate(p);
}
export function checks(p, ctx) {
  const issues = [];
  for (const w of p.items.filter((w) => !w.hidden)) {
    if (w.y < 64 || w.y + w.h > 438)
      issues.push(w.label + ": overlaps reserved screen area");
    ctx.font = "14px Arial";
    if (ctx.measureText(w.label).width > w.w - 8)
      issues.push(w.label + ": caption will be clipped");
    for (const other of p.items)
      if (
        !other.hidden &&
        p.items.indexOf(other) > p.items.indexOf(w) &&
        w.x < other.x + other.w &&
        w.x + w.w > other.x &&
        w.y < other.y + other.h &&
        w.y + w.h > other.y
      )
        issues.push(w.label + " overlaps " + other.label);
  }
  return issues;
}

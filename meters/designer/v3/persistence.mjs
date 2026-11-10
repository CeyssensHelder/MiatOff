// SPDX-License-Identifier: GPL-3.0-or-later
import { clone, validate } from "./model.mjs";
import { Persistence as BasePersistence } from "../shared/persistence.mjs";
export { DraftConflict } from "../shared/persistence.mjs";
export { normalizeImage } from "../shared/images.mjs";
export class Persistence extends BasePersistence {
  constructor(name = "miatoff-studio") {
    super(name, { validate });
  }
}
export async function decodeAssets(project) {
  for (const a of Object.values(project.assets ?? {})) {
    const response = await fetch(a.data),
      blob = await response.blob();
    if (blob.size > 1.5 * 1024 * 1024) throw Error("Image exceeds 1.5 MiB");
    const bitmap = await createImageBitmap(blob);
    try {
      if (
        bitmap.width > 800 ||
        bitmap.height > 480 ||
        bitmap.width < 1 ||
        bitmap.height < 1
      )
        throw Error("Image exceeds normalized dimensions");
      if (
        (a.width !== undefined && a.width !== bitmap.width) ||
        (a.height !== undefined && a.height !== bitmap.height)
      )
        throw Error("Image dimensions do not match");
      a.width = bitmap.width;
      a.height = bitmap.height;
    } finally {
      bitmap.close();
    }
  }
  const byData = new Map(),
    remap = new Map();
  for (const [key, a] of Object.entries(project.assets)) {
    if (byData.has(a.data)) {
      remap.set(key, byData.get(a.data));
      delete project.assets[key];
    } else byData.set(a.data, key);
  }
  for (const t of project.themes)
    for (const bg of [
      t.background,
      t.dayBackground,
      ...t.pages.flatMap((p) => [p.background, p.dayBackground]),
    ].filter(Boolean))
      if (remap.has(bg.asset)) bg.asset = remap.get(bg.asset);
  return project;
}

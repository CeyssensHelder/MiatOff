// SPDX-License-Identifier: GPL-3.0-or-later
import { clone, validate } from "./model.mjs";
import { prepareAssets, render } from "./renderer.mjs";
export function referencedAssets(project, theme) {
  const keys = new Set(
    [
      theme.background?.asset,
      theme.dayBackground?.asset,
      ...theme.pages.flatMap((p) => [
        p.background?.asset,
        p.dayBackground?.asset,
      ]),
    ].filter(Boolean),
  );
  return Object.fromEntries(
    Object.entries(project.assets).filter(([key]) => keys.has(key)),
  );
}
export function setupDocument(project) {
  const out = clone({ ...project, assets: {} });
  out.assets = Object.assign(
    {},
    ...out.themes.map((t) => referencedAssets(project, t)),
  );
  return validate(out);
}
export function themeDocument(project, theme) {
  const assets = referencedAssets(project, theme);
  validate({
    ...project,
    themes: [theme],
    library: [],
    assets,
    initialTheme: theme.id,
    initialPage: 0,
  });
  return { version: 3, kind: "ThemeDocument", theme: clone(theme), assets };
}
export async function png({
  theme,
  pages,
  entries = null,
  assets,
  state,
  mode = "night",
  contact = false,
}) {
  await document.fonts.ready;
  await prepareAssets(assets);
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = pages.length * (480 + (contact ? 40 : 0));
  const c = canvas.getContext("2d");
  for (const [i, page] of pages.entries()) {
    c.save();
    c.translate(0, i * (contact ? 520 : 480));
    if (contact) {
      c.fillStyle = "#101b29";
      c.fillRect(0, 0, 800, 40);
      c.fillStyle = "#ffffff";
      c.font = "20px Arial";
      c.fillText(page.name + " · " + mode, 16, 28);
      c.translate(0, 40);
    }
    render(c, entries?.[i]?.theme ?? theme, page, assets, state, { mode });
    c.restore();
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) =>
      blob ? resolve(blob) : reject(Error("PNG encoding failed")),
    ),
  );
}

// SPDX-License-Identifier: GPL-3.0-or-later
import * as M from "./model.mjs";

// Existing v3 style containers remain portable implementation details. The UI
// presents one flat Custom collection, including pages from older projects.
export function allPages(project) {
  const entries = project.themes.flatMap((owner) =>
    owner.pages.map((page) => ({ owner, page })),
  );
  const counts = new Map(),
    used = new Map();
  entries.forEach(({ page }) =>
    counts.set(page.name, (counts.get(page.name) ?? 0) + 1),
  );
  return entries.map((entry) => {
    const { owner, page } = entry;
    const base =
      counts.get(page.name) > 1 &&
      M.names.includes(owner.name) &&
      ["DRIVE", "TELEMETRY"].includes(page.name)
        ? `${owner.name} ${page.name === "DRIVE" ? "driving" : "telemetry"}`
        : page.name;
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return {
      ...entry,
      name: count === 1 ? base : `${base.slice(0, 74)} (${count})`,
    };
  });
}

export function editableStyle(owner, page, mode) {
  const key = mode === "day" ? "dayStyle" : "style";
  page[key] ??= M.clone(M.pageTheme(owner, page)[key]);
  return page[key];
}

export function addPage(project, page) {
  let owner = project.themes.find((theme) => theme.pages.length < 8);
  if (!owner) {
    if (project.themes.length >= 8)
      throw Error(
        "Maximum 64 custom pages. Export a backup before removing pages.",
      );
    owner = M.starter();
    owner.name = "Custom";
    owner.pages = [];
    project.themes.push(owner);
  }
  owner.pages.push(page);
  return owner;
}

export function pageFromStarter(name = null, index = 0) {
  const source = M.starter(name ?? "Street");
  const page = M.clone(source.pages[index]);
  page.name = name
    ? `${name} ${index === 0 ? "driving" : "telemetry"}`
    : "Untitled page";
  page.style = M.clone(source.style);
  page.dayStyle = M.clone(source.dayStyle);
  page.background = M.clone(source.background);
  page.dayBackground = M.clone(source.dayBackground);
  if (!name) {
    page.widgets = [];
    page.background = { ...M.background(), kind: "solid", color: "#0b1018" };
  }
  return page;
}

export function pageSnapshot(project, owner, page) {
  const theme = M.clone(M.pageTheme(owner, page));
  theme.name = page.name;
  theme.pages = [M.clone(page)];
  return {
    ...project,
    themes: [theme],
    initialTheme: theme.id,
    initialPage: 0,
    library: [],
  };
}

// SPDX-License-Identifier: GPL-3.0-or-later
const rect = (x, y, w, h) => ({ x, y, w: Math.max(0, w), h: Math.max(0, h) });
export function moveGroup(widgets, dx, dy) {
  if (!widgets.length) return;
  const minX = Math.min(...widgets.map((w) => w.x)),
    minY = Math.min(...widgets.map((w) => w.y)),
    maxX = Math.max(...widgets.map((w) => w.x + w.w)),
    maxY = Math.max(...widgets.map((w) => w.y + w.h));
  dx = Math.max(-minX, Math.min(800 - maxX, dx));
  dy = Math.max(-minY, Math.min(480 - maxY, dy));
  widgets.forEach((w) => {
    w.x += dx;
    w.y += dy;
  });
}
export function groupBounds(ws) {
  return rect(
    Math.min(...ws.map((w) => w.x)),
    Math.min(...ws.map((w) => w.y)),
    Math.max(...ws.map((w) => w.x + w.w)) - Math.min(...ws.map((w) => w.x)),
    Math.max(...ws.map((w) => w.y + w.h)) - Math.min(...ws.map((w) => w.y)),
  );
}
// Return alignment guides independently of paint state so pointer and keyboard tools can share them.
export function snapSelection(widgets, others, dx, dy, tolerance = 4) {
  if (!widgets.length) return { dx, dy, guides: [] };
  const b = groupBounds(widgets),
    guides = [];
  for (const axis of ["x", "y"]) {
    const size = axis === "x" ? "w" : "h",
      delta = axis === "x" ? dx : dy,
      edges = [
        b[axis] + delta,
        b[axis] + b[size] / 2 + delta,
        b[axis] + b[size] + delta,
      ];
    let best = null;
    for (const other of others.filter(
      (w) => !w.hidden && w.role !== "background",
    ))
      for (const edge of [
        other[axis],
        other[axis] + other[size] / 2,
        other[axis] + other[size],
      ])
        for (const own of edges) {
          const distance = edge - own;
          if (
            Math.abs(distance) <= tolerance &&
            (!best || Math.abs(distance) < Math.abs(best.distance))
          )
            best = { distance, edge };
        }
    if (best) {
      if (axis === "x") dx += best.distance;
      else dy += best.distance;
      guides.push({ axis, at: best.edge });
    }
  }
  return { dx, dy, guides };
}
export function equalGaps(widgets) {
  const guides = [];
  for (const axis of ["x", "y"]) {
    const size = axis === "x" ? "w" : "h",
      cross = axis === "x" ? "y" : "x",
      ws = [...widgets]
        .filter((w) => !w.hidden && w.role !== "background")
        .sort((a, b) => a[axis] - b[axis]);
    for (let i = 1; i < ws.length - 1; i++) {
      const a = ws[i - 1],
        b = ws[i],
        c = ws[i + 1],
        gap = b[axis] - a[axis] - a[size],
        next = c[axis] - b[axis] - b[size];
      if (
        gap >= 0 &&
        Math.abs(gap - next) < 1 &&
        Math.abs(a[cross] - b[cross]) < 4 &&
        Math.abs(c[cross] - b[cross]) < 4
      )
        guides.push({
          axis,
          gap,
          at: b[cross],
          start: a[axis] + a[size],
          end: b[axis],
        });
    }
  }
  return guides;
}

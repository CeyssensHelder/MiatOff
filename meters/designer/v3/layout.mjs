// SPDX-License-Identifier: GPL-3.0-or-later
import {
  defaultStyle,
  pageTheme,
  registry,
  range,
  toUnit,
  warning,
  intersects,
} from "./model.mjs";
export const rect = (x, y, w, h) => ({
  x,
  y,
  w: Math.max(0, w),
  h: Math.max(0, h),
});
export const contains = (outer, inner, tolerance = 0.1) =>
  inner.x >= outer.x - tolerance &&
  inner.y >= outer.y - tolerance &&
  inner.x + inner.w <= outer.x + outer.w + tolerance &&
  inner.y + inner.h <= outer.y + outer.h + tolerance;
export function styleFor(theme, w, mode = "night") {
  return {
    ...defaultStyle,
    ...(mode === "day" ? theme.dayStyle : theme.style),
    ...w.style,
  };
}
export function measurement(ctx, w, theme, state, mode = "night") {
  const s = styleFor(theme, w, mode),
    effect =
      w.variant === "inset"
        ? "inset"
        : s.effect === "flat" && w.variant === "framed"
          ? "framed"
          : s.effect,
    outer = rect(w.x, w.y, w.w, w.h),
    extent =
      effect === "neon"
        ? s.glow * s.intensity
        : effect === "raised"
          ? s.shadowBlur * s.intensity +
            Math.max(Math.abs(s.shadowX), Math.abs(s.shadowY))
          : 2;
  const margin = Math.min(Math.max(2, extent), w.w / 6, w.h / 6),
    panel = rect(
      w.x + margin,
      w.y + margin,
      w.w - 2 * margin,
      w.h - 2 * margin,
    ),
    radius = Math.min(s.radius, panel.w / 3, panel.h / 3),
    padding = Math.min(
      panel.w / 2,
      panel.h / 2,
      Math.max(10, s.borderWidth + s.bevel + (1 - Math.SQRT1_2) * radius + 6),
    ),
    content = rect(
      panel.x + padding,
      panel.y + padding,
      panel.w - 2 * padding,
      panel.h - 2 * padding,
    ),
    diagnostics = [],
    runs = [];
  const capH =
      w.labelPosition === "hidden" || w.type === "shape"
        ? 0
        : Math.min(s.captionSize + 8, content.h * 0.3),
    footH =
      ((w.type === "lap" && w.variant === "full") ||
        (w.type === "gmeter" && w.peaks) ||
        w.type === "power") &&
      content.h > 110
        ? 26
        : 0,
    unitH =
      w.unitPosition === "separate"
        ? Math.min(s.unitSize + 6, content.h * 0.2)
        : 0;
  const caption = rect(
      content.x,
      w.labelPosition === "bottom" ? content.y + content.h - capH : content.y,
      content.w,
      capH,
    ),
    plot = rect(
      content.x,
      content.y + (w.labelPosition === "top" ? capH : 0),
      content.w,
      content.h - capH - footH - unitH,
    ),
    footer = rect(
      content.x,
      content.y + content.h - footH - (w.labelPosition === "bottom" ? capH : 0),
      content.w,
      footH,
    ),
    unitRect = rect(content.x, plot.y + plot.h, content.w, unitH);
  const result = {
    widgetId: w.id,
    outer,
    panel,
    paintBounds: outer,
    content,
    caption,
    value: plot,
    plot,
    footer,
    unit: unitRect,
    radius,
    style: s,
    effect,
    textRuns: runs,
    diagnostics,
  };
  result.text = (
    text,
    box,
    preferred,
    {
      align = s.align,
      minimum = 12,
      role = "value",
      weight = s.weight,
      draw = true,
    } = {},
  ) => {
    text = String(text);
    ctx.font = `${weight} ${preferred}px "${s.font}"`;
    let metrics = ctx.measureText(text),
      h =
        (metrics.actualBoundingBoxAscent ?? preferred * 0.8) +
        (metrics.actualBoundingBoxDescent ?? preferred * 0.2);
    const fit = Math.min(
      preferred,
      (preferred * box.w) / Math.max(1, metrics.width),
      (preferred * box.h) / Math.max(1, h + 3),
    );
    let size = Math.max(8, fit);
    if (fit < 8) {
      diagnostics.push({
        kind: "unreadable",
        message: "Text cannot fit at 8 px",
        widgetIds: [w.id],
      });
      return null;
    }
    ctx.font = `${weight} ${size}px "${s.font}"`;
    metrics = ctx.measureText(text);
    for (
      let attempt = 0;
      attempt < 10 &&
      ((metrics.actualBoundingBoxAscent ?? size * 0.8) +
        (metrics.actualBoundingBoxDescent ?? size * 0.2) >
        box.h ||
        metrics.width > box.w);
      attempt++
    ) {
      size -= 0.5;
      if (size < 8) {
        diagnostics.push({
          kind: "unreadable",
          message: "Text cannot fit at a readable size",
          widgetIds: [w.id],
        });
        return null;
      }
      ctx.font = `${weight} ${size}px "${s.font}"`;
      metrics = ctx.measureText(text);
    }
    const ascent = metrics.actualBoundingBoxAscent ?? size * 0.8,
      descent = metrics.actualBoundingBoxDescent ?? size * 0.2,
      x =
        align === "center"
          ? box.x + box.w / 2
          : align === "right"
            ? box.x + box.w
            : box.x,
      y = box.y + (box.h - ascent - descent) / 2 + ascent;
    const left =
        align === "center"
          ? x - metrics.width / 2
          : align === "right"
            ? x - metrics.width
            : x,
      bounds = rect(left, y - ascent, metrics.width, ascent + descent);
    if (size < minimum)
      diagnostics.push({
        kind: "small-text",
        message: `${role} is ${size.toFixed(0)} px; target ${minimum} px`,
        widgetIds: [w.id],
      });
    if (!contains(content, bounds))
      diagnostics.push({
        kind: "text-clipping",
        message: `${role} exceeds safe content`,
        widgetIds: [w.id],
      });
    runs.push({ text, bounds, size, role, box });
    if (draw) {
      ctx.textAlign = align;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(text, x, y);
    }
    return bounds;
  };
  const unit = range(w, state.vehicle).unit,
    value = toUnit(state[w.signal], w.signal, unit);
  result.unitLabel = w.signal ? unit : "";
  result.formatted =
    value === null
      ? "—"
      : w.signal === "gear"
        ? Math.round(value) === 0
          ? "N"
          : Math.round(value) < 0
            ? "R"
            : String(Math.round(value))
        : value.toFixed(w.decimals);
  result.warning = warning(w, state, state.vehicle);
  if (w.w < registry[w.type].minSize[0] || w.h < registry[w.type].minSize[1])
    diagnostics.push({
      kind: "compact",
      message: "Compact rendering: secondary detail is reduced",
      widgetIds: [w.id],
    });
  return result;
}
export function pairs(page, gap = 0) {
  const result = [];
  for (let i = 0; i < page.widgets.length; i++)
    for (let j = i + 1; j < page.widgets.length; j++) {
      const a = page.widgets[i],
        b = page.widgets[j];
      if (
        a.hidden ||
        b.hidden ||
        a.role === "background" ||
        b.role === "background"
      )
        continue;
      const exempt = page.overlaps.some(
        (p) => (p.a === a.id && p.b === b.id) || (p.a === b.id && p.b === a.id),
      );
      if (!exempt && intersects(a, b, gap))
        result.push({
          kind: gap ? "spacing" : "overlap",
          message: `${a.label || a.type} ↔ ${b.label || b.type}`,
          widgetIds: [a.id, b.id],
        });
    }
  return result;
}
export function place(w, page, { gap = 8, margin = 8 } = {}) {
  for (let y = margin; y + w.h <= 480 - margin; y += 8)
    for (let x = margin; x + w.w <= 800 - margin; x += 8) {
      const candidate = { ...w, x, y };
      if (
        !page.widgets.some(
          (a) =>
            a.id !== w.id &&
            !a.hidden &&
            a.role !== "background" &&
            intersects(a, candidate, gap),
        )
      ) {
        w.x = x;
        w.y = y;
        return true;
      }
    }
  return false;
}
export function preflight(ctx, theme, page, state, mode, renderer) {
  theme = pageTheme(theme, page);
  // Spacing is an arrangement preference, not a collision requirement.
  // Touching edges and small positive gaps are valid compositions.
  const issues = pairs(page);
  for (const w of page.widgets) {
    if (w.hidden) continue;
    const m = measurement(ctx, w, theme, state, mode);
    ctx.save();
    renderer(ctx, w, m, state, { measureOnly: true });
    ctx.restore();
    issues.push(...m.diagnostics);
    for (let i = 0; i < m.textRuns.length; i++)
      for (let j = i + 1; j < m.textRuns.length; j++)
        if (intersects(m.textRuns[i].bounds, m.textRuns[j].bounds))
          issues.push({
            kind: "internal-overlap",
            message: "Text regions overlap",
            widgetIds: [w.id],
          });
  }
  return issues;
}
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
export function arrangePage(page, ids, { gap = 8, margin = 8 } = {}) {
  if (!Number.isFinite(gap) || gap < 0 || gap > 80)
    throw Error("Spacing must be 0–80 px");
  const result = structuredClone(page),
    chosen = new Set(ids),
    locked = new Set(result.widgets.filter((w) => w.locked).map((w) => w.id));
  result.groups
    .filter((g) => g.locked)
    .forEach((g) => g.widgetIds.forEach((k) => locked.add(k)));
  const edges = [
      ...result.overlaps.map((p) => [p.a, p.b]),
      ...result.groups.flatMap((g) =>
        g.widgetIds.slice(1).map((k) => [g.widgetIds[0], k]),
      ),
    ],
    components = [];
  for (const w of result.widgets) {
    if (components.some((c) => c.includes(w.id))) continue;
    const c = [w.id];
    for (let at = 0; at < c.length; at++)
      for (const [a, b] of edges)
        if (a === c[at] && !c.includes(b)) c.push(b);
        else if (b === c[at] && !c.includes(a)) c.push(a);
    components.push(c);
  }
  const moving = components
      .filter((c) => c.every((k) => chosen.has(k) && !locked.has(k)))
      .map((c) =>
        result.widgets.filter(
          (w) => c.includes(w.id) && !w.hidden && w.role !== "background",
        ),
      )
      .filter((c) => c.length),
    movingIds = new Set(moving.flat().map((w) => w.id)),
    placed = {
      ...result,
      widgets: result.widgets.filter((w) => !movingIds.has(w.id)),
    };
  for (const bundle of moving) {
    const b = groupBounds(bundle),
      target = { ...b, id: "arrangement-candidate" };
    if (!place(target, placed, { gap, margin }))
      throw Error(
        "Cannot fit arrangement while respecting locks, groups and overlap pairs",
      );
    const dx = target.x - b.x,
      dy = target.y - b.y;
    bundle.forEach((w) => {
      w.x += dx;
      w.y += dy;
    });
    placed.widgets.push(...bundle);
  }
  return result;
}

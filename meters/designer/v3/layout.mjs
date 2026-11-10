import {
  moveGroup,
  groupBounds,
  snapSelection,
  equalGaps,
} from "../shared/geometry.mjs";
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
// Text metrics the car's browser can reproduce: it has no bounding-box measurements, so the height of a line of
// text is a fixed share of its size, and sizes are whole pixels. Keep these in step with meters/js/custom.js.
export const TEXT_ASCENT = 0.72,
  TEXT_DESCENT = 0.04,
  // Text is placed on whole pixels, which can move it by up to half a pixel past the box it was fitted to.
  TEXT_ROUNDING = 0.6,
  FONT_FALLBACK = ', Arial, Helvetica, "DejaVu Sans", sans-serif';
export const fontString = (weight, size, family) =>
  `${weight} ${size}px "${family}"${FONT_FALLBACK}`;
export const rect = (x, y, w, h) => ({
  x,
  y,
  w: Math.max(0, w),
  h: Math.max(0, h),
});
// Which digit is widest in this font; the first of equals. Remembered per font once that font has loaded.
const digits = new Map();
function widestDigit(ctx, weight, family) {
  const font = fontString(weight, 100, family),
    loaded = globalThis.document?.fonts?.check(font) ?? true,
    hit = loaded ? digits.get(font) : undefined;
  if (hit !== undefined) return hit;
  ctx.font = font;
  let best = -1,
    widest = "8";
  for (let i = 0; i < 10; i++) {
    const width = ctx.measureText(String(i)).width;
    if (width > best + 1e-6) {
      best = width;
      widest = String(i);
    }
  }
  if (loaded) digits.set(font, widest);
  return widest;
}
// Whole pixels keep edges sharp and even on the car. Same helpers in meters/js/custom.js.
export const snapRect = (r) => {
  const x = Math.round(r.x),
    y = Math.round(r.y);
  return rect(x, y, Math.round(r.x + r.w) - x, Math.round(r.y + r.h) - y);
};
// Where a straight line of this width goes so it covers whole pixel rows: odd widths sit on a pixel's centre.
export const pixel = (n, lineWidth) =>
  Math.round(lineWidth) % 2 ? Math.floor(n) + 0.5 : Math.round(n);
// The path to stroke along the inside of a whole-pixel box.
export const crisp = (r, lineWidth) =>
  Math.round(lineWidth) % 2 ? rect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1) : r;
// One segment of a bar: edges on whole pixels and every gap exactly the same.
export function segmentBox(plot, i, count, gap, vertical) {
  if (vertical) {
    const a = Math.round(plot.y + plot.h - ((i + 1) * plot.h) / count),
      b = Math.round(plot.y + plot.h - (i * plot.h) / count);
    return rect(plot.x, a, plot.w, Math.max(1, b - a - gap));
  }
  const a = Math.round(plot.x + (i * plot.w) / count),
    b = Math.round(plot.x + ((i + 1) * plot.w) / count);
  return rect(a, plot.y, Math.max(1, b - a - gap), plot.h);
}
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
  const margin = Math.round(Math.min(Math.max(2, extent), w.w / 6, w.h / 6)),
    panel = snapRect(
      rect(w.x + margin, w.y + margin, w.w - 2 * margin, w.h - 2 * margin),
    ),
    radius = Math.min(s.radius, panel.w / 3, panel.h / 3),
    padding = Math.round(
      Math.min(
        panel.w / 2,
        panel.h / 2,
        Math.max(10, s.borderWidth + s.bevel + (1 - Math.SQRT1_2) * radius + 6),
      ),
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
        : Math.round(Math.min(s.captionSize + 8, content.h * 0.3)),
    footH =
      ((w.type === "lap" && w.variant === "full") ||
        (w.type === "gmeter" && w.peaks) ||
        w.type === "power") &&
      content.h > 110
        ? 26
        : 0,
    unitH =
      w.unitPosition === "separate"
        ? Math.round(Math.min(s.unitSize + 6, content.h * 0.2))
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
    // Sized with every digit as the font's widest, so a changing number keeps one size (the car measures it only once).
    const ratio = TEXT_ASCENT + TEXT_DESCENT,
      probe = text.replace(/[0-9]/g, widestDigit(ctx, weight, s.font));
    ctx.font = fontString(weight, preferred, s.font);
    const first = ctx.measureText(probe).width,
      fit = Math.min(
        preferred,
        (preferred * box.w) / Math.max(1, first),
        (preferred * box.h) / Math.max(1, ratio * preferred + 3),
      );
    if (fit < 8) {
      diagnostics.push({
        kind: "unreadable",
        message: "Text cannot fit at 8 px",
        widgetIds: [w.id],
      });
      return null;
    }
    let size = Math.max(8, Math.floor(fit));
    ctx.font = fontString(weight, size, s.font);
    let width = ctx.measureText(probe).width;
    for (
      let attempt = 0;
      attempt < 10 && (ratio * size > box.h || width > box.w);
      attempt++
    ) {
      size -= 1;
      if (size < 8) {
        diagnostics.push({
          kind: "unreadable",
          message: "Text cannot fit at a readable size",
          widgetIds: [w.id],
        });
        return null;
      }
      ctx.font = fontString(weight, size, s.font);
      width = ctx.measureText(probe).width;
    }
    width = ctx.measureText(text).width;
    const ascent = TEXT_ASCENT * size,
      descent = TEXT_DESCENT * size,
      x = Math.round(
        align === "center"
          ? box.x + box.w / 2
          : align === "right"
            ? box.x + box.w
            : box.x,
      ),
      y = Math.round(box.y + (box.h - ascent - descent) / 2 + ascent);
    const left =
        align === "center" ? x - width / 2 : align === "right" ? x - width : x,
      bounds = rect(left, y - ascent, width, ascent + descent);
    if (size < minimum)
      diagnostics.push({
        kind: "small-text",
        message: `${role} is ${size.toFixed(0)} px; target ${minimum} px`,
        widgetIds: [w.id],
      });
    if (!contains(content, bounds, TEXT_ROUNDING))
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
export {
  moveGroup,
  groupBounds,
  snapSelection,
  equalGaps,
} from "../shared/geometry.mjs";
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

// SPDX-License-Identifier: GPL-3.0-or-later
import { measurement, rect, styleFor } from "./layout.mjs";
import {
  range,
  toUnit,
  fromUnit,
  displayUnit,
  pageTheme,
  zones,
  zoneColor,
} from "./model.mjs";
const GREEN = "#3ddc84",
  AMBER = "#ffba55";
// A tick count that gives round scale labels (1, 2, 2.5 or 5 times a power of ten).
// Math.floor(log10(x)) the way the car computes it (no Math.log10 there); the epsilon keeps exact powers of ten exact.
const log10floor = (x) => Math.floor(Math.log(x) / Math.LN10 + 1e-9);
function niceCount(span, limit) {
  for (let n = limit; n >= 2; n--) {
    const step = span / n,
      p = Math.pow(10, log10floor(step)),
      f = step / p;
    if ([1, 2, 2.5, 5, 10].some((k) => Math.abs(f - k) < 1e-9)) return n;
  }
  // Otherwise steps in tens (or the matching power of ten), whole-number steps, or just the ends.
  const unit = Math.pow(10, Math.max(0, log10floor(span) - 1));
  for (let n = limit; n >= 2; n--)
    if (Math.abs(span / n / unit - Math.round(span / n / unit)) < 1e-9) return n;
  for (let n = limit; n >= 2; n--)
    if (Math.abs(span / n - Math.round(span / n)) < 1e-9) return n;
  return 1;
}
const caches = { background: new Map(), finish: new Map(), images: new Map() };
function cache(map, key, create, limit) {
  if (map.has(key)) return map.get(key);
  const item = create();
  map.set(key, item);
  while (map.size > limit) map.delete(map.keys().next().value);
  return item;
}
const layer = (w, h) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};
// Rounded rectangle through arcTo: the car's old browser has no roundRect. Same clamp as before.
export function roundedPath(c, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  c.beginPath();
  if (!(r > 0)) {
    c.rect(x, y, w, h);
    return;
  }
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r);
  c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h);
  c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r);
  c.arcTo(x, y, x + r, y, r);
  c.closePath();
}
// A dashed circle drawn as short arcs (3 px on, 5 px off): the car has no setLineDash.
export function dashedCircle(c, cx, cy, radius, dash, gap) {
  if (!(radius > 0)) return;
  const n = Math.max(1, Math.round((Math.PI * 2 * radius) / (dash + gap))),
    step = (Math.PI * 2) / n,
    sweep = (step * dash) / (dash + gap);
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = i * step;
    c.moveTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    c.arc(cx, cy, radius, a, a + sweep);
  }
  c.stroke();
}
export function shapePath(c, r, kind = "rounded", radius = 14) {
  if (kind !== "rounded") c.beginPath();
  if (kind === "circle") {
    c.arc(
      r.x + r.w / 2,
      r.y + r.h / 2,
      Math.max(0, Math.min(r.w, r.h) / 2),
      0,
      Math.PI * 2,
    );
  } else if (kind === "octagon") {
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) * Math.PI) / 4,
        x = r.x + r.w / 2 + (Math.cos(a) * r.w) / 2,
        y = r.y + r.h / 2 + (Math.sin(a) * r.h) / 2;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
  } else if (kind === "rounded") roundedPath(c, r.x, r.y, r.w, r.h, radius);
  else c.rect(r.x, r.y, r.w, r.h);
}
function image(asset) {
  return cache(
    caches.images,
    asset.data,
    () => {
      const i = new Image();
      i.src = asset.data;
      i.onload = () => window.dispatchEvent(new Event("studio-assets-ready"));
      return i;
    },
    24,
  );
}
export function drawBackground(c, b, assets, mode = "night") {
  const key = JSON.stringify(b) + mode;
  const bg = cache(
    caches.background,
    key,
    () => {
      const out = layer(800, 480),
        x = out.getContext("2d");
      x.fillStyle = mode === "day" ? "#dce4e9" : b.color;
      x.fillRect(0, 0, 800, 480);
      if (["linear", "radial"].includes(b.kind)) {
        const radians = (b.angle * Math.PI) / 180,
          dx = Math.cos(radians) * 400,
          dy = Math.sin(radians) * 240,
          g =
            b.kind === "radial"
              ? x.createRadialGradient(400, 240, 0, 400, 240, 500)
              : x.createLinearGradient(400 - dx, 240 - dy, 400 + dx, 240 + dy);
        for (const stop of b.stops) g.addColorStop(stop.at, stop.color);
        x.fillStyle = g;
        x.fillRect(0, 0, 800, 480);
      }
      if (["grid", "carbon", "noise"].includes(b.kind)) {
        x.strokeStyle = x.fillStyle = b.color2;
        x.globalAlpha = b.textureOpacity;
        x.lineWidth = 1;
        if (b.kind === "grid") {
          for (let n = 0; n < 800; n += b.spacing) {
            x.beginPath();
            x.moveTo(n, 0);
            x.lineTo(n, 480);
            x.stroke();
          }
          for (let n = 0; n < 480; n += b.spacing) {
            x.beginPath();
            x.moveTo(0, n);
            x.lineTo(800, n);
            x.stroke();
          }
        } else
          for (let y = 0; y < 480; y += 8)
            for (let a = 0; a < 800; a += 8) {
              x.globalAlpha =
                b.kind === "noise"
                  ? (((a * 17 + y * 13) % 19) / 24) * b.textureOpacity
                  : b.textureOpacity;
              x.fillRect(a, y, b.kind === "noise" ? 2 : (y / 8) % 2 ? 6 : 3, 3);
            }
      }
      return out;
    },
    12,
  );
  c.drawImage(bg, 0, 0);
  if (b.kind === "image" && assets[b.asset]) {
    const i = image(assets[b.asset]);
    if (i.complete && i.naturalWidth) {
      const scale = (b.fit === "contain" ? Math.min : Math.max)(
          800 / i.naturalWidth,
          480 / i.naturalHeight,
        ),
        w = i.naturalWidth * scale,
        h = i.naturalHeight * scale;
      c.save();
      c.globalAlpha = b.opacity;
      c.drawImage(i, (800 - w) * b.x, (480 - h) * b.y, w, h);
      c.restore();
    }
  }
  c.fillStyle = `rgba(0,0,0,${b.dim})`;
  c.fillRect(0, 0, 800, 480);
}
function panel(c, w, m) {
  const s = m.style;
  if (m.effect === "flat") return;
  const key = JSON.stringify([
    w.w,
    w.h,
    m.panel.x - w.x,
    m.panel.y - w.y,
    m.panel.w,
    m.panel.h,
    m.radius,
    m.effect,
    s,
  ]);
  const out = cache(
    caches.finish,
    key,
    () => {
      const out = layer(w.w, w.h),
        x = out.getContext("2d"),
        p = { ...m.panel, x: m.panel.x - w.x, y: m.panel.y - w.y };
      x.fillStyle = s.panelColor;
      if (m.effect === "raised") {
        x.shadowColor = "#000000";
        x.shadowBlur = s.shadowBlur * s.intensity;
        x.shadowOffsetX = s.shadowX;
        x.shadowOffsetY = s.shadowY;
      }
      if (m.effect === "neon") {
        x.shadowColor = s.glowColor;
        x.shadowBlur = s.glow * s.intensity;
      }
      shapePath(x, p, "rounded", m.radius);
      x.fill();
      x.shadowBlur = x.shadowOffsetX = x.shadowOffsetY = 0;
      if (m.effect === "inset" || m.effect === "raised") {
        const a = (s.lightAngle * Math.PI) / 180,
          g = x.createLinearGradient(
            p.x,
            p.y,
            p.x + Math.cos(a) * p.w,
            p.y + Math.sin(a) * p.h,
          );
        g.addColorStop(0, m.effect === "inset" ? "#000000" : "#b8c8d2");
        g.addColorStop(1, m.effect === "inset" ? "#8c9eac" : "#000000");
        x.strokeStyle = g;
        x.lineWidth = Math.max(1, s.bevel * s.intensity);
        shapePath(
          x,
          {
            x: p.x + 2,
            y: p.y + 2,
            w: Math.max(0, p.w - 4),
            h: Math.max(0, p.h - 4),
          },
          "rounded",
          Math.max(0, m.radius - 2),
        );
        x.stroke();
      }
      x.strokeStyle = m.effect === "neon" ? s.glowColor : s.borderColor;
      x.lineWidth = s.borderWidth;
      shapePath(x, p, "rounded", m.radius);
      x.stroke();
      return out;
    },
    64,
  );
  c.drawImage(out, w.x, w.y);
}
function shrink(r, n) {
  return rect(r.x + n, r.y + n, r.w - 2 * n, r.h - 2 * n);
}
export function renderWidget(c, w, m, state, { measureOnly = false } = {}) {
  if (w.hidden) return m;
  const s = m.style,
    plot = m.plot,
    emit = (t, r, size, options = {}) =>
      m.text(t, r, size, { ...options, draw: !measureOnly });
  c.save();
  c.beginPath();
  c.rect(m.outer.x, m.outer.y, m.outer.w, m.outer.h);
  c.clip();
  if (!measureOnly) panel(c, w, m);
  const zone = zones(w, state.vehicle, s),
    zoned = zone.base !== null || zone.steps.length > 0,
    current = zoneColor(zone, state[w.type === "shift" ? "rpm" : w.signal]),
    alarm = ["danger", "flash"].includes(m.warning);
  const color = alarm
    ? m.warning === "flash" && Math.floor(state.time * 6) % 2
      ? s.color
      : s.warningColor
    : (current ??
      (m.warning === "amber" ? AMBER : s.color));
  c.fillStyle = s.textColor;
  c.strokeStyle = color;
  c.lineWidth = w.thickness;
  let caption =
    w.labelMode === "auto" && w.signal
      ? {
          rpm: "ENGINE RPM",
          speed: "SPEED",
          coolant: "COOLANT",
          fuel: "FUEL",
          gLat: "LATERAL G",
          gLong: "LONGITUDINAL G",
          iat: "INTAKE AIR",
          outside: "OUTSIDE",
          trip: "TRIP",
          consumption: "CONSUMPTION",
          power: "POWER",
          torque: "TORQUE",
          throttle: "THROTTLE",
          gear: "GEAR",
        }[w.signal]
      : w.label;
  if (
    w.unitPosition === "label" &&
    m.unitLabel &&
    !caption.toLowerCase().endsWith(m.unitLabel.toLowerCase())
  )
    caption += " " + m.unitLabel;
  if (
    w.labelPosition !== "hidden" &&
    w.type !== "shape" &&
    w.type !== "label"
  ) {
    c.fillStyle = s.captionColor;
    emit(caption, m.caption, s.captionSize, {
      role: "caption",
      minimum: 18,
      align: s.captionAlign,
      weight: s.captionWeight,
    });
  }
  const value =
      m.formatted +
      (w.unitPosition === "value" && m.unitLabel ? " " + m.unitLabel : ""),
    textColor =
      state[w.signal] === null
        ? s.borderColor
        : alarm || current
          ? color
          : m.warning !== "off" && m.warning !== "normal"
            ? color
            : s.textColor;
  c.fillStyle = textColor;
  if (w.unitPosition === "separate") {
    c.fillStyle = s.unitColor;
    emit(m.unitLabel, m.unit, s.unitSize, {
      role: "unit",
      minimum: 12,
      align: s.unitAlign,
      weight: s.unitWeight,
    });
    c.fillStyle = textColor;
  }
  const r = range(w, state.vehicle),
    n = toUnit(state[w.signal], w.signal, r.unit),
    ratio =
      n === null ? 0 : Math.max(0, Math.min(1, (n - r.min) / (r.max - r.min)));
  if (w.type === "label") emit(w.label, m.content, w.size, { minimum: 18 });
  else if (w.type === "shape") {
    if (!measureOnly) {
      c.fillStyle = s.color;
      c.strokeStyle = s.color;
      c.lineWidth = w.thickness;
      if (w.variant === "line") {
        const box = shrink(plot, Math.min(10, Math.min(plot.w, plot.h) / 4));
        let a, b;
        if (w.orientation === "vertical") {
          a = { x: box.x + box.w / 2, y: box.y };
          b = { x: a.x, y: box.y + box.h };
        } else if (w.orientation === "diagonal") {
          a = { x: box.x, y: box.y + box.h };
          b = { x: box.x + box.w, y: box.y };
        } else if (w.orientation === "custom") {
          a = { x: box.x + box.w * w.startX, y: box.y + box.h * w.startY };
          b = { x: box.x + box.w * w.endX, y: box.y + box.h * w.endY };
        } else {
          a = { x: box.x, y: box.y + box.h / 2 };
          b = { x: box.x + box.w, y: a.y };
        }
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
        for (const [kind, p, q] of [
          [w.lineStart, a, b],
          [w.lineEnd, b, a],
        ]) {
          if (kind === "round") {
            c.beginPath();
            c.arc(p.x, p.y, Math.min(6, w.thickness), 0, 7);
            c.fill();
          }
          if (kind === "arrow") {
            const angle = Math.atan2(q.y - p.y, q.x - p.x);
            c.beginPath();
            c.moveTo(p.x, p.y);
            c.lineTo(
              p.x + 10 * Math.cos(angle + 0.5),
              p.y + 10 * Math.sin(angle + 0.5),
            );
            c.lineTo(
              p.x + 10 * Math.cos(angle - 0.5),
              p.y + 10 * Math.sin(angle - 0.5),
            );
            c.closePath();
            c.fill();
          }
        }
      } else {
        shapePath(c, plot, w.variant, m.radius);
        c.fill();
      }
    }
  } else if (w.type === "number" || w.type === "warning") {
    if (w.type === "warning") {
      c.fillStyle = m.warning === "normal" ? s.borderColor : s.warningColor;
      emit(
        (w.variant === "icon" ? "⚠ " : "") +
          (m.warning === "normal" ? "OK" : w.label),
        plot,
        w.size,
        { minimum: 24 },
      );
    } else {
      const box =
        w.sparkline && plot.h > 70
          ? rect(plot.x, plot.y, plot.w, plot.h * 0.65)
          : plot;
      emit(value, box, w.size, { minimum: 32 });
      if (w.sparkline && plot.h > 70)
        chart(
          c,
          w,
          m,
          state,
          rect(plot.x, plot.y + plot.h * 0.75, plot.w, plot.h * 0.25),
          w.signal,
          r,
          measureOnly,
          false,
        );
    }
  } else if (w.type === "radial") {
    const inside = w.valuePosition === "center",
      g = inside ? plot : rect(plot.x, plot.y, plot.w, plot.h * 0.7),
      // Labels outside the arc need a ring of room, so the arc itself gets smaller.
      outer = w.tickLabels === "outside",
      radius = Math.max(0, Math.min(g.w, g.h) / 2 - 8 - (outer ? 40 : 0)),
      cx = g.x + g.w / 2,
      cy = g.y + g.h / 2,
      start = Math.PI * (1.5 - w.sweep / 360),
      sweep = (w.sweep * Math.PI) / 180,
      // Inside the arc the value sits in the middle, or in the open bottom under a needle.
      valueBox = !inside
        ? rect(plot.x, plot.y + plot.h * 0.72, plot.w, plot.h * 0.28)
        : w.variant === "needle"
          ? rect(cx - radius * 0.4, cy + radius * 0.36, radius * 0.8, radius * 0.46)
          : rect(cx - radius * 0.5, cy - radius * 0.3, radius * 1.0, radius * 0.6),
      labelRadius = outer
        ? radius + Math.max(w.thickness, 8) / 2 + 18
        : radius - Math.max(w.thickness, 8) / 2 - 22,
      span = r.max - r.min;
    // Scale marks: every `tickStep` display units when set, otherwise a round automatic count.
    let marks = [];
    if (plot.w >= 160 && plot.h >= 140 && span > 0) {
      if (w.tickStep > 0 && span / w.tickStep <= 24)
        for (let v = r.min; v <= r.max + w.tickStep * 1e-9; v += w.tickStep)
          marks.push(Math.min(v, r.max));
      else {
        const count = niceCount(
          span,
          Math.min(w.ticks, Math.max(2, Math.floor(radius / 26))),
        );
        if (w.ticks > 0)
          marks = Array.from({ length: count + 1 }, (_, k) => r.min + (span * k) / count);
      }
      if (w.sweep === 360 && marks.length > 1) marks.pop();
    }
    const tickRuns = [];
    for (const v of marks) {
      const a = start + (sweep * (v - r.min)) / span,
        x = cx + Math.cos(a) * labelRadius,
        y = cy + Math.sin(a) * labelRadius,
        label =
          w.signal === "rpm" && w.abbreviate
            ? v === 0
              ? "0"
              : `${Number((v / 1000).toFixed(1))}k`
            : String(Number(v.toFixed(w.decimals)));
      const box = rect(x - 26, y - 11, 52, 22);
      // A label that would run into the value inside the dial is left out; its tick stays.
      if (containsRect(g, box) && !(inside && !outer && overlaps(box, valueBox))) {
        const bounds = emit(label, box, 18, {
          minimum: 14,
          role: "scale",
          align: "center",
        });
        if (bounds) tickRuns.push(bounds);
      }
      if (!measureOnly) {
        c.lineWidth = 1;
        c.strokeStyle = color;
        c.beginPath();
        c.moveTo(
          cx + Math.cos(a) * (radius - 7),
          cy + Math.sin(a) * (radius - 7),
        );
        c.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
        c.stroke();
      }
    }
    if (!measureOnly && radius > 0) {
      c.lineWidth = w.thickness;
      c.globalAlpha = 0.18;
      c.beginPath();
      c.arc(cx, cy, radius, start, start + sweep);
      c.stroke();
      c.globalAlpha = 1;
      // Zone bands (for example amber and red RPM) just inside the track.
      if (zoned) {
        const at = (canonical) => {
            const v = toUnit(canonical, w.signal, r.unit);
            return v === null
              ? null
              : Math.max(0, Math.min(1, (v - r.min) / (r.max - r.min)));
          },
          edges = [
            { from: 0, color: zone.base },
            ...zone.steps.map((step) => ({ from: at(step.at), color: step.color })),
          ].filter((e) => e.from !== null);
        const band = Math.max(3, w.thickness * 0.45);
        c.lineWidth = band;
        edges.forEach((e, i) => {
          const to = i + 1 < edges.length ? edges[i + 1].from : 1;
          if (!e.color || to <= e.from) return;
          c.strokeStyle = e.color;
          c.globalAlpha = 0.85;
          c.beginPath();
          c.arc(
            cx,
            cy,
            Math.max(1, radius - w.thickness / 2 - band / 2 - 2),
            start + sweep * e.from,
            start + sweep * to,
          );
          c.stroke();
        });
        c.globalAlpha = 1;
        c.lineWidth = w.thickness;
        c.strokeStyle = color;
      }
      if (w.variant === "needle") {
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(
          cx + Math.cos(start + sweep * ratio) * (radius - 10),
          cy + Math.sin(start + sweep * ratio) * (radius - 10),
        );
        c.stroke();
      } else if (w.variant === "segmented") {
        for (let k = 0; k < w.segments; k++) {
          c.globalAlpha = k / w.segments < ratio ? 1 : 0.15;
          c.beginPath();
          c.arc(
            cx,
            cy,
            radius,
            start + (sweep * k) / w.segments,
            start + (sweep * (k + 0.72)) / w.segments,
          );
          c.stroke();
        }
        c.globalAlpha = 1;
      } else {
        c.beginPath();
        c.arc(cx, cy, radius, start, start + sweep * ratio);
        c.stroke();
      }
    }
    emit(value, valueBox, w.size, { minimum: 32, align: "center" });
  } else if (w.type === "bar" || w.type === "shift") {
    if (!measureOnly) {
      const count =
          w.type === "bar" && w.variant === "continuous" ? 1 : w.segments,
        vertical = w.orientation === "vertical",
        rpm = state.vehicle.rpm,
        // Shift lights start `shiftLead` rpm before the amber line and fill up to the shift point.
        first = Math.max(0, rpm.amber - (w.type === "shift" ? w.shiftLead : 0)),
        span = Math.max(1, rpm.shift - first);
      for (let i = 0; i < count; i++) {
        const fraction =
            w.type === "shift"
              ? Math.max(0, Math.min(1, (state.rpm - first) / span))
              : ratio,
          active = i / count < fraction;
        // Each segment's own colour: a green, amber, red ramp for shift lights, colour zones for bars.
        let segmentColor = color;
        if (count > 1 && !alarm) {
          if (w.type === "shift" && w.colorRamp) {
            const at = first + (span * (i + 0.5)) / count;
            segmentColor =
              at >= rpm.red ? s.warningColor : at >= rpm.amber ? AMBER : GREEN;
          } else if (w.type === "bar" && zoned)
            segmentColor =
              zoneColor(
                zone,
                fromUnit(r.min + ((r.max - r.min) * (i + 0.5)) / count, w.signal, r.unit),
              ) ?? s.color;
        }
        let item = vertical
          ? rect(
              plot.x,
              plot.y + plot.h - ((i + 1) * plot.h) / count,
              plot.w,
              Math.max(1, plot.h / count - w.gap),
            )
          : rect(
              plot.x + (i * plot.w) / count,
              plot.y,
              Math.max(1, plot.w / count - w.gap),
              plot.h,
            );
        if (count === 1) {
          if (vertical) {
            item.y += item.h * (1 - fraction);
            item.h *= fraction;
          } else item.w *= fraction;
        }
        c.globalAlpha = active ? 1 : 0.12;
        if (
          w.type === "shift" &&
          m.warning === "flash" &&
          Math.floor(state.time * 10) % 2
        )
          c.globalAlpha = 0.12;
        c.fillStyle = segmentColor;
        if (w.variant === "dotted" || w.variant === "led") {
          shapePath(c, item, "circle");
          c.fill();
        } else c.fillRect(item.x, item.y, item.w, item.h);
      }
      c.globalAlpha = 1;
    }
  } else if (w.type === "gmeter") {
    const size = Math.min(plot.w, plot.h),
      g = rect(
        plot.x + (plot.w - size) / 2,
        plot.y + (plot.h - size) / 2,
        size,
        size,
      ),
      cx = g.x + size / 2,
      cy = g.y + size / 2,
      radius = Math.max(0, size / 2 - 8);
    if (!measureOnly) {
      c.strokeStyle = color;
      c.lineWidth = 2;
      shapePath(
        c,
        shrink(g, 4),
        w.variant === "rounded" ? "rounded" : w.variant,
      );
      c.stroke();
      c.save();
      shapePath(
        c,
        shrink(g, 8),
        w.variant === "rounded" ? "rounded" : w.variant,
      );
      c.clip();
      if (w.grid) {
        c.globalAlpha = 0.25;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(cx, g.y);
        c.lineTo(cx, g.y + size);
        c.moveTo(g.x, cy);
        c.lineTo(g.x + size, cy);
        c.stroke();
        // Rings every 0.5 g (every 1 g above a 3 g range).
        const step = w.gRange > 3 ? 1 : 0.5;
        for (let ring = step; ring < w.gRange - 1e-9; ring += step)
          dashedCircle(c, cx, cy, ((radius - 5) * ring) / w.gRange, 3, 5);
        c.globalAlpha = 1;
        c.lineWidth = 2;
      }
      const mark = (sample, alpha, peak = false) => {
        if (!Number.isFinite(sample.gLat) || !Number.isFinite(sample.gLong))
          return;
        let x = sample.gLat / w.gRange,
          y = sample.gLong / w.gRange;
        const norm =
          w.variant === "rounded"
            ? Math.max(1, Math.abs(x), Math.abs(y))
            : Math.max(1, Math.hypot(x, y) / 0.9);
        x /= norm;
        y /= norm;
        c.globalAlpha = alpha;
        c.fillStyle = color;
        c.beginPath();
        c.arc(
          cx + x * (radius - 5),
          cy + y * (radius - 5),
          peak ? 7 : alpha === 1 ? 5 : 2,
          0,
          7,
        );
        c.fill();
      };
      if (w.trail)
        (state.history ?? []).slice(-30).forEach((p, i) => mark(p, i / 40));
      mark(state, 1);
      c.restore();
    }
    if (w.grid && radius > 60) {
      const step = w.gRange > 3 ? 1 : 0.5;
      for (let ring = step; ring < w.gRange - 1e-9; ring += step) {
        const offset = ((radius - 5) * ring) / w.gRange;
        if (offset < 28) continue;
        emit(ring.toFixed(1), rect(cx + 3, cy - offset - 1, 34, 16), 14, {
          minimum: 12,
          role: "scale",
        });
      }
    }
    if (w.readout && size > 150) {
      const total = Math.hypot(state.gLat ?? 0, state.gLong ?? 0);
      c.fillStyle = s.textColor;
      emit(
        Number.isFinite(state.gLat) ? `${total.toFixed(2)} g` : "—",
        // Top-right corner, except the octagon, whose corner is cut away: there, bottom centre.
        w.variant === "octagon"
          ? rect(cx - size * 0.22, g.y + size * 0.72, size * 0.44, Math.max(24, size * 0.11))
          : rect(g.x + size * 0.55, g.y + 12, size * 0.45 - 16, Math.max(24, size * 0.11)),
        Math.max(22, Math.round(size * 0.09)),
        {
          minimum: 18,
          role: "g readout",
          align: w.variant === "octagon" ? "center" : "right",
        },
      );
    }
    if (Math.hypot(state.gLat ?? 0, state.gLong ?? 0) > w.gRange)
      emit("OVER RANGE", rect(plot.x, plot.y, plot.w, 18), 12, {
        minimum: 10,
        role: "range warning",
        align: "center",
      });
    if (m.footer.h)
      emit(
        `PEAK ${(state.maxG ?? Math.max(0, ...(state.history ?? []).map((p) => Math.hypot(p.gLat ?? 0, p.gLong ?? 0)))).toFixed(2)} g`,
        m.footer,
        14,
        { minimum: 12, role: "footer" },
      );
  } else if (w.type === "history")
    chart(c, w, m, state, plot, w.signal, r, measureOnly, true);
  else if (w.type === "power") {
    chart(
      c,
      w,
      m,
      state,
      plot,
      "power",
      {
        min: 0,
        max: toUnit(w.powerMax, "power", displayUnit("power", state.vehicle)),
        unit: displayUnit("power", state.vehicle),
      },
      measureOnly,
      true,
    );
    {
      c.save();
      c.strokeStyle = "#ffba55";
      chart(
        c,
        w,
        m,
        state,
        plot,
        "torque",
        {
          min: 0,
          max: toUnit(
            w.torqueMax,
            "torque",
            displayUnit("torque", state.vehicle),
          ),
          unit: displayUnit("torque", state.vehicle),
        },
        measureOnly,
        true,
      );
      c.restore();
    }
    if (m.footer.h)
      emit(
        `${displayUnit("power", state.vehicle)} 0–${toUnit(w.powerMax, "power", displayUnit("power", state.vehicle)).toFixed(0)} / TORQUE ${displayUnit("torque", state.vehicle)} 0–${toUnit(w.torqueMax, "torque", displayUnit("torque", state.vehicle)).toFixed(0)}`,
        m.footer,
        14,
        { minimum: 12, role: "legend" },
      );
  } else if (w.type === "lap") {
    emit(state.lap ?? "—", plot, w.size, { minimum: 32 });
    if (m.footer.h)
      emit(
        `LAST ${state.lastLap ?? "—"} · BEST ${state.bestLap ?? "—"} · Δ ${state.delta ?? "—"}`,
        m.footer,
        14,
        { minimum: 12, role: "lap detail" },
      );
  } else if (w.type === "session") {
    const unit = displayUnit("speed", state.vehicle),
      items = [];
    if (w.showSpeed)
      items.push([
        "TOP SPEED",
        toUnit(state.maxSpeed ?? 0, "speed", unit).toFixed(0),
        unit,
      ]);
    if (w.showRpm)
      items.push(["MAX RPM", String(Math.round(state.maxRpm ?? 0)), ""]);
    if (w.showLaps) items.push(["LAPS", String(state.laps ?? 0), ""]);
    // One card per figure: side by side when the box is wide, stacked when it is tall.
    const across = plot.w >= plot.h * 1.4,
      n = Math.max(1, items.length),
      gap = 8;
    items.forEach(([name, figure, suffix], i) => {
      const card = across
        ? rect(plot.x + ((plot.w + gap) * i) / n, plot.y, (plot.w + gap) / n - gap, plot.h)
        : rect(plot.x, plot.y + ((plot.h + gap) * i) / n, plot.w, (plot.h + gap) / n - gap);
      if (!measureOnly) {
        c.save();
        c.globalAlpha = 0.35;
        c.strokeStyle = s.borderColor;
        c.lineWidth = 1;
        shapePath(c, card, "rounded", Math.min(10, m.radius));
        c.stroke();
        c.restore();
      }
      const inner = shrink(card, 8),
        head = Math.min(22, inner.h * 0.34);
      c.fillStyle = s.captionColor;
      emit(name, rect(inner.x, inner.y, inner.w, head), 16, {
        minimum: 14,
        role: "session caption",
        weight: s.captionWeight,
      });
      c.fillStyle = s.textColor;
      emit(
        figure + (suffix ? " " + suffix : ""),
        rect(inner.x, inner.y + head, inner.w, inner.h - head),
        Math.min(w.size, 48),
        { minimum: 18, role: "session value" },
      );
    });
  }
  c.restore();
  return m;
}
function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
function containsRect(a, b) {
  return (
    b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h
  );
}
function chart(c, w, m, state, box, signal, bounds, measureOnly, axes) {
  const dual = w.type === "power",
    // Axis labels get up to 48 px, less on small charts so they stay inside the instrument.
    lw = Math.min(48, Math.max(20, box.w * 0.2)),
    graph = axes
      ? rect(
          box.x + lw + 4,
          box.y + 10,
          Math.max(1, box.w - (dual ? 2 * lw + 8 : lw + 4)),
          Math.max(1, box.h - 38),
        )
      : box;
  const right = dual && signal === "torque",
    labelX = right ? graph.x + graph.w + 4 : box.x;
  if (axes) {
    m.text(bounds.max.toFixed(0), rect(labelX, box.y, lw, 20), 16, {
      minimum: 12,
      role: "axis",
      draw: !measureOnly,
    });
    m.text(
      bounds.min.toFixed(0),
      rect(labelX, graph.y + graph.h - 18, lw, 20),
      16,
      { minimum: 12, role: "axis", draw: !measureOnly },
    );
    if (!right)
      m.text(
        `${w.window}s · ${bounds.unit}`,
        rect(graph.x, box.y + box.h - 22, graph.w, 22),
        16,
        { minimum: 12, role: "time axis", draw: !measureOnly },
      );
  }
  if (measureOnly) return;
  c.save();
  c.beginPath();
  c.rect(graph.x, graph.y, graph.w, graph.h);
  c.clip();
  c.strokeStyle = right ? "#ffba55" : m.style.color;
  c.lineWidth = 2;
  if (w.grid && !right) {
    c.globalAlpha = 0.15;
    for (let i = 0; i <= 4; i++) {
      c.beginPath();
      c.moveTo(graph.x, graph.y + (graph.h * i) / 4);
      c.lineTo(graph.x + graph.w, graph.y + (graph.h * i) / 4);
      c.stroke();
    }
    c.globalAlpha = 1;
  }
  const samples = (state.history ?? []).filter(
      (s) => s.time >= state.time - w.window,
    ),
    segments = [];
  let current = [];
  for (const sample of samples) {
    const n = toUnit(sample[signal], signal, bounds.unit);
    if (n === null) {
      if (current.length) segments.push(current);
      current = [];
      continue;
    }
    current.push({
      x:
        graph.x +
        ((sample.time - (state.time - w.window)) / w.window) * graph.w,
      y:
        graph.y +
        graph.h -
        ((n - bounds.min) / (bounds.max - bounds.min)) * graph.h,
    });
  }
  if (current.length) segments.push(current);
  for (const segment of segments) {
    c.beginPath();
    segment.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.stroke();
    if (w.variant === "area") {
      c.lineTo(segment.at(-1).x, graph.y + graph.h);
      c.lineTo(segment[0].x, graph.y + graph.h);
      c.closePath();
      c.globalAlpha = 0.15;
      c.fillStyle = m.style.color;
      c.fill();
      c.globalAlpha = 1;
    }
  }
  c.restore();
}
export function render(
  c,
  theme,
  page,
  assets,
  state,
  { mode = "night", guides = false, selection = [], issues = [] } = {},
) {
  theme = pageTheme(theme, page);
  drawBackground(
    c,
    mode === "day"
      ? (page.dayBackground ?? theme.dayBackground ?? theme.background)
      : (page.background ?? theme.background),
    assets,
    mode,
  );
  const measurements = [];
  for (const w of page.widgets) {
    if (w.hidden) continue;
    const m = measurement(c, w, theme, state, mode);
    renderWidget(c, w, m, state);
    measurements.push(m);
  }
  if (state.speed === null && state.rpm === null) {
    c.fillStyle = "#080d16";
    c.fillRect(250, 205, 300, 70);
    c.fillStyle = "#ffba55";
    c.font = "bold 24px Arial";
    c.textAlign = "center";
    c.fillText("NO DATA", 400, 248);
  }
  if (guides) {
    c.save();
    for (const w of page.widgets) {
      if (
        !selection.includes(w.id) &&
        !issues.some((i) => i.widgetIds.includes(w.id))
      )
        continue;
      c.strokeStyle = selection.includes(w.id) ? "#ffffff" : "#ff657a";
      c.setLineDash(selection.includes(w.id) ? [] : [5, 4]);
      c.lineWidth = 1;
      c.strokeRect(w.x, w.y, w.w, w.h);
      if (selection.includes(w.id)) {
        c.fillStyle = "#ffffff";
        c.fillRect(w.x + w.w - 8, w.y + w.h - 8, 8, 8);
      }
    }
    c.restore();
  }
  return measurements;
}
export const cacheStats = () =>
  Object.fromEntries(Object.entries(caches).map(([k, v]) => [k, v.size]));

export async function prepareAssets(assets) {
  await Promise.all(
    Object.values(assets).map((asset) => {
      const i = image(asset);
      return i.complete && i.naturalWidth ? Promise.resolve() : i.decode();
    }),
  );
}

import {
  signals,
  unitChoices,
  vehicle,
  displayUnit,
  toUnit,
  fromUnit,
  range,
  setUnits,
  warning,
  zones,
  zoneColor,
} from "./signals.mjs";
export {
  signals,
  unitChoices,
  vehicle,
  displayUnit,
  toUnit,
  fromUnit,
  range,
  bind,
  setUnits,
  warning,
  zones,
  zoneColor,
};
// SPDX-License-Identifier: GPL-3.0-or-later
export const clone = (value) => structuredClone(value);
export function pageTheme(theme, page) {
  return {
    ...theme,
    style: { ...theme.style, ...page.style },
    dayStyle: { ...theme.dayStyle, ...page.dayStyle },
  };
}
// Canvas fonts. Every name except Arial is bundled in meters/fonts (SIL OFL).
export const fonts = ["Arial", "MO Chakra", "MO Mono", "MO Condensed", "MO Sport"];
export const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;
export const signalTypes = ["number", "radial", "bar", "history", "warning"];
const definition = (group, variants, minSize, properties = []) => ({
  group,
  variants,
  minSize,
  properties,
  supportedSignals: Object.keys(signals),
});
export const registry = {
  number: definition(
    "Gauges",
    ["plain", "framed", "inset"],
    [112, 96],
    ["decimals", "sparkline", "zones"],
  ),
  radial: definition(
    "Gauges",
    ["arc", "needle", "segmented"],
    [200, 200],
    [
      "decimals",
      "sweep",
      "ticks",
      "thickness",
      "segments",
      "abbreviate",
      "valuePosition",
      "tickLabels",
      "tickStep",
      "zones",
    ],
  ),
  bar: definition(
    "Gauges",
    ["continuous", "segmented", "dotted"],
    [160, 88],
    ["orientation", "segments", "gap", "zones"],
  ),
  gmeter: definition(
    "Gauges",
    ["circle", "octagon", "rounded"],
    [180, 200],
    ["gRange", "trail", "grid", "peaks", "readout"],
  ),
  shift: definition(
    "Indicators",
    ["led", "rectangles"],
    [160, 80],
    ["segments", "gap", "shiftLead", "colorRamp"],
  ),
  warning: definition(
    "Indicators",
    ["icon", "text"],
    [160, 80],
    ["threshold", "direction"],
  ),
  history: definition(
    "Charts",
    ["line", "area"],
    [220, 160],
    ["window", "grid"],
  ),
  power: definition(
    "Charts",
    ["curves"],
    [260, 200],
    ["window", "grid", "powerMax", "torqueMax"],
  ),
  lap: definition("Track", ["full", "compact"], [220, 150], []),
  session: definition(
    "Track",
    ["cards"],
    [220, 160],
    ["showSpeed", "showRpm", "showLaps"],
  ),
  label: definition("Decoration", ["text"], [96, 40], []),
  shape: definition(
    "Decoration",
    ["rectangle", "rounded", "octagon", "line"],
    [24, 24],
    [
      "orientation",
      "thickness",
      "lineStart",
      "lineEnd",
      "startX",
      "startY",
      "endX",
      "endY",
    ],
  ),
};
for (const [type, def] of Object.entries(registry))
  if (!signalTypes.includes(type)) def.supportedSignals = [];
export const defaultStyle = {
  color: "#65e1c3",
  font: "Arial",
  effect: "flat",
  intensity: 0.5,
  panelColor: "#101b29",
  borderColor: "#8195a8",
  textColor: "#e9f4f5",
  captionColor: "#e9f4f5",
  unitColor: "#91a9b9",
  captionAlign: "left",
  unitAlign: "left",
  captionWeight: "bold",
  unitWeight: "normal",
  warningColor: "#ff657a",
  glowColor: "#65e1c3",
  captionSize: 18,
  unitSize: 18,
  weight: "bold",
  align: "left",
  radius: 14,
  borderWidth: 1,
  bevel: 3,
  shadowBlur: 8,
  shadowX: 2,
  shadowY: 3,
  glow: 8,
  lightAngle: 315,
};
export function widget(type = "number", variant) {
  return {
    id: id("widget"),
    type,
    variant: variant ?? registry[type].variants[0],
    signal: signalTypes.includes(type)
      ? type === "warning"
        ? "coolant"
        : "rpm"
      : null,
    labelMode: "auto",
    label: signalTypes.includes(type)
      ? signals[type === "warning" ? "coolant" : "rpm"].label
      : {
          gmeter: "G FORCE",
          shift: "SHIFT",
          power: "POWER / TORQUE",
          lap: "LAP TIMER",
          session: "SESSION",
          label: "LABEL",
          shape: "",
        }[type],
    x: 24,
    y: 24,
    w: Math.max(240, registry[type].minSize[0]),
    h: Math.max(160, registry[type].minSize[1]),
    size: 56,
    decimals: 0,
    scale: { mode: "auto" },
    warning: { mode: "auto" },
    orientation: "horizontal",
    lineStart: "none",
    lineEnd: "none",
    startX: 0,
    startY: 0.5,
    endX: 1,
    endY: 0.5,
    segments: 20,
    gap: 4,
    thickness: 8,
    sweep: 270,
    ticks: 8,
    abbreviate: true,
    window: 30,
    gRange: 2,
    powerMax: 200,
    torqueMax: 250,
    labelPosition: "top",
    unitPosition: "label",
    showSpeed: true,
    showRpm: true,
    showLaps: true,
    sparkline: false,
    trail: true,
    peaks: true,
    grid: true,
    // Newer options. normalizeWidget() gives older documents values that keep their look.
    valuePosition: "center",
    tickLabels: "inside",
    tickStep: 0,
    zones: { mode: "auto", base: null, steps: [] },
    shiftLead: 1500,
    colorRamp: true,
    readout: true,
    locked: false,
    hidden: false,
    role: "content",
    style: {},
  };
}
export function background() {
  return {
    kind: "linear",
    color: "#090d13",
    color2: "#182637",
    opacity: 1,
    dim: 0,
    fit: "cover",
    x: 0.5,
    y: 0.5,
    angle: 45,
    spacing: 32,
    textureOpacity: 0.25,
    stops: [
      { at: 0, color: "#090d13" },
      { at: 1, color: "#182637" },
    ],
  };
}
export const names = [
  "Street",
  "Track",
  "Classic Analog",
  "Minimal",
  "Neon",
  "Retro Digital",
];
export function starter(name = "Street") {
  const i = Math.max(0, names.indexOf(name)),
    accent = ["#65e1c3", "#ffba55", "#e8d8af", "#cbd5e1", "#ed63ff", "#ff874c"][
      i
    ];
  const night = {
    ...defaultStyle,
    color: accent,
    glowColor: accent,
    effect:
      name === "Neon" ? "neon" : name === "Classic Analog" ? "raised" : "flat",
    font:
      name === "Retro Digital"
        ? "MO Mono"
        : name === "Neon"
          ? "MO Chakra"
          : name === "Track"
            ? "MO Sport"
            : name === "Minimal"
              ? "MO Condensed"
              : "Arial",
    ...(name === "Minimal" ? { align: "center", captionAlign: "center" } : {}),
  };
  const t = {
    id: id("custom"),
    version: 3,
    kind: "ThemeDocument",
    name,
    author: "",
    style: night,
    dayStyle: {
      ...night,
      panelColor: "#edf2f5",
      textColor: "#101820",
      captionColor: "#101820",
      unitColor: "#526877",
      borderColor: "#526877",
      color: "#146c69",
    },
    background: background(),
    dayBackground: {
      ...background(),
      kind: "solid",
      color: "#dce4e9",
      color2: "#edf2f5",
    },
    pages: [],
  };
  if (name === "Neon") t.background.kind = "grid";
  if (name === "Track") t.background.kind = "carbon";
  const make = (type, x, y, w, h, signal, size, label) => {
    const a = Object.assign(widget(type), { x, y, w, h, size });
    if (signal) bind(a, signal);
    if (label) {
      a.label = label;
      a.labelMode = "custom";
    }
    return a;
  };
  const page = (name, widgets) => ({
    id: id("page"),
    name,
    widgets,
    groups: [],
    overlaps: [],
  });
  const variant = (w, v) => Object.assign(w, { variant: v });
  // Each starter has its own layout; the first page is for driving, the second for telemetry.
  const layouts = {
    Street: () => [
      page("DRIVE", [
        make("radial", 24, 40, 360, 416, "rpm", 64),
        make("number", 408, 40, 368, 232, "speed", 132),
        variant(make("number", 408, 296, 176, 160, "coolant", 44), "framed"),
        variant(make("number", 600, 296, 176, 160, "fuel", 44), "framed"),
      ]),
      page("TELEMETRY", [
        make("gmeter", 24, 40, 360, 416, null, 48),
        make("history", 408, 40, 368, 200, "rpm", 32),
        make("session", 408, 264, 368, 192, null, 40),
      ]),
    ],
    Track: () => [
      page("DRIVE", [
        Object.assign(make("shift", 24, 24, 752, 80, null, 32), {
          segments: 12,
          gap: 8,
        }),
        make("number", 24, 128, 232, 328, "gear", 200),
        make("number", 280, 128, 496, 160, "speed", 120),
        variant(make("lap", 280, 306, 496, 150, null, 56), "compact"),
      ]),
      page("TELEMETRY", [
        variant(make("gmeter", 24, 40, 360, 416, null, 48), "rounded"),
        make("lap", 408, 40, 368, 208, null, 56),
        make("session", 408, 272, 368, 184, null, 40),
      ]),
    ],
    "Classic Analog": () => [
      page("DRIVE", [
        variant(make("radial", 24, 32, 368, 424, "rpm", 56), "needle"),
        variant(make("radial", 408, 32, 368, 424, "speed", 56), "needle"),
      ]),
      page("TELEMETRY", [
        variant(make("radial", 24, 32, 240, 256, "coolant", 36), "needle"),
        variant(make("radial", 280, 32, 240, 256, "fuel", 36), "needle"),
        variant(make("radial", 536, 32, 240, 256, "outside", 36), "needle"),
        make("number", 24, 312, 368, 144, "trip", 56),
        make("number", 408, 312, 368, 144, "consumption", 56),
      ]),
    ],
    Minimal: () => [
      page("DRIVE", [
        make("number", 120, 40, 560, 304, "speed", 200),
        Object.assign(make("bar", 24, 368, 752, 88, "rpm", 32), {
          variant: "continuous",
        }),
      ]),
      page("TELEMETRY", [
        make("number", 24, 40, 368, 200, "coolant", 72),
        make("number", 408, 40, 368, 200, "fuel", 72),
        make("number", 24, 256, 368, 200, "consumption", 72),
        make("number", 408, 256, 368, 200, "trip", 72),
      ]),
    ],
    Neon: () => [
      page("DRIVE", [
        make("number", 24, 96, 184, 288, "speed", 72),
        variant(make("radial", 224, 24, 352, 432, "rpm", 72), "segmented"),
        make("number", 592, 96, 184, 288, "gear", 120),
      ]),
      page("TELEMETRY", [
        variant(make("gmeter", 24, 40, 360, 416, null, 48), "octagon"),
        make("power", 408, 40, 368, 240, null, 32),
        variant(make("bar", 408, 304, 368, 152, "throttle", 32), "segmented"),
      ]),
    ],
    "Retro Digital": () => [
      page("DRIVE", [
        variant(make("bar", 24, 24, 752, 104, "rpm", 32), "segmented"),
        make("number", 24, 152, 480, 304, "speed", 180),
        make("number", 528, 152, 248, 168, "gear", 110),
        make("number", 528, 336, 248, 120, "coolant", 44),
      ]),
      page("TELEMETRY", [
        Object.assign(make("history", 24, 40, 752, 240, "speed", 32), {
          variant: "area",
          window: 60,
        }),
        make("number", 24, 304, 368, 152, "consumption", 56),
        make("number", 408, 304, 368, 152, "trip", 56),
      ]),
    ],
  };
  t.pages = (layouts[name] ?? layouts.Street)();
  return t;
}
export function defaults() {
  const t = starter();
  return {
    version: 3,
    kind: "MetersSetup",
    themes: [t],
    vehicle: vehicle(),
    assets: {},
    library: [],
    initialTheme: t.id,
    initialPage: 0,
  };
}
const legacyLook = {
  valuePosition: "below",
  zones: { mode: "off", base: null, steps: [] },
  shiftLead: 0,
  colorRamp: false,
  readout: false,
};
export function normalizeWidget(old, vehicleProfile, legacy = false) {
  if (!registry[old.type]) throw Error("Unknown widget type");
  const w = { ...widget(old.type, old.variant), ...clone(old) };
  w.id = old.id ?? id("widget");
  w.style = { ...old.style };
  // Options added after a document was saved keep its original appearance.
  for (const [key, value] of Object.entries(legacyLook))
    if (old[key] === undefined) w[key] = clone(value);
  if (legacy) {
    const d = signals[w.signal];
    w.labelMode =
      d && [d.label, d.label + " " + d.unit].includes(old.label)
        ? "auto"
        : "custom";
    w.scale = old.autoScale
      ? { mode: "auto" }
      : {
          mode: "custom",
          unit: displayUnit(w.signal, vehicleProfile),
          min: toUnit(
            old.min ?? 0,
            w.signal,
            displayUnit(w.signal, vehicleProfile),
          ),
          max: toUnit(
            old.max ?? 8000,
            w.signal,
            displayUnit(w.signal, vehicleProfile),
          ),
        };
    if (w.scale.mode === "custom") {
      if (w.scale.min === null || w.scale.max === null) {
        w.legacyScaleSource = {
          min: old.min ?? 0,
          max: old.max ?? 8000,
          unit: signals[w.signal]?.unit ?? "",
        };
        w.scale = {
          mode: "custom",
          unit: displayUnit(w.signal, vehicleProfile),
          min: 0,
          max: 80,
        };
      } else
        [w.scale.min, w.scale.max] = [
          Math.min(w.scale.min, w.scale.max),
          Math.max(w.scale.min, w.scale.max),
        ];
    }
    for (const k of Object.keys(defaultStyle))
      if (old[k] !== undefined) w.style[k] = old[k];
    if (old.color) {
      w.style.textColor = old.color;
      w.style.captionColor = old.color;
      w.style.unitColor = old.color;
    }
    if (old.type === "warning")
      w.warning = {
        mode: "custom",
        threshold: old.threshold ?? 105,
        direction: old.direction ?? "above",
      };
    if (!signalTypes.includes(w.type)) {
      w.signal = null;
      w.scale = { mode: "auto" };
    }
    if (old.type === "shape" && old.w * old.h >= 800 * 480 * 0.7)
      w.role = "background";
    if (
      !signalTypes.includes(w.type) &&
      ["RPM", "ENGINE RPM"].includes(old.label)
    ) {
      w.label = widget(w.type).label;
      w.labelMode = "auto";
    }
  }
  return w;
}
export function migrate(input) {
  if (!input || ![1, 2, 3].includes(input.version))
    throw Error("Unsupported document version");
  const s = clone(input),
    legacyVersion = s.version,
    legacy = s.version < 3;
  s.version = 3;
  s.assets ??= {};
  s.library ??= [];
  for (const t of s.themes ?? []) {
    t.version = 3;
    const oldInk = legacy ? t.style?.color : null;
    t.style = {
      ...defaultStyle,
      ...(oldInk
        ? { textColor: oldInk, captionColor: oldInk, unitColor: oldInk }
        : {}),
      ...t.style,
    };
    t.dayStyle = {
      ...t.style,
      panelColor: "#edf2f5",
      textColor: "#101820",
      captionColor: "#101820",
      unitColor: "#526877",
      ...t.dayStyle,
    };
    t.background = {
      ...background(),
      ...(legacyVersion === 1 && !t.background ? { kind: "solid" } : {}),
      ...t.background,
    };
    t.dayBackground ??= {
      ...background(),
      kind: "solid",
      color: "#dce4e9",
      color2: "#edf2f5",
    };
    if (legacy)
      t.background.stops = [
        { at: 0, color: t.background.color },
        { at: 1, color: t.background.color2 },
      ];
    for (const p of t.pages) {
      p.id ??= id("page");
      p.groups ??= [];
      p.overlaps ??= [];
      if (p.background) p.background = { ...background(), ...p.background };
      p.widgets = p.widgets.map((w) => normalizeWidget(w, s.vehicle, legacy));
      if (legacy)
        for (let i = 0; i < p.widgets.length; i++)
          for (let j = i + 1; j < p.widgets.length; j++)
            if (
              (p.widgets[i].allowOverlap || p.widgets[j].allowOverlap) &&
              intersects(p.widgets[i], p.widgets[j])
            )
              p.overlaps.push({
                a: p.widgets[i].id,
                b: p.widgets[j].id,
                reason: "Migrated intentional overlap",
              });
    }
  }
  if (legacy && !s.themes.length) s.themes = [starter()];
  if (!s.themes.some((t) => t.id === s.initialTheme))
    s.initialTheme = s.themes[0]?.id;
  s.initialPage = Math.max(
    0,
    Math.min(
      s.initialPage ?? 0,
      (s.themes.find((t) => t.id === s.initialTheme)?.pages.length ?? 1) - 1,
    ),
  );
  return s;
}
export function intersects(a, b, gap = 0) {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}
function requireValue(ok, message) {
  if (!ok) throw Error(message);
}
export function validate(s) {
  requireValue(
    s?.version === 3 && s.kind === "MetersSetup",
    "Unsupported project",
  );
  const walk = (o, depth = 0) => {
    requireValue(depth <= 30, "Document is too deeply nested");
    if (typeof o === "number")
      requireValue(Number.isFinite(o), "Nonfinite number");
    if (o && typeof o === "object")
      for (const [k, v] of Object.entries(o)) {
        requireValue(
          !["__proto__", "prototype", "constructor"].includes(k),
          "Invalid property",
        );
        walk(v, depth + 1);
      }
  };
  walk(s);
  requireValue(
    Array.isArray(s.themes) && s.themes.length > 0 && s.themes.length <= 8,
    "A project needs 1–8 themes",
  );
  requireValue(
    new TextEncoder().encode(JSON.stringify(s)).length <= 8 * 1024 * 1024,
    "Project exceeds 8 MiB",
  );
  requireValue(
    new TextEncoder().encode(JSON.stringify({ ...s, assets: {} })).length <=
      262144,
    "Design definitions exceed 256 KiB",
  );
  requireValue(Object.keys(s.assets ?? {}).length <= 3, "Maximum three images");
  for (const a of Object.values(s.assets ?? {}))
    requireValue(
      /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(a.data) &&
        a.data.length <= 2097152,
      "Invalid image asset",
    );
  requireValue(
    s.themes.some((t) => t.id === s.initialTheme) &&
      Number.isInteger(s.initialPage) &&
      s.initialPage >= 0 &&
      s.initialPage <
        s.themes.find((t) => t.id === s.initialTheme).pages.length,
    "Invalid initial theme/page reference",
  );
  const ids = new Set(),
    unique = (o) => {
      requireValue(
        typeof o.id === "string" && o.id.length <= 100 && !ids.has(o.id),
        "Missing or duplicate ID",
      );
      ids.add(o.id);
    };
  const v = s.vehicle;
  requireValue(
    v &&
      ["ND1", "ND2"].includes(v.generation) &&
      ["1.5", "2.0"].includes(v.engine),
    "Invalid vehicle",
  );
  for (const [k, choices] of Object.entries(unitChoices))
    requireValue(choices.includes(v.units?.[k]), "Invalid units");
  for (const k of ["max", "amber", "red", "shift", "limit"])
    requireValue(Number.isInteger(v.rpm?.[k]), "RPM values must be integers");
  requireValue(
    ["roadster", "RF", "rf"].includes(v.body) &&
      ["manual", "automatic"].includes(v.transmission),
    "Invalid vehicle body/transmission",
  );
  requireValue(
    Number.isInteger(v.year) &&
      v.year >= 1989 &&
      v.year <= 2100 &&
      typeof v.market === "string" &&
      v.market.length <= 40,
    "Invalid vehicle identity",
  );
  for (const k of [
    "mass",
    "cda",
    "crr",
    "eff",
    "finalDrive",
    "circumference",
    "ratedPower",
    "ratedTorque",
    "powerRpm",
    "torqueRpm",
  ])
    requireValue(
      v[k] === null || (Number.isFinite(v[k]) && v[k] >= 0 && v[k] <= 100000),
      "Invalid vehicle " + k,
    );
  requireValue(
    Array.isArray(v.ratios) &&
      v.ratios.length <= 10 &&
      v.ratios.every(
        (n) => n === null || (Number.isFinite(n) && n > 0 && n <= 20),
      ),
    "Invalid gear ratios",
  );
  requireValue(
    v.preset == null ||
      (typeof v.preset === "string" && /^[a-z0-9-]{1,40}$/.test(v.preset)),
    "Invalid vehicle preset",
  );
  requireValue(
    v.tyre == null ||
      (typeof v.tyre === "string" && /^\d{3}\/\d{2}R\d{2}$/.test(v.tyre)),
    "Invalid tyre size",
  );
  requireValue(
    v.assumed == null ||
      (Array.isArray(v.assumed) &&
        v.assumed.length <= 30 &&
        v.assumed.every(
          (n) => typeof n === "string" && n.length <= 40 && /^[A-Za-z.]+$/.test(n),
        )),
    "Invalid assumed fields",
  );
  const rpm = v.rpm;
  requireValue(
    rpm &&
      0 < rpm.amber &&
      rpm.amber <= rpm.red &&
      rpm.red <= rpm.shift &&
      rpm.shift <= rpm.limit &&
      rpm.limit <= rpm.max &&
      rpm.max <= 15000,
    "Invalid RPM thresholds",
  );
  const style = (o) => {
    for (const k of [
      "color",
      "panelColor",
      "borderColor",
      "textColor",
      "captionColor",
      "unitColor",
      "warningColor",
      "glowColor",
    ])
      if (o[k] !== undefined)
        requireValue(/^#[\da-f]{6}$/i.test(o[k]), "Invalid style color");
    if (o.effect !== undefined)
      requireValue(
        ["flat", "framed", "raised", "inset", "neon"].includes(o.effect),
        "Invalid effect",
      );
    if (o.font !== undefined)
      requireValue(
        fonts.includes(o.font),
        "Invalid font",
      );
    for (const [k, min, max] of [
      ["intensity", 0, 1],
      ["captionSize", 8, 60],
      ["unitSize", 8, 60],
      ["radius", 0, 50],
      ["borderWidth", 0, 8],
      ["bevel", 0, 12],
      ["shadowBlur", 0, 24],
      ["shadowX", -12, 12],
      ["shadowY", -12, 12],
      ["glow", 0, 24],
      ["lightAngle", 0, 360],
    ])
      if (o[k] !== undefined)
        requireValue(
          Number.isFinite(o[k]) && o[k] >= min && o[k] <= max,
          "Invalid " + k,
        );
    for (const key of ["captionAlign", "unitAlign"])
      if (o[key] !== undefined)
        requireValue(
          ["left", "center", "right"].includes(o[key]),
          "Invalid text alignment",
        );
    for (const key of ["captionWeight", "unitWeight"])
      if (o[key] !== undefined)
        requireValue(
          ["normal", "bold"].includes(o[key]),
          "Invalid text weight",
        );
    if (o.align !== undefined)
      requireValue(
        ["left", "center", "right"].includes(o.align),
        "Invalid alignment",
      );
    if (o.weight !== undefined)
      requireValue(
        ["normal", "bold"].includes(o.weight),
        "Invalid font weight",
      );
  };
  const bg = (b) => {
    requireValue(
      [
        "solid",
        "linear",
        "radial",
        "grid",
        "carbon",
        "noise",
        "image",
      ].includes(b.kind),
      "Invalid background",
    );
    for (const k of ["color", "color2"])
      requireValue(/^#[\da-f]{6}$/i.test(b[k]), "Invalid background color");
    for (const k of ["opacity", "dim", "x", "y"])
      requireValue(
        Number.isFinite(b[k]) && b[k] >= 0 && b[k] <= 1,
        "Invalid background " + k,
      );
    requireValue(["cover", "contain"].includes(b.fit), "Invalid image fit");
    requireValue(
      Number.isFinite(b.spacing) && b.spacing >= 4 && b.spacing <= 200,
      "Texture spacing must be 4–200",
    );
    requireValue(
      Number.isFinite(b.angle) && b.angle >= 0 && b.angle <= 360,
      "Gradient angle must be 0–360",
    );
    requireValue(
      Number.isFinite(b.textureOpacity) &&
        b.textureOpacity >= 0 &&
        b.textureOpacity <= 1,
      "Invalid texture opacity",
    );
    if (b.kind === "image") requireValue(!!s.assets[b.asset], "Missing asset");
    requireValue(
      b.stops?.length >= 2 && b.stops.length <= 8,
      "Use 2–8 gradient stops",
    );
    let at = -1;
    for (const stop of b.stops) {
      requireValue(
        stop.at >= at &&
          stop.at >= 0 &&
          stop.at <= 1 &&
          /^#[\da-f]{6}$/i.test(stop.color),
        "Invalid gradient stop",
      );
      at = stop.at;
    }
  };
  const checkWidget = (w) => {
    unique(w);
    requireValue(
      registry[w.type]?.variants.includes(w.variant),
      "Invalid widget variant",
    );
    requireValue(
      signalTypes.includes(w.type) ? !!signals[w.signal] : w.signal === null,
      "Invalid signal",
    );
    requireValue(
      typeof w.label === "string" && w.label.length <= 80,
      "Invalid label",
    );
    requireValue(
      ["auto", "custom"].includes(w.labelMode),
      "Invalid label mode",
    );
    for (const k of ["x", "y", "w", "h", "size"])
      requireValue(Number.isFinite(w[k]), "Invalid geometry");
    requireValue(
      w.x >= 0 &&
        w.y >= 0 &&
        w.w >= 8 &&
        w.h >= 8 &&
        w.x + w.w <= 800 &&
        w.y + w.h <= 480 &&
        w.size >= 8 &&
        w.size <= 280,
      "Widget is outside the canvas",
    );
    for (const k of [
      "locked",
      "hidden",
      "abbreviate",
      "sparkline",
      "grid",
      "trail",
      "peaks",
      "showSpeed",
      "showRpm",
      "showLaps",
      "colorRamp",
      "readout",
    ])
      requireValue(typeof w[k] === "boolean", "Invalid " + k);
    requireValue(
      ["center", "below"].includes(w.valuePosition),
      "Invalid value position",
    );
    requireValue(
      ["inside", "outside"].includes(w.tickLabels),
      "Invalid scale label position",
    );
    requireValue(
      Number.isFinite(w.tickStep) && w.tickStep >= 0,
      "Scale step must be 0 (automatic) or a positive number",
    );
    requireValue(
      Number.isInteger(w.shiftLead) && w.shiftLead >= 0 && w.shiftLead <= 5000,
      "Shift-light lead must be 0–5000 rpm",
    );
    const z = w.zones,
      hex = (c) => c === null || /^#[\da-f]{6}$/i.test(c);
    requireValue(
      z &&
        ["auto", "custom", "off"].includes(z.mode) &&
        hex(z.base) &&
        Array.isArray(z.steps) &&
        z.steps.length <= 4 &&
        z.steps.every(
          (step, i) =>
            Number.isFinite(step.at) &&
            hex(step.color) &&
            (i === 0 || step.at > z.steps[i - 1].at),
        ),
      "Colour zones need up to four rising values with valid colours",
    );
    for (const [k, min, max] of [
      ["segments", 1, 80],
      ["ticks", 0, 24],
      ["decimals", 0, 3],
    ])
      requireValue(
        Number.isInteger(w[k]) && w[k] >= min && w[k] <= max,
        "Invalid " + k,
      );
    for (const [k, min, max] of [
      ["gap", 0, 30],
      ["thickness", 1, 50],
      ["sweep", 30, 360],
      ["window", 1, 120],
      ["gRange", 0.1, 10],
      ["powerMax", 1, 2000],
      ["torqueMax", 1, 3000],
    ])
      requireValue(
        Number.isFinite(w[k]) && w[k] >= min && w[k] <= max,
        "Invalid " + k,
      );
    requireValue(
      ["top", "bottom", "hidden"].includes(w.labelPosition) &&
        ["label", "value", "separate", "hidden"].includes(w.unitPosition),
      "Invalid label/unit position",
    );
    requireValue(
      [
        "horizontal",
        "vertical",
        "diagonal",
        ...(w.type === "shape" ? ["custom"] : []),
      ].includes(w.orientation),
      "Invalid orientation",
    );
    requireValue(
      w.role === "content" || (w.role === "background" && w.type === "shape"),
      "Only a decorative shape may have a background role",
    );
    requireValue(["auto", "custom"].includes(w.scale.mode), "Invalid scale");
    if (w.scale.mode === "custom")
      requireValue(
        Number.isFinite(w.scale.min) &&
          Number.isFinite(w.scale.max) &&
          w.scale.max > w.scale.min &&
          w.scale.unit === displayUnit(w.signal, s.vehicle),
        "Invalid custom scale",
      );
    requireValue(
      ["auto", "custom", "off"].includes(w.warning.mode),
      "Invalid warning policy",
    );
    if (w.warning.mode === "custom")
      requireValue(
        Number.isFinite(w.warning.threshold) &&
          ["above", "below"].includes(w.warning.direction),
        "Invalid warning threshold",
      );
    for (const k of ["lineStart", "lineEnd"])
      requireValue(
        ["none", "round", "arrow"].includes(w[k]),
        "Invalid line endpoint",
      );
    for (const k of ["startX", "startY", "endX", "endY"])
      requireValue(
        Number.isFinite(w[k]) && w[k] >= 0 && w[k] <= 1,
        "Line endpoint must be 0–1",
      );
    requireValue(
      ["horizontal", "vertical", "diagonal", "custom"].includes(w.orientation),
      "Invalid orientation",
    );
    style(w.style);
  };
  for (const t of s.themes) {
    unique(t);
    requireValue(
      t.version === 3 && typeof t.name === "string" && t.name.length <= 80,
      "Invalid theme",
    );
    style(t.style);
    style(t.dayStyle);
    bg(t.background);
    if (t.dayBackground) bg(t.dayBackground);
    requireValue(
      t.pages?.length > 0 && t.pages.length <= 8,
      "Maximum eight pages",
    );
    for (const p of t.pages) {
      unique(p);
      if (p.style) style(p.style);
      if (p.dayStyle) style(p.dayStyle);
      requireValue(
        typeof p.name === "string" &&
          p.name.length <= 80 &&
          p.widgets?.length <= 24,
        "Invalid page",
      );
      if (p.background) bg(p.background);
      if (p.dayBackground) bg(p.dayBackground);
      p.widgets.forEach(checkWidget);
      const local = new Set(p.widgets.map((w) => w.id)),
        grouped = new Set();
      for (const g of p.groups) {
        unique(g);
        requireValue(
          typeof g.name === "string" &&
            g.name.length <= 80 &&
            typeof g.locked === "boolean" &&
            g.widgetIds.length > 0 &&
            g.widgetIds.length <= 24,
          "Invalid group",
        );
        for (const k of g.widgetIds) {
          requireValue(
            local.has(k) && !grouped.has(k),
            "Invalid or nested group member",
          );
          grouped.add(k);
        }
      }
      for (const pair of p.overlaps)
        requireValue(
          pair.a !== pair.b &&
            local.has(pair.a) &&
            local.has(pair.b) &&
            typeof pair.reason === "string" &&
            pair.reason.length <= 160,
          "Invalid overlap exemption",
        );
    }
  }
  requireValue(Array.isArray(s.library), "Missing component library");
  for (const item of s.library) {
    unique(item);
    requireValue(
      item.widgets.length > 0 &&
        item.widgets.length <= 24 &&
        typeof item.name === "string",
      "Invalid component",
    );
    item.widgets.forEach(checkWidget);
  }
  return s;
}

function bind(w, signal) {
  if (!registry[w.type].supportedSignals.includes(signal))
    throw Error("Unsupported signal for this widget");
  const d = signals[signal];
  w.signal = signal;
  if (w.labelMode === "auto") w.label = d.label;
  w.scale = { mode: "auto" };
  w.decimals = d.decimals;
  w.warning = { mode: "auto" };
}

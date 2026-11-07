// SPDX-License-Identifier: GPL-3.0-or-later
import {
  registry,
  defaultStyle,
  signals,
  displayUnit,
  toUnit,
  fromUnit,
  fonts,
} from "./model.mjs";
export const levels = ["Basic", "Advanced", "Expert"];
export const instrumentNames = {
  number: "Number",
  radial: "Dial",
  bar: "Bar",
  gmeter: "G-meter",
  shift: "Shift lights",
  warning: "Warning",
  history: "History chart",
  power: "Power / torque",
  lap: "Lap timer",
  session: "Session summary",
  label: "Text",
  shape: "Shape",
};
export class EditorPreferences {
  constructor(namespace, storage, onFailure = () => {}) {
    this.key = namespace + "-ui-v1";
    this.storage = storage;
    this.onFailure = onFailure;
    this.value = {
      version: 1,
      detail: 0,
      leftTab: "pages",
      sections: {},
      leftWidth: 256,
      rightWidth: 320,
    };
    try {
      const raw = JSON.parse(storage.getItem(this.key) ?? "null");
      if (raw?.version === 1) {
        if ([0, 1, 2].includes(raw.detail)) this.value.detail = raw.detail;
        if (["pages", "instruments", "layers"].includes(raw.leftTab))
          this.value.leftTab = raw.leftTab;
        if (raw.sections && typeof raw.sections === "object")
          this.value.sections = raw.sections;
        for (const k of ["leftWidth", "rightWidth"])
          if (Number.isFinite(raw[k]) && raw[k] >= 220 && raw[k] <= 420)
            this.value[k] = raw[k];
      }
    } catch {
      onFailure(
        "Workspace preferences could not be loaded; using session defaults.",
      );
    }
  }
  set(patch) {
    Object.assign(this.value, patch);
    try {
      this.storage.setItem(this.key, JSON.stringify(this.value));
    } catch {
      this.onFailure(
        "Workspace preferences are session-only. Your design draft is separate.",
      );
    }
  }
}
const labels = {
  signal: "Reading",
  labelMode: "Caption",
  label: "Custom caption",
  size: "Text size",
  variant: "Variant",
  x: "X position",
  y: "Y position",
  w: "Width",
  h: "Height",
  locked: "Lock instrument",
  hidden: "Hide instrument",
  role: "Layout role",
  decimals: "Decimal places",
  sparkline: "Show sparkline",
  sweep: "Sweep angle",
  ticks: "Scale ticks",
  thickness: "Thickness",
  segments: "Segments",
  abbreviate: "Abbreviate RPM ticks",
  orientation: "Orientation",
  gap: "Segment spacing",
  window: "Time window (seconds)",
  gRange: "G range",
  trail: "Show trail",
  grid: "Show grid",
  peaks: "Show peaks",
  powerMax: "Power maximum (PS)",
  torqueMax: "Torque maximum (Nm)",
  showSpeed: "Maximum speed",
  showRpm: "Maximum RPM",
  showLaps: "Lap count",
  labelPosition: "Caption position",
  unitPosition: "Unit position",
  lineStart: "Start marker",
  lineEnd: "End marker",
  startX: "Start X (0–1)",
  startY: "Start Y (0–1)",
  endX: "End X (0–1)",
  endY: "End Y (0–1)",
  valuePosition: "Value position",
  zones: "Colour zones",
  shiftLead: "Start before amber (rpm)",
  colorRamp: "Green, amber, red lights",
  readout: "Show live g",
};
const essential = new Set([
  "signal",
  "labelMode",
  "label",
  "size",
  "gRange",
  "window",
  "showSpeed",
  "showRpm",
  "showLaps",
  "variant",
]);
const expert = new Set([
  "role",
  "lineStart",
  "lineEnd",
  "startX",
  "startY",
  "endX",
  "endY",
]);
const choices = {
  labelMode: [
    ["auto", "Automatic"],
    ["custom", "Custom caption"],
  ],
  orientation: ["horizontal", "vertical"],
  labelPosition: ["top", "bottom", "hidden"],
  unitPosition: [
    ["label", "Beside caption"],
    ["value", "Beside value"],
    ["separate", "Separate line"],
    ["hidden", "Hidden"],
  ],
  lineStart: ["none", "round", "arrow"],
  lineEnd: ["none", "round", "arrow"],
  role: ["content", "background"],
  valuePosition: [
    ["center", "Inside the dial"],
    ["below", "Below the dial"],
  ],
};
export const properties = {};
function property(
  id,
  label,
  section,
  minimumDetail,
  control = "number",
  values = null,
  appliesTo = () => true,
  help = "",
) {
  properties[id] = {
    id,
    label,
    section,
    minimumDetail,
    control,
    choices: values,
    appliesTo,
    help,
    order: Object.keys(properties).length,
  };
}
for (const key of new Set([
  ...Object.keys(labels),
  ...Object.values(registry).flatMap((d) => d.properties),
])) {
  const section = ["signal", "labelMode", "label", "size"].includes(key)
    ? "content"
    : ["x", "y", "w", "h", "locked", "hidden", "role"].includes(key)
      ? "layout"
      : "appearance";
  const control = [
    "locked",
    "hidden",
    "sparkline",
    "trail",
    "grid",
    "peaks",
    "showSpeed",
    "showRpm",
    "showLaps",
    "abbreviate",
    "colorRamp",
    "readout",
  ].includes(key)
    ? "checkbox"
    : key === "label"
      ? "text"
      : choices[key] || key === "variant" || key === "signal"
        ? "select"
        : "number";
  property(
    key,
    labels[key] ?? key,
    section,
    essential.has(key) ? 0 : expert.has(key) ? 2 : 1,
    control,
    choices[key],
    (w) =>
      key === "signal"
        ? registry[w.type].supportedSignals.length > 0
        : key === "labelMode"
          ? w.type !== "shape"
          : key === "label"
            ? w.labelMode === "custom" || w.type === "label"
            : key === "variant"
              ? w.type !== "number" && registry[w.type].variants.length > 1
              : key === "role"
                ? w.type === "shape"
                : key === "window"
                  ? ["history", "power"].includes(w.type) ||
                    (w.type === "number" && w.sparkline)
                  : key === "size"
                    ? ["number", "radial", "label", "lap", "session"].includes(
                        w.type,
                      )
                    : [
                          "x",
                          "y",
                          "w",
                          "h",
                          "locked",
                          "hidden",
                          "labelPosition",
                          "unitPosition",
                        ].includes(key)
                      ? true
                      : registry[w.type].properties.includes(key) &&
                        !["threshold", "direction"].includes(key) &&
                        !(
                          w.type === "shape" &&
                          w.variant !== "line" &&
                          key !== "thickness"
                        ) &&
                        (!["startX", "startY", "endX", "endY"].includes(key) ||
                          w.orientation === "custom"),
  );
}
const styleLabels = {
  color: "Accent color",
  textColor: "Value color",
  captionColor: "Caption color",
  unitColor: "Unit color",
  panelColor: "Panel color",
  borderColor: "Border color",
  warningColor: "Warning color",
  glowColor: "Glow color",
  captionSize: "Caption size",
  unitSize: "Unit size",
  captionAlign: "Caption alignment",
  unitAlign: "Unit alignment",
  align: "Value alignment",
  captionWeight: "Caption weight",
  unitWeight: "Unit weight",
  weight: "Value weight",
  font: "Font",
  effect: "Treatment",
  intensity: "Effect intensity",
  radius: "Corner radius",
  borderWidth: "Border width",
  bevel: "Bevel width",
  shadowBlur: "Shadow blur",
  shadowX: "Shadow horizontal offset",
  shadowY: "Shadow vertical offset",
  glow: "Glow strength",
  lightAngle: "Light direction",
};
export const styleChoices = {
  font: fonts,
  effect: ["flat", "framed", "raised", "inset", "neon"],
  align: ["left", "center", "right"],
  weight: ["normal", "bold"],
};
const advancedStyle = new Set([
  "textColor",
  "captionColor",
  "unitColor",
  "panelColor",
  "borderColor",
  "captionSize",
  "unitSize",
  "captionAlign",
  "unitAlign",
  "align",
  "captionWeight",
  "unitWeight",
  "weight",
  "font",
  "intensity",
]);
for (const key of Object.keys(defaultStyle)) {
  const values =
    styleChoices[key] ??
    (key.endsWith("Align")
      ? styleChoices.align
      : key.endsWith("Weight")
        ? styleChoices.weight
        : null);
  property(
    "style." + key,
    styleLabels[key] ?? key,
    [
      "intensity",
      "effect",
      "radius",
      "borderWidth",
      "bevel",
      "shadowBlur",
      "shadowX",
      "shadowY",
      "glow",
      "glowColor",
      "lightAngle",
    ].includes(key)
      ? "effects"
      : "appearance",
    key === "color" || key === "effect" ? 0 : advancedStyle.has(key) ? 1 : 2,
    values
      ? "select"
      : key.toLowerCase().endsWith("color") || key === "color"
        ? "color"
        : "number",
    values,
  );
}
for (const [type, definition] of Object.entries(registry))
  definition.presentation = {
    name: instrumentNames[type],
    properties: [
      ...new Set([
        "signal",
        "labelMode",
        "label",
        "size",
        "variant",
        "labelPosition",
        "unitPosition",
        "x",
        "y",
        "w",
        "h",
        "locked",
        "hidden",
        "role",
        ...definition.properties,
      ]),
    ].map((id) => properties[id]),
  };
export const appearancePresets = ["flat", "framed", "raised", "inset", "neon"];
export function applyAppearance(w, effect) {
  if (!appearancePresets.includes(effect)) throw Error("Unknown appearance");
  if (w.type === "number")
    w.variant =
      effect === "framed" ? "framed" : effect === "inset" ? "inset" : "plain";
  w.style = { ...w.style, effect, intensity: 0.5 };
}
export function effectiveAppearance(w, style) {
  return w.variant === "inset"
    ? "inset"
    : style.effect === "flat" && w.variant === "framed"
      ? "framed"
      : style.effect;
}
export function warningPresentation(w, vehicle) {
  const signal = w.signal,
    d = signals[signal],
    unit = displayUnit(signal, vehicle),
    custom = w.warning.mode === "custom";
  let threshold = custom
      ? w.warning.threshold
      : (d?.threshold ?? (signal === "rpm" ? vehicle.rpm.amber : d?.max * 0.9)),
    direction = custom ? w.warning.direction : (d?.direction ?? "above");
  if (unit.startsWith("mpg"))
    direction = direction === "above" ? "below" : "above";
  return { unit, threshold: toUnit(threshold, signal, unit), direction };
}
export function setWarningPresentation(w, vehicle, value, direction) {
  const unit = displayUnit(w.signal, vehicle),
    threshold = fromUnit(value, w.signal, unit);
  if (threshold === null)
    throw Error("Use a positive finite consumption threshold.");
  w.warning = {
    mode: "custom",
    threshold,
    direction: unit.startsWith("mpg")
      ? direction === "above"
        ? "below"
        : "above"
      : direction,
  };
}

export const readingName = (key) =>
  signals[key]?.label
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
    .replace(/Rpm/g, "RPM")
    .replace(/G /g, "G ") ?? key;

properties["style.textColor"].minimumDetailFor = (w) =>
  ["number", "label"].includes(w.type) ? 0 : 1;
properties["style.color"].appliesTo = (w, level) =>
  level >= 1 || !["number", "label"].includes(w.type);
for (const key of [
  "captionColor",
  "captionSize",
  "captionAlign",
  "captionWeight",
])
  properties["style." + key].appliesTo = (w) =>
    !["shape", "label"].includes(w.type) && w.labelPosition !== "hidden";
for (const key of ["unitColor", "unitSize", "unitAlign", "unitWeight"])
  properties["style." + key].appliesTo = (w) =>
    w.unitPosition === "separate" && !!w.signal;
properties.labelPosition.appliesTo = (w) =>
  !["shape", "label"].includes(w.type);
properties.unitPosition.appliesTo = (w) => !!w.signal;

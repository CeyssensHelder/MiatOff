// SPDX-License-Identifier: GPL-3.0-or-later
export const signals = {
  speed: { label: "SPEED", unit: "km/h", min: 0, max: 260, decimals: 0 },
  rpm: { label: "ENGINE RPM", unit: "rpm", min: 0, max: 8000, decimals: 0 },
  gear: { label: "GEAR", unit: "", min: -1, max: 6, decimals: 0 },
  coolant: {
    label: "COOLANT",
    unit: "°C",
    min: 40,
    max: 140,
    decimals: 0,
    threshold: 105,
    direction: "above",
  },
  iat: { label: "INTAKE AIR", unit: "°C", min: -20, max: 100, decimals: 0 },
  outside: { label: "OUTSIDE", unit: "°C", min: -20, max: 50, decimals: 1 },
  fuel: {
    label: "FUEL",
    unit: "%",
    min: 0,
    max: 100,
    decimals: 0,
    threshold: 15,
    direction: "below",
  },
  trip: { label: "TRIP", unit: "km", min: 0, max: 500, decimals: 1 },
  consumption: {
    label: "CONSUMPTION",
    unit: "L/100km",
    min: 0,
    max: 20,
    decimals: 1,
  },
  gLat: { label: "LATERAL G", unit: "g", min: -2, max: 2, decimals: 2 },
  gLong: { label: "LONGITUDINAL G", unit: "g", min: -2, max: 2, decimals: 2 },
  throttle: { label: "THROTTLE", unit: "%", min: 0, max: 100, decimals: 0 },
  power: { label: "POWER", unit: "PS", min: 0, max: 200, decimals: 0 },
  torque: { label: "TORQUE", unit: "Nm", min: 0, max: 250, decimals: 0 },
};
export const unitChoices = {
  speed: ["km/h", "mph"],
  distance: ["km", "mi"],
  temperature: ["C", "F"],
  power: ["PS", "hp", "kW"],
  torque: ["Nm", "lb-ft"],
  consumption: ["L/100km", "mpg UK", "mpg US"],
};
export function vehicle() {
  return {
    version: 1,
    generation: "ND1",
    engine: "1.5",
    year: 2017,
    market: "EU",
    body: "roadster",
    transmission: "manual",
    rpm: { max: 8000, amber: 6500, red: 7000, shift: 7200, limit: 7500 },
    ratios: [5.087, 2.991, 2.035, 1.594, 1.286, 1],
    finalDrive: 2.866,
    circumference: 1.89,
    mass: 1050,
    cda: 0.55,
    crr: 0.012,
    eff: 0.85,
    ratedPower: 131,
    powerRpm: 7000,
    ratedTorque: 150,
    torqueRpm: 4800,
    units: {
      speed: "km/h",
      distance: "km",
      temperature: "C",
      power: "PS",
      torque: "Nm",
      consumption: "L/100km",
    },
    provenance: "Legacy ND1 1.5 assumptions; not manufacturer verified",
  };
}
export function displayUnit(signal, v) {
  if (["coolant", "iat", "outside"].includes(signal))
    return "°" + v.units.temperature;
  return (
    {
      speed: v.units.speed,
      trip: v.units.distance,
      power: v.units.power,
      torque: v.units.torque,
      consumption: v.units.consumption,
    }[signal] ??
    signals[signal]?.unit ??
    ""
  );
}
export function toUnit(n, signal, unit) {
  if (!Number.isFinite(n)) return null;
  if (unit === "mph" || unit === "mi") return n * 0.621371192237334;
  if (unit === "°F") return n * 1.8 + 32;
  if (unit === "hp") return n * 0.9863200706;
  if (unit === "kW") return n * 0.73549875;
  if (unit === "lb-ft") return n * 0.7375621493;
  if (unit.startsWith("mpg"))
    return n > 0 ? (unit === "mpg UK" ? 282.480936 : 235.214583) / n : null;
  return n;
}
export function fromUnit(n, signal, unit) {
  if (!Number.isFinite(n)) return null;
  if (unit === "mph" || unit === "mi") return n / 0.621371192237334;
  if (unit === "°F") return (n - 32) / 1.8;
  if (unit === "hp") return n / 0.9863200706;
  if (unit === "kW") return n / 0.73549875;
  if (unit === "lb-ft") return n / 0.7375621493;
  if (unit.startsWith("mpg"))
    return n > 0 ? (unit === "mpg UK" ? 282.480936 : 235.214583) / n : null;
  return n;
}
export function range(w, v) {
  const unit = displayUnit(w.signal, v),
    d = signals[w.signal] ?? { min: 0, max: 1 };
  if (w.scale.mode === "custom")
    return { unit: w.scale.unit, min: w.scale.min, max: w.scale.max };
  let min = d.min,
    max = w.signal === "rpm" ? v.rpm.max : d.max;
  if (w.signal === "consumption" && unit.startsWith("mpg"))
    return { min: 0, max: 80, unit };
  if (w.signal === "speed" && unit === "mph") return { min: 0, max: 160, unit };
  return {
    min: toUnit(min, w.signal, unit),
    max: toUnit(max, w.signal, unit),
    unit,
  };
}
export function setUnits(project, key, unit) {
  if (!unitChoices[key]?.includes(unit))
    throw Error("Unsupported display unit");
  const candidate = {
      ...project.vehicle,
      units: { ...project.vehicle.units, [key]: unit },
    },
    changes = [];
  for (const w of [
    ...project.themes.flatMap((t) => t.pages.flatMap((p) => p.widgets)),
    ...project.library.flatMap((c) => c.widgets),
  ])
    if (w.scale.mode === "custom" && w.signal) {
      const next = displayUnit(w.signal, candidate);
      if (next === w.scale.unit) continue;
      const a = toUnit(
          fromUnit(w.scale.min, w.signal, w.scale.unit),
          w.signal,
          next,
        ),
        b = toUnit(
          fromUnit(w.scale.max, w.signal, w.scale.unit),
          w.signal,
          next,
        );
      if (a === null || b === null)
        throw Error(
          "Custom consumption range has an infinite endpoint. Set positive endpoints or restore automatic scale first.",
        );
      changes.push([
        w,
        {
          mode: "custom",
          unit: next,
          min: Math.min(a, b),
          max: Math.max(a, b),
        },
      ]);
    }
  project.vehicle.units[key] = unit;
  changes.forEach(([w, scale]) => (w.scale = scale));
}
export function warning(w, state, v) {
  const n = state[w.type === "shift" ? "rpm" : w.signal];
  if (!Number.isFinite(n)) return "normal";
  if (w.warning.mode === "off") return "normal";
  if (w.warning.mode === "custom")
    return (
      w.warning.direction === "below"
        ? n <= w.warning.threshold
        : n >= w.warning.threshold
    )
      ? "danger"
      : "normal";
  if (w.signal === "rpm" || w.type === "shift")
    return n >= v.rpm.shift
      ? "flash"
      : n >= v.rpm.red
        ? "danger"
        : n >= v.rpm.amber
          ? "amber"
          : "normal";
  const d = signals[w.signal];
  return d?.threshold !== undefined &&
    (d.direction === "below" ? n <= d.threshold : n >= d.threshold)
    ? "danger"
    : "normal";
}

// Colour zones, in canonical units. A value takes the colour of the last step at or below it,
// or `base` below the first step; null means the instrument's normal colour.
// Automatic zones follow the vehicle RPM settings and each reading's warning threshold.
export function zones(w, v, style) {
  const z = w.zones;
  if (!z || z.mode === "off" || !w.signal) return { base: null, steps: [] };
  if (z.mode === "custom") return { base: z.base, steps: z.steps };
  if (w.signal === "rpm")
    return {
      base: null,
      steps: [
        { at: v.rpm.amber, color: "#ffba55" },
        { at: v.rpm.red, color: style.warningColor },
      ],
    };
  const d = signals[w.signal];
  if (d?.threshold === undefined) return { base: null, steps: [] };
  return d.direction === "below"
    ? { base: style.warningColor, steps: [{ at: d.threshold, color: null }] }
    : { base: null, steps: [{ at: d.threshold, color: style.warningColor }] };
}
export function zoneColor(zone, n) {
  if (!Number.isFinite(n)) return null;
  let color = zone.base;
  for (const step of zone.steps) if (n >= step.at) color = step.color;
  return color;
}

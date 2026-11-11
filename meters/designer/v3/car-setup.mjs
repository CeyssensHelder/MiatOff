// SPDX-License-Identifier: GPL-3.0-or-later
// First-run car setup: choose a car and units, fill the project's vehicle profile from a sourced preset.
import { PRESETS, MARKETS, MARKET_UNITS } from "./presets.mjs";
import { unitChoices, setUnits, toUnit } from "./signals.mjs";

// Vehicle specifications a preset can supply, in display order. Anything not backed by a source stays "assumed".
// rpm.limit is the published redline, where the engine stops pulling.
export const SPEC_FIELDS = [
  "rpm.limit",
  "ratios",
  "finalDrive",
  "circumference",
  "ratedPower",
  "powerRpm",
  "ratedTorque",
  "torqueRpm",
  "mass",
];
// Simulation-only physics values: no preset sources them.
const MODEL_FIELDS = ["cda", "crr", "eff"];
// Dashboard warnings: a display choice worked out from the limit and the warning margin, not a specification.
export const WARNING_FIELDS = ["rpm.red", "rpm.shift", "rpm.amber", "rpm.max"];
export const MARGINS = [0, 250, 500, 750, 1000];
export const DEFAULT_MARGIN = 500;
const FIELD_LABELS = {
  "rpm.max": "Gauge maximum",
  "rpm.amber": "Amber from",
  "rpm.red": "Red from",
  "rpm.shift": "Shift lights flash at",
  "rpm.limit": "Limiter (redline)",
  ratios: "Gear ratios",
  finalDrive: "Final drive",
  circumference: "Rolling circumference",
  ratedPower: "Rated power",
  powerRpm: "Power peak",
  ratedTorque: "Rated torque",
  torqueRpm: "Torque peak",
  mass: "Kerb mass",
};
export const MARKET_NAMES = {
  EU: "Europe",
  UK: "United Kingdom",
  US: "United States",
  JP: "Japan",
};

// Tyre "195/50R16" -> rolling circumference in metres (geometry only: rim + two sidewalls).
export function circumferenceFor(tyre) {
  const m = /^(\d{3})\/(\d{2})R(\d{2})$/.exec(tyre ?? "");
  if (!m) return null;
  const diameter = Number(m[3]) * 25.4 + (2 * Number(m[1]) * Number(m[2])) / 100;
  return Math.round(Math.PI * diameter) / 1000;
}
// Turn red `margin` rpm before the limiter so there is time to react; the shift lights flash a little later,
// amber starts 500 rpm before red. 7500 with the default 500: amber 6500, red 7000, shift 7200, gauge 8000.
export function warningRpm(limit, margin = DEFAULT_MARGIN) {
  const red = limit - margin;
  return {
    max: Math.ceil((limit + 500) / 1000) * 1000,
    amber: Math.max(500, red - 500),
    red,
    shift: red + Math.round((margin * 0.4) / 50) * 50,
    limit,
  };
}
const unique = (items) => [...new Set(items)];
export function presetsFor(market) {
  return PRESETS.filter((p) => p.markets.includes(market));
}
export function findPreset({ market, generation, engine, transmission }) {
  return (
    presetsFor(market).find(
      (p) =>
        p.generation === generation &&
        p.engine === engine &&
        p.transmission === transmission,
    ) ?? null
  );
}
export function presetById(id) {
  return PRESETS.find((p) => p.id === id) ?? null;
}
// Options left for each choice once the earlier ones are fixed; invalid choices fall back to the first option.
export function resolveChoices(choices) {
  const c = { ...choices };
  if (!MARKETS.includes(c.market)) c.market = MARKETS[0];
  const pick = (key, list) => {
    if (!list.includes(c[key])) c[key] = list[0];
    return list;
  };
  let pool = presetsFor(c.market);
  const options = {
    market: MARKETS,
    generation: pick("generation", unique(pool.map((p) => p.generation))),
  };
  pool = pool.filter((p) => p.generation === c.generation);
  options.engine = pick("engine", unique(pool.map((p) => p.engine)));
  pool = pool.filter((p) => p.engine === c.engine);
  options.transmission = pick(
    "transmission",
    unique(pool.map((p) => p.transmission)),
  );
  const preset = findPreset(c);
  options.body = pick("body", preset?.bodies ?? []);
  options.tyre = pick("tyre", preset?.tyres ?? []);
  const units = { ...MARKET_UNITS[c.market], ...(c.units ?? {}) };
  for (const [k, list] of Object.entries(unitChoices))
    if (!list.includes(units[k])) units[k] = MARKET_UNITS[c.market][k];
  c.units = units;
  c.margin = MARGINS.includes(Number(c.margin)) ? Number(c.margin) : DEFAULT_MARGIN;
  return { choices: c, options, preset };
}
// Choices that describe a vehicle profile, for prefilling the dialog.
export function choicesFromVehicle(v) {
  const preset = presetById(v.preset);
  return {
    market: MARKETS.includes(v.market) ? v.market : "EU",
    generation: preset?.generation ?? v.generation,
    engine: preset?.engine ?? v.engine,
    transmission: preset?.transmission ?? v.transmission,
    body: v.body === "rf" ? "RF" : v.body,
    tyre: v.tyre ?? null,
    units: { ...v.units },
    margin: v.rpm.limit - v.rpm.red,
  };
}
// What a preset would put in the profile: value plus whether a source backs it.
export function presetValues(preset, { body, tyre }) {
  const sourced = new Set(preset.verified ?? []),
    out = {};
  out["rpm.limit"] = {
    value: preset.rpm?.limit ?? null,
    sourced: sourced.has("rpm.limit"),
  };
  out.ratios = {
    value: preset.ratios ?? null,
    sourced: sourced.has("ratios") && (preset.ratios ?? []).every((r) => r),
  };
  out.circumference = {
    value: circumferenceFor(tyre),
    sourced: sourced.has("tyres") && !!circumferenceFor(tyre),
  };
  for (const k of [
    "finalDrive",
    "ratedPower",
    "powerRpm",
    "ratedTorque",
    "torqueRpm",
    "mass",
  ])
    out[k] = { value: preset[k] ?? null, sourced: sourced.has(k) };
  // Preset masses are for the roadster.
  if (body === "RF") out.mass.sourced = false;
  for (const k of Object.keys(out))
    if (out[k].value === null) out[k].sourced = false;
  return out;
}
// Write a preset into project.vehicle. Units go through setUnits so custom scales are converted.
// Unknown preset values keep the current value and are marked assumed.
export function applyPreset(project, preset, choices) {
  const { choices: c } = resolveChoices({
    ...choices,
    generation: preset.generation,
    engine: preset.engine,
    transmission: preset.transmission,
  });
  if (!preset.markets.includes(c.market))
    throw Error(preset.label + " is not listed for " + c.market);
  const v = project.vehicle,
    values = presetValues(preset, c),
    assumed = [];
  Object.assign(v, {
    generation: preset.generation,
    engine: preset.engine,
    transmission: preset.transmission,
    body: c.body ?? v.body,
    market: c.market,
    preset: preset.id,
    tyre: c.tyre ?? null,
  });
  const [from, to] = preset.years ?? [];
  if (Number.isInteger(from) && !(v.year >= from && v.year <= (to ?? 2100)))
    v.year = from;
  for (const field of SPEC_FIELDS) {
    const { value, sourced } = values[field];
    if (field === "rpm.limit")
      v.rpm = warningRpm(Number.isInteger(value) ? value : v.rpm.limit, c.margin);
    else if (field === "ratios") {
      if (Array.isArray(value) && value.length)
        v.ratios = value.map((r, i) => r ?? v.ratios[i] ?? null);
    } else if (Number.isFinite(value)) v[field] = value;
    if (!sourced) assumed.push(field);
  }
  assumed.push(...MODEL_FIELDS);
  v.assumed = assumed;
  const specs = assumed.filter((f) => SPEC_FIELDS.includes(f));
  v.provenance =
    `${preset.label} (${c.market}${c.body === "RF" ? ", RF" : ""}), sources in docs/18-vehicle-presets.md. ` +
    (specs.length
      ? "Assumed: " + specs.map((f) => FIELD_LABELS[f]).join(", ") + "."
      : "All specifications sourced.");
  for (const [k, unit] of Object.entries(c.units))
    if (v.units[k] !== unit) setUnits(project, k, unit);
  return c;
}
// A hand edit of a field that came from a preset: it is no longer the sourced value.
export function markEdited(vehicle, path) {
  if (!vehicle.preset) return;
  const field = path.startsWith("ratios.") ? "ratios" : path;
  if (!SPEC_FIELDS.includes(field)) return;
  vehicle.assumed = [...new Set([...(vehicle.assumed ?? []), field])];
  if (!/edited by hand/.test(vehicle.provenance ?? ""))
    vehicle.provenance = ((vehicle.provenance ?? "") + " Some values edited by hand.").trim();
}
// Saved choice in the editor preferences, so new designs start from it.
export function savedChoice(preferences) {
  const saved = preferences.value.carSetup;
  return saved?.done ? saved : null;
}

// Summary text in the units being chosen (power and torque); the profile itself stores PS and Nm.
const fmt = (field, value, units) => {
  if (value === null || value === undefined) return "unknown";
  if (field === "ratios") return value.map((r) => r ?? "?").join(" / ");
  if (field.startsWith("rpm.") || field.endsWith("Rpm")) return value + " rpm";
  if (field === "ratedPower" || field === "ratedTorque") {
    const signal = field === "ratedPower" ? "power" : "torque",
      unit = units[signal];
    return Math.round(toUnit(value, signal, unit)) + " " + unit;
  }
  return value + ({ circumference: " m", mass: " kg" }[field] ?? "");
};

// The dialog. api: { command(name, fn) (inline errors), lastError(), vehicle(), preferences, openDialog(id), notify(text) }
export class CarSetup {
  constructor(api) {
    this.api = api;
    this.$ = (id) => document.getElementById(id);
    this.step = 1;
    this.firstRun = false;
    this.choices = null;
    const $ = this.$;
    for (const key of ["market", "generation", "engine", "transmission", "body", "tyre"])
      $("setup-" + key).onchange = () => {
        this.choices[key] = $("setup-" + key).value;
        // A new region brings its own default units.
        if (key === "market") this.choices.units = null;
        this.render();
      };
    const host = $("setup-unit-fields");
    for (const [key, list] of Object.entries(unitChoices)) {
      const label = document.createElement("label"),
        select = document.createElement("select");
      label.textContent = key[0].toUpperCase() + key.slice(1);
      select.id = "setup-unit-" + key;
      list.forEach((u) => select.add(new Option(u.replace(/^C$|^F$/, "°$&"), u)));
      select.onchange = () => {
        this.choices.units[key] = select.value;
        this.render();
      };
      label.append(select);
      host.append(label);
    }
    $("setup-margin").replaceChildren(
      ...MARGINS.map(
        (m) =>
          new Option(
            m === 0 ? "At the limiter" : m + " rpm before the limiter",
            String(m),
          ),
      ),
    );
    $("setup-margin").onchange = () => {
      this.choices.margin = Number($("setup-margin").value);
      this.render();
    };
    $("setup-form").onsubmit = (e) => {
      e.preventDefault();
      if (this.step === 1) {
        this.step = 2;
        this.render();
        $("setup-unit-speed").focus();
      } else this.apply();
    };
    $("setup-back").onclick = () => {
      this.step = 1;
      this.render();
    };
    // Leaving the first run without a choice keeps the profile and is not asked again.
    // Remembered right away (the close event comes a task later, after a quick reload could already have happened).
    const dismiss = () => {
      if (this.firstRun && !savedChoice(this.api.preferences)) {
        this.remember(null);
        this.api.notify("You can choose your car later under Project → Car setup.");
      }
      this.firstRun = false;
    };
    $("setup-skip").onclick = () => {
      dismiss();
      $("setup-dialog").close();
    };
    $("setup-dialog").addEventListener("cancel", dismiss);
    $("setup-dialog").addEventListener("close", dismiss);
  }
  open({ firstRun = false } = {}) {
    this.firstRun = firstRun;
    this.step = 1;
    this.choices = choicesFromVehicle(this.api.vehicle());
    this.$("setup-error").textContent = "";
    this.$("setup-intro").textContent = firstRun
      ? "Which MX-5 do you have? The designer fills in its rev limits, gearing and tyre size, and the units you prefer. You can change this later under Project → Car setup."
      : "Choose your car to replace the vehicle settings of this project. Undo brings the previous ones back.";
    this.$("setup-skip").textContent = firstRun
      ? "Keep the default settings"
      : "Cancel";
    this.render();
    this.api.openDialog("setup-dialog");
  }
  render() {
    const $ = this.$,
      { choices, options, preset } = resolveChoices(this.choices);
    this.choices = choices;
    this.preset = preset;
    const fill = (key, list, name = (x) => x) => {
      const el = $("setup-" + key);
      el.replaceChildren(...list.map((x) => new Option(name(x), x)));
      el.value = choices[key] ?? "";
      el.disabled = list.length < 2;
    };
    fill("market", options.market, (m) => MARKET_NAMES[m] ?? m);
    fill("generation", options.generation, (g) => {
      const years = PRESETS.filter((p) => p.generation === g).flatMap(
          (p) => p.years ?? [],
        ),
        from = Math.min(...years.filter(Number.isInteger)),
        to = Math.max(...years.filter(Number.isInteger));
      return Number.isFinite(from)
        ? `${g} (${from}–${to >= new Date().getFullYear() ? "" : to})`
        : g;
    });
    fill("engine", options.engine, (e) => e + " L");
    fill("transmission", options.transmission, (t) =>
      t === "manual" ? "Manual (6-speed)" : "Automatic (6-speed)",
    );
    fill("body", options.body, (b) => (b === "RF" ? "RF (retractable fastback)" : "Roadster"));
    fill("tyre", options.tyre);
    for (const [k, u] of Object.entries(choices.units))
      $("setup-unit-" + k).value = u;
    $("setup-margin").value = String(choices.margin);
    $("setup-car").hidden = this.step !== 1;
    $("setup-intro").hidden = this.step !== 1;
    $("setup-units").hidden = this.step !== 2;
    $("setup-back").hidden = this.step !== 2;
    $("setup-next").textContent = this.step === 1 ? "Next" : "Apply";
    $("setup-next").disabled = !preset;
    $("setup-title").textContent =
      this.step === 1 ? "Your car" : "Units and summary";
    if (!preset) {
      $("setup-error").textContent = "No preset for this combination yet.";
      return;
    }
    $("setup-error").textContent = "";
    const values = presetValues(preset, choices),
      warnings = warningRpm(
        values["rpm.limit"].value ?? this.api.vehicle().rpm.limit,
        choices.margin,
      ),
      row = (f, value, kind) => {
        const tr = document.createElement("tr"),
          name = document.createElement("th"),
          cell = document.createElement("td"),
          tag = document.createElement("td");
        name.textContent = FIELD_LABELS[f];
        cell.textContent = fmt(f, value, choices.units);
        tag.textContent = kind;
        tag.className = kind === "your margin" ? "choice" : kind;
        tr.append(name, cell, tag);
        return tr;
      },
      rows = SPEC_FIELDS.flatMap((f) => [
        row(f, values[f].value, values[f].sourced ? "sourced" : "assumed"),
        ...(f === "rpm.limit"
          ? WARNING_FIELDS.map((w) => row(w, warnings[w.slice(4)], "your margin"))
          : []),
      ]);
    $("setup-summary-body").replaceChildren(...rows);
    $("setup-summary-caption").textContent =
      preset.label + " · " + (MARKET_NAMES[choices.market] ?? choices.market);
  }
  apply() {
    const preset = this.preset,
      choices = this.choices;
    let applied;
    const result = this.api.command("Car setup", (project) => {
      applied = applyPreset(project, preset, choices);
      return true;
    });
    if (result === undefined) {
      this.$("setup-error").textContent = this.api.lastError() || "Could not apply the car setup.";
      return;
    }
    this.remember(preset, applied);
    this.firstRun = false;
    this.$("setup-dialog").close();
    this.api.notify("Vehicle settings set for " + preset.label + ".");
  }
  remember(preset, choices = null) {
    this.api.preferences.set({
      carSetup: preset
        ? {
            done: true,
            preset: preset.id,
            market: choices.market,
            body: choices.body,
            tyre: choices.tyre,
            units: { ...choices.units },
            margin: choices.margin,
          }
        : { done: true, preset: null },
    });
  }
}

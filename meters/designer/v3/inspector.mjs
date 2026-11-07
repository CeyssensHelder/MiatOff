// SPDX-License-Identifier: GPL-3.0-or-later
import * as M from "./model.mjs";
import { styleFor } from "./layout.mjs";
import * as P from "./presentation.mjs";
import { editableStyle } from "./pages.mjs";
const MIXED = Symbol("mixed");
const common = (values) =>
  values.every((v) => JSON.stringify(v) === JSON.stringify(values[0]))
    ? values[0]
    : MIXED;
export class Inspector {
  constructor(api) {
    this.api = api;
    this.fields = new Map();
    this.sections = new Map();
    this.used = new Set();
    this.invalid = null;
    this.contextKey = "";
  }
  section(key, title) {
    let d = this.sections.get(key);
    if (!d) {
      d = document.createElement("details");
      d.dataset.section = key;
      const s = document.createElement("summary");
      s.textContent = title;
      d.append(s);
      d.ontoggle = () => {
        if (this.rendering) return;
        const prefs = this.api.preferences;
        const sections = {
          ...prefs.value.sections,
          [prefs.value.detail + ":" + this.api.scope() + ":" + key]: d.open,
        };
        prefs.set({ sections });
      };
      this.sections.set(key, d);
    }
    const saved =
      this.api.preferences.value.sections[
        this.api.level() + ":" + this.api.scope() + ":" + key
      ];
    if (d.dataset.level !== String(this.api.level()) + this.api.scope()) {
      d.open = saved ?? ["content", "appearance", "background"].includes(key);
      d.dataset.level = String(this.api.level()) + this.api.scope();
    }
    this.sectionUsed.add(key);
    if (d.parentNode !== this.api.host) this.api.host.append(d);
    d.hidden = false;
    return d;
  }
  transact(name, fn, input, error) {
    const entered = input.value;
    const result = this.api.command(name, fn);
    if (result === undefined) {
      input.value = entered;
      error.textContent =
        this.api.lastError() || "This change could not be applied.";
      input.setAttribute("aria-invalid", "true");
      this.invalid = input;
      input.focus();
      return false;
    }
    error.textContent = "";
    input.removeAttribute("aria-invalid");
    if (this.invalid === input) this.invalid = null;
    return true;
  }
  field(
    parent,
    key,
    definition,
    value,
    change,
    { custom = false, reset = null, disabled = false } = {},
  ) {
    this.used.add(key);
    let n = this.fields.get(key);
    const options = definition.choices;
    const select = definition.control === "select";
    if (n && n.input.tagName !== (select ? "SELECT" : "INPUT")) {
      n.row.remove();
      this.fields.delete(key);
      n = null;
    }
    if (!n) {
      const row = document.createElement("div"),
        label = document.createElement("label"),
        input = document.createElement(select ? "select" : "input"),
        error = document.createElement("small"),
        origin = document.createElement("span"),
        resetButton = document.createElement("button");
      row.className = "property-row";
      row.dataset.property = key;
      input.id = "property-" + key.replace(/[^a-z0-9]/gi, "-");
      label.htmlFor = input.id;
      input.name = key;
      input.autocomplete = "off";
      error.className = "field-error";
      error.id = input.id + "-error";
      input.setAttribute("aria-describedby", error.id);
      origin.className = "custom-badge";
      origin.textContent = "Custom";
      resetButton.type = "button";
      resetButton.textContent = "↺";
      resetButton.className = "reset-property";
      row.append(label, input, origin, resetButton, error);
      n = { row, label, input, error, origin, resetButton };
      this.fields.set(key, n);
      input.addEventListener("input", () => {
        input.dataset.pending = "true";
        if (this.invalid === input) {
          this.invalid = null;
          input.removeAttribute("aria-invalid");
          error.textContent = "";
        }
      });
    }
    const { row, label, input, error, origin, resetButton } = n;
    if (row.parentNode !== parent) parent.append(row);
    label.textContent = definition.label;
    input.setAttribute("aria-label", definition.label);
    input.disabled = disabled;
    input.title = disabled
      ? "Unlock this instrument or its group to edit"
      : (definition.help ?? "");
    origin.textContent = value === MIXED ? "Mixed" : "Custom";
    origin.hidden = !custom && value !== MIXED;
    resetButton.hidden = !custom || !reset;
    resetButton.disabled = disabled;
    resetButton.setAttribute(
      "aria-label",
      "Reset " + definition.label + " to page style",
    );
    resetButton.onclick = () =>
      this.transact("Reset " + definition.label, reset, input, error);
    if (select) {
      const list = options ?? [];
      const key = JSON.stringify(list) + (value === MIXED ? "mixed" : "");
      if (input.dataset.options !== key) {
        input.replaceChildren();
        if (value === MIXED) input.add(new Option("Mixed", "__mixed"));
        for (const item of list) {
          const [v, text] = Array.isArray(item) ? item : [item, item];
          input.add(new Option(text, String(v)));
        }
        input.dataset.options = key;
      }
      if (document.activeElement !== input)
        input.value = value === MIXED ? "__mixed" : String(value);
    } else {
      input.type = definition.control ?? "number";
      if (input.type === "number") {
        input.step = "any";
        input.inputMode = "decimal";
      }
      input.indeterminate = value === MIXED;
      if (document.activeElement !== input || this.api.restoreInputs()) {
        input.value = value === MIXED ? "" : (value ?? "");
        input.placeholder = value === MIXED ? "Mixed" : "";
        input.checked = value === true;
      }
    }
    input.onchange = () => {
      if (input.value === "__mixed") return;
      const value =
        input.type === "checkbox"
          ? input.checked
          : input.type === "number"
            ? Number(input.value)
            : input.value;
      if (
        input.type === "number" &&
        (input.value.trim() === "" || !Number.isFinite(value))
      ) {
        this.invalid = input;
        input.setAttribute("aria-invalid", "true");
        error.textContent = "Enter a finite number.";
        input.focus();
        return;
      }
      if (
        this.transact(
          "Change " + definition.label,
          () => change(value),
          input,
          error,
        )
      )
        delete input.dataset.pending;
    };
    return input;
  }
  clearError() {
    if (this.invalid && !this.invalid.isConnected) this.invalid = null;
    return !this.invalid;
  }
  render() {
    const a = this.api,
      c = a.context();
    if (!c) return;
    this.rendering = true;
    if (this.paletteBox) this.paletteBox.hidden = this.api.scope() !== "theme";
    this.used = new Set();
    a.customSummary.hidden = true;
    if (this.variantBox) this.variantBox.hidden = true;
    if (this.presetBox)
      this.presetBox.hidden = a.scope() !== "widget" || !c.selection.length;
    this.sectionUsed = new Set();
    for (const d of this.sections.values())
      d.querySelectorAll(".warning-summary").forEach((n) => n.remove());
    const ws = c.selection,
      scope = a.scope();
    a.title.textContent =
      scope === "theme"
        ? "Page style"
        : scope === "background"
          ? "Page background"
          : ws.length > 1
            ? ws.length + " instruments"
            : ws[0]
              ? P.instrumentNames[ws[0].type]
              : "Properties";
    a.subtitle.textContent =
      scope === "widget" && ws.length === 1
        ? (M.signals[ws[0].signal]?.label ?? ws[0].label)
        : scope === "widget"
          ? "Select an instrument to edit it."
          : "Changes apply to " +
            (scope === "theme" ? "this page." : "this page background.");
    a.empty.hidden = scope !== "widget" || !!ws.length;
    a.back.hidden = scope === "widget";
    a.backgroundTools.hidden = scope !== "background";
    if (scope === "widget" && ws.length) {
      this.widget(c);
    } else if (scope === "theme") {
      this.theme(c);
    } else if (scope === "background") {
      this.background(c);
    }
    for (const [key, n] of this.fields)
      if (!this.used.has(key)) {
        n.row.remove();
        this.fields.delete(key);
      }
    for (const [key, d] of this.sections)
      if (!this.sectionUsed.has(key) || d.children.length === 1) d.remove();
    a.host.hidden = scope === "widget" && !ws.length;
    this.rendering = false;
  }
  widget(c) {
    const { selection: ws, mode, vehicle } = c,
      theme = M.pageTheme(c.theme, c.page),
      level = this.api.level(),
      disabled = ws.some(this.api.locked);
    for (const box of Object.values(this.applyBoxes ?? {})) box.hidden = true;
    const content = this.section("content", "Content"),
      appearance = this.section("appearance", "Appearance");
    const defs = Object.values(P.properties);
    if (this.variantBox) this.variantBox.hidden = true;
    for (const def of defs) {
      if (
        def.id.startsWith("style.") ||
        def.minimumDetail > level ||
        !ws.every(def.appliesTo)
      )
        continue;
      const key = def.id;
      if (["threshold", "direction", "zones"].includes(key)) continue;
      if (
        key === "labelMode" &&
        ws.every((w) => w.type === "label" || w.type === "shape")
      )
        continue;
      if (key === "variant" && ws.some((w) => w.type === "number")) continue;
      const definition = { ...def };
      if (key === "signal")
        definition.choices = Object.keys(M.signals)
          .filter((k) =>
            ws.every((w) => M.registry[w.type].supportedSignals.includes(k)),
          )
          .map((k) => [k, P.readingName(k)]);
      if (key === "variant")
        definition.choices = M.registry[ws[0].type].variants.filter((v) =>
          ws.every((w) => M.registry[w.type].variants.includes(v)),
        );
      if (key === "variant") {
        this.variants(c, appearance, definition.choices, disabled);
        continue;
      }
      if (key === "orientation" && ws.every((w) => w.type === "shape"))
        definition.choices = ["horizontal", "vertical", "diagonal", "custom"];
      const parent =
        def.section === "content"
          ? content
          : def.section === "layout"
            ? this.section("layout", "Layout")
            : appearance;
      this.field(
        parent,
        "widget." + key,
        definition,
        common(ws.map((w) => w[key])),
        (value) =>
          ws.forEach((w) => {
            if (this.api.locked(w) && key !== "locked")
              throw Error("Unlock this instrument or its group first");
            if (key === "signal") M.bind(w, value);
            else {
              w[key] = value;
              if (key === "label") w.labelMode = "custom";
            }
          }),
        { disabled: disabled && key !== "locked" },
      );
    }
    if (
      ws.every((w) => M.signalTypes.includes(w.type)) &&
      (level >= 1 || ws.every((w) => w.type === "warning"))
    )
      this.warnings(c, content, disabled);
    if (
      ws.some((w) => w.signal === "rpm" || w.type === "shift") &&
      level === 0
    ) {
      const text = document.createElement("p");
      text.className = "warning-summary";
      text.textContent = "RPM warnings use the vehicle profile.";
      content.append(text);
    }
    const group = c.page.groups.find((g) =>
      ws.every((w) => g.widgetIds.includes(w.id)),
    );
    if (group && level >= 1)
      this.field(
        content,
        "group.name",
        { label: "Group name", control: "text" },
        group.name,
        (value) => (group.name = value),
        { disabled: group.locked },
      );
    this.presets(c, appearance, disabled);
    for (const def of Object.values(P.properties).filter(
      (d) =>
        d.id.startsWith("style.") &&
        d.id !== "style.effect" &&
        Math.max(
          ...ws.map((w) => d.minimumDetailFor?.(w) ?? d.minimumDetail),
        ) <= level &&
        ws.every((w) => d.appliesTo(w, level)),
    )) {
      const key = def.id.slice(6),
        styles = ws.map((w) => styleFor(theme, w, mode));
      const parent =
        def.section === "effects"
          ? this.section("effects", "Effects")
          : appearance;
      this.field(
        parent,
        def.id,
        def,
        common(styles.map((s) => s[key])),
        (value) =>
          ws.forEach((w) => {
            if (this.api.locked(w)) throw Error("Unlock this instrument first");
            w.style[key] = value;
          }),
        {
          custom: ws.some((w) => w.style[key] !== undefined),
          reset: () => ws.forEach((w) => delete w.style[key]),
          disabled,
        },
      );
    }
    if (level >= 1 && ws.every((w) => M.signalTypes.includes(w.type))) {
      const parent = this.section("scale", "Range"),
        policy = common(ws.map((w) => w.scale.mode));
      this.field(
        parent,
        "scale.mode",
        {
          label: "Range",
          control: "select",
          choices: [
            ["auto", "Automatic"],
            ["custom", "Custom"],
          ],
        },
        policy,
        (value) =>
          ws.forEach(
            (w) =>
              (w.scale =
                value === "auto"
                  ? { mode: "auto" }
                  : { mode: "custom", ...M.range(w, vehicle) }),
          ),
        { disabled },
      );
      if (policy === "custom")
        for (const key of ["min", "max"])
          this.field(
            parent,
            "scale." + key,
            {
              label:
                (key === "min" ? "Minimum" : "Maximum") +
                " (" +
                M.range(ws[0], vehicle).unit +
                ")",
              control: "number",
            },
            common(ws.map((w) => w.scale[key])),
            (value) => ws.forEach((w) => (w.scale[key] = value)),
            { disabled },
          );
    }
    if (this.zoneActions) this.zoneActions.hidden = true;
    if (
      level >= 1 &&
      ws.every((w) => M.registry[w.type].properties.includes("zones"))
    )
      this.zones(c, disabled);
    const custom = ws.reduce(
      (sum, w) =>
        sum +
        Object.keys(w.style).filter(
          (key) =>
            (P.properties["style." + key]?.minimumDetailFor?.(w) ??
              P.properties["style." + key]?.minimumDetail) > level &&
            !(key === "intensity" && w.style[key] === 0.5 && w.style.effect),
        ).length +
        (w.scale.mode === "custom" && level === 0 ? 1 : 0) +
        (w.warning.mode === "custom" && level === 0 && w.type !== "warning"
          ? 1
          : 0),
      0,
    );
    this.api.customSummary.hidden = !custom;
    this.api.customSummary.querySelector("span").textContent =
      "Additional custom settings are active (" + custom + ").";
    this.api.styleSummary.textContent = ws.some(
      (w) => Object.keys(w.style).length,
    )
      ? "Custom styling · resets restore page defaults"
      : "Using page styling";
  }
  // Colour by value: automatic (vehicle RPM settings and reading thresholds), custom or off.
  zones(c, disabled) {
    const ws = c.selection,
      v = c.vehicle,
      theme = M.pageTheme(c.theme, c.page),
      parent = this.section("zones", "Colour zones"),
      policy = common(ws.map((w) => w.zones.mode));
    this.field(
      parent,
      "zones.mode",
      {
        label: "Colour zones",
        control: "select",
        choices: [
          ["auto", "From reading / vehicle"],
          ["custom", "Custom zones"],
          ["off", "Off"],
        ],
        help: "Colours the value, dial track and bar segments by value.",
      },
      policy,
      (value) =>
        ws.forEach((w) => {
          if (value !== "custom") {
            w.zones = { mode: value, base: null, steps: [] };
            return;
          }
          // Start from what Automatic shows, so switching changes nothing visible.
          const style = styleFor(theme, w, c.mode);
          const auto = M.zones({ ...w, zones: { mode: "auto" } }, v, style);
          w.zones = {
            mode: "custom",
            base: auto.base,
            steps: auto.steps.length
              ? auto.steps.map((s) => ({ at: s.at, color: s.color ?? style.color }))
              : [
                  {
                    at: M.fromUnit(
                      (M.range(w, v).min + M.range(w, v).max) * 0.75,
                      w.signal,
                      M.range(w, v).unit,
                    ) ?? 0,
                    color: style.warningColor,
                  },
                ],
          };
        }),
      { disabled },
    );
    if (policy !== "custom" || ws.length !== 1) return;
    const w = ws[0],
      unit = M.displayUnit(w.signal, v),
      shown = (n) => {
        const value = M.toUnit(n, w.signal, unit);
        return value === null ? "" : Number(value.toFixed(3));
      },
      canonical = (value) => {
        const n = M.fromUnit(value, w.signal, unit);
        if (n === null) throw Error("Use a positive finite value for this unit.");
        return n;
      },
      rising = (steps) => {
        steps.sort((a, b) => a.at - b.at);
        if (steps.some((s, i) => i && s.at === steps[i - 1].at))
          throw Error("Each zone needs a different starting value.");
        return steps;
      };
    this.field(
      parent,
      "zones.useBase",
      { label: "Colour values below the first zone", control: "checkbox" },
      w.zones.base !== null,
      (on) => {
        w.zones.base = on ? styleFor(theme, w, c.mode).color : null;
      },
      { disabled },
    );
    if (w.zones.base !== null)
      this.field(
        parent,
        "zones.base",
        { label: "Below the first zone", control: "color" },
        w.zones.base,
        (value) => (w.zones.base = value),
        { disabled },
      );
    w.zones.steps.forEach((step, i) => {
      this.field(
        parent,
        "zones.at." + i,
        { label: `Zone ${i + 1} from (${unit || "value"})`, control: "number" },
        shown(step.at),
        (value) => {
          w.zones.steps[i].at = canonical(value);
          rising(w.zones.steps);
        },
        { disabled },
      );
      this.field(
        parent,
        "zones.color." + i,
        { label: `Zone ${i + 1} colour`, control: "color" },
        step.color ?? styleFor(theme, w, c.mode).color,
        (value) => (w.zones.steps[i].color = value),
        { disabled },
      );
    });
    let box = this.zoneActions;
    if (!box) {
      box = document.createElement("div");
      box.className = "zone-actions";
      for (const [action, text] of [
        ["add", "Add zone"],
        ["remove", "Remove last zone"],
      ]) {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.action = action;
        b.textContent = text;
        box.append(b);
      }
      this.zoneActions = box;
    }
    parent.append(box);
    box.hidden = false;
    const [add, remove] = box.querySelectorAll("button");
    add.disabled = disabled || w.zones.steps.length >= 4;
    remove.disabled = disabled || w.zones.steps.length <= 1;
    add.onclick = () =>
      this.api.command("Add colour zone", () => {
        const r = M.range(w, v),
          last = w.zones.steps.at(-1),
          from = last ? M.toUnit(last.at, w.signal, unit) : r.min,
          next = from + Math.max((r.max - from) / 2, (r.max - r.min) / 20);
        w.zones.steps.push({
          at: canonical(next),
          color: styleFor(theme, w, c.mode).warningColor,
        });
        rising(w.zones.steps);
      });
    remove.onclick = () =>
      this.api.command("Remove colour zone", () => w.zones.steps.pop());
  }
  variants(c, parent, choices, disabled) {
    if (!choices.length) return;
    let box = this.variantBox;
    if (!box) {
      box = document.createElement("fieldset");
      box.className = "appearance-presets variant-presets";
      box.dataset.property = "widget.variant";
      this.variantBox = box;
    }
    const key = c.selection[0].type + choices.join();
    if (box.dataset.variants !== key) {
      box.replaceChildren();
      const legend = document.createElement("legend");
      legend.textContent = "Visual variant";
      box.append(legend);
      for (const variant of choices) {
        const b = document.createElement("button"),
          canvas = document.createElement("canvas");
        canvas.width = 104;
        canvas.height = 70;
        b.type = "button";
        b.dataset.variant = variant;
        b.append(
          canvas,
          document.createTextNode(variant[0].toUpperCase() + variant.slice(1)),
        );
        box.append(b);
      }
      box.dataset.variants = key;
    }
    if (box.parentNode !== parent) parent.prepend(box);
    box.hidden = false;
    const current = common(c.selection.map((w) => w.variant));
    for (const b of box.querySelectorAll("button")) {
      b.disabled = disabled;
      b.setAttribute("aria-pressed", String(current === b.dataset.variant));
      b.onclick = () =>
        this.api.command("Visual variant", () =>
          c.selection.forEach((w) => (w.variant = b.dataset.variant)),
        );
      this.api.paintVariant(
        b.querySelector("canvas"),
        c.selection[0],
        b.dataset.variant,
      );
    }
  }
  presets(c, parent, disabled) {
    let box = this.presetBox;
    if (!box) {
      box = document.createElement("fieldset");
      box.className = "appearance-presets";
      box.dataset.property = "style.effect";
      const legend = document.createElement("legend");
      legend.textContent = "Appearance preset";
      box.append(legend);
      for (const effect of P.appearancePresets) {
        const button = document.createElement("button"),
          canvas = document.createElement("canvas");
        canvas.width = 104;
        canvas.height = 70;
        button.type = "button";
        button.dataset.effect = effect;
        button.append(
          canvas,
          document.createTextNode(effect[0].toUpperCase() + effect.slice(1)),
        );
        box.append(button);
      }
      this.presetBox = box;
    }
    if (box.parentNode !== parent) parent.prepend(box);
    box.hidden = false;
    const current = common(
      c.selection.map((w) =>
        P.effectiveAppearance(
          w,
          styleFor(M.pageTheme(c.theme, c.page), w, c.mode),
        ),
      ),
    );
    for (const b of box.querySelectorAll("button")) {
      b.disabled = disabled;
      b.setAttribute("aria-pressed", String(current === b.dataset.effect));
      b.onclick = () =>
        this.api.command("Appearance preset", () =>
          c.selection.forEach((w) => {
            if (this.api.locked(w)) throw Error("Unlock this instrument first");
            P.applyAppearance(w, b.dataset.effect);
          }),
        );
      this.api.paintPreset(
        b.querySelector("canvas"),
        c.selection[0],
        b.dataset.effect,
      );
    }
    this.api.customSummary.hidden = true;
  }
  warnings(c, parent, disabled) {
    const ws = c.selection,
      v = c.vehicle,
      policy = common(ws.map((w) => w.warning.mode));
    this.field(
      parent,
      "warning.mode",
      {
        label: "Warning policy",
        control: "select",
        choices: [
          ["auto", "From reading / vehicle"],
          ["custom", "Custom trigger"],
          ["off", "Off"],
        ],
      },
      policy,
      (value) =>
        ws.forEach(
          (w) =>
            (w.warning =
              value === "custom"
                ? {
                    mode: value,
                    threshold:
                      M.signals[w.signal]?.threshold ??
                      (w.signal === "rpm"
                        ? v.rpm.amber
                        : M.signals[w.signal].max * 0.9),
                    direction: M.signals[w.signal]?.direction ?? "above",
                  }
                : { mode: value }),
        ),
      { disabled },
    );
    if (policy === "custom") {
      const values = ws.map((w) => P.warningPresentation(w, v));
      if (new Set(values.map((s) => s.unit)).size === 1) {
        this.field(
          parent,
          "warning.threshold",
          {
            label: "Alert threshold (" + values[0].unit + ")",
            control: "number",
          },
          common(values.map((s) => s.threshold)),
          (value) =>
            ws.forEach((w) =>
              P.setWarningPresentation(
                w,
                v,
                value,
                P.warningPresentation(w, v).direction,
              ),
            ),
          { disabled },
        );
        this.field(
          parent,
          "warning.direction",
          {
            label: "Alert when",
            control: "select",
            choices: [
              ["above", "At or above"],
              ["below", "At or below"],
            ],
          },
          common(values.map((s) => s.direction)),
          (value) =>
            ws.forEach((w) =>
              P.setWarningPresentation(
                w,
                v,
                P.warningPresentation(w, v).threshold,
                value,
              ),
            ),
          { disabled },
        );
      }
    } else {
      let summary = parent.querySelector(".warning-summary");
      if (!summary) {
        summary = document.createElement("p");
        summary.className = "warning-summary";
        parent.append(summary);
      }
      summary.textContent = ws.some(
        (w) => w.signal === "rpm" || w.type === "shift",
      )
        ? "RPM warnings use the vehicle profile."
        : policy === "auto"
          ? "Warning defaults follow the selected reading."
          : "";
    }
  }
  theme(c) {
    this.api.customSummary.hidden = true;
    this.api.styleSummary.textContent =
      "Defaults for instruments without an override";
    const name = this.section("content", "Page");
    this.field(
      name,
      "theme.name",
      { label: "Page name", control: "text" },
      c.page.name,
      (v) => (c.page.name = v),
    );
    if (this.api.level() >= 1)
      this.field(
        name,
        "theme.author",
        { label: "Author", control: "text" },
        c.page.author ?? c.theme.author ?? "",
        (v) => (c.page.author = v),
      );
    let palettes = this.paletteBox;
    if (!palettes) {
      palettes = document.createElement("div");
      palettes.className = "palette-options";
      for (const [name, night, day] of [
        ["Mint", "#67dcc2", "#14746f"],
        ["Amber", "#ffbf69", "#925209"],
        ["Ice", "#8dbaff", "#245fab"],
      ]) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = name;
        b.style.setProperty("--swatch", night);
        b.onclick = () =>
          this.api.command("Apply " + name + " palette", () => {
            const context = this.api.context(),
              style = editableStyle(context.theme, context.page, context.mode);
            Object.assign(style, {
              color: this.api.context().mode === "day" ? day : night,
              glowColor: night,
              textColor:
                this.api.context().mode === "day" ? "#101820" : "#eaf0f6",
              captionColor:
                this.api.context().mode === "day" ? "#101820" : "#eaf0f6",
              unitColor:
                this.api.context().mode === "day" ? "#526877" : "#9ba9ba",
            });
          });
        palettes.append(b);
      }
      this.paletteBox = palettes;
    }
    const parent = this.section("appearance", "Page palette"),
      style =
        c.mode === "day"
          ? M.pageTheme(c.theme, c.page).dayStyle
          : M.pageTheme(c.theme, c.page).style;
    if (palettes.parentNode !== parent) parent.prepend(palettes);
    palettes.hidden = false;
    for (const def of Object.values(P.properties).filter(
      (d) => d.id.startsWith("style.") && d.minimumDetail <= this.api.level(),
    )) {
      const key = def.id.slice(6);
      this.field(
        def.section === "effects"
          ? this.section("effects", "Page effects")
          : parent,
        "theme." + key,
        def,
        style[key],
        (v) => (editableStyle(c.theme, c.page, c.mode)[key] = v),
      );
    }
    this.applyToAll(c, parent, "look");
  }
  // Copy this page's look (day and night styles) or background to every other page, as one undo step.
  applyToAll(c, parent, what) {
    const boxes = (this.applyBoxes ??= {});
    let box = boxes[what];
    if (!box) {
      box = document.createElement("div");
      box.className = "apply-all";
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.apply = what;
      box.append(b);
      boxes[what] = box;
    }
    for (const [key, other] of Object.entries(boxes))
      if (key !== what) other.hidden = true;
    const others = c.project.themes.flatMap((t) =>
        t.pages.filter((p) => p !== c.page).map((p) => [t, p]),
      ),
      b = box.querySelector("button");
    b.textContent =
      what === "look"
        ? `Use this look on all pages (${others.length} other)`
        : `Use this background on all pages (${others.length} other)`;
    b.disabled = !others.length;
    b.onclick = () =>
      this.api.command(
        what === "look" ? "Use look on all pages" : "Use background on all pages",
        (project) => {
          const context = this.api.context(),
            source = M.pageTheme(context.theme, context.page);
          for (const t of project.themes)
            for (const p of t.pages) {
              if (p.id === context.page.id) continue;
              if (what === "look") {
                p.style = M.clone(source.style);
                p.dayStyle = M.clone(source.dayStyle);
              } else {
                p.background = M.clone(context.page.background ?? context.theme.background);
                p.dayBackground = M.clone(
                  context.page.dayBackground ??
                    context.theme.dayBackground ??
                    context.theme.background,
                );
              }
            }
        },
      );
    parent.append(box);
    box.hidden = false;
  }
  background(c) {
    this.api.customSummary.hidden = true;
    const hiddenOptions =
      this.api.level() === 0 &&
      !["solid", "image"].includes(
        (
          c.page[c.mode === "day" ? "dayBackground" : "background"] ??
          c.theme[c.mode === "day" ? "dayBackground" : "background"] ??
          c.theme.background
        ).kind,
      );
    this.api.customSummary.hidden = !hiddenOptions;
    this.api.customSummary.querySelector("span").textContent =
      "Additional custom background settings are active.";
    this.api.styleSummary.textContent = "Background for this page only";
    const parent = this.section("background", "Background"),
      key = c.mode === "day" ? "dayBackground" : "background",
      b = c.page[key] ?? c.theme[key] ?? c.theme.background;
    this.field(
      parent,
      "page.name",
      { label: "Page name", control: "text" },
      c.page.name,
      (v) => (c.page.name = v),
    );
    const mutable = () => (c.page[key] ??= M.clone(b));
    const kinds =
      this.api.level() >= 1
        ? ["solid", "image", "linear", "radial", "grid", "carbon", "noise"]
        : ["solid", "image"];
    const items = [...new Set([...kinds, b.kind])].map((k) => [
      k,
      k[0].toUpperCase() + k.slice(1) + (kinds.includes(k) ? "" : " (custom)"),
    ]);
    this.field(
      parent,
      "background.kind",
      { label: "Background type", control: "select", choices: items },
      b.kind,
      (v) => {
        if (v === "image" && !b.asset) {
          const asset = Object.keys(c.project.assets)[0];
          if (!asset) throw Error("Upload an image first, then choose Image.");
          mutable().asset = asset;
        }
        mutable().kind = v;
      },
    );
    this.field(
      parent,
      "background.color",
      { label: "Background color", control: "color" },
      b.color,
      (v) => (mutable().color = v),
    );
    if (b.kind === "image") {
      for (const [prop, label, control, choices] of [
        ["fit", "Image fit", "select", ["cover", "contain"]],
        ["dim", "Darkening", "number"],
        ["opacity", "Image opacity", "number"],
        ...(this.api.level() >= 1
          ? [
              ["x", "Horizontal focal point", "number"],
              ["y", "Vertical focal point", "number"],
            ]
          : []),
      ])
        this.field(
          parent,
          "background." + prop,
          { label, control, choices },
          b[prop],
          (v) => (mutable()[prop] = v),
        );
    }
    if (this.api.level() >= 1) {
      this.field(
        parent,
        "background.color2",
        { label: "Secondary color", control: "color" },
        b.color2,
        (v) => (mutable().color2 = v),
      );
      if (["linear", "radial"].includes(b.kind))
        this.field(
          parent,
          "background.angle",
          { label: "Gradient direction", control: "number" },
          b.angle,
          (v) => (mutable().angle = v),
        );
      if (["grid", "carbon", "noise"].includes(b.kind))
        for (const prop of ["spacing", "textureOpacity"])
          this.field(
            parent,
            "background." + prop,
            {
              label: prop === "spacing" ? "Texture spacing" : "Texture opacity",
              control: "number",
            },
            b[prop],
            (v) => (mutable()[prop] = v),
          );
    }
    if (this.api.level() === 2 && ["linear", "radial"].includes(b.kind))
      b.stops.forEach((stop, i) => {
        this.field(
          parent,
          "stop." + i,
          { label: "Stop " + (i + 1) + " position", control: "number" },
          stop.at,
          (v) => {
            mutable().stops[i].at = v;
            mutable().stops.sort((a, b) => a.at - b.at);
          },
        );
        this.field(
          parent,
          "stopColor." + i,
          { label: "Stop " + (i + 1) + " color", control: "color" },
          stop.color,
          (v) => (mutable().stops[i].color = v),
        );
      });
    this.applyToAll(c, parent, "background");
  }
}

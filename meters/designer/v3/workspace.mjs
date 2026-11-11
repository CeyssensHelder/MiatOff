// SPDX-License-Identifier: GPL-3.0-or-later
import { levels, EditorPreferences } from "./presentation.mjs";
const $ = (id) => document.getElementById(id);
export class Workspace {
  constructor(api) {
    this.api = api;
    this.scope = "widget";
    this.trigger = null;
    this.sheetPanel = null;
    this.placeholder = null;
    this.selectionKey = "";
    this.pageKey = "";
    this.lastError = "";
    this.errorSticky = false;
    let storage;
    try {
      storage = globalThis.localStorage;
    } catch {}
    this.preferences = new EditorPreferences(
      api.namespace,
      storage,
      (message) => this.notify(message),
    );
    this.level = this.preferences.value.detail;
    document.body.dataset.editingDetail = String(this.level);
  }
  notify(message, error = false) {
    if (this.errorSticky && !error) return;
    $("status").textContent = message;
    $("notice").hidden = false;
    $("notice").classList.toggle("error", error);
    this.lastError = error ? message : "";
    if (error) this.errorSticky = true;
  }
  saveStatus(message, error = false) {
    $("save-status").textContent = message;
    if (error) this.notify(message, true);
  }
  canPresent() {
    const active = document.activeElement;
    if (
      active?.matches("input,select,textarea") &&
      active.id !== "editing-detail" &&
      active.dataset.pending === "true"
    )
      active.dispatchEvent(new Event("change", { bubbles: true }));
    if (!this.api.inspector().clearError()) return false;
    this.api.cancelDrag();
    return true;
  }
  closeDialogs() {
    for (const dialog of document.querySelectorAll("dialog[open]"))
      dialog.close();
  }
  openDialog(id, trigger = document.activeElement) {
    if (!this.canPresent()) return;
    this.closeDialogs();
    for (const menu of document.querySelectorAll("details.toolbar-menu[open]"))
      menu.open = false;
    this.trigger = trigger;
    $(id).showModal();
  }
  openPanel(which, trigger = document.activeElement) {
    if (!this.canPresent()) return;
    const panel = document.querySelector(
      which === "inspector" ? ".inspector-panel" : ".library-panel",
    );
    if (innerWidth >= 1200) {
      panel.scrollIntoView({ block: "nearest" });
      panel.querySelector("button,input,select,summary")?.focus();
      return;
    }
    this.closeDialogs();
    this.trigger = trigger;
    this.placeholder = document.createComment("panel-home");
    panel.before(this.placeholder);
    this.sheetPanel = panel;
    $("sheet-title").textContent =
      which === "inspector" ? "Properties" : "Tools";
    $("sheet-body").append(panel);
    $("tool-sheet").showModal();
  }
  setTab(tab) {
    if (!this.canPresent()) return;
    this.preferences.set({ leftTab: tab });
    for (const key of ["pages", "instruments", "layers"]) {
      const current = key === tab;
      const button = $(key + "-tab");
      button.setAttribute("aria-selected", String(current));
      button.tabIndex = current ? 0 : -1;
      $("left-" + key).hidden = !current;
    }
    this.api.invalidate();
  }
  setScope(scope) {
    if (!this.canPresent()) return;
    this.scope = scope;
    this.api.renderInspector();
    this.openPanel("inspector");
  }
  setDetail(detail) {
    if (!this.canPresent()) {
      $("editing-detail").value = String(this.level);
      return;
    }
    this.level = detail;
    this.preferences.set({ detail });
    this.applyDetail();
    this.api.renderInspector();
    this.api.invalidate();
  }
  applyDetail() {
    $("editing-detail").value = String(this.level);
    $("editing-detail").setAttribute("aria-valuetext", levels[this.level]);
    $("detail-value").textContent = levels[this.level];
    document.body.dataset.editingDetail = String(this.level);
    for (const b of document.querySelectorAll("button[data-detail]"))
      b.setAttribute(
        "aria-pressed",
        String(Number(b.dataset.detail) === this.level),
      );
    for (const node of document.querySelectorAll("[data-min-detail]"))
      node.hidden = Number(node.dataset.minDetail) > this.level;
  }
  init() {
    this.applyDetail();
    this.setTab(this.preferences.value.leftTab);
    const main = document.querySelector("main");
    main.style.setProperty(
      "--library-width",
      this.preferences.value.leftWidth + "px",
    );
    main.style.setProperty(
      "--inspector-width",
      this.preferences.value.rightWidth + "px",
    );
    $("editing-detail").oninput = (e) => this.setDetail(Number(e.target.value));
    for (const b of document.querySelectorAll("button[data-detail]"))
      b.onclick = () => this.setDetail(Number(b.dataset.detail));
    for (const b of document.querySelectorAll("[data-forward]"))
      b.onclick = () => $(b.dataset.forward).click();
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") {
          const menu = document.querySelector("details.toolbar-menu[open]");
          if (menu) {
            e.preventDefault();
            e.stopImmediatePropagation();
            menu.open = false;
            menu.querySelector("summary").focus();
          }
        }
      },
      true,
    );
    $("dismiss-notice").onclick = () => {
      $("notice").hidden = true;
      this.errorSticky = false;
    };
    for (const key of ["pages", "instruments", "layers"]) {
      $(key + "-tab").onclick = () => this.setTab(key);
      $(key + "-tab").onkeydown = (e) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const tabs = ["pages", "instruments", "layers"],
            i = tabs.indexOf(key),
            next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? 2
                  : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
          this.setTab(tabs[next]);
          $(tabs[next] + "-tab").focus();
        }
      };
    }
    $("library-tab").onclick = () => this.openPanel("library");
    $("inspector-tab").onclick = () => this.openPanel("inspector");
    $("add-instrument-open").onclick = () => {
      this.setTab("instruments");
      this.openPanel("library");
    };
    for (const id of ["open-theme-style", "empty-theme"])
      $(id).onclick = () => {
        this.closeDialogs();
        this.setScope("theme");
      };
    for (const id of ["open-background", "empty-background"])
      $(id).onclick = () => this.setScope("background");
    $("scope-back").onclick = () => this.setScope("widget");
    $("reveal-custom").onclick = () => this.setDetail(2);
    for (const [button, dialog] of [
      ["project-open", "project-dialog"],
      ["export-open", "export-dialog"],
      ["vehicle-open", "vehicle-dialog"],
      ["simulation-open", "simulation-dialog"],
      ["issues-open", "issues-dialog"],
    ])
      $(button).onclick = () => this.openDialog(dialog);
    $("component-import").onclick = () => {
      $("file").click();
      $("project-dialog").close();
    };
    for (const b of document.querySelectorAll("[data-close]"))
      b.onclick = () => b.closest("dialog").close();
    for (const dialog of document.querySelectorAll("dialog")) {
      dialog.addEventListener("close", () => {
        if (dialog.id === "tool-sheet" && this.sheetPanel) {
          this.placeholder.replaceWith(this.sheetPanel);
          this.sheetPanel = null;
          this.placeholder = null;
        }
        const trigger = this.trigger;
        if (trigger?.isConnected && !trigger.closest("dialog:not([open])"))
          trigger.focus();
      });
      dialog.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b || b.hasAttribute("data-close")) return;
        if (
          [
            "theme",
            "setup",
            "snapshot",
            "contact-sheet",
            "import",
            "component-import",
            "checkpoint",
          ].includes(b.id)
        )
          dialog.close();
      });
    }
    const revisions = $("revisions").onclick;
    $("revisions").onclick = async () => {
      $("project-dialog").close();
      $("revision-panel").hidden = true;
      await revisions();
      this.openDialog("history-dialog");
    };
    $("resize-open").onclick = () => {
      const ws = this.api.selection();
      if (!ws.length) return;
      const b = this.api.bounds(ws);
      $("resize-width").value = b.w;
      $("resize-height").value = b.h;
      $("resize-error").textContent = "";
      this.openDialog("resize-dialog");
    };
    $("resize-form").onsubmit = (e) => {
      e.preventDefault();
      const ws = this.api.selection(),
        b = this.api.bounds(ws),
        width = Number($("resize-width").value),
        height = Number($("resize-height").value);
      const result = this.api.command("Resize selection", () => {
        if (!ws.length) throw Error("Select an instrument");
        if (ws.some(this.api.locked)) throw Error("Unlock the selection first");
        for (const w of ws) {
          w.x = b.x + ((w.x - b.x) * width) / b.w;
          w.y = b.y + ((w.y - b.y) * height) / b.h;
          w.w *= width / b.w;
          w.h *= height / b.h;
        }
      });
      if (result === undefined) {
        $("resize-error").textContent = this.lastError;
        $("resize-width").focus();
      } else $("resize-dialog").close();
    };
    const screen = document.querySelector(".screen");
    this.resizeObserver = new ResizeObserver(() => this.fitCanvas());
    this.resizeObserver.observe(screen);
    $("zoom").addEventListener("change", () => this.fitCanvas());
    window.addEventListener("resize", () => {
      if (innerWidth >= 1200 && $("tool-sheet").open) $("tool-sheet").close();
      this.fitCanvas();
    });
    this.fitCanvas();
  }
  fitCanvas() {
    const screen = document.querySelector(".screen"),
      canvas = $("canvas");
    if (
      screen.classList.contains("actual") &&
      !document.body.classList.contains("previewing")
    ) {
      canvas.style.width = "800px";
      canvas.style.height = "480px";
      return;
    }
    const width = Math.max(1, screen.clientWidth - 26),
      height = Math.max(1, screen.clientHeight - 26),
      scale = Math.min(width / 800, height / 480);
    canvas.style.width = 800 * scale + "px";
    canvas.style.height = 480 * scale + "px";
  }
  refresh() {
    const c = this.api.context();
    if (!c) return;
    const selectionKey = c.selection.map((w) => w.id).join();
    if (selectionKey !== this.selectionKey) {
      this.scope = "widget";
      this.selectionKey = selectionKey;
    }
    this.applyDetail();
    $("collection-caption").textContent =
      "Custom · " + c.pages.find(({ page }) => page.id === c.page.id).name;
    const locked = c.selection.some(this.api.locked);
    $("resize-open").disabled = !c.selection.length || locked;
    const hasOverrides = c.selection.some(
      (w) =>
        Object.keys(w.style).length ||
        w.labelMode === "custom" ||
        w.scale.mode === "custom",
    );
    $("widget-resets").hidden = this.scope !== "widget" || !hasOverrides;
    $("background-tools").hidden = this.scope !== "background";
    $("simulation-state").textContent =
      "Simulated · " + (this.api.running() ? "Playing" : "Paused");
    $("issues-open").textContent = c.issues.length
      ? c.issues.length +
        " design " +
        (c.issues.length === 1 ? "issue" : "issues")
      : "Design checks";
    $("issues-open").classList.toggle("has-issues", !!c.issues.length);
    const key =
      JSON.stringify(
        c.pages.map(({ page: p, name }) => [p.id, name, p.widgets.length]),
      ) + c.page.id;
    if (key !== this.pageKey) {
      this.pageKey = key;
      $("page-list").replaceChildren();
      for (const { page: p, name: pageName } of c.pages) {
        const b = document.createElement("button"),
          name = document.createElement("strong"),
          summary = document.createElement("span");
        b.type = "button";
        b.className = "page-tile";
        b.setAttribute("aria-current", String(p.id === c.page.id));
        name.textContent = pageName;
        summary.textContent = p.widgets.length + " instruments";
        b.append(name, summary);
        b.onclick = () => this.api.selectPage(p.id);
        $("page-list").append(b);
      }
    }
    $("vehicle-summary").textContent =
      `${c.vehicle.generation} · ${c.vehicle.engine} L ${c.vehicle.transmission} · ${c.vehicle.year} ${c.vehicle.market}${c.vehicle.tyre ? " · " + c.vehicle.tyre : ""}. ${c.vehicle.provenance ?? "Specifications require verification."}`;
  }
}

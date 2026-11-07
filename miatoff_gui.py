#!/usr/bin/env python3
"""MiatOff stick builder: check the car, then choose what to install or remove.

Three tabs:
  Check my car    build the read-only dump stick, then read the newest dump back
                  from the stick. The verdict is deterministic (tools/check_dump.py).
  Install/remove  per component: install, remove or leave it as it is. After a
                  check, options the car cannot take are greyed out.
  Meters Designer start the local designer (tools/meters_designer.py) and open it
                  in the browser. It builds no stick.

The choice is written to the stick as miatoff-plan.txt. In the car the dialog
offers the plan's steps one at a time (each is confirmed, and each restarts the
unit). The builders refuse anything that is not
the root of a FAT32 volume or that is the system drive.

    python miatoff_gui.py

SPDX-License-Identifier: GPL-3.0-or-later
"""
from pathlib import Path
import importlib.util
import os
import sys
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "tools"))
import check_dump  # noqa: E402
import stickkit  # noqa: E402
import meters_library  # noqa: E402

DUMP_BUILDER = ROOT / "dump-stick" / "build_stick.py"
INSTALL_BUILDER = ROOT / "aa-touch-stick" / "build_stick.py"
PLAN_NAME = "miatoff-plan.txt"

# colours
BG, CARD, INK, MUTED, LINE = "#f3f4f6", "#ffffff", "#111827", "#6b7280", "#e5e7eb"
ACCENT, ACCENT_DARK = "#2563eb", "#1d4ed8"
HEADER = "#111827"
WARN_BG, WARN_INK = "#fef3c7", "#92400e"
OPTION_FILL = {"keep": "#e5e7eb", "install": "#bfdbfe", "remove": "#fecaca"}
BADGE = {"installed": ("#dcfce7", "#166534"), "available": ("#dbeafe", "#1e40af"),
         "partial": ("#fef3c7", "#92400e"), "blocked": ("#fee2e2", "#991b1b"),
         "not checked": ("#f3f4f6", "#6b7280")}

# (category, [(key, title, description, install label, remove label)])
COMPONENTS = [
    ("Touch", [
        ("touchtune", "Touch while driving", "Touchscreen works in the Mazda menus while the car moves (TouchTune).",
         "Install", "Remove"),
        ("aa_touch", "Touch in Android Auto", "Tap, swipe and drag in Android Auto. Needs TouchTune for use while driving.",
         "Install", "Remove"),
    ]),
    ("Speed", [
        ("trim_dvdtv", "DVD and TV", "Stop the DVD player and TV tuner from starting at boot.", "Stop at boot", "Start again"),
        ("trim_sirius", "SiriusXM", "Stop SiriusXM (North America only) from starting at boot.", "Stop at boot", "Start again"),
        ("trim_pandora", "Pandora", "Stop Pandora from starting at boot.", "Stop at boot", "Start again"),
        ("trim_stitcher", "Stitcher", "Stop Stitcher from starting at boot.", "Stop at boot", "Start again"),
        ("trim_aha", "Aha", "Stop Aha from starting at boot. Three boot stages are re-pointed so voice and calls still start.",
         "Stop at boot", "Start again"),
        ("warning", "Startup warning", "Skip the warning screen at startup.", "Skip it", "Show it again"),
        ("delay", "Shorter list delay", "Holding the Commander tilted scrolls lists after 0.15 s instead of 1.5 s.",
         "Shorter", "Stock"),
    ]),
    ("Interface", [
        ("meters", "Meters", "Gauges under Applications: speed, rpm, G-meter, lap timer.", "Install", "Remove"),
        ("safety", "Camera safety text", "Blank the safety text over the reversing camera picture.",
         "Blank it", "Show it again"),
        ("sensors", "Parking sensor graphics", "Semi-transparent parking sensor graphics (MZD-AIO), so the camera picture shows through.",
         "Install", "Remove"),
        ("menu", "Hide trimmed items in the menu", "Also hide the sources you stop at boot (DVD/TV, SiriusXM, Pandora, Stitcher, Aha) in the Entertainment menu. Later changes to the boot trim are followed.",
         "Hide them", "Show them again"),
    ]),
]
KEYS = [item[0] for _, items in COMPONENTS for item in items]


def make_plan(choices: dict) -> str:
    """choices: key -> install | remove | keep. Returns the text of miatoff-plan.txt."""
    lines = ["# MiatOff plan: the end state chosen in the PC builder"]
    for key in KEYS:
        lines.append(f"{key}={choices.get(key, 'keep')}")
    return "\n".join(lines) + "\n"


def has_changes(choices: dict) -> bool:
    return any(choices.get(key, "keep") != "keep" for key in KEYS)


def write_plan(target: Path, text: str) -> None:
    with open(target / PLAN_NAME, "w", encoding="ascii", newline="\n") as handle:
        handle.write(text)
        handle.flush()
        os.fsync(handle.fileno())


def allowed_options(state):
    """Which of install/remove make sense for a checked state (None = not checked: both).
    Install on an installed part is an update: the car sees a different stick and offers REPAIR."""
    return {"available": {"install"}, "installed": {"install", "remove"}, "partial": {"install", "remove"},
            "blocked": set()}.get(state, {"install", "remove"})


def load_builder(path: Path):
    spec = importlib.util.spec_from_file_location("builder_" + path.parent.name.replace("-", "_"), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def removable_drives() -> list:
    """Stick roots: removable drives on Windows, external FAT32 volumes on macOS/Linux."""
    try:
        return stickkit.removable_sticks()
    except Exception:  # never block the window on drive detection
        return []


class Scrolled(tk.Frame):
    """A frame whose content scrolls vertically."""

    def __init__(self, parent):
        super().__init__(parent, bg=BG)
        self.canvas = tk.Canvas(self, bg=BG, highlightthickness=0)
        bar = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.inner = tk.Frame(self.canvas, bg=BG)
        self.inner.bind("<Configure>", lambda _e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.window = self.canvas.create_window((0, 0), window=self.inner, anchor="nw")
        self.canvas.bind("<Configure>", lambda e: self.canvas.itemconfigure(self.window, width=e.width))
        self.canvas.configure(yscrollcommand=bar.set)
        self.canvas.pack(side="left", fill="both", expand=True)
        bar.pack(side="right", fill="y")
        self.canvas.bind("<Enter>", lambda _e: self.canvas.bind_all("<MouseWheel>", self._wheel))
        self.canvas.bind("<Leave>", lambda _e: self.canvas.unbind_all("<MouseWheel>"))

    def _wheel(self, event):
        # Windows reports 120 per notch; macOS reports small steps (1, 2, ...).
        step = -event.delta if sys.platform == "darwin" else int(-event.delta / 120)
        if step:
            self.canvas.yview_scroll(step, "units")


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("MiatOff")
        self.configure(bg=BG)
        self.geometry("760x780")
        self.minsize(640, 520)
        self.vars, self.options, self.badges = {}, {}, {}
        self.verdict = None
        self.report_text = ""
        self.style = ttk.Style(self)
        self.style.theme_use("clam")
        self.style.configure("TNotebook", background=BG, borderwidth=0)
        self.style.configure("TNotebook.Tab", padding=(18, 8), font=("Segoe UI", 10, "bold"))
        self.style.map("TNotebook.Tab", background=[("selected", CARD)], foreground=[("selected", ACCENT)])
        self.style.configure("Accent.TButton", background=ACCENT, foreground="white", padding=(16, 8),
                             font=("Segoe UI", 10, "bold"), borderwidth=0)
        self.style.map("Accent.TButton", background=[("active", ACCENT_DARK), ("disabled", "#93c5fd")])
        self.style.configure("Plain.TButton", padding=(14, 8), font=("Segoe UI", 10))
        self.style.configure("Small.TButton", padding=(8, 2), font=("Segoe UI", 9))

        self._header()
        self._drive_bar()
        self._footer()
        self.tabs = ttk.Notebook(self)
        self.tabs.pack(fill="both", expand=True, padx=16, pady=(8, 0))
        self.check_tab = tk.Frame(self.tabs, bg=BG)
        self.choose_tab = tk.Frame(self.tabs, bg=BG)
        self.designer_tab = tk.Frame(self.tabs, bg=BG)
        self.tabs.add(self.check_tab, text="1  Check my car")
        self.tabs.add(self.choose_tab, text="2  Install / remove")
        self.tabs.add(self.designer_tab, text="3  Meters Designer")
        self._build_check_tab()
        self._build_choose_tab()
        self._build_designer_tab()
        self.tabs.bind("<<NotebookTabChanged>>", lambda _e: self._tab_changed())
        self._tab_changed()

    # ---------------------------------------------------------------- frame
    def _header(self):
        bar = tk.Frame(self, bg=HEADER)
        bar.pack(fill="x")
        tk.Label(bar, text="MiatOff", bg=HEADER, fg="white", font=("Segoe UI", 20, "bold")).pack(side="left", padx=20, pady=(14, 12))
        tk.Label(bar, text="Mazda Connect tweaks, checked against your own car", bg=HEADER, fg="#9ca3af",
                 font=("Segoe UI", 10)).pack(side="left", pady=(10, 0))
        warn = tk.Label(self, bg=WARN_BG, fg=WARN_INK, anchor="w", justify="left", wraplength=720, padx=20, pady=8,
                        font=("Segoe UI", 9),
                        text="Use at your own risk. Modifying the head unit can leave it unusable. Read the README "
                             "and the support table first.")
        warn.pack(fill="x")

    def _drive_bar(self):
        bar = tk.Frame(self, bg=BG)
        bar.pack(fill="x", padx=16, pady=(10, 0))
        tk.Label(bar, text="USB stick", bg=BG, fg=INK, font=("Segoe UI", 10, "bold")).pack(side="left")
        self.drive = ttk.Combobox(bar, values=removable_drives(), width=24, font=("Segoe UI", 10))
        self.drive.pack(side="left", padx=8)
        if self.drive["values"]:
            self.drive.current(0)
        ttk.Button(bar, text="Refresh", style="Small.TButton", command=self.refresh).pack(side="left")
        tk.Label(bar, text="FAT32, MBR, 32 GB or less", bg=BG, fg=MUTED, font=("Segoe UI", 9)).pack(side="left", padx=10)

    def _footer(self):
        bar = tk.Frame(self, bg=BG)
        bar.pack(side="bottom", fill="x", padx=16, pady=12)
        self.build_button = ttk.Button(bar, text="Build stick", style="Accent.TButton", command=self.build)
        self.build_button.pack(side="left")
        self.verify_button = ttk.Button(bar, text="Verify stick", style="Plain.TButton", command=self.verify)
        self.verify_button.pack(side="left", padx=8)

    def _tab_changed(self):
        # The stick buttons belong to tabs 1 and 2; the designer tab builds no stick.
        state = "disabled" if self.designing() else "normal"
        self.build_button.configure(state=state, text="Build check stick" if self.checking() else
                                    "Build stick" if self.designing() else "Build install stick")
        self.verify_button.configure(state=state)

    def card(self, parent, title=None):
        frame = tk.Frame(parent, bg=CARD, highlightbackground=LINE, highlightthickness=1)
        frame.pack(fill="x", pady=6)
        if title:
            tk.Label(frame, text=title.upper(), bg=CARD, fg=MUTED, font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=16, pady=(12, 2))
        return frame

    # ---------------------------------------------------------------- check tab
    def _build_check_tab(self):
        page = tk.Frame(self.check_tab, bg=BG)
        page.pack(fill="both", expand=True, pady=8)
        one = self.card(page, "Step 1: read the car")
        tk.Label(one, bg=CARD, fg=INK, justify="left", anchor="w", wraplength=660, font=("Segoe UI", 10),
                 text="Press Build check stick, put the stick in the car (engine on, home screen showing) and choose "
                      "FULL. It only reads and changes nothing on the car. Then bring the stick back."
                 ).pack(anchor="w", padx=16, pady=(0, 14))
        two = self.card(page, "Step 2: read the result")
        tk.Label(two, bg=CARD, fg=INK, justify="left", anchor="w", wraplength=660, font=("Segoe UI", 10),
                 text="Reads the newest dump on the stick and checks every file against the hashes the installer knows. "
                      "The same dump always gives the same answer."
                 ).pack(anchor="w", padx=16)
        row = tk.Frame(two, bg=CARD)
        row.pack(anchor="w", padx=16, pady=10)
        ttk.Button(row, text="Read last dump", style="Accent.TButton", command=self.read_dump).pack(side="left")
        ttk.Button(row, text="Copy report", style="Plain.TButton", command=self.copy_report).pack(side="left", padx=8)
        ttk.Button(row, text="Save to stick", style="Plain.TButton", command=self.save_report).pack(side="left")
        self.verdict_label = tk.Label(two, text="", bg=CARD, anchor="w", font=("Segoe UI", 11, "bold"))
        self.verdict_label.pack(anchor="w", padx=16)
        self.report = tk.Text(two, height=20, bg="#f9fafb", fg=INK, relief="flat", font=("Consolas", 9), wrap="none",
                              highlightbackground=LINE, highlightthickness=1)
        self.report.pack(fill="both", expand=True, padx=16, pady=(6, 16))
        self.report.insert("1.0", "No dump read yet.")
        self.report.configure(state="disabled")

    def read_dump(self):
        target = self.target()
        if target is None:
            return
        dump = check_dump.latest_dump(target)
        if dump is None:
            messagebox.showerror("MiatOff", f"No dump found on {target}.\nBuild the check stick, run it in the car, then read it again.")
            return
        self.verdict = check_dump.check(dump)
        self.report_text = check_dump.format_report(self.verdict)
        self.dump_path = dump
        self.report.configure(state="normal")
        self.report.delete("1.0", "end")
        self.report.insert("1.0", self.report_text)
        self.report.configure(state="disabled")
        colours = {"supported": "#166534", "not supported": "#991b1b", "incomplete": "#92400e"}
        self.verdict_label.configure(text=f"{self.verdict['overall'].upper()}   ({dump.name})",
                                     fg=colours[self.verdict["overall"]])
        self.apply_verdict(self.verdict)

    def copy_report(self):
        if self.report_text:
            self.clipboard_clear()
            self.clipboard_append(self.report_text)
            messagebox.showinfo("MiatOff", "Report copied. Paste it in a GitHub issue if you want support for a new firmware.")

    def save_report(self):
        if not self.verdict:
            return
        (self.dump_path / check_dump.REPORT_NAME).write_text(self.report_text, encoding="utf-8", newline="\n")
        messagebox.showinfo("MiatOff", f"Saved {check_dump.REPORT_NAME} next to the dump on the stick.")

    # ---------------------------------------------------------------- choose tab
    def _build_choose_tab(self):
        scroller = Scrolled(self.choose_tab)
        scroller.pack(fill="both", expand=True)
        body = scroller.inner
        tk.Label(body, bg=BG, fg=MUTED, justify="left", anchor="w", wraplength=680, font=("Segoe UI", 9),
                 text="Choose per part. After you have read a dump on step 1, options the car cannot take are greyed out. "
                      "In the car the steps are offered one at a time (INSTALL or REMOVE, then CANCEL), each confirmed and each restarting the unit."
                 ).pack(anchor="w", pady=(8, 0))
        self.override = tk.BooleanVar(value=False)
        override = tk.Checkbutton(
            body, variable=self.override, command=self._override_changed, bg=BG, activebackground=BG, anchor="w",
            justify="left", font=("Segoe UI", 9), wraplength=680,
            text="Override the check: allow Install and Remove for every part, even where the last dump says it is not possible. "
                 "Use this when the car has changed since the dump. The installer on the car still checks the real files "
                 "and changes nothing it does not recognise.")
        override.pack(anchor="w", pady=(8, 0))
        for category, items in COMPONENTS:
            frame = self.card(body, category)
            for key, title, description, install_label, remove_label in items:
                self._row(frame, key, title, description, install_label, remove_label)
            tk.Frame(frame, bg=CARD, height=8).pack()

    def _row(self, parent, key, title, description, install_label, remove_label):
        row = tk.Frame(parent, bg=CARD)
        row.pack(fill="x", padx=16, pady=6)
        text = tk.Frame(row, bg=CARD)
        text.pack(side="left", fill="x", expand=True)
        head = tk.Frame(text, bg=CARD)
        head.pack(anchor="w")
        tk.Label(head, text=title, bg=CARD, fg=INK, font=("Segoe UI", 10, "bold")).pack(side="left")
        badge = tk.Label(head, text="", bg=CARD, font=("Segoe UI", 8, "bold"), padx=6)
        badge.pack(side="left", padx=8)
        self.badges[key] = badge
        tk.Label(text, text=description, bg=CARD, fg=MUTED, anchor="w", justify="left", wraplength=330,
                 font=("Segoe UI", 9)).pack(anchor="w")
        var = tk.StringVar(value="keep")
        self.vars[key] = var
        seg = tk.Frame(row, bg=LINE, width=300, height=34)
        seg.pack(side="right")
        seg.pack_propagate(False)
        self.options[key] = {}
        # Labels drawn by hand: Tk on macOS ignores the colours of button-style
        # radio buttons, so a choice would not show there.
        for value, label in (("keep", "Leave as-is"), ("install", install_label), ("remove", remove_label)):
            option = tk.Label(seg, text=label, bg=CARD, fg=INK, font=("Segoe UI", 9),
                              disabledforeground="#d1d5db", cursor="hand2")
            option.pack(side="left", fill="both", expand=True, padx=(0, 1), pady=1)
            option.bind("<Button-1>", lambda _e, k=key, v=value: self._choose(k, v))
            self.options[key][value] = option
        var.trace_add("write", lambda *_a, k=key: self._paint(k))
        self._paint(key)

    def _choose(self, key, value):
        if str(self.options[key][value].cget("state")) != "disabled":
            self.vars[key].set(value)

    def _paint(self, key):
        chosen = self.vars[key].get()
        for value, option in self.options[key].items():
            on = value == chosen
            option.configure(bg=OPTION_FILL[value] if on else CARD,
                             font=("Segoe UI", 9, "bold") if on else ("Segoe UI", 9))

    # ---------------------------------------------------------------- designer tab
    def _build_designer_tab(self):
        import meters_designer
        self.meters_library = meters_library.PageLibrary()
        self.custom_vars, self.custom_rows = {}, {}
        self._library_signature = None
        self._removed_signature = None
        self.removed_rows = []
        self.designer_url = f"http://127.0.0.1:{meters_designer.DEFAULT_PORT}/designer/index.html"
        scroller = Scrolled(self.designer_tab)
        scroller.pack(fill="both", expand=True, pady=8)
        page = scroller.inner
        one = self.card(page, "Design your own gauge pages")
        tk.Label(one, bg=CARD, fg=INK, justify="left", anchor="w", wraplength=660, font=("Segoe UI", 10),
                 text="The designer opens in your web browser on this PC. It saves your work automatically in that "
                      "browser, for the address below, so always open it from here. Keep this window open while you "
                      "design: closing MiatOff stops the designer."
                 ).pack(anchor="w", padx=16, pady=(0, 10))
        row = tk.Frame(one, bg=CARD)
        row.pack(anchor="w", padx=16, pady=(0, 8))
        ttk.Button(row, text="Open designer", style="Accent.TButton", command=self.open_designer).pack(side="left")
        ttk.Button(row, text="Copy address", style="Plain.TButton", command=self.copy_designer_url).pack(side="left", padx=8)
        self.designer_status = tk.Label(one, text="Not started.", bg=CARD, fg=MUTED, anchor="w", font=("Segoe UI", 9))
        self.designer_status.pack(anchor="w", padx=16, pady=(0, 14))
        custom = self.card(page, "Custom pages")
        tk.Label(custom, bg=CARD, fg=INK, justify="left", anchor="w", wraplength=650, font=("Segoe UI", 10),
                 text="In the editor, press Send to builder to sync every page in Custom here. Choose up to eight pages "
                      "to include in your export. Updates keep your include choices. There are no theme groups."
                 ).pack(fill="x", padx=16, pady=(0, 10))
        self.custom_list = tk.Frame(custom, bg=CARD)
        self.custom_list.pack(fill="x", padx=16)
        self.custom_empty = tk.Label(self.custom_list, text="No custom meters sent yet. Open the designer to get started.",
                                     bg=CARD, fg=MUTED, anchor="w", wraplength=640)
        self.custom_empty.pack(fill="x", pady=10)
        actions = tk.Frame(custom, bg=CARD)
        actions.pack(fill="x", padx=16, pady=10)
        ttk.Button(actions, text="Select all", style="Small.TButton", command=lambda: self.select_custom_meters(True)).pack(side="left")
        ttk.Button(actions, text="Select none", style="Small.TButton", command=lambda: self.select_custom_meters(False)).pack(side="left", padx=6)
        ttk.Button(actions, text="Refresh list", style="Small.TButton", command=self.refresh_custom_meters).pack(side="left")
        self.custom_export = ttk.Button(custom, text="Export selected meters…", style="Accent.TButton", command=self.export_custom_meters)
        self.custom_export.pack(anchor="w", padx=16, pady=(0, 8))
        self.custom_status = tk.Label(custom, bg=CARD, fg=MUTED, anchor="w", justify="left", wraplength=650, font=("Segoe UI", 9))
        self.custom_status.pack(fill="x", padx=16, pady=(0, 14))
        # Shown while Meters is not set to Install on tab 2: only then do the selected pages go on the stick.
        self.meters_hint = tk.Frame(custom, bg=WARN_BG)
        tk.Label(self.meters_hint, bg=WARN_BG, fg=WARN_INK, anchor="w", justify="left", wraplength=470,
                 font=("Segoe UI", 9),
                 text="Meters is not set to Install. To put the selected pages on a stick, set Meters to Install "
                      "(Update, once a check shows Meters installed) on tab 2 and build the stick on that tab."
                 ).pack(side="left", fill="x", expand=True, padx=10, pady=8)
        ttk.Button(self.meters_hint, text="Go to Install / remove", style="Small.TButton",
                   command=lambda: self.tabs.select(self.choose_tab)).pack(side="right", padx=10, pady=8)
        self.vars["meters"].trace_add("write", lambda *_: self._update_meters_hint())
        self._update_meters_hint()
        self.custom_notice = tk.Label(custom, bg=CARD, fg="#92400e", anchor="w", justify="left", wraplength=650, font=("Segoe UI", 9))
        removed = self.card(page, "Removed pages")
        tk.Label(removed, bg=CARD, fg=INK, justify="left", anchor="w", wraplength=650, font=("Segoe UI", 10),
                 text="When Send to builder is used from an editor draft that lacks some pages, the designer asks first "
                      "and then moves those pages here. Restore puts a page back in the list above, not selected. A "
                      "restored page that is not in the editor draft will be offered for removal again on the next Send."
                 ).pack(fill="x", padx=16, pady=(0, 10))
        self.removed_list = tk.Frame(removed, bg=CARD)
        self.removed_list.pack(fill="x", padx=16, pady=(0, 6))
        self.removed_empty = tk.Label(self.removed_list, text="No removed pages.", bg=CARD, fg=MUTED, anchor="w")
        self.removed_empty.pack(fill="x", pady=4)
        self.removed_status = tk.Label(removed, bg=CARD, fg=MUTED, anchor="w", justify="left", wraplength=650, font=("Segoe UI", 9))
        self.removed_status.pack(fill="x", padx=16, pady=(0, 14))
        two = self.card(page, "Good to know")
        tk.Label(two, bg=CARD, fg=INK, justify="left", anchor="w", wraplength=660, font=("Segoe UI", 10),
                 text="Selected pages (at most eight) are built into the Meters install on the stick and show on the "
                      "car under Applications > Meters > CUSTOM, with live data. To change them later, build a new "
                      "stick with Meters set to Install (shown as Update once a check finds Meters installed) and "
                      "press REPAIR in the car. Nothing has been tested in a real car yet. Export selected meters "
                      "saves a design backup file that the car does not read. Browser drafts and this local library "
                      "are separate; use Export > Back up entire project in the editor for a complete backup."
                 ).pack(anchor="w", padx=16, pady=(0, 14))
        self.refresh_custom_meters()
        self.after(1000, self._poll_custom_meters)

    def _update_meters_hint(self):
        if self.vars["meters"].get() == "install":
            self.meters_hint.pack_forget()
        elif not self.meters_hint.winfo_manager():
            self.meters_hint.pack(fill="x", padx=16, pady=(0, 10), before=self.custom_export)

    def _ensure_designer(self):
        import meters_designer
        if not hasattr(self, "designer_server"):
            try:
                self.designer_server = meters_designer.launch(open_browser=False)
                self.designer_status.configure(text="Running at " + self.designer_url, fg="#166534")
            except OSError:
                # Port busy: reuse a designer server that is already running there.
                import urllib.request
                import json
                import hashlib
                try:
                    with urllib.request.urlopen(self.designer_url.split("/designer/")[0] + "/api/builder/session", timeout=2) as response:
                        connection = json.load(response)
                    expected = hashlib.sha256(str(self.meters_library.path.resolve()).encode()).hexdigest()
                    if connection.get("service") != "MiatOffDesigner" or connection.get("protocol") != 2 or connection.get("libraryId") != expected:
                        raise ValueError("Different or older designer server")
                except (OSError, ValueError):
                    self.designer_status.configure(text="Could not start.", fg="#991b1b")
                    messagebox.showerror("Meters Designer", f"Port {meters_designer.DEFAULT_PORT} is in use by "
                                         "another program or by a designer started from a different MiatOff window or "
                                         "folder. Close the old designer / MiatOff window, then reopen the designer "
                                         "from this window, so the editor and builder use the same custom meters library.")
                    return False
                self.designer_status.configure(text="Using the designer already running at " + self.designer_url,
                                               fg="#166534")
        return True

    def open_designer(self):
        import webbrowser
        if self._ensure_designer():
            webbrowser.open(self.designer_url)

    def preview_custom_meter(self, key):
        import webbrowser
        from urllib.parse import urlencode
        if self._ensure_designer():
            webbrowser.open(self.designer_url.replace("index.html", "preview.html") + "?" + urlencode({"theme": key}))

    def refresh_custom_meters(self):
        self.refresh_removed_pages()
        try:
            skipped = self.meters_library.skipped_migrations()
            if skipped:
                self.custom_notice.configure(text=f"{len(skipped)} older saved theme(s) could not be converted and were skipped; "
                                                  "they are untouched in the library file.")
                self.custom_notice.pack(fill="x", padx=16, pady=(0, 8), before=self.custom_status)
            else:
                self.custom_notice.pack_forget()
            rows = self.meters_library.list()
            signature = tuple((r["id"], r["sha256"], r["selected"]) for r in rows)
            if signature == self._library_signature:
                return
            self._library_signature = signature
            self.custom_empty.pack_forget()
            known = {r["id"] for r in rows}
            for key in list(self.custom_rows):
                if key not in known:
                    self.custom_rows.pop(key)[0].destroy()
                    self.custom_vars.pop(key)
            if not rows:
                self.custom_empty.pack(fill="x", pady=10)
            for row in rows:
                key = row["id"]
                if key not in self.custom_rows:
                    frame = tk.Frame(self.custom_list, bg=CARD)
                    frame.pack(fill="x", pady=5)
                    var = tk.BooleanVar(self, value=bool(row["selected"]))
                    check = tk.Checkbutton(frame, variable=var, bg=CARD, fg=INK, activebackground=CARD,
                                           anchor="w", justify="left", wraplength=360,
                                           command=lambda k=key: self._custom_meter_toggled(k))
                    check.pack(side="left", fill="x", expand=True)
                    ttk.Button(frame, text="Preview", style="Small.TButton", command=lambda k=key: self.preview_custom_meter(k)).pack(side="right", padx=(8, 0))
                    self.custom_rows[key] = (frame, check)
                    self.custom_vars[key] = var
                self.custom_vars[key].set(bool(row["selected"]))
                self.custom_rows[key][1].configure(text=f"{row['name']}\n{row['widgets']} instruments")
            selected = sum(bool(row["selected"]) for row in rows)
            self.custom_export.configure(state="normal" if selected else "disabled")
            self.custom_status.configure(text=f"{selected} of {len(rows)} Custom pages selected. Selection is saved on this PC.", fg=MUTED)
        except Exception as error:
            self._library_signature = None
            self.custom_export.configure(state="disabled")
            self.custom_status.configure(text="Library could not be read; existing data was preserved. " + str(error), fg="#991b1b")

    def refresh_removed_pages(self):
        try:
            signature = self.meters_library.retired_signature()
            if signature == self._removed_signature:
                return
            rows = self.meters_library.list_retired()
            self._removed_signature = signature
            for frame in self.removed_rows:
                frame.destroy()
            self.removed_rows = []
            self.removed_empty.pack_forget()
            if not rows:
                self.removed_empty.pack(fill="x", pady=4)
            for row in rows:
                frame = tk.Frame(self.removed_list, bg=CARD)
                frame.pack(fill="x", pady=3)
                tk.Label(frame, bg=CARD, fg=INK, anchor="w", justify="left", wraplength=420,
                         text=f"{row['name']}\n{row['widgets']} instruments, removed {row['retired'][:16].replace('T', ' ')} UTC"
                         ).pack(side="left", fill="x", expand=True)
                ttk.Button(frame, text="Restore", style="Small.TButton",
                           command=lambda r=row: self.restore_removed_page(r["id"], r["sha256"])).pack(side="right", padx=(8, 0))
                self.removed_rows.append(frame)
        except Exception as error:
            self._removed_signature = None
            self.removed_status.configure(text="Removed pages could not be read; nothing was changed. " + str(error), fg="#991b1b")

    def restore_removed_page(self, key, digest):
        try:
            result = self.meters_library.restore_retired(key, digest)
            self.removed_status.configure(text=f"Restored {result['name']}. It is in the list above, not selected.", fg="#166534")
        except Exception as error:
            self.removed_status.configure(text="Not restored: " + str(error), fg="#991b1b")
        self.refresh_custom_meters()

    def _poll_custom_meters(self):
        self.refresh_custom_meters()
        self.after(1000, self._poll_custom_meters)

    def _custom_meter_toggled(self, key):
        try:
            self.meters_library.select([k for k, var in self.custom_vars.items() if var.get()])
            self.refresh_custom_meters()
        except Exception as error:
            self.custom_vars[key].set(not self.custom_vars[key].get())
            self.custom_status.configure(text=str(error), fg="#991b1b")

    def select_custom_meters(self, include):
        try:
            self.meters_library.select(list(self.custom_vars) if include else [])
            self.refresh_custom_meters()
        except Exception as error:
            self.custom_status.configure(text=str(error), fg="#991b1b")

    def export_custom_meters(self):
        try:
            bundle = self.meters_library.selection()
            if not bundle["items"]:
                raise ValueError("Select at least one Custom page first.")
            path = filedialog.asksaveasfilename(title="Export selected custom meters", defaultextension=".json",
                                              initialfile=meters_library.SELECTION_NAME, filetypes=[("Meters selection", "*.json")])
            if path:
                meters_library.write_selection(Path(path), bundle)
                self.custom_status.configure(text=f"Exported {len(bundle['items'])} selected pages as a backup file. The car does not read it.", fg="#166534")
        except Exception as error:
            messagebox.showerror("Custom meters export", str(error))

    def copy_designer_url(self):
        self.clipboard_clear()
        self.clipboard_append(self.designer_url)

    def apply_verdict(self, verdict):
        """Badges from a check, and options the car cannot take greyed out."""
        for key in KEYS:
            comp = verdict["components"].get(key, {"state": "not checked", "detail": ""})
            state = comp["state"]
            bg, fg = BADGE[state]
            self.badges[key].configure(text=state.upper(), bg=bg, fg=fg)
            if key == "meters":
                self.options[key]["install"].configure(text="Update" if state == "installed" else "Install")
            ok = {"install", "remove"} if self.override.get() else allowed_options(state)
            for value in ("install", "remove"):
                self.options[key][value].configure(state="normal" if value in ok else "disabled",
                                                   cursor="hand2" if value in ok else "arrow")
            if self.vars[key].get() not in ("keep", *ok):
                self.vars[key].set("keep")

    def _override_changed(self):
        if self.verdict:
            self.apply_verdict(self.verdict)

    # ---------------------------------------------------------------- actions
    def refresh(self):
        drives = removable_drives()
        self.drive["values"] = drives
        # Pick the first stick only when nothing is chosen; a path typed by hand stays.
        if drives and not self.drive.get().strip():
            self.drive.current(0)

    def checking(self) -> bool:
        return self.tabs.index(self.tabs.select()) == 0

    def designing(self) -> bool:
        return self.tabs.index(self.tabs.select()) == 2

    def choices(self) -> dict:
        return {key: self.vars[key].get() for key in KEYS}

    def target(self):
        text = self.drive.get().strip()
        if not text:
            messagebox.showerror("MiatOff", "Choose the USB stick first.")
            return None
        return Path(text)

    def run(self, action: str):
        if self.designing():  # never treat the designer tab as "install"
            return
        target = self.target()
        if target is None:
            return
        try:
            builder = load_builder(DUMP_BUILDER if self.checking() else INSTALL_BUILDER)
            if action == "build":
                choices = {} if self.checking() else self.choices()
                if not self.checking() and not has_changes(choices):
                    messagebox.showerror("MiatOff", "Choose at least one part to install or remove.")
                    return
                summary = "" if self.checking() else "\n\n" + "\n".join(
                    f"{key}: {value}" for key, value in choices.items() if value != "keep")
                custom, note = self.custom_selection(choices)
                if custom:
                    summary += (f"\nCustom pages: {len(custom['items'])} (shown under Applications > Meters > CUSTOM)"
                                if choices.get("meters") == "install" else
                                f"\nCustom pages: {len(custom['items'])} included, so a Meters already on the car "
                                "is not reported as outdated")
                summary += note
                if not messagebox.askyesno("MiatOff", f"Write the stick files to {target}?{summary}"):
                    return
                builder.stickkit.require_stick_root(target)
                builder.build(target, **self.builder_args(custom))
                if not self.checking():
                    write_plan(target, make_plan(choices))
                messagebox.showinfo("MiatOff", "Stick written and verified. Eject it safely before use.")
            else:
                custom, note = self.custom_selection(self.choices())
                ok = builder.check(target, **self.builder_args(custom))
                messagebox.showinfo("MiatOff", "Stick is correct.") if ok else messagebox.showerror(
                    "MiatOff", "Stick does not match this kit." + note)
        except SystemExit as error:
            messagebox.showerror("MiatOff", str(error))
        except Exception as error:  # surfaced to the user, never silent
            messagebox.showerror("MiatOff", f"{type(error).__name__}: {error}")

    def builder_args(self, custom) -> dict:
        """Only the install builder knows about custom pages; the dump builder takes none."""
        return {} if self.checking() else {"custom": custom}

    def custom_selection(self, choices: dict):
        """(selection bundle or None, note). A library that cannot be read blocks a Meters build, but not any
        other stick: that one simply gets no custom pages."""
        if self.checking():
            return None, ""
        try:
            bundle = self.meters_library.selection()
        except Exception as error:
            if choices.get("meters") == "install":
                raise
            return None, f"\nCustom pages could not be read ({error}); this stick has none."
        return (bundle if bundle["items"] else None), ""

    def build(self):
        self.run("build")

    def verify(self):
        self.run("verify")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="MiatOff desktop builder")
    parser.add_argument("--designer", action="store_true", help="Open the Custom meters library tab")
    args = parser.parse_args()
    app = App()
    if args.designer:
        app.tabs.select(app.designer_tab)
        app.title("MiatOff · Custom pages")
    app.mainloop()

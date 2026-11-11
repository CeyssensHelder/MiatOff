#!/usr/bin/env python3
"""MiatOff: prepare a USB stick, check the car, choose tweaks.

A guided window with four steps (Prepare USB, Check your car, Choose tweaks,
Review and prepare) and two separate sections, Design your Meters and Design
your Home menu, for the local designer (tools/meters_designer.py), which opens
in the browser. The Home menu is a preview on this PC: nothing of it goes on a stick.

The check is deterministic (tools/check_dump.py). The choice is written to the
stick as miatoff-plan.txt. In the car the dialog offers the plan's steps one at
a time (each is confirmed, and each restarts the unit). The builders refuse
anything but a USB stick the car can read (FAT32, MBR, first partition, 32 GB
or less).

    python miatoff_gui.py
    python miatoff_gui.py --designer              open at the designer section
    python miatoff_gui.py --menu                  open at the Home menu section
    python miatoff_gui.py --selftest out.json     check the installation, write a report, no window

SPDX-License-Identifier: GPL-3.0-or-later
"""
import json
from pathlib import Path
import sys
import tempfile
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parent / "tools"))
import check_dump  # noqa: E402
import kits  # noqa: E402
import meters_library  # noqa: E402
import stickkit  # noqa: E402
import stickui  # noqa: E402
from stickui import BAD, BG, BODY, BOLD, CARD, FAINT, HEADING, INK, LINE, MONO, MUTED, OK, RAIL, RAISED, SMALL, SMALL_BOLD, TITLE, WARN, WARN_BG  # noqa: E402
from stickui import Collapsible, RailItem, Scrolled, Segmented, WrapLabel  # noqa: E402
import stickflow  # noqa: E402
from stickflow import COMPONENTS, KEYS, STATE_TEXT, allowed_options, has_changes, make_plan  # noqa: E402,F401
import stickwriter  # noqa: E402

VERIFY_DETAILS = 8                # problems listed when a stick does not match
JOB_POLL_MS, DRIVE_POLL_MS = 60, 2500
STEPS = (("prepare", "Prepare USB"), ("check", "Check your car"), ("choose", "Choose tweaks"), ("review", "Review and prepare"))
SECTIONS = ("designer", "menu")  # pages beside the steps; Back returns to the last step


def removable_drives() -> list:
    """The USB drives plugged in now (stickkit.DriveInfo), also ones the car cannot read."""
    try:
        return stickkit.list_drives()
    except Exception:  # never block the window on drive detection
        return []


def drive_line(info) -> str:
    """One line for the drive picker."""
    return info.title() + ("" if not info.problems() else "  (not usable)")


def drive_status(info) -> str:
    """Why a stick can or cannot be used, in plain English."""
    problems = info.problems()
    return "Ready for the car: FAT32, MBR, 32 GB or less." if not problems else "Not usable: " + "; ".join(problems) + "."


def drive_facts(info) -> list:
    """(label, value) pairs that describe a stick."""
    partition = {"mbr": f"MBR, partition {info.partition_number}", "gpt": "GPT", "none": "None"}.get(info.partition_style, "Unknown")
    return [("Name", info.label or "No name"), ("Size", f"{info.total / 1000 ** 3:.1f} GB" if info.total else "Unknown"),
            ("Free space", f"{info.free / 1000 ** 3:.1f} GB" if info.total else "Unknown"),
            ("Format", info.filesystem or "Unknown"), ("Partition table", partition),
            ("Connection", "USB" if info.usb else "Not USB")]


def app_version() -> str:
    """The release this package was built from; "source" when run from the repository."""
    try:
        return (stickkit.ROOT / "VERSION").read_text(encoding="utf-8").strip() or "source"
    except OSError:
        return "source"


def designer_selftest() -> dict:
    """Start the Meters Designer on a free port, with a throwaway library, and ask it for its page and a module."""
    import meters_designer

    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
        server = meters_designer.launch(port=0, open_browser=False, library_path=Path(folder) / "selftest.sqlite3")
        try:
            base = f"http://127.0.0.1:{server.server_port}/designer/"
            with opener.open(base + "index.html", timeout=10) as page, opener.open(base + "v3/app.mjs", timeout=10) as module:
                return {"page": page.status, "module_type": module.headers.get_content_type()}
        finally:
            server.shutdown()
            server.server_close()


def selftest(out: Path) -> int:
    """Check that everything the app needs is present, and write the result: used to test a packaged build."""
    try:
        report = {"digests": kits.payload_digests(), "pins": sorted(check_dump.pinned_constants()),
                  "designer": designer_selftest(), "tcl": tk.Tcl().eval("info patchlevel"), "version": app_version()}
        status = 0
    except Exception as error:  # the packaged app has no console: the report is the only output
        report, status = {"error": f"{type(error).__name__}: {error}"}, 1
    Path(out).write_text(json.dumps(report, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    return status


class App(tk.Tk):
    def __init__(self):
        stickui.enable_dpi_awareness()
        super().__init__()
        version = app_version()
        self.title("MiatOff" if version == "source" else f"MiatOff {version} (preview)")
        stickui.apply_theme(self)
        self.geometry("1080x800")
        self.minsize(880, 560)
        self._set_window_icon()
        self.vars, self.options, self.badges, self.reasons, self.segments = {}, {}, {}, {}, {}
        self.states = {}
        self.verdict = None
        self.report_text = ""
        self.dump_path = None
        self.stick_ready = False
        self.active_root = None
        self.notice = None
        self.job_label = ""
        self.last_step = "prepare"
        self.jobs, self.watcher = stickflow.JobRunner(), stickflow.JobRunner()
        self.scrollers, self.job_buttons, self.rail_items = {}, [], {}
        self.drive_infos = []

        self._rail()
        main = tk.Frame(self, bg=BG)
        main.pack(side="left", fill="both", expand=True)
        self._footer(main)
        self.tabs = ttk.Notebook(main, style="Pages.TNotebook", takefocus=False)
        self.tabs.pack(fill="both", expand=True)
        self.prepare_tab, self.check_tab, self.choose_tab, self.review_tab, self.designer_tab, self.menu_tab = (
            tk.Frame(self.tabs, bg=BG) for _ in range(6))
        for tab in (self.prepare_tab, self.check_tab, self.choose_tab, self.review_tab, self.designer_tab, self.menu_tab):
            self.tabs.add(tab)
        self.pages = {"prepare": self.prepare_tab, "check": self.check_tab, "choose": self.choose_tab,
                      "review": self.review_tab, "designer": self.designer_tab, "menu": self.menu_tab}
        self._build_prepare_tab()
        self._build_check_tab()
        self._build_choose_tab()
        self._build_review_tab()
        self._build_designer_tab()
        self._build_menu_tab()
        self.tabs.bind("<<NotebookTabChanged>>", lambda _e: self._page_changed())
        for var in self.vars.values():
            var.trace_add("write", lambda *_a: self._choices_changed())
        self.override.trace_add("write", lambda *_a: self._update_chrome())
        self._apply_states({}, False)
        self.refresh()
        self._update_chrome()
        stickui.dark_title_bar(self)
        self.protocol("WM_DELETE_WINDOW", self._close)
        self.bind_all("<MouseWheel>", self._wheel)
        self.bind_all("<Button-4>", lambda e: self._scroll_page(e, -1))
        self.bind_all("<Button-5>", lambda e: self._scroll_page(e, 1))
        self.after(JOB_POLL_MS, self._pump)
        self.after(DRIVE_POLL_MS, self._watch_drives)

    def _set_window_icon(self):
        self.icons = {}
        try:
            self.icons["large"] = tk.PhotoImage(master=self, file=str(stickkit.ROOT / "packaging" / "miatoff.png"))
            self.icons["small"] = tk.PhotoImage(master=self, file=str(stickkit.ROOT / "packaging" / "miatoff-small.png"))
            self.iconphoto(True, self.icons["large"])
        except tk.TclError:
            self.icons = {}

    # ---------------------------------------------------------------- frame
    def _rail(self):
        rail = tk.Frame(self, bg=RAIL, width=236)
        rail.pack(side="left", fill="y")
        rail.pack_propagate(False)
        brand = tk.Frame(rail, bg=RAIL)
        brand.pack(fill="x", padx=16, pady=(20, 22))
        if "small" in self.icons:
            tk.Label(brand, image=self.icons["small"], bg=RAIL).pack(side="left", padx=(0, 10))
        names = tk.Frame(brand, bg=RAIL)
        names.pack(side="left")
        tk.Label(names, text="MiatOff", bg=RAIL, fg=INK, font=HEADING).pack(anchor="w")
        tk.Label(names, text="Mazda Connect tweaks", bg=RAIL, fg=FAINT, font=SMALL).pack(anchor="w")
        for number, (page, title) in enumerate(STEPS, start=1):
            item = RailItem(rail, str(number), title, lambda p=page: self.go(p))
            item.pack(fill="x", padx=10, pady=1)
            self.rail_items[page] = (item, str(number))
        tk.Frame(rail, bg=LINE, height=1).pack(fill="x", padx=18, pady=14)
        item = RailItem(rail, "✎", "Design your Meters", lambda: self.go("designer"))
        item.pack(fill="x", padx=10, pady=1)
        self.rail_items["designer"] = (item, "✎")
        item = RailItem(rail, "⌂", "Design your menu", lambda: self.go("menu"))
        item.pack(fill="x", padx=10, pady=1)
        self.rail_items["menu"] = (item, "⌂")
        foot = tk.Frame(rail, bg=RAIL)
        foot.pack(side="bottom", fill="x", padx=18, pady=16)
        self.rail_drive = WrapLabel(foot, bg=RAIL, fg=MUTED, font=SMALL, wraplength=200)
        self.rail_drive.pack(fill="x", pady=(0, 8))
        WrapLabel(foot, bg=RAIL, fg=FAINT, font=SMALL, wraplength=200,
                  text="Experimental. Nothing here is guaranteed to work on your car.").pack(fill="x")

    def _footer(self, parent):
        bar = tk.Frame(parent, bg=CARD, padx=20, pady=12)
        bar.pack(side="bottom", fill="x")
        tk.Frame(parent, bg=LINE, height=1).pack(side="bottom", fill="x")
        bar.columnconfigure(1, weight=1)
        self.back_button = ttk.Button(bar, text="Back", style="Plain.TButton", command=self.go_back)
        self.back_button.grid(row=0, column=0, sticky="w")
        middle = tk.Frame(bar, bg=CARD)
        middle.grid(row=0, column=1, sticky="ew", padx=16)
        self.footer_note = WrapLabel(middle, bg=CARD, fg=MUTED, font=SMALL, wraplength=380)
        self.footer_note.pack(fill="x")
        self.progress = ttk.Progressbar(middle, mode="indeterminate")
        self.primary_button = ttk.Button(bar, text="Continue", style="Accent.TButton", command=self.primary)
        self.primary_button.grid(row=0, column=2, sticky="e")

    def page(self, tab, key, title, subtitle):
        """A scrolling page with its heading; returns the frame to put cards in."""
        scroller = Scrolled(tab)
        scroller.pack(fill="both", expand=True)
        self.scrollers[key] = scroller
        body = tk.Frame(scroller.inner, bg=BG, padx=30, pady=26)
        body.pack(fill="both", expand=True)
        tk.Label(body, text=title, bg=BG, fg=INK, font=TITLE, anchor="w").pack(fill="x")
        WrapLabel(body, text=subtitle, bg=BG, fg=MUTED, font=BODY).pack(fill="x", pady=(2, 16))
        return body

    def card(self, parent, title=None):
        frame = tk.Frame(parent, bg=CARD, highlightbackground=LINE, highlightthickness=1)
        frame.pack(fill="x", pady=7)
        tk.Frame(frame, bg=CARD, height=14).pack(fill="x")
        if title:
            tk.Label(frame, text=title, bg=CARD, fg=INK, font=HEADING, anchor="w").pack(fill="x", padx=20, pady=(0, 6))
        return frame

    def paragraph(self, parent, text, **options):
        spacing = options.pop("pady", (0, 14))
        options.setdefault("fg", MUTED)
        options.setdefault("font", BODY)
        label = WrapLabel(parent, text=text, bg=parent.cget("bg"), **options)
        label.pack(fill="x", padx=20, pady=spacing)
        return label

    def job_button(self, parent, text, style, command):
        """A button that is unavailable while a job runs."""
        button = ttk.Button(parent, text=text, style=style, command=command)
        self.job_buttons.append(button)
        return button

    def current(self) -> str:
        selected = self.tabs.select()
        return next(key for key, tab in self.pages.items() if str(tab) == selected)

    def go(self, page: str) -> None:
        self.tabs.select(self.pages[page])

    def go_back(self):
        page = self.current()
        if page in SECTIONS:
            self.go(self.last_step)
        else:
            self.go(stickflow.PAGES[max(stickflow.PAGES.index(page) - 1, 0)])

    def primary(self):
        page = self.current()
        if page == "review":
            self.build()
        elif page in stickflow.PAGES:
            self.go(stickflow.PAGES[stickflow.PAGES.index(page) + 1])

    def _page_changed(self):
        page = self.current()
        if page in stickflow.PAGES:
            self.last_step = page
        self.notice = None
        self.scrollers[page].to_top()
        if page == "review":
            self._refresh_review()
        if page == "check":
            self._look_for_results()
        if page == "menu":
            self.refresh_home_menus()
        self._update_chrome()

    def _choices_changed(self):
        self.stick_ready = False
        if hasattr(self, "review_result"):
            self.review_result.pack_forget()
        if self.current() == "review":
            self._refresh_review()
        self._update_chrome()

    def _update_chrome(self):
        """Everything around the page: navigator, footer, and which buttons work."""
        page = self.current()
        busy = self.jobs.busy
        drive = self.chosen_drive()
        have_check = self.verdict is not None
        changed = has_changes(self.choices())
        done = stickflow.done_steps(drive, have_check, changed, self.stick_ready)
        for key, (item, number) in self.rail_items.items():
            item.paint(key == page, key in done, number)
        if drive is None:
            self.rail_drive.configure(text="No USB stick found")
        else:
            self.rail_drive.configure(text=("✓ " if not drive.problems() else "✕ ") + drive.title())
        wizard = page in stickflow.PAGES
        self.back_button.configure(text="Back", state="disabled" if busy or page == "prepare" else "normal")
        if wizard:
            self.primary_button.grid()
            self.primary_button.configure(text=("Prepare again" if self.stick_ready else "Prepare USB") if page == "review" else "Continue")
        else:
            self.primary_button.grid_remove()
        reason = stickflow.blocker(page, drive, have_check, self.override.get(), changed,
                                   home=self._home_reason()) if wizard else None
        self.primary_button.configure(state="disabled" if busy or reason else "normal")
        for button in self.job_buttons:
            button.configure(state="disabled" if busy else "normal")
        self.drive.configure(state="disabled" if busy else "readonly")
        if busy:
            self.footer_note.configure(text=self.job_label, fg=INK)
            if not self.progress.winfo_manager():
                self.progress.pack(fill="x", pady=(6, 0))
                self.progress.start(14)
        else:
            if self.progress.winfo_manager():
                self.progress.stop()
                self.progress.pack_forget()
            if self.notice:
                self.footer_note.configure(text=self.notice[0], fg=self.notice[1])
            else:
                self.footer_note.configure(text=reason or "", fg=MUTED)

    def _wheel(self, event):
        # Windows reports 120 per notch; macOS reports small steps (1, 2, ...).
        self._scroll_page(event, -event.delta if sys.platform == "darwin" else int(-event.delta / 120))

    def _scroll_page(self, event, units):
        # The drop-down of the drive list is not a widget Tkinter knows: event.widget is then a plain string.
        if units and isinstance(event.widget, tk.Misc) and not isinstance(event.widget, tk.Text):
            self.scrollers[self.current()].scroll(units)

    def _close(self):
        if self.jobs.busy:
            messagebox.showwarning("MiatOff", "MiatOff is still working with the USB stick. Wait until it has finished, "
                                              "then close the window.")
            return
        self.destroy()

    # ---------------------------------------------------------------- background work
    def start_job(self, label, work, done):
        """Run work() on a worker thread; done(result, error) runs on the window's thread."""
        self.job_label, self.notice = label, None
        self.jobs.start(work, lambda result, error: (self._update_chrome(), done(result, error), self._update_chrome()))
        self._update_chrome()

    def _pump(self):
        if self.jobs.busy and self.footer_note.cget("text") != self.job_label:  # the worker reports its stage here
            self.footer_note.configure(text=self.job_label)
        self.jobs.poll()
        self.watcher.poll()
        self.after(JOB_POLL_MS, self._pump)

    def _watch_drives(self):
        """Notice a stick being plugged in or pulled out without the user asking."""
        if not self.jobs.busy and not self.watcher.busy:
            self.watcher.start(removable_drives, self._drives_seen)
        self.after(DRIVE_POLL_MS, self._watch_drives)

    def _drives_seen(self, drives, error):
        seen = [(d.root, d.title(), d.problems()) for d in (drives or [])]
        if not error and not self.jobs.busy and seen != [(d.root, d.title(), d.problems()) for d in self.drive_infos]:
            self.refresh(drives)

    def show_failure(self, error):
        if isinstance(error, (stickkit.StickError, SystemExit)):
            messagebox.showerror("MiatOff", str(error).removeprefix("ERROR: "))
        else:
            messagebox.showerror("MiatOff", f"That did not work: {error}", detail=type(error).__name__)

    # ---------------------------------------------------------------- step 1: prepare
    def _build_prepare_tab(self):
        body = self.page(self.prepare_tab, "prepare", "Prepare your USB stick",
                         "MiatOff puts everything on one USB stick that you carry to the car. Nothing is installed on this computer.")
        car = self.card(body, "Will this work on my car?")
        self.paragraph(car, "MiatOff is for the Mazda MX-5 ND (ND1 and ND2) with Mazda Connect on firmware 74.00.324A. It is "
                            "not for the ND3 or other firmware. You do not need to know your firmware version: the next step "
                            "checks your car and changes nothing.")
        drive = self.card(body, "Your USB stick")
        row = tk.Frame(drive, bg=CARD)
        row.pack(fill="x", padx=20, pady=(2, 10))
        self.drive = ttk.Combobox(row, state="readonly", font=BODY)
        self.drive.pack(side="left", fill="x", expand=True)
        self.drive.bind("<<ComboboxSelected>>", lambda _e: self._drive_chosen())
        ttk.Button(row, text="Refresh", style="Plain.TButton", command=self.refresh).pack(side="left", padx=(10, 0))
        self.drive_status = self.paragraph(drive, "", font=BOLD, pady=(0, 10))
        self.facts = tk.Frame(drive, bg=CARD)
        self.facts.pack(fill="x", padx=20, pady=(0, 14))
        for column in (1, 3, 5):
            self.facts.columnconfigure(column, weight=1, uniform="facts")
        self.fact_values = {}
        for index, name in enumerate(("Name", "Size", "Free space", "Format", "Partition table", "Connection")):
            cell = tk.Frame(self.facts, bg=CARD)
            cell.grid(row=index // 3, column=index % 3 * 2 + 1, sticky="w", pady=4)
            tk.Label(cell, text=name, bg=CARD, fg=FAINT, font=SMALL, anchor="w").pack(anchor="w")
            value = tk.Label(cell, text="-", bg=CARD, fg=INK, font=BODY, anchor="w")
            value.pack(anchor="w")
            self.fact_values[name] = value
        details = Collapsible(drive, "How to make a stick suitable")
        details.pack(fill="x", padx=20, pady=(0, 12))
        WrapLabel(details.body, text="The car reads one FAT32 partition on an MBR stick of 32 GB or less. MiatOff never formats "
                                     "a drive; use the tools of your computer.\n\n" + stickflow.format_help(),
                  bg=CARD, fg=MUTED, font=BODY).pack(fill="x", pady=(0, 6))
        risk = tk.Frame(body, bg=WARN_BG, highlightbackground=stickui.WARN_LINE, highlightthickness=1)
        risk.pack(fill="x", pady=7)
        WrapLabel(risk, bg=WARN_BG, fg=WARN, font=SMALL,
                  text="!  Use at your own risk. Changing the head unit can leave it unusable. MiatOff refuses files it does "
                       "not recognise and can restore every change, but it is experimental software."
                  ).pack(fill="x", padx=16, pady=10)

    def refresh(self, drives=None):
        chosen = self.chosen_drive()
        self.drive_infos = removable_drives() if drives is None else drives
        self.drive["values"] = [drive_line(info) for info in self.drive_infos]
        # Keep the stick that was chosen if it is still there; otherwise prefer one the car can read.
        roots = [info.root for info in self.drive_infos]
        usable = [index for index, info in enumerate(self.drive_infos) if not info.problems()]
        if chosen is not None and chosen.root in roots:
            self.drive.current(roots.index(chosen.root))
        elif self.drive_infos:
            self.drive.current(usable[0] if usable else 0)
        else:
            self.drive.set("")
        self._drive_chosen()

    def chosen_drive(self):
        """The stickkit.DriveInfo picked in the list, or None."""
        index = self.drive.current()
        return self.drive_infos[index] if 0 <= index < len(self.drive_infos) else None

    def _drive_chosen(self):
        info = self.chosen_drive()
        root = info.root if info else None
        if root != self.active_root:
            self.active_root = root
            self._forget_check(keep_ready=root is None)  # pulling the stick out is what we told the user to do
        self._show_drive_status()
        self._look_for_results()
        self._update_chrome()

    def _show_drive_status(self):
        info = self.chosen_drive()
        if info is None:
            self.drive_status.configure(text="No USB stick found. Plug one in and it appears here.", fg=WARN)
        elif info.problems():
            self.drive_status.configure(text="✕  " + drive_status(info), fg=BAD)
        elif stickwriter.stick_issue(info.root):
            self.drive_status.configure(text="!  " + stickwriter.stick_issue(info.root), fg=WARN)
        else:
            self.drive_status.configure(text="✓  " + drive_status(info), fg=OK)
        facts = dict(drive_facts(info)) if info else {}
        for name, label in self.fact_values.items():
            label.configure(text=facts.get(name, "-"))

    # ---------------------------------------------------------------- step 2: check
    def _build_check_tab(self):
        body = self.page(self.check_tab, "check", "Check your car",
                         "A read-only check that compares your car with the versions MiatOff knows. It changes nothing on the car.")
        make = self.card(body, "1.  Make the check stick")
        self.paragraph(make, "Writes the small read-only check to the USB stick.", pady=(0, 10))
        row = tk.Frame(make, bg=CARD)
        row.pack(anchor="w", padx=20, pady=(0, 10))
        self.job_button(row, "Make check stick", "Accent.TButton", self.build).pack(side="left")
        self.job_button(row, "Verify stick", "Plain.TButton", self.verify).pack(side="left", padx=8)
        self.check_made = self.paragraph(make, "", font=BOLD, fg=OK, pady=(0, 6))
        car = self.card(body, "2.  Run it in the car")
        for line in ("Start the engine and wait for the home screen.",
                     "Plug the stick into the car's USB hub.",
                     "When the dialog appears, choose FULL. It takes a few minutes.",
                     "When it says it has finished, unplug the stick and bring it back here."):
            self.paragraph(car, "•  " + line, fg=INK, pady=(0, 5))
        self.paragraph(car, "Never confirm a Mazda software update screen. If one appears, cancel and remove the stick.",
                       fg=WARN, font=SMALL, pady=(6, 12))
        read = self.card(body, "3.  Read the results")
        self.found_hint = self.paragraph(read, "Plug the stick back in, then read the results. You can also do this after restarting MiatOff.", pady=(0, 10))
        row = tk.Frame(read, bg=CARD)
        row.pack(anchor="w", padx=20, pady=(0, 14))
        self.job_button(row, "Read check results", "Accent.TButton", self.read_dump).pack(side="left")
        self.result_box = tk.Frame(read, bg=CARD)
        self.result_box.pack(fill="x", padx=20)
        self.technical = Collapsible(read, "Technical details")
        self.technical.pack(fill="x", padx=20, pady=(0, 12))
        buttons = tk.Frame(self.technical.body, bg=CARD)
        buttons.pack(anchor="w", pady=(0, 6))
        ttk.Button(buttons, text="Copy report", style="Small.TButton", command=self.copy_report).pack(side="left")
        ttk.Button(buttons, text="Save to stick", style="Small.TButton", command=self.save_report).pack(side="left", padx=6)
        self.report = tk.Text(self.technical.body, height=18, bg=RAIL, fg=MUTED, relief="flat", font=MONO, wrap="none",
                              highlightbackground=LINE, highlightthickness=1, insertbackground=INK)
        self.report.pack(fill="x", pady=(0, 6))
        self._set_report("No results read yet.")

    def _set_report(self, text):
        self.report.configure(state="normal")
        self.report.delete("1.0", "end")
        self.report.insert("1.0", text)
        self.report.configure(state="disabled")

    def _look_for_results(self):
        """Say so when the chosen stick already holds a finished check; the result may be from before a restart."""
        if not hasattr(self, "found_hint") or self.verdict is not None:
            return
        info = self.chosen_drive()
        try:
            found = info is not None and check_dump.latest_dump(Path(info.root)) is not None
        except OSError:
            found = False
        self.found_hint.configure(
            text="✓  This stick holds a finished check. Read the results below." if found else
                 "Plug the stick back in, then read the results. You can also do this after restarting MiatOff.",
            fg=OK if found else MUTED)

    def read_dump(self):
        target = self.target()
        if target is None:
            return

        def work():
            dump = check_dump.latest_dump(target)
            if dump is None:
                return None
            verdict = check_dump.check(dump)
            return dump, verdict, check_dump.format_report(verdict)
        self.start_job("Reading the check results…", work, lambda result, error: self._dump_read(target, result, error))

    def _dump_read(self, target, result, error):
        if error:
            self.show_failure(error)
        elif result is None:
            messagebox.showerror("MiatOff", f"No check results found on {target}.\nMake the check stick, run it in the car, "
                                            "then read the results again.")
        else:
            self.dump_path, self.verdict, self.report_text = result
            self._set_report(self.report_text)
            self._show_check_result(self.verdict)
            self.apply_verdict(self.verdict)
            self._update_chrome()

    def _show_check_result(self, verdict):
        for child in self.result_box.winfo_children():
            child.destroy()
        summary = stickflow.check_summary(verdict)
        colour, icon = stickui.KIND_COLOUR[summary["kind"]], stickui.KIND_ICON[summary["kind"]]
        tk.Label(self.result_box, text=f"{icon}  {summary['title']}", bg=CARD, fg=colour, font=HEADING, anchor="w").pack(fill="x")
        WrapLabel(self.result_box, text=summary["body"], bg=CARD, fg=INK, font=BODY).pack(fill="x", pady=(2, 8))
        for reason in summary["reasons"]:
            WrapLabel(self.result_box, text="✕  " + reason, bg=CARD, fg=BAD, font=BODY).pack(fill="x", pady=1)
        rows = tk.Frame(self.result_box, bg=CARD)
        rows.pack(fill="x", pady=(6, 12))
        rows.columnconfigure(1, weight=1)
        for index, (_key, title, state, _detail) in enumerate(stickflow.component_lines(verdict)):
            icon, word = STATE_TEXT[state]
            tk.Label(rows, text=f"{icon}  {word}", bg=CARD, fg=stickui.STATE_COLOUR[state], font=SMALL_BOLD, anchor="w").grid(
                row=index, column=0, sticky="w", padx=(0, 18), pady=2)
            tk.Label(rows, text=title, bg=CARD, fg=INK, font=BODY, anchor="w").grid(row=index, column=1, sticky="w", pady=2)

    def _forget_check(self, keep_ready=False):
        """A check belongs to one stick: choosing another clears it, and the permission to go without one."""
        self.verdict, self.dump_path, self.report_text = None, None, ""
        if not keep_ready:
            self.stick_ready = False
        if hasattr(self, "override"):
            self.override.set(False)
            for child in self.result_box.winfo_children():
                child.destroy()
            self._set_report("No results read yet.")
            if not keep_ready:
                self.check_made.configure(text="")
                self.review_result.pack_forget()
            self._apply_states({}, False)

    def copy_report(self):
        if self.report_text:
            self.clipboard_clear()
            self.clipboard_append(self.report_text)
            messagebox.showinfo("MiatOff", "Report copied. Paste it in a GitHub issue if you want support for a new firmware.")

    def save_report(self):
        if not self.verdict:
            return
        (self.dump_path / check_dump.REPORT_NAME).write_text(self.report_text, encoding="utf-8", newline="\n")
        messagebox.showinfo("MiatOff", f"Saved {check_dump.REPORT_NAME} next to the check results on the stick.")

    # ---------------------------------------------------------------- step 3: choose
    def _build_choose_tab(self):
        body = self.page(self.choose_tab, "choose", "Choose your tweaks",
                         "Everything starts as Leave as-is. Choose only what you want to change.")
        self.no_check_banner = tk.Frame(body, bg=WARN_BG, highlightbackground=stickui.WARN_LINE, highlightthickness=1)
        WrapLabel(self.no_check_banner, bg=WARN_BG, fg=WARN, font=SMALL,
                  text="!  Tweaks unlock after you read the check results under Check your car.").pack(fill="x", padx=16, pady=10)
        self.no_check_banner.pack(fill="x", pady=(0, 7))
        self.first_choose_card = None
        for category, items in COMPONENTS:
            frame = self.card(body, category)
            self.first_choose_card = self.first_choose_card or frame
            for index, (key, title, description, install_label, remove_label) in enumerate(items):
                self._row(frame, key, title, description, install_label, remove_label, first=index == 0)
            if category == "Interface":
                self._home_row(frame)
            tk.Frame(frame, bg=CARD, height=10).pack(fill="x")
        self.override = tk.BooleanVar(self, value=False)
        advanced = self.card(body, "Advanced")
        ttk.Checkbutton(advanced, text="Build without a valid check", style="Card.TCheckbutton", variable=self.override,
                        command=self._override_changed).pack(anchor="w", padx=20, pady=(0, 6))
        self.paragraph(advanced, "Allows Install and Remove for every tweak, for when the car has changed since the check. This "
                                 "only skips the guidance on this computer: the installer on the car still checks the real "
                                 "files and changes nothing it does not recognise.", font=SMALL)

    def _row(self, parent, key, title, description, install_label, remove_label, first=False):
        if not first:
            tk.Frame(parent, bg=LINE, height=1).pack(fill="x", padx=20, pady=2)
        row = tk.Frame(parent, bg=CARD)
        row.pack(fill="x", padx=20, pady=8)
        row.columnconfigure(0, weight=1)
        text = tk.Frame(row, bg=CARD)
        text.grid(row=0, column=0, sticky="nsew", padx=(0, 18))
        head = tk.Frame(text, bg=CARD)
        head.pack(fill="x")
        tk.Label(head, text=title, bg=CARD, fg=INK, font=BOLD).pack(side="left")
        badge = tk.Label(head, text="", bg=CARD, font=SMALL_BOLD)
        badge.pack(side="left", padx=10)
        self.badges[key] = badge
        WrapLabel(text, text=description, bg=CARD, fg=MUTED, font=SMALL, wraplength=300).pack(fill="x")
        reason = WrapLabel(text, text="", bg=CARD, fg=WARN, font=SMALL, wraplength=300)
        self.reasons[key] = reason
        var = tk.StringVar(self, value="keep")
        self.vars[key] = var
        segment = Segmented(row, var, [("keep", "Leave as-is"), ("install", install_label), ("remove", remove_label)])
        segment.grid(row=0, column=1, sticky="e")
        self.segments[key] = segment
        self.options[key] = segment.labels

    def _home_row(self, parent):
        """Custom menu: a choice of this builder only (the plan has no key for it). The menu travels in the Meters
        payload, so Install and Remove need Meters set to Install."""
        self._row(parent, stickflow.HOME_KEY, stickflow.HOME_TITLE,
                  "Your own Home screen instead of Mazda's: one of your menus or a built-in one. It goes on the car "
                  "with Meters, so set Meters to Install as well.", "Install", "Mazda's Home")
        row = tk.Frame(parent, bg=CARD)
        row.pack(fill="x", padx=20, pady=(0, 8))
        tk.Label(row, text="Menu", bg=CARD, fg=MUTED, font=SMALL).pack(side="left")
        self.home_pick = ttk.Combobox(row, state="readonly", width=30)
        self.home_pick.pack(side="left", padx=8)
        self.home_pick.bind("<<ComboboxSelected>>", lambda _e: self._home_picked())
        self._home_ids = []
        ttk.Button(row, text="Design your menu", style="Small.TButton", command=lambda: self.go("menu")).pack(side="left")

    def apply_verdict(self, verdict):
        """Badges from a check, and options the car cannot take greyed out."""
        self._apply_states(verdict["components"], True)

    def _apply_states(self, components, have_check):
        self.have_states = have_check
        self.states = {key: components.get(key, {"state": "not checked"})["state"] for key in KEYS}
        for key in KEYS:
            component = components.get(key, {"state": "not checked", "detail": ""})
            state = component["state"]
            icon, word = STATE_TEXT[state]
            self.badges[key].configure(text=f"{icon} {word}" if have_check else "", fg=stickui.STATE_COLOUR[state])
            if key == "meters":
                self.options[key]["install"].configure(text="Update" if state == "installed" else "Install")
            allowed = stickflow.enabled_options(state, have_check, self.override.get())
            for value in ("install", "remove"):
                self.segments[key].set_enabled(value, value in allowed)
            if self.vars[key].get() not in ("keep", *allowed) and (have_check or allowed != set()):
                self.vars[key].set("keep")
            detail = component.get("detail", "") if have_check and state in ("blocked", "partial", "not checked") else ""
            self.reasons[key].configure(text=detail)
            if detail:
                self.reasons[key].pack(fill="x")
            else:
                self.reasons[key].pack_forget()
        # Custom menu can do what Meters can (it goes on the car with it).
        home = stickflow.HOME_KEY
        allowed = stickflow.enabled_options(self.states.get("meters", "not checked"), have_check, self.override.get())
        for value in ("install", "remove"):
            self.segments[home].set_enabled(value, value in allowed)
        if self.vars[home].get() not in ("keep", *allowed) and (have_check or allowed != set()):
            self.vars[home].set("keep")
        if have_check or self.override.get():
            self.no_check_banner.pack_forget()
        elif not self.no_check_banner.winfo_manager():
            self.no_check_banner.pack(fill="x", pady=(0, 7), before=self.first_choose_card)

    def _override_changed(self):
        if self.verdict:
            self.apply_verdict(self.verdict)
        else:
            self._apply_states({}, False)
        self._update_chrome()

    # ---------------------------------------------------------------- step 4: review
    def _build_review_tab(self):
        body = self.page(self.review_tab, "review", "Review and prepare",
                         "This writes the files and your choices to the USB stick. The car itself is not changed yet.")
        self.review_changes = self.card(body, "What you asked for")
        self.review_lines = tk.Frame(self.review_changes, bg=CARD)
        self.review_lines.pack(fill="x", padx=20, pady=(0, 14))
        stick = self.card(body, "USB stick")
        self.review_stick = self.paragraph(stick, "", fg=INK)
        car = self.card(body, "What happens in the car")
        for line in ("The car asks you to confirm each change, one at a time.",
                     "It restarts after every change. Leave the stick in: the next one appears when the screen is back.",
                     "When everything is done it shows that your plan is complete."):
            self.paragraph(car, "•  " + line, fg=INK, pady=(0, 5))
        tk.Frame(car, bg=CARD, height=8).pack(fill="x")
        self.review_result = tk.Frame(body, bg=CARD, highlightbackground=OK, highlightthickness=1)
        tk.Label(self.review_result, text="✓  USB ready", bg=CARD, fg=OK, font=HEADING, anchor="w").pack(fill="x", padx=20, pady=(14, 4))
        for line in ("Eject the stick safely in your computer before you unplug it.",
                     "In the car: engine on, wait for the home screen, plug the stick into the USB hub.",
                     "Confirm each step on the screen. Nothing has changed on the car until you do.",
                     "Never confirm a Mazda software update screen."):
            self.paragraph(self.review_result, "•  " + line, fg=INK, pady=(0, 5))
        row = tk.Frame(self.review_result, bg=CARD)
        row.pack(anchor="w", padx=20, pady=(6, 14))
        self.job_button(row, "Verify stick again", "Small.TButton", self.verify).pack(side="left")

    def _refresh_review(self):
        for child in self.review_lines.winfo_children():
            child.destroy()
        choices = self.choices()
        lines = stickflow.change_lines(choices, self.states)
        self.review_lines.columnconfigure(1, weight=1)
        for index, (action, title) in enumerate(lines):
            tk.Label(self.review_lines, text=action, bg=CARD, fg=MUTED, font=SMALL_BOLD, anchor="w").grid(
                row=index, column=0, sticky="w", padx=(0, 18), pady=3)
            tk.Label(self.review_lines, text=title, bg=CARD, fg=INK, font=BODY, anchor="w").grid(row=index, column=1, sticky="w", pady=3)
        at = len(lines)
        if not lines:
            tk.Label(self.review_lines, text="Nothing chosen yet.", bg=CARD, fg=MUTED, font=BODY, anchor="w").grid(row=0, column=0, sticky="w")
            at = 1
        try:
            selected = len(self.meters_library.selection()["items"])
        except Exception:  # the build itself reports this properly
            selected = 0
        if selected:
            tk.Label(self.review_lines, text="Custom", bg=CARD, fg=MUTED, font=SMALL_BOLD, anchor="w").grid(
                row=at, column=0, sticky="w", padx=(0, 18), pady=3)
            tk.Label(self.review_lines, text=f"{selected} Meters page(s) you designed", bg=CARD, fg=INK, font=BODY, anchor="w").grid(
                row=at, column=1, sticky="w", pady=3)
            at += 1
        line = self._home_line()
        if line:
            tk.Label(self.review_lines, text=line[0], bg=CARD, fg=MUTED, font=SMALL_BOLD, anchor="w").grid(
                row=at, column=0, sticky="w", padx=(0, 18), pady=3)
            tk.Label(self.review_lines, text=line[1], bg=CARD, fg=INK, font=BODY, anchor="w").grid(
                row=at, column=1, sticky="w", pady=3)
            at += 1
        for note in stickflow.dependency_notes(choices, self.states):
            WrapLabel(self.review_lines, text="!  " + note, bg=CARD, fg=WARN, font=SMALL).grid(
                row=at, column=0, columnspan=2, sticky="ew", pady=(8, 0))
            at += 1
        drive = self.chosen_drive()
        text = drive.title() if drive else "No USB stick found."
        previous = stickwriter.replaces(Path(drive.root), kits.install_kit().id_name) if drive else None
        if previous:
            text += f"\nThe MiatOff {previous} files on it will be replaced. Check results and logs stay."
        self.review_stick.configure(text=text)

    # ---------------------------------------------------------------- designer
    def _build_designer_tab(self):
        import meters_designer
        self.meters_library = meters_library.PageLibrary()
        self.custom_vars, self.custom_rows = {}, {}
        self._library_signature = None
        self._removed_signature = None
        self.removed_rows = []
        self.designer_url = f"http://127.0.0.1:{meters_designer.DEFAULT_PORT}/designer/index.html"
        page = self.page(self.designer_tab, "designer", "Design your Meters",
                         "Make your own gauge pages in your web browser, then choose which ones go on the stick.")
        one = self.card(page, "Open the designer")
        self.paragraph(one, "The designer opens in your web browser on this computer and saves your work in that browser, so always open it from here. Keep this window open while you design: closing MiatOff stops the designer. In the designer, Send to MiatOff adds your pages below.", pady=(0, 10))
        row = tk.Frame(one, bg=CARD)
        row.pack(anchor="w", padx=20, pady=(0, 8))
        ttk.Button(row, text="Open designer", style="Accent.TButton", command=self.open_designer).pack(side="left")
        ttk.Button(row, text="Copy address", style="Plain.TButton", command=self.copy_designer_url).pack(side="left", padx=8)
        self.designer_status = self.paragraph(one, "Not started.", font=SMALL)
        custom = self.card(page, "Your pages")
        self.paragraph(custom, "Choose the pages that go on the stick, up to eight. Send to MiatOff in the designer brings every "
                               "Custom page here; sending again updates them and keeps your choices.", pady=(0, 10))
        self.custom_list = tk.Frame(custom, bg=CARD)
        self.custom_list.pack(fill="x", padx=20)
        self.custom_empty = WrapLabel(self.custom_list, text="No pages sent yet. Open the designer to get started.", bg=CARD, fg=MUTED, font=BODY)
        self.custom_empty.pack(fill="x", pady=10)
        actions = tk.Frame(custom, bg=CARD)
        actions.pack(fill="x", padx=20, pady=10)
        ttk.Button(actions, text="Select all", style="Small.TButton", command=lambda: self.select_custom_meters(True)).pack(side="left")
        ttk.Button(actions, text="Select none", style="Small.TButton", command=lambda: self.select_custom_meters(False)).pack(side="left", padx=6)
        ttk.Button(actions, text="Refresh list", style="Small.TButton", command=self.refresh_custom_meters).pack(side="left")
        self.custom_export = ttk.Button(custom, text="Export selected meters…", style="Plain.TButton", command=self.export_custom_meters)
        self.custom_export.pack(anchor="w", padx=20, pady=(0, 8))
        self.custom_status = self.paragraph(custom, "", font=SMALL)
        # Shown while Meters is not set to Install: only then do the selected pages go on the stick.
        self.meters_hint = tk.Frame(custom, bg=WARN_BG)
        WrapLabel(self.meters_hint, bg=WARN_BG, fg=WARN, font=SMALL,
                  text="To put the chosen pages on the stick, set Meters to Install under Choose tweaks (it shows "
                       "Update once a check finds Meters on the car).").pack(side="left", fill="x", expand=True, padx=12, pady=8)
        ttk.Button(self.meters_hint, text="Go to Choose tweaks", style="Small.TButton",
                   command=lambda: self.tabs.select(self.choose_tab)).pack(side="right", padx=12, pady=8)
        self.vars["meters"].trace_add("write", lambda *_: self._update_meters_hint())
        self._update_meters_hint()
        self.custom_notice = WrapLabel(custom, bg=CARD, fg=WARN, font=SMALL)
        removed = self.card(page, "Removed pages")
        self.paragraph(removed, "When Send to MiatOff is used from a designer draft that lacks some pages, the designer asks first "
                                "and then moves those pages here. Restore puts a page back in the list above, not selected. A "
                                "restored page that is not in the editor draft will be offered for removal again on the next Send.", pady=(0, 10))
        self.removed_list = tk.Frame(removed, bg=CARD)
        self.removed_list.pack(fill="x", padx=20, pady=(0, 6))
        self.removed_empty = tk.Label(self.removed_list, text="No removed pages.", bg=CARD, fg=MUTED, font=BODY, anchor="w")
        self.removed_empty.pack(fill="x", pady=4)
        self.removed_status = self.paragraph(removed, "", font=SMALL)
        two = self.card(page, "Good to know")
        self.paragraph(two, "In the car the chosen pages are under Applications > Meters > CUSTOM, with live data. To change "
                            "them, make a new stick with Meters set to Install (Update) and press REPAIR in the car. Export "
                            "selected meters saves a backup file the car does not read; for a complete backup use Export > "
                            "Back up entire project in the designer.")
        self.paragraph(two, "Try new pages parked first.", fg=WARN)
        self.refresh_custom_meters()
        self.after(1000, self._poll_custom_meters)

    def _build_menu_tab(self):
        """The Mazda Home menu: the designer's Home mode, the menus sent from it plus built-in ones, and the one
        that goes on the stick (with the Meters install)."""
        self.home_menus = meters_library.HomeMenus(self.meters_library)
        self.home_choice = tk.StringVar(self, value="")
        self.home_rows, self._home_signature = [], None
        page = self.page(self.menu_tab, "menu", "Design your menu",
                         "Make your own Mazda Home screen in your web browser, then choose which one goes on the stick.")
        one = self.card(page, "Open the designer")
        self.paragraph(one, "The designer opens in your web browser on this computer and saves your work in that browser, so always open it from here. Keep this window open while you design: closing MiatOff stops the designer. In the designer, Send to MiatOff adds your menu below.", pady=(0, 10))
        row = tk.Frame(one, bg=CARD)
        row.pack(anchor="w", padx=20, pady=(0, 8))
        ttk.Button(row, text="Open designer", style="Accent.TButton",
                   command=lambda: self.open_designer("home")).pack(side="left")
        ttk.Button(row, text="Copy address", style="Plain.TButton",
                   command=lambda: self.copy_designer_url("home")).pack(side="left", padx=8)
        self.menu_status = self.paragraph(one, "Not started.", font=SMALL)
        menus = self.card(page, "Your menus")
        self.paragraph(menus, "Choose the menu that goes on the stick. The built-in menus are ready to use. Send to MiatOff in "
                              "the designer brings your menu here; sending one with the same name updates it.", pady=(0, 10))
        self.home_list = tk.Frame(menus, bg=CARD)
        self.home_list.pack(fill="x", padx=20)
        actions = tk.Frame(menus, bg=CARD)
        actions.pack(fill="x", padx=20, pady=10)
        ttk.Button(actions, text="Refresh list", style="Small.TButton", command=self.refresh_home_menus).pack(side="left")
        self.home_status = self.paragraph(menus, "", font=SMALL)
        # Shown until Custom menu and Meters are both set to Install: only then does the menu go on the car.
        self.home_hint = tk.Frame(menus, bg=WARN_BG)
        WrapLabel(self.home_hint, bg=WARN_BG, fg=WARN, font=SMALL,
                  text="To put the chosen menu on the stick, set Custom menu and Meters to Install under Choose tweaks "
                       "(Meters shows Update once a check finds it on the car).").pack(side="left", fill="x", expand=True, padx=12, pady=8)
        ttk.Button(self.home_hint, text="Go to Choose tweaks", style="Small.TButton",
                   command=lambda: self.tabs.select(self.choose_tab)).pack(side="right", padx=12, pady=8)
        for key in ("meters", stickflow.HOME_KEY):
            self.vars[key].trace_add("write", lambda *_: self._update_home_hint())
        two = self.card(page, "Good to know")
        self.paragraph(two, "In the car the chosen menu replaces Mazda's Home screen and the order the Commander knob goes "
                            "through it. Applications, Entertainment, Communication, Navigation and Settings use Mazda's own "
                            "routes; FM, DAB, Bluetooth, Android Auto, CarPlay and Meters open their list for a moment and then "
                            "that item, as a tap would. If anything is not as expected, Mazda's own Home stays. To change the "
                            "menu, make a new stick with Custom menu and Meters set to Install and press REPAIR in the car; "
                            "Custom menu > Mazda's Home brings back Mazda's own.")
        self.paragraph(two, "Try a new menu parked first.", fg=WARN)
        self.refresh_home_menus()
        self._update_home_hint()

    def _update_home_hint(self):
        ready = self.vars["meters"].get() == "install" and self.vars[stickflow.HOME_KEY].get() == "install"
        if ready or not self.home_choice.get():
            self.home_hint.pack_forget()
        elif not self.home_hint.winfo_manager():
            self.home_hint.pack(fill="x", padx=20, pady=(0, 10), before=self.home_status)

    def refresh_home_menus(self):
        try:
            rows = self.home_menus.list()
            chosen = self.home_menus.selected() or ""
            signature = (tuple((r["id"], r["name"], r["items"], r["updated"]) for r in rows), chosen)
            if signature != self._home_signature:
                self._home_signature = signature
                for frame in self.home_rows:
                    frame.destroy()
                self.home_rows = []
                self.home_choice.set(chosen)
                for row in rows:
                    frame = tk.Frame(self.home_list, bg=CARD)
                    frame.pack(fill="x", pady=5)
                    detail = ("no change to Home" if row["items"] is None else
                              f"{row['items']} items · " + ("built in" if row["builtIn"] else "sent from the designer"))
                    ttk.Radiobutton(frame, text=f"{row['name']}\n{detail}", value=row["id"], variable=self.home_choice,
                                    style="Card.TRadiobutton", command=self._home_chosen).pack(side="left", fill="x", expand=True)
                    if row["items"] is not None:
                        if not row["builtIn"]:
                            ttk.Button(frame, text="Remove", style="Small.TButton",
                                       command=lambda k=row["id"], n=row["name"]: self.remove_home_menu(k, n)).pack(side="right", padx=(8, 0))
                        ttk.Button(frame, text="Preview", style="Small.TButton",
                                   command=lambda k=row["id"]: self.preview_home_menu(k)).pack(side="right", padx=(8, 0))
                    self.home_rows.append(frame)
            name = next((r["name"] for r in rows if r["id"] == chosen), None)
            self.home_status.configure(text=(f"Chosen: {name}." if name else "No menu chosen yet.")
                                       + " Your choice is saved on this computer.", fg=MUTED)
            self._refresh_home_pick(rows, chosen)
        except Exception as error:
            self._home_signature = None
            self.home_status.configure(text="✕  Home menus could not be read; nothing was changed. " + str(error), fg=BAD)
        self._update_home_hint()

    def _home_chosen(self):
        try:
            self.home_menus.select(self.home_choice.get() or None)
        except Exception as error:
            messagebox.showerror("Home menu", str(error))
        self._home_signature = None
        self.refresh_home_menus()

    def preview_home_menu(self, key):
        import webbrowser
        from urllib.parse import urlencode
        if self._ensure_designer():
            webbrowser.open(self.designer_url.replace("index.html", "home/car-preview.html") + "?" + urlencode({"menu": key}))

    def remove_home_menu(self, key, name):
        if not messagebox.askyesno("Home menu", f"Remove \"{name}\" from your menus? The designer keeps its own draft."):
            return
        try:
            self.home_menus.remove(key)
        except Exception as error:
            messagebox.showerror("Home menu", str(error))
        self._home_signature = None
        self.refresh_home_menus()

    def _refresh_home_pick(self, rows, chosen):
        """The Custom menu picker under Choose tweaks, in step with Your menus."""
        self._home_ids = [row["id"] for row in rows]
        self.home_pick.configure(values=[row["name"] + (" (built in)" if row["builtIn"] else "") for row in rows])
        if chosen in self._home_ids:
            self.home_pick.current(self._home_ids.index(chosen))
        else:
            self.home_pick.set("Choose a menu")

    def _home_picked(self):
        at = self.home_pick.current()
        if 0 <= at < len(self._home_ids):
            self.home_choice.set(self._home_ids[at])
            self._home_chosen()
        self._update_chrome()

    def _home_reason(self):
        """Why Custom menu cannot be built as chosen (stickflow.home_reason); None when it can."""
        if not hasattr(self, "home_menus") or stickflow.HOME_KEY not in self.vars:
            return None
        try:
            chosen = bool(self.home_menus.selected())
        except Exception:  # the build reports a library that cannot be read
            chosen = False
        return stickflow.home_reason(self.vars[stickflow.HOME_KEY].get(), self.vars["meters"].get(), chosen)

    def home_selection(self):
        """The Home menu design for the stick, or None. Install: the chosen menu. Mazda's Home: none. Leave as-is: the
        menu the last Meters stick carried, so reinstalling Meters keeps the menu on the car. A menu that cannot be
        read stops the build."""
        if self.checking():
            return None
        choice = self.vars[stickflow.HOME_KEY].get()
        if choice == "remove":
            return None
        if choice == "install":
            return self.home_menus.chosen()
        return self.home_menus.built()

    def _home_line(self):
        """(action, text) for Review, or None."""
        choice = self.vars[stickflow.HOME_KEY].get()
        try:
            home = self.home_selection()
        except Exception:  # the build itself reports this properly
            home = None
        name = home.get("name", "your menu") if home else None
        if choice == "install":
            return ("Install", f"{stickflow.HOME_TITLE}: {name or 'no menu chosen'}")
        if choice == "remove":
            return ("Mazda's Home", f"{stickflow.HOME_TITLE}: Mazda's own Home again")
        if name and self.vars["meters"].get() == "install":
            return ("Keep", f"{stickflow.HOME_TITLE}: {name} (on the last stick)")
        return None

    def _designer_state(self, text, fg):
        """Both designer pages show whether the one designer server is running."""
        for label in (self.designer_status, getattr(self, "menu_status", None)):
            if label is not None:
                label.configure(text=text, fg=fg)

    def _update_meters_hint(self):
        if self.vars["meters"].get() == "install":
            self.meters_hint.pack_forget()
        elif not self.meters_hint.winfo_manager():
            self.meters_hint.pack(fill="x", padx=20, pady=(0, 10), before=self.custom_export)

    def _ensure_designer(self):
        import meters_designer
        if not hasattr(self, "designer_server"):
            try:
                self.designer_server = meters_designer.launch(open_browser=False)
                self._designer_state(text="✓  Running at " + self.designer_url, fg=OK)
            except OSError:
                # Port busy: reuse a designer server that is already running there.
                import hashlib
                try:
                    with urllib.request.urlopen(self.designer_url.split("/designer/")[0] + "/api/builder/session", timeout=2) as response:
                        connection = json.load(response)
                    expected = hashlib.sha256(str(self.meters_library.path.resolve()).encode()).hexdigest()
                    if connection.get("service") != "MiatOffDesigner" or connection.get("protocol") != 2 or connection.get("libraryId") != expected:
                        raise ValueError("Different or older designer server")
                except (OSError, ValueError):
                    self._designer_state(text="✕  Could not start.", fg=BAD)
                    messagebox.showerror("Meters Designer", f"Port {meters_designer.DEFAULT_PORT} is in use by "
                                         "another program or by a designer started from a different MiatOff window or "
                                         "folder. Close the old designer / MiatOff window, then reopen the designer "
                                         "from this window, so the editor and builder use the same custom meters library.")
                    return False
                self._designer_state(text="✓  Using the designer already running at " + self.designer_url, fg=OK)
        return True

    def open_designer(self, mode="meters"):
        import webbrowser
        if self._ensure_designer():
            webbrowser.open(self.designer_url + ("?mode=home" if mode == "home" else ""))

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
                self.custom_notice.pack(fill="x", padx=20, pady=(0, 8), before=self.custom_status)
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
                    check = ttk.Checkbutton(frame, variable=var, style="Card.TCheckbutton",
                                            command=lambda k=key: self._custom_meter_toggled(k))
                    check.pack(side="left", fill="x", expand=True)
                    ttk.Button(frame, text="Preview", style="Small.TButton", command=lambda k=key: self.preview_custom_meter(k)).pack(side="right", padx=(8, 0))
                    self.custom_rows[key] = (frame, check)
                    self.custom_vars[key] = var
                self.custom_vars[key].set(bool(row["selected"]))
                self.custom_rows[key][1].configure(text=f"{row['name']}\n{row['widgets']} instruments")
            selected = sum(bool(row["selected"]) for row in rows)
            self.custom_export.configure(state="normal" if selected else "disabled")
            self.custom_status.configure(text=f"{selected} of {len(rows)} pages chosen. Your choice is saved on this computer.", fg=MUTED)
        except Exception as error:
            self._library_signature = None
            self.custom_export.configure(state="disabled")
            self.custom_status.configure(text="✕  Library could not be read; existing data was preserved. " + str(error), fg=BAD)

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
                WrapLabel(frame, bg=CARD, fg=INK, font=BODY,
                          text=f"{row['name']}\n{row['widgets']} instruments, removed {row['retired'][:16].replace('T', ' ')} UTC"
                          ).pack(side="left", fill="x", expand=True)
                ttk.Button(frame, text="Restore", style="Small.TButton",
                           command=lambda r=row: self.restore_removed_page(r["id"], r["sha256"])).pack(side="right", padx=(8, 0))
                self.removed_rows.append(frame)
        except Exception as error:
            self._removed_signature = None
            self.removed_status.configure(text="✕  Removed pages could not be read; nothing was changed. " + str(error), fg=BAD)

    def restore_removed_page(self, key, digest):
        try:
            result = self.meters_library.restore_retired(key, digest)
            self.removed_status.configure(text=f"✓  Restored {result['name']}. It is in the list above, not selected.", fg=OK)
        except Exception as error:
            self.removed_status.configure(text="✕  Not restored: " + str(error), fg=BAD)
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
            self.custom_status.configure(text="✕  " + str(error), fg=BAD)

    def select_custom_meters(self, include):
        try:
            self.meters_library.select(list(self.custom_vars) if include else [])
            self.refresh_custom_meters()
        except Exception as error:
            self.custom_status.configure(text="✕  " + str(error), fg=BAD)

    def export_custom_meters(self):
        try:
            bundle = self.meters_library.selection()
            if not bundle["items"]:
                raise ValueError("Select at least one Custom page first.")
            path = filedialog.asksaveasfilename(title="Export selected custom meters", defaultextension=".json",
                                                initialfile=meters_library.SELECTION_NAME, filetypes=[("Meters selection", "*.json")])
            if path:
                meters_library.write_selection(Path(path), bundle)
                self.custom_status.configure(text=f"✓  Exported {len(bundle['items'])} selected pages as a backup file. The car does not read it.", fg=OK)
        except Exception as error:
            messagebox.showerror("Custom meters export", str(error))

    def copy_designer_url(self, mode="meters"):
        self.clipboard_clear()
        self.clipboard_append(self.designer_url + ("?mode=home" if mode == "home" else ""))

    # ---------------------------------------------------------------- actions
    def checking(self) -> bool:
        return self.current() == "check"

    def designing(self) -> bool:
        return self.current() == "designer"

    def choices(self) -> dict:
        return {key: self.vars[key].get() for key in KEYS}

    def target(self):
        info = self.chosen_drive()
        if info is None:
            messagebox.showerror("MiatOff", "Choose the USB stick first.")
            return None
        return Path(info.root)

    def kit(self, custom=None, home=None):
        """The kit of the current page. Only the install stick takes custom pages and a Home menu."""
        return kits.dump_kit() if self.checking() else kits.install_kit(custom, home)

    def run(self, action: str):
        if self.current() in ("prepare", *SECTIONS):  # these pages build no stick
            return
        target = self.target()
        if target is None:
            return
        checking = self.checking()
        try:
            if action == "build":
                self._start_build(target, checking)
            else:
                self._start_verify(target)
        except stickkit.StickError as error:
            messagebox.showerror("MiatOff", str(error).removeprefix("ERROR: "))
        except Exception as error:  # surfaced to the user, never silent
            messagebox.showerror("MiatOff", f"{type(error).__name__}: {error}")

    def _start_build(self, target, checking):
        choices = {} if checking else self.choices()
        if not checking and not has_changes(choices):
            messagebox.showerror("MiatOff", "Choose at least one tweak to install or remove.")
            return
        summary = "" if checking else "\n\n" + "\n".join(f"{action}: {title}" for action, title in stickflow.change_lines(choices, self.states))
        custom, note = self.custom_selection(choices)
        if custom:
            summary += (f"\nCustom pages: {len(custom['items'])} (shown under Applications > Meters > CUSTOM)"
                        if choices.get("meters") == "install" else
                        f"\nCustom pages: {len(custom['items'])} included, so a Meters already on the car "
                        "is not reported as outdated")
        summary += note
        reason = None if checking else self._home_reason()
        if reason:
            messagebox.showerror("MiatOff", reason)
            return
        home = self.home_selection()
        line = None if checking else self._home_line()
        if line:
            summary += f"\n{line[1]}"
        # What the stick carries, remembered once it is written (Custom menu "Leave as-is" carries it again).
        self._home_mark = None
        if not checking and choices.get("meters") == "install":
            choice = self.vars[stickflow.HOME_KEY].get()
            if choice == "install":
                self._home_mark = self.home_menus.selected()
            elif choice == "remove":
                self._home_mark = ""
        kit = self.kit(custom, home)
        previous = stickwriter.replaces(target, kit.id_name)
        if previous:
            summary += (f"\n\nThis USB stick holds the MiatOff {previous} files. They will be replaced; "
                        "check results and logs on the stick stay.")
        what = "the read-only check" if checking else "these changes"
        if not messagebox.askyesno("MiatOff", f"Write {what} to the USB stick {target}?{summary}"):
            return
        plan = None if checking else make_plan(choices)

        def report(label, _stage):
            self.job_label = label

        def work():
            stickkit.require_stick_root(target)
            kit.build(target, plan=plan, progress=report)
        self.start_job("Writing and verifying the USB stick…", work, lambda _result, error: self._stick_written(checking, error))

    def _stick_written(self, checking, error):
        if error:
            self.show_failure(error)
            return
        if checking:
            self.check_made.configure(text="✓  USB ready. Eject it safely, then take it to the car.")
        else:
            self.stick_ready = True
            self.review_result.pack(fill="x", pady=7)
            self.notice = ("✓  USB ready. Follow the steps on this page.", OK)
            if getattr(self, "_home_mark", None) is not None:
                try:
                    self.home_menus.mark_built(self._home_mark)
                except Exception as mark_error:  # the stick is fine; only "Leave as-is" may not know it
                    self.notice = ("!  USB ready, but the menu on it could not be remembered: " + str(mark_error), WARN)
                self._home_mark = None
            self.update_idletasks()
            self.scrollers["review"].canvas.yview_moveto(1.0)

    def _start_verify(self, target):
        custom, note = self.custom_selection(self.choices())
        kit = self.kit(custom, self.home_selection())
        self.start_job("Comparing the USB stick with this version of MiatOff…", lambda: kit.verify(target),
                       lambda problems, error: self._stick_verified(problems, error, note))

    def _stick_verified(self, problems, error, note):
        if error:
            self.show_failure(error)
        elif problems:
            lines = [f"{kind.lower()}: {name[:60]}" for kind, name in problems[:VERIFY_DETAILS]]
            if len(problems) > VERIFY_DETAILS:
                lines.append(f"... and {len(problems) - VERIFY_DETAILS} more")
            messagebox.showerror("MiatOff", "This USB stick does not match this version of MiatOff." + note, detail="\n".join(lines))
        else:
            self.notice = ("✓  The USB stick is correct.", OK)

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
    parser.add_argument("--designer", action="store_true", help="Open the Custom meters library section")
    parser.add_argument("--menu", action="store_true", help="Open the Home menu designer section")
    parser.add_argument("--selftest", type=Path, metavar="FILE", help="Check the installation and write a report; no window")
    args = parser.parse_args()
    if args.selftest:
        sys.exit(selftest(args.selftest))
    app = App()
    if args.designer:
        app.go("designer")
    elif args.menu:
        app.go("menu")
    app.mainloop()

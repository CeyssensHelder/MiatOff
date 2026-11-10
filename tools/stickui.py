"""The look of the MiatOff builder: dark theme, fonts and the few widgets Tk lacks.

SPDX-License-Identifier: GPL-3.0-or-later
"""
import sys
import tkinter as tk
from tkinter import font as tkfont, ttk

# The palette of the Meters Designer (meters/designer/studio-v3.css), so the two feel like one product.
BG, RAIL, CARD, RAISED, LINE = "#0b1018", "#070c13", "#141c28", "#202b3a", "#2b3747"
INK, MUTED, FAINT = "#eaf0f6", "#9ba9ba", "#7a8da3"
ACCENT, ACCENT_HOVER, ACCENT_INK, ACCENT_OFF, ACCENT_OFF_INK = "#67dcc2", "#8ce8d4", "#0a2721", "#1d3a3a", "#6f9189"
ACCENT_TINT, DANGER_TINT = "#17342f", "#2b1c27"
OK, WARN, BAD, INFO = ACCENT, "#ffc16f", "#ff8293", "#8fb8ff"
WARN_BG, WARN_LINE = "#2b2220", "#855943"

# Status always comes with an icon and words, never with colour alone.
KIND_COLOUR = {"ok": OK, "warn": WARN, "bad": BAD}
KIND_ICON = {"ok": "✓", "warn": "!", "bad": "✕"}
STATE_COLOUR = {"available": OK, "installed": INFO, "partial": WARN, "blocked": BAD, "not checked": MUTED}

TITLE, HEADING, BODY, BOLD, SMALL, SMALL_BOLD, MONO = (
    "MiatTitle", "MiatHeading", "MiatBody", "MiatBold", "MiatSmall", "MiatSmallBold", "MiatMono")


def enable_dpi_awareness() -> None:
    """Sharp text on scaled Windows displays. Must run before the window exists."""
    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except (AttributeError, OSError):
            pass


def dark_title_bar(root: tk.Tk) -> None:
    """Windows 10 (20H1) and later draw the title bar dark on request."""
    if sys.platform == "win32":
        try:
            import ctypes
            root.update_idletasks()
            handle = ctypes.windll.user32.GetParent(root.winfo_id())
            value = ctypes.c_int(1)
            ctypes.windll.dwmapi.DwmSetWindowAttribute(handle, 20, ctypes.byref(value), ctypes.sizeof(value))
        except (AttributeError, OSError):
            pass


def apply_theme(root: tk.Tk) -> None:
    """Named fonts in points, so they follow the display's scaling, and the dark ttk styles."""
    family = tkfont.nametofont("TkDefaultFont", root=root).actual("family")
    mono = tkfont.nametofont("TkFixedFont", root=root).actual("family")
    root._fonts = [
        tkfont.Font(root=root, name=TITLE, family=family, size=20, weight="bold"),
        tkfont.Font(root=root, name=HEADING, family=family, size=12, weight="bold"),
        tkfont.Font(root=root, name=BODY, family=family, size=10),
        tkfont.Font(root=root, name=BOLD, family=family, size=10, weight="bold"),
        tkfont.Font(root=root, name=SMALL, family=family, size=9),
        tkfont.Font(root=root, name=SMALL_BOLD, family=family, size=9, weight="bold"),
        tkfont.Font(root=root, name=MONO, family=mono, size=9),
    ]
    root.configure(bg=BG)
    style = ttk.Style(root)
    style.theme_use("clam")  # the one theme that honours colours on every operating system
    style.configure(".", background=BG, foreground=INK, font=BODY, troughcolor=BG, focuscolor=INK)
    style.configure("Pages.TNotebook", background=BG, borderwidth=0, padding=0, tabmargins=0, lightcolor=BG, darkcolor=BG, bordercolor=BG)
    style.layout("Pages.TNotebook.Tab", [])

    def button(name, fill, hover, ink, off_fill, off_ink, font, padding):
        style.configure(name, background=fill, foreground=ink, font=font, padding=padding, relief="flat", borderwidth=1,
                        lightcolor=fill, darkcolor=fill, bordercolor=fill, focusthickness=1, focuscolor=fill)
        style.map(name, background=[("disabled", off_fill), ("active", hover)], foreground=[("disabled", off_ink)],
                  lightcolor=[("disabled", off_fill), ("active", hover)], darkcolor=[("disabled", off_fill), ("active", hover)],
                  bordercolor=[("focus", INK), ("disabled", off_fill), ("active", hover)])

    button("Accent.TButton", ACCENT, ACCENT_HOVER, ACCENT_INK, ACCENT_OFF, ACCENT_OFF_INK, BOLD, (18, 8))
    button("Plain.TButton", RAISED, LINE, INK, CARD, FAINT, BODY, (14, 8))
    button("Small.TButton", RAISED, LINE, INK, CARD, FAINT, SMALL, (10, 4))
    button("Link.TButton", CARD, RAISED, MUTED, CARD, FAINT, SMALL_BOLD, (2, 4))
    style.configure("Link.TButton", anchor="w")

    style.configure("Card.TCheckbutton", background=CARD, foreground=INK, font=BODY, indicatorbackground=RAISED,
                    indicatorforeground=INK, upperbordercolor=LINE, lowerbordercolor=LINE, indicatormargin=(0, 2, 8, 2))
    style.map("Card.TCheckbutton", background=[("active", CARD)], foreground=[("disabled", FAINT)],
              indicatorbackground=[("selected", ACCENT), ("active", LINE)], indicatorforeground=[("selected", ACCENT_INK)])

    style.configure("TCombobox", fieldbackground=RAISED, background=RAISED, foreground=INK, arrowcolor=INK, bordercolor=LINE,
                    lightcolor=RAISED, darkcolor=RAISED, selectbackground=RAISED, selectforeground=INK, padding=6)
    style.map("TCombobox", fieldbackground=[("readonly", RAISED)], foreground=[("readonly", INK)],
              bordercolor=[("focus", INK)], background=[("active", LINE)], selectbackground=[("readonly", RAISED)],
              selectforeground=[("readonly", INK)])
    root.option_add("*TCombobox*Listbox.background", RAISED)
    root.option_add("*TCombobox*Listbox.foreground", INK)
    root.option_add("*TCombobox*Listbox.selectBackground", ACCENT)
    root.option_add("*TCombobox*Listbox.selectForeground", ACCENT_INK)
    root.option_add("*TCombobox*Listbox.font", BODY)

    style.configure("Vertical.TScrollbar", background=RAISED, troughcolor=BG, arrowcolor=MUTED, bordercolor=BG,
                    lightcolor=RAISED, darkcolor=RAISED, gripcount=0)
    style.map("Vertical.TScrollbar", background=[("active", LINE)])
    style.configure("Horizontal.TProgressbar", background=ACCENT, troughcolor=RAISED, bordercolor=RAISED,
                    lightcolor=ACCENT, darkcolor=ACCENT)


class WrapLabel(tk.Label):
    """Text that wraps to the width it is given, so resizing and larger text keep working."""

    def __init__(self, parent, **options):
        options.setdefault("justify", "left")
        options.setdefault("anchor", "w")
        options.setdefault("wraplength", 420)
        super().__init__(parent, **options)
        self.bind("<Configure>", self._rewrap)

    def _rewrap(self, event):
        width = event.width - 4
        if width > 60 and abs(int(self.cget("wraplength")) - width) > 3:
            self.configure(wraplength=width)


class Scrolled(tk.Frame):
    """A frame whose content scrolls vertically; the window routes the mouse wheel to the visible page."""

    def __init__(self, parent, background=BG):
        super().__init__(parent, bg=background)
        self.canvas = tk.Canvas(self, bg=background, highlightthickness=0, borderwidth=0)
        bar = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.inner = tk.Frame(self.canvas, bg=background)
        self.inner.bind("<Configure>", lambda _e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.window = self.canvas.create_window((0, 0), window=self.inner, anchor="nw")
        self.canvas.bind("<Configure>", lambda e: self.canvas.itemconfigure(self.window, width=e.width))
        self.canvas.configure(yscrollcommand=bar.set)
        self.canvas.pack(side="left", fill="both", expand=True)
        bar.pack(side="right", fill="y")

    def scroll(self, units: int) -> None:
        if self.canvas.yview() != (0.0, 1.0):  # nothing to scroll when everything fits
            self.canvas.yview_scroll(units, "units")

    def to_top(self) -> None:
        self.canvas.yview_moveto(0)


class Segmented(tk.Frame):
    """Choose one of a few options. Works with the mouse and with Tab, arrows and Space.

    Drawn with labels because Tk on macOS ignores the colours of button-style radio buttons.
    """

    # As in the Designer, a pressed option is outlined and tinted rather than filled: (fill, text, outline).
    PRESSED = {"keep": (RAISED, INK, LINE), "install": (ACCENT_TINT, ACCENT, ACCENT), "remove": (DANGER_TINT, BAD, BAD)}

    def __init__(self, parent, variable: tk.StringVar, choices: list):
        super().__init__(parent, bg=LINE, padx=1, pady=1)
        self.variable, self.labels = variable, {}
        self.order = [value for value, _text in choices]
        for column, (value, text) in enumerate(choices):
            label = tk.Label(self, text=text, bg=CARD, fg=INK, font=SMALL, padx=12, pady=6, takefocus=1, cursor="hand2",
                             disabledforeground=FAINT, highlightthickness=1, highlightcolor=INK, highlightbackground=CARD)
            label.grid(row=0, column=column, sticky="nsew", padx=(0 if column == 0 else 1, 0))
            label.bind("<Button-1>", lambda _e, v=value: self.choose(v, focus=True))
            for key in ("<space>", "<Return>"):
                label.bind(key, lambda _e, v=value: self.choose(v))
            label.bind("<Left>", lambda _e, v=value: self._step(v, -1))
            label.bind("<Right>", lambda _e, v=value: self._step(v, 1))
            self.labels[value] = label
        variable.trace_add("write", lambda *_a: self.paint())
        self.paint()

    def enabled(self, value: str) -> bool:
        return str(self.labels[value].cget("state")) != "disabled"

    def choose(self, value: str, focus: bool = False) -> None:
        if self.enabled(value):
            self.variable.set(value)
            if focus:
                self.labels[value].focus_set()

    def set_enabled(self, value: str, on: bool) -> None:
        self.labels[value].configure(state="normal" if on else "disabled", takefocus=1 if on else 0,
                                     cursor="hand2" if on else "arrow")

    def _step(self, value: str, direction: int) -> str:
        at = self.order.index(value) + direction
        while 0 <= at < len(self.order):
            if self.enabled(self.order[at]):
                self.labels[self.order[at]].focus_set()
                break
            at += direction
        return "break"

    def paint(self) -> None:
        chosen = self.variable.get()
        for value, label in self.labels.items():
            on = value == chosen
            fill, ink, outline = self.PRESSED[value] if on else (CARD, INK, CARD)
            label.configure(bg=fill, fg=ink, font=SMALL_BOLD if on else SMALL, highlightbackground=outline)


class Collapsible(tk.Frame):
    """A section that opens when asked: for detail most people do not need."""

    def __init__(self, parent, title: str, background=CARD):
        super().__init__(parent, bg=background)
        self.title, self.open = title, False
        self.toggle_button = ttk.Button(self, style="Link.TButton", command=self.toggle)
        self.toggle_button.pack(anchor="w")
        self.body = tk.Frame(self, bg=background)
        self._label()

    def _label(self):
        self.toggle_button.configure(text=("▾  " if self.open else "▸  ") + self.title)

    def toggle(self):
        self.open = not self.open
        if self.open:
            self.body.pack(fill="x", pady=(4, 0))
        else:
            self.body.pack_forget()
        self._label()


class RailItem(tk.Frame):
    """One line of the step navigator: reachable with the mouse and with Tab, Enter or Space.

    The current line looks like the current page tile in the Designer: an outline and a bar on the left.
    """

    def __init__(self, parent, mark: str, text: str, command):
        super().__init__(parent, bg=RAIL, takefocus=1, cursor="hand2", highlightthickness=1, highlightcolor=ACCENT_HOVER,
                         highlightbackground=RAIL)
        self.bar = tk.Frame(self, bg=RAIL, width=3)
        self.bar.pack(side="left", fill="y")
        self.mark = tk.Label(self, text=mark, bg=RAISED, fg=MUTED, font=SMALL_BOLD, width=3)
        self.mark.pack(side="left", padx=(9, 0), pady=9)
        self.text = tk.Label(self, text=text, bg=RAIL, fg=MUTED, font=BODY, anchor="w")
        self.text.pack(side="left", fill="x", expand=True, padx=10)
        self.command = command
        for widget in (self, self.bar, self.mark, self.text):
            widget.bind("<Button-1>", lambda _e: self.command())
        for key in ("<space>", "<Return>"):
            self.bind(key, lambda _e: self.command())

    def paint(self, current: bool, done: bool, number: str) -> None:
        fill = CARD if current else RAIL
        self.configure(bg=fill, highlightbackground=ACCENT if current else RAIL)
        self.bar.configure(bg=ACCENT if current else RAIL)
        self.text.configure(bg=fill, fg=INK if current else MUTED, font=BOLD if current else BODY)
        self.mark.configure(text="\N{CHECK MARK}" if done and not current else number,
                            bg=ACCENT_TINT if current else RAISED, fg=ACCENT if current or done else MUTED)

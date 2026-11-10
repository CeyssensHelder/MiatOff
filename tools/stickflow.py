"""What the MiatOff builder decides and says, without any widgets.

The tweaks on offer, the plan written to the stick, the plain-English wording of a
check result, what blocks each step, and running slow work off the window's thread.

SPDX-License-Identifier: GPL-3.0-or-later
"""
import queue
import sys
import threading

# (category, [(key, title, description, install label, remove label)])
COMPONENTS = [
    ("Touch", [
        ("touchtune", "Touch while driving", "Touchscreen works in the Mazda menus while the car moves (TouchTune).",
         "Install", "Remove"),
        ("aa_touch", "Touch in Android Auto", "Tap, swipe and drag in Android Auto. Needs TouchTune for use while driving.",
         "Install", "Remove"),
    ]),
    ("Startup", [
        ("trim_dvdtv", "DVD and TV", "Stop the DVD player and TV tuner from starting at boot.", "Stop at boot", "Start again"),
        ("trim_sirius", "SiriusXM", "Stop SiriusXM (North America only) from starting at boot.", "Stop at boot", "Start again"),
        ("trim_pandora", "Pandora", "Stop Pandora from starting at boot.", "Stop at boot", "Start again"),
        ("trim_stitcher", "Stitcher", "Stop Stitcher from starting at boot.", "Stop at boot", "Start again"),
        ("trim_aha", "Aha", "Stop Aha from starting at boot. Three boot stages are re-pointed so voice and calls still start.",
         "Stop at boot", "Start again"),
        ("warning", "Startup warning", "Skip the warning screen at startup.", "Skip it", "Show it again"),
    ]),
    ("Interface", [
        ("meters", "Meters", "Gauges under Applications: speed, rpm, G-meter, lap timer.", "Install", "Remove"),
        ("delay", "Shorter list delay", "Holding the Commander tilted scrolls lists after 0.15 s instead of 1.5 s.",
         "Shorter", "Stock"),
        ("safety", "Camera safety text", "Blank the safety text over the reversing camera picture.",
         "Blank it", "Show it again"),
        ("sensors", "Parking sensor graphics", "Semi-transparent parking sensor graphics (MZD-AIO), so the camera picture shows through.",
         "Install", "Remove"),
        ("menu", "Hide trimmed items in the menu", "Also hide the sources you stop at boot (DVD/TV, SiriusXM, Pandora, Stitcher, Aha) in the Entertainment menu. Later changes to the boot trim are followed.",
         "Hide them", "Show them again"),
    ]),
]
ITEMS = {item[0]: item for _, items in COMPONENTS for item in items}
# The order of the plan file does not follow the screen: the car looks keys up by name.
KEYS = list(ITEMS)
# Custom menu (the Home menu) is a choice of the builder only: it travels in the Meters payload and has no key in
# the plan, whose keys the car checks strictly.
HOME_KEY = "home"
HOME_TITLE = "Custom menu"
TRIM_KEYS = ("trim_dvdtv", "trim_sirius", "trim_pandora", "trim_stitcher", "trim_aha")

STATE_TEXT = {
    "available": ("✓", "Available"),
    "installed": ("●", "Installed"),
    "partial": ("!", "Partly installed"),
    "blocked": ("✕", "Not possible"),
    "not checked": ("?", "Not checked"),
}

PAGES = ("prepare", "check", "choose", "review")


def make_plan(choices: dict) -> str:
    """choices: key -> install | remove | keep. Returns the text of miatoff-plan.txt."""
    lines = ["# MiatOff plan: the end state chosen in the PC builder"]
    for key in KEYS:
        lines.append(f"{key}={choices.get(key, 'keep')}")
    return "\n".join(lines) + "\n"


def has_changes(choices: dict) -> bool:
    return any(choices.get(key, "keep") != "keep" for key in KEYS)


def allowed_options(state):
    """Which of install/remove make sense for a checked state (None = not checked: both).
    Install on an installed part is an update: the car sees a different stick and offers REPAIR."""
    return {"available": {"install"}, "installed": {"install", "remove"}, "partial": {"install", "remove"},
            "blocked": set()}.get(state, {"install", "remove"})


def enabled_options(state, have_check: bool, override: bool) -> set:
    """What the tweak controls allow. Before any check nothing can be picked, unless the user chose to go without one."""
    if override:
        return {"install", "remove"}
    return allowed_options(state) if have_check else set()


def change_lines(choices: dict, states: dict = None) -> list:
    """The chosen changes as (action, tweak) in screen order, with the labels the user saw."""
    lines = []
    for _category, items in COMPONENTS:
        for key, title, _description, install_label, remove_label in items:
            value = choices.get(key, "keep")
            if value == "install":
                updating = key == "meters" and (states or {}).get(key) == "installed"
                lines.append(("Update" if updating else install_label, title))
            elif value == "remove":
                lines.append((remove_label, title))
    return lines


def dependency_notes(choices: dict, states: dict = None) -> list:
    """Things worth knowing about this combination. Nothing is ever selected for the user."""
    states = states or {}
    installed = lambda key: states.get(key) == "installed"
    notes = []
    if choices.get("aa_touch") == "install" and choices.get("touchtune") != "install" and not installed("touchtune"):
        notes.append("Touch in Android Auto works while driving only together with Touch while driving, which is not "
                     "selected. Without it, touch in Android Auto works when parked.")
    if choices.get("menu") == "install":
        stopping = any(choices.get(key) == "install" or (installed(key) and choices.get(key) != "remove") for key in TRIM_KEYS)
        if not stopping:
            notes.append("Hide trimmed items only hides sources you stop at boot. None are stopped yet, so the menu "
                         "stays the same until you stop one.")
    return notes


GATE_TEXT = {
    "firmware": "The car's firmware is not the version MiatOff supports.",
    "Android Auto library": "The Android Auto library on the car is a version MiatOff does not know.",
    "Android Auto service": "The Android Auto service on the car is a version MiatOff does not know.",
    "service manager config": "The car starts its services in a way MiatOff does not know.",
    "/data_persist writable": "A storage area MiatOff needs on the car is read-only.",
    "sha256 tool on the unit": "The car has no tool to verify files, so MiatOff would refuse to change it.",
    "no foreign LD_PRELOAD": "Another modification is already active on the car.",
}


def check_summary(verdict: dict) -> dict:
    """A check result in plain English: kind (ok | warn | bad), title, body and the reasons."""
    overall = verdict["overall"]
    if overall == "supported":
        return {"kind": "ok", "title": "Your car can be tweaked",
                "body": "Every check passed. Continue to choose your tweaks. The car checks each file again before changing it.",
                "reasons": []}
    if overall == "not supported":
        reasons = [GATE_TEXT.get(gate["name"], gate["name"]) for gate in verdict.get("gates", []) if gate["ok"] is False]
        return {"kind": "bad", "title": "MiatOff cannot change this car",
                "body": "The installer on the car would refuse to run, so nothing can be changed. The technical details "
                        "below can help if you want to ask for support.", "reasons": reasons}
    return {"kind": "warn", "title": "The check is not complete",
            "body": "Some checks need a full read of the car. Make the check stick again, choose FULL in the car and read "
                    "the result again.", "reasons": []}


def component_lines(verdict: dict) -> list:
    """Per tweak in screen order: (key, title, state, detail)."""
    out = []
    for _category, items in COMPONENTS:
        for key, title, *_rest in items:
            component = verdict["components"].get(key, {"state": "not checked", "detail": ""})
            out.append((key, title, component["state"], component["detail"]))
    return out


def home_reason(home: str, meters: str, chosen: bool):
    """Why the Custom menu choice cannot be built as it stands; None when it can."""
    if home in ("install", "remove") and meters != "install":
        return "Custom menu goes on the car with Meters: set Meters to Install (or Update) as well."
    if home == "install" and not chosen:
        return "Choose the menu to install under Design your menu > Your menus."
    return None


def blocker(page: str, drive, have_check: bool, override: bool, changed: bool, home=None):
    """Why the footer's main button cannot be pressed on this page, in plain English; None when it can.
    home: the Custom menu reason (home_reason), if any."""
    if page == "prepare" or page == "review":
        if drive is None:
            return "Plug in a USB stick to continue."
        if drive.problems():
            return "This USB stick cannot be used yet. See Prepare USB."
    if page == "check" and not (have_check or override):
        return "Read the check results to continue."
    if page in ("choose", "review") and home and (have_check or override):
        return home
    if page == "choose" and not changed:
        return "Choose at least one change to continue." if have_check or override else "Read the check results first."
    if page == "review":
        if not changed:
            return "Choose at least one change under Choose tweaks."
        if not (have_check or override):
            return "Check your car first, or allow building without a check under Choose tweaks."
    return None


def done_steps(drive, have_check: bool, changed: bool, stick_ready: bool) -> set:
    """Which steps the navigator marks as finished."""
    done = set()
    if drive is not None and not drive.problems():
        done.add("prepare")
    if have_check:
        done.add("check")
    if changed:
        done.add("choose")
    if stick_ready:
        done.add("review")
    return done


def format_help(platform: str = None) -> str:
    """How to make a stick suitable with the tools of this operating system. MiatOff never formats a drive."""
    platform = platform or sys.platform
    if platform == "darwin":
        return ("1. Open Disk Utility and choose View > Show All Devices.\n"
                "2. Select the USB drive itself (the top line), not the volume below it, and press Erase.\n"
                "3. Choose format MS-DOS (FAT) and scheme Master Boot Record.\n"
                "Erasing deletes everything on the stick.")
    if platform.startswith("linux"):
        return ("1. Open Disks (GNOME Disks) and select the USB drive.\n"
                "2. In the drive's menu choose Format Disk, with partitioning Compatible with all systems (MBR/DOS).\n"
                "3. Create one partition of 32 GB or less, type FAT.\n"
                "Formatting deletes everything on the stick.")
    return ("1. In File Explorer, right-click the USB drive and choose Format.\n"
            "2. Choose file system FAT32 and press Start.\n"
            "If FAT32 is not offered (sticks over 32 GB) or the stick uses GPT, open Disk Management: delete its volume, "
            "use Convert to MBR Disk if offered, and create a new volume of 32 GB or less formatted FAT32.\n"
            "Formatting deletes everything on the stick.")


def run_captured(work):
    """(result, None) or (None, the error). Also catches SystemExit, which would end a worker thread silently."""
    try:
        return work(), None
    except BaseException as error:  # noqa: B902  (reported to the user on the window's thread)
        return None, error


class JobRunner:
    """One piece of slow work at a time on a worker thread; its result is delivered on the window's thread by poll()."""

    def __init__(self):
        self._finished = queue.Queue()
        self.busy = False

    def start(self, work, done) -> None:
        if self.busy:
            raise RuntimeError("Another job is still running")
        self.busy = True
        threading.Thread(target=lambda: self._finished.put((done, *run_captured(work))), daemon=True).start()

    def poll(self) -> bool:
        """Call from the window's thread. Delivers a finished job; True if there was one."""
        try:
            done, result, error = self._finished.get_nowait()
        except queue.Empty:
            return False
        self.busy = False
        done(result, error)
        return True

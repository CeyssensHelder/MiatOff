#!/usr/bin/env python3
"""Tests for what the builder decides and says (tools/stickflow.py). No window, no drive, fabricated data.

    python tools/tests/test_stickflow.py

SPDX-License-Identifier: GPL-3.0-or-later
"""
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
from stickkit import DriveInfo, StickError  # noqa: E402
import stickflow  # noqa: E402

FAILURES = []
GOOD = DriveInfo(root="E:\\", total=15_000_000_000, filesystem="FAT32", partition_style="mbr", partition_number=1, usb=True)
BAD = DriveInfo(root="F:\\", filesystem="exFAT", usb=True)


def check(ok: bool, name: str):
    print(("PASS  " if ok else "FAIL  ") + name)
    if not ok:
        FAILURES.append(name)


def test_plan():
    plan = stickflow.make_plan({"touchtune": "install", "meters": "remove"})
    lines = dict(line.split("=") for line in plan.splitlines() if not line.startswith("#"))
    check(set(lines) == set(stickflow.KEYS), "the plan lists every tweak")
    check(lines["touchtune"] == "install" and lines["meters"] == "remove" and lines["delay"] == "keep", "the plan holds the choices")
    script = (ROOT / "aa-touch-stick/stick/aa-touch.sh").read_text(encoding="utf-8")
    valid = re.search(r"^plan_valid\(\) \{(.*?)^\}", script, re.M | re.S).group(1)
    check(all(f'"{key}"' in valid for key in stickflow.KEYS), "the car's plan check knows every key the builder writes")
    if shutil.which("sh"):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "plan.txt"
            path.write_bytes(plan.encode("ascii"))
            function = "plan_valid() {" + valid + "}"
            run = lambda: subprocess.run(["sh", "-c", function + "\nplan_valid"], env={**os.environ, "PLAN": str(path)}).returncode
            check(run() == 0, "the car's own plan check accepts a plan from the builder")
            path.write_bytes(plan.encode("ascii") + b"unknown_tweak=install\n")
            check(run() != 0, "the car's own plan check refuses a plan with an unknown key")
    check(not stickflow.has_changes({}) and not stickflow.has_changes({"meters": "keep"}), "only Leave as-is is no change")
    check(stickflow.has_changes({"meters": "remove"}), "a removal is a change")


def test_options():
    check(stickflow.enabled_options("available", False, False) == set(), "nothing can be picked before a check")
    check(stickflow.enabled_options("available", True, False) == {"install"}, "after a check the car's state decides")
    check(stickflow.enabled_options("blocked", True, False) == set(), "a blocked tweak stays blocked")
    check(stickflow.enabled_options("blocked", True, True) == {"install", "remove"}, "the advanced option allows everything")
    check(stickflow.enabled_options("not checked", False, True) == {"install", "remove"}, "the advanced option works without a check")


def test_review_text():
    lines = stickflow.change_lines({"trim_pandora": "install", "warning": "remove", "touchtune": "keep"})
    check(lines == [("Stop at boot", "Pandora"), ("Show it again", "Startup warning")], "the review uses the labels the user saw")
    check(stickflow.change_lines({"meters": "install"}, {"meters": "installed"}) == [("Update", "Meters")], "an installed Meters is an update")
    check(stickflow.change_lines({}) == [], "no choices give an empty review")


def test_dependencies():
    note = stickflow.dependency_notes({"aa_touch": "install"})
    check(len(note) == 1 and "Touch while driving" in note[0], "Android Auto touch without TouchTune is explained")
    check(not stickflow.dependency_notes({"aa_touch": "install", "touchtune": "install"}), "no note when TouchTune is chosen too")
    check(not stickflow.dependency_notes({"aa_touch": "install"}, {"touchtune": "installed"}), "no note when TouchTune is on the car")
    choices = {"menu": "install"}
    check("None are stopped" in stickflow.dependency_notes(choices)[0], "hiding nothing is explained")
    check(not stickflow.dependency_notes({**choices, "trim_aha": "install"}), "no note when a source is being stopped")
    check(not stickflow.dependency_notes(choices, {"trim_aha": "installed"}), "no note when a source is already stopped")
    check(stickflow.dependency_notes({**choices, "trim_aha": "remove"}, {"trim_aha": "installed"}) != [], "a source being restarted does not count")


def test_check_wording():
    summary = stickflow.check_summary({"overall": "supported", "gates": []})
    check(summary["kind"] == "ok" and "sha" not in summary["body"].lower(), "a good result is plain English")
    failed = {"overall": "not supported", "gates": [{"name": "firmware", "ok": False, "detail": "x"}, {"name": "x", "ok": True, "detail": ""}]}
    summary = stickflow.check_summary(failed)
    check(summary["kind"] == "bad" and summary["reasons"] == [stickflow.GATE_TEXT["firmware"]], "only the failed checks are named")
    check(stickflow.check_summary({"overall": "incomplete", "gates": []})["kind"] == "warn", "an incomplete check asks for FULL")
    lines = stickflow.component_lines({"components": {"meters": {"state": "installed", "detail": "d"}}})
    check(len(lines) == len(stickflow.KEYS) and ("meters", "Meters", "installed", "d") in lines, "every tweak has a line, also when missing")
    check(all(state in stickflow.STATE_TEXT for state in ("available", "installed", "partial", "blocked", "not checked")), "every state has words")


def test_blockers():
    block = stickflow.blocker
    check("Plug in" in block("prepare", None, False, False, False), "no stick stops step 1")
    check("cannot be used" in block("prepare", BAD, False, False, False), "an unsuitable stick stops step 1")
    check(block("prepare", GOOD, False, False, False) is None, "a good stick passes step 1")
    check("check results" in block("check", GOOD, False, False, False), "no check stops step 2")
    check(block("check", GOOD, True, False, False) is None and block("check", GOOD, False, True, False) is None, "a check or the bypass passes step 2")
    check("at least one" in block("choose", GOOD, True, False, False), "no change stops step 3")
    check(block("choose", GOOD, True, False, True) is None, "a change passes step 3")
    check("check results" in block("choose", GOOD, False, False, False), "locked tweaks point back to the check")
    check("Check your car" in block("review", GOOD, False, False, True), "writing needs a check")
    check(block("review", GOOD, False, True, True) is None, "or the explicit bypass")
    check("cannot be used" in block("review", BAD, True, False, True), "the stick is checked again before writing")
    # Custom menu travels with Meters and is not a plan key (the car rejects plans with unknown keys).
    reason = stickflow.home_reason
    check(stickflow.HOME_KEY not in stickflow.KEYS and stickflow.HOME_KEY not in stickflow.make_plan({}),
          "Custom menu is not in the plan")
    check(reason("keep", "keep", False) is None, "Custom menu left as-is needs nothing")
    check("Meters" in reason("install", "keep", True) and "Meters" in reason("remove", "remove", True),
          "Custom menu Install or Mazda's Home needs Meters set to Install")
    check("Choose the menu" in reason("install", "install", False), "Install needs a chosen menu")
    check(reason("install", "install", True) is None and reason("remove", "install", False) is None, "otherwise it can be built")
    check("Meters" in block("choose", GOOD, True, False, False, home=reason("install", "keep", True)),
          "the Custom menu reason stops step 3")
    check("Meters" in block("review", GOOD, True, False, True, home=reason("install", "keep", True)),
          "and the writing")
    check("Plug in" in block("review", None, True, False, True, home="x"), "a missing stick is still named first")
    check(stickflow.done_steps(GOOD, True, True, False) == {"prepare", "check", "choose"}, "finished steps are marked")
    check(stickflow.done_steps(BAD, False, False, False) == set(), "an unsuitable stick is not a finished step")


def test_format_help():
    check("Master Boot Record" in stickflow.format_help("darwin"), "macOS help names the MBR scheme")
    check("MBR" in stickflow.format_help("linux"), "Linux help names MBR")
    check("FAT32" in stickflow.format_help("win32") and "Disk Management" in stickflow.format_help("win32"), "Windows help covers large or GPT sticks")
    check(all("deletes everything" in stickflow.format_help(p) for p in ("darwin", "linux", "win32")), "the help warns that formatting erases the stick")


def finished(jobs: stickflow.JobRunner) -> bool:
    for _ in range(500):
        if jobs.poll():
            return True
        time.sleep(0.01)
    return False


def fails_like_the_builders():
    raise SystemExit("ERROR: from a worker")


def test_jobs():
    got = []
    jobs = stickflow.JobRunner()
    jobs.start(lambda: 41 + 1, lambda result, error: got.append((result, error)))
    check(jobs.busy, "a job in progress is reported")
    try:
        jobs.start(lambda: None, lambda *_a: None)
        check(False, "a second job is refused while one runs")
    except RuntimeError:
        check(True, "a second job is refused while one runs")
    check(finished(jobs) and got == [(42, None)] and not jobs.busy, "the result comes back on poll")
    jobs.start(fails_like_the_builders, lambda result, error: got.append((result, error)))
    check(finished(jobs) and isinstance(got[-1][1], SystemExit), "SystemExit in the worker reaches the window instead of hanging it")

    def stick_error():
        raise StickError("nope")
    jobs.start(stick_error, lambda result, error: got.append((result, error)))
    check(finished(jobs) and isinstance(got[-1][1], StickError), "a StickError reaches the window")
    check(not jobs.poll(), "nothing to deliver when no job finished")


def test_car_line():
    profile = {"label": "ND1 2.0 manual (US)", "rpm": {"red": 7200}}
    check(stickflow.car_line(profile) == "Car: ND1 2.0 manual (US) · red from 7200 rpm", "the car line names the car and its red line")
    check(stickflow.car_line(None) == "Car: default ND1 1.5 · set your car in the designer (Project → Car setup)",
          "without a car the line says what the car does and where to set it")
    check(stickflow.car_line({"label": "X"}) == "Car: X", "a profile without a red line still shows its name")
    check(not stickflow.car_changed(None, None) and not stickflow.car_changed(profile, dict(profile)), "the same car is no change")
    check(stickflow.car_changed(profile, None) and stickflow.car_changed(None, profile)
          and stickflow.car_changed(profile, {**profile, "rpm": {"red": 7000}}), "another car, or none, is a change")
    note = stickflow.car_update_note(profile, None, "keep")
    check(note is not None and "Meters to Install" in note and "REPAIR" in note, "a changed car asks for a Meters update")
    check(stickflow.car_update_note(profile, None, "install") is None, "with Meters set to Install no note is needed")
    check(stickflow.car_update_note(profile, dict(profile), "keep") is None, "an unchanged car asks for nothing")


def main():
    test_plan()
    test_car_line()
    test_options()
    test_review_text()
    test_dependencies()
    test_check_wording()
    test_blockers()
    test_format_help()
    test_jobs()
    print()
    print(f"{len(FAILURES)} failure(s)" if FAILURES else "All tests passed.")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()

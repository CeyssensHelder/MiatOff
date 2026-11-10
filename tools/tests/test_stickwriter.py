#!/usr/bin/env python3
"""Tests for tools/stickwriter.py on temporary folders. No real drive, fabricated kits and data.

    python tools/tests/test_stickwriter.py

SPDX-License-Identifier: GPL-3.0-or-later
"""
import errno
import hashlib
import os
from pathlib import Path
import shutil
import sys
import tempfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import kits  # noqa: E402
import stickkit  # noqa: E402
from stickkit import MANIFEST, PLAN_NAME, TRIGGER, StickError, long_path  # noqa: E402
import stickwriter  # noqa: E402

FAILURES = []
PLAN = "# plan\nmeters=install\n"
LOG = "miatoff-aa-touch.log"
DUMP_FILE = "miatoff-dumps/001-full/SUMMARY.txt"


def check(ok: bool, name: str):
    print(("PASS  " if ok else "FAIL  ") + name)
    if not ok:
        FAILURES.append(name)


def check_kit(version=b"1") -> stickkit.Kit:
    return stickkit.Kit("MIATOFF.ID", stickwriter.KNOWN_KITS["MIATOFF.ID"].id_bytes, "dump.sh", b"#!/bin/sh\n# dump " + version + b"\n")


def install_kit(version=b"1") -> stickkit.Kit:
    return stickkit.Kit("AATOUCH.ID", stickwriter.KNOWN_KITS["AATOUCH.ID"].id_bytes, "aa-touch.sh", b"#!/bin/sh\n# install " + version + b"\n", extra={
        "LICENSE": b"license\n", "NOTICE": b"notice\n", "touchtune/install-patches.sh": b"tt " + version,
        "oem-aa-mod/libpatch.conf": b"conf", "miatoff-app/app/index.html": b"<html>" + version,
        "miatoff-app/MANIFEST": b"m" + version, "images/safety/a.png": b"png" + version, "images/sensors/x/b.png": b"png2"})


class Crash(BaseException):
    """A power cut: nothing gets to clean up."""


def tree(stick: Path) -> dict:
    out = {}
    for folder, _directories, names in os.walk(long_path(stick)):
        for name in names:
            path = os.path.join(folder, name)
            out[os.path.relpath(path, long_path(stick)).replace("\\", "/")] = hashlib.sha256(open(path, "rb").read()).hexdigest()
    return out


def launchers(stick: Path) -> list:
    return [n for n in os.listdir(long_path(stick)) if n.lower().endswith(".up")]


def add(stick: Path, name: str, data: bytes = b"data"):
    path = stick / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def with_stick(test):
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
        stick = Path(folder) / "stick"
        stick.mkdir()
        test(stick)


def refused(stick: Path, kit, text: str, name: str):
    before = tree(stick)
    try:
        kit.build(stick)
        check(False, name)
    except StickError as error:
        check(text in str(error) and tree(stick) == before, name)


def test_known_kits_match_the_real_ones():
    for kit in (kits.dump_kit(), kits.install_kit()):
        known = stickwriter.KNOWN_KITS[kit.id_name]
        check(known.id_bytes == kit.id_bytes, f"{kit.id_name}: the hard-coded ID matches the kit")
        check(stickwriter.LAUNCHER_PATTERN.match(kit.launcher_name()) is not None, f"{kit.id_name}: its launcher is recognised")
        payload = kit.payload()
        for name in payload:
            if "/" in name:
                check(name.split("/")[0] in known.folders, f"{kit.id_name}: {name[:40]} is in a known folder")
            elif name not in (kit.id_name, kit.script, TRIGGER, MANIFEST, kit.launcher_name()):
                check(name in known.root_files, f"{kit.id_name}: {name} is a known root file")
        check(kit.script in known.root_files, f"{kit.id_name}: its script is a known root file")


def test_fresh_stick():
    def run(stick):
        order, stages = [], []
        real = os.replace

        def spy(source, destination):
            order.append(os.path.basename(destination))
            real(source, destination)
        kit = install_kit()
        with patch.object(stickwriter.os, "replace", spy):
            kit.build(stick, plan=PLAN, progress=lambda _label, stage: stages.append(stage))
        check(kit.check(stick), "a fresh stick verifies")
        check(order[-1] == kit.launcher_name(), "the launcher is published last")
        check(order.index(PLAN_NAME) < order.index(TRIGGER) and order.index(MANIFEST) < order.index(PLAN_NAME), "the manifest and plan come before the trigger")
        check(stages == [key for key, _label in stickwriter.STAGES], "every stage is reported, in order")
        check((stick / PLAN_NAME).read_bytes() == PLAN.encode("ascii"), "the plan is written byte for byte")
        check(not [n for n in tree(stick) if n.endswith(stickwriter.TEMP_SUFFIX)], "no temporary files stay behind")
    with_stick(run)


def test_real_kits_convert_both_ways():
    def run(stick):
        check_real, install_real = kits.dump_kit(), kits.install_kit()
        add(stick, DUMP_FILE, b"results")
        add(stick, "miatoff-dump.log", b"log")
        check_real.build(stick)
        check(stickwriter.replaces(stick, install_real.id_name) == "check", "the check stick is announced before converting")
        install_real.build(stick, plan=PLAN)
        check(install_real.check(stick) and (stick / PLAN_NAME).exists(), "real kits: check stick becomes install stick")
        check(not (stick / "dump.sh").exists() and not (stick / "MIATOFF.ID").exists(), "real kits: the check files are gone")
        check((stick / DUMP_FILE).read_bytes() == b"results" and (stick / "miatoff-dump.log").exists(), "real kits: results and logs stay")
        check_real.build(stick)
        check(check_real.check(stick), "real kits: install stick becomes check stick")
        check(not (stick / PLAN_NAME).exists(), "real kits: the old plan is gone from a check stick")
        check(not (stick / "touchtune").exists() and not (stick / "images").exists() and not (stick / "aa-touch.sh").exists(), "real kits: the install files are gone")
        check((stick / DUMP_FILE).read_bytes() == b"results", "real kits: results survive the way back")
        install_real.build(stick, plan=PLAN)
        check(install_real.check(stick), "real kits: and back again")
    with_stick(run)


def test_conversion_keeps_what_is_not_ours():
    def run(stick):
        install_kit().build(stick, plan=PLAN)
        add(stick, LOG, b"log")
        add(stick, "aa-touch-state.txt", b"state")
        add(stick, "images/holiday.jpg", b"mine")
        add(stick, "touchtune/touchtune.log", b"log")
        add(stick, "music/song.mp3", b"song")
        tampered = stick / "oem-aa-mod/libpatch.conf"
        tampered.write_bytes(b"changed by someone")
        kit = check_kit()
        kit.build(stick)
        check(kit.check(stick), "converting with unrelated files verifies")
        for name in (LOG, "aa-touch-state.txt", "images/holiday.jpg", "touchtune/touchtune.log", "music/song.mp3"):
            check((stick / name).exists(), f"kept: {name}")
        check(tampered.read_bytes() == b"changed by someone", "a file the manifest does not vouch for is not deleted")
        check(not (stick / "images/safety").exists() and not (stick / "miatoff-app").exists(), "MiatOff's own folders are gone")
    with_stick(run)


def test_older_version():
    def run(stick):
        old, new = install_kit(b"old"), install_kit(b"new")
        old.build(stick, plan=PLAN)
        new.build(stick, plan=PLAN)
        check(new.check(stick) and len(launchers(stick)) == 1, "a stick from an older version is updated")
    with_stick(run)

    def launcher_of_another_version(stick):
        check_kit().build(stick)
        name = launchers(stick)[0]
        os.rename(long_path(stick / name), long_path(stick / name.replace("[ $1 = 1106601714 ]", "[ $1 = 123 ]")))
        kit = install_kit()
        kit.build(stick)
        check(kit.check(stick) and len(launchers(stick)) == 1, "a launcher with another checksum is still recognised")
    with_stick(launcher_of_another_version)


def test_refusals():
    def foreign_up(stick):
        add(stick, "other.up")
        refused(stick, install_kit(), "not from MiatOff", "another launcher is refused and nothing changes")
    with_stick(foreign_up)

    def touchtune(stick):
        add(stick, "TOUCHTUNE.ID")
        refused(stick, install_kit(), "not from MiatOff", "a TouchTune stick is refused")
    with_stick(touchtune)

    def script(stick):
        add(stick, "install-patches.sh")
        refused(stick, install_kit(), "not from MiatOff", "a foreign marker file is refused")
    with_stick(script)

    def fake_id(stick):
        add(stick, "MIATOFF.ID", b"something else\n")
        refused(stick, install_kit(), "not from MiatOff", "an ID file with the right name and wrong content is refused")
    with_stick(fake_id)

    def unknown_file(stick):
        add(stick, "LICENSE", b"the user's own")
        refused(stick, install_kit(), "LICENSE", "an unknown file on a path we would write is refused")
    with_stick(unknown_file)

    def corrupt(stick):
        kit = install_kit()
        kit.build(stick)
        (stick / "oem-aa-mod/libpatch.conf").write_bytes(b"corrupted")
        refused(stick, install_kit(b"2"), "libpatch.conf", "a corrupted file is not silently overwritten")
    with_stick(corrupt)

    def forged_manifest(stick):
        add(stick, "NOTICE", b"the user's own")
        digest = hashlib.sha256(b"the user's own").hexdigest()
        add(stick, MANIFEST, f"{digest}  NOTICE\n".encode())
        refused(stick, install_kit(), "NOTICE", "a manifest alone, without a real ID file, vouches for nothing")
    with_stick(forged_manifest)

    def directory(stick):
        (stick / "NOTICE").mkdir()
        refused(stick, install_kit(), "NOTICE", "a folder on a path we would write is refused")
    with_stick(directory)

    def restore(stick):
        check_kit().build(stick)
        add(stick, "MIATOFF-RESTORE", b"")
        refused(stick, install_kit(), "MIATOFF-RESTORE", "the emergency marker blocks writing and stays")
        check(stickwriter.stick_issue(stick) is not None and "MIATOFF-RESTORE" in stickwriter.stick_issue(stick), "the marker is explained up front")
    with_stick(restore)

    def lower_case_restore(stick):
        add(stick, "miatoff-restore", b"")
        refused(stick, install_kit(), "MIATOFF-RESTORE", "the marker is found in any case: FAT does not care")
    with_stick(lower_case_restore)

    def full(stick):
        usage = shutil.disk_usage(stick)
        with patch.object(stickwriter.shutil, "disk_usage", return_value=usage._replace(free=1000)):
            refused(stick, install_kit(), "too full", "too little space is refused before anything changes")
    with_stick(full)

    def clean(stick):
        check(stickwriter.stick_issue(stick) is None, "an empty stick has no issue")
    with_stick(clean)


def test_manifest_cannot_delete_elsewhere():
    def run(stick):
        outside = stick.parent / "outside.txt"
        outside.write_bytes(b"precious")
        add(stick, "MIATOFF.ID", stickwriter.KNOWN_KITS["MIATOFF.ID"].id_bytes)
        add(stick, "music/song.mp3", b"song")
        add(stick, "keep.txt", b"keep")
        digest = lambda data: hashlib.sha256(data).hexdigest()
        lines = [f"{digest(b'precious')}  ../outside.txt", f"{digest(b'song')}  music/song.mp3", f"{digest(b'keep')}  keep.txt"]
        add(stick, MANIFEST, ("\n".join(lines) + "\n").encode())
        install_kit().build(stick)
        check(outside.read_bytes() == b"precious", "a manifest cannot reach outside the stick")
        check((stick / "music/song.mp3").exists() and (stick / "keep.txt").exists(), "a manifest cannot name files outside the kit's list")
    with_stick(run)

    def traversal(stick):
        (stick / "images").mkdir()
        outside = stick / "music.txt"
        outside.write_bytes(b"song")
        add(stick, "AATOUCH.ID", stickwriter.KNOWN_KITS["AATOUCH.ID"].id_bytes)
        add(stick, MANIFEST, (hashlib.sha256(b"song").hexdigest() + "  images/../music.txt\n").encode())
        check_kit().build(stick)
        check(outside.exists(), "dot-dot inside a known folder is refused")
    with_stick(traversal)


def test_sidecars():
    def run(stick):
        kit = check_kit()
        kit.build(stick)
        add(stick, "._MIATOFF.ID", b"attrs")
        add(stick, "._" + kit.launcher_name()[:200] + ".up", b"attrs")
        add(stick, "._photo.jpg", b"attrs")
        check(kit.verify(stick) == [], "macOS attribute files are not conflicts")
        install_kit().build(stick)
        names = os.listdir(long_path(stick))
        check(not [n for n in names if n.startswith("._") and n.endswith((".up", ".ID"))], "attribute files next to the launcher are removed")
        check("._photo.jpg" in names, "other attribute files are left alone")
    with_stick(run)


def failing(name, stage_error):
    """Fail at every stage with an error the writer can report: the stick must end up inactive and be repairable."""
    def run(stick):
        add(stick, DUMP_FILE, b"results")
        before = check_kit()
        before.build(stick)
        target = install_kit()

        def progress(_label, stage):
            if stage == name:
                raise stage_error
        try:
            target.build(stick, plan=PLAN, progress=progress)
            check(False, f"{name}: the failure is reported")
        except StickError as error:
            check(("Nothing was changed" if name == "inspect" else "switched off") in str(error), f"{name}: the failure says the stick is safe")
        check(not launchers(stick) or before.check(stick), f"{name}: a launcher is only live on a complete stick")
        target.build(stick, plan=PLAN)
        check(target.check(stick) and (stick / DUMP_FILE).exists(), f"{name}: trying again finishes the job")
    with_stick(run)


def test_stage_failures():
    for name, _label in stickwriter.STAGES:
        failing(name, OSError(errno.EIO, "I/O error"))

    def full_disk(stick):
        real = stickwriter._write_file

        def write(target, name, data):
            if name == "NOTICE":
                raise OSError(errno.ENOSPC, "No space left")
            real(target, name, data)
        with patch.object(stickwriter, "_write_file", write):
            try:
                install_kit().build(stick)
                check(False, "a full stick is reported")
            except StickError as error:
                check("full" in str(error) and not launchers(stick), "a stick that fills up mid-write is reported and inactive")
    with_stick(full_disk)

    def bad_readback(stick):
        kit = install_kit()
        real = stickwriter._same

        def same(target, name, data):
            return False if name == kit.script else real(target, name, data)
        with patch.object(stickwriter, "_same", same):
            try:
                kit.build(stick)
                check(False, "a bad read-back is reported")
            except StickError as error:
                check("read-back" in str(error) and not launchers(stick), "a bad read-back leaves the stick inactive")
    with_stick(bad_readback)


def power_cut(start, make_first, make_second, retry_first):
    """Cut the power at every file operation in turn. Nothing may be live half-way, and a retry must finish."""
    cuts = 0
    while True:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
            stick = Path(folder) / "stick"
            stick.mkdir()
            add(stick, DUMP_FILE, b"results")
            first = make_first()
            if start:
                start().build(stick)
            count = {"n": 0}
            real_replace, real_remove = os.replace, os.remove

            def tick():
                count["n"] += 1
                if count["n"] == cuts + 1:
                    raise Crash()

            def replace(source, destination):
                tick()
                real_replace(source, destination)

            def remove(path):
                tick()
                real_remove(path)
            finished = False
            with patch.object(stickwriter.os, "replace", replace), patch.object(stickwriter.os, "remove", remove):
                try:
                    first.build(stick, plan=PLAN)
                    finished = True
                except Crash:
                    pass
            if finished:
                return cuts
            live = launchers(stick)
            complete = [kit for kit in ([first, start()] if start else [first]) if kit.verify(stick) == []]
            if live and not complete:
                check(False, f"after cut {cuts}: a live launcher means a complete stick, the new one or the untouched old one")
            again = make_second() if not retry_first else first
            try:
                again.build(stick, plan=PLAN)
                if not again.check(stick) or not (stick / DUMP_FILE).exists():
                    check(False, f"after cut {cuts}: retry did not finish")
            except StickError as error:
                check(False, f"after cut {cuts}: retry refused: {str(error)[:70]}")
            cuts += 1


def test_power_cuts():
    cuts = power_cut(None, install_kit, install_kit, True)
    check(cuts > 10, f"power cut on a fresh stick: retry works from all {cuts} cut points")
    cuts = power_cut(check_kit, install_kit, install_kit, True)
    check(cuts > 10, f"power cut while converting to install: retry works from all {cuts} cut points")
    cuts = power_cut(install_kit, check_kit, check_kit, True)
    check(cuts > 10, f"power cut while converting to check: retry works from all {cuts} cut points")
    cuts = power_cut(lambda: install_kit(b"old"), lambda: install_kit(b"new"), lambda: install_kit(b"new"), True)
    check(cuts > 10, f"power cut while updating an older stick: retry works from all {cuts} cut points")
    cuts = power_cut(check_kit, install_kit, check_kit, False)
    check(cuts > 10, f"power cut, then the other stick type: works from all {cuts} cut points")


def test_partial_temporary_file_is_cleaned():
    def run(stick):
        add(stick, "NOTICE" + stickwriter.TEMP_SUFFIX, b"half a fi")
        add(stick, "touchtune/x.sh" + stickwriter.TEMP_SUFFIX, b"half")
        add(stick, "0123456789abcdef" + stickwriter.TEMP_SUFFIX, b"half")
        add(stick, "miatoff-dumps/keep" + stickwriter.TEMP_SUFFIX, b"not ours to judge")
        kit = install_kit()
        kit.build(stick)
        left = [n for n in tree(stick) if n.endswith(stickwriter.TEMP_SUFFIX)]
        check(left == ["miatoff-dumps/keep" + stickwriter.TEMP_SUFFIX], "temporary files of a cut-off write are cleaned, results are not looked at")
        check(kit.check(stick), "and the stick still verifies")
    with_stick(run)


def main():
    test_known_kits_match_the_real_ones()
    test_fresh_stick()
    test_real_kits_convert_both_ways()
    test_conversion_keeps_what_is_not_ours()
    test_older_version()
    test_refusals()
    test_manifest_cannot_delete_elsewhere()
    test_sidecars()
    test_stage_failures()
    test_power_cuts()
    test_partial_temporary_file_is_cleaned()
    print()
    print(f"{len(FAILURES)} failure(s)" if FAILURES else "All tests passed.")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()

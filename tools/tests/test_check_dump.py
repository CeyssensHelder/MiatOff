#!/usr/bin/env python3
"""Tests for tools/check_dump.py on fabricated dumps (and the real ones when present).

    python tools/tests/test_check_dump.py

SPDX-License-Identifier: GPL-3.0-or-later
"""
from pathlib import Path
import hashlib
import shutil
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import check_dump as cd  # noqa: E402

FAILURES = []


def check(ok: bool, name: str):
    print(("PASS  " if ok else "FAIL  ") + name)
    if not ok:
        FAILURES.append(name)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# Fabricated "files" with known content; the pinned table is built from them.
FILES = {
    "common_stock": b"common stock", "common_patched": b"common patched",
    "sys_stock": b"sys stock", "sys_patched": b"sys patched",
    "xml_stock": b"xml stock", "xml_patched": b"xml patched",
    "ucp_stock": b"ucp stock", "ucp_patched": b"ucp patched",
    "opera_stock": b"opera stock", "opera_patched": b"opera patched",
    "gap2_stock": b"gap2 stock", "gap2_patched": b"gap2 patched",
    "sm_stock": b"sm stock", "sm_patched": b"sm patched", "sm_trim": b"sm trim", "sm_aa_trim": b"sm aa trim",
    "sm_trim_aha": b"sm trim aha", "sm_aa_trim_aha": b"sm aa trim aha", "sm_custom": b"sm custom",
    "wcp_stock": b"wcp stock", "wcp_aa_trim": b"wcp aa trim", "wcp_other": b"other wcp",
    "blm": b"blm", "aap": b"aap",
    "list_stock": b"list stock", "list_patched": b"list patched",
}
SAFETY = {f"SafetyText_{i}.png": b"stock image %d" % i for i in range(3)}
BLANK = b"blank image"
PIN = {"FW_WANTED": "74.00.324A", "BLM_SHA256": sha(FILES["blm"]), "AAP_SHA256": sha(FILES["aap"])}
for pin_name, key in (("COMMON_STOCK", "common_stock"), ("COMMON_PATCHED", "common_patched"),
                      ("SYS_STOCK", "sys_stock"), ("SYS_PATCHED", "sys_patched"),
                      ("XML_STOCK", "xml_stock"), ("XML_PATCHED", "xml_patched"),
                      ("UCP_STOCK", "ucp_stock"), ("UCP_PATCHED", "ucp_patched"),
                      ("OPERA_STOCK", "opera_stock"), ("OPERA_PATCHED", "opera_patched"),
                      ("GAP2_STOCK", "gap2_stock"), ("GAP2_PATCHED", "gap2_patched"),
                      ("SM_STOCK", "sm_stock"), ("SM_PATCHED", "sm_patched"),
                      ("LIST_STOCK", "list_stock"), ("LIST_PATCHED", "list_patched")):
    PIN[pin_name] = sha(FILES[key])
# 0f = the four groups, 0v = all five, 05 = DVD/TV + Pandora only
PIN["SM_TABLE"] = "\n".join(f"{code} {sha(FILES[key])}" for code, key in (
    ("00", "sm_stock"), ("10", "sm_patched"), ("0f", "sm_trim"), ("1f", "sm_aa_trim"),
    ("0v", "sm_trim_aha"), ("1v", "sm_aa_trim_aha"), ("05", "sm_custom")))
# sm_WCP.conf (wireless CarPlay): its own table
PIN["SM_WCP_TABLE"] = "\n".join(f"{code} {sha(FILES[key])}" for code, key in (
    ("00", "wcp_stock"), ("1f", "wcp_aa_trim")))

PIN["SAFETY_TABLE"] = "\n".join(f"{name} {sha(data)} {sha(BLANK)}" for name, data in SAFETY.items())

PATHS = {"/jci/gui/common/js/Common.js": "common", "/jci/gui/apps/system/js/systemApp.js": "sys",
         "/etc/aap_system_attributes.xml": "xml", "/etc/aap_system_attributes_UCP.xml": "ucp",
         "/jci/opera/opera_home/opera.ini": "opera", "/jci/scripts/stage_gap2.sh": "gap2", "/jci/sm/sm.conf": "sm",
         "/jci/sm/sm_WCP.conf": "wcp", "/jci/gui/common/controls/List2/js/List2Ctrl.js": "list"}


def make_dump(base: Path, name="001-full-up10s", mode="full", state="stock", sm="sm_stock", wcp="wcp_stock", fw="74.00.324A",
              active="/jci/sm/sm.conf", persist="rw", tools="md5=md5sum sha256=openssl", preload="", images=None,
              **override) -> Path:
    d = base / name
    (d / "runtime").mkdir(parents=True)
    (d / "SUMMARY.txt").write_text(f"MiatOff dump 1.3.0\nmode:             {mode}\nfirmware:         {fw}\n"
                                   f"hash tools:       {tools}\n", encoding="utf-8")
    (d / "runtime/ps.txt").write_text(f"  252 cmu  0:02 {{[SM]MainThread}} /jci/sm/sm -f {active} -e /tmp/e\n")
    (d / "runtime/proc-mounts.txt").write_text(f"/dev/x /tmp/mnt/data_persist relfs {persist},noatime 0 0\n")
    (d / "runtime/ld_preload.tsv").write_text(preload)
    (d / "runtime/data_persist-ls.txt").write_text("")
    if mode != "full":
        return d
    rows = ["path\tsize\tmode uid gid\tcksum\tmd5\tsha256"]
    for unit_path, key in PATHS.items():
        content = FILES[sm] if key == "sm" else FILES[wcp] if key == "wcp" else FILES[f"{key}_{state}"]
        content = override.get(key, content)
        target = d / "static/files" / unit_path.lstrip("/")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    # images: name -> bytes for the SafetyText images (default: stock, or all blank when everything is patched)
    images = images if images is not None else {n: (BLANK if state == "patched" else d) for n, d in SAFETY.items()}
    for name, data in images.items():
        target = d / "static/files/jci/nativegui/images" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    for unit_path, content in (("/jci/aapa/blmjciaapa.so", FILES["blm"]), ("/usr/bin/aap_service", FILES["aap"])):
        rows.append(f"{unit_path}\t1\t755 1000 1000\t1:1\tx\t{sha(override.get(unit_path, content))}")
    (d / "inventory").mkdir()
    (d / "inventory/key-files.tsv").write_text("\n".join(rows) + "\n")
    return d


def verdict(d, pin=PIN):
    return cd.check(d, pinned=pin)


def states(v):
    return {k: c["state"] for k, c in v["components"].items()}


def main():
    base = Path(tempfile.mkdtemp(prefix="mo-check-"))
    try:
        v = verdict(make_dump(base / "a"))
        check(v["overall"] == "supported" and all(s == "available" for s in states(v).values()),
              "stock unit: supported, everything available")

        v = verdict(make_dump(base / "b", state="patched", sm="sm_aa_trim_aha"))
        check(set(states(v).values()) == {"installed"} and v["overall"] == "supported",
              "everything installed is recognised")
        check(states(v)["trim_aha"] == "installed" and states(v)["trim_stitcher"] == "installed", "all five trims are installed at level v")

        v = verdict(make_dump(base / "c", sm="sm_trim"))
        check(states(v)["trim_dvdtv"] == "installed" and states(v)["trim_aha"] == "available"
              and states(v)["aa_touch"] == "available", "level f: four trims installed, Aha not, AA stock")

        v = verdict(make_dump(base / "c2", sm="sm_custom"))
        check({k: s for k, s in states(v).items() if k.startswith("trim_")} ==
              {"trim_dvdtv": "installed", "trim_sirius": "available", "trim_pandora": "installed",
               "trim_stitcher": "available", "trim_aha": "available"}, "a custom mix shows each trim on its own")

        v = verdict(make_dump(base / "d", **{"xml": FILES["xml_patched"]}))
        check(states(v)["aa_touch"] == "partial", "one patched AAP XML is reported as partial")

        v = verdict(make_dump(base / "e", **{"sys": b"something else"}))
        check(states(v)["warning"] == "blocked" and v["overall"] == "supported",
              "an unknown systemApp.js blocks only the warning")

        v = verdict(make_dump(base / "f", **{"/usr/bin/aap_service": b"other build"}))
        check(v["overall"] == "not supported" and all(s in ("blocked", "installed") for s in states(v).values()),
              "an unknown Android Auto build blocks everything that could be installed")

        for label, kwargs in (("firmware 74.00.331", {"fw": "74.00.331"}),
                              ("an unknown SM config active", {"active": "/jci/sm/smtestmode.conf"}),
                              ("data_persist read-only", {"persist": "ro"}),
                              ("no sha256 tool", {"tools": "md5=md5sum sha256=none"}),
                              ("foreign LD_PRELOAD", {"preload": "9\tL_x\tLD_PRELOAD=/tmp/evil.so\n"})):
            v = verdict(make_dump(base / label.replace(" ", "_"), **kwargs))
            check(v["overall"] == "not supported", f"{label}: not supported")

        # Wireless CarPlay: the Service Manager runs sm_WCP.conf, so that file decides.
        wcp = "/jci/sm/sm_WCP.conf"
        v = verdict(make_dump(base / "wcp", active=wcp))
        check(v["overall"] == "supported" and set(states(v).values()) == {"available"},
              "sm_WCP.conf active and stock: supported, everything available")
        v = verdict(make_dump(base / "wcp2", active=wcp, state="patched", wcp="wcp_aa_trim"))
        check(states(v)["aa_touch"] == "installed" and states(v)["trim_stitcher"] == "installed"
              and states(v)["trim_aha"] == "available", "sm_WCP.conf variant 1f: AA touch and four trims installed")
        v = verdict(make_dump(base / "wcp3", active=wcp, sm="sm_aa_trim_aha"))
        check(states(v)["aa_touch"] == "available" and states(v)["trim_aha"] == "available",
              "with sm_WCP.conf active, edits in the unused sm.conf are ignored")
        v = verdict(make_dump(base / "wcp4", active=wcp, wcp="wcp_other"))
        check(states(v)["aa_touch"] == "blocked" and states(v)["trim_dvdtv"] == "blocked"
              and states(v)["warning"] == "available" and "sm_WCP.conf" in v["components"]["aa_touch"]["detail"],
              "an unknown sm_WCP.conf blocks only AA touch and the boot trim")

        names = list(SAFETY)
        v = verdict(make_dump(base / "img1", images={names[0]: BLANK, names[1]: SAFETY[names[1]], names[2]: SAFETY[names[2]]}))
        check(states(v)["safety"] == "partial", "camera text: a mix of blank and stock is partial")
        v = verdict(make_dump(base / "img2", images={**SAFETY, names[1]: b"other"}))
        check(states(v)["safety"] == "blocked" and v["overall"] == "supported", "camera text: an unknown image blocks only it")
        v = verdict(make_dump(base / "img3", images={}))
        check(states(v)["safety"] == "not checked" and v["overall"] == "incomplete",
              "camera text: a dump without the images (before 1.4.0) is incomplete, not guessed")
        v = verdict(make_dump(base / "list", **{"list": b"other"}))
        check(states(v)["delay"] == "blocked" and states(v)["warning"] == "available", "an unknown List2Ctrl.js blocks only the delay")

        v = verdict(make_dump(base / "ours", preload="3492\tL_jciAAPA\tLD_PRELOAD=" + cd.OURS_PRELOAD + "\n",
                              state="patched", sm="sm_aa_trim"))
        check(v["overall"] == "supported", "our own LD_PRELOAD is not foreign")

        v = verdict(make_dump(base / "snap", mode="snapshot"))
        check(v["overall"] == "incomplete" and set(states(v).values()) == {"not checked"},
              "a snapshot dump is incomplete, nothing is guessed")

        # deterministic: same input, same text; the fingerprint follows the evidence
        d = make_dump(base / "det")
        first, second = cd.format_report(verdict(d)), cd.format_report(verdict(d))
        check(first == second, "the same dump gives the same report")
        check(cd.format_report(verdict(make_dump(base / "det2"))) == first,
              "an identical copy gives an identical report")
        other = make_dump(base / "det3", **{"sys": FILES["sys_patched"]})
        check(verdict(other)["fingerprint"] != verdict(d)["fingerprint"], "different evidence, different fingerprint")

        # newest dump is chosen by number, not by name order or time
        stick = base / "stick" / "miatoff-dumps"
        for name in ("009-full-up1s", "010-full-up2s", "002-full-up3s"):
            make_dump(stick, name=name)
        check(cd.latest_dump(base / "stick").name == "010-full-up2s", "latest dump is picked by number (010 beats 009)")
        check(cd.latest_dump(base / "nothing") is None, "no dump gives None")
        check(cd.main([str(base / "nothing")]) == 2, "no dump: exit status 2")

        # real dumps, when the private ones are present
        real = ROOT / "dumps" / "eu-74.00.324"
        if (real / "001-full-up174s").is_dir():
            v = cd.check(real / "001-full-up174s")
            check(v["overall"] == "supported" and set(states(v).values()) == {"available"},
                  "real dump 001 (stock unit): everything available")
            a = cd.format_report(cd.check(real / "003-full-up88s-2026-10-27"))
            b = cd.format_report(cd.check(real / "003-full-up88s-2026-10-27"))
            check(a == b and "INSTALLED" in a, "real dump 003: deterministic, shows the installed parts")
        else:
            print("SKIP  real dumps are not present")
    finally:
        shutil.rmtree(base, ignore_errors=True)
    print()
    print(f"{len(FAILURES)} failure(s)" if FAILURES else "All tests passed.")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()

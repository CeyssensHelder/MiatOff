#!/usr/bin/env python3
"""Check a MiatOff dump against the hashes the installer knows.

Reads the newest dump on a stick (or a dump folder), and says per component
whether it can be installed, is installed, or is blocked. It is deterministic:
the verdict depends only on the dump's files and on the hashes pinned in
aa-touch-stick/stick/aa-touch.sh, never on the time, the machine or the order
files are read in. The same dump always gives the same report, and the report
ends with a fingerprint of the evidence it used.

    python tools/check_dump.py E:\\                 newest dump on the stick
    python tools/check_dump.py path/to/NNN-full-...    one dump folder
    python tools/check_dump.py E:\\ --json --write     also CHECK-REPORT.txt in the dump

Exit status: 0 supported, 1 not supported, 2 incomplete or no dump found.

SPDX-License-Identifier: GPL-3.0-or-later
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "aa-touch-stick" / "stick" / "aa-touch.sh"
REPORT_NAME = "CHECK-REPORT.txt"

CFG_ATTRS = "775 1000 1000"          # sm.conf and both AAP XMLs, as aa-touch.sh checks
OURS_PRELOAD = "/data_persist/oem-aa-mod/libpatch-blmjciaapa.so"

# Order the report lists components in.
COMPONENTS = [
    ("touchtune", "Touch while driving (TouchTune)"),
    ("aa_touch", "Touch in Android Auto"),
    ("trim_dvdtv", "Stop DVD and TV at boot"),
    ("trim_sirius", "Stop SiriusXM at boot"),
    ("trim_pandora", "Stop Pandora at boot"),
    ("trim_stitcher", "Stop Stitcher at boot"),
    ("trim_aha", "Stop Aha at boot"),
    ("warning", "Startup warning"),
    ("meters", "Meters"),
]

TRIM_KEYS = ["trim_dvdtv", "trim_sirius", "trim_pandora", "trim_stitcher", "trim_aha"]  # bits 1, 2, 4, 8, 16
TRIM_DIGITS = "0123456789abcdefghijklmnopqrstuv"

# State words used in the report and by the GUI.
AVAILABLE, INSTALLED, PARTIAL, BLOCKED, UNCHECKED = "available", "installed", "partial", "blocked", "not checked"


def pinned_constants(script: Path = SCRIPT) -> dict:
    """NAME -> 64-hex sha256 for every pinned constant, plus FW_WANTED."""
    text = script.read_text(encoding="utf-8")
    found = {m.group(1): m.group(2) for m in re.finditer(r"^([A-Z][A-Z0-9_]*)=([0-9a-f]{64})\b", text, re.M)}
    table = re.search(r"^SM_TABLE='(.*?)'$", text, re.M | re.S)
    if table:
        found["SM_TABLE"] = table.group(1)
    fw = re.search(r"^FW_WANTED=(\S+)", text, re.M)
    if fw:
        found["FW_WANTED"] = fw.group(1)
    return found


def sm_variants(pin: dict) -> dict:
    """sha256 of sm.conf -> (AA touch installed, trim mask: 1 DVD/TV, 2 SiriusXM, 4 Pandora, 8 Stitcher, 16 Aha)."""
    out = {}
    for line in pin.get("SM_TABLE", "").splitlines():
        parts = line.split()
        if len(parts) == 2 and len(parts[0]) == 2 and parts[0][1] in TRIM_DIGITS:
            out[parts[1]] = (parts[0][0] == "1", TRIM_DIGITS.index(parts[0][1]))
    return out


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dump_number(path: Path) -> int:
    match = re.match(r"(\d+)", path.name)
    return int(match.group(1)) if match else -1


def latest_dump(where: Path):
    """The newest dump below `where` (a stick root, a miatoff-dumps folder or a dump), or None."""
    where = Path(where)
    if (where / "SUMMARY.txt").is_file():
        return where
    for base in (where / "miatoff-dumps", where):
        if base.is_dir():
            dumps = [d for d in base.iterdir() if d.is_dir() and (d / "SUMMARY.txt").is_file()]
            if dumps:
                return max(dumps, key=lambda d: (dump_number(d), d.name))
    return None


class Dump:
    """Read-only view of one dump folder."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.summary = self._summary()
        self.keyfiles = self._keyfiles()
        self.evidence = {}

    def _summary(self) -> dict:
        out = {}
        for line in (self.path / "SUMMARY.txt").read_text(encoding="utf-8", errors="replace").splitlines():
            match = re.match(r"^([A-Za-z][A-Za-z0-9_. ]*?):\s+(.*)$", line)
            if match and match.group(1) not in out:
                out[match.group(1)] = match.group(2).strip()
        return out

    def _keyfiles(self) -> dict:
        rows = {}
        table = self.path / "inventory" / "key-files.tsv"
        if table.is_file():
            for line in table.read_text(encoding="utf-8", errors="replace").splitlines()[1:]:
                cols = line.split("\t")
                if len(cols) >= 6 and cols[0].startswith("/"):
                    rows[cols[0]] = {"attrs": cols[2], "sha256": cols[5] if re.fullmatch(r"[0-9a-f]{64}", cols[5]) else None}
        return rows

    @property
    def full(self) -> bool:
        return self.summary.get("mode") == "full"

    def sha(self, unit_path: str):
        """sha256 of a file of the unit: from the copied file if present, else from key-files.tsv."""
        copy = self.path / "static" / "files" / unit_path.lstrip("/")
        if copy.is_file():
            digest = sha256_file(copy)
            self.evidence[unit_path] = digest
            return digest
        row = self.keyfiles.get(unit_path)
        if row and row["sha256"]:
            self.evidence[unit_path] = row["sha256"]
            return row["sha256"]
        return None

    def attrs(self, unit_path: str):
        row = self.keyfiles.get(unit_path)
        return row["attrs"] if row else None

    def text(self, rel: str) -> str:
        path = self.path / rel
        return path.read_text(encoding="utf-8", errors="replace") if path.is_file() else ""


def state_of(digest, stock: str, patched: str):
    if digest is None:
        return UNCHECKED
    if digest == stock:
        return "stock"
    if digest == patched:
        return "patched"
    return "unknown"


def check(dump_path: Path, pinned: dict = None) -> dict:
    """The full verdict for one dump, as plain data."""
    pin = pinned if pinned is not None else pinned_constants()
    dump = Dump(dump_path)
    gates, comps = [], {}

    def gate(name, ok, detail):
        gates.append({"name": name, "ok": ok, "detail": detail})

    # --- gates: the installer refuses the whole run if one of these fails
    fw = dump.summary.get("firmware")
    gate("firmware", None if fw is None else fw == pin.get("FW_WANTED"),
         f"{fw or '?'} (need {pin.get('FW_WANTED')})")
    for key, path, name in (("BLM_SHA256", "/jci/aapa/blmjciaapa.so", "Android Auto library"),
                            ("AAP_SHA256", "/usr/bin/aap_service", "Android Auto service")):
        digest = dump.sha(path)
        gate(name, None if digest is None else digest == pin.get(key),
             "known build" if digest == pin.get(key) else ("not in this dump" if digest is None else f"unknown build {digest[:12]}"))
    ps = dump.text("runtime/ps.txt") + dump.text("runtime/ps-w.txt")
    active = re.search(r"/jci/sm/sm -f (\S+)", ps)
    gate("service manager config", None if not active else active.group(1) == "/jci/sm/sm.conf",
         active.group(1) if active else "not in this dump")
    mounts = dump.text("runtime/proc-mounts.txt")
    persist = next((l for l in mounts.splitlines() if "/data_persist" in l), None)
    gate("/data_persist writable", None if persist is None else bool(re.search(r"\brw\b|[ ,]rw[ ,]", persist)),
         "rw" if persist and re.search(r"[ ,]rw[ ,]", persist) else ("read-only" if persist else "not in this dump"))
    tools = dump.summary.get("hash tools", "")
    gate("sha256 tool on the unit", None if not tools else "sha256=none" not in tools, tools or "not in this dump")
    foreign = [l for l in dump.text("runtime/ld_preload.tsv").splitlines() if l.strip() and OURS_PRELOAD not in l]
    gate("no foreign LD_PRELOAD", not foreign, "none" if not foreign else f"{len(foreign)} other")

    blocked = [g for g in gates if g["ok"] is False]

    # --- components
    def result(state, detail):
        return {"state": BLOCKED if blocked and state in (AVAILABLE,) else state, "detail": detail}

    common = state_of(dump.sha("/jci/gui/common/js/Common.js"), pin.get("COMMON_STOCK"), pin.get("COMMON_PATCHED"))
    comps["touchtune"] = result({"stock": AVAILABLE, "patched": INSTALLED, "unknown": BLOCKED}.get(common, UNCHECKED),
                                {"stock": "Common.js is stock", "patched": "Common.js has the TouchTune edit",
                                 "unknown": "Common.js is an unknown version"}.get(common, "Common.js not in this dump"))

    sm_digest = dump.sha("/jci/sm/sm.conf")
    variant = sm_variants(pin).get(sm_digest) if sm_digest else None
    xml = state_of(dump.sha("/etc/aap_system_attributes.xml"), pin.get("XML_STOCK"), pin.get("XML_PATCHED"))
    ucp = state_of(dump.sha("/etc/aap_system_attributes_UCP.xml"), pin.get("UCP_STOCK"), pin.get("UCP_PATCHED"))
    if sm_digest is None or UNCHECKED in (xml, ucp):
        comps["aa_touch"] = {"state": UNCHECKED, "detail": "needs a FULL dump"}
        for key in TRIM_KEYS:
            comps[key] = {"state": UNCHECKED, "detail": "needs a FULL dump"}
    elif variant is None or "unknown" in (xml, ucp):
        comps["aa_touch"] = {"state": BLOCKED, "detail": "sm.conf or an AAP XML is not a known version"}
        for key in TRIM_KEYS:
            comps[key] = {"state": BLOCKED, "detail": "sm.conf is not a known version"}
    else:
        aa_on, mask = variant
        parts = [aa_on, xml == "patched", ucp == "patched"]
        listing = dump.text("runtime/data_persist-ls.txt")
        if all(parts):
            shim = "libpatch-blmjciaapa.so.off" in listing and "libpatch-blmjciaapa.so\n" not in listing
            comps["aa_touch"] = result(INSTALLED, "installed, switched off" if shim else "installed")
        elif not any(parts):
            comps["aa_touch"] = result(AVAILABLE, "all three files are stock")
        else:
            comps["aa_touch"] = {"state": PARTIAL, "detail": "some files patched, some stock: run the stick's REMOVE/FINISH"}
        for bit, key in zip((1, 2, 4, 8, 16), TRIM_KEYS):
            on = bool(mask & bit)
            comps[key] = result(INSTALLED if on else AVAILABLE, "off at boot" if on else "starts as usual")
    for key in ("aa_touch", *TRIM_KEYS):
        if comps[key]["state"] in (AVAILABLE, INSTALLED, PARTIAL):
            for path in ("/jci/sm/sm.conf", "/etc/aap_system_attributes.xml", "/etc/aap_system_attributes_UCP.xml"):
                attrs = dump.attrs(path)
                if attrs is not None and attrs != CFG_ATTRS:
                    comps[key] = {"state": BLOCKED, "detail": f"{path} has unexpected permissions ({attrs})"}
                    break

    warn = state_of(dump.sha("/jci/gui/apps/system/js/systemApp.js"), pin.get("SYS_STOCK"), pin.get("SYS_PATCHED"))
    comps["warning"] = result({"stock": AVAILABLE, "patched": INSTALLED, "unknown": BLOCKED}.get(warn, UNCHECKED),
                              {"stock": "systemApp.js is stock", "patched": "warning is skipped",
                               "unknown": "systemApp.js is an unknown version"}.get(warn, "needs a FULL dump"))

    opera = state_of(dump.sha("/jci/opera/opera_home/opera.ini"), pin.get("OPERA_STOCK"), pin.get("OPERA_PATCHED"))
    gap2 = state_of(dump.sha("/jci/scripts/stage_gap2.sh"), pin.get("GAP2_STOCK"), pin.get("GAP2_PATCHED"))
    if UNCHECKED in (opera, gap2):
        comps["meters"] = {"state": UNCHECKED, "detail": "needs a FULL dump"}
    elif "unknown" in (opera, gap2):
        comps["meters"] = {"state": BLOCKED, "detail": "opera.ini or stage_gap2.sh is not a known version"}
    elif opera == gap2 == "stock":
        comps["meters"] = result(AVAILABLE, "opera.ini and stage_gap2.sh are stock")
    elif opera == gap2 == "patched":
        comps["meters"] = result(INSTALLED, "installed")
    else:
        comps["meters"] = {"state": PARTIAL, "detail": "half installed: run the stick's REPAIR/REMOVE"}

    if not blocked and all(g["ok"] for g in gates) and all(c["state"] != UNCHECKED for c in comps.values()):
        overall = "supported"
    elif blocked:
        overall = "not supported"
    else:
        overall = "incomplete"
    fingerprint = hashlib.sha256("".join(f"{k} {v}\n" for k, v in sorted(dump.evidence.items())).encode()).hexdigest()
    return {"dump": dump.path.name, "mode": dump.summary.get("mode", "?"), "overall": overall,
            "gates": gates, "components": {k: comps[k] for k, _ in COMPONENTS}, "fingerprint": fingerprint}


def format_report(verdict: dict) -> str:
    out = [f"MiatOff check of {verdict['dump']} ({verdict['mode']} dump)", "", "Unit"]
    for g in verdict["gates"]:
        mark = {True: "OK     ", False: "FAILED ", None: "?      "}[g["ok"]]
        out.append(f"  {mark}{g['name']}: {g['detail']}")
    out += ["", "Components"]
    for key, title in COMPONENTS:
        c = verdict["components"][key]
        out.append(f"  {title:<34}{c['state'].upper():<14}{c['detail']}")
    out.append("")
    notes = {"supported": "SUPPORTED: every check passed on a known firmware.",
             "not supported": "NOT SUPPORTED: the installer would refuse to change this unit (see FAILED above).",
             "incomplete": "INCOMPLETE: some checks need a FULL dump. Run the dump stick in FULL mode."}
    out.append("Result: " + notes[verdict["overall"]])
    out.append(f"Evidence fingerprint: {verdict['fingerprint']}")
    return "\n".join(out) + "\n"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("where", help="stick root, miatoff-dumps folder or one dump folder")
    parser.add_argument("--json", action="store_true", help="print the verdict as JSON")
    parser.add_argument("--write", action="store_true", help=f"also write {REPORT_NAME} into the dump folder")
    args = parser.parse_args(argv)
    dump = latest_dump(Path(args.where))
    if dump is None:
        print(f"No dump found in {args.where}. Run the 'Check my car' stick in the car first.", file=sys.stderr)
        return 2
    verdict = check(dump)
    text = json.dumps(verdict, indent=2, sort_keys=True) + "\n" if args.json else format_report(verdict)
    print(text, end="")
    if args.write:
        (dump / REPORT_NAME).write_text(format_report(verdict), encoding="utf-8", newline="\n")
    return {"supported": 0, "not supported": 1}.get(verdict["overall"], 2)


if __name__ == "__main__":
    sys.exit(main())

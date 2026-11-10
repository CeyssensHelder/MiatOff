#!/usr/bin/env python3
"""Host tests for the MiatOff AA-touch stick (no car needed).

Builds a fake CMU root with the stick at tmp/mnt/sda1, runs the launcher
command the way the update scanner would, and checks install, disable, enable,
remove, refusal of unknown states, and recovery after a simulated power loss
at every step.

If the private dump (dumps/eu-74.00.324/001-full-up174s) is present, the
fixture uses its real sm.conf and AAP XMLs and the script's production hashes
for them; only the two AA binaries (not in the dump) get test hashes.
Otherwise synthetic files are used with matching test hashes.

Run: python aa-touch-stick/tests/test_aa_touch_stick.py   (needs a POSIX `sh`)
Optional: MO_DOCKER_IMAGE=busybox:1.25 to run under real BusyBox ash.
"""
import hashlib
import re
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("build_stick", HERE.parent / "build_stick.py")
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)

DUMP = HERE.parent.parent / "dumps/eu-74.00.324/001-full-up174s/static/files"
REAL = (DUMP / "jci/sm/sm.conf").is_file() and os.environ.get("MO_SYNTHETIC") != "1"
DOCKER_IMAGE = os.environ.get("MO_DOCKER_IMAGE", "")
FAILURES = []

SM_STOCK_LINE = ('        <service type="jci_service" name="jciAAPA" path="/jci/aapa/blmjciaapa.so" '
                 'autorun="yes" reset_board="yes" retry_count="0" ping_timeout="30000">')
SM_ENV_LINE = ('            <environ_var env_name="LD_PRELOAD" '
               'env_value="/data_persist/oem-aa-mod/libpatch-blmjciaapa.so"/>')
ANCHOR = "        <input_devices>"


def check(cond, message):
    print(("PASS  " if cond else "FAIL  ") + message)
    if not cond:
        FAILURES.append(message)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# Independent Python versions of the two edits, to cross-check the awk in the script.
# sm_WCP.conf starts jciAAPA with args="new_hw"; the edit is the same.
SM_WCP_STOCK_LINE = SM_STOCK_LINE[:-1] + ' args="new_hw">'


def patch_sm(data: bytes) -> bytes:
    lines = data.decode().split("\n")
    line = SM_WCP_STOCK_LINE if SM_WCP_STOCK_LINE in lines else SM_STOCK_LINE
    assert lines.count(line) == 1 and lines.count(SM_STOCK_LINE) + lines.count(SM_WCP_STOCK_LINE) == 1
    i = lines.index(line)
    lines[i] = line.replace('reset_board="yes"', 'reset_board="no"')
    lines.insert(i + 1, SM_ENV_LINE)
    return "\n".join(lines).encode()


TRIM = "jcidvd jcitv jciSXMS jciXMMGR blm_ira_pandora irs_server blm_ira_stitcher irsstitcher_server".split()


def trim_sm(data: bytes, names=None) -> bytes:
    import re
    names = names or TRIM
    lines = data.decode().split("\n")
    n = 0
    for i, line in enumerate(lines):
        m = re.search(r' name="([^"]*)"', line)
        if "<service " in line and m and m.group(1) in names:
            assert line.count('autorun="yes"') == 1
            lines[i] = line.replace('autorun="yes"', 'autorun="no"')
            n += 1
    assert n == len(names)
    return "\n".join(lines).encode()


# The boot trim groups, in bit order of the variant code (1, 2, 4, 8; Aha is 16).
TRIM_GROUPS = {"dvdtv": ["jcidvd", "jcitv"], "sirius": ["jciSXMS", "jciXMMGR"],
               "pandora": ["blm_ira_pandora", "irs_server"], "stitcher": ["blm_ira_stitcher", "irsstitcher_server"]}
TRIM_DIGITS = "0123456789abcdefghijklmnopqrstuv"


AHA_STAGES = ("stage_gap2", "stage_vr", "stage_wifi")
AHA_DEP = '<dependency type="service" value="blm_ira_aha"/>'


def aha_sm(data: bytes) -> bytes:
    """Trim level 2 on top of level 1: Aha off, its three stages wait for stage_ir."""
    import re
    lines = data.decode().split("\n")
    service, deps, runs = None, 0, 0
    for i, line in enumerate(lines):
        m = re.search(r'<service [^>]*name="([^"]*)"', line)
        if m:
            service = m.group(1)
            if service == "blm_ira_aha":
                assert line.count('autorun="yes"') == 1
                lines[i] = line.replace('autorun="yes"', 'autorun="no"')
                runs += 1
        if service in AHA_STAGES and AHA_DEP in line:
            lines[i] = line.replace('value="blm_ira_aha"', 'value="stage_ir"')
            deps += 1
        if "</service>" in line:
            service = None
    assert runs == 1 and deps == 3
    return "\n".join(lines).encode()


def patch_xml(data: bytes, use_internally: str) -> bytes:
    lines = data.decode().split("\n")
    assert lines.count(ANCHOR) == 1
    i = lines.index(ANCHOR) + 1
    lines[i:i] = [
        "            <touch_screen>",
        f"                <use_internally>{use_internally}</use_internally>",
        "                <path>/dev/input/filtered-touchscreen0</path>",
        "                <type>AAP_TOUCH_SCREEN_TYPE_CAPACITIVE</type>",
        "                <as_secondary_input>false</as_secondary_input>",
        "            </touch_screen>",
    ]
    return "\n".join(lines).encode()


SYNTH_SM = ("<sm_config>\n    <services>\n" + SM_STOCK_LINE + "\n"
            '            <dependency type="service" value="aap_service"/>\n        </service>\n'
            '        <service type="process" name="aap_service" reset_board="yes"/>\n'
            + "".join(f'        <service type="jci_service" name="{n}" path="/jci/{n}.so" autorun="yes" reset_board="yes">\n'
                      "        </service>\n" for n in TRIM)
            + '        <service type="jci_service" name="jcixm" path="/jci/xm.so" autorun="no" reset_board="yes"/>\n'
            + "".join(f'        <service type="process" name="{s}" path="/jci/scripts/{s}.sh" autorun="yes" reset_board="no" args="">\n'
                      '            <dependency type="service" value="stage_3"/>\n'
                      f'            {AHA_DEP} <!-- start after IR stage -->\n'
                      "        </service>\n" for s in AHA_STAGES)
            + '        <service type="jci_service" name="blm_ira_aha" path="/jci/ira/aha.so" autorun="yes" reset_board="yes" args="">\n'
              '            <dependency type="service" value="stage_ir"/>\n        </service>\n'
            "    </services>\n</sm_config>\n").encode()
SYNTH_XML = ("<aap_attributes>\n    <head_unit>\n        <client_cert_file>/etc/androidauto/wcp/x.pem</client_cert_file>\n"
             + ANCHOR + "\n            <key_codes>\n                <value>AAP_KEYCODE_SEARCH</value>\n"
             "            </key_codes>\n        </input_devices>\n    </head_unit>\n</aap_attributes>\n").encode()
SYNTH_UCP = SYNTH_XML.replace(b"/wcp/x.pem", b"/ucp/y.pem")


def stock_files():
    if REAL:
        return {rel: (DUMP / rel).read_bytes() for rel in
                ("jci/sm/sm.conf", "etc/aap_system_attributes.xml", "etc/aap_system_attributes_UCP.xml")}
    return {"jci/sm/sm.conf": SYNTH_SM, "etc/aap_system_attributes.xml": SYNTH_XML,
            "etc/aap_system_attributes_UCP.xml": SYNTH_UCP}


STOCK = stock_files()
PATCHED = {
    "jci/sm/sm.conf": patch_sm(STOCK["jci/sm/sm.conf"]),
    "etc/aap_system_attributes.xml": patch_xml(STOCK["etc/aap_system_attributes.xml"], "true"),
    "etc/aap_system_attributes_UCP.xml": patch_xml(STOCK["etc/aap_system_attributes_UCP.xml"], "false"),
}
SM_VARIANTS = {"00": STOCK["jci/sm/sm.conf"], "10": PATCHED["jci/sm/sm.conf"],
               "0f": trim_sm(STOCK["jci/sm/sm.conf"]), "1f": trim_sm(PATCHED["jci/sm/sm.conf"])}
SM_VARIANTS["0v"] = aha_sm(SM_VARIANTS["0f"])
SM_VARIANTS["1v"] = aha_sm(SM_VARIANTS["1f"])


def sm_for(aa: int, mask: int, stock: bytes = None) -> bytes:
    """An SM config (default sm.conf) for AA touch (0/1) and a trim mask (1 DVD/TV, 2 SiriusXM, 4 Pandora, 8 Stitcher, 16 Aha)."""
    if stock is None:
        data = PATCHED["jci/sm/sm.conf"] if aa else STOCK["jci/sm/sm.conf"]
    else:
        data = patch_sm(stock) if aa else stock
    for bit, names in zip((1, 2, 4, 8), TRIM_GROUPS.values()):
        if mask & bit:
            data = trim_sm(data, names)
    return aha_sm(data) if mask & 16 else data


def sm_table(stock: bytes = None) -> dict:
    """Every variant code (AA digit + trim char) -> SM config bytes (default sm.conf)."""
    return {f"{aa}{TRIM_DIGITS[mask]}": sm_for(aa, mask, stock) for aa in (0, 1) for mask in range(32)}


# sm_WCP.conf: what the Service Manager runs with wireless CarPlay. Synthetic: sm.conf
# with an extra CarPlay service, so the two files differ outside the edited lines.
WCP = "jci/sm/sm_WCP.conf"
WCP_STOCK = SYNTH_SM.replace(SM_STOCK_LINE.encode(), SM_WCP_STOCK_LINE.encode()).replace(b"    </services>\n",
                             b'        <service type="jci_service" name="jciCARPLAY" path="/jci/carplay.so" autorun="yes" reset_board="yes"/>\n'
                             b"    </services>\n")
WCP_VARIANTS = sm_table(WCP_STOCK)
WCP_CMDLINE = b"/jci/sm/sm\x00-f\x00/jci/sm/sm_WCP.conf\x00-e\x00/tmp/smevents.txt\x00"

# Startup warning: systemApp.js. Real file from the dump when present; otherwise a
# small synthetic one built from the stock lines in aa-touch.sh (markers removed).
sys.path.insert(0, str(HERE))
import disclaimer_edit  # noqa: E402
import menu_edit  # noqa: E402

SYSAPP_REAL = HERE.parent.parent / "dumps/eu-74.00.324/003-full-up88s-2026-10-27/static/files/jci/gui/apps/system/js/systemApp.js"


def stock_systemapp() -> bytes:
    if REAL and SYSAPP_REAL.is_file():
        return SYSAPP_REAL.read_bytes()
    script = (HERE.parent / "stick/aa-touch.sh").read_text()
    body = script.split("DISC_STOCK_BODY=$(cat <<'EOF'\n", 1)[1].split("\nEOF\n", 1)[0]
    lines = ["var systemApp = function () {}; var framework = {};", "systemApp.prototype._init = function()", "{",
             "    this._contextTable = {", disclaimer_edit.BLOCK_START]
    lines += [l[:-1] for l in body.split("\n")]
    lines += [disclaimer_edit.BLOCK_END, "    };", "};", "", disclaimer_edit.ANCHOR, "{", "};", "",
              "systemApp.prototype._buildEntertainmentDataList = function()", "{",
              "    for (var i = 0; i < this._masterEntertainmentDataList.items.length; ++i)", "    {",
              menu_edit.STOCK_LINE, "        {", "            dataList.items.push(this._masterEntertainmentDataList.items[i]);",
              "        }", "    }", "};", ""]
    return "\n".join(lines).encode()


SYS_STOCK_BYTES = stock_systemapp()
SYS_PATCHED_BYTES = disclaimer_edit.patch(SYS_STOCK_BYTES)


def sysb(disc: int, code: str) -> bytes:
    """systemApp.js with the warning edit (disc 0/1) and the menu code (0 off, w on and nothing hidden, else a trim char)."""
    return menu_edit.patch(SYS_PATCHED_BYTES if disc else SYS_STOCK_BYTES, code)


SYS_TABLE_TEXT = "\n".join(f"{disc}{code} {hashlib.sha256(sysb(disc, code)).hexdigest()}"
                           for disc in (0, 1) for code in menu_edit.MENU_CODES)
SYSAPP = "jci/gui/apps/system/js/systemApp.js"

# Meters: opera.ini and stage_gap2.sh, real from the dump when present.
import meters_edit  # noqa: E402

DUMP3 = HERE.parent.parent / "dumps/eu-74.00.324/003-full-up88s-2026-10-27/static/files"
OPERA = "jci/opera/opera_home/opera.ini"
GAP2 = "jci/scripts/stage_gap2.sh"
if REAL and (DUMP3 / OPERA).is_file():
    OPERA_STOCK_BYTES = (DUMP3 / OPERA).read_bytes()
    GAP2_STOCK_BYTES = (DUMP3 / GAP2).read_bytes()
else:
    OPERA_STOCK_BYTES = (b"[User Prefs]\nUser JavaScript File=$OPERA_DIR/userjs/\nUser JavaScript=0\n"
                         b"User JavaScript on HTTPS=1\n\n[Network]\nPerson=0\n")
    GAP2_STOCK_BYTES = b"#!/bin/sh\n\n"
OPERA_PATCHED_BYTES = meters_edit.patch_opera(OPERA_STOCK_BYTES)
GAP2_PATCHED_BYTES = meters_edit.patch_gap2(GAP2_STOCK_BYTES)
# Shorter list delay: List2Ctrl.js. Real file from the dump when present, else synthetic.
LIST2 = "jci/gui/common/controls/List2/js/List2Ctrl.js"
DELAY = [("autoscrollTier1Timeout :                1500,", "autoscrollTier1Timeout :                150,"),
         ("autoscrollTier2Timeout :                5000,", "autoscrollTier2Timeout :                300,"),
         ("autoscrollTier1Interval :               500,", "autoscrollTier1Interval :               200,"),
         ("autoscrollTier2Interval :               1000,", "autoscrollTier2Interval :               300,")]


def patch_list2(data: bytes) -> bytes:
    """Independent Python version of delay_transform: exactly the four lines."""
    for old, new in DELAY:
        line = ("        " + old + "\n").encode()
        assert data.count(line) == 1
        data = data.replace(line, ("        " + new + "\n").encode())
    return data


DUMP4 = HERE.parent.parent / "dumps/eu-74.00.324/003-full-up88s-2026-10-27/static/files"
if REAL and (DUMP4 / LIST2).is_file():
    LIST2_STOCK_BYTES = (DUMP4 / LIST2).read_bytes()
else:
    LIST2_STOCK_BYTES = ("var List2Ctrl = function () {};\nList2Ctrl.prototype.properties = {\n"
                         + "".join(f"        {old}\n" for old, _ in DELAY)
                         + "        // autoscrollTier1Timeout :                1500, (a comment, not the setting)\n};\n").encode()
LIST2_PATCHED_BYTES = patch_list2(LIST2_STOCK_BYTES)

# Camera text: the SafetyText images. The names come from SAFETY_TABLE; the stock
# content is synthetic (the real images are Mazda's), the blank is MZD-AIO's.
NATIVE = "jci/nativegui/images"
SAFETY_ROWS = [line.split() for line in re.search(
    r"^SAFETY_TABLE='(.*?)'$", (HERE.parent / "stick/aa-touch.sh").read_text(), re.M | re.S).group(1).splitlines()]
SAFETY_NAMES = [row[0] for row in SAFETY_ROWS]
SAFETY_STOCK = {name: b"\x89PNG stock " + name.encode() for name in SAFETY_NAMES}
SAFETY_BLANK = (HERE.parent.parent / "vendor/mzd-aio/safety-warning-reverse-camera/SafetyText_UK_English.png").read_bytes()
# Parking sensors: names from SENSOR_TABLE (with their folder), synthetic stock, MZD-AIO's images.
SENSOR_ROWS = [line.split() for line in re.search(
    r"^SENSOR_TABLE='(.*?)'$", (HERE.parent / "stick/aa-touch.sh").read_text(), re.M | re.S).group(1).splitlines()]
SENSOR_NAMES = [row[0] for row in SENSOR_ROWS]
SENSOR_STOCK = {name: b"\x89PNG stock sensor " + name.encode() for name in SENSOR_NAMES}
SENSOR_NEW = {name: (HERE.parent.parent / "vendor/mzd-aio/transparent-parking-sensor" / name).read_bytes()
              for name in SENSOR_NAMES}

TT_LINE = '        "Global.AtSpeed" : this._AtSpeedMsgHandler.bind(this),'
COMMON_STOCK = ("var Common = {\n    _handlers : {\n" + TT_LINE + "\n    },\n};\n").encode()
COMMON_PATCHED = COMMON_STOCK.replace(
    TT_LINE.encode(), b"        // MZD_TOUCH_WHILE_DRIVING " + TT_LINE.lstrip().encode())
TT_ENV = {"TOUCHTUNE_TEST_STOCK_SHA256": hashlib.sha256(COMMON_STOCK).hexdigest(),
          "TOUCHTUNE_TEST_PATCHED_SHA256": hashlib.sha256(COMMON_PATCHED).hexdigest(),
          "TOUCHTUNE_TEST_STOCK_BYTES": str(len(COMMON_STOCK))}
SETTER = '#!/bin/sh\nprintf "%s\\n" "$1" > "$MZD_ROOT/sys/class/nvram/nv-config/keys/{key}"\n'
OPENSSL_SHIM = """#!/bin/sh
[ "$1" = dgst ] || exit 1
case "$2" in
    -sha256) tool=sha256sum; name=SHA256 ;;
    -md5) tool=md5sum; name=MD5 ;;
    *) exit 1 ;;
esac
shift 2
rc=0
for f; do
    out=$($tool "$f") || { rc=1; continue; }
    echo "$name($f)= ${out%% *}"
done
exit $rc
"""
BLM = b"\x7fELF fake blmjciaapa"
AAP = b"\x7fELF fake aap_service"


def write_in_container(root: Path, rel: str, data: bytes):
    """Write a file the way the container (root) would: the folder it made is not writable for the host user."""
    stage = root.parent / ".write-stage"
    stage.write_bytes(data)
    try:
        target = f"/w/{root.name}/{rel}"
        r = subprocess.run(["docker", "run", "--rm", "-v", f"{root.parent}:/w", DOCKER_IMAGE, "sh", "-c",
                            f'mkdir -p "$(dirname "{target}")" && cp /w/.write-stage "{target}"'],
                           capture_output=True, text=True, timeout=120)
        if r.returncode != 0:
            raise PermissionError(f"cannot write {rel} in the container: {r.stderr.strip()}")
    finally:
        stage.unlink()


def write(root: Path, rel: str, data):
    path = root / rel
    data = data if isinstance(data, bytes) else data.encode()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    except PermissionError:
        try:
            # A file the root container made or replaced is not writable for the host user, but the folder is:
            # replace it instead (the container's modes and owners stay untouched). The chmod is for Windows,
            # which refuses to delete a read-only file.
            path.chmod(0o666)
            path.unlink()
            path.write_bytes(data)
        except (PermissionError, FileNotFoundError):
            if not DOCKER_IMAGE:
                raise
            # Linux: the folder itself belongs to root (made by the container), so the container writes it.
            write_in_container(root, rel, data)
    return path


def make_fixture(root: Path):
    write(root, "jci/version.ini", 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\nJCI_SW_VER_PATCH="A"\n')
    for rel, data in STOCK.items():
        write(root, rel, data)
    write(root, "jci/sm/sm_WCP.conf", "<sm_config/>\n")
    write(root, "jci/aapa/blmjciaapa.so", BLM)
    write(root, "usr/bin/aap_service", AAP)
    write(root, "proc/uptime", "200.50 300.00\n")
    write(root, "proc/mounts", "rootfs / rootfs rw 0 0\n/dev/ffx01p1 / relfs ro,noatime 0 0\n"
                               "/dev/mmcblk0p2 /tmp/mnt/data_persist relfs rw,noatime 0 0\n")
    write(root, "proc/252/cmdline", b"/jci/sm/sm\x00-f\x00/jci/sm/sm.conf\x00-e\x00/tmp/smevents.txt\x00")
    write(root, "sys/class/nvram/nv-config/keys/lvds_speed_restriction", "disable\n")
    write(root, "jci/gui/common/js/Common.js", COMMON_STOCK)
    write(root, SYSAPP, SYS_STOCK_BYTES)
    write(root, LIST2, LIST2_STOCK_BYTES)
    for name, data in SAFETY_STOCK.items():
        write(root, f"{NATIVE}/{name}", data)
    write(root, f"{NATIVE}/Other.png", b"\x89PNG not ours")
    for name, data in SENSOR_STOCK.items():
        write(root, f"{NATIVE}/{name}", data)
    write(root, f"{NATIVE}/HorizontalSensors/BackCtr_1_lg.png", b"\x89PNG v74 arc, not replaced")
    write(root, OPERA, OPERA_STOCK_BYTES)
    write(root, GAP2, GAP2_STOCK_BYTES)
    write(root, "jci/opera/opera_dir/userjs/fps.js", "// stock fps counter\n")
    for name, key in (("set_speed_restriction_config.sh", "bus_bcm_speed_restriction"),
                      ("set_lvds_speed_restriction_config.sh", "lvds_speed_restriction")):
        os.chmod(write(root, "jci/scripts/" + name, SETTER.replace("{key}", key)), 0o755)
    (root / "data").mkdir(parents=True)
    (root / "data_persist").mkdir(parents=True)
    (root / "tmp/mnt/data_persist").mkdir(parents=True)
    (root / "tmp/mnt/sda1").mkdir(parents=True)


def overrides(work: Path, root_in_sh: str, **extra) -> Path:
    """Test hashes for the fixture; real-dump mode keeps the production config hashes."""
    values = {"BLM_SHA256": sha(BLM), "AAP_SHA256": sha(AAP),
              "COMMON_STOCK": sha(COMMON_STOCK), "COMMON_PATCHED": sha(COMMON_PATCHED)}
    if not REAL:
        values.update(
            SM_STOCK=sha(STOCK["jci/sm/sm.conf"]), SM_PATCHED=sha(PATCHED["jci/sm/sm.conf"]),
            XML_STOCK=sha(STOCK["etc/aap_system_attributes.xml"]),
            XML_PATCHED=sha(PATCHED["etc/aap_system_attributes.xml"]),
            UCP_STOCK=sha(STOCK["etc/aap_system_attributes_UCP.xml"]),
            UCP_PATCHED=sha(PATCHED["etc/aap_system_attributes_UCP.xml"]),
            SM_TABLE="'" + "\n".join(f"{code} {sha(data)}" for code, data in sorted(sm_table().items())) + "'",
            SM_WCP_TABLE="'" + "\n".join(f"{code} {sha(data)}" for code, data in sorted(WCP_VARIANTS.items())) + "'",
            SYS_STOCK=sha(SYS_STOCK_BYTES), SYS_PATCHED=sha(SYS_PATCHED_BYTES), SYS_TABLE="'" + SYS_TABLE_TEXT + "'",
            LIST_STOCK=sha(LIST2_STOCK_BYTES), LIST_PATCHED=sha(LIST2_PATCHED_BYTES),
            SAFETY_TABLE="'" + "\n".join(f"{n} {sha(SAFETY_STOCK[n])} {sha(SAFETY_BLANK)}" for n in SAFETY_NAMES) + "'",
            SENSOR_TABLE="'" + "\n".join(f"{n} {sha(SENSOR_STOCK[n])} {sha(SENSOR_NEW[n])}" for n in SENSOR_NAMES) + "'",
            OPERA_STOCK=sha(OPERA_STOCK_BYTES), OPERA_PATCHED=sha(OPERA_PATCHED_BYTES),
            GAP2_STOCK=sha(GAP2_STOCK_BYTES), GAP2_PATCHED=sha(GAP2_PATCHED_BYTES))
    if REAL:
        # The real dump has no image files to copy (only their hashes), so the fixture's fake stock images
        # need their own tables here too; the config files still use the production hashes.
        # Likewise sm_WCP.conf: the dump has none, the fixture's is synthetic.
        values.update(
            SM_WCP_TABLE="'" + "\n".join(f"{code} {sha(data)}" for code, data in sorted(WCP_VARIANTS.items())) + "'",
            SAFETY_TABLE="'" + "\n".join(f"{n} {sha(SAFETY_STOCK[n])} {sha(SAFETY_BLANK)}" for n in SAFETY_NAMES) + "'",
            SENSOR_TABLE="'" + "\n".join(f"{n} {sha(SENSOR_STOCK[n])} {sha(SENSOR_NEW[n])}" for n in SENSOR_NAMES) + "'")
    values.update(extra)
    path = work / "overrides.sh"
    path.write_text("".join(f"{k}={v}\n" for k, v in values.items()), newline="\n")
    return path


def tree_digest(root: Path, skip: Path) -> str:
    h = hashlib.sha256()
    for dirpath, dirnames, filenames in os.walk(root):
        d = Path(dirpath)
        if d == skip or skip in d.parents:
            continue
        dirnames.sort()
        h.update(b"D" + str(d.relative_to(root)).encode())
        for name in sorted(filenames):
            p = d / name
            h.update(b"F" + str(p.relative_to(root)).encode() + p.read_bytes())
    return h.hexdigest()


class Car:
    def __init__(self, tmp: Path):
        self.tmp = tmp
        self.root = tmp / "root"
        self.stick = self.root / "tmp/mnt/sda1"
        self.guard = tmp / "guard"
        self.extra = {}

    def run(self, action: str, fault: str = "", pre: str = "", post: str = ""):
        """pre/post: shell commands in the same container (Docker only), around the launcher."""
        command = bs.launcher_name()[2:-4]  # strip "$(" and ").up"
        if pre or post:
            command = f"{pre}\n{command}\nrc=$?\n{post}\nexit $rc"
        if DOCKER_IMAGE:
            base = "/w/"
            ov = overrides(self.tmp, base, **self.extra)
            env = {"MO_ROOT": base + "root", "HOME": "/root", "MO_TEST": "1", "MO_ACTION": action,
                   "MO_FAULT": fault, "MO_GUARD": base + "guard", "MO_TEST_OVERRIDES": base + ov.name, **TT_ENV}
            # The CMU has /usr/bin/openssl (TouchTune hashes only with it); the
            # busybox image does not, so give it an `openssl dgst` stand-in.
            (self.tmp / "openssl").write_text(OPENSSL_SHIM, newline="\n")
            setup = "mkdir -p /usr/bin && cp /w/openssl /usr/bin/openssl && chmod 755 /usr/bin/openssl && "
            args = ["docker", "run", "--rm", "-v", f"{self.tmp}:/w"]
            for k, v in env.items():
                args += ["-e", f"{k}={v}"]
            return subprocess.run(args + [DOCKER_IMAGE, "sh", "-c", setup + command],
                                  capture_output=True, text=True, timeout=300)
        ov = overrides(self.tmp, "", **self.extra)
        env = dict(os.environ, MO_ROOT=self.root.as_posix(), HOME="/root", MO_TEST="1", MO_ACTION=action,
                   MO_FAULT=fault, MO_GUARD=self.guard.as_posix(), MO_TEST_OVERRIDES=ov.as_posix(), **TT_ENV)
        return subprocess.run(["sh", "-c", command], env=env, capture_output=True, text=True, timeout=300)

    def read(self, rel: str) -> bytes:
        return (self.root / rel).read_bytes()

    def state(self, field: str = "overall:") -> str:
        report = self.stick / "aa-touch-state.txt"
        for line in report.read_text().splitlines() if report.exists() else []:
            if line.startswith(field):
                return line[len(field):].split()[0]
        return "?"

    def nvram(self, key: str) -> str:
        path = self.root / "sys/class/nvram/nv-config/keys" / key
        return path.read_text().strip() if path.exists() else "absent"

    def digest(self) -> str:
        return tree_digest(self.root, self.stick)

    def configs_are(self, wanted: dict) -> bool:
        return all(self.read(rel) == data for rel, data in wanted.items())

    def configs_valid(self) -> bool:
        ok = all(self.read(rel) in (STOCK[rel], PATCHED[rel]) for rel in STOCK if rel != "jci/sm/sm.conf")
        return ok and self.read("jci/sm/sm.conf") in SM_VARIANTS.values()

    def sm_is(self, variant: str) -> bool:
        return self.read("jci/sm/sm.conf") == SM_VARIANTS[variant]


SHIM = "data_persist/oem-aa-mod/libpatch-blmjciaapa.so"


def fresh(base: Path, name: str, custom=None, home=None) -> Car:
    car = Car(base / name)
    make_fixture(car.root)
    bs.build(car.stick, custom, home)
    return car


def custom_bundle(count: int) -> dict:
    """A selection of `count` designer pages (the starters, split into single pages) for a stick with custom pages."""
    import json
    sys.path.insert(0, str(HERE.parents[1] / "tools"))
    import meters_library as ml
    module = (HERE.parents[1] / "meters/designer/v3/model.mjs").as_uri()
    source = f'import * as M from {json.dumps(module)}; ' + """
      const out = M.names.map(name => { const s = M.defaults(); s.themes = [M.starter(name)]; s.initialTheme = s.themes[0].id; return s; });
      console.log(JSON.stringify(out));
    """
    projects = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", source], cwd=HERE.parents[1]))
    setups = [page for project in projects for page in ml.split_pages(project)][:count]
    items = [{"id": x["themes"][0]["id"], "sha256": sha(ml.encode(x)), "setup": x} for x in setups]
    return {"version": 1, "kind": "MetersThemeSelection", "producer": "MiatOff builder", "purpose": "design-archive",
            "items": items}


def main():
    print(f"mode: {'real dump files' if REAL else 'synthetic files'}"
          f"{', docker ' + DOCKER_IMAGE if DOCKER_IMAGE else ''}")
    check(len(bs.launcher_name().encode()) <= 255, "launcher name fits FAT32 (<=255 bytes)")
    check(b"\r" not in bs.payload()["aa-touch.sh"], "aa-touch.sh is written with LF endings")
    shim = bs.payload()["oem-aa-mod/libpatch-blmjciaapa.so"]
    check(sha(shim) == bs.pinned("SHIM_SHA256"), "stick carries the pinned oem-aa-mod 0.10.0 shim")
    wcp_rows = re.search(r"^SM_WCP_TABLE='(.*?)'", (bs.STICK / "aa-touch.sh").read_text(), re.M | re.S).group(1).split()
    check(not wcp_rows or (len(wcp_rows) == 128 and len(set(wcp_rows[1::2])) == 64
                           and wcp_rows[0::2] == sorted(sm_table())),
          "SM_WCP_TABLE is empty or 64 distinct variants in order")
    check(len(SAFETY_ROWS) == 46 and len(set(SAFETY_NAMES)) == 46
          and all(len(r) == 3 and r[2] == sha(SAFETY_BLANK) and r[1] != r[2] for r in SAFETY_ROWS),
          "SAFETY_TABLE: 46 SafetyText names, all to the MZD-AIO blank (some languages share one stock image)")
    check(all(bs.payload()["images/safety/" + n] == SAFETY_BLANK for n in SAFETY_NAMES),
          "stick carries the blank image once per SafetyText name")
    check(len(SENSOR_ROWS) == 44 and all(r[2] == sha(SENSOR_NEW[r[0]]) and r[1] != r[2] for r in SENSOR_ROWS)
          and all(bs.payload()["images/sensors/" + n] == SENSOR_NEW[n] for n in SENSOR_NAMES)
          and not any(n.startswith("HorizontalSensors/") for n in SENSOR_NAMES),
          "SENSOR_TABLE: 44 MZD-AIO images that differ from stock, on the stick, no HorizontalSensors arcs")
    if REAL and (DUMP4 / LIST2).is_file():
        check(sha(LIST2_STOCK_BYTES) == bs.pinned("LIST_STOCK"), "LIST_STOCK matches the dump's List2Ctrl.js")
        check(sha(LIST2_PATCHED_BYTES) == bs.pinned("LIST_PATCHED"), "LIST_PATCHED matches the Python delay edit")
    if REAL:
        sm_rows = dict(line.split() for line in re.search(
            r"^SM_TABLE='(.*?)'$", (bs.STICK / "aa-touch.sh").read_text(), re.M | re.S).group(1).split("\n"))
        check(sha(STOCK["jci/sm/sm.conf"]) == sm_rows["00"], "SM_TABLE 00 (stock) matches the dump")
        check(sha(PATCHED["jci/sm/sm.conf"]) == sm_rows["10"], "SM_TABLE 10 (AA touch) matches the Python edit")
        check(sha(STOCK["etc/aap_system_attributes.xml"]) == bs.pinned("XML_STOCK"), "XML_STOCK matches the dump")
        check(sha(PATCHED["etc/aap_system_attributes.xml"]) == bs.pinned("XML_PATCHED"), "XML_PATCHED matches")
        check(sha(STOCK["etc/aap_system_attributes_UCP.xml"]) == bs.pinned("UCP_STOCK"), "UCP_STOCK matches the dump")
        check(sha(PATCHED["etc/aap_system_attributes_UCP.xml"]) == bs.pinned("UCP_PATCHED"), "UCP_PATCHED matches")
        table = {}
        for line in re.search(r"^SM_TABLE='(.*?)'$", (bs.STICK / "aa-touch.sh").read_text(), re.M | re.S).group(1).split("\n"):
            code, digest = line.split()
            table[code] = digest
        py_table = {code: sha(data) for code, data in sm_table().items()}
        check(len(table) == 64 and (table == py_table or not REAL),
              "the 64 SM_TABLE hashes match the Python sm.conf edits (real stock file)")
        check(all(sha(SM_VARIANTS[k]) == py_table[k] for k in SM_VARIANTS), "SM_VARIANTS agree with sm_table()")
        if (DUMP3 / OPERA).is_file():
            check(sha(OPERA_STOCK_BYTES) == bs.pinned("OPERA_STOCK"), "OPERA_STOCK matches the dump's opera.ini")
            check(sha(OPERA_PATCHED_BYTES) == bs.pinned("OPERA_PATCHED"), "OPERA_PATCHED matches the Python edit")
            check(sha(GAP2_STOCK_BYTES) == bs.pinned("GAP2_STOCK"), "GAP2_STOCK matches the dump's stage_gap2.sh")
            check(sha(GAP2_PATCHED_BYTES) == bs.pinned("GAP2_PATCHED"), "GAP2_PATCHED matches the Python edit")
        if SYSAPP_REAL.is_file():
            check(sha(SYS_STOCK_BYTES) == bs.pinned("SYS_STOCK"), "SYS_STOCK matches the dump's systemApp.js")
            check(sha(SYS_PATCHED_BYTES) == bs.pinned("SYS_PATCHED"), "SYS_PATCHED matches the Python disclaimer edit")
            script_text = (HERE.parent / "stick/aa-touch.sh").read_text()
            pinned_sys = re.search(r"^SYS_TABLE='(.*?)'$", script_text, re.M | re.S).group(1)
            check(pinned_sys == SYS_TABLE_TEXT, "SYS_TABLE (66 systemApp.js files) matches the Python disclaimer and menu edits")
            if shutil.which("node"):
                js = Path(tempfile.mkdtemp(prefix="mo-js-")) / "systemApp.js"
                for label, data in (("patched", SYS_PATCHED_BYTES), ("menu all five", sysb(0, "v")), ("menu Stitcher + warning", sysb(1, "8")), ("menu on, nothing hidden", sysb(0, "w"))):
                    js.write_bytes(data)
                    r = subprocess.run(["node", "--check", str(js)], capture_output=True, text=True)
                    check(r.returncode == 0, f"{label} systemApp.js is valid JavaScript (node --check) {r.stderr[:200]}")
        aha = SM_VARIANTS["0v"].decode()
        check('value="blm_ira_aha"' not in aha and 'value="blm_ira_aha"' in STOCK["jci/sm/sm.conf"].decode(),
              "with Aha: no stage waits for blm_ira_aha any more")

    base = Path(tempfile.mkdtemp(prefix="mo-aa-"))
    try:
        # --- happy path
        car = fresh(base, "happy")
        stock_digest = car.digest()
        r = car.run("cancel")
        check(r.returncode == 0 and car.state() == "stock", f"stock unit is recognised ({car.state()})")
        check(car.digest() == stock_digest, "cancel changes nothing")

        r = car.run("remove")
        check(r.returncode != 0 and car.digest() == stock_digest, "REMOVE on a stock unit is refused")

        r = car.run("install")
        check(r.returncode == 0, f"install exits 0 ({r.returncode} {r.stderr[-300:]})")
        check(car.state() == "installed", f"state after install: {car.state()}")
        check(car.configs_are(PATCHED), "sm.conf and both XMLs are exactly the expected patched files")
        check(car.read(SHIM) == shim, "shim active in /data_persist/oem-aa-mod")
        check(car.read("data_persist/oem-aa-mod/libpatch.conf") == bs.payload()["oem-aa-mod/libpatch.conf"],
              "libpatch.conf (touch only) installed")
        backup = car.root / "data_persist/miatoff/aa-touch/backup"
        check(all((backup / Path(rel).name).read_bytes() == data for rel, data in STOCK.items()),
              "backup holds the three stock files")
        sm = car.read("jci/sm/sm.conf").decode()
        check(sm.count("LD_PRELOAD") == 1 and sm.count('reset_board="no"') == STOCK["jci/sm/sm.conf"].decode().count('reset_board="no"') + 1,
              "sm.conf: one LD_PRELOAD and one extra reset_board=no")
        log = (car.stick / "miatoff-aa-touch.log").read_text()
        check("lvds_speed_restriction=disable" in log, "log reports the TouchTune NVRAM key")
        check(not car.guard.exists(), "guard removed after run")

        r = car.run("install")
        check(r.returncode != 0 and car.state() == "installed", "INSTALL on an installed unit is refused")

        r = car.run("disable")
        check(r.returncode == 0 and car.state() == "disabled", f"disable works ({car.state()})")
        check(not (car.root / SHIM).exists() and (car.root / (SHIM + ".off")).exists(), "disable only renames the shim")
        check(car.configs_are(PATCHED), "disable leaves the configs alone")
        r = car.run("enable")
        check(r.returncode == 0 and car.state() == "installed", f"enable works ({car.state()})")

        r = car.run("remove")
        check(r.returncode == 0 and car.state() == "stock", f"remove exits 0 to stock ({car.state()})")
        check(car.digest() == stock_digest, "after remove the unit is byte-exact stock (files and dirs)")

        r = car.run("install")
        r = car.run("disable")
        r = car.run("remove")
        check(r.returncode == 0 and car.digest() == stock_digest, "remove from DISABLED is byte-exact stock")

        # --- power loss at every install step, then finish or remove
        for point in ("backup", "stage-shim", "stage-xml", "rename-xml", "stage-ucp", "rename-ucp",
                      "stage-sm", "rename-sm", "activate"):
            for then in ("install", "remove"):
                car = fresh(base, f"kill-{point}-{then}")
                stock_digest = car.digest()
                car.run("install", fault=f"kill:{point}")
                ok = car.configs_valid() and not (car.root / SHIM).exists()
                check(ok, f"power loss at {point}: configs stock-or-patched, shim not active")
                car.run("cancel")
                # Cut just before activation is exactly the DISABLED state.
                expected = ("disabled",) if point == "activate" else ("partial", "stock")
                check(car.state() in expected, f"power loss at {point}: state {car.state()}")
                if then == "install" and car.state() == "disabled":
                    then = "enable"
                r = car.run(then)
                if then in ("install", "enable"):
                    check(r.returncode == 0 and car.state() == "installed" and car.configs_are(PATCHED),
                          f"power loss at {point}: FINISH completes the install")
                else:
                    check(r.returncode == 0 and car.digest() == stock_digest,
                          f"power loss at {point}: REMOVE restores byte-exact stock")

        # --- power loss during remove
        for point in ("remove-config", "rename-sm", "rename-xml", "rename-ucp"):
            car = fresh(base, f"kill-remove-{point}")
            stock_digest = car.digest()
            car.run("install")
            car.run("remove", fault=f"kill:{point}")
            check(car.configs_valid() and not (car.root / SHIM).exists(),
                  f"power loss in remove at {point}: shim off first, configs valid")
            r = car.run("remove")
            check(r.returncode == 0 and car.digest() == stock_digest,
                  f"power loss in remove at {point}: second REMOVE gives byte-exact stock")

        # --- a failure mid-install rolls back automatically
        for point in ("rename-sm", "activate", "stage-ucp"):
            car = fresh(base, f"fail-{point}")
            stock_digest = car.digest()
            r = car.run("install", fault=f"fail:{point}")
            check(r.returncode != 0 and car.digest() == stock_digest,
                  f"failure at {point}: automatic rollback to byte-exact stock")

        # --- refusals: nothing may change
        def refused(name, mutate, action="install", extra=None):
            car = fresh(base, name)
            mutate(car)
            car.extra = extra or {}
            before = car.digest()
            r = car.run(action)
            check(r.returncode != 0 and car.digest() == before, f"refused, nothing changed: {name}")
            return car

        refused("sm.conf-one-byte-off", lambda c: write(c.root, "jci/sm/sm.conf", c.read("jci/sm/sm.conf") + b" "))
        refused("ucp-xml-edited", lambda c: write(c.root, "etc/aap_system_attributes_UCP.xml",
                                                  c.read("etc/aap_system_attributes_UCP.xml").replace(b"key_codes", b"key_codez")))
        refused("firmware-331", lambda c: write(c.root, "jci/version.ini",
                                                'JCI_SW_VER="MAZ_CMU-150_74.00.331"\nJCI_SW_VER_PATCH="A"\n'))
        refused("blmjciaapa-other-build", lambda c: write(c.root, "jci/aapa/blmjciaapa.so", BLM + b"x"))
        refused("aap_service-other-build", lambda c: write(c.root, "usr/bin/aap_service", AAP + b"x"))
        refused("unknown-sm-config-active", lambda c: write(c.root, "proc/252/cmdline",
                                                            b"/jci/sm/sm\x00-f\x00/jci/sm/smtestmode.conf\x00"))
        refused("no-service-manager", lambda c: (c.root / "proc/252/cmdline").unlink())
        refused("data_persist-read-only", lambda c: write(c.root, "proc/mounts",
                                                          "/dev/mmcblk0p2 /tmp/mnt/data_persist relfs ro 0 0\n"))
        refused("foreign-oem-aa-mod-file", lambda c: write(c.root, "data_persist/oem-aa-mod/libpatch-aap_service.so", b"x"))
        refused("other-shim-version", lambda c: write(c.root, SHIM, b"older shim"))
        refused("damaged-shim-on-stick", lambda c: write(c.stick, "oem-aa-mod/libpatch-blmjciaapa.so", shim[:-1]))
        car = refused("unknown-after-install", lambda c: (c.run("install"),
                      write(c.root, "etc/aap_system_attributes.xml", b"<x/>\n")), action="remove")
        check(car.state() == "unknown", "an edited file after install is reported as unknown")

        # --- wireless CarPlay: the Service Manager runs sm_WCP.conf, so only that one changes
        def wcp_car(name, wcp=WCP_STOCK):
            car = fresh(base, name)
            write(car.root, WCP, wcp)
            write(car.root, "proc/252/cmdline", WCP_CMDLINE)
            return car

        car = wcp_car("wcp")
        stock_digest = car.digest()
        sm_before = car.read("jci/sm/sm.conf")
        r = car.run("install")
        check(r.returncode == 0 and car.state() == "installed", f"WCP: install exits 0 ({car.state()} {r.stderr[-200:]})")
        check(car.read(WCP) == WCP_VARIANTS["10"] and b'reset_board="no" retry_count="0" ping_timeout="30000" args="new_hw">' in car.read(WCP),
              "WCP: sm_WCP.conf is exactly the patched file (args=\"new_hw\" kept)")
        check(car.read("jci/sm/sm.conf") == sm_before, "WCP: the unused sm.conf is not touched")
        check(car.configs_are({k: v for k, v in PATCHED.items() if k != "jci/sm/sm.conf"}), "WCP: both XMLs patched")
        wbackup = car.root / "data_persist/miatoff/aa-touch/backup"
        check((wbackup / "sm_WCP.conf").read_bytes() == WCP_STOCK and not (wbackup / "sm.conf").exists(),
              "WCP: the backup holds the stock sm_WCP.conf")
        check(car.state("sm config:") == "patched", "WCP: state report reads sm_WCP.conf")
        r = car.run("trim_on")
        check(r.returncode == 0 and car.read(WCP) == WCP_VARIANTS["1f"], "WCP: boot trim on top of AA touch")
        r = car.run("trim_off")
        r2 = car.run("remove")
        check(r.returncode == 0 and r2.returncode == 0 and car.digest() == stock_digest,
              "WCP: trim off and remove give byte-exact stock")

        car = wcp_car("wcp-trim")
        stock_digest = car.digest()
        r = car.run("trim_on")
        check(r.returncode == 0 and car.read(WCP) == WCP_VARIANTS["0f"] and car.read("jci/sm/sm.conf") == STOCK["jci/sm/sm.conf"],
              "WCP: boot trim alone edits sm_WCP.conf only")
        r = car.run("trim_off")
        check(r.returncode == 0 and car.digest() == stock_digest, "WCP: trim off gives byte-exact stock")

        for point in ("stage-sm", "rename-sm"):
            car = wcp_car(f"wcp-kill-{point}")
            stock_digest = car.digest()
            car.run("install", fault=f"kill:{point}")
            check(car.read(WCP) in (WCP_VARIANTS["00"], WCP_VARIANTS["10"]) and not (car.root / SHIM).exists(),
                  f"WCP: power loss at {point}: sm_WCP.conf stock or patched, shim off")
            r = car.run("remove")
            check(r.returncode == 0 and car.digest() == stock_digest, f"WCP: power loss at {point}: REMOVE gives byte-exact stock")

        refused("wcp-unknown-sm_WCP", lambda c: (write(c.root, WCP, WCP_STOCK + b" "),
                                                 write(c.root, "proc/252/cmdline", WCP_CMDLINE)))
        refused("wcp-stock-sm.conf-but-unknown-sm_WCP", lambda c: (write(c.root, WCP, b"<sm_config/>\n"),
                                                                   write(c.root, "proc/252/cmdline", WCP_CMDLINE)),
                action="trim_on")
        # Installed on sm.conf, then the unit switches to sm_WCP.conf: refused, and the report says why.
        car = fresh(base, "wcp-switched")
        car.run("install")
        write(car.root, WCP, WCP_STOCK)
        write(car.root, "proc/252/cmdline", WCP_CMDLINE)
        before = car.digest()
        r = car.run("remove")
        report = (car.stick / "aa-touch-state.txt").read_text()
        check(r.returncode != 0 and car.digest() == before and "the backup was made while the unit ran sm.conf" in report,
              "switched to sm_WCP.conf after an install: refused, the report explains")
        write(car.root, "proc/252/cmdline", b"/jci/sm/sm\x00-f\x00/jci/sm/sm.conf\x00-e\x00/tmp/smevents.txt\x00")
        r = car.run("remove")
        check(r.returncode == 0 and car.state() == "stock", "switched back to sm.conf: REMOVE works again")

        # As with an unknown sm.conf, an unknown active config is an unknown state: nothing changes.
        refused("wcp-unknown-sm_WCP-warning", lambda c: (write(c.root, WCP, WCP_STOCK + b" "),
                                                         write(c.root, "proc/252/cmdline", WCP_CMDLINE)),
                action="disc_off")
        car = wcp_car("wcp-sm.conf-line")
        write(car.root, WCP, SYNTH_SM)  # the sm.conf jciAAPA line in sm_WCP.conf: not a known sm_WCP.conf
        before = car.digest()
        r = car.run("install")
        check(r.returncode != 0 and car.digest() == before, "WCP: sm_WCP.conf with the sm.conf jciAAPA line is refused")

        # --- shorter list delay (List2Ctrl.js), alone and with AA touch
        car = fresh(base, "delay")
        stock_digest = car.digest()
        r = car.run("delay_off")
        check(r.returncode != 0 and car.digest() == stock_digest, "RESTORE refused while the list delay is stock")
        r = car.run("delay_on")
        check(r.returncode == 0 and car.read(LIST2) == LIST2_PATCHED_BYTES,
              f"delay on: List2Ctrl.js is exactly the patched file ({r.returncode})")
        stock_lines, patched_lines = LIST2_STOCK_BYTES.splitlines(), car.read(LIST2).splitlines()
        changed = sum(a != b for a, b in zip(stock_lines, patched_lines))
        check(car.read(LIST2).count(b"Timeout :                150,") == 1 and changed == 4 and len(stock_lines) == len(patched_lines),
              "delay on: only the four settings change (no line added or removed)")
        check((car.root / "data_persist/miatoff/aa-touch/List2Ctrl.js.stock").read_bytes() == LIST2_STOCK_BYTES,
              "delay on: the stock List2Ctrl.js is backed up")
        check(car.state() == "stock" and car.state("list delay:") == "patched", "delay on: AA stock, delay patched")
        r = car.run("install")
        r2 = car.run("remove")
        check(r.returncode == 0 and r2.returncode == 0 and car.read(LIST2) == LIST2_PATCHED_BYTES
              and (car.root / "data_persist/miatoff/aa-touch/List2Ctrl.js.stock").exists(),
              "AA install and remove keep the list delay and its backup")
        r = car.run("delay_off")
        check(r.returncode == 0 and car.digest() == stock_digest, "delay off: byte-exact stock")
        car = fresh(base, "delay-kill")
        stock_digest = car.digest()
        car.run("delay_on", fault="kill:rename-list")
        check(car.read(LIST2) == LIST2_STOCK_BYTES, "delay power loss at rename-list: List2Ctrl.js still stock")
        r = car.run("delay_on")
        check(r.returncode == 0 and car.read(LIST2) == LIST2_PATCHED_BYTES, "after the power loss, DELAY completes")
        r = car.run("delay_off")
        check(r.returncode == 0 and car.digest() == stock_digest, "and RESTORE gives byte-exact stock")
        refused("list2-unknown", lambda c: write(c.root, LIST2, LIST2_STOCK_BYTES + b"\n"), action="delay_on")

        # --- camera text (SafetyText images), alone, interrupted and with AA touch
        car = fresh(base, "safety")
        stock_digest = car.digest()
        imgs = lambda: {n: car.read(f"{NATIVE}/{n}") for n in SAFETY_NAMES}
        r = car.run("safety_off")
        check(r.returncode != 0 and car.digest() == stock_digest, "RESTORE refused while the camera text is stock")
        r = car.run("safety_on")
        check(r.returncode == 0 and all(v == SAFETY_BLANK for v in imgs().values()),
              f"safety on: all {len(SAFETY_NAMES)} images are the blank ({r.returncode} {r.stderr[-200:]})")
        check(car.read(f"{NATIVE}/Other.png") == b"\x89PNG not ours", "safety on: other images untouched")
        sbak = car.root / "data_persist/miatoff/aa-touch/safety"
        check(all((sbak / n).read_bytes() == SAFETY_STOCK[n] for n in SAFETY_NAMES), "safety on: the originals are backed up")
        check(car.state() == "stock" and car.state("camera text:") == "patched", "safety on: AA stock, camera text patched")
        r = car.run("safety_on")
        check(r.returncode != 0, "BLANK is refused when the text is already blank")
        car.run("install"); car.run("remove")
        check(all(v == SAFETY_BLANK for v in imgs().values()) and sbak.is_dir(), "AA install/remove keep the camera text")
        r = car.run("safety_off")
        check(r.returncode == 0 and car.digest() == stock_digest, "safety off: byte-exact stock, backup gone")

        third = SAFETY_NAMES[2]
        for then in ("safety_on", "safety_off"):
            car = fresh(base, f"safety-kill-{then}")
            stock_digest = car.digest()
            car.run("safety_on", fault=f"kill:put-safety-{third}")
            got = imgs()
            check(all(v in (SAFETY_STOCK[n], SAFETY_BLANK) for n, v in got.items())
                  and sum(v == SAFETY_BLANK for v in got.values()) == 2,
                  f"safety power loss at the 3rd image: every image stock or blank ({then})")
            car.run("cancel")
            check(car.state("camera text:") == "partial", f"safety power loss: state partial ({car.state('camera text:')})")
            r = car.run(then)
            if then == "safety_on":
                check(r.returncode == 0 and all(v == SAFETY_BLANK for v in imgs().values()), "partial: FINISH blanks the rest")
            else:
                check(r.returncode == 0 and car.digest() == stock_digest,
                      "partial: RESTORE gives byte-exact stock (the staged copy of the cut-off image is gone too)")
        car = fresh(base, "safety-kill-back")
        stock_digest = car.digest()
        car.run("safety_on")
        car.run("safety_off", fault=f"kill:put-safety-{third}")
        r = car.run("safety_off")
        check(r.returncode == 0 and car.digest() == stock_digest, "power loss while restoring: a second RESTORE gives stock")

        car = fresh(base, "safety-stale-backup")
        stock_digest = car.digest()
        car.run("install")
        car.run("safety_on")
        car.run("safety_off")
        # as if RESTORE was cut while it deleted the copies: one original left
        write(car.root, f"data_persist/miatoff/aa-touch/safety/{SAFETY_NAMES[0]}", SAFETY_STOCK[SAFETY_NAMES[0]])
        r = car.run("safety_on")
        r2 = car.run("safety_off")
        r3 = car.run("remove")
        check(r.returncode == 0 and r2.returncode == 0 and r3.returncode == 0 and car.digest() == stock_digest,
              "a half-removed backup with all images stock is rebuilt, not a dead end")
        car = fresh(base, "safety-stale-backup-aa-stock")
        stock_digest = car.digest()
        write(car.root, f"data_persist/miatoff/aa-touch/safety/{SAFETY_NAMES[0]}", SAFETY_STOCK[SAFETY_NAMES[0]])
        r = car.run("cancel")
        check(r.returncode == 0 and car.state() == "stock" and car.digest() == stock_digest,
              "with AA stock, a leftover camera-text backup folder is tidied at the next run")

        # power loss inside backup creation and removal: never a fake half-done AA install
        for action, point, then in (("delay_on", "backup-list", "delay_on"), ("safety_on", "image-backup-safety", "safety_on"),
                                    ("safety_off", "image-unbackup-safety", "safety_on")):
            car = fresh(base, f"kill-{point}")
            stock_digest = car.digest()
            if action == "safety_off":
                car.run("safety_on")
            car.run(action, fault=f"kill:{point}")
            car.run("cancel")
            check(car.state() == "stock", f"power loss at {point}: AA touch still reads stock ({car.state()})")
            r = car.run(then)
            off = "delay_off" if then == "delay_on" else "safety_off"
            r2 = car.run(off)
            check(r.returncode == 0 and r2.returncode == 0 and car.digest() == stock_digest,
                  f"power loss at {point}: the feature works afterwards and RESTORE gives byte-exact stock")
        car = fresh(base, "stale-feature-backup")
        stock_digest = car.digest()
        write(car.root, "data_persist/miatoff/aa-touch/List2Ctrl.js.stock.new", b"half a copy")
        r = car.run("cancel")
        check(r.returncode == 0 and car.digest() == stock_digest, "leftover feature backups with everything stock are tidied")
        car = fresh(base, "unknown-keeps-backup")
        car.run("delay_on")
        car.run("install")
        write(car.root, LIST2, LIST2_STOCK_BYTES + b"// another mod\n")
        car.run("remove")
        check((car.root / "data_persist/miatoff/aa-touch/List2Ctrl.js.stock").read_bytes() == LIST2_STOCK_BYTES,
              "AA REMOVE keeps the List2Ctrl.js backup while the file is unknown (the only good copy)")

        # --- parking sensors (images in two folders), the same image-set machinery
        car = fresh(base, "sensors")
        stock_digest = car.digest()
        simgs = lambda c: {n: c.read(f"{NATIVE}/{n}") for n in SENSOR_NAMES}
        r = car.run("sensors_on")
        check(r.returncode == 0 and simgs(car) == SENSOR_NEW, f"sensors on: all {len(SENSOR_NAMES)} images are MZD-AIO's ({r.returncode})")
        check(car.read(f"{NATIVE}/HorizontalSensors/BackCtr_1_lg.png") == b"\x89PNG v74 arc, not replaced"
              and all(car.read(f"{NATIVE}/{n}") == SAFETY_STOCK[n] for n in SAFETY_NAMES),
              "sensors on: other images and the safety text untouched")
        check(all((car.root / "data_persist/miatoff/aa-touch/sensors" / n).read_bytes() == SENSOR_STOCK[n] for n in SENSOR_NAMES),
              "sensors on: originals backed up in their folders")
        r = car.run("safety_on")
        r2 = car.run("sensors_off")
        check(r.returncode == 0 and r2.returncode == 0 and car.state("camera text:") == "patched"
              and car.state("sensors:") == "stock", "sensors and camera text are independent")
        r = car.run("safety_off")
        check(r.returncode == 0 and car.digest() == stock_digest, "sensors off and safety off: byte-exact stock")
        car = fresh(base, "sensors-kill")
        stock_digest = car.digest()
        mid = SENSOR_NAMES[len(SENSOR_NAMES) // 2]
        car.run("sensors_on", fault=f"kill:put-sensors-{mid}")
        car.run("cancel")
        check(car.state("sensors:") == "partial", f"sensors power loss halfway: partial ({car.state('sensors:')})")
        r = car.run("sensors_off")
        check(r.returncode == 0 and car.digest() == stock_digest, "sensors partial: RESTORE gives byte-exact stock")
        for point in ("image-unbackup-sensors", "image-rmdir-sensors"):
            car = fresh(base, f"kill-{point}")
            stock_digest = car.digest()
            car.run("sensors_on")
            car.run("sensors_off", fault=f"kill:{point}")
            car.run("cancel")
            r = car.run("sensors_on")
            r2 = car.run("sensors_off")
            check(car.state() == "stock" and r.returncode == 0 and r2.returncode == 0 and car.digest() == stock_digest,
                  f"power loss at {point}: SENSORS works afterwards and RESTORE gives byte-exact stock")
        refused("sensors-unknown-image", lambda c: write(c.root, f"{NATIVE}/{SENSOR_NAMES[3]}", b"other"), action="sensors_on")

        refused("safety-unknown-image", lambda c: write(c.root, f"{NATIVE}/{SAFETY_NAMES[5]}", b"\x89PNG other"), action="safety_on")
        refused("safety-image-missing", lambda c: (c.root / NATIVE / SAFETY_NAMES[7]).unlink(), action="safety_on")
        refused("safety-damaged-blank-on-stick", lambda c: write(c.stick, f"images/safety/{SAFETY_NAMES[9]}", SAFETY_BLANK[:-1]),
                action="safety_on")
        car = refused("safety-bad-backup", lambda c: (c.run("safety_on"),
                      write(c.root, f"data_persist/miatoff/aa-touch/safety/{SAFETY_NAMES[0]}", b"x")), action="safety_off")

        # --- boot trim: on its own, combined with AA touch, and back
        car = fresh(base, "trim")
        stock_digest = car.digest()
        r = car.run("trim_off")
        check(r.returncode != 0 and car.digest() == stock_digest, "RESTORE is refused while the trim is off")
        r = car.run("trim_on")
        check(r.returncode == 0 and car.sm_is("0f"), f"trim on: sm.conf has exactly the 8 autorun=no edits ({r.returncode})")
        check(car.state() == "stock" and car.state("boot trim:") == "on", "trim on: AA stock, trim on")
        check(car.configs_are({k: v for k, v in STOCK.items() if k != "jci/sm/sm.conf"}), "trim leaves the XMLs alone")
        check((car.root / "data_persist/miatoff/aa-touch/backup/sm.conf").read_bytes() == STOCK["jci/sm/sm.conf"],
              "trim on: stock sm.conf backed up first")
        r = car.run("trim_on")
        check(r.returncode != 0 and car.sm_is("0f"), "UITZETTEN is refused while the trim is on")
        r = car.run("install")
        check(r.returncode == 0 and car.state() == "installed" and car.sm_is("1f"),
              "AA install keeps the trim (sm.conf = AA + trim)")
        r = car.run("disable")
        r = car.run("enable")
        check(car.state() == "installed" and car.sm_is("1f"), "disable/enable keep the trim")
        r = car.run("trim_off")
        check(r.returncode == 0 and car.sm_is("10") and car.state() == "installed",
              "trim off with AA installed: sm.conf = AA only")
        r = car.run("trim_on")
        check(r.returncode == 0 and car.sm_is("1f"), "trim on with AA installed")
        r = car.run("remove")
        check(r.returncode == 0 and car.sm_is("0f") and car.state() == "stock" and car.state("boot trim:") == "on",
              "AA remove keeps the trim and its backup")
        r = car.run("trim_off")
        check(r.returncode == 0 and car.digest() == stock_digest, "trim off after everything: byte-exact stock")

        # --- trim level 2 (with Aha): every transition, with and without AA touch
        car = fresh(base, "trim-aha")
        stock_digest = car.digest()
        steps = [("trim_aha", "0v", "aha"), ("trim_on", "0f", "on"), ("trim_aha", "0v", "aha"),
                 ("install", "1v", "aha"), ("trim_on", "1f", "on"), ("trim_aha", "1v", "aha"),
                 ("disable", "1v", "aha"), ("enable", "1v", "aha"), ("trim_off", "10", "off"),
                 ("trim_aha", "1v", "aha"), ("remove", "0v", "aha")]
        for action, variant, trim in steps:
            r = car.run(action)
            check(r.returncode == 0 and car.sm_is(variant) and car.state("boot trim:") == trim,
                  f"Aha level: {action} -> sm.conf variant {variant}, trim {trim} ({r.returncode}, {car.state('boot trim:')})")
        r = car.run("trim_aha")
        check(r.returncode != 0 and car.sm_is("0v"), "MET AHA is refused while Aha is already off")
        r = car.run("trim_off")
        check(r.returncode == 0 and car.digest() == stock_digest, "Aha level off after everything: byte-exact stock")

        for point in ("stage-sm", "rename-sm"):
            car = fresh(base, f"aha-kill-{point}")
            stock_digest = car.digest()
            car.run("trim_on")
            car.run("trim_aha", fault=f"kill:{point}")
            car.run("cancel")
            check(car.sm_is("0f") and car.state("boot trim:") == "on",
                  f"Aha power loss at {point}: sm.conf still the level-1 trim")
            if point == "rename-sm":   # a staged file was left: the unit shows FINISH/REMOVE
                check(car.state() == "partial", f"Aha power loss at {point}: leftover recognised")
                r = car.run("remove")
                check(r.returncode == 0 and car.state() == "stock" and car.sm_is("0f"),
                      f"Aha power loss at {point}: REMOVE cleans up and keeps the level-1 trim")
            else:                      # nothing written yet
                check(car.state() == "stock", f"Aha power loss at {point}: nothing changed ({car.state()})")
            r = car.run("trim_aha")
            check(r.returncode == 0 and car.sm_is("0v"), f"Aha power loss at {point}: MET AHA afterwards")
            r = car.run("trim_off")
            check(r.returncode == 0 and car.digest() == stock_digest,
                  f"Aha power loss at {point}: back to byte-exact stock")

        for point in ("stage-sm", "rename-sm"):
            car = fresh(base, f"trim-kill-{point}")
            stock_digest = car.digest()
            car.run("trim_on", fault=f"kill:{point}")
            check(car.configs_valid() and car.sm_is("00"), f"trim power loss at {point}: sm.conf still stock")
            car.run("cancel")
            check(car.state() == "partial", f"trim power loss at {point}: recognised ({car.state()})")
            r = car.run("remove")
            check(r.returncode == 0 and car.digest() == stock_digest,
                  f"trim power loss at {point}: REMOVE gives byte-exact stock")
            car = fresh(base, f"trim-aa-kill-{point}")
            car.run("install")
            car.run("trim_on", fault=f"kill:{point}")
            car.run("cancel")
            # Before staging nothing is written yet (the backup already exists).
            expected = "installed" if point == "stage-sm" else "partial"
            check(car.sm_is("10") and car.state() == expected,
                  f"trim power loss at {point} with AA: AA intact ({car.state()})")
            if car.state() == "partial":
                r = car.run("install")
                check(r.returncode == 0 and car.state() == "installed", f"trim power loss at {point} with AA: FINISH")
            r = car.run("trim_on")
            check(r.returncode == 0 and car.sm_is("1f"), f"trim power loss at {point} with AA: trim on afterwards")

        car = fresh(base, "trim-fail")
        stock_digest = car.digest()
        r = car.run("trim_on", fault="fail:rename-sm")
        check(r.returncode != 0 and car.digest() == stock_digest, "trim failure: nothing left behind (byte-exact stock)")

        car = fresh(base, "trim-one-off")
        write(car.root, "jci/sm/sm.conf", SM_VARIANTS["0f"] + b" ")
        before = car.digest()
        r = car.run("trim_off")
        check(r.returncode != 0 and car.digest() == before, "an edited trimmed sm.conf is refused")

        # --- startup warning (systemApp.js), alone and together with AA touch and the trim
        car = fresh(base, "disc")
        stock_digest = car.digest()
        backup = car.root / "data_persist/miatoff/aa-touch/systemApp.js.stock"
        r = car.run("disc_on")
        check(r.returncode != 0 and car.digest() == stock_digest, "RESTORE refused while the warning is stock")
        r = car.run("disc_off")
        check(r.returncode == 0 and car.read(SYSAPP) == SYS_PATCHED_BYTES,
              f"warning off: systemApp.js is exactly the patched file ({r.returncode})")
        check(car.state("disclaimer:") == "patched" and car.state() == "stock", "warning off: AA still stock")
        check(backup.exists() and backup.read_bytes() == SYS_STOCK_BYTES, "warning off: stock systemApp.js backed up")
        check(car.configs_are(STOCK), "warning patch leaves sm.conf and the XMLs alone")
        r = car.run("disc_off")
        check(r.returncode != 0, "WEGHALEN refused while the warning is already off")
        for action in ("install", "trim_aha", "disable", "enable", "trim_off", "remove"):
            r = car.run(action)
            check(r.returncode == 0 and car.read(SYSAPP) == SYS_PATCHED_BYTES,
                  f"{action} keeps the warning patch ({r.returncode}, {car.state()})")
        check(car.state() == "stock" and backup.exists(), "after AA remove: AA stock, warning backup kept")
        r = car.run("disc_on")
        check(r.returncode == 0 and car.digest() == stock_digest, "warning back on: byte-exact stock")

        car = fresh(base, "disc-with-aa")
        stock_digest = car.digest()
        car.run("install")
        car.run("disc_off")
        car.run("remove")
        check(car.state() == "stock" and car.read(SYSAPP) == SYS_PATCHED_BYTES, "AA remove keeps the warning patch")
        r = car.run("disc_on")
        check(r.returncode == 0 and car.digest() == stock_digest, "then warning on: byte-exact stock")

        for point in ("stage-sys", "rename-sys"):
            car = fresh(base, f"disc-kill-{point}")
            stock_digest = car.digest()
            car.run("disc_off", fault=f"kill:{point}")
            check(car.read(SYSAPP) in (SYS_STOCK_BYTES, SYS_PATCHED_BYTES),
                  f"warning power loss at {point}: systemApp.js stock or patched, never half")
            car.run("cancel")
            if car.state() == "partial":
                r = car.run("remove")
                check(r.returncode == 0 and car.digest() == stock_digest,
                      f"warning power loss at {point}: REMOVE gives byte-exact stock")
            else:
                r = car.run("disc_off")
                check(r.returncode == 0 and car.read(SYSAPP) == SYS_PATCHED_BYTES,
                      f"warning power loss at {point}: WEGHALEN afterwards ({car.state()})")
                r = car.run("disc_on")
                check(r.returncode == 0 and car.digest() == stock_digest,
                      f"warning power loss at {point}: back to byte-exact stock")

        car = fresh(base, "disc-fail")
        stock_digest = car.digest()
        r = car.run("disc_off", fault="fail:rename-sys")
        check(r.returncode != 0 and car.digest() == stock_digest, "warning failure: nothing left behind")

        car = fresh(base, "disc-unknown")
        write(car.root, SYSAPP, SYS_STOCK_BYTES + b" ")
        before = car.digest()
        r = car.run("disc_off")
        check(r.returncode != 0 and car.digest() == before, "an edited systemApp.js is refused")
        r = car.run("install")
        check(r.returncode == 0 and car.state() == "installed", "an unknown systemApp.js does not block AA touch")

        # --- Meters: needs real symlinks (live.txt), so only under BusyBox in Docker
        if not DOCKER_IMAGE:
            print("SKIP  Meters scenarios: they need real symlinks (run with MO_DOCKER_IMAGE=busybox:1.25)")
        else:
            payload = bs.payload()
            app_dir = "jci/gui/apps/miatoff"
            js_dir = "jci/opera/opera_dir/userjs-miatoff"

            def meters_files_ok(c):
                ok = True
                for name, data in payload.items():
                    if name.startswith("miatoff-app/app/"):
                        ok &= (c.root / app_dir / name[len("miatoff-app/app/"):]).read_bytes() == data
                    elif name.startswith("miatoff-app/userjs/"):
                        ok &= (c.root / js_dir / name[len("miatoff-app/userjs/"):]).read_bytes() == data
                return ok

            car = fresh(base, "meters")
            stock_digest = car.digest()
            r = car.run("meters_off")
            check(r.returncode != 0 and car.digest() == stock_digest, "Meters REMOVE refused while off")
            r = car.run("meters_on")
            check(r.returncode == 0 and car.state("meters:") == "on", f"Meters on ({r.returncode}, {car.state('meters:')})")
            check(car.read(OPERA) == OPERA_PATCHED_BYTES and car.read(GAP2) == GAP2_PATCHED_BYTES,
                  "opera.ini and stage_gap2.sh are exactly the patched files")
            check(meters_files_ok(car), "app and userscript folders hold exactly the stick's files")
            check((car.root / "jci/opera/opera_dir/userjs/fps.js").exists(), "stock fps.js left alone")
            check(car.state() == "stock" and car.configs_are(STOCK), "Meters leaves AA touch and sm.conf alone")
            r = car.run("meters_on")
            check(r.returncode != 0, "INSTALL refused while Meters is on")
            for action in ("install", "trim_on", "disc_off", "remove", "trim_off", "disc_on"):
                r = car.run(action)
                check(r.returncode == 0 and car.state("meters:") == "on", f"{action} keeps Meters ({r.returncode})")
            r = car.run("meters_off")
            check(r.returncode == 0 and car.digest() == stock_digest, "Meters off after everything: byte-exact stock")

            # Updating: a newer page on the stick makes the install "partial"; REPAIR updates it.
            car = fresh(base, "meters-update")
            stock_digest = car.digest()
            car.run("meters_on")
            data_js = car.stick / "miatoff-app/app/meters/js/data.js"
            data_js.write_bytes(data_js.read_bytes() + b"\n// newer\n")
            manifest = car.stick / "miatoff-app/MANIFEST"
            lines = [l for l in manifest.read_text().splitlines() if not l.endswith("  app/meters/js/data.js")]
            lines.append(f"{sha(data_js.read_bytes())}  app/meters/js/data.js")
            manifest.write_text("\n".join(lines) + "\n", newline="\n")
            car.run("cancel")
            check(car.state("meters:") == "partial", f"older install recognised as partial ({car.state('meters:')})")
            r = car.run("meters_on")
            check(r.returncode == 0 and car.state("meters:") == "on" and
                  (car.root / app_dir / "meters/js/data.js").read_bytes() == data_js.read_bytes(),
                  "REPAIR installs the newer page")
            r = car.run("meters_off")
            check(r.returncode == 0 and car.digest() == stock_digest, "then REMOVE: byte-exact stock")

            # Custom designer pages travel inside the Meters payload: install, change the selection (the car sees an
            # older Meters, "partial"), REPAIR updates the pages, REMOVE gives byte-exact stock.
            chosen = custom_bundle(3)
            custom_payload = bs.payload(chosen)
            check(custom_payload["miatoff-app/app/meters/js/custom-pages.js"] != payload["miatoff-app/app/meters/js/custom-pages.js"],
                  "the custom stick carries generated pages")
            car = fresh(base, "meters-custom", chosen)
            stock_digest = car.digest()
            r = car.run("meters_on")
            pages_on_car = car.root / app_dir / "meters/js/custom-pages.js"
            check(r.returncode == 0 and car.state("meters:") == "on" and
                  pages_on_car.read_bytes() == custom_payload["miatoff-app/app/meters/js/custom-pages.js"],
                  f"Meters with custom pages installs the generated pages ({r.returncode}, {car.state('meters:')})")
            check(b"window.MeterCustomPages = [{" in pages_on_car.read_bytes(), "the pages file on the car holds the pages")
            check((car.root / app_dir / "meters/js/custom.js").read_bytes() == payload["miatoff-app/app/meters/js/custom.js"] and
                  (car.root / app_dir / "meters/fonts/Rajdhani-Bold.ttf").is_file() and
                  (car.root / app_dir / "meters/fonts/RussoOne-Regular.ttf").is_file(),
                  "the renderer and both extra fonts are on the car")
            check(car.read(OPERA) == OPERA_PATCHED_BYTES and car.read(GAP2) == GAP2_PATCHED_BYTES,
                  "custom pages: opera.ini and stage_gap2.sh are still exactly the patched files")
            # A newer stick (another selection) in the same car.
            shutil.rmtree(car.stick / "miatoff-app")
            for name, data in bs.payload(custom_bundle(2)).items():
                if name.startswith("miatoff-app/"):
                    target = car.stick / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
            car.run("cancel")
            check(car.state("meters:") == "partial", f"a changed selection is recognised as partial ({car.state('meters:')})")
            r = car.run("meters_on")
            check(r.returncode == 0 and car.state("meters:") == "on" and
                  pages_on_car.read_bytes() == bs.payload(custom_bundle(2))["miatoff-app/app/meters/js/custom-pages.js"],
                  "REPAIR installs the changed pages")
            r = car.run("meters_off")
            check(r.returncode == 0 and car.digest() == stock_digest, "custom pages: REMOVE gives byte-exact stock")
            # A stick with no pages replaces them too (empty selection).
            car = fresh(base, "meters-custom-clear", chosen)
            car.run("meters_on")
            shutil.rmtree(car.stick / "miatoff-app")
            for name, data in bs.payload().items():
                if name.startswith("miatoff-app/"):
                    target = car.stick / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
            car.run("cancel")
            r = car.run("meters_on")
            check(r.returncode == 0 and car.state("meters:") == "on" and
                  (car.root / app_dir / "meters/js/custom-pages.js").read_bytes().endswith(b"window.MeterCustomImages = {};\n") and
                  b"MeterCustomPages = [];" in (car.root / app_dir / "meters/js/custom-pages.js").read_bytes(),
                  "REPAIR with no pages removes the CUSTOM group")
            # A custom pages file damaged on the stick is refused like any other Meters file.
            car = fresh(base, "meters-custom-bad", chosen)
            stock_digest = car.digest()
            damaged = car.stick / "miatoff-app/app/meters/js/custom-pages.js"
            damaged.write_bytes(damaged.read_bytes() + b" ")
            r = car.run("meters_on")
            check(r.returncode != 0 and car.digest() == stock_digest, "damaged custom pages file on the stick: refused")

            # A Home menu travels in the same payload: its script and design in the userscript folder, its pictures
            # in app/home. Install, change to a menu with pictures (the car sees an older Meters), go back to no
            # menu, REMOVE gives byte-exact stock; a damaged design on the stick is refused.
            sys.path.insert(0, str(HERE.parents[1] / "tools"))
            sys.path.insert(0, str(HERE.parents[1] / "tools" / "tests"))
            import home_menu
            from test_home_menu import pictured

            def put_payload(car, home=None):
                shutil.rmtree(car.stick / "miatoff-app")
                for name, data in bs.payload(None, home).items():
                    if name.startswith("miatoff-app/"):
                        target = car.stick / name
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes(data)
                car.run("cancel")

            menu = home_menu.STARTERS["starter-track"]
            home_payload = bs.payload(None, menu)
            car = fresh(base, "meters-home", None, menu)
            stock_digest = car.digest()
            r = car.run("meters_on")
            check(r.returncode == 0 and car.state("meters:") == "on" and
                  (car.root / js_dir / "miatoff-home.js").read_bytes() == home_payload["miatoff-app/userjs/miatoff-home.js"] and
                  (car.root / js_dir / "miatoff-home-design.js").read_bytes() == home_payload["miatoff-app/userjs/miatoff-home-design.js"] and
                  (car.root / js_dir / "miatoff-apps.js").is_file(),
                  f"Meters with a Home menu installs its script and design beside the Meters userscript ({car.state('meters:')})")
            check(car.read(OPERA) == OPERA_PATCHED_BYTES and car.read(GAP2) == GAP2_PATCHED_BYTES,
                  "Home menu: opera.ini and stage_gap2.sh are still exactly the patched files")
            with_pictures = bs.payload(None, pictured())
            put_payload(car, pictured())
            check(car.state("meters:") == "partial", f"another Home menu is recognised as partial ({car.state('meters:')})")
            r = car.run("meters_on")
            pictures = sorted(n for n in with_pictures if n.startswith("miatoff-app/app/home/"))
            check(r.returncode == 0 and car.state("meters:") == "on" and len(pictures) == 3 and
                  all((car.root / app_dir / n[len("miatoff-app/app/"):]).read_bytes() == with_pictures[n] for n in pictures),
                  "REPAIR installs the changed menu and its pictures")
            put_payload(car, None)
            r = car.run("meters_on")
            check(r.returncode == 0 and car.state("meters:") == "on" and
                  not (car.root / js_dir / "miatoff-home.js").exists() and not (car.root / app_dir / "home").exists(),
                  "REPAIR without a menu takes the Home menu away (Mazda's Home again)")
            r = car.run("meters_off")
            check(r.returncode == 0 and car.digest() == stock_digest, "Home menu: REMOVE gives byte-exact stock")
            car = fresh(base, "meters-home-bad", None, menu)
            stock_digest = car.digest()
            damaged = car.stick / "miatoff-app/userjs/miatoff-home-design.js"
            damaged.write_bytes(damaged.read_bytes().replace(b"METERS", b"METERZ"))
            r = car.run("meters_on")
            check(r.returncode != 0 and car.digest() == stock_digest, "damaged Home menu design on the stick: refused")

            for point in ("rename-app", "rename-userjs", "stage-gap2", "rename-gap2", "stage-opera", "rename-opera"):
                car = fresh(base, f"meters-kill-{point}")
                stock_digest = car.digest()
                car.run("meters_on", fault=f"kill:{point}")
                check(car.read(OPERA) in (OPERA_STOCK_BYTES, OPERA_PATCHED_BYTES) and
                      car.read(GAP2) in (GAP2_STOCK_BYTES, GAP2_PATCHED_BYTES),
                      f"Meters power loss at {point}: opera.ini and stage_gap2.sh never half")
                car.run("cancel")
                state = car.state("meters:")
                check(state in ("partial", "off"), f"Meters power loss at {point}: recognised ({state})")
                r = car.run("meters_on")
                check(r.returncode == 0 and car.state("meters:") == "on", f"Meters power loss at {point}: REPAIR")
                r = car.run("meters_off")
                check(r.returncode == 0 and car.digest() == stock_digest,
                      f"Meters power loss at {point}: then byte-exact stock")

            for point in ("stage-opera", "rename-opera", "stage-gap2", "rename-gap2"):
                car = fresh(base, f"meters-off-kill-{point}")
                stock_digest = car.digest()
                car.run("meters_on")
                car.run("meters_off", fault=f"kill:{point}")
                car.run("cancel")
                state = car.state("meters:")
                check(state in ("partial", "on") and car.state() == "stock",
                      f"Meters removal power loss at {point}: recognised ({state}), AA touch untouched")
                r = car.run("meters_off")
                check(r.returncode == 0 and car.digest() == stock_digest,
                      f"Meters removal power loss at {point}: REMOVE gives byte-exact stock")

            # The collector started at boot runs from the app folder and keeps its
            # script open. REPAIR and REMOVE must stop it first (never
            # smdb-read), or root cannot go read-only (seen in the car, 28-10-2026).
            def collector_car(name):
                car = fresh(base, name)
                stock = car.digest()
                car.run("meters_on")
                (car.tmp / "fakedbus").write_text("#!/bin/sh\nwhile :; do sleep 1; done\n", newline="\n")
                (car.tmp / "fakesmdb").write_text(
                    "#!/bin/sh\necho start >> /w/smdb.txt\nsleep 2\necho 'YawRate (int, 4): 2048'\n"
                    "echo done >> /w/smdb.txt\n", newline="\n")
                return car, stock

            collector_pre = (
                "chmod 755 /w/fakedbus /w/fakesmdb\n"
                "MO_OUT_DIR=/w/root/tmp/miatoff MO_DBUS_MONITOR=/w/fakedbus MO_SMDB_READ=/w/fakesmdb MO_SLOW_S=1 "
                "sh /w/root/jci/gui/apps/miatoff/collector/miatoff-collector.sh </dev/null >/dev/null 2>&1 &\n"
                "sleep 4")
            collector_post = (
                "sleep 3\n"
                "ls -l /proc/[0-9]*/fd/ 2>/dev/null | grep '/w/root' | grep -c deleted > /w/deleted.txt\n"
                "ps | grep -v grep | grep -c miatoff-collector > /w/running.txt\n"
                "rm -rf /w/root/tmp/miatoff")

            def collector_checks(car, what):
                smdb = (car.tmp / "smdb.txt").read_text().split() if (car.tmp / "smdb.txt").exists() else []
                log = (car.stick / "miatoff-aa-touch.log").read_text()
                check("stopping the Meters collector" in log, f"{what}: the running collector is stopped first")
                check((car.tmp / "running.txt").read_text().strip() == "0", f"{what}: no collector process left")
                check((car.tmp / "deleted.txt").read_text().strip() == "0",
                      f"{what}: no deleted file kept open on root (root can go read-only)")
                check(smdb and smdb.count("start") == smdb.count("done"),
                      f"{what}: every smdb-read finished on its own ({smdb.count('start')} started)")

            car, stock_digest = collector_car("meters-collector-update")
            data_js = car.stick / "miatoff-app/app/meters/js/data.js"
            data_js.write_bytes(data_js.read_bytes() + b"\n// newer\n")
            manifest = car.stick / "miatoff-app/MANIFEST"
            lines = [l for l in manifest.read_text().splitlines() if not l.endswith("  app/meters/js/data.js")]
            lines.append(f"{sha(data_js.read_bytes())}  app/meters/js/data.js")
            manifest.write_text("\n".join(lines) + "\n", newline="\n")
            r = car.run("meters_on", pre=collector_pre, post=collector_post)
            check(r.returncode == 0 and car.state("meters:") == "on", f"REPAIR with the collector running ({r.returncode})")
            collector_checks(car, "REPAIR")

            car, stock_digest = collector_car("meters-collector-remove")
            r = car.run("meters_off", pre=collector_pre, post=collector_post)
            check(r.returncode == 0 and car.digest() == stock_digest,
                  f"REMOVE with the collector running: byte-exact stock ({r.returncode})")
            collector_checks(car, "REMOVE")

            car = fresh(base, "meters-fail")
            stock_digest = car.digest()
            r = car.run("meters_on", fault="fail:rename-opera")
            check(r.returncode != 0 and car.digest() == stock_digest, "Meters failure: rolled back to byte-exact stock")

            car = fresh(base, "meters-bad-stick")
            stock_digest = car.digest()
            js = car.stick / "miatoff-app/userjs/miatoff-apps.js"
            js.write_bytes(js.read_bytes() + b" ")
            r = car.run("meters_on")
            check(r.returncode != 0 and car.digest() == stock_digest, "damaged Meters file on the stick: refused")

            car = fresh(base, "meters-unknown")
            write(car.root, OPERA, OPERA_STOCK_BYTES + b"\n")
            before = car.digest()
            r = car.run("meters_on")
            check(r.returncode != 0 and car.digest() == before, "an edited opera.ini is refused")

            # Emergency: MIATOFF-RESTORE on the stick takes back Meters and the warning patch.
            car = fresh(base, "restore")
            stock_digest = car.digest()
            car.run("meters_on")
            car.run("disc_off")
            car.run("delay_on")
            car.run("install")
            (car.stick / "MIATOFF-RESTORE").write_text("")
            r = car.run("cancel")
            check(r.returncode == 0 and car.state("meters:") == "off" and car.state("disclaimer:") == "stock"
                  and car.state("list delay:") == "stock" and car.state() == "installed",
                  f"MIATOFF-RESTORE reverts Meters and the warning, keeps AA touch ({car.state('meters:')})")
            before = car.digest()
            r = car.run("cancel")
            log = (car.stick / "miatoff-aa-touch.log").read_text()
            check(r.returncode == 0 and car.digest() == before and "nothing to revert" in log,
                  "MIATOFF-RESTORE left on the stick: nothing to do, no restart")
            (car.stick / "MIATOFF-RESTORE").unlink()
            r = car.run("remove")
            check(r.returncode == 0 and car.digest() == stock_digest, "after the emergency: byte-exact stock")

        # --- one stick: step 1 TouchTune (real 1.2.1 release, its test mode), step 2 AA touch
        car = fresh(base, "touchtune-handoff")
        common = "jci/gui/common/js/Common.js"
        car.run("cancel")
        check(car.state("TouchTune:") == "stock", f"TouchTune state read from Common.js ({car.state('TouchTune:')})")
        r = car.run("tt_remove")
        check(r.returncode != 0 and car.read(common) == COMMON_STOCK,
              "TT REMOVE is refused while TouchTune is not installed")
        r = car.run("tt_install")
        log = (car.stick / "miatoff-aa-touch.log").read_text()
        check(r.returncode == 0, f"step 1: TouchTune install exits 0 ({r.returncode}) {log[-800:] if r.returncode else ''}")
        check(car.read(common) == COMMON_PATCHED, "step 1: Common.js is the TouchTune file")
        check(car.nvram("bus_bcm_speed_restriction") == "disable" and car.nvram("lvds_speed_restriction") == "disable",
              "step 1: both NVRAM speed keys are disable")
        check(car.configs_are(STOCK) and not (car.root / "data_persist/oem-aa-mod").exists(),
              "step 1 leaves the Android Auto files stock")
        check(car.state() == "stock" and car.state("TouchTune:") == "installed",
              "after step 1: AA stock, TouchTune installed")
        r = car.run("tt_install")
        check(r.returncode != 0, "TouchTune is not offered twice")
        r = car.run("install")
        check(r.returncode == 0 and car.state() == "installed" and car.configs_are(PATCHED),
              "step 2: AA touch installs next to TouchTune")
        check(car.read(common) == COMMON_PATCHED, "step 2 leaves Common.js alone")
        r = car.run("tt_remove")
        check(r.returncode != 0 and car.read(common) == COMMON_PATCHED,
              "TT REMOVE is only offered once AA touch is removed")
        r = car.run("remove")
        check(r.returncode == 0 and car.configs_are(STOCK) and car.read(common) == COMMON_PATCHED,
              "AA remove keeps TouchTune")
        r = car.run("tt_remove")
        check(r.returncode == 0 and car.read(common) == COMMON_STOCK,
              f"TT REMOVE restores the stock Common.js ({r.returncode})")
        check(car.nvram("lvds_speed_restriction") == "disable", "TouchTune restores the entry NVRAM value")

        # --- single boot trim groups (what the PC builder's plan uses)
        car = fresh(base, "trim-groups")
        stock_digest = car.digest()
        table = sm_table()
        want = lambda aa, mask: car.read("jci/sm/sm.conf") == table[f"{aa}{TRIM_DIGITS[mask]}"]
        r = car.run("trim_pandora_off")
        check(r.returncode != 0 and car.digest() == stock_digest, "a group that is off cannot be turned off")
        mask = 0
        for group, bit in (("pandora", 4), ("dvdtv", 1), ("aha", 16), ("stitcher", 8), ("sirius", 2)):
            r = car.run(f"trim_{group}_on")
            mask += bit
            check(r.returncode == 0 and want(0, mask) and car.state() == "stock",
                  f"trim group {group} on -> mask {mask} ({r.returncode})")
        check(car.state("boot trim:") == "aha", "all five groups on is the Aha level")
        r = car.run("trim_sirius_on")
        check(r.returncode != 0 and want(0, 31), "a group that is on cannot be turned on again")
        r = car.run("install")
        check(r.returncode == 0 and want(1, 31) and car.state() == "installed", "AA touch on top of all groups")
        for group, bit in (("dvdtv", 1), ("aha", 16)):
            r = car.run(f"trim_{group}_off")
            mask -= bit
            check(r.returncode == 0 and want(1, mask) and car.state() == "installed",
                  f"trim group {group} off with AA touch installed -> mask {mask}")
        check(car.state("boot trim:") == "custom", "a mix of groups is called custom")
        r = car.run("trim_off")
        check(r.returncode == 0 and want(1, 0), "RESTORE takes every group off, AA touch stays")
        r = car.run("remove")
        check(r.returncode == 0 and car.digest() == stock_digest, "all groups off, AA removed: byte-exact stock")
        for point in ("stage-sm", "rename-sm"):
            car = fresh(base, f"group-kill-{point}")
            stock_digest = car.digest()
            car.run("trim_stitcher_on", fault=f"kill:{point}")
            check(car.configs_valid() and (car.sm_is("00") or car.read("jci/sm/sm.conf") == table["08"]),
                  f"group power loss at {point}: sm.conf is stock or the new variant")
            # The unit is now "partial" (backup folder or a staged file): REMOVE cleans it up, like for the other trims.
            r = car.run("remove")
            check(r.returncode == 0 and car.sm_is("00") and car.digest() == stock_digest,
                  f"group power loss at {point}: REMOVE gives byte-exact stock")
            r = car.run("trim_stitcher_on")
            check(r.returncode == 0 and car.read("jci/sm/sm.conf") == table["08"], f"group power loss at {point}: trim afterwards")
        car = fresh(base, "group-fail")
        stock_digest = car.digest()
        r = car.run("trim_dvdtv_on", fault="fail:rename-sm")
        check(r.returncode != 0 and car.digest() == stock_digest, "group failure: nothing left behind (byte-exact stock)")

        # --- hidden Entertainment sources (opt-in: one more line of systemApp.js, follows the boot trim)
        car = fresh(base, "menu")
        stock_digest = car.digest()
        backup = car.root / "data_persist/miatoff/aa-touch/systemApp.js.stock"
        r = car.run("trim_stitcher_on")
        check(r.returncode == 0 and car.read("jci/sm/sm.conf") == table["08"] and car.read(SYSAPP) == SYS_STOCK_BYTES,
              f"Stitcher trim without the menu item: systemApp.js untouched ({r.returncode})")
        r = car.run("menu_off")
        check(r.returncode != 0, "menu_off refused while the menu item is off")
        r = car.run("menu_on")
        check(r.returncode == 0 and car.read(SYSAPP) == sysb(0, "8") and car.state("menu hides:") == "8",
              f"menu on: the Stitcher entry is hidden ({r.returncode})")
        check(backup.exists() and backup.read_bytes() == SYS_STOCK_BYTES, "menu on: stock systemApp.js backed up")
        r = car.run("trim_pandora_on")
        check(r.returncode == 0 and car.read(SYSAPP) == sysb(0, "c"), "Pandora too: the menu follows the trim step")
        r = car.run("trim_aha")
        check(r.returncode == 0 and car.read(SYSAPP) == sysb(0, "v"), "all five groups: all their sources are hidden")
        r = car.run("disc_off")
        check(r.returncode == 0 and car.read(SYSAPP) == sysb(1, "v"), "warning off on top of the hidden sources keeps them")
        r = car.run("disc_on")
        check(r.returncode == 0 and car.read(SYSAPP) == sysb(0, "v") and backup.exists(), "warning on again keeps the hidden sources and the backup")
        r = car.run("trim_off")
        check(r.returncode == 0 and car.read(SYSAPP) == sysb(0, "w") and backup.exists(),
              "trim off with the menu item on: nothing hidden, but the item stays on")
        r = car.run("menu_off")
        check(r.returncode == 0 and car.read(SYSAPP) == SYS_STOCK_BYTES and not backup.exists(),
              "menu off: all sources shown again, backup gone")
        check(car.digest() == stock_digest, "and the unit is byte-exact stock")

        car = fresh(base, "menu-kill")
        stock_digest = car.digest()
        car.run("trim_stitcher_on")
        car.run("menu_on", fault="kill:rename-sys")
        check(car.read(SYSAPP) in (sysb(0, "0"), sysb(0, "8")), "menu power loss: systemApp.js a known file, never half")
        car.run("cancel")
        if car.state() == "partial":
            car.run("remove")
        r = car.run("menu_on")
        check(r.returncode == 0 and car.read(SYSAPP) == sysb(0, "8"), f"menu power loss: menu_on finishes it ({r.returncode})")

        car = fresh(base, "menu-fail")
        car.run("menu_on")
        r = car.run("trim_stitcher_on", fault="fail:rename-sys")
        check(r.returncode != 0 and car.read("jci/sm/sm.conf") == table["08"] and car.read(SYSAPP) == sysb(0, "w"),
              "menu failure while following a trim: the trim stays, the menu line is untouched")

        car = fresh(base, "menu-unknown")
        write(car.root, SYSAPP, SYS_STOCK_BYTES + b" ")
        r = car.run("trim_stitcher_on")
        check(r.returncode == 0 and car.read("jci/sm/sm.conf") == table["08"] and car.read(SYSAPP) == SYS_STOCK_BYTES + b" ",
              "an unknown systemApp.js does not block the trim")
        before = car.digest()
        r = car.run("menu_on")
        check(r.returncode != 0 and car.digest() == before, "menu_on refused for an unknown systemApp.js")

        # --- plan from the PC builder (miatoff-plan.txt): one confirmed step per run
        car = fresh(base, "plan")
        stock_digest = car.digest()
        plan = car.stick / "miatoff-plan.txt"
        plan.write_text("# test\naa_touch=install\ntrim_dvdtv=install\ntrim_pandora=install\ntrim_aha=install\n"
                        "warning=install\nmenu=install\ndelay=install\nsafety=install\nsensors=install\ntouchtune=keep\nmeters=keep\n")
        r = car.run("")
        check(r.returncode == 0 and want(0, 21) and car.read(SYSAPP) == sysb(0, "l"),
              f"plan step 1: all trims of the plan and the hidden menu sources in one step ({r.returncode})")
        r = car.run("")
        check(r.returncode == 0 and car.read(SYSAPP) == sysb(1, "l"), f"plan step 2: startup warning skipped on top ({r.returncode})")
        r = car.run("")
        check(r.returncode == 0 and car.read(LIST2) == LIST2_PATCHED_BYTES, f"plan step 3: shorter list delay ({r.returncode})")
        r = car.run("")
        check(r.returncode == 0 and car.state("camera text:") == "patched", f"plan step 4: camera text blank ({r.returncode})")
        r = car.run("")
        check(r.returncode == 0 and car.state("sensors:") == "patched", f"plan step 4b: parking sensors ({r.returncode})")
        r = car.run("")
        check(r.returncode == 0 and car.state() == "installed" and want(1, 21), f"plan step 5: AA touch ({r.returncode})")
        done = car.digest()
        r = car.run("")
        check(r.returncode == 0 and car.digest() == done, "plan complete: nothing left to do, nothing changes")
        plan.write_text("aa_touch=remove\ntrim_dvdtv=remove\ntrim_pandora=remove\ntrim_aha=remove\nwarning=remove\nmenu=remove\n"
                        "delay=remove\nsafety=remove\nsensors=remove\n")
        for step in ("AA touch", "list delay", "camera text", "parking sensors", "startup warning", "hidden menu sources", "all trims"):
            r = car.run("")
            check(r.returncode == 0, f"plan removal: {step} ({r.returncode})")
        check(car.digest() == stock_digest, "plan removals end in a byte-exact stock tree")
        # one trim step can stop some groups and let others start again
        car.run("trim_pandora_on")
        car.run("trim_dvdtv_on")
        plan.write_text("trim_sirius=install\ntrim_dvdtv=remove\n")
        r = car.run("")
        check(r.returncode == 0 and want(0, 6), f"one trim step: SiriusXM stopped, DVD/TV started again ({r.returncode})")
        done = car.digest()
        r = car.run("")
        check(r.returncode == 0 and car.digest() == done, "that trim plan is then complete")
        r = car.run("trim_off")
        check(r.returncode == 0 and car.digest() == stock_digest, "and the trim can be taken off again, byte-exact stock")
        plan.write_text("aa_touch=install\nbogus=1\n")
        r = car.run("")
        check(r.returncode == 0 and car.digest() == stock_digest, "an invalid plan is ignored (nothing changes)")
        plan.write_text("trim=aha\n")
        r = car.run("")
        check(r.returncode == 0 and car.digest() == stock_digest, "the old single trim key is not a valid plan key")
        plan.write_text("aa_touch=install\n")
        r = car.run("remove")
        check(r.returncode != 0 and car.digest() == stock_digest, "an explicit action still wins over the plan")

        # --- a plan with a trim change and the menu item is one step, one restart
        car = fresh(base, "plan-menu")
        stock_digest = car.digest()
        car.run("trim_on")      # DVD/TV, SiriusXM, Pandora, Stitcher already stopped
        (car.stick / "miatoff-plan.txt").write_text("trim_aha=install\nmenu=install\n")
        r = car.run("")
        check(r.returncode == 0 and want(0, 31) and car.read(SYSAPP) == sysb(0, "v"),
              f"plan: one more trim group and the menu item in one step ({r.returncode})")
        done = car.digest()
        r = car.run("")
        check(r.returncode == 0 and car.digest() == done, "plan: then nothing is left to do")
        car = fresh(base, "plan-menu-alone")
        car.run("trim_stitcher_on")
        (car.stick / "miatoff-plan.txt").write_text("menu=install\n")
        r = car.run("")
        check(r.returncode == 0 and car.read(SYSAPP) == sysb(0, "8"), f"plan: the menu item alone, trims already on ({r.returncode})")
        (car.stick / "miatoff-plan.txt").write_text("menu=remove\ntrim_stitcher=remove\n")
        r = car.run("")
        check(r.returncode == 0 and car.read(SYSAPP) == SYS_STOCK_BYTES, f"plan: menu item removed first ({r.returncode})")
        r = car.run("")
        check(r.returncode == 0 and car.digest() == stock_digest, "plan: and then the trim, byte-exact stock")

        # --- a plan step that cannot run says why instead of "complete"
        car = fresh(base, "plan-blocked")
        r = car.run("install")
        check(r.returncode == 0 and car.state() == "installed", "blocked plan: AA touch installed first")
        before = car.digest()
        (car.stick / "miatoff-plan.txt").write_text("touchtune=install\naa_touch=keep\n")
        r = car.run("")
        log = (car.stick / "miatoff-aa-touch.log").read_text()
        check(r.returncode == 0 and car.digest() == before and "plan not finished" in log
              and "Remove touch in Android Auto first" in log, "TouchTune after AA touch: the plan says why it cannot run")
        (car.stick / "miatoff-plan.txt").write_text("aa_touch=install\n")
        r = car.run("")
        log = (car.stick / "miatoff-aa-touch.log").read_text()
        check(r.returncode == 0 and car.digest() == before and "nothing left to do" in log,
              "an already installed plan is reported complete")

        # --- launcher: foreign ID does not run
        car = fresh(base, "foreign-id")
        before = car.digest()
        (car.stick / "AATOUCH.ID").write_text("something-else\n")
        car.run("install")
        check(car.digest() == before and not (car.stick / "miatoff-aa-touch.log").exists(),
              "foreign ID: launcher does not run")
    finally:
        shutil.rmtree(bs.long_path(base), ignore_errors=True)

    print()
    print(f"{len(FAILURES)} failure(s)" if FAILURES else "All tests passed.")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()

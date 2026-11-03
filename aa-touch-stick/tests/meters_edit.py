"""Independent Python version of the Meters edits in aa-touch.sh (for tests).

opera.ini: user scripts on, from MiatOff's own folder, and file XHR allowed.
stage_gap2.sh: one comment and one line that start the collector at boot.
"""

OPERA_JS_OFF = "User JavaScript=0"
OPERA_JS_ON = "User JavaScript=1"
OPERA_XHR = "Allow File XMLHttpRequest=1"
OPERA_DIR_STOCK = "User JavaScript File=$OPERA_DIR/userjs/"
OPERA_DIR_OURS = "User JavaScript File=/jci/opera/opera_dir/userjs-miatoff/"

GAP2_LINES = [
    "# MiatOff: start the Meters collector (docs/13); it writes /tmp/miatoff/live.txt.",
    "[ -f /jci/gui/apps/miatoff/collector/miatoff-collector.sh ] && "
    "/bin/sh /jci/gui/apps/miatoff/collector/miatoff-collector.sh </dev/null >/dev/null 2>&1 &",
]


def patch_opera(data: bytes) -> bytes:
    lines = data.decode("ascii").split("\n")
    assert lines.count(OPERA_JS_OFF) == 1 and lines.count(OPERA_DIR_STOCK) == 1 and OPERA_XHR not in lines
    i = lines.index(OPERA_JS_OFF)
    lines[i:i + 1] = [OPERA_JS_ON, OPERA_XHR]
    lines[lines.index(OPERA_DIR_STOCK)] = OPERA_DIR_OURS
    return "\n".join(lines).encode("ascii")


def patch_gap2(data: bytes) -> bytes:
    text = data.decode("ascii")
    assert text.endswith("\n")
    return (text + "\n".join(GAP2_LINES) + "\n").encode("ascii")

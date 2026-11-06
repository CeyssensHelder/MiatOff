"""Independent Python version of the Entertainment menu edit in aa-touch.sh (for tests).

systemApp.js builds the Entertainment list in _buildEntertainmentDataList(), keeping
the items whose isVisible flag is set. The flag is also set by the native MMUI
(StatusMenuVisible), so editing the default would not hold. The one filter line below
also drops the sources of every boot-trim group that is on, once the user has opted in
in the builder (mask bits as in the boot trim: 1 DVD/TV, 2 SiriusXM, 4 Pandora, 8 Stitcher, 16 Aha).

A menu code is one char: "0" = off (the stock line), "w" = on with nothing hidden yet
(the trim is off), otherwise the trim char of the groups that are hidden.
It does not overlap with the Disclaimer edit (disclaimer_edit.py).
"""

STOCK_LINE = '        if (this._masterEntertainmentDataList.items[i].appData.isVisible)'
GROUP_NAMES = [(1, ["dvd", "tv"]), (2, ["satradio", "xmaudio"]), (4, ["pandora"]), (8, ["stitcher"]), (16, ["aharadio"])]
TRIM_DIGITS = "0123456789abcdefghijklmnopqrstuv"


MENU_CODES = "0w" + TRIM_DIGITS[1:]


def mask_of(code: str) -> int:
    return 0 if code == "w" else TRIM_DIGITS.index(code)


def line(code: str) -> str:
    if code == "0":
        return STOCK_LINE
    names = [n for bit, group in GROUP_NAMES if mask_of(code) & bit for n in group]
    quoted = ",".join('"%s"' % n for n in names)
    return ("        if (this._masterEntertainmentDataList.items[i].appData.isVisible && [" + quoted +
            "].indexOf(this._masterEntertainmentDataList.items[i].appData.appName) < 0) // MiatOff: hidden with the boot trim")


def patch(data: bytes, code: str, from_code: str = "0") -> bytes:
    lines = data.decode("ascii").split("\n")
    old = line(from_code)
    assert lines.count(old) == 1, "menu line not found exactly once"
    lines[lines.index(old)] = line(code)
    return "\n".join(lines).encode("ascii")

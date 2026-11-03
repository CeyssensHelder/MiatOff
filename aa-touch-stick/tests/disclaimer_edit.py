"""Independent Python version of the disclaimer edit in aa-touch.sh (for tests).

The "Disclaimer" context of systemApp.js becomes a continuation of the intro
logo (NoCtrlTmplt, as the stock "IntroAnimation" context) whose readyFunction
agrees at once, after MZD-AIO "No More Disclaimer". If the screen were still
up after 3.5 s, the stock timeout ends it.
"""

BLOCK_START = '        "Disclaimer" : {'
BLOCK_END = '        }, // end of Disclaimer'
ANCHOR = 'systemApp.prototype._displayedDisclaimer = function()'

PATCHED_BODY = [
    '            "hideHomeBtn" : true,',
    '            "template" : "NoCtrlTmplt",',
    '            "properties": {',
    '                "visibleSurfaces" : ["TRANLOGO_SURFACE", "TRANLOGOEND_SURFACE"],',
    '                "statusBarVisible" : false,',
    '                "customBgImage" : "common/images/FullTransparent.png",',
    '            },',
    '            // MiatOff: the Disclaimer is skipped (after MZD-AIO "No More Disclaimer")',
    '            "readyFunction" : this._noMoreDisclaimer.bind(this),',
    '            "noLongerDisplayedFunction" : this._noLongerDisplayedDisclaimer.bind(this),',
]

FUNCTION = [
    '// MiatOff: agree to the Disclaimer at once (after MZD-AIO "No More Disclaimer").',
    '// If the screen is still shown after 3.5 s, the stock timeout below ends it.',
    'systemApp.prototype._noMoreDisclaimer = function()',
    '{',
    '    framework.sendEventToMmui("system", "DisposeIntroVideo");',
    '    framework.sendEventToMmui("common", "Global.Yes");',
    '    framework.sendEventToMmui("system", "NotifyDisclaimerEnd");',
    '    this._disclaimerTime.reset = false;',
    '    this._disclaimerTime.remaining = 3500;',
    '    this._disclaimerTime.whenStarted = Date.now();',
    '    this._disclaimerTime.timeoutId = setTimeout(this._disclaimerTimedout.bind(this), this._disclaimerTime.remaining);',
    '};',
    '',
]


def patch(data: bytes) -> bytes:
    lines = data.decode("ascii").split("\n")
    assert lines.count(BLOCK_START) == 1 and lines.count(BLOCK_END) == 1 and lines.count(ANCHOR) == 1
    start, end = lines.index(BLOCK_START), lines.index(BLOCK_END)
    assert start < end
    lines[start + 1:end] = PATCHED_BODY
    i = lines.index(ANCHOR)
    lines[i:i] = FUNCTION
    return "\n".join(lines).encode("ascii")

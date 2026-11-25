#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# The builder prepends the pinned helper hash and candidate control mapping.
USB=$(CDPATH='' cd "$(dirname "$0")" && pwd) || exit 1
case "$USB" in /tmp/mnt/sd[a-z][0-9]) ;; *) exit 1 ;; esac
mount -o rw,remount "$USB" 2>/dev/null || true
exec >>"$USB/miatoff-commander.log" 2>&1
printf '\nMiatOff Commander diagnostic\n'
version=/jci/version.ini
ver=$(grep '^JCI_SW_VER=' "$version" | cut -d'"' -f2 | tr -d '\r')
patch=$(grep '^JCI_SW_VER_PATCH=' "$version" | cut -d'"' -f2 | tr -d '\r')
case "${ver##*_}:$patch" in
    74.00.324:A|74.00.324A:A) ;;
    *) echo "Expected 74.00.324A; diagnostic stopped"; exit 1 ;;
esac
grep -E '^JCI_SW_(VER|VER_PATCH|FLAVOR)=' "$version"
printf 'Candidate mapping: polarity %s, two buttons %s, three buttons %s\n' "$POLARITY" "$ORDER_TWO" "$ORDER_THREE"

digest() {
    if [ -x /usr/bin/openssl ]; then
        value=$(/usr/bin/openssl dgst -sha256 "$1") || return 1
        printf '%s\n' "${value##* }"
    else
        value=$(sha256sum "$1") || return 1
        printf '%s\n' "${value%% *}"
    fi
}

dialog=/jci/tools/jci-dialog
[ -x "$dialog" ] || { echo "jci-dialog unavailable"; exit 1; }
printf 'jci-dialog sha256: %s\n' "$(digest "$dialog")"
# Name, bus:vendor:product:version and the key and axis bitmaps of every input device, so a log shows which one
# carries the Commander even when the helper finds no match.
printf 'Input devices (/proc/bus/input/devices):\n'
cat /proc/bus/input/devices 2>&1
printf 'Device nodes (/dev/input):\n'
ls -l /dev/input 2>&1

# finish <text>: log it and leave it on screen, so a run that shows no prompt is still visible.
finish() {
    printf 'Finished: %s\n' "$1"
    "$dialog" --info --title="MIATOFF COMMANDER TEST" \
        --text="$1\n\nThe log is on the USB stick.\nNothing on the unit was changed." --no-cancel >/dev/null 2>&1 &
}
work=$(mktemp -d /tmp/miatoff-commander.XXXXXX) || exit 1
trap 'rm -f "$work/helper"; rmdir "$work"; sync' 0
trap 'exit 1' HUP INT TERM
cp "$USB/miatoff-commander" "$work/helper" &&
    [ "$(digest "$work/helper")" = "$COMMANDER_SHA256" ] && chmod 700 "$work/helper" ||
    { finish "The test helper on the stick could not be verified."; exit 1; }
"$work/helper" --check-runtime || { finish "The test helper cannot run on this unit."; exit 1; }

# probe <order> <label> <steps> <back> <buttons...>: back=yes means exit 3 (Back) is this prompt's expected answer.
probe() {
    local order="$1" label="$2" steps="$3" back="$4" result
    shift 4
    "$work/helper" "$dialog" "$USB/AATOUCH.ID" - "$POLARITY" "$order" "MIATOFF COMMANDER TEST" \
        "$label\n\n$steps\nEvery choice is harmless." "$@"
    result=$?
    printf '%s: dialog exit %s\n' "$label" "$result"
    case "$result:$back" in
        0:*|1:*|2:*|3:yes) return 0 ;;
    esac
    case "$result" in
        3) finish "Test stopped: Back, two minutes without a choice, or the stick was removed." ;;
        4) finish "No input device could be opened, so no test prompt was shown." ;;
        5) finish "The test dialog failed to open or closed without a choice." ;;
        *) finish "The test stopped with code $result." ;;
    esac
    return 1
}

probe "$ORDER_TWO" '1 of 3: Knob' \
    'Turn right one click, then left one click.\nTilt up, down, left, right. Press the knob.\nHome should not move. If stuck, tap a button.' \
    no FIRST CANCEL &&
    probe "$ORDER_THREE" '2 of 3: Back' 'Press the Back button next to the knob.\nIf nothing happens, tap a button.' \
        yes FIRST SECOND CANCEL &&
    probe "$ORDER_THREE" '3 of 3: Choose' 'Turn to a choice and press the knob,\nor tap one.' no FIRST SECOND THIRD &&
    finish "All three test prompts are done."

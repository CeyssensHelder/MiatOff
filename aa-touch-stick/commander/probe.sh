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
# Nothing here changes the unit, so another firmware is only noted: a car with a broken screen could not tell why a
# stick that stops here shows nothing at all.
case "${ver##*_}:$patch" in
    74.00.324:A|74.00.324A:A) ;;
    *) echo "Note: expected 74.00.324A, this unit says '$ver' / '$patch'; the diagnostic runs anyway" ;;
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

# finish <text>: log it and leave it on screen, so a run that shows no prompt is still visible. It closes by itself
# after a minute: a unit with a broken screen cannot tap it away.
finish() {
    printf 'Finished: %s\n' "$1"
    "$dialog" --info --title="MIATOFF COMMANDER TEST" \
        --text="$1\n\nThe log is on the USB stick.\nNothing on the unit was changed." --no-cancel >/dev/null 2>&1 &
    ( cd / && sleep 60 && killall -q jci-dialog ) >/dev/null 2>&1 &
}
work=$(mktemp -d /tmp/miatoff-commander.XXXXXX) || exit 1
trap 'rm -f "$work/helper"; rmdir "$work"; sync' 0
trap 'exit 1' HUP INT TERM
cp "$USB/miatoff-commander" "$work/helper" &&
    [ "$(digest "$work/helper")" = "$COMMANDER_SHA256" ] && chmod 700 "$work/helper" ||
    { finish "The test helper on the stick could not be verified."; exit 1; }
"$work/helper" --check-runtime || { finish "The test helper cannot run on this unit."; exit 1; }

# Every prompt closes by itself after two minutes, and each one runs whatever happened in the one before, so the whole
# test needs no touch: turn, tilt and press, or wait. results collects how each prompt ended, to read off the screen
# at the end.
results=
# probe <order> <label> <steps> <buttons...>: one prompt; adds its outcome to results.
probe() {
    local order="$1" label="$2" steps="$3" result what
    shift 3
    "$work/helper" "$dialog" "$USB/AATOUCH.ID" - "$POLARITY" "$order" "MIATOFF COMMANDER TEST" \
        "$label\n\n$steps\nEvery choice is harmless." "$@"
    result=$?
    printf '%s: dialog exit %s\n' "$label" "$result"
    case "$result" in
        0|1|2) what="button $result" ;;
        3) what="Back or no answer" ;;
        4) what="no input device" ;;
        5) what="dialog failed" ;;
        *) what="code $result" ;;
    esac
    results="$results${results:+; }Prompt ${label%% *}: $what"
}

probe "$ORDER_TWO" '1 of 3: Knob' \
    'Turn right one click, then left one click.\nTilt up, down, left, right. Press the knob.\nNo touch needed: after 2 minutes it moves on.' \
    FIRST CANCEL
probe "$ORDER_THREE" '2 of 3: Back' \
    'Press the Back button next to the knob.\nNo touch needed: after 2 minutes it moves on.' FIRST SECOND CANCEL
probe "$ORDER_THREE" '3 of 3: Choose' \
    'Turn to a choice and press the knob.\nNo touch needed: after 2 minutes it ends.' FIRST SECOND THIRD
finish "Test done. $results"

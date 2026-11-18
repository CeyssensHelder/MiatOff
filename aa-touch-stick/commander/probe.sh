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
work=$(mktemp -d /tmp/miatoff-commander.XXXXXX) || exit 1
trap 'rm -f "$work/helper"; rmdir "$work"; sync' 0
trap 'exit 1' HUP INT TERM
cp "$USB/miatoff-commander" "$work/helper" &&
    [ "$(digest "$work/helper")" = "$COMMANDER_SHA256" ] && chmod 700 "$work/helper" ||
    { echo "Commander helper verification failed"; exit 1; }
"$work/helper" --check-runtime || { echo "Commander helper cannot run on this unit"; exit 1; }

probe() {
    local order="$1" label="$2" result
    shift 2
    "$work/helper" "$dialog" "$USB/AATOUCH.ID" - "$POLARITY" "$order" "MIATOFF COMMANDER TEST" \
        "$label\n\nTurn to move the brackets.\nPress or tap a choice to log its number.\nBack closes the test. Every choice is harmless." "$@"
    result=$?
    printf '%s: dialog exit %s\n' "$label" "$result"
    [ "$result" -le 2 ]
}

probe "$ORDER_TWO" '1 of 3: Two buttons' FIRST CANCEL &&
    probe "$ORDER_THREE" '2 of 3: Three buttons with Cancel' FIRST SECOND CANCEL &&
    probe "$ORDER_THREE" '3 of 3: Three choices' FIRST SECOND THIRD

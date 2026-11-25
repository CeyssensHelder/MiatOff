#!/bin/sh
# MiatOff audio paths 0.7.0: page signal probe. BusyBox ash; local USB output only.
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Background (docs/13): a sound file is heard over the FM radio, without the radio dipping, when a helper on the unit
# borrows the Android Auto guidance focus (AAGuidance, no audioActive) and plays on androidautoAltAudio (0.6.0). The
# driver wants that shift beep only while the Meters page is open on a style with the shift sound on. The page runs
# in Opera and cannot start a program or write a file, so the helper needs another way to learn that. This probe
# looks for one, while the driver opens Meters, plays a style's sound test and leaves Meters again:
#
#   1. Local network: which BusyBox applets exist, and whether `nc -l` can listen on 127.0.0.1 (a page could then
#      load http://127.0.0.1:<port>/... and the helper would see the request).
#   2. HMI messages: the signals on the HMI D-Bus (/tmp/dbus_hmi_socket) during the window. Only the interface and
#      member of each signal are kept, and string values that name an app, context or Meters; everything else (it
#      may hold names or messages) is dropped before anything is written to the USB.
#   3. The page's sound: the state of every ALSA playback device, sampled about 5 times a second, with the program
#      that holds it. The style menu's sound test plays through Opera: does that show?
#   4. Files written during the window under /tmp, /data_persist and /jci/opera (names only, never contents): does
#      Opera store the page's local storage at once?
#
# Read-only for the unit: no files, settings, services or audio sources are changed, nothing is played or
# installed, no reboot. The only D-Bus use is listening, and the audio manager's read-only GetActiveSource. Only
# the USB is remounted writable, for the results; the raw HMI capture stays in /tmp (RAM) and is deleted. The results
# hold no Mazda file content, so they can be shared.
R="${MO_ROOT:-}"
USB=$(CDPATH='' cd "$(dirname "$0")" && pwd) || exit 1
TEST="${MO_TEST:-0}"
VERSION=0.7.0
TITLE="MIATOFF AUDIO PATHS"
BOUND="${MO_PATHS_BOUND:-6}"           # seconds before a query is cut off
WINDOW="${MO_PATHS_WINDOW:-90}"        # seconds the driver has for the Meters steps
GUARD="${MO_PATHS_GUARD:-/tmp/miatoff-paths.guard}"
BUS="unix:path=$R/tmp/dbus_service_socket"
HMI_BUS="unix:path=$R/tmp/dbus_hmi_socket"
TMPD="${MO_PATHS_TMP:-$R/tmp/miatoff-paths}"   # RAM: the raw HMI capture never reaches the USB
PORT=37373
KEEP='[Mm]iatoff|[Mm]eters|[Cc]txt|[Cc]ontext|[Aa]pp[A-Z_]|_[a-z]+App|[Aa]ppName|[Ss]urface|[Ff]ocus'
OWN_GUARD=0
OUT=
RES=
PIDS=
uptime_s() { cut -d' ' -f1 "$R/proc/uptime" 2>/dev/null || echo '?'; }
note() { [ -n "$RES" ] || return 0; printf '%s\n' "$*" >> "$RES"; sync; }
cleanup() {
    local status=$? p
    trap - 0
    for p in $PIDS; do kill "$p" 2>/dev/null; done
    for p in $PIDS; do wait "$p" 2>/dev/null; done
    rm -rf "$TMPD"
    [ "$TEST" = 1 ] || killall -q jci-dialog 2>/dev/null || true
    sync
    if [ "$OWN_GUARD" = 1 ]; then
        rm -f "$GUARD/pid"
        rmdir "$GUARD" 2>/dev/null || true
    fi
    exit "$status"
}
trap cleanup 0
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# ---------------------------------------------------------------- dialogs
# In a test, the answers come from MO_PATHS_ANSWERS ("0 1 2 ..."), one per question; none left = 9 (no answer).
ANSWERS="${MO_PATHS_ANSWERS:-}"
info() {
    [ "$TEST" = 1 ] && return 0
    killall -q jci-dialog 2>/dev/null || true
    /jci/tools/jci-dialog --info --title="$TITLE" --text="$1" --no-cancel >/dev/null 2>&1
}
# ask <ok> <cancel> <text>: sets CODE to 0 or 1 (the button), or 9 when there is no answer.
# Not called in $(...): it keeps the test's answer list between questions.
ask() {
    if [ "$TEST" = 1 ]; then
        set -- $ANSWERS
        CODE="${1:-9}"
        [ "$#" -gt 0 ] && shift
        ANSWERS="$*"
        return 0
    fi
    killall -q jci-dialog 2>/dev/null || true
    /jci/tools/jci-dialog --confirm --title="$TITLE" --text="$3" --ok-label="$1" --cancel-label="$2" >/dev/null 2>&1
    CODE=$?
    case "$CODE" in 0|1) ;; *) CODE=9 ;; esac
}

# ---------------------------------------------------------------- checks
[ -d "$R/jci" ] || exit 1
if [ "$TEST" != 1 ]; then
    case "$USB" in /tmp/mnt/sd[a-d]1) ;; *) exit 1 ;; esac
    [ -x /jci/tools/jci-dialog ] || exit 1
    mount -o rw,remount "$USB" 2>/dev/null || true
fi
fw=$(sed -n 's/^JCI_SW_VER="\(.*\)"/\1/p' "$R/jci/version.ini" | tr -d '\r')
patch=$(sed -n 's/^JCI_SW_VER_PATCH="\(.*\)"/\1/p' "$R/jci/version.ini" | tr -d '\r')
case "${fw##*_}:$patch" in 74.00.324:A|74.00.324A:A|74.00.324A:) ;;
    *) info "Unsupported firmware. Nothing was recorded."; exit 1 ;;
esac
fw="${fw##*_}"
case "$fw" in *A) ;; *) fw="${fw}${patch}" ;; esac

FAST=0
sleep 0.1 2>/dev/null && FAST=1    # fractional sleep: sample every 0.2 s, else every second
# bounded <seconds> <command...>: run it, kill it if it takes longer (a query must never hang the stick).
bounded() {
    local t="$1" pid i=0 limit nap
    shift
    limit=$t; nap=1
    [ "$FAST" = 1 ] && { limit=$((t * 10)); nap=0.1; }
    "$@" &
    pid=$!
    while kill -0 "$pid" 2>/dev/null; do
        if [ "$i" -ge "$limit" ]; then
            kill "$pid" 2>/dev/null; sleep 1; kill -9 "$pid" 2>/dev/null
            echo "TIMEOUT after ${t}s"
            wait "$pid" 2>/dev/null
            return 124
        fi
        sleep "$nap"
        i=$((i + 1))
    done
    wait "$pid"
}
# tool <name>: the path of a program on the unit, or nothing.
tool() {
    local d
    for d in /usr/bin /bin /usr/sbin /sbin /usr/local/bin; do
        [ -x "$R$d/$1" ] && { echo "$R$d/$1"; return 0; }
    done
    return 1
}
SEND=$(tool dbus-send)
MONITOR=$(tool dbus-monitor)
BB=$(tool busybox)
NC=$(tool nc)

# active_source: the vehicle audio manager's read-only answer to GetActiveSource, on one line.
active_source() {
    [ -n "$SEND" ] || { echo "dbus-send unavailable"; return 0; }
    bounded "$BOUND" "$SEND" --print-reply --reply-timeout=2000 --address="$BUS" \
        --type=method_call --dest=com.jci.vbs.am /com/jci/vbs/am com.jci.vbs.am.GetActiveSource 2>&1 |
        grep -v '^method return' | tr -s ' \n' ' ' | sed 's/^ *//; s/ *$//' | cut -c1-200
}
# pcm_states: one line per ALSA playback substream, "<card>/<pcm>/<sub> <state> <owner pid>". One awk for all of
# them (a closed substream's status file says only "closed"), so sampling 5 times a second stays cheap.
pcm_states() {
    awk -v root="$R/proc/asound/" '
        function out() { if (f != "") { id = f; sub(root, "", id); sub(/\/status$/, "", id); print id, st, pid } }
        FNR == 1 { out(); f = FILENAME; st = "closed"; pid = "-" }
        /^state:/ { st = $2 }
        /^owner_pid/ { pid = $NF }
        END { out() }' "$R"/proc/asound/card*/pcm*p/sub*/status 2>/dev/null
}
# program <pid>: the name of the program with that pid, or "-".
program() {
    local p
    case "$1" in ''|-|*[!0-9]*) echo -; return ;; esac
    p=$(tr '\000' ' ' < "$R/proc/$1/cmdline" 2>/dev/null | cut -d' ' -f1)
    p=${p##*/}
    echo "${p:--}"
}

# ---------------------------------------------------------------- start
ask START CANCEL "Audio paths test 7 (read-only, nothing is played or changed).\n\nAfter GO you get $WINDOW seconds. Close this dialog, then:\n1. Open Meters.\n2. Choose a style with the shift sound on, open the style menu and play its sound test twice.\n3. Choose a style without the sound.\n4. Go back to Home.\nA dialog comes back when the time is up."
[ "$CODE" = 0 ] || exit 0
if ! mkdir "$GUARD" 2>/dev/null; then
    old=$(cat "$GUARD/pid" 2>/dev/null)
    case "$old" in ''|*[!0-9]*) exit 1 ;; esac
    if kill -0 "$old" 2>/dev/null; then exit 0; fi
    rm -f "$GUARD/pid"
    rmdir "$GUARD" 2>/dev/null && mkdir "$GUARD" || exit 1
fi
OWN_GUARD=1
echo $$ > "$GUARD/pid"
mkdir -p "$USB/miatoff-audio-paths" || exit 1
n=1
while :; do
    OUT="$USB/miatoff-audio-paths/$(printf '%03d' "$n")-up$(uptime_s)s"
    mkdir "$OUT" 2>/dev/null && break
    [ -d "$OUT" ] || exit 1
    n=$((n + 1))
done
RES="$OUT/results.txt"
rm -rf "$TMPD"; mkdir -p "$TMPD" || exit 1
note "MiatOff audio paths $VERSION (page signal probe)"
note "firmware=$fw uptime=$(uptime_s)"
note "tools: busybox=${BB:-none} nc=${NC:-none} dbus-send=${SEND:-none} dbus-monitor=${MONITOR:-none}"
note "source_at_start: $(active_source)"

# 1. Local network ------------------------------------------------
note "--- 1. local network"
if [ -n "$BB" ]; then
    note "busybox: $(bounded "$BOUND" "$BB" 2>&1 | head -1 | cut -c1-120)"
    note "applets: $(bounded "$BOUND" "$BB" --list 2>/dev/null | tr '\n' ' ' | cut -c1-2000)"
fi
for t in nc netcat socat httpd telnetd inetd tcpsvd websocketd lighttpd; do
    p=$(tool "$t") && note "found: $p"
done
if [ -n "$NC" ]; then
    : > "$TMPD/nc.in"
    "$NC" -l -p "$PORT" > "$TMPD/nc.in" 2>"$TMPD/nc.err" &
    LPID=$!
    PIDS="$PIDS $LPID"
    sleep 1
    if kill -0 "$LPID" 2>/dev/null; then
        # The request comes from a file inside sh -c: ash gives a background command (bounded runs it with &) an
        # empty input otherwise.
        printf 'GET /miatoff-probe HTTP/1.0\r\n\r\n' > "$TMPD/nc.req"
        bounded 3 sh -c '"$0" 127.0.0.1 "$1" < "$2"' "$NC" "$PORT" "$TMPD/nc.req" >/dev/null 2>&1
        sleep 1
        if grep -q 'GET /miatoff-probe' "$TMPD/nc.in"; then note "nc listen on 127.0.0.1:$PORT: WORKS"
        else note "nc listen on 127.0.0.1:$PORT: listening, but nothing arrived"; fi
    else
        note "nc listen on 127.0.0.1:$PORT: FAILED: $(tr '\n' ' ' < "$TMPD/nc.err" | cut -c1-200)"
    fi
    kill "$LPID" 2>/dev/null; wait "$LPID" 2>/dev/null
else
    note "nc listen: no nc"
fi

# 2-4. The window -----------------------------------------------------
note "--- window: $WINDOW s from uptime $(uptime_s)"
note "--- 3. playback devices at start"
pcm_states > "$TMPD/pcm.last"
cat "$TMPD/pcm.last" >> "$RES"
: > "$TMPD/marker"
if [ -n "$MONITOR" ]; then
    # dbus-monitor wants "--address ADDR" as two words. Signals only; filtered after the window.
    "$MONITOR" --address "$HMI_BUS" "type='signal'" > "$TMPD/hmi.raw" 2>&1 &
    PIDS="$PIDS $!"
fi
note "--- 3. playback changes during the window (uptime: device state program (pid))"
nap=1; [ "$FAST" = 1 ] && nap=0.2
end=$(awk -v u="$(uptime_s)" -v w="$WINDOW" 'BEGIN { printf "%d", u + w }')
while :; do
    now=$(uptime_s)
    awk -v u="$now" -v e="$end" 'BEGIN { exit !(u >= e) }' && break
    pcm_states > "$TMPD/pcm.now"
    if ! cmp -s "$TMPD/pcm.now" "$TMPD/pcm.last"; then
        # Only the lines that changed, with the time and the program that holds the device.
        awk 'NR == FNR { old[$0] = 1; next } !($0 in old)' "$TMPD/pcm.last" "$TMPD/pcm.now" |
            while read -r id st pid; do note "$now: $id $st $(program "$pid") (pid $pid)"; done
        mv -f "$TMPD/pcm.now" "$TMPD/pcm.last"
    fi
    sleep "$nap"
done
note "--- window ended at uptime $(uptime_s)"
for p in $PIDS; do kill "$p" 2>/dev/null; done
for p in $PIDS; do wait "$p" 2>/dev/null; done
PIDS=

note "--- 2. HMI bus signals (interface.member, count) and kept strings"
if [ -s "$TMPD/hmi.raw" ]; then
    awk '/^signal / { m = $0; sub(/.*interface=/, "", m); i = m; sub(/;.*/, "", i)
                      m = $0; sub(/.*member=/, "", m); c[i "." m]++ }
         END { for (k in c) print c[k], k }' "$TMPD/hmi.raw" | sort -rn | head -60 >> "$RES"
    note "--- kept strings (in order, with the signal they belong to)"
    awk -v keep="$KEEP" '
        /^signal / { m = $0; sub(/.*member=/, "", m); next }
        /^ *string "/ { s = $0; sub(/^ *string "/, "", s); sub(/"$/, "", s)
                       if (s ~ keep && length(s) <= 200) print m ": " s }' "$TMPD/hmi.raw" | uniq | head -200 >> "$RES"
else
    note "(no HMI signals captured; dbus-monitor ${MONITOR:-missing})"
fi
rm -f "$TMPD/hmi.raw"

note "--- 4. files written during the window (names only)"
find "$R/tmp" "$R/data_persist" "$R/jci/opera" -type f -newer "$TMPD/marker" 2>/dev/null |
    grep -v -e "^$TMPD" -e '/tmp/mnt/' -e '/tmp/miatoff' | sed "s#^$R##" | sort | head -100 >> "$RES"

ask "DID ALL" "NOT ALL" "Time is up.\n\nDid you open Meters, play a style's sound test twice, switch to a style without the sound, and go back to Home?"
case "$CODE" in 0) note "steps: DID ALL" ;; 1) note "steps: NOT ALL" ;; *) note "steps: NO ANSWER" ;; esac
note "source_at_end: $(active_source)"
note "end uptime=$(uptime_s)"
info "Done. You can remove the USB.\n\nThe results are in miatoff-audio-paths/. They hold no Mazda files and no messages: they can be shared."
exit 0

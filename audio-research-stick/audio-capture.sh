#!/bin/sh
# MiatOff audio research 0.2.1. BusyBox ash; local USB output only.
# SPDX-License-Identifier: GPL-3.0-or-later
# No setters, NVRAM writes, audio/service changes, reboot or root remount.
# The USB alone may be remounted writable, as in MiatOff's existing dump stick.
#
# 0.2.1: fixes dbus-monitor (it wants "--address ADDR" as two words), samples the
# audio state every few seconds, takes a snapshot as soon as the script starts
# (before the dialog is answered), records which audio processes run and when they
# started, and copies the one file lastModeSvc persists its mode to.
R="${MO_ROOT:-}"
USB=$(CDPATH='' cd "$(dirname "$0")" && pwd) || exit 1
TEST="${MO_TEST:-0}"
DURATION=60
INTERVAL=10
[ "$TEST" != 1 ] || { DURATION="${MO_AUDIO_SECONDS:-2}"; INTERVAL="${MO_AUDIO_INTERVAL:-1}"; }
GUARD="${MO_AUDIO_GUARD:-/tmp/miatoff-audio.guard}"
PRE="${MO_AUDIO_PRE:-/tmp/miatoff-audio.pre.$$}"
OWN_GUARD=0
PIDS=
OUT=
uptime_s() { cut -d' ' -f1 "$R/proc/uptime" 2>/dev/null || echo '?'; }
cleanup() {
    local status=$? pid
    trap - 0
    for pid in $PIDS; do kill "$pid" 2>/dev/null || true; done
    for pid in $PIDS; do wait "$pid" 2>/dev/null || true; done
    sync
    rm -rf "$PRE"
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
dialog() {
    [ "$TEST" = 1 ] && return 0
    /jci/tools/jci-dialog "$@" >/dev/null 2>&1
}
[ -d "$R/jci" ] || exit 1
if [ "$TEST" != 1 ]; then
    case "$USB" in /tmp/mnt/sd[a-d]1) ;; *) exit 1 ;; esac
    [ -x /jci/tools/jci-dialog ] || exit 1
    mount -o rw,remount "$USB" 2>/dev/null || true
    renice 19 $$ >/dev/null 2>&1 || true
fi
fw=$(sed -n 's/^JCI_SW_VER="\(.*\)"/\1/p' "$R/jci/version.ini" | tr -d '\r')
patch=$(sed -n 's/^JCI_SW_VER_PATCH="\(.*\)"/\1/p' "$R/jci/version.ini" | tr -d '\r')
case "${fw##*_}:$patch" in 74.00.324:A|74.00.324A:A|74.00.324A:) ;;
    *) dialog --info --title="MiatOff audio research" --text="Unsupported firmware. Nothing was captured." --no-cancel; exit 1 ;;
esac
fw="${fw##*_}"
case "$fw" in *A) ;; *) fw="${fw}${patch}" ;; esac
if [ "$TEST" = 1 ] && [ "${MO_AUDIO_CANCEL:-0}" = 1 ]; then exit 0; fi

SEND="$R/usr/bin/dbus-send"
MON="$R/usr/bin/dbus-monitor"
BOUND="${MO_AUDIO_BOUND:-6}"

# bounded <seconds> <command...>: run it, kill it if it takes longer (nothing here may hang the stick).
FAST=0
sleep 0.1 2>/dev/null && FAST=1    # fractional sleep: poll every 0.1 s, else every second
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
            echo "TIMEOUT after ${t}s: $1"
            wait "$pid" 2>/dev/null
            return 124
        fi
        sleep "$nap"
        i=$((i + 1))
    done
    wait "$pid"
}
# fsize <file>: size in bytes without reading the file.
fsize() { ls -ln "$1" 2>/dev/null | awk '{ print $5 }'; }

# audio_procs: pid, start time (clock ticks since boot) and command line of the audio processes.
audio_procs() {
    local c pid cmd start
    for c in "$R"/proc/[0-9]*/cmdline; do
        [ -r "$c" ] || continue
        cmd=$(tr '\000' ' ' < "$c" 2>/dev/null)
        case "$cmd" in
            *lastModeSvc*|*audioMgr*|*audioCtrl*|*audioAmp*|*jciRadio*|*xse*)
                pid=${c%/cmdline}; pid=${pid##*/}
                start=$(awk '{ print $22 }' "${c%cmdline}stat" 2>/dev/null)
                echo "pid=$pid start_ticks=${start:-?} cmd=$cmd" ;;
        esac
    done
}

# lastmode_file: the path lastModeSvc persists to (its -f argument), if it runs.
lastmode_file() {
    local c
    for c in "$R"/proc/[0-9]*/cmdline; do
        [ -r "$c" ] || continue
        tr '\000' '\n' < "$c" 2>/dev/null | awk '
            { a[NR] = $0; if ($0 ~ /lastModeSvc/) mine = 1 }
            END { if (mine) for (i = 1; i <= NR; i++) if (a[i] == "-f") { print a[i + 1]; exit } }'
    done | head -n 1
}

# snapshot_audio <file>: read-only getters of the audio manager, one line of context each.
snapshot_audio() {
    local file="$1" method status
    {
        echo "uptime=$(uptime_s)"
        for method in GetLastMode GetActiveSource GetEntertainmentMuteStatus; do
            echo "query=$method uptime=$(uptime_s)"
            if [ -x "$SEND" ]; then
                bounded "$BOUND" "$SEND" --print-reply --reply-timeout=2000 --address="unix:path=$R/tmp/dbus_service_socket" \
                    --type=method_call --dest=com.jci.vbs.am /com/jci/vbs/am "com.jci.vbs.am.$method"
                status=$?
                echo "exit=$status"
            else
                echo "dbus-send unavailable"
            fi
        done
    } >> "$file" 2>&1
}

# copy_lastmode <dest dir>: the persisted last-mode file (<= 64 KiB) and a name-only listing of its folder.
copy_lastmode() {
    local dest="$1" path dir size
    path=$(bounded "$BOUND" lastmode_file | grep -v '^TIMEOUT')
    if [ -z "$path" ]; then echo "lastModeSvc -f not found (not running?)" > "$dest/lastmode-path.txt"; return 0; fi
    echo "$path" > "$dest/lastmode-path.txt"
    case "$path" in /*) ;; *) return 0 ;; esac
    case "$path" in *..*) return 0 ;; esac
    dir=${path%/*}
    ls -la "$R$dir" > "$dest/lastmode-dir.txt" 2>&1
    if [ -f "$R$path" ] && [ -r "$R$path" ]; then
        size=$(fsize "$R$path")
        if [ "${size:-999999}" -le 65536 ]; then
            cp "$R$path" "$dest/lastmode-file" 2>/dev/null
            ls -l "$R$path" > "$dest/lastmode-file-ls.txt" 2>&1
        else
            echo "$path: exceeds 64 KiB" > "$dest/lastmode-file-ls.txt"
        fi
    else
        echo "$path: not a readable file" > "$dest/lastmode-file-ls.txt"
    fi
}

# capture_logs <dest dir>: passive log evidence, audio lines only. Never Bluetooth, GPS or phone logs.
capture_logs() {
    local dest="$1" dir f size
    local pat='audio|lastmode|xse|mixer|alsa|entertainment|ctrlresp|source'
    mkdir -p "$dest/logs" || return 0
    for dir in /tmp /var/log; do
        ls -la "$R$dir" > "$dest/logs/ls-$(echo "$dir" | tr '/' '_').txt" 2>&1
        for f in "$R$dir"/*; do
            [ -f "$f" ] && [ -r "$f" ] || continue
            echo "${f##*/}" | grep -i -E "$pat" >/dev/null 2>&1 || continue
            echo "${f##*/}" | grep -i -E 'bt|blue|phone|gps|contact|pair' >/dev/null 2>&1 && continue
            size=$(fsize "$f")
            if [ "${size:-999999999}" -le 131072 ]; then cp "$f" "$dest/logs/${dir#/}_${f##*/}" 2>/dev/null; else echo "$f: $size bytes, not copied" >> "$dest/logs/skipped.txt"; fi
        done
    done
    bounded "$BOUND" ${MO_AUDIO_DMESG:-dmesg} > "$dest/logs/dmesg-raw.tmp" 2>&1
    grep -i -E "$pat|^TIMEOUT" "$dest/logs/dmesg-raw.tmp" | tail -n 400 > "$dest/logs/dmesg-audio.txt"
    bounded "$BOUND" ${MO_AUDIO_LOGREAD:-logread} > "$dest/logs/logread-raw.tmp" 2>&1
    grep -i -E "$pat|^TIMEOUT" "$dest/logs/logread-raw.tmp" | tail -n 400 > "$dest/logs/logread-audio.txt"
    rm -f "$dest/logs/dmesg-raw.tmp" "$dest/logs/logread-raw.tmp"
}

# Earliest possible evidence: taken before the dialog is answered, kept only if CAPTURE is chosen.
rm -rf "$PRE"
EARLY_PID=
if mkdir "$PRE" 2>/dev/null; then
    # In the background, so the dialog appears at once; every step is time-bounded.
    (
        {
            echo "snapshot taken when the script started, uptime $(uptime_s)"
            bounded "$BOUND" audio_procs
        } > "$PRE/early-procs.txt" 2>&1
        snapshot_audio "$PRE/early-audio.txt"
        copy_lastmode "$PRE"
        capture_logs "$PRE"
        echo "early snapshot done uptime $(uptime_s)" >> "$PRE/early-procs.txt"
    ) &
    EARLY_PID=$!
    PIDS="$PIDS $EARLY_PID"
fi

dialog --confirm --title="MiatOff audio research" \
    --text="Read-only: copy audio scripts and record source/mute state for 60 seconds.\nNo settings are changed. Keep the results private.\nWhile recording, select Bluetooth, then FM, then Bluetooth.\nOnly operate the screen while parked." \
    --ok-label="CAPTURE" --cancel-label="CANCEL" || exit 0
if ! mkdir "$GUARD" 2>/dev/null; then
    old=$(cat "$GUARD/pid" 2>/dev/null)
    case "$old" in ''|*[!0-9]*) exit 1 ;; esac
    if kill -0 "$old" 2>/dev/null; then exit 0; fi
    rm -f "$GUARD/pid"
    rmdir "$GUARD" 2>/dev/null && mkdir "$GUARD" || exit 1
fi
OWN_GUARD=1
echo $$ > "$GUARD/pid"
free_kb=$(df -k "$USB" | awk 'NR == 2 {print $4}')
case "$free_kb" in ''|*[!0-9]*) exit 1 ;; esac
[ "$free_kb" -ge 8192 ] || exit 1
mkdir -p "$USB/miatoff-audio" || exit 1
n=1
while :; do
    OUT="$USB/miatoff-audio/$(printf '%03d' "$n")-up$(uptime_s)s"
    mkdir "$OUT" 2>/dev/null && break
    [ -d "$OUT" ] || exit 1
    n=$((n + 1))
done
exec > "$OUT/capture.log" 2>&1
echo "MiatOff audio research 0.2.1; start uptime $(uptime_s)"
# progress.log is synced after every step: if the run stops, the last line says where.
step() { echo "$(uptime_s) $1" >> "$OUT/progress.log"; sync; }
step "confirmed, output folder created"
[ -z "$EARLY_PID" ] || { wait "$EARLY_PID" 2>/dev/null; step "early snapshot finished"; }
mkdir "$OUT/early" && cp -r "$PRE"/. "$OUT/early/" 2>/dev/null
step "early snapshot copied"
FILES="/usr/bin/lastModeSvc.lua /usr/bin/audioMgr.lua /usr/bin/audioCtrl.lua /usr/bin/audioAmp.lua /usr/bin/audioCtrl_VBS.lua
/usr/share/audio_management/audioMgr_ControlLogic_JCI.lua /usr/share/audio_management/audioMgr_SourceMatrix_JCI.lua
/usr/share/audio_management/audioCtrl_Config_JCI.lua /usr/share/audio_management/audioAmp_Config_JCI.lua
/jci/am/ControlLogic.lua /jci/am/SourceMatrix.lua /jci/am/AmplifierConfig.lua /jci/am/ControlConfig.json"
file_checksums() {
    local path
    for path in $FILES; do
        if [ -f "$R$path" ] && [ -r "$R$path" ]; then
            printf '%s\t' "$path"
            cksum < "$R$path"
        fi
    done
}
file_checksums > "$OUT/source-before.tsv"
for path in $FILES; do
    if [ ! -f "$R$path" ] || [ ! -r "$R$path" ]; then
        echo "$path" >> "$OUT/missing.txt"
        continue
    fi
    size=$(wc -c < "$R$path" | tr -d ' \r\n')
    if [ "$size" -gt 262144 ]; then
        echo "$path: exceeds 256 KiB" >> "$OUT/missing.txt"
        continue
    fi
    dest="$OUT/files$path"
    mkdir -p "${dest%/*}" || exit 1
    cp "$R$path" "$dest" || exit 1
    [ "$(cksum < "$R$path")" = "$(cksum < "$dest")" ] || exit 1
done
# How the audio services are started: only the lines of the Service Manager config that name them.
for sm in sm.conf sm_WCP.conf; do
    [ -f "$R/jci/sm/$sm" ] && grep -i -E 'lastMode|audioMgr|audioCtrl|audioAmp|xse|jciAudio|name="jci(Radio|Bt|Bluetooth)' "$R/jci/sm/$sm" > "$OUT/sm-audio-$sm.txt" 2>/dev/null
done
step "files copied"
{ echo "uptime=$(uptime_s)"; bounded "$BOUND" audio_procs; } > "$OUT/procs-start.txt" 2>&1
copy_lastmode "$OUT"
step "processes and last-mode file captured"
capture_logs "$OUT"
step "logs captured"
if [ -x "$MON" ]; then
    for bus in service hmi; do
        # Only these audio-state signals: no general bus, pairing or GPS capture.
        # dbus-monitor wants "--address ADDR" as two words.
        "$MON" --address "unix:path=$R/tmp/dbus_${bus}_socket" \
            "type='signal',interface='com.jci.vbs.am',member='LastModeStatus'" \
            "type='signal',interface='com.jci.vbs.am',member='EntertainmentMuteStatus'" \
            "type='signal',interface='com.jci.vbs.am',member='SourceSelectResponse'" \
            "type='signal',interface='com.jci.vbs.am',member='MuteStatus'" \
            "type='signal',interface='com.jci.vbs.am',member='UnMuteStatus'" \
            > "$OUT/$bus-signals.txt" 2>&1 &
        PIDS="$PIDS $!"
    done
else
    echo "dbus-monitor unavailable" >> "$OUT/capture.log"
fi
step "monitors started"
# Give the monitors time to subscribe before a getter emits its reply signal.
sleep 1
snapshot_audio "$OUT/start.txt"
step "recording ($DURATION s)"
elapsed=0
while [ "$elapsed" -lt "$DURATION" ]; do
    sleep "$INTERVAL"
    elapsed=$((elapsed + INTERVAL))
    [ "$elapsed" -lt "$DURATION" ] && snapshot_audio "$OUT/samples.txt"
done
snapshot_audio "$OUT/end.txt"
{ echo "uptime=$(uptime_s)"; bounded "$BOUND" audio_procs; } > "$OUT/procs-end.txt" 2>&1
step "recording done"
for pid in $PIDS; do kill "$pid" 2>/dev/null || true; done
for pid in $PIDS; do wait "$pid" 2>/dev/null || true; done
PIDS=
file_checksums > "$OUT/source-after.tsv"
{
    echo "MiatOff audio research 0.2.1"
    echo "Firmware: $fw"
    echo "End uptime: $(uptime_s)"
    echo "Recording interval: $DURATION seconds, a state sample every $INTERVAL seconds, plus an early snapshot."
    echo "Read-only queries only; no setters, reboot or root remount."
    echo "See missing.txt, query exits and signal files for incomplete evidence."
    if cmp -s "$OUT/source-before.tsv" "$OUT/source-after.tsv"; then
        echo "Captured source files unchanged."
    else
        echo "WARNING: captured source files differ; compare checksums."
    fi
    echo "The early/ folder shows the state when the script started, not the beginning of boot."
    echo "Private: copyrighted Mazda/JCI scripts and local audio state. Do not upload."
} > "$OUT/SUMMARY.txt"
sync
dialog --info --title="MiatOff audio research" \
    --text="Capture finished. You can remove the USB.\nResults are in miatoff-audio/. Keep them local; do not upload.\nMissing files or failed queries are recorded in the results." --no-cancel
exit 0

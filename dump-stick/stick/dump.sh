#!/bin/sh
# MiatOff read-only dump for Mazda Connect Gen-6 (CMU), firmware 74.00.324(A).
#
# Reads system files and runtime state and writes them ONLY to this USB stick.
# It never remounts root, never writes NVRAM, never touches the watchdog,
# services or sm.conf, and never reboots. The only writes outside the stick are
# a guard directory in /tmp (tmpfs, gone after reboot). Vehicle data is read
# with Mazda's own smdb-read and one D-Bus query for the GPS position; both
# only read.
#
# Target: BusyBox 1.19 ash. Every step is best-effort: a failing command is
# logged and the dump continues.
#
# SPDX-License-Identifier: GPL-3.0-or-later
# The USB launch mechanism follows TouchTune (GPL-3.0-or-later).

MO_VERSION=1.3.0
R="${MO_ROOT:-}"                        # test hook: fixture root; empty on the CMU
MO_TEST="${MO_TEST:-0}"                 # test hook: 1 = no dialogs
MO_ACTION="${MO_ACTION:-full}"          # test hook: full | snapshot | cancel
MO_GUARD="${MO_GUARD:-/tmp/miatoff-dump.guard}"
USB=$(CDPATH='' cd "$(dirname "$0")" && pwd) || exit 1

PROBE_ROUNDS="${MO_PROBE_ROUNDS:-2}"    # full sweeps of all smdb fields
PROBE_GAP_S="${MO_PROBE_GAP_S:-5}"      # pause between sweeps
PROBE_FAST_S="${MO_PROBE_FAST_S:-10}"   # duration of the fast sample
# Fields a gauge would want, sampled as fast as smdb-read allows.
PROBE_FAST_FIELDS="VehicleSpeed EngineSpeed AccelPedalPosition SteeringWheel LongitudinalAccelerometer LateralAcceleration YawRate BrakePressure"
MAX_TEXT_BYTES=2097152                  # per file under /jci (HMI JS, configs)
MAX_ETC_BYTES=524288                    # per file under /etc
MIN_FREE_KB_FULL=262144                 # refuse a full dump below 256 MB free
USER_HZ=100                             # clock ticks per second on the CMU kernel

# Known Common.js digests for 74.00.324(A), from TouchTune's profile.
COMMON_STOCK_SHA256=376b30a46366a543122956d7feb1b44f147425015837a4d83fedf12a67943351
COMMON_TOUCHTUNE_SHA256=019eba18e8d629ddb1d55563aab138ce1eb3329fab67b71d9b4178377cf9d9ce

GUARD_CREATED=0
OUT=
T0=

# ---------------------------------------------------------------- helpers

uptime_s() { cut -d' ' -f1 "$R/proc/uptime" 2>/dev/null || echo '?'; }
log() { printf '%s\n' "[miatoff $(uptime_s)] $*"; }

popup() {
    [ "$MO_TEST" = 1 ] && return 0
    [ -x /jci/tools/jci-dialog ] || return 0
    killall -q jci-dialog 2>/dev/null || true
    /jci/tools/jci-dialog --info --title="MiatOff dump" --text="$1" \
        --no-cancel >/dev/null 2>&1 &
}

choose_action() {
    if [ "$MO_TEST" = 1 ]; then
        printf '%s\n' "$MO_ACTION"
        return 0
    fi
    [ -x /jci/tools/jci-dialog ] || return 1
    killall -q jci-dialog 2>/dev/null || true
    /jci/tools/jci-dialog --3-button-dialog --title="MIATOFF DUMP" \
        --text="Read-only: NOTHING is changed.\nFULL = status + vehicle data + files\nSNAPSHOT = status only (fast)\nMORE = calibration or cancel" \
        --ok-label="FULL" --cancel-label="SNAPSHOT" --button3-label="MORE" \
        >/dev/null 2>&1
    case $? in
        0) echo full ;;
        1) echo snapshot ;;
        2) choose_more ;;
        *) return 1 ;;
    esac
}

choose_more() {
    killall -q jci-dialog 2>/dev/null || true
    /jci/tools/jci-dialog --confirm --title="MIATOFF CALIBRATION" \
        --text="Calibration: record ${CAL_S}s of vehicle signals (read-only).\nFirst stand still for 15 s on level ground,\nthrottle released and pressed fully twice (neutral),\nthen accelerate hard, brake and corner." \
        --ok-label="CALIBRATE" --cancel-label="CANCEL" >/dev/null 2>&1
    case $? in
        0) echo calibrate ;;
        1) echo cancel ;;
        *) return 1 ;;
    esac
}

OPENSSL=/usr/bin/openssl
[ -x "$OPENSSL" ] || OPENSSL=$(command -v openssl 2>/dev/null || true)
HAVE_MD5SUM=0
command -v md5sum >/dev/null 2>&1 && HAVE_MD5SUM=1
# Stay on one filesystem when walking trees, if this BusyBox find supports it.
XDEV=
find "$R/jci/version.ini" -xdev >/dev/null 2>&1 && XDEV=-xdev
HAVE_SHA256SUM=0
command -v sha256sum >/dev/null 2>&1 && HAVE_SHA256SUM=1

md5_of() {
    local out
    if [ "$HAVE_MD5SUM" = 1 ]; then
        out=$(md5sum "$1" 2>/dev/null) && { printf '%s\n' "${out%% *}"; return 0; }
    fi
    if [ -n "$OPENSSL" ]; then
        out=$("$OPENSSL" dgst -md5 "$1" 2>/dev/null) && { printf '%s\n' "${out##* }"; return 0; }
    fi
    echo -
}

sha256_of() {
    local out
    if [ "$HAVE_SHA256SUM" = 1 ]; then
        out=$(sha256sum "$1" 2>/dev/null) && { printf '%s\n' "${out%% *}"; return 0; }
    fi
    if [ -n "$OPENSSL" ]; then
        out=$("$OPENSSL" dgst -sha256 "$1" 2>/dev/null) && { printf '%s\n' "${out##* }"; return 0; }
    fi
    echo -
}

hash_tools() {
    local md5=none sha=none
    [ -n "$OPENSSL" ] && { md5=openssl; sha=openssl; }
    [ "$HAVE_MD5SUM" = 1 ] && md5=md5sum
    [ "$HAVE_SHA256SUM" = 1 ] && sha=sha256sum
    printf 'md5=%s sha256=%s\n' "$md5" "$sha"
}

# cksum is always present: the USB launcher itself depends on it.
cksum_of() {
    local out
    out=$(cksum < "$1" 2>/dev/null) || { echo -; return 0; }
    set -- $out
    printf '%s:%s\n' "$1" "$2"
}

size_of() { wc -c < "$1" 2>/dev/null | tr -d ' \t\r\n'; }
attrs_of() { stat -c '%a %u %g' "$1" 2>/dev/null || echo '? ? ?'; }

# cap <outfile> <command...>: record a command, its output and its exit status.
cap() {
    local f="$OUT/$1"
    shift
    mkdir -p "${f%/*}"
    {
        printf '$ %s\n' "$*"
        "$@"
        printf '[exit %s]\n' "$?"
    } > "$f" 2>&1
}

# grab <outfile> <absolute path>: copy one file (also /proc and /sys files).
grab() {
    local f="$OUT/$1" src="$R$2"
    mkdir -p "${f%/*}"
    if [ -r "$src" ] && [ ! -d "$src" ]; then
        cat "$src" > "$f" 2>>"$OUT/errors.txt" || log "WARN: cannot read $2"
    else
        printf '%s\n' "$2" >> "$OUT/absent.txt"
    fi
}

# copy_tree <absolute dir> <max bytes> <all|text>: copy regular files into
# static/files/<path>. Private keys and password hashes are never copied.
copy_tree() {
    local dir="$1" max="$2" mode="$3" list p rel size copied=0
    if [ ! -d "$R$dir" ]; then
        printf '%s\n' "$dir" >> "$OUT/absent.txt"
        return 0
    fi
    list="$OUT/.copy-list"
    find "$R$dir" $XDEV -type f > "$list" 2>>"$OUT/errors.txt"
    while IFS= read -r p; do
        rel=${p#"$R"}
        if [ "$mode" = text ]; then
            case "$rel" in
                *.js|*.css|*.html|*.htm|*.xml|*.ini|*.conf|*.cfg|*.json|*.txt|*.sh|*.properties) ;;
                *) continue ;;
            esac
        fi
        case "$rel" in
            */shadow|*/shadow-|*/gshadow|*/gshadow-|*_key|*.key|*.pem|*/ssh/*key*|\
            */wpa_supplicant*|*/hostapd*|*/ppp/*secrets*|*/passwd|*/passwd-|*.psk|*/wifi*.conf)
                printf '%s\n' "$rel" >> "$OUT/static/skipped-private.txt"
                continue
                ;;
        esac
        size=$(size_of "$p")
        [ -n "$size" ] || continue
        if [ "$size" -gt "$max" ]; then
            printf '%s %s\n' "$rel" "$size" >> "$OUT/static/skipped-large.txt"
            continue
        fi
        mkdir -p "$OUT/static/files${rel%/*}" 2>>"$OUT/errors.txt" || continue
        cp "$p" "$OUT/static/files$rel" 2>>"$OUT/errors.txt" && copied=$((copied + 1))
    done < "$list"
    rm -f "$list"
    log "copied $copied files from $dir ($mode, max $max bytes)"
}

firmware() {
    local ini="$R/jci/version.ini" ver patch
    [ -r "$ini" ] || { echo unknown; return 0; }
    ver=$(grep '^JCI_SW_VER=' "$ini" | cut -d'"' -f2 | tr -d '\r')
    ver=${ver##*_}
    patch=$(grep '^JCI_SW_VER_PATCH=' "$ini" | cut -d'"' -f2 | tr -d '\r')
    case "$ver" in *"$patch") ;; *) ver="$ver$patch" ;; esac
    printf '%s\n' "${ver:-unknown}"
}

root_mount_mode() {
    awk '$2 == "/" { n = split($4, o, ","); m = "rw"; for (i = 1; i <= n; i++) if (o[i] == "ro") m = "ro"; mode = m } END { print (mode == "" ? "?" : mode) }' \
        "$R/proc/mounts" 2>/dev/null || echo '?'
}

# Fingerprint of files we must not change; compared at the end.
INTEGRITY_FILES="/jci/sm/sm.conf /jci/sm/sm_WCP.conf /jci/gui/common/js/Common.js /jci/version.ini /etc/aap_system_attributes.xml /etc/aap_system_attributes_UCP.xml"
integrity() {
    local f
    for f in $INTEGRITY_FILES; do
        if [ -f "$R$f" ]; then
            printf '%s %s\n' "$(cksum_of "$R$f")" "$f"
        else
            printf 'absent %s\n' "$f"
        fi
    done
    printf 'root=%s\n' "$(root_mount_mode)"
    printf 'nvram bus=%s lvds=%s\n' "$(nvram_value bus_bcm_speed_restriction)" "$(nvram_value lvds_speed_restriction)"
}

NVRAM_KEYS="$R/sys/class/nvram/nv-config/keys"
nvram_value() {
    local f="$NVRAM_KEYS/$1"
    [ -r "$f" ] || { echo absent; return 0; }
    tr -d '\r\n' < "$f" 2>/dev/null || echo unreadable
}

# ---------------------------------------------------------------- runtime

processes_tsv() {
    local sp pd pid s comm rest cmd aff start
    printf 'pid\tppid\tstart_s\tutime_ticks\tstime_ticks\trss_pages\tlast_cpu\tcpus_allowed\tcomm\tcmdline\n'
    for sp in "$R"/proc/[0-9]*/stat; do
        [ -r "$sp" ] || continue
        pd=${sp%/stat}
        pid=${pd##*/}
        s=$(cat "$sp" 2>/dev/null) || continue
        [ -n "$s" ] || continue
        comm=${s#*\(}
        comm=${comm%\)*}
        rest=${s##*\) }
        # rest starts at field 3 (state): ppid=$2 utime=$12 stime=$13
        # starttime=$20 rss=$22 processor=$37
        set -- $rest
        start=${20:-0}
        case "$start" in ''|*[!0-9]*) start=0 ;; esac
        cmd=$(tr '\000' ' ' < "$pd/cmdline" 2>/dev/null)
        aff=$(grep '^Cpus_allowed_list' "$pd/status" 2>/dev/null | cut -f2)
        printf '%s\t%s\t%d.%02d\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
            "$pid" "$2" "$((start / USER_HZ))" "$((start % USER_HZ))" \
            "${12}" "${13}" "${22}" "${37}" "$aff" "$comm" "$cmd"
    done
}

ld_preload_report() {
    local env pd
    for env in "$R"/proc/[0-9]*/environ; do
        [ -r "$env" ] || continue
        grep -q LD_PRELOAD "$env" 2>/dev/null || continue
        pd=${env%/environ}
        printf '%s\t%s\t%s\n' "${pd##*/}" "$(cat "$pd/comm" 2>/dev/null)" \
            "$(tr '\000' '\n' < "$env" | grep '^LD_PRELOAD=')"
    done
}

usb_devices() {
    local u
    printf 'device\tvid:pid\tmanufacturer\tproduct\n'
    for u in "$R"/sys/bus/usb/devices/*; do
        [ -r "$u/idVendor" ] || continue
        printf '%s\t%s:%s\t%s\t%s\n' "${u##*/}" "$(cat "$u/idVendor")" "$(cat "$u/idProduct" 2>/dev/null)" \
            "$(cat "$u/manufacturer" 2>/dev/null)" "$(cat "$u/product" 2>/dev/null)"
    done
}

# Only the key names plus the two keys TouchTune itself reads; other NVRAM
# attributes are left alone.
nvram_dump() {
    local k
    mkdir -p "$OUT/runtime/nvram"
    cap runtime/nvram-ls.txt ls -la "$NVRAM_KEYS"
    for k in bus_bcm_speed_restriction lvds_speed_restriction; do
        printf '%s\n' "$(nvram_value "$k")" > "$OUT/runtime/nvram/$k"
    done
}

snapshot() {
    local d=runtime f
    log "runtime snapshot"
    for f in uptime loadavg meminfo cpuinfo mounts modules interrupts stat cmdline version; do
        grab "$d/proc-$f.txt" "/proc/$f"
    done
    grab "$d/proc-net-dev.txt" /proc/net/dev
    cap "$d/date.txt" date
    cap "$d/uname.txt" uname -a
    cap "$d/df.txt" df
    cap "$d/free.txt" free
    cap "$d/ps.txt" ps
    cap "$d/ps-w.txt" ps w
    cap "$d/top.txt" top -b -n 1
    cap "$d/dmesg.txt" dmesg
    cap "$d/logread.txt" logread
    cap "$d/ifconfig.txt" ifconfig -a
    cap "$d/net-ls.txt" ls -la "$R/sys/class/net"
    cap "$d/tmp-ls.txt" ls -la "$R/tmp"
    cap "$d/tmp-mnt-ls.txt" ls -la "$R/tmp/mnt"
    cap "$d/data-ls.txt" ls -lnR "$R/tmp/mnt/data"
    # Trailing slash: /data_persist is a symlink on the CMU; list its content.
    cap "$d/data_persist-ls.txt" ls -lnR "$R/data_persist/"
    processes_tsv > "$OUT/$d/processes.tsv" 2>>"$OUT/errors.txt"
    ld_preload_report > "$OUT/$d/ld_preload.tsv" 2>>"$OUT/errors.txt"
    usb_devices > "$OUT/$d/usb-devices.tsv" 2>>"$OUT/errors.txt"
    nvram_dump
}

# ---------------------------------------------------------------- vehicle data
# Read-only probe for gauges (docs/13): every field of every smdb namespace via
# Mazda's own smdb-read (what MZD_Speedometer polls), a fast sample of a few
# fields to see the refresh rate, and the GPS position over D-Bus.

SMDB_READ="$R/jci/bin/smdb-read"
[ -x "$SMDB_READ" ] || SMDB_READ=$(command -v smdb-read 2>/dev/null || true)
DBUS_SEND="$R/usr/bin/dbus-send"

smdb_fields() {     # smdb_fields <namespace.xml>: element names with a type
    sed -n 's/^[[:space:]]*<\([A-Za-z][A-Za-z0-9_-]*\)[[:space:]][[:space:]]*type=.*/\1/p' "$1"
}

NL='
'
TAB=$(printf '\t')
CR=$(printf '\r')
# smdb_value <namespace> <field>: sets SMDB_V to the raw output on one line.
# One process per value; the CMU has to do this for ~740 fields per sweep.
smdb_value() {
    SMDB_V=$("$SMDB_READ" -n "$1" -e "$2" 2>&1)
    case "$SMDB_V" in
        *"$NL"*|*"$TAB"*|*"$CR"*) SMDB_V=$(printf '%s' "$SMDB_V" | tr '\r\n\t' '   ') ;;
    esac
}

vehicle_probe() {
    local d="$OUT/vehicle-data" x ns f r t n
    mkdir -p "$d"
    if [ -z "$SMDB_READ" ] || [ ! -d "$R/jci/smdb" ]; then
        echo "smdb-read or /jci/smdb missing" > "$d/absent.txt"
        log "vehicle probe: smdb-read not available"
        return 0
    fi
    log "vehicle probe: $PROBE_ROUNDS sweeps, fast sample ${PROBE_FAST_S}s"
    for x in "$R"/jci/smdb/*.xml; do
        [ -f "$x" ] || continue
        ns=${x##*/}
        ns=${ns%.xml}
        smdb_fields "$x" > "$d/fields-$ns.txt" 2>>"$OUT/errors.txt"
    done

    printf 'round\tuptime\tnamespace\tfield\tvalue\n' > "$d/sweep.tsv"
    r=1
    while [ "$r" -le "$PROBE_ROUNDS" ]; do
        for x in "$d"/fields-*.txt; do
            [ -s "$x" ] || continue
            ns=${x##*/fields-}
            ns=${ns%.txt}
            t=$(uptime_s)
            while IFS= read -r f; do
                smdb_value "$ns" "$f"
                printf '%s\t%s\t%s\t%s\t%s\n' "$r" "$t" "$ns" "$f" "$SMDB_V"
            done < "$x"
        done >> "$d/sweep.tsv"
        [ "$r" -lt "$PROBE_ROUNDS" ] && sleep "$PROBE_GAP_S"
        r=$((r + 1))
    done

    {
        printf 'uptime'
        for f in $PROBE_FAST_FIELDS; do printf '\t%s' "$f"; done
        printf '\n'
        t=$(cut -d. -f1 "$R/proc/uptime" 2>/dev/null || echo 0)
        t=$((t + PROBE_FAST_S))
        n=0
        # Stop at the deadline, or after 50 samples per second at most.
        while [ "$(cut -d. -f1 "$R/proc/uptime" 2>/dev/null || echo "$t")" -lt "$t" ] && \
            [ "$n" -lt $((PROBE_FAST_S * 50)) ]; do
            n=$((n + 1))
            printf '%s' "$(uptime_s)"
            for f in $PROBE_FAST_FIELDS; do smdb_value vdm_vdt_current_data "$f"; printf '\t%s' "$SMDB_V"; done
            printf '\n'
        done
    } > "$d/fast.tsv"

    for r in 1 2 3; do
        printf '=== uptime %s\n' "$(uptime_s)"
        if [ -x "$DBUS_SEND" ]; then
            "$DBUS_SEND" --print-reply --reply-timeout=2000 --address=unix:path=/tmp/dbus_service_socket \
                --type=method_call --dest=com.jci.lds.data /com/jci/lds/data com.jci.lds.data.GetPosition 2>&1
        else
            echo "dbus-send not available"
        fi
        [ "$r" -lt 3 ] && sleep 1
    done > "$d/gps.txt"
    log "vehicle probe: $(($(wc -l < "$d/sweep.tsv") - 1)) values, $(($(wc -l < "$d/fast.tsv") - 1)) fast samples"
}

# Research for a fast, lock-free data path (docs/13), FULL mode only:
# - copies of the smdb/VBS libraries and tools, to read their API on the host;
# - smdb-read's own help, the System V IPC objects and /dev/shm (the SMDB lock);
# - the D-Bus names and interfaces on both buses, and a short recording of the
#   broadcast signals, to see which vehicle data passes by and how often.
# Nothing here writes outside the stick. smdb-read is never killed (a killed
# smdb-read can leave the SMDB semaphore locked; see docs/13).
RESEARCH_BINARIES="/jci/lib/libjcismdb.so /jci/lib/libjcivdm.so /jci/bin/smdb-read /jci/bin/smdb-write /jci/lib/libjcivdt_client.so /jci/lib/libjcivbsvdtclient.so /jci/vbs/svcjcivbs.so /jci/vbs/vbs-mod-wrapper /jci/vbs/modules/libjcimod_vdt.so /jci/vbs/modules/libjcimod_can.so /jci/vdt/svcjcivdt.so"
DBUS_MONITOR_S="${MO_DBUS_MONITOR_S:-10}"
DBUS_MONITOR="$R/usr/bin/dbus-monitor"
IPCS="$R/usr/bin/ipcs"
DBUS_BUSES="service:/tmp/dbus_service_socket hmi:/tmp/dbus_hmi_socket"

dbus_call() {       # dbus_call <socket> <dest> <path> <method> [args...]
    local sock="$1" dest="$2" path="$3" method="$4"
    shift 4
    "$DBUS_SEND" --print-reply --reply-timeout=2000 --address="unix:path=$sock" \
        --type=method_call --dest="$dest" "$path" "$method" "$@" 2>&1
}

research() {
    local d="$OUT/research" b bus name sock path pid
    mkdir -p "$d/bin" "$d/dbus"
    log "research: binaries, smdb help, IPC, D-Bus"
    for b in $RESEARCH_BINARIES; do
        if [ -f "$R$b" ]; then
            cp "$R$b" "$d/bin/$(echo "${b#/}" | tr / _)" 2>>"$OUT/errors.txt"
        else
            printf '%s\n' "$b" >> "$d/bin/absent.txt"
        fi
    done
    if [ -n "$SMDB_READ" ]; then
        {
            echo "\$ smdb-read -h"
            "$SMDB_READ" -h 2>&1
            echo "\$ smdb-read -v -n vdm_vdt_current_data"
            "$SMDB_READ" -v -n vdm_vdt_current_data 2>&1
        } > "$d/smdb-read-help.txt"
    fi
    {
        [ -x "$IPCS" ] && { echo "\$ ipcs -a"; "$IPCS" -a 2>&1; } || echo "ipcs not available"
        echo "\$ ls -la /dev/shm"
        ls -la "$R/dev/shm" 2>&1
        for b in "$R"/tmp/shm_key_*.txt; do
            [ -f "$b" ] && printf '%s: %s\n' "${b#"$R"}" "$(cat "$b")"
        done
    } > "$d/ipc.txt"
    [ -x "$DBUS_SEND" ] || { echo "dbus-send not available" > "$d/dbus/absent.txt"; return 0; }
    for bus in $DBUS_BUSES; do
        name=${bus%%:*}
        sock=${bus#*:}
        dbus_call "$sock" org.freedesktop.DBus / org.freedesktop.DBus.ListNames > "$d/dbus/$name-names.txt"
        # Introspect the vehicle-data services at / and at their own path.
        for b in $(grep -o '"com\.jci\.[^"]*"' "$d/dbus/$name-names.txt" | tr -d '"' | grep -i -E 'vbs|vdt|vdm|lds|smdb' | sort -u); do
            path="/$(echo "$b" | tr . /)"
            {
                echo "=== $b /"
                dbus_call "$sock" "$b" / org.freedesktop.DBus.Introspectable.Introspect
                echo "=== $b $path"
                dbus_call "$sock" "$b" "$path" org.freedesktop.DBus.Introspectable.Introspect
            } > "$d/dbus/$name-introspect-$b.txt"
        done
        if [ -x "$DBUS_MONITOR" ]; then
            "$DBUS_MONITOR" --address "unix:path=$sock" "type='signal'" > "$d/dbus/$name-signals.txt" 2>&1 &
            pid=$!
            sleep "$DBUS_MONITOR_S"
            kill "$pid" 2>/dev/null
            wait "$pid" 2>/dev/null
        fi
    done
    log "research: $(ls "$d/bin" | grep -vc absent.txt) binaries, $(cat "$d"/dbus/*-signals.txt 2>/dev/null | grep -c '^signal') signals in ${DBUS_MONITOR_S}s per bus"
}

# Calibration recording for the Meters scales (docs/13): CAL_S seconds of the
# vehicle signals from D-Bus, each signal preceded by "@<uptime>", plus YawRate
# (only in smdb) as fast as one smdb-read at a time allows. Read-only; written
# to the stick. dbus-monitor is stopped by its PID; the YawRate loop is stopped
# with a flag and lets its last smdb-read finish (never killed, see docs/13).
CAL_S="${MO_CAL_S:-300}"

calibrate() {
    local d="$OUT/calibration" stop="$OUT/calibration/.stop" mon_pid awk_pid yaw_pid
    mkdir -p "$d"
    log "calibration: recording ${CAL_S}s"
    {
        echo "start_uptime=$(uptime_s)"
        echo "duration_s=$CAL_S"
        echo "bus=/tmp/dbus_service_socket interfaces=com.jci.vbs.vdt,com.jci.vbs.bcm"
    } > "$d/meta.txt"
    if [ -x "$DBUS_MONITOR" ]; then
        (
            "$DBUS_MONITOR" --address unix:path=/tmp/dbus_service_socket \
                "type='signal',interface='com.jci.vbs.vdt'" "type='signal',interface='com.jci.vbs.bcm'" &
            echo $! > "$d/.monitor.pid"
            wait
        ) 2>>"$OUT/errors.txt" | awk -v up="$R/proc/uptime" '
            /^signal / { if ((getline u < up) > 0) { split(u, a, " "); print "@" a[1] } close(up) }
            { print }' > "$d/signals.txt" &
        awk_pid=$!
    else
        echo "dbus-monitor not available" > "$d/absent.txt"
    fi
    if [ -n "$SMDB_READ" ]; then
        (
            printf 'uptime\tYawRate\n'
            while [ ! -f "$stop" ]; do
                smdb_value vdm_vdt_current_data YawRate
                printf '%s\t%s\n' "$(uptime_s)" "$SMDB_V"
            done
        ) > "$d/yaw.tsv" &
        yaw_pid=$!
    fi
    sleep "$CAL_S"
    : > "$stop"
    mon_pid=$(cat "$d/.monitor.pid" 2>/dev/null)
    [ -z "$mon_pid" ] || kill "$mon_pid" 2>/dev/null
    [ -z "$awk_pid" ] || wait "$awk_pid" 2>/dev/null
    [ -z "$yaw_pid" ] || wait "$yaw_pid" 2>/dev/null
    rm -f "$stop" "$d/.monitor.pid"
    echo "end_uptime=$(uptime_s)" >> "$d/meta.txt"
    log "calibration: $(grep -c '^signal' "$d/signals.txt" 2>/dev/null) signals, $(($(wc -l < "$d/yaw.tsv" 2>/dev/null || echo 1) - 1)) yaw samples"
}

# One line for SUMMARY.txt: fields read, fields that changed between sweeps,
# and the fast-sample rate.
vehicle_summary() {
    local d="$OUT/vehicle-data" n changed fast
    [ -f "$d/sweep.tsv" ] || { echo "not read"; return 0; }
    # A literal tab: BusyBox 1.19 awk (the CMU) does not read -F'\t' as a tab.
    n=$(awk -F"$TAB" 'NR > 1 && $1 == 1' "$d/sweep.tsv" | wc -l | tr -d ' ')
    changed=$(awk -F"$TAB" 'NR > 1 { k = $3 " " $4; if (k in v && v[k] != $5) c[k] = 1; v[k] = $5 } END { n = 0; for (k in c) n++; print n }' "$d/sweep.tsv")
    fast=$(($(wc -l < "$d/fast.tsv") - 1))
    printf '%s fields, %s changed between sweeps, %s fast samples in %s s\n' "$n" "$changed" "$fast" "$PROBE_FAST_S"
}

# ---------------------------------------------------------------- static

static_dump() {
    local d dir name all
    log "static dump"
    mkdir -p "$OUT/static" "$OUT/inventory"

    # Copies: SM configuration, boot scripts, HMI text files, /etc.
    copy_tree /jci/sm 1048576 all
    copy_tree /jci/scripts 1048576 all
    copy_tree /jci "$MAX_TEXT_BYTES" text
    copy_tree /etc "$MAX_ETC_BYTES" all

    # Inventory: every file with mode/owner/size, plus hashes of executables.
    all="$OUT/inventory/all-files.txt"
    : > "$all"
    for dir in /jci /etc /usr /lib /bin /sbin /opt; do
        [ -d "$R$dir" ] || continue
        find "$R$dir" $XDEV 2>>"$OUT/errors.txt" | sed "s#^$R##" >> "$all"
        name=$(echo "$dir" | tr / _)
        cap "inventory/ls$name.txt" ls -lnR "$R$dir"
    done
    cap inventory/resources-ls.txt ls -la "$R/tmp/mnt/resources"
    log "inventory: $(wc -l < "$all" | tr -d ' ') paths"

    log "hashing executables and libraries"
    grep -E '^/(usr/bin|usr/sbin|bin|sbin|jci/bin|jci/tools)/' "$all" > "$OUT/.hash-list" 2>/dev/null
    grep -E '\.so(\.[0-9.]*)?$' "$all" >> "$OUT/.hash-list" 2>/dev/null
    while IFS= read -r name; do
        [ -f "$R$name" ] && [ ! -L "$R$name" ] || continue
        printf '%s  %s\n' "$(md5_of "$R$name")" "$name"
    done < "$OUT/.hash-list" > "$OUT/inventory/md5-binaries.txt"
    rm -f "$OUT/.hash-list"

    # Key files for the plan (AA touch, boot, HMI tweaks, TouchTune).
    grep -E '/(blmjciaapa\.so.*|blmjcicarplay\.so.*|libdevmgr_interface\.so.*|aap_service|aap_system_attributes.*\.xml|sm[^/]*\.conf|Common\.js|systemApp\.js|version\.ini|start_network\.sh|set_.*speed_restriction_config\.sh|jci-dialog|smctl)$' \
        "$all" > "$OUT/.key-list" 2>/dev/null
    {
        printf 'path\tsize\tmode uid gid\tcksum\tmd5\tsha256\n'
        while IFS= read -r name; do
            [ -f "$R$name" ] || continue
            printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$name" "$(size_of "$R$name")" "$(attrs_of "$R$name")" \
                "$(cksum_of "$R$name")" "$(md5_of "$R$name")" "$(sha256_of "$R$name")"
        done < "$OUT/.key-list"
    } > "$OUT/inventory/key-files.tsv"
    rm -f "$OUT/.key-list"

    # Which SM config is used, and how AA is defined in it.
    grep -rn -E 'sm_WCP|sm\.conf' "$R/jci/scripts" "$R/etc/init.d" > "$OUT/inventory/sm-config-references.txt" 2>/dev/null
    for f in "$R"/jci/sm/*.conf; do
        [ -f "$f" ] || continue
        grep -n -i -E 'aap|jciAAPA|carplay|wifi|aha|pandora|stitcher|slacker|sirius|dab|tuner|dvd|telematic' "$f" \
            > "$OUT/inventory/grep-${f##*/}.txt" 2>/dev/null
    done
}

# ---------------------------------------------------------------- summary

summary() {
    local mode="$1" fw common_sha common_state preload n
    fw=$(firmware)
    common_sha=$(sha256_of "$R/jci/gui/common/js/Common.js")
    case "$common_sha" in
        "$COMMON_STOCK_SHA256") common_state="stock (TouchTune recognises this)" ;;
        "$COMMON_TOUCHTUNE_SHA256") common_state="TouchTune installed" ;;
        -) if [ -f "$R/jci/gui/common/js/Common.js" ]; then
               common_state="present, but no sha256 tool to check it"
           else
               common_state="not found"
           fi ;;
        *) common_state="UNKNOWN: TouchTune will refuse" ;;
    esac
    preload=$(grep -c . "$OUT/runtime/ld_preload.tsv" 2>/dev/null)
    preload=${preload:-0}
    n=$(grep -c . "$OUT/runtime/usb-devices.tsv" 2>/dev/null)
    n=${n:-1}
    {
        echo "MiatOff dump $MO_VERSION"
        echo "mode:             $mode"
        echo "uptime at start:  $T0 s"
        echo "uptime at end:    $(uptime_s) s"
        echo "firmware:         $fw"
        case "$fw" in
            74.00.324|74.00.324A) echo "firmware check:   OK (TouchTune / oem-aa-mod target)" ;;
            *) echo "firmware check:   DIFFERENT: do not continue without analysis" ;;
        esac
        echo "Common.js:        $common_state"
        echo "                  sha256=$common_sha"
        echo "hash tools:       $(hash_tools)"
        echo "root mount:       $(root_mount_mode)"
        echo "NVRAM bus_bcm_speed_restriction: $(nvram_value bus_bcm_speed_restriction)"
        echo "NVRAM lvds_speed_restriction:    $(nvram_value lvds_speed_restriction)"
        echo "USB devices:      $((n - 1)) (see runtime/usb-devices.tsv; retrofit hub?)"
        echo "LD_PRELOAD procs: $preload (see runtime/ld_preload.tsv)"
        echo "vehicle data:     $(vehicle_summary) (see vehicle-data/)"
        echo "network ifaces:   $(ls "$R/sys/class/net" 2>/dev/null | tr '\n' ' ')"
        echo
        echo "SM configs:"
        for f in "$R"/jci/sm/*.conf; do
            [ -f "$f" ] || continue
            echo "  ${f#"$R"}  md5=$(md5_of "$f")  cksum=$(cksum_of "$f")  jciAAPA-lines=$(grep -c jciAAPA "$f")"
        done
        echo
        echo "Android Auto files:"
        grep -E 'aap|blmjciaapa' "$OUT/inventory/key-files.tsv" 2>/dev/null | sed 's/^/  /' || \
            echo "  (only in FULL mode)"
        echo
        echo "Integrity (before/after):"
        if [ "$INTEGRITY_BEFORE" = "$(integrity)" ]; then
            echo "  UNCHANGED: nothing on the system was modified"
        else
            echo "  DIFFERENCE FOUND: see integrity-before.txt / integrity-after.txt"
        fi
    } > "$OUT/SUMMARY.txt"
}

# ---------------------------------------------------------------- main

cleanup() {
    status=$?
    trap - 0
    [ -z "$OUT" ] || rm -f "$OUT/.copy-list" "$OUT/.hash-list" "$OUT/.key-list" 2>/dev/null
    sync 2>/dev/null
    [ "$GUARD_CREATED" = 0 ] || { rm -f "$MO_GUARD/pid"; rmdir "$MO_GUARD" 2>/dev/null; }
    exit "$status"
}
trap cleanup 0
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

if [ ! -d "$R/jci" ]; then
    echo "ERROR: /jci not found; this script runs on a Mazda CMU." >&2
    exit 1
fi

if [ "$MO_TEST" != 1 ]; then
    # Only ever run from a USB mount; never remount anything else.
    case "$USB" in
        /tmp/mnt/sd[a-z][0-9]) ;;
        *) echo "ERROR: not started from a USB stick ($USB)" >&2; exit 1 ;;
    esac
    # The stick may be mounted read-only; this remount touches only the USB.
    mount -o rw,remount "$USB" 2>/dev/null || true
    # Lowest CPU priority, inherited by every command below, so Mazda's own
    # services always win while the dump copies and hashes files.
    renice -n 19 -p $$ >/dev/null 2>&1 || renice 19 $$ >/dev/null 2>&1 || true
fi
if : >> "$USB/miatoff-dump.log" 2>/dev/null; then
    exec >> "$USB/miatoff-dump.log" 2>&1
else
    popup "The USB is not writable.\n\nNothing was changed."
    exit 1
fi
log "=== MiatOff dump $MO_VERSION started from $USB ==="

# One dump at a time. A guard left behind by a run that was cut off (ignition
# off, then resume from suspend keeps /tmp) is taken over when its PID is gone.
if ! mkdir "$MO_GUARD" 2>/dev/null; then
    old_pid=$(tr -cd '0-9' < "$MO_GUARD/pid" 2>/dev/null)
    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
        log "another dump is running (pid $old_pid); exiting"
        popup "A MiatOff dump is already running.\n\nWait until it has finished."
        exit 0
    fi
    log "stale guard (pid ${old_pid:-?} gone); taking over"
    rm -f "$MO_GUARD/pid"
    rmdir "$MO_GUARD" 2>/dev/null
    mkdir "$MO_GUARD" 2>/dev/null || { log "ERROR: cannot take guard $MO_GUARD"; exit 1; }
fi
GUARD_CREATED=1
echo $$ > "$MO_GUARD/pid"

ACTION=$(choose_action) || { log "ERROR: dialog failed; nothing done"; exit 1; }
log "action: $ACTION"
[ "$ACTION" = cancel ] && { log "cancelled"; exit 0; }

if [ "$ACTION" = full ] || [ "$ACTION" = calibrate ]; then
    free_kb=$(df -k "$USB" 2>/dev/null | awk 'NR == 2 { print $4 }')
    case "$free_kb" in ''|*[!0-9]*) free_kb=0 ;; esac
    if [ "$free_kb" -lt "$MIN_FREE_KB_FULL" ]; then
        log "ERROR: only ${free_kb} KB free on USB; full dump needs $MIN_FREE_KB_FULL KB"
        popup "Not enough free space on the USB (min. 256 MB).\n\nNothing was changed."
        exit 1
    fi
fi

T0=$(uptime_s)
BASE="$USB/miatoff-dumps"
mkdir -p "$BASE" || { log "ERROR: cannot create $BASE"; exit 1; }
n=$(ls -d "$BASE"/[0-9][0-9][0-9]-* 2>/dev/null | wc -l | tr -d ' ')
n=$((n + 1))
OUT="$BASE/$(printf '%03d' "$n")-$ACTION-up${T0%%.*}s"
mkdir -p "$OUT" || { log "ERROR: cannot create $OUT"; exit 1; }
log "output: $OUT"

INTEGRITY_BEFORE=$(integrity)
printf '%s\n' "$INTEGRITY_BEFORE" > "$OUT/integrity-before.txt"

popup "MiatOff dump running ($ACTION)...\n\nDo not remove the USB."
snapshot
if [ "$ACTION" = full ]; then
    popup "MiatOff dump: reading vehicle data (2-4 min)...\n\nKeep the engine running, do not remove the USB."
    vehicle_probe
    research
    popup "MiatOff dump running: copying files...\n\nDo not remove the USB."
    static_dump
elif [ "$ACTION" = calibrate ]; then
    popup "CALIBRATION running (${CAL_S} s).\n\n1. Stand still for 15 s on level ground\n2. Release the throttle, press fully twice (neutral)\n3. Accelerate, brake, corner left and right"
    calibrate
fi
integrity > "$OUT/integrity-after.txt"
summary "$ACTION"
sync
log "done: $OUT"
popup "MiatOff dump finished.\n\nFolder: miatoff-dumps/${OUT##*/}\nYou can now remove the USB."
exit 0

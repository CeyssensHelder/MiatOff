"""Build the audio paths research kit and test it only against a fabricated CMU root.

    python audio-paths-stick/build_and_test.py .                     # Git Bash sh (Windows) or sh
    python audio-paths-stick/build_and_test.py . busybox:1.25        # in a BusyBox container
"""
import hashlib
import io
import math
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import wave
import zipfile

HERE = Path(__file__).resolve().parent
REPO = Path(sys.argv[1] if len(sys.argv) > 1 else HERE.parent).resolve()
DOCKER = sys.argv[2] if len(sys.argv) > 2 else ''
sys.path.insert(0, str(REPO / 'tools'))
import stickkit

VERSION = '0.7.0'
SH = Path('C:/Program Files/Git/bin/sh.exe')
if not SH.is_file():
    SH = shutil.which('sh')
if not SH:
    raise SystemExit('POSIX sh is required')


def probe_wav() -> bytes:
    """Three short 1.6 kHz beeps, 48 kHz stereo 16-bit (what most outputs take without conversion), at a fifth of
    full scale: some outputs may skip the volume knob. Whole sample values, so the bytes are the same everywhere."""
    rate, amp, fade = 48000, 0.2 * 32767, int(0.005 * 48000)
    frames = [0] * int(0.05 * rate)                       # a moment of silence first: some outputs clip the start
    for beep in range(3):
        n = int(0.15 * rate)
        for i in range(n):
            env = min(1.0, i / fade, (n - 1 - i) / fade)
            frames.append(int(round(amp * env * math.sin(2 * math.pi * 1600 * i / rate))))
        if beep < 2:
            frames += [0] * int(0.12 * rate)
    frames += [0] * int(0.05 * rate)
    out = io.BytesIO()
    with wave.open(out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b''.join(struct.pack('<hh', s, s) for s in frames))
    return out.getvalue()


script = (HERE / 'audio-paths.sh').read_bytes().replace(b'\r\n', b'\n')
notice = (
    f'MiatOff audio paths {VERSION}\n'
    'SPDX-License-Identifier: GPL-3.0-or-later\n'
    'The unchanged launcher payload is from TouchTune 1.2.1 by Miatafy.\n'
    'Launcher generation and USB dispatch reuse MiatOff tools/stickkit.py.\n'
    'The audio manager request sequence follows the public gartnera/headunit project (AGPL-3.0); no code is copied.\n'
    'See the complete MiatOff NOTICE and LICENSE included in this package.\n'
).encode()
kit = stickkit.Kit('MO-PATHS.ID', f'miatoff-audio-paths-{VERSION}\n'.encode(),
                   'audio-paths.sh', script, extra={
                       'probe.wav': probe_wav(),
                       'README.txt': (HERE / 'README.txt').read_bytes().replace(b'\r\n', b'\n'),
                       'NOTICE.txt': notice,
                       'NOTICE': (REPO / 'NOTICE').read_bytes(),
                       'LICENSE': (REPO / 'LICENSE').read_bytes(),
                   })


def write(root, path, data, exe=False):
    p = root / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data.encode() if isinstance(data, str) else data)
    if exe:
        os.chmod(p, 0o755)
    return p


def digest(root, stick):
    h = hashlib.sha256()
    for p in sorted(root.rglob('*')):
        if p.is_file() and stick not in p.parents:
            h.update(str(p.relative_to(root)).encode())
            h.update(p.read_bytes())
    return h.digest()


def check(value, message):
    if not value:
        raise AssertionError(message)
    print('PASS', message)


def run(root, answers, **extra):
    base = dict(MO_TEST='1', MO_PATHS_ANSWERS=answers, MO_PATHS_BOUND='2', HOME='/root', **extra)
    if DOCKER:
        env = dict(base, MO_ROOT='/w/root', MO_PATHS_GUARD='/w/root/tmp/guard')
        return subprocess.run(
            ['docker', 'run', '--rm', '--network', 'none', '--pull', 'never', '-v', str(root.parent) + ':/w',
             *[arg for k, v in env.items() for arg in ['-e', k + '=' + v]],
             DOCKER, 'sh', '-c', kit.launcher_name()[2:-4]],
            capture_output=True, text=True, timeout=120)
    env = dict(os.environ, MO_ROOT=root.as_posix(), MO_PATHS_GUARD=(root / 'tmp/guard').as_posix(), **base)
    env['PATH'] = 'C:/Program Files/Git/usr/bin;C:/Program Files/Git/bin;' + env['PATH']
    return subprocess.run([str(SH), '-c', kit.launcher_name()[2:-4]],
                          env=env, capture_output=True, text=True, timeout=120)


def results(stick):
    return sorted((stick / 'miatoff-audio-paths').iterdir())


# Fakes. Their logs go next to the fake root (outside it). The page signal probe only listens and reads.
DBUS = r'''#!/bin/sh
for arg; do last="$arg"; done
case "$last" in
com.jci.vbs.am.GetActiveSource) echo 'method return time=1.2 sender=:1.5'; echo '   string "FM"   string "NONE"'; exit 0 ;;
esac
echo "$*" >> "$MO_ROOT/../forbidden.log"
echo 'FORBIDDEN CALL'; exit 99
'''
# The HMI bus during the window: an app context change naming Meters, a private message that must be dropped, and
# meanwhile Opera opens and closes a playback device and writes a local storage file.
MONITOR = r'''#!/bin/sh
trap 'echo STOPPED >> "$MO_ROOT/../monitor.log"; exit 0' TERM
echo "$*" >> "$MO_ROOT/../monitor.args"
echo "signal sender=:1.9 -> dest=(null destination) serial=5 path=/com/jci/gui; interface=com.jci.gui.ctx; member=ContextChanged"
echo '   string "_miatoffApp"'
echo '   string "MiatoffMeters"'
echo "signal sender=:1.9 -> dest=(null destination) serial=6 path=/com/jci/bt; interface=com.jci.bt.msg; member=Incoming"
echo '   string "Call from Alice: see you at 8"'
echo "signal sender=:1.9 -> dest=(null destination) serial=7 path=/com/jci/gui; interface=com.jci.gui.ctx; member=ContextChanged"
echo '   string "system"'
A="$MO_ROOT/proc/asound/card0/pcm0p/sub0/status"
sleep 1
printf 'state: RUNNING\nowner_pid   : 4242\ntrigger_time: 1.2\n' > "$A"
mkdir -p "$MO_ROOT/data_persist/opera/localstorage"; echo x > "$MO_ROOT/data_persist/opera/localstorage/x.dat"
sleep 1
echo closed > "$A"
while :; do sleep 1; done
'''
BUSYBOX = r'''#!/bin/sh
case "$1" in
--list) printf 'ash\nawk\nnc\nsed\n' ;;
*) echo "BusyBox v1.19.4 (fake) multi-call binary."; exit 1 ;;
esac
'''
# nc: "-l -p PORT" waits for the client's text and prints it; a client writes its input for the listener.
NC = r'''#!/bin/sh
C="$MO_ROOT/../nc.conn"
if [ "$1" = -l ]; then
    [ -n "$MO_FAKE_NC" ] && { echo "nc: bind: Address already in use" >&2; exit 1; }
    while [ ! -f "$C" ]; do sleep 0.1; done
    cat "$C"
    while :; do sleep 1; done
fi
cat > "$C"
'''


def outside(root, stick):
    """What the probe itself could change outside the USB: everything but the fakes' playground."""
    h = hashlib.sha256()
    for p in sorted(root.rglob('*')):
        rel = p.relative_to(root).as_posix()
        if p.is_file() and stick not in p.parents and not rel.startswith(('proc/', 'data_persist/')):
            h.update(rel.encode())
            h.update(p.read_bytes())
    return h.digest()


with tempfile.TemporaryDirectory(prefix='paths-test-', dir=HERE) as temp:
    root = Path(temp) / 'root'
    stick = root / 'tmp/mnt/sda1'
    stick.mkdir(parents=True)
    side = Path(temp)

    def fresh():
        for name in ('monitor.log', 'monitor.args', 'nc.conn', 'forbidden.log'):
            (side / name).unlink(missing_ok=True)
        write(root, 'proc/asound/card0/pcm0p/sub0/status', 'closed\n')
        shutil.rmtree(root / 'data_persist', ignore_errors=True)

    def lines(name):
        p = side / name
        return p.read_text().splitlines() if p.exists() else []

    def last_text():
        return (results(stick)[-1] / 'results.txt').read_text()

    write(root, 'proc/uptime', '123.45 200.00\n')
    write(root, 'jci/version.ini', 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\nJCI_SW_VER_PATCH="A"\n')
    write(root, 'proc/asound/card0/pcm0p/sub0/status', 'closed\n')
    write(root, 'proc/asound/card4/pcm1p/sub3/status', 'state: RUNNING\nowner_pid   : 777\n')
    write(root, 'proc/4242/cmdline', '/usr/bin/opera\0-x\0')
    write(root, 'proc/777/cmdline', '/jci/bin/audio_mgr\0')
    write(root, 'usr/bin/dbus-send', DBUS, exe=True)
    write(root, 'usr/bin/dbus-monitor', MONITOR, exe=True)
    write(root, 'bin/busybox', BUSYBOX, exe=True)
    write(root, 'usr/bin/nc', NC, exe=True)
    kit.build(stick)
    before = outside(root, stick)

    # The clock of the fake root does not move: let the window follow the real time through a ticking uptime.
    TICK = r'''#!/bin/sh
while [ ! -f "$MO_ROOT/../tick.stop" ]; do
    awk -v t="$(date +%s)" 'BEGIN { printf "%d.00 1.00\n", t }' > "$MO_ROOT/proc/uptime.new" && mv -f "$MO_ROOT/proc/uptime.new" "$MO_ROOT/proc/uptime"
    sleep 0.2
done
'''
    write(side, 'tick.sh', TICK, exe=True)
    ticker = subprocess.Popen([str(SH), (side / 'tick.sh').as_posix()], stdin=subprocess.DEVNULL,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                              env=dict(os.environ, MO_ROOT=root.as_posix(),
                                       PATH='C:/Program Files/Git/usr/bin;C:/Program Files/Git/bin;' + os.environ['PATH']))
    try:
        fresh()
        result = run(root, '0 0', MO_PATHS_WINDOW='4')
        check(result.returncode == 0, 'run exits successfully: ' + result.stderr[-300:])
        out = results(stick)[-1]
        text = (out / 'results.txt').read_text()
        check('nc listen on 127.0.0.1:37373: WORKS' in text and 'applets: ash awk nc sed' in text
              and 'found: ' in text and 'BusyBox v1.19.4' in text, 'local network: applets listed, nc listener tested: ' + text.split('--- window')[0][-600:])
        check('card4/pcm1p/sub3 RUNNING 777' in text, 'playback devices recorded at the start')
        check(': card0/pcm0p/sub0 RUNNING opera (pid 4242)' in text and ': card0/pcm0p/sub0 closed - (pid -)' in text,
              'a playback device opening and closing during the window is recorded with its program')
        check('1 com.jci.gui.ctx.ContextChanged' not in text and '2 com.jci.gui.ctx.ContextChanged' in text
              and '1 com.jci.bt.msg.Incoming' in text, 'HMI signals counted per interface and member')
        check('ContextChanged: _miatoffApp' in text and 'ContextChanged: MiatoffMeters' in text
              and 'Alice' not in text and 'ContextChanged: system' not in text,
              'only app, context and Meters strings kept; messages dropped')
        check("type='signal'" in ' '.join(lines('monitor.args')) and 'dbus_hmi_socket' in ' '.join(lines('monitor.args'))
              and lines('monitor.log') == ['STOPPED'], 'the HMI bus is monitored for signals and the monitor stopped')
        check('/data_persist/opera/localstorage/x.dat' in text and 'miatoff-paths' not in text.split('--- 4.')[1],
              'files written during the window listed by name')
        check('steps: DID ALL' in text and 'source_at_start: string "FM" string "NONE"' in text and not lines('forbidden.log'),
              'steps and source recorded; no other D-Bus call')
        check(not (root / 'tmp/miatoff-paths').exists() and not (root / 'tmp/guard').exists()
              and outside(root, stick) == before, 'the RAM capture and the guard are removed; nothing else changed')

        fresh()
        check(run(root, '0 1', MO_PATHS_WINDOW='2', MO_FAKE_NC='1').returncode == 0
              and 'nc listen on 127.0.0.1:37373: FAILED: nc: bind: Address already in use' in last_text()
              and 'steps: NOT ALL' in last_text(), 'a listener that cannot start is reported')

        (root / 'usr/bin/nc').unlink()
        (root / 'bin/busybox').unlink()
        (root / 'usr/bin/dbus-monitor').unlink()
        fresh()
        check(run(root, '0', MO_PATHS_WINDOW='2').returncode == 0, 'run without nc, busybox and dbus-monitor exits')
        text = last_text()
        check('nc listen: no nc' in text and '(no HMI signals captured; dbus-monitor missing)' in text
              and 'steps: NO ANSWER' in text, 'missing tools are reported')

        count = len(results(stick))
        check(run(root, '1').returncode == 0 and len(results(stick)) == count, 'CANCEL records nothing')
        write(root, 'jci/version.ini', 'JCI_SW_VER="MAZ_CMU-150_74.00.331"\nJCI_SW_VER_PATCH="A"\n')
        check(run(root, '0').returncode != 0 and len(results(stick)) == count, 'unsupported firmware refused')
        check(not (root / 'tmp/guard').exists(), 'guard removed after every run')
    finally:
        (side / 'tick.stop').write_text('stop')
        try:
            ticker.wait(timeout=10)
        except subprocess.TimeoutExpired:
            ticker.kill()

check(b'\r' not in script, 'shell payload uses LF')
subprocess.run([str(SH), '-n', str(HERE / 'audio-paths.sh')], check=True)
with wave.open(io.BytesIO(probe_wav())) as w:
    check((w.getframerate(), w.getnchannels(), w.getsampwidth()) == (48000, 2, 2) and 0.7 < w.getnframes() / 48000 < 1.0,
          'probe.wav: 48 kHz stereo 16-bit, under a second')
check(len(kit.launcher_name().encode()) <= 255, 'launcher fits FAT32 filename limit')
package = HERE / f'MiatOff-audio-paths-{VERSION}.zip'
with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, data in kit.payload().items():
        archive.writestr(name, data)
with zipfile.ZipFile(package) as archive:
    check({n: archive.read(n) for n in archive.namelist()} == kit.payload(), 'ZIP payload verifies byte-for-byte')
print('PACKAGE', package)
print('SHA256', hashlib.sha256(package.read_bytes()).hexdigest())

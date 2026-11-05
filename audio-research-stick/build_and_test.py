"""Build an isolated research kit and test only against fabricated CMU data."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile

HERE = Path(__file__).resolve().parent
REPO = Path(sys.argv[1]).resolve()
DOCKER = sys.argv[2] if len(sys.argv) > 2 else ''
sys.path.insert(0, str(REPO / 'tools'))
import stickkit

SH = Path('C:/Program Files/Git/bin/sh.exe')
if not SH.is_file():
    SH = shutil.which('sh')
if not SH:
    raise SystemExit('POSIX sh is required')
script = (HERE / 'audio-capture.sh').read_bytes().replace(b'\r\n', b'\n')
notice = (
    'MiatOff audio research 0.2.1\n'
    'SPDX-License-Identifier: GPL-3.0-or-later\n'
    'The unchanged launcher payload is from TouchTune 1.2.1 by Miatafy.\n'
    'Launcher generation and USB dispatch reuse MiatOff tools/stickkit.py.\n'
    'See the complete MiatOff NOTICE and LICENSE included in this package.\n'
).encode()
kit = stickkit.Kit('MO-AUDIO.ID', b'miatoff-audio-research-0.2.1\n',
                  'audio-capture.sh', script, extra={
                      'README.txt': (HERE / 'README.txt').read_bytes(),
                      'NOTICE.txt': notice,
                      'NOTICE': (REPO / 'NOTICE').read_bytes(),
                      'LICENSE': (REPO / 'LICENSE').read_bytes(),
                  })

def write(root, path, data):
    p = root / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data.encode() if isinstance(data, str) else data)
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

def run(root, **extra):
    if DOCKER:
        env = dict(MO_ROOT='/w/root', MO_TEST='1', MO_AUDIO_SECONDS='2', MO_AUDIO_INTERVAL='1', MO_AUDIO_PRE='/w/root/tmp/pre', MO_AUDIO_DMESG='/w/root/bin/dmesg', MO_AUDIO_LOGREAD='/w/root/bin/logread',
                   MO_AUDIO_GUARD='/w/root/tmp/guard', HOME='/root', **extra)
        return subprocess.run(
            ['docker', 'run', '--rm', '--network', 'none', '--pull', 'never',
             '-v', str(root.parent) + ':/w',
             *[arg for k, v in env.items() for arg in ['-e', k + '=' + v]],
             DOCKER, 'sh', '-c', kit.launcher_name()[2:-4]],
            capture_output=True, text=True, timeout=60)
    env = dict(os.environ, MO_ROOT=root.as_posix(), MO_TEST='1',
               MO_AUDIO_SECONDS='2', MO_AUDIO_INTERVAL='1', MO_AUDIO_PRE=(root / 'tmp/pre').as_posix(), MO_AUDIO_DMESG=(root / 'bin/dmesg').as_posix(), MO_AUDIO_LOGREAD=(root / 'bin/logread').as_posix(), MO_AUDIO_GUARD=(root / 'tmp/guard').as_posix(),
               HOME='/root', **extra)
    env['PATH'] = 'C:/Program Files/Git/usr/bin;C:/Program Files/Git/bin;' + env['PATH']
    return subprocess.run([str(SH), '-c', kit.launcher_name()[2:-4]],
                          env=env, capture_output=True, text=True, timeout=60)

with tempfile.TemporaryDirectory(prefix='audio-test-', dir=HERE) as temp:
    root = Path(temp) / 'root'
    stick = root / 'tmp/mnt/sda1'
    stick.mkdir(parents=True)
    write(root, 'proc/uptime', '123.45 200.00\n')
    write(root, 'jci/version.ini', 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\nJCI_SW_VER_PATCH="A"\n')
    write(root, 'usr/bin/lastModeSvc.lua', '-- synthetic last-mode service\n')
    write(root, 'usr/bin/audioMgr.lua', '-- synthetic audio manager\n')
    write(root, 'jci/am/ControlConfig.json', '{}\n')
    write(root, 'usr/bin/unrelated.lua', '-- MUST NOT COPY\n')
    write(root, 'jci/am/SourceMatrix.lua', 'x' * 262145)
    write(root, 'tmp/mnt/data/pairing.db', 'PRIVATE MUST NOT COPY')
    write(root, 'etc/shadow', 'PRIVATE MUST NOT COPY')
    write(root, 'usr/bin/dbus-send', '''#!/bin/sh
for arg; do last="$arg"; done
case "$last" in
com.jci.vbs.am.GetLastMode|com.jci.vbs.am.GetActiveSource|com.jci.vbs.am.GetEntertainmentMuteStatus)
    echo "query=$last"; echo 'method return'; echo 'string "BTAudio"' ;;
*) echo 'FORBIDDEN METHOD'; exit 99 ;;
esac
''')
    # The car's dbus-monitor rejects "--address=ADDR": it needs two words.
    write(root, 'usr/bin/dbus-monitor', '''#!/bin/sh
[ "$1" = "--address" ] && [ -n "$2" ] || { echo "Usage: /usr/bin/dbus-monitor [--system | --session | --address ADDRESS] [--monitor | --profile ] [watch expressions]"; exit 1; }
printf '%s\n' "$@"
echo "signal time=123.45 interface=com.jci.vbs.am; member=LastModeStatus"
echo 'string "BTAudio"'
exec sleep 30
''')
    # A process table: the lastModeSvc that names its file with -f, and another lua process with its own -f.
    (root / 'proc/321').mkdir(parents=True)
    (root / 'proc/321/cmdline').write_bytes(b'lua\0/usr/bin/lastModeSvc.lua\0-f\0/data_persist/lastmode.json\0')
    write(root, 'proc/321/stat', '321 (lua) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 4242 1 1\n')
    (root / 'proc/322').mkdir(parents=True)
    (root / 'proc/322/cmdline').write_bytes(b'lua\0/usr/bin/audioMgr.lua\0-f\0/data_persist/NOT-THIS.json\0')
    write(root, 'proc/322/stat', '322 (lua) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 4300 1 1\n')
    write(root, 'data_persist/lastmode.json', '{"mode":"FM"}\n')
    write(root, 'data_persist/NOT-THIS.json', 'MUST NOT COPY')
    write(root, 'jci/sm/sm.conf', '<service name="lastModeSvc" x="1"/>\n<service name="jciGps" x="1"/>\n')
    write(root, 'tmp/xse-audio.log', 'audio focus FM gained\n')
    write(root, 'tmp/bt-audio-phone.log', 'PRIVATE MUST NOT COPY')
    write(root, 'tmp/unrelated.log', 'PRIVATE MUST NOT COPY')
    write(root, 'bin/dmesg', '#!/bin/sh\necho "snd: audio codec up"\necho "PRIVATE usb serial"\n')
    write(root, 'bin/logread', '#!/bin/sh\necho "lastmode: onModeChange FM"\necho "gps fix PRIVATE"\n')
    for name in ['bin/dmesg', 'bin/logread']:
        os.chmod(root / name, 0o755)
    for name in ['dbus-send', 'dbus-monitor']:
        os.chmod(root / 'usr/bin' / name, 0o755)
    kit.build(stick)
    before = digest(root, stick)
    result = run(root)
    check(result.returncode == 0, 'capture exits successfully: ' + result.stderr[-200:])
    output = next((stick / 'miatoff-audio').iterdir())
    check((output / 'files/usr/bin/lastModeSvc.lua').read_text() == '-- synthetic last-mode service\n', 'missing Lua is captured byte-for-byte')
    check(not (output / 'files/usr/bin/unrelated.lua').exists(), 'unrelated Lua is excluded')
    check(not (output / 'files/tmp').exists() and not (output / 'files/etc').exists(), 'pairing and password storage excluded')
    check('exceeds 256 KiB' in (output / 'missing.txt').read_text(), 'oversized source refused')
    check('/usr/bin/audioCtrl.lua' in (output / 'missing.txt').read_text(), 'missing sources reported')
    for label in ['start', 'end']:
        t = (output / (label + '.txt')).read_text()
        check(t.count('exit=0') == 3 and 'FORBIDDEN' not in t, 'only allowlisted getter calls at ' + label)
    signals = (output / 'service-signals.txt').read_text()
    check("member='LastModeStatus'" in signals and 'NameOwnerChanged' not in signals, 'monitor uses narrow audio filters')
    check(not signals.lstrip().startswith('Usage') and 'signal time=' in signals, 'monitor is called the way the car needs')
    check((output / 'samples.txt').read_text().count('query=GetLastMode') >= 1, 'periodic samples recorded')
    check('lastModeSvc' in (output / 'early/early-procs.txt').read_text() and 'start_ticks=4242' in (output / 'procs-start.txt').read_text(), 'audio processes and start times recorded')
    check('method return' in (output / 'early/early-audio.txt').read_text(), 'early snapshot taken before the dialog')
    check((output / 'lastmode-file').read_text() == '{"mode":"FM"}\n' and (output / 'early/lastmode-file').exists(), 'the last-mode file is copied')
    check((output / 'logs/tmp_xse-audio.log').exists() and not (output / 'logs/tmp_bt-audio-phone.log').exists() and not (output / 'logs/tmp_unrelated.log').exists(), 'only audio logs copied, no Bluetooth or unrelated ones')
    check('codec' in (output / 'logs/dmesg-audio.txt').read_text() and 'PRIVATE' not in (output / 'logs/dmesg-audio.txt').read_text() + (output / 'logs/logread-audio.txt').read_text(), 'dmesg and logread filtered to audio lines')
    check((output / 'early/logs/ls-_tmp.txt').exists(), 'logs also captured early')
    check(not any('PRIVATE MUST NOT COPY' in p.read_text(errors='ignore') for p in output.rglob('*') if p.is_file()), 'private fixtures never copied')
    check(not any(p.read_text(errors='ignore') == 'MUST NOT COPY' for p in output.rglob('*') if p.is_file()), 'other processes files are not copied')
    check('lastModeSvc' in (output / 'sm-audio-sm.conf.txt').read_text() and 'jciGps' not in (output / 'sm-audio-sm.conf.txt').read_text(), 'only audio lines of the SM config kept')
    check('Captured source files unchanged.' in (output / 'SUMMARY.txt').read_text(), 'source integrity confirmed')
    check(digest(root, stick) == before, 'no file outside USB changed; guard cleaned up')
    count = len(list((stick / 'miatoff-audio').iterdir()))
    check(not (root / 'tmp/pre').exists(), 'early snapshot folder removed')
    check(run(root, MO_AUDIO_CANCEL='1').returncode == 0 and len(list((stick / 'miatoff-audio').iterdir())) == count, 'cancel writes no capture')
    write(root, 'jci/version.ini', 'JCI_SW_VER="MAZ_CMU-150_74.00.331"\nJCI_SW_VER_PATCH="A"\n')
    check(run(root).returncode != 0 and len(list((stick / 'miatoff-audio').iterdir())) == count, 'unsupported firmware refused')
    write(root, 'jci/version.ini', 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\nJCI_SW_VER_PATCH="A"\n')
    (root / 'usr/bin/dbus-send').unlink()
    (root / 'usr/bin/dbus-monitor').unlink()
    check(run(root).returncode == 0, 'missing D-Bus tools are non-fatal')
    last = sorted((stick / 'miatoff-audio').iterdir())[-1]
    check('dbus-send unavailable' in (last / 'start.txt').read_text(), 'missing query tool reported')
    check(run(root).returncode == 0 and len(list((stick / 'miatoff-audio').iterdir())) == count + 2, 'repeated capture has a distinct folder')
    check(not (root / 'tmp/guard').exists(), 'guard removed after repeated captures')
    write(root, 'tmp/guard/pid', '999999999\n')
    check(run(root).returncode == 0 and not (root / 'tmp/guard').exists(), 'stale guard is reclaimed')
    before_ambiguous = len(list((stick / 'miatoff-audio').iterdir()))
    second = root / 'tmp/mnt/sdb1'
    second.mkdir()
    write(second, 'MO-AUDIO.ID', kit.id_bytes)
    check(run(root).returncode != 0 and len(list((stick / 'miatoff-audio').iterdir())) == before_ambiguous, 'two matching USB sticks are refused')
    shutil.rmtree(second)
    # A service that hangs must not hang the stick: bounded steps, progress.log shows how far it got.
    write(root, 'bin/logread', '#!/bin/sh\nsleep 60\n')
    os.chmod(root / 'bin/logread', 0o755)
    import time
    started = time.time()
    hung = run(root, MO_AUDIO_BOUND='1')
    check(hung.returncode == 0 and time.time() - started < 25, 'a hanging logread is cut off and the run still finishes')
    folder = sorted((stick / 'miatoff-audio').iterdir())[-1]
    check((folder / 'progress.log').read_text().strip().endswith('recording done'), 'progress.log shows the run reached the end')
    check('TIMEOUT' in (folder / 'logs/logread-audio.txt').read_text(), 'the timeout is recorded in the result')

check(b'\r' not in script, 'shell payload uses LF')
subprocess.run([str(SH), '-n', str(HERE / 'audio-capture.sh')], check=True)
check(len(kit.launcher_name().encode()) <= 255, 'launcher fits FAT32 filename limit')
package = HERE / 'MiatOff-audio-research-0.2.1.zip'
with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, data in kit.payload().items():
        archive.writestr(name, data)
with zipfile.ZipFile(package) as archive:
    check({n: archive.read(n) for n in archive.namelist()} == kit.payload(), 'ZIP payload verifies byte-for-byte')
print('PACKAGE', package)
print('SHA256', hashlib.sha256(package.read_bytes()).hexdigest())

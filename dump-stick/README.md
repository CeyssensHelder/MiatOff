# MiatOff dump stick (Phase 1: read-only)

A USB stick that **only reads** on your Mazda Connect (Gen-6, FW 74.00.324(A)) and writes everything to the stick.
Use it to answer the open questions in [docs/10](../docs/10-implementation-plan.md) without changing anything on the
unit.

## How it starts (same mechanism as TouchTune)
The Mazda update scanner sees `jci-autoupdate` and a `*.up` file. The **file name** of that `.up` is a
shell command that the scanner runs. That command looks in `/tmp/mnt/sd[a-d]1` for **exactly one** stick with
`MIATOFF.ID` (checked via `cksum`) and starts `dump.sh` there. The `.up` itself is TouchTune's launcher ZIP
(`main_instructions.ini` + `versions.ini`, byte-identical).

This approach is taken from [TouchTune](https://github.com/Miatafy/TouchTune) v1.2.1 by Miatafy, which was bench-tested on 74.00.324A.
In its tests, `build_stick.py` checks that the same template produces exactly TouchTune's launcher name.

## What `dump.sh` does and does not do
**Does:** read, and write to `miatoff-dumps/NNN-<mode>-up<uptime>s/` on the stick.

| Folder | Contents |
|---|---|
| `SUMMARY.txt` | Firmware, whether TouchTune recognises your `Common.js`, root ro/rw, NVRAM speed keys, SM configs + `jciAAPA` lines, AA files with md5/sha256, before/after check |
| `runtime/` | `processes.tsv` (**start time per process since boot** = free boot profile, CPU affinity, cmdline), `ld_preload.tsv`, `usb-devices.tsv` (retrofit hub?), the names of the NVRAM keys plus the values of the 2 speed keys, `/proc/*`, `ps`, `top`, `dmesg`, `df`, `ifconfig`, overviews of `/tmp/mnt/data` and `/data_persist` |
| `research/` | *(FULL only, since 1.2.0)* Research into a fast data source for gauges: copies of `libjcismdb.so`, `libjcivdm.so`, `smdb-read`/`smdb-write` and the VBS modules (`bin/`), `smdb-read -h`, `ipcs -a` and `/dev/shm` (`ipc.txt`), and per D-Bus bus the names, the interfaces of the vehicle services and **10 s of signals** (`dbus/`) |
| `vehicle-data/` | *(FULL only since 1.2.0; in 1.1.x also in SNAPSHOT)* Vehicle data for gauges ([docs/13](../docs/13-gauges.md)): `fields-<namespace>.txt` (all fields from `/jci/smdb/*.xml`), `sweep.tsv` (2 rounds over all ±740 fields via `smdb-read`, 5 s apart), `fast.tsv` (10 s as fast as possible: speed, rpm, throttle pedal, steering, longitudinal/lateral acceleration, yaw rate, brake pressure), `gps.txt` (3× `com.jci.lds.data.GetPosition`) |
| `static/files/` | *(FULL only)* `/jci/sm/*`, `/jci/scripts/*`, text files under `/jci` (JS/CSS/HTML/XML/ini/conf, ≤ 2 MB), `/etc` (≤ 512 KB), and *(since 1.4.0)* the reversing-camera safety text and parking-sensor PNGs under `/jci/nativegui/images` |
| `inventory/` | *(FULL only)* all paths, `ls -lnR`, md5 of all binaries/`.so`, `key-files.tsv` (since 1.4.0 also `List2Ctrl.js` and the tweak images), references to `sm_WCP.conf`, grep of the candidate services in the SM configs |

The vehicle data is only **read**: with Mazda's own `smdb-read` (which MZD_Speedometer also does continuously) and
one D-Bus query for the GPS position. The script **never** stops an `smdb-read` early: an aborted
`smdb-read` can hold the database lock, after which the unit restarts itself (see
[docs/13](../docs/13-gauges.md)). Listening in on D-Bus (`dbus-monitor`, FULL only) is stopped after 10 s;
that does not touch a database. Keep the **engine running** during the dump, otherwise rpm and
temperatures read zero. The probe takes 1–2 minutes extra.

**Does not:** remount root, write NVRAM, touch the watchdog or services, reboot. The only write outside the stick
is a guard folder in `/tmp` (RAM, disappears on reboot). `/etc/shadow` and private keys are never
copied.

**Extra precautions:**
- The script runs at the **lowest CPU priority** (`renice 19`), so the Mazda services always take precedence.
- It only remounts something if it really started from `/tmp/mnt/sdX1` (the USB).
- From NVRAM it only reads the names of the keys and the 2 keys that TouchTune also reads.
- A guard left behind by an aborted run (ignition off, then *resume*) is taken over, so the
  script does not silently keep refusing. At the end the script checks that `sm.conf`, `sm_WCP.conf`, `Common.js`, `version.ini`, the
  AAP XMLs, the root mount and the NVRAM keys are unchanged, and puts the result in `SUMMARY.txt`.

## Making the stick (Windows)
1. Take an **empty** stick of **≤ 32 GB**, formatted as **FAT32** with **MBR**. Do not use a stick that has TouchTune
   on it: the builder refuses that. Check MBR in PowerShell (`PartitionStyle` must be `MBR`):
   ```powershell
   Get-Disk | Select-Object Number, FriendlyName, Size, PartitionStyle
   ```
2. Build the stick (replace `E:\` with the stick's drive letter). The builder refuses anything except the root of a
   FAT32 volume, and also refuses the system drive:
   ```bash
   python dump-stick/build_stick.py E:\
   ```
   The script writes 5 files, reads them back and verifies them. Check again later with
   `python dump-stick/build_stick.py --check E:\`.
3. Eject the stick safely.

## In the car
1. **Engine on** (or at least ignition on, and don't let it switch off during the dump). Wait until the
   home screen is there.
2. Insert the stick into the hub's USB. A dialog appears:
   - **FULL**: status, vehicle data, research and files. Takes a few minutes. Preferably **while driving,
     with a passenger at the screen**, so the vehicle signals really change.
   - **MORE → CALIBRATE** *(since 1.3.0)*: record the vehicle signals for 5 minutes for the Meters scales
     (see [Calibration drive](#calibration-drive)). **MORE → CANCEL** does nothing.
   - **SNAPSHOT**: status only, fast. Take one **as soon as possible after a cold boot** and one **after ±5 min**.
     The start times per process always count from boot, so even a later snapshot shows the startup profile.
   - **CANCEL**: does nothing.
3. Wait for "MiatOff dump finished" and remove the stick.

The MiatOff dialog appears directly, just like with TouchTune. If you ever see a **Mazda screen for a
software update**, **never** confirm it: choose cancel and remove the stick.

Don't leave the stick in when starting the car. The launcher runs on every boot and then shows the
dialog each time. That is harmless, but irritating.

Nothing happens? Look at `miatoff-dump.log` in the root of the stick. If that file is missing, the script
did not start: check FAT32/MBR, whether the `.up` is still on the stick with its full name, and whether another
stick is plugged in.

## Calibration drive
For the gauge scales (G-forces, yaw rate, throttle pedal; see [docs/13](../docs/13-gauges.md)). The passenger
operates the screen.
1. Engine on, stationary **on level ground**. Insert the stick, **MORE → CALIBRATE**. The recording runs for 5 minutes.
2. **Stand still for ±15 s** (zero points).
3. Stationary in **neutral**: release the throttle, then **press fully 2×** (range of the pedal).
4. Drive: a few times **accelerate hard** and **brake hard** on a straight road, and a few **corners or a
   roundabout to the left and to the right** at a constant speed.
5. Wait for "MiatOff dump finished" and bring the stick along.

The stick gets `miatoff-dumps/NNN-calibrate-…/calibration/`: `signals.txt` (the D-Bus signals of
`com.jci.vbs.vdt`/`bcm`, each with a timestamp), `yaw.tsv` (yaw rate from smdb, one `smdb-read` at a time, never
aborted) and `meta.txt`. On the PC:
```bash
python collector/tools/calibrate.py <folder>/calibration
```
That gives the zero points, the pedal range, the scale of the wheel speeds, the gain (units per g, per degree/s)
with a reliability measure, and the order of the wheels (which pair is the front axle, and the left/right pairs).

## Afterwards
Copy `miatoff-dumps/` to `dumps/eu-74.00.324/` in this project (**do not publish**, see below) and tick off
the questions in docs/10 §10. Tip: sort `processes.tsv` on `start_s` for the startup order.

## Privacy & copyright
- The dump contains copyrighted Mazda/JCI files. Keep it local only.
- NVRAM keys and the overviews of `/tmp/mnt/data` and `/data_persist` can contain vehicle or personal data
  (e.g. names of paired phones). Wi-Fi/hotspot credentials, `passwd`, PPP secrets and private keys are skipped (listed in `static/skipped-private.txt`), but other files may still hold personal data. Do not share
  them without reviewing them first.

## Testing without a car
```bash
python dump-stick/tests/test_dump_stick.py
```
The test builds a fake CMU root with the stick at `tmp/mnt/sda1` and runs the launcher command the way the scanner
does. Then it checks the output, the refusal with two sticks or a foreign ID, cancelling, the guard, and
that nothing outside the stick changed. The cksum and the launcher ZIP are also checked against the known TouchTune
values.

### Under real BusyBox `ash` (Docker)
```bash
MO_DOCKER_IMAGE=busybox:1.25 python dump-stick/tests/test_dump_stick.py
```
```bash
MO_DOCKER_IMAGE=busybox:1.25 MO_DOCKER_DEGRADED=1 python dump-stick/tests/test_dump_stick.py
```
`MO_DOCKER_DEGRADED=1` imitates a stripped-down build: no `md5sum`/`sha256sum`/`stat`/`top`/`logread`, and a
`find` without `-xdev`. `MO_DOCKER_STRIP="applet ..."` removes extra applets.

**Result (21-10-2026):** all tests pass in Git Bash `sh`, BusyBox 1.25.1 (oldest official image), BusyBox
1.36, and BusyBox 1.25 in stripped-down form.
- Without hash tools the dump keeps working. `SUMMARY.txt` then reports `hash tools: md5=none sha256=none`.
- The before/after check uses `cksum`, which is always present because the launcher itself depends on it.

**What is not tested:**
- BusyBox **1.19** (the CMU version): no Docker image exists for it. The tests cover 1.25, plus the
  degraded variant for missing applets.
- **ARM**: not needed for a shell script, but it also says nothing about the exact applet set on the CMU.
- The **Mazda update scanner** itself: the launch mechanism was taken over from TouchTune and checked byte for byte,
  but not run in a car by me.

Every step is best-effort: a missing or deviating command ends up in `errors.txt` or in the corresponding
`.txt` file, and the dump simply continues. Read `errors.txt` after the first run in the car.

## Licence
GPL-3.0-or-later (see `LICENSE`). The launch mechanism and `launcher/*.ini` come from Miatafy's TouchTune
(GPL-3.0-or-later).

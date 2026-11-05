MiatOff audio research 0.2.1 -- read-only, experimental

Purpose
Collect the missing native audio/last-mode scripts and source/mute state.
This is research, not the Bluetooth-first feature. Nothing is installed.
Not tested in a real car or on the CMU's BusyBox 1.19.

Prepare
Extract the CONTENTS of MiatOff-audio-research-0.2.1.zip into the root of a
dedicated empty FAT32 USB stick (MBR, 32 GB or smaller). Keep the long .up
filename exactly as extracted. Do not combine with another tweak stick.
NOTICE.txt contains attribution for the unchanged TouchTune launcher.

Run while parked
1. Engine on, Mazda home screen visible, phone Bluetooth enabled.
2. Insert the stick. Choose CAPTURE (CANCEL writes no capture).
3. For the next minute, manually select Bluetooth, then FM, then Bluetooth.
   Leave about 15 seconds between selections. Note when each was selected
   and whether the phone actually connected/played. If no phone connects,
   leave it disconnected; that is useful evidence too.
4. Wait for the finished dialog before removing the stick. Do not switch
   off the car during capture. If a Mazda software-update screen appears,
   cancel it and remove the stick; never confirm that screen.

What is new in 0.2.1 (0.2.1 = nothing can hang any more: every step is time-bounded, progress.log is synced after each step)
The 0.1.0 run recorded no signals because dbus-monitor was started in a form the
car rejects; that is fixed. The state is now sampled every 10 seconds, and a
snapshot is taken as soon as the stick is read, before you answer the dialog
(early/). It also records which audio processes run and when they started, the
audio lines of the Service Manager config, audio-related log files and dmesg/logread lines (logs/; never Bluetooth, GPS or phone logs), and a copy of the one small file that
lastModeSvc saves its mode to (lastmode-file; its path is in lastmode-path.txt).
For a cold start: insert the stick BEFORE switching the ignition on, let the unit
boot, then choose CAPTURE and leave the source alone. early/ shows the state
right after boot; the rest shows what changes during the minute.

Results
miatoff-audio/NNN-up.../ contains the allowlisted source files, checksums,
start/end read-only query replies, filtered audio signals and SUMMARY.txt.
Missing files and D-Bus errors are retained; completion is not a claim that
all evidence was collected. The file checksums cover the captured scripts,
not all storage; normal source selection may update Mazda's own state.

This starts after you confirm. It cannot capture the beginning of boot,
shutdown, or prove that startup is silent. First we analyze the scripts to
identify the persistence mechanism; a later experiment can then be precise.

Privacy
Keep the entire results folder local. It contains copyrighted Mazda/JCI
scripts and local audio state. Do not upload or publish any of it.
The capture never copies pairing databases, GPS, contacts or NVRAM.
It does not run copied Lua, use setters, alter services/audio, remount root,
or reboot. Only the USB may be remounted writable; a PID guard uses /tmp.
The allowlisted getters can cause native status broadcasts; they do not
request a source change, mute, unmute or persisted-source update.

Recovery
There is nothing to uninstall. Remove the stick after completion; there is
no persistent MiatOff boot hook. An interrupted run leaves partial evidence.
A dead-process guard can be reclaimed on the next run.

Source and licence
audio-capture.sh is included: GPL-3.0-or-later.
Launcher generation reuses MiatOff tools/stickkit.py and TouchTune 1.2.1.

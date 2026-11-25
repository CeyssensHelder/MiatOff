MiatOff audio paths 0.7.0 -- page signal probe, read-only, experimental

Purpose
Earlier versions of this stick found how a sound file can be heard over the
FM radio without the radio dipping:
- a helper program on the unit borrows the Android Auto guidance turn (without
  reporting "playing");
- it plays the file on androidautoAltAudio;
- the beep then comes from one speaker, and the radio goes quiet on that
  speaker only, like the lane-assist warning.

The shift beep should sound only while the Meters page is open on a style with
the shift sound on. The page runs in the browser and cannot start a program or
write a file, so the helper needs another way to learn that. This stick looks
for one while you use Meters for 90 seconds:
1. Local network: which BusyBox tools exist, and whether the unit can listen on
   127.0.0.1. The page could then call the helper with a web request.
2. HMI messages: does opening Meters, or changing its style, show up on the
   HMI's own message bus?
3. The page's sound: the state of every audio output, about 5 times a second,
   with the program that uses it. Does the page's sound test show?
4. Files written meanwhile: does the browser store the page's settings at once?

It is read-only: nothing is played, installed or changed. Not tested in a real
car yet.

Prepare
Extract the CONTENTS of MiatOff-audio-paths-0.7.0.zip into the root of a
dedicated empty FAT32 USB stick (MBR, 32 GB or smaller). Keep the long .up
filename exactly as extracted. Do not combine with another tweak stick.

Run while parked
1. Engine on, parked. Any audio source.
2. Insert the stick and choose START (CANCEL records nothing). It first spends
   a few seconds on the network test.
3. Then you have 90 seconds. Close the dialog, and:
   - open Meters;
   - choose a style with the shift sound on, open the style menu and play its
     sound test twice;
   - choose a style without the sound;
   - go back to Home.
4. A dialog asks whether you did all of that. Then wait for "Done".

Results
miatoff-audio-paths/NNN-up.../results.txt:
- the tools and the network test;
- the HMI signals, counted by name, plus only those text values that name an
  app, a context or Meters (anything else, such as names or messages, is
  dropped before it reaches the stick);
- every change of an audio output during the window, with the program;
- the names (never the contents) of files written during the window;
- your answer.
No Mazda files and no messages, so it can be shared.

Source and licence
audio-paths.sh is included: GPL-3.0-or-later.
Launcher generation reuses MiatOff tools/stickkit.py and TouchTune 1.2.1.
probe.wav is included but not played by this version.

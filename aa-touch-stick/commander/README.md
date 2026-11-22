# Commander support in install prompts

The install stick carries `miatoff-commander`, a small ARM helper that reads the Mazda virtual keyboard during a
MiatOff choice prompt. It keeps Mazda's touch buttons and brackets the current knob selection. Turn to move and press
to select. Back dismisses the prompt. With the helper on, a prompt with no choice closes after two minutes, for touch
too, and the run ends with nothing done. To redraw the brackets the helper closes the dialog with SIGTERM, as the
installer's `killall` does, and uses SIGKILL only if it is still open after 200 ms. A normal install stick enables the helper only when the firmware flavor, stock
`jci-dialog` hash, and input device match a qualified profile. The profile table is empty pending a physical test on
74.00.324A.

The helper opens the input device read-only. It uses `REL_HWHEEL`, `KEY_ENTER`, and `KEY_BACKSPACE` and closes the
device when the prompt ends. The published descriptions of the [Mazda button mapping](https://silverchris.github.io/mazda-cmu-documentation/vip.html#input-events)
and [virtual keyboard device](https://github.com/jmgao/mazda-connector/blob/243afb7db886a0a13f7f752100e8289bc1ddfeb1/src/input_filter/input_filter.cpp)
identify the input path. The qualification below checks how the stock dialog and Mazda UI share it on v74.

## Build and test

Run `sh aa-touch-stick/commander/build-arm.sh` on x86-64 Linux with `curl`, `tar`, and `bzip2`. The recipe checks
Bootlin's ARMv7 musl toolchain archive against its pinned SHA-256. Update `COMMANDER_SHA256` in `stick/aa-touch.sh`
when the binary changes. `python aa-touch-stick/tests/test_commander.py` compiles and tests the same C source with
Linux host fixtures. The AA-touch simulator also exercises the installer dialog wrapper against synthetic results.

## Qualify a parked head unit

1. Run `python aa-touch-stick/commander/build_probe.py miatoff-commander-probe.zip`. Extract the ZIP to the root of
   a separate blank MiatOff-compatible FAT32 stick. The diagnostic shows three inert prompts and writes
   `miatoff-commander.log` to the stick. Every selection only records a result. The helper closes a prompt after two
   minutes, on Back, or when the stick is removed.
2. On a parked 74.00.324A unit, wait for Mazda Home and insert the probe. Verify clockwise and counterclockwise
   focus, both ends of the button row, touch on each button, and knob press on each bracketed button. Reinsert to
   repeat as needed. Check that Enter held through a transition cannot choose the next prompt and that Back never
   selects the middle button. On the three-choice screen press Enter before turning. The dialog must stay open.
   For a knob selection, check the log for `fresh Enter selected button` with the same index as the dialog result.
   Back must produce `Back dismissed the prompt` and exit 3. Exit 5 means the dialog failed or closed without a
   button; the installer then asks again by touch, so a broken dialog still reaches its emergency route. An exit
   from Mazda's dialog alone can also be a touch and cannot establish that the helper handled the knob. Turn quickly
   back and forth: each redraw must leave exactly one dialog on screen, with no old one behind or after it. Record the visible left-to-right order by tapping each button.
   If the mapping differs from the defaults, rebuild the inert ZIP with the measured values using
   `--polarity`, `--order-two`, and `--order-three`, then repeat these tests before trying an install stick.
3. Verify that rotation and press do not move or activate the Mazda UI behind the popup. Test Home and a screen
   transition that obscures the popup, then turn and press. A hidden popup must never accept a selection. Check that
   the popup dismisses on unplug and that Mazda's ordinary touch and controls work afterward. Repeat on a unit with
   the custom Home menu if that configuration is supported by the candidate profile.
4. If the probe passes, add the measured profile to `COMMANDER_PROFILES` in `stick/aa-touch.sh`. Each row contains the
   firmware flavor, `jci-dialog` SHA-256, logged `bus:vendor:product:version` ID, and sign for a clockwise detent
   (`+` or `-`), followed by the two- and three-button order from left to right. For example, `201` places exit code 2 first. Leave a profile
   out if the prompt can be obscured or if an input also reaches the underlying menu.
5. Build an install stick with the candidate profile. Cancel a real plan, confirm one planned action, and verify
   that the next prompt after restart requires a fresh choice. Check the manual and recovery prompts before release.

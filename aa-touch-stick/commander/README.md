# Commander support in install prompts

The install stick carries `miatoff-commander`, a small ARM helper that reads the Mazda Commander input during a
MiatOff choice prompt. It keeps Mazda's touch buttons and brackets the current knob selection. Turn to move and press
to select. Back dismisses the prompt. With the helper on, a prompt with no choice closes after two minutes, for touch
too, and the run ends with nothing done. To redraw the brackets the helper closes the dialog with SIGTERM, as the
installer's `killall` does, and uses SIGKILL only if it is still open after 200 ms. A normal install stick enables the helper only when the firmware flavor, stock
`jci-dialog` hash, and input device match a qualified profile. The table holds one profile, `cmu150_EU` on 74.00.324A,
measured with the probe runs below.

The helper reads the device named `Virtual Keyboard`: `KEY_M` and `KEY_N` move one step per press (value 1; an
autorepeat is not a detent), `KEY_ENTER` selects and `KEY_BACKSPACE` dismisses. It needs exactly one such device.
While a prompt is open it holds that device and Mazda's `filtered-keyboard-…` copy with `EVIOCGRAB`, so the knob
does not also move Mazda Home behind the popup. During a prompt no other key on those devices reaches Mazda either.
If a key is down when the prompt starts, the helper lets Mazda see its release first, for up to two seconds, and
otherwise steps aside for touch. It also steps aside when it cannot hold a device. The kernel lets go when the
helper's files close, so a crash or kill gives the keys back too. Touch is a separate device and is never held.

The third probe run on a stock 74.00.324A unit settled the device: each knob detent was a `KEY_N` or `KEY_M` press
on `Virtual Keyboard`, repeated on `filtered-keyboard`, and the tilts were the arrow keys. `Virtual Mouse` sent
nothing, and without a grab Mazda Home followed every turn. The
[Mazda button mapping](https://silverchris.github.io/mazda-cmu-documentation/vip.html#input-events) lists `KEY_M` as
clockwise, so `+` is the default sign. That run logged no `KEY_ENTER` or `KEY_BACKSPACE`.

The fourth probe run (same unit, helper `997befa1…`) held both keyboards on every prompt, and `filtered-keyboard`
logged no event while held. The knob press is `KEY_ENTER` and Back is `KEY_BACKSPACE`, both on `Virtual Keyboard`.
Each detent was one press and release with no autorepeat, and the brackets followed every detent in the direction
turned, with Mazda Home still behind the popup, so the candidate mapping is `+`, `01`, `012`. The edge cases in steps 2
and 3 below are still to be tried before a profile is added.

## Build and test

Run `sh aa-touch-stick/commander/build-arm.sh` on x86-64 Linux with `curl`, `tar`, and `bzip2`. The recipe checks
Bootlin's ARMv7 musl toolchain archive against its pinned SHA-256. Update `COMMANDER_SHA256` in `stick/aa-touch.sh`
when the binary changes. `python aa-touch-stick/tests/test_commander.py` compiles and tests the same C source with
Linux host fixtures. Where `/dev/uinput` is writable, for example in `docker run --privileged` (start the tests
under `sh -c`, because the helper refuses a parent with PID 1), it also runs the production build against real
evdev devices named and shaped like the six on the car. The AA-touch simulator also exercises the installer dialog
wrapper against synthetic results.

## Touch-free test sticks (a car with a broken screen)

A unit outside the measured profile (another firmware flavor or `jci-dialog`, as in
[issue #31](https://github.com/CeyssensHelder/MiatOff/issues/31): a Mazda 2 from the Philippines on 74.00.324A) keeps
every prompt on touch, so a car whose screen is broken cannot even start a check. To find out what such a car does,
build four sticks that need no tap at all (every dialog closes by itself, every prompt times out, nothing changes the
unit):

```bash
python aa-touch-stick/commander/build_touchfree_sticks.py dist/check-sticks
```

Each ZIP has a `README.txt` for the person in the car. Try them in this order, on a blank FAT32 stick each time:

| ZIP | What it tells us |
|---|---|
| `1-check-no-touch` | A SNAPSHOT with no prompt. `runtime/commander-facts.txt` has the three values a profile needs (firmware flavor, stock `jci-dialog` sha256, the `Virtual Keyboard` ID) and `input-devices.txt` lists every input device. |
| `2-knob-test` | The probe (below) with the EU mapping, in a form that never stops: three prompts of up to two minutes, each runs whatever the one before did, the end screen lists how each ended. The log has every input event. |
| `3-knob-test-reversed` | The same with the opposite rotary direction and button order, for when the brackets moved the wrong way. |
| `4-check-knob-forced` | The real check stick with the knob forced on with the EU mapping. A helper that cannot run gives a SNAPSHOT, never a prompt only touch can answer; Back or two minutes without an answer still cancels. |

`CHECK_ACTION` and `COMMANDER_FORCE` in `dump.sh` are the settings these variants rewrite
(`tools/kits.py hands_free_check_kit`); the normal check stick keeps them off. If the knob turns out to work, add a
profile row from the facts file to `COMMANDER_PROFILES` after the checks below.

## Qualify a parked head unit

1. Run `python aa-touch-stick/commander/build_probe.py miatoff-commander-probe.zip`. Extract the ZIP to the root of
   a separate blank MiatOff-compatible FAT32 stick. The diagnostic shows three inert prompts and writes
   `miatoff-commander.log` to the stick. Every selection only records a result. The helper closes a prompt after two
   minutes, on Back, or when the stick is removed. The log lists every input device with its role, and while a
   prompt is open it records each event from every device as `Commander: eventN type T code C value V` (at most
   4000 lines per prompt). It logs `eventN held` or `eventN could not be held` for each keyboard it holds. Without a
   `Virtual Keyboard`, or when a keyboard cannot be held, the probe still shows the prompts, so touch answers them
   and the event lines show where the knob goes. The prompts ask for one thing each: turn, tilt and press first,
   then Back, then a choice.
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
3. Verify that rotation and press do not move or activate the Mazda UI behind the popup. In the log, `filtered-keyboard`
   must show no events while the prompt holds it. Test Home and a screen
   transition that obscures the popup, then turn and press. A hidden popup must never accept a selection. Check that
   the popup dismisses on unplug and that Mazda's ordinary touch and controls work afterward. Repeat on a unit with
   the custom Home menu if that configuration is supported by the candidate profile.
4. If the probe passes, add the measured profile to `COMMANDER_PROFILES` in `stick/aa-touch.sh`. Each row contains the
   firmware flavor, `jci-dialog` SHA-256, the logged `bus:vendor:product:version` ID of the `Virtual Keyboard`
   (`0003:0000:0000:0000` on the stock unit), and sign for a clockwise detent
   (`+` or `-`), followed by the two- and three-button order from left to right. For example, `201` places exit code 2 first. Leave a profile
   out if the prompt can be obscured or if an input also reaches the underlying menu.
5. Build an install stick with the candidate profile. Cancel a real plan, confirm one planned action, and verify
   that the next prompt after restart requires a fresh choice. Check the manual and recovery prompts before release.

# Changelog

Each release on the [Releases page](https://github.com/CeyssensHelder/MiatOff/releases) takes its notes from the section
with its version below. Everything is for the **MX-5 ND1 and ND2** with Mazda Connect on firmware **74.00.324A** only;
the tools check the car first and change nothing they do not recognise. The Meters Designer's car setup also offers
other cars with the same head unit (from v1.0.2-rc.2 on), to fit the gauges to them. The installer was built and
tested on the MX-5; it never looks at the model, only at the firmware and the file hashes.

## Unreleased

Meters can now live next to other tools that use Opera's user scripts, such as Kansei Link. Write the install stick
again from this version; a car with Meters already on shows it as *incomplete*, and **REPAIR** moves it over.

### Changed

- **Meters userscripts in Opera's shared folder (install stick 1.8.0):** Meters 1.0 pointed `opera.ini` at its own
  folder `userjs-miatoff/`, and Opera reads only one folder, so every other tool's scripts (Kansei Link, MZD-AIO style
  apps) stopped loading. The userscripts are now `miatoff-*.js` in the stock `userjs/` folder, the stock `fps.js` is
  renamed to `fps.js.miatoff-off` while Meters is on, and `opera.ini` gets only the two flag lines (the same bytes
  Kansei Link writes). Other tools' files are never touched.
- **REMOVE next to another tool:** while another tool still has a script in `userjs/`, removing Meters leaves those two
  lines and `fps.js` off for it; when it is gone too, Meters shows *incomplete* and REMOVE gives stock.
- **Kansei Link's installer:** a MiatOff run while it is busy changes nothing. The state file names Kansei Link and
  its version when it is installed.
- **Launching Meters next to Kansei Link's loader:** while Meters is launched, its row is the focussed one and carries
  the Drive Record event, so that loader does not open Kansei Link instead.
- **Check your car:** user scripts already on from another tool count as *Available* for Meters, and the Meters 1.0
  layout as *Installed*.

### Tested

- In the simulator only (BusyBox): both install orders next to a stand-in for Kansei Link, the Meters 1.0 layout,
  power loss at every new step. **Not tested in a car**, with or without Kansei Link.

## v1.0.3

Bug fix: the Commander knob now also works on the *Check your car* stick, not only on the install stick. Nothing
changes in what the sticks do to the car. Write the check stick again from this version to get the fix.

### Fixed

- **Commander knob in the check prompts:** the knob did nothing on the check stick, so a car with a broken
  touchscreen could not start a check. The check stick (dump 1.5.0) now carries the same helper and profile as the
  install stick: turn the knob to move the brackets across **FULL**, **SNAPSHOT** and **MORE** and on the calibration
  prompt, press it to choose, or press **Back** to cancel with nothing dumped. Same rules as the install prompts: touch
  still works, and any unit that does not match the measured EU 74.00.324A profile stays touch-only. Tested in our ND1.

## v1.0.2

The install prompts in the car now work with the Commander knob, the Meters car setup offers more cars, and the app
no longer turns away other Mazdas with the same head unit. It also has every fix from v1.0.2-rc.1 and v1.0.2-rc.2.
Update Meters from the app (*Update*, then **REPAIR** in the car) to get the Meters changes.

### New

- **Commander knob in the install prompts** (EU 74.00.324A): turn the knob to move the brackets to a button, press it
  to choose, or press **Back** to cancel. This is for a car whose touchscreen is broken: the whole installer can now
  be used without touching the screen. Touch still works on every prompt. While a prompt is open, the knob does not
  also move the Mazda screen behind it. The knob is used only when the firmware, Mazda's dialog program and the knob's
  input device match the profile measured in our ND1; on any other unit the prompts stay touch-only, as before. With
  the knob on, a prompt left alone for two minutes closes and the run ends with nothing changed. Tested in our ND1:
  a parked test stick, then an install run driven with the knob.
- **More cars in the Meters car setup** (experimental): besides the MX-5, the car setup offers the Mazda2, Mazda3,
  Mazda6, CX-3, CX-5, CX-8 and CX-9 with the original Mazda Connect, and the **Fiat / Abarth 124 Spider**, which has
  the same head unit. Each preset fills in the rev warnings, gearing, tyre size, power and weight from the maker's own
  data; values without a public source are marked *assumed* in the summary. European presets for the Mazda2, Mazda6
  and CX-3. Not tried in any of these cars; whether a car can be updated is still decided by **Check your car**.
- **Version** choice in the car setup where one engine comes in several outputs (for example the Mazda2 1.5 with 75,
  90 or 115 PS, or Fiat versus Abarth).
- **Custom warning margin:** *Turn the gauges red* has a **Custom** option, from 0 to 2000 rpm before the limiter.

### Changed

- **Other Mazdas in the app and README:** *Will this work on my car?* and the support table no longer turn away the
  other cars with the original Mazda Connect on 74.00.324A (Mazda2, Mazda3, Mazda6, CX-3, CX-5, CX-8, CX-9, Fiat /
  Abarth 124 Spider). The installer itself is unchanged: it already acted on any car whose firmware and files it
  recognises, and refuses the rest. Not tried in any of these cars.
- The car setup window has a blueprint look, with drawings of each car traced from photos at true scale. The
  *Continental Europe* market is now called *Europe*.
- All presets were checked against the sources they cite; the two whose source is no longer public are now marked
  *assumed*.
- The built-in driving simulator of the Meters page (`?src=sim`, for previews on a PC) drives with the gearing and rev
  limits of the car setup instead of always those of the ND1 1.5.

### Fixed

- **POWER page in hp, kW or lb-ft:** the chart was still numbered in PS and Nm. It now has a power axis on the left and
  a torque axis on the right, each in the chosen unit, and the legend and factory figures are converted too. With PS
  and Nm the page looks as before.
- **Commander knob turns ignored in Meters after touching the screen:** after a tap or swipe, turning the knob did
  nothing until you left Meters and opened it again (tilting and pressing still worked). Turns now keep working after
  touch.
- **"has unexpected permissions" on a unit that had other tweaks:** stock files owned by root (`775 0 0`), which other
  tools leave behind when they copy files in as root, were reported as BLOCKED. The check and the installer now accept
  that owner when the content is the known stock file; the replacement we write has the normal owner again. Any other
  mode or owner still blocks.

### Tested in a car

On our 2017 EU ND1: the Commander knob in the install prompts (a parked test stick, then an install run with the knob)
and Commander turns in Meters after touch. Not yet confirmed on the ND2 where the Meters knob problem was reported.
Not tried in a car: the POWER page in other units, the permissions fix, and the car setup for cars other than the
MX-5.

## v1.0.2-rc.2

Pre-release for testing more cars in the car setup, the Commander fix and the POWER page in other units. It also has
the permissions fix from v1.0.2-rc.1. Only the Commander fix has been tried in a car (our ND1). Update Meters from the
app (*Update*, then **REPAIR** in the car) to get the Meters changes.

### New

- **More cars in the Meters car setup** (experimental): besides the MX-5, the car setup offers the Mazda2, Mazda3,
  Mazda6, CX-3, CX-5, CX-8 and CX-9 with the original Mazda Connect, and the **Fiat / Abarth 124 Spider**, which has
  the same head unit. Each preset fills in the rev warnings, gearing, tyre size, power and weight from the maker's own
  data; values without a public source are marked *assumed* in the summary. European presets for the Mazda2, Mazda6
  and CX-3. Not tried in any of these cars; whether a car can be updated is still decided by **Check your car**.
- **Version** choice in the car setup where one engine comes in several outputs (for example the Mazda2 1.5 with 75,
  90 or 115 PS, or Fiat versus Abarth).
- **Custom warning margin:** *Turn the gauges red* has a **Custom** option, from 0 to 2000 rpm before the limiter.

### Changed

- The car setup window has a blueprint look, with drawings of each car traced from photos at true scale. The
  *Continental Europe* market is now called *Europe*.
- All presets were checked against the sources they cite; the two whose source is no longer public are now marked
  *assumed*.
- The built-in driving simulator of the Meters page (`?src=sim`, for previews on a PC) drives with the gearing and rev
  limits of the car setup instead of always those of the ND1 1.5.

### Fixed

- **POWER page in hp, kW or lb-ft:** the chart was still numbered in PS and Nm. It now has a power axis on the left and
  a torque axis on the right, each in the chosen unit, and the legend and factory figures are converted too. With PS
  and Nm the page looks as before. Not tried in a car yet.
- **Commander knob turns ignored in Meters after touching the screen:** after a tap or swipe, turning the knob did
  nothing until you left Meters and opened it again (tilting and pressing still worked). Turns now keep working after
  touch. Tested in our ND1; not yet confirmed on the ND2 where it was reported.
- **"has unexpected permissions" on a unit that had other tweaks** (from v1.0.2-rc.1): stock files owned by root
  (`775 0 0`) are accepted when the content is the known stock file.

## v1.0.2-rc.1

Pre-release for testing one fix. Not tested in a car yet.

### Fixed

- **"has unexpected permissions" on a unit that had other tweaks:** stock files whose owner was root (`775 0 0`) instead
  of the usual `775 1000 1000`, which other tools leave behind when they copy files in as root, were reported as
  BLOCKED. The check and the installer now accept that owner when the content is the known stock file; the replacement
  we write has the normal owner again. Any other mode or owner still blocks.

## v1.0.1

Fixes for Meters and the app, and the shift sound. Update Meters from the app (*Update*, then **REPAIR** in the car)
to get the Meters changes.

### New

- **Shift sound** (experimental): a shift beeper on the Meters pages. Ticks speed up from the amber line, then a
  steady tone at the shift point, a quarter of a second early when the revs rise fast, until you shift. Switch it on
  per built-in style in the app (for example Track on, Street off) and per custom page in the designer. Silent below
  5 km/h and on the limiter. The Meters style list has a sound test to choose between the sound files and the head
  unit's own beep; the Commander knob reaches it after the last style.
- **Verify USB** in the app: after preparing a stick, eject it, plug it in again and press **Verify USB**. It reads
  every file and your plan back from the stick itself and changes nothing on it.

### Fixed

- **Meters trailing the car by a few seconds:** the collector no longer starts a process for each update.
- Meters keeps updating when one read of the live data never finishes: it is dropped after two seconds and tried again.
- Stopping the Meters collector (before a Meters update or removal) now also ends its helper processes.
- The collector's log no longer grows when the car's data source keeps restarting.
- After a step of a plan with more steps to go, the car now says to leave the USB in instead of to remove it.
- The designer no longer fails to load when the app runs from a folder reached through a link (seen as a risk on macOS).

### Not tested by us

- Everything in this release is tested on the PC only, not in a car: the Meters lag fix, the shift sound (whether the
  head unit plays the sound file or only its own beep, and how loud either is over music) and the other fixes.
- The macOS and Linux downloads.

## v1.0.0

The first release of the MiatOff app for Windows, macOS and Linux: build a USB stick on your PC, plug it into the car
and choose per tweak to install, remove or leave it.

### What you can do

- **Check my car:** a read-only dump of the unit, and a checker that says what the tools recognise.
- **Touch while driving** (TouchTune) and **touch in Android Auto** (the oem-aa-mod shim).
- **Boot trim:** stop DVD/TV, SiriusXM, Pandora, Stitcher and Aha from starting, each on its own, and hide them in the
  Entertainment menu.
- **Startup warning** skipped, **shorter list delay**, blank **camera safety text**, semi-transparent **parking sensor
  graphics**.
- **Meters** under *Applications*: Street, Track, Cyberpunk, 2077 and 2077 NIGHT, fed by the car's own data (no OBD
  adapter). The app starts in the style menu with the last style highlighted.
- **Meters Designer** on the PC: up to eight of your own pages in the car under *Meters → CUSTOM*.
- **Car setup** in the designer: pick your MX-5 (ND1/ND2, 1.5/2.0, manual/automatic, region, tyre) and your units. The
  Meters then warn before the limiter (by a margin you choose), work out the gear from your car's gearing and show
  mph, °F, miles, mpg, hp or lb-ft, on the built-in styles and on your own pages.
- **Home menu:** your own Home screen with up to twelve shortcuts, or one of five built-in menus. Installed with
  Meters; Mazda's own Home files stay unchanged.

Every change is hash-guarded, backed up and can be removed again; see the README's
[Is it safe?](https://github.com/CeyssensHelder/MiatOff/blob/master/README.md#is-it-safe).

### Tested in a car

On our 2017 EU ND1: the dump, touch in Android Auto, boot trim, the startup warning, the shorter list delay, Meters, three custom Meters
pages and the Home menu. A contributor ran the check, the install and the wireless CarPlay edits on an EU ND2 (RF, 2.0,
2022), and tested the camera safety text and the parking sensor graphics (our car has no reversing camera).

### Not tested by us

- The car setup in a car: other engines, gearboxes and imperial units are tested on the PC only.
- The macOS and Linux downloads.

### Good to know

- The downloads are not signed yet, so Windows and macOS warn the first time you open them; see
  [Opening the app](https://github.com/CeyssensHelder/MiatOff/blob/master/README.md#opening-the-app). `SHA256SUMS.txt` lists the checksum of each download.
- Stay on firmware 74.00.324A. Not for the ND3 (2024 and later) or any other firmware.
- Installed a Home menu with an early build (before the *Custom menu* choice)? Updating Meters with Custom menu on
  *Leave as-is* may put Mazda's Home back. Set Custom menu to *Install* once with that Meters update to keep your menu.
- Open items are in the [TODO](https://github.com/CeyssensHelder/MiatOff/blob/master/TODO.md).

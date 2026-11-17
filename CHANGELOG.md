# Changelog

Each release on the [Releases page](https://github.com/CeyssensHelder/MiatOff/releases) takes its notes from the section
with its version below. Everything is for the **MX-5 ND1 and ND2** with Mazda Connect on firmware **74.00.324A** only;
the tools check the car first and change nothing they do not recognise.

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

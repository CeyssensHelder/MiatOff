# Changelog

Each release on the [Releases page](https://github.com/CeyssensHelder/MiatOff/releases) takes its notes from the section
with its version below. Everything is for the **MX-5 ND1 and ND2** with Mazda Connect on firmware **74.00.324A** only;
the tools check the car first and change nothing they do not recognise.

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
- Open items are in the [TODO](https://github.com/CeyssensHelder/MiatOff/blob/master/TODO.md).

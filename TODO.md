# TODO

Features and fixes still to build. What is built and how far it is tested is in the README's
[support status](README.md#support-status). Every change to the unit stays surgical and hash-guarded (see
[AGENTS.md](AGENTS.md)).

## Features

- [ ] **Start on Bluetooth instead of FM.** A tweak (Install/Remove, stock backup) so the unit plays Bluetooth audio at
  power-on instead of falling back to FM (user request, ND2). First step: run the
  [audio research stick](audio-research-stick/README.txt) in the car and find where v74 picks the start source;
  background in [docs/14](docs/14-bluetooth-startup.md).
- [ ] **Shift sound.** A short tone on the Meters pages at the shift RPM, with an on/off switch next to the designer's
  shift lights, shared by custom pages and the built-in styles, silent when stationary. The sound files ship in the
  Meters payload (hash-guarded).
- [ ] **Day mode in the car app.** The designer already has one; the car draws the night styling only.
- [ ] **Car setup presets:** the JP-only 1.5 automatic and the 2024 update
  ([docs/18](docs/18-vehicle-presets.md)).
- [ ] **One designer layout.** Give the Home designer the Meters designer's editing detail levels, project dialog and
  phone sheets (Tools / Properties) instead of panels below the canvas on narrow windows.
- [ ] **One look for the app's design pages.** *Design your Meters* and *Design your menu* get the same cards, the same
  list with Preview and the same wording for choosing what goes on the stick.

## Fixes

- [ ] **Meters lag when stationary:** the gauges trail the car by up to about a second (custom and built-in pages)
  ([docs/15](docs/15-meters-designer.md#known-issues)).
- [ ] **RPM jump:** one unexplained jump from about 1,900 to 3,000 rpm seen on our car.
- [ ] **Consumption scale:** calibrate `Drv1AvlFuelE` against the car's own average consumption figure.
- [ ] **Power page with imperial units:** power and torque share one axis that is labelled PS/Nm; give each its own
  axis in the chosen units (the live numbers already convert).
- [ ] **Simulator gearing:** `meters/js/data.js` (`?src=sim`) drives with the ND1 1.5 manual gearing, so previews of
  another car show the wrong gear; take the gearing from the car profile.

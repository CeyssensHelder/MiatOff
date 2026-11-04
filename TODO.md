# TODO

Ideas and open items, mostly from user feedback after the first release. Nothing here is built yet. Every change to the
unit stays surgical and hash-guarded (see [AGENTS.md](AGENTS.md)).

## Start on Bluetooth instead of FM radio

User report: "Is there a way to change the default audio source when you start the car? My ND2 is always switching back
to FM radio whenever I start the car and it drives me crazy because I always have to manually switch it back to
Bluetooth. Heck I'd even be down to disable FM entirely if that fixed it."

- [ ] Find out where the unit decides the audio source at start (last-source restore in the HMI/MMUI, the audio manager
  settings, or a persisted value) on 74.00.324A. Use the read-only dump; do not publish dump contents.
- [ ] Check whether Bluetooth can be started before, or instead of, FM at boot. Options to compare: change the stored
  last source, change the start-up order, or hide FM (see [docs/04](docs/04-boot-speedup.md), [docs/05](docs/05-ui-tweaks.md)).
- [ ] Check what the unit does when no phone is connected yet at start-up (fall back to FM, or stay silent?).
- [ ] If it is feasible, design it as one more tweak with Install/Remove and a stock backup.

## Meters: more configuration

User report: "Is there anyway to make an option for the meters to feature imperial units like miles per hour and
farenheit for us Americans?"

- [ ] **Settings file for Meters** (for example `meters-config`), read by the pages. Variables: speed unit (km/h, mph),
  temperature (°C, °F), distance and fuel (km / mi, L/100 km / mpg), car spec (regional rev limits, mass, gearing).
- [ ] Today the units are hard-coded in `meters/js/app.js`, `cyber.js`, `y2077.js` and `gauges.js`. Convert once in a
  single place (`meters/js/data.js` or a small `units.js`) and take unit labels from there. The raw data does not change.
- [ ] Choose in the builder (`miatoff_gui.py`) which Meters themes to install (street, track, cyber, 2077) and set the
  variables above. The plan/stick must only copy the chosen themes and write the config. Needs an `aa-touch.sh`
  change, with new pinned hashes and tests.
- [ ] Also allow changing the settings later without a full reinstall (a settings page in Meters, if storage on the unit
  allows it).
- [ ] Update the pages' tests, README texts and the simulator for imperial output.

## Meters: customizable themes and an editor

- [ ] Research: how are the themes built today (canvas code per theme, `meters/js/*`) and what part could become data
  (colours, fonts, layout, which gauges on a page, thresholds)?
- [ ] Define a theme file format (JSON) with a schema and validation. Pages stay plain ES5, no build step, light for the
  i.MX6.
- [ ] A theme editor on the PC (a tab in `miatoff_gui.py`, or a static HTML page) with a live preview using the
  simulator and an export that goes onto the stick.
- [ ] Decide what stays fixed for safety and readability (minimum font sizes, rev-limit warnings, no more than about six
  things per page).
- [ ] Decide how user themes are installed and removed through the stick (own folder, hash of the user's files, plan entry).

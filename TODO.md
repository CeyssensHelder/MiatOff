# TODO

Ideas and open items, mostly from user feedback after the first release. Nothing here is built yet. Every change to the
unit stays surgical and hash-guarded (see [AGENTS.md](AGENTS.md)).

## Start on Bluetooth instead of FM radio

User report: "Is there a way to change the default audio source when you start the car? My ND2 is always switching back
to FM radio whenever I start the car and it drives me crazy because I always have to manually switch it back to
Bluetooth. Heck I'd even be down to disable FM entirely if that fixed it."

- [x] Initial public-source feasibility review: Mazda documents FM fallback after slow Bluetooth reconnection on
  older firmware; MZD-AIO exposes a Bluetooth-selection request. Neither strict Bluetooth-first nor safe FM
  disablement is verified on v74. See [research and evidence](docs/14-bluetooth-startup.md).
- [ ] Find out where the unit decides the audio source at start (last-source restore in the HMI/MMUI, the audio manager
  settings, or a persisted value) on 74.00.324A. Use permitted public sources or explicitly permitted on-unit
  investigation; AGENTS.md prohibits reading `dumps/` and `miatoff-dumps/`.
- [ ] Verify `SelectBTAudio`, the Bluetooth-audio-ready notification and a startup hook outside `Common.js` on v74.
  Investigate silent waiting / suppressing automatic FM fallback; a delayed Bluetooth switch alone may still play FM first.
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

## Entertainment menu: hide the sources of trimmed services

Built (not tested in a car): one builder item, "Hide trimmed items in the menu", under Interface (plan key `menu`), hides the Entertainment
sources of every boot-trim group that is on, all in one switch. While it is on, later trim steps keep the menu in
step. See [aa-touch-stick/README.md](aa-touch-stick/README.md#boot-trim-menu-extra--trim).

How it works (74.00.324A, `/jci/gui/apps/system/js/systemApp.js`):

- `_initEntertainmentDataList` holds a master list with an `appData.isVisible` flag per source; the native MMUI
  overwrites it with `StatusMenuVisible` messages, so the default alone would not hold. `_buildEntertainmentDataList`
  is the one place that filters on it, so its filter line also drops the names of the trimmed groups: DVD/TV
  (`dvd`, `tv`), SiriusXM (`satradio`, `xmaudio`), Pandora, Stitcher, Aha (`aharadio`).
- Same file as the startup-warning tweak, so `SYS_TABLE` pins all 66 combinations.

- [ ] Check on the car: with Stitcher trimmed and the item on, the Stitcher entry is gone and nothing else in the
  Entertainment list changed; after turning the item off it is back.
- [ ] Check what the unit does when its last-used source was a hidden one (last-source restore).
- [ ] SiriusXM and DVD/TV entries are hidden by default on most cars; confirm the names (`satradio`, `xmaudio`, `dvd`,
  `tv`) are the ones the MMUI uses on an NA unit.
- [ ] An on-car dialog entry for the item (the builder plan is the only way to set it today).

## Later phases

### Meters: shift sounds

- [ ] Play a sound on the Meters pages when it is time to shift (rev-based shift point, ideally with a configurable
  RPM threshold per gear or a single shift light RPM).
- [ ] Research: can a Meters page (Chromium/WebKit on the CMU) play audio at all, and through which output? Check the
  autoplay rules, latency, whether it mixes with or interrupts the current audio source, and the volume control.
- [ ] Decide the sound design: a short beep or chime, kept subtle and not annoying; an option to turn it off; no sound
  while the car is stationary or the engine is warming up.
- [ ] Reuse the Meters settings file (see "Meters: more configuration") for the on/off switch and the shift RPM.
- [ ] Add it to the simulator and the Meters tests. Ship the sound files with the Meters pages (hash-guarded).

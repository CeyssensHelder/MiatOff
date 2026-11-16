# TODO

Features and fixes still to build. What is built is in the [README](README.md); what was tested for each release is
in [CHANGELOG.md](CHANGELOG.md). Every change to the unit stays surgical and hash-guarded (see
[AGENTS.md](AGENTS.md)).

## Features

- [ ] **Start on Bluetooth instead of FM.** A tweak (Install/Remove, stock backup) so the unit plays Bluetooth audio at
  power-on instead of falling back to FM (user request, ND2). First step: run the
  [audio research stick](audio-research-stick/README.txt) in the car and find where v74 picks the start source;
  background in [docs/14](docs/14-bluetooth-startup.md).
- [ ] **Media controls in Meters.** Control the audio from the Meters pages without leaving them: what is playing, and
  play/pause and previous/next.
- [ ] **Day mode in the car app.** The designer already has one; the car draws the night styling only.
- [ ] **Car setup presets:** the JP-only 1.5 automatic and the 2024 update
  ([docs/18](docs/18-vehicle-presets.md)).
- [ ] **Other Mazda cars.** Let the car setup offer other Mazdas with a compatible Mazda Connect unit, not only the
  MX-5: sourced presets per model, and a vehicle profile that allows their models and engines (today the validators
  accept only ND1/ND2 with a 1.5 or 2.0).
- [ ] **One designer layout.** Give the Home designer the Meters designer's editing detail levels, project dialog and
  phone sheets (Tools / Properties) instead of panels below the canvas on narrow windows.
- [ ] **One look for the app's design pages.** *Design your Meters* and *Design your menu* get the same cards, the same
  list with Preview and the same wording for choosing what goes on the stick.
- [ ] **Stick doctor in the app.** Read `miatoff-aa-touch.log` and the state file from a returned stick and explain
  the result in plain words, as the check results already do.
- [ ] **Automatic laps.** The lap timer is tap-only; GPS in the collector is the missing piece.
- [ ] **Session log.** Save the maxima and lap times to the stick, or a CSV of the live data, to look at on the PC
  afterwards.
- [ ] **Peak hold and warning thresholds on custom pages**, for example coolant above 105 °C, as the Track page
  already does.
- [ ] **TPMS data.** Investigate whether the tyre pressures can be read and shown in Meters. Does the unit see them on
  the CAN bus or the MOST side, or does the car keep them to itself?
- [ ] **RX-7 shift buzzer.** Add the classic RX-7 shift warning as one more shift-sound option, next to the existing
  tick and shift tones ([docs/13](docs/13-gauges.md#sound-on-the-unit)).
- [ ] **Fun car noises.** Investigate offering other sounds besides the shift tones: a Ferrari-style engine note, a UFO,
  and so on. First find out what the unit can play and how it mixes with music (same open question as the shift
  sound in the car, below).
- [ ] **More audio formats (FLAC and others).** Investigate replacing or extending the unit's GStreamer libraries,
  which are very old, so it can play more music formats such as FLAC. A community effort for a much older firmware
  exists but was abandoned years ago. Updating GStreamer outright is likely a big job; first see what the firmware
  ships and whether single plugins can be added safely. Related ideas from a user: SBC XQ Bluetooth audio, and
  distributing MiatOff as a firmware update package.
  Hash-guarded and rollback-safe like everything else ([AGENTS.md](AGENTS.md)).

## Documentation

- [ ] **Preview pictures of the premade Meters pages and Home menus.** The repo has app-window screenshots
  (`docs/images`) and design mockups for two themes (`meters/design`), but no preview of each ready-made meter set and
  menu. Render them from the Designer (or the dev preview) and show them in the README, so people can choose before
  building a stick.
- [ ] **Video of the shift sounds.** A short clip of the shift sounds playing in the car (or the sound test), for the
  README and the release page. Needs the car test below first.

## Tests and CI

- [ ] **Windows job.** CI runs on Ubuntu only, while Windows is the platform we use: run the stick writer, drive and
  stick flow tests on `windows-latest` too.
- [ ] **All Playwright specs in CI.** Only `car-parity`, `car-app`, `collector-dev` and the Home config run there;
  `shift-sound.spec.mjs` and `builder.spec.mjs` run locally only.

## Fixes

- [ ] **Shift sound in the car:** built and tested on the PC only. Use the sound test in the Meters style list to find
  out whether the unit plays `sounds/tick.wav` and `sounds/shift.wav` or only the Mazda beep, how late, how either
  mixes with music, and whether the touch-beep setting mutes the Mazda beep. Then tune the ticks and the early tone
  to the car's 6 Hz rpm ([meters/README.md](meters/README.md), [docs/13](docs/13-gauges.md#sound-on-the-unit)).
- [ ] **Touch already enabled through the service menu.** A user asks what happens if the "disable warning, enable
  touch while driving" service-menu trick from [this miata.net thread](https://forum.miata.net/vb/showthread.php?p=10987780)
  was already applied before using the stick: the analysis reports the files as untouched. Work out which files that
  trick changes (if any) and what the check and the install plan should say in that case.
- [ ] **Consumption scale:** calibrate `Drv1AvlFuelE` against the car's own average consumption figure.
- [ ] **Power page with imperial units:** power and torque share one axis that is labelled PS/Nm; give each its own
  axis in the chosen units (the live numbers already convert).
- [ ] **Simulator gearing:** `meters/js/data.js` (`?src=sim`) drives with the ND1 1.5 manual gearing, so previews of
  another car show the wrong gear; take the gearing from the car profile.

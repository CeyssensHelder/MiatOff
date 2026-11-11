# TODO

Ideas and open items, mostly from user feedback after the first release. What is built is listed in the README's
[support status](README.md#support-status); anything not listed there is untested in a car.
Every change to the unit stays surgical and hash-guarded (see [AGENTS.md](AGENTS.md)).

## Start on Bluetooth instead of FM radio

User report: "Is there a way to change the default audio source when you start the car? My ND2 is always switching back
to FM radio whenever I start the car and it drives me crazy because I always have to manually switch it back to
Bluetooth. Heck I'd even be down to disable FM entirely if that fixed it."

- [x] Initial public-source feasibility review: Mazda documents FM fallback after slow Bluetooth reconnection on
  older firmware; MZD-AIO exposes a Bluetooth-selection request. Neither strict Bluetooth-first nor safe FM
  disablement is verified on v74. See [research and evidence](docs/14-bluetooth-startup.md).
- [x] A read-only research stick that captures the audio/last-mode scripts and the source/mute state while you switch
  sources by hand ([audio-research-stick](audio-research-stick/README.txt), 0.2.1).
- [ ] Run the research stick in the car (parked, with and without a phone connected) and write the findings into
  [docs/14](docs/14-bluetooth-startup.md).
- [ ] From that capture: find where the unit decides the audio source at start (last-source restore in the HMI/MMUI,
  the audio manager settings, or a persisted value) on 74.00.324A. AGENTS.md prohibits reading `dumps/` and
  `miatoff-dumps/`.
- [ ] Verify `SelectBTAudio`, the Bluetooth-audio-ready notification and a startup hook outside `Common.js` on v74.
  Investigate silent waiting / suppressing automatic FM fallback; a delayed Bluetooth switch alone may still play FM first.
- [ ] Check whether Bluetooth can be started before, or instead of, FM at boot. Options to compare: change the stored
  last source, change the start-up order, or hide FM (see [docs/04](docs/04-boot-speedup.md), [docs/05](docs/05-ui-tweaks.md)).
- [ ] Check what the unit does when no phone is connected yet at start-up (fall back to FM, or stay silent?).
- [ ] If it is feasible, design it as one more tweak with Install/Remove and a stock backup.

## Meters Designer (custom pages)

Built (PR #11): a local editor for custom Meters pages, a Designer tab in the app, up to eight pages in the car under
*Applications → Meters → CUSTOM*, installed and updated through the normal Meters payload (`custom-pages.js` in the
`MANIFEST`, REPAIR for an update). Tried on our car with three simple pages. See [docs/15](docs/15-meters-designer.md).

- [x] **First-run setup** (branch `feature/first-run-setup`): the Meters designer asks for region, car, gearbox, body,
  tyre and units the first time, and fills the vehicle profile from six presets in `meters/designer/v3/presets.mjs`
  ([docs/18](docs/18-vehicle-presets.md)); *Project → Car setup* changes it later. Not tried in a car.
- [ ] Car setup, open data points: no manufacturer source for the 1.5 gear ratios, final drive and running mass, or for any
  fuel cut (limiter = redline for now); no preset for the JP-only 1.5 automatic; the EU/UK automatic ratios are taken from
  the US/JP sheets; the 2024 update is not covered.
- [ ] Known issues seen on our car ([docs/15](docs/15-meters-designer.md#known-issues)): gauges lag up to about a second
  when stationary (the built-in pages too), one unexplained RPM jump (about 1,900 to 3,000), and the consumption scale
  (`Drv1AvlFuelE`) not yet compared with the car's own figure.
- [ ] Speed and memory in the car with eight pages and with background images.
- [ ] Decide what stays fixed for safety and readability (minimum font sizes, rev-limit warnings, how many things per
  page; the editor allows 24 widgets).
- [ ] Day mode in the car app (the designer has one; the car draws night styling only).

## Meters: more configuration

User report: "Is there anyway to make an option for the meters to feature imperial units like miles per hour and
farenheit for us Americans?"

- [x] Let the built-in styles use the same settings as the custom pages (units, RPM thresholds), converted in one place
  (`meters/js/units.js`): the designer's car setup goes to the builder and onto the stick as `js/car-profile.js`, and
  Street, Track, Cyberpunk, 2077 and 2077 NIGHT take their rev warnings, gearing, power figures and units from it.
  Not tried in a car.

## Mazda Home menu customisation

On the unmerged branch `codex/unified-designer`: the research (`docs/16-mazda-menu-customisation.md`) and a Mazda Home
mode for the shared Designer (one 800 × 480 screen, 1–12 items, background, normal/selected icons, Commander order;
`docs/17-unified-designer.md`). It is a design prototype only: no install action, plan key or pinned hashes.

- [ ] Review and merge the shared Designer (Meters and Mazda Home in one editor).
- [ ] Identify the exact v74 Home files (MainMenu control JS/CSS, the shared background) and their stock hashes on a
  future FULL dump run, without copying Mazda files into the repository.
- [ ] Find out whether the shared background also changes screens other than Home.
- [ ] A first, small car feature: background and label colour only, hash-guarded, sharing the Meters loader rather than
  a second installer. Mind the `systemApp.js` combinations already pinned for the Entertainment-menu item.
- [ ] Later: moved or custom shortcuts, only after the real control lifecycle and the native routes are verified, and
  only if every factory destination stays reachable.

## Later phases

### Meters: shift sounds

- [ ] Play a sound on the Meters pages when it is time to shift (rev-based shift point, ideally with a configurable
  RPM threshold per gear or a single shift light RPM).
- [ ] Research: can a Meters page (Chromium/WebKit on the CMU) play audio at all, and through which output? Check the
  autoplay rules, latency, whether it mixes with or interrupts the current audio source, and the volume control.
- [ ] Decide the sound design: a short beep or chime, kept subtle and not annoying; an option to turn it off; no sound
  while the car is stationary or the engine is warming up.
- [ ] An on/off switch and the shift RPM next to the designer's shift lights, so custom pages and the built-in styles
  share it.
- [ ] Add it to the simulator and the Meters tests. Ship the sound files with the Meters pages (hash-guarded).

## Designer: make both design pages more the same

User feedback: the Meters and Home design pages look and work differently.

- [x] Make the Home designer (meters/designer/home/) and the Meters designer (meters/designer/v3/) share one layout:
  the same toolbar, side panels, inspector sections, Send button and status line, so both feel like one tool.
  Done: Meters | Home menu tabs, one header with the same actions, the Meters layout for Home, one Send name.
- [ ] Still different in the designer: Meters has editing detail levels, a project dialog and phone sheets
  (Tools / Properties); Home shows its panels below the canvas on narrow windows instead.
- [ ] Do the same for the app's two design pages (Design your Meters, Design your menu): same cards, same list with
  Preview, same wording for choosing what goes on the stick.

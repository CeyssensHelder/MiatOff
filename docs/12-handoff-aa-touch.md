# 12 — Handoff: touch in Android Auto (for the builder)

## Goal
Enable **touch input in Android Auto** on this specific car: tap, swipe and drag on the factory screen.
It must be **reversible**, and everything except touch stays factory standard.

## The car
- Mazda MX-5 ND1 (2017), EU, Mazda Connect Gen-6 (CMU), firmware **74.00.324A**.
- Android Auto over cable, via the CarPlay/AA retrofit hub. Navigation SD, DAB and Bose present; no HUD.
- Phase 2 (TouchTune 1.2.1, touch while driving in the Mazda menus) is ready to install, or already
  installed. Check.

## What is already established (from a read-only dump of this unit)
Details are in [docs/11-dump-analysis.md](11-dump-analysis.md). In short:
- The Android Auto binaries on the unit (`blmjciaapa.so`, `aap_service`) are **exactly the builds** the touch shim
  of [oem-aa-mod](https://github.com/VitaliyKurokhtin/oem-aa-mod) 0.10.0 is based on (the md5s are in docs/11).
- The stock AAP attribute XMLs **do not declare a touchscreen**. That is why Android Auto currently has no touch. The
  certificate paths are equal to those in oem-aa-mod.
- The unit uses `sm.conf` (no WCP variant). There are no other mods or `LD_PRELOAD`s on it yet.
- The tools available on the unit: BusyBox `ash`, `md5sum`, `openssl` (no `sha256sum`), `jci-dialog`.

## What is ready in this project
| What | Where |
|---|---|
| Full read-only dump (private, do not publish) | `dumps/eu-74.00.324/001-full-up174s/` |
| oem-aa-mod 0.10.0, verified against the release's SHA256SUMS | `vendor/oem-aa-mod/` |
| TouchTune 1.2.1, the bench-validated package | `vendor/touchtune/` |
| Working USB start mechanism (TouchTune launcher) + stick builder with hash manifest | `launcher/`, `tools/stickkit.py` |
| Read-only dump stick (tested in the car) | `dump-stick/` |

## Requirements for the result
- **Touch only.** No HUD, no GAL 1.6, no audio changes, no navigation shim, no other changes
  to the XMLs than what touch needs.
- **Refuses on an unknown state.** If the firmware, a binary or a config file differs from what is in docs/11,
  nothing changes.
- **Fully reversible** to the byte-exact stock state, with a simple way to switch it off if something does not
  work well.
- **No half-installed state** on an error or power interruption.
- **Never a boot loop**: a problem in the shim may at most disable Android Auto, not the whole unit.
- **Operated via USB** in the car (there is no network access to the unit). Clear messages and a log on the stick.
- Respect the licences: oem-aa-mod is AGPL-3.0, the TouchTune parts are GPL-3.0.

## Acceptance (in the car)
- Tap, swipe, drag and the on-screen keyboard work in Android Auto, stationary and while driving (pinch does not work:
  the panel is single-touch).
- Rotary knob, steering-wheel buttons, voice, calling, radio/DAB, navigation and Bose work as before.
- 3 cold starts and 3 normal starts without problems.
- Removal has been tested once; a new dump afterwards shows the stock state again.

## What we want back
- The source code/scripts used (because of the AGPL/GPL), plus what changes on the unit.
- A new dump after the installation. We compare it with the first one, to check that only the intended thing
  changed.

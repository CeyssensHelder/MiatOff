# MiatOff

Open-source project to tweak the Mazda Connect (CMU) head unit — for your **own** car:
**(1) touchscreen while driving** and **(2) faster startup** by switching off things you don't need.

## Disclaimer
Modifying a head unit can leave it unusable and is not covered by Mazda's warranty. You use this at your own risk.
MiatOff is not affiliated with or endorsed by Mazda. It contains no Mazda files. Touch while
driving removes a distraction safeguard; follow your local law and keep your eyes on the road.

## Support status
Only one combination has been analysed, and **nothing has been fully accepted in a car yet**.

| Firmware | Market | Feature | Status |
|---|---|---|---|
| 74.00.324A | EU (MX-5 ND1) | Check my car (read-only dump) | Tested in the car |
| 74.00.324A | EU (MX-5 ND1) | Touch in Android Auto, boot trim, startup warning | Experimental: host-tested, in-car acceptance open |
| 74.00.324A | EU (MX-5 ND1) | Meters | Experimental: one in-car failure (busy root remount, 28-10-2026), fixed but not re-tested |
| anything else | any | all | Unsupported: the tools refuse to change anything |

The installer only acts when every file it touches matches a known sha256. For another firmware, run the
"Check my car" stick and open an issue with only `SUMMARY.txt` (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Quick start (Windows)
1. Use an empty USB stick of 32 GB or less, formatted FAT32 with an MBR partition table.
2. Run `python miatoff_gui.py` and pick the drive. Tab 1, **Check my car**: build the check stick, run it in the car
   (choose FULL), then press **Read last dump**. You get a deterministic report that compares every file with the hashes
   the installer knows. Tab 2, **Install / remove**: per part choose *Install*, *Remove* or *Leave as-is*; after a check, options
   the car cannot take are greyed out. Press **Build install stick**.
   Command line: `python tools/check_dump.py E:\`, `python dump-stick/build_stick.py E:\` and
   `python aa-touch-stick/build_stick.py E:\`.
3. Engine on, wait for the home screen, plug the stick into the car's USB hub, and follow the dialog. It offers your
   chosen steps one at a time; each is confirmed and restarts the unit, and the stick can stay in for the next step. Never confirm a
   Mazda software-update screen: cancel and remove the stick.
4. Everything can be undone from the same dialog. If the menu misbehaves, put an empty file `MIATOFF-RESTORE` on the stick.
   Last resort: reflash EU 74.00.324A. Details: [aa-touch-stick/README.md](aa-touch-stick/README.md).

## Car / target
| | |
|---|---|
| Vehicle | 2017 Mazda MX-5 **ND1** 1.5L |
| Market | EU |
| Infotainment | Mazda Connect **Gen-6 (CMU)**, Visteon hardware, JCI software |
| Firmware | **74.00.324** (check: Settings → System → About → Version Information) |
| SoC | Freescale/NXP **i.MX6** (ARM), Linux kernel 3.0.35 |

> ⚠️ Stay on **74.00.324**. Do **not** upgrade to 74.00.331 (it breaks wireless CarPlay more often and cannot be rolled back).

## TL;DR (research status)
- **Touchscreen** → a solved path already exists: **TouchTune** (GPL-3.0, open source). Surgical:
  1 line in `Common.js` + 2 NVRAM flags, with backup/hash/rollback. See [docs/03](docs/03-touch-feature.md).
- **Android Auto touch** → TouchTune does **not** do this. Open-source path: **`oem-aa-mod`** (AGPL-3.0), an
  `LD_PRELOAD` shim in `jciAAPA` + a touch declaration in `aap_system_attributes.xml`. See [docs/10](docs/10-implementation-plan.md).
- **Faster boot** → mechanism and levers known (core scheduling, hard-coded `sleep`s, the AHA gate, services for
  hardware that isn't present). The exact `sm.conf` lines still have to be verified on an **EU dump**. See [docs/04](docs/04-boot-speedup.md).
- **UI tweaks** (remove the disclaimer, shorter page delay) → well-known AIO tweaks; values known, exact regex still to be dumped.
  See [docs/05](docs/05-ui-tweaks.md).
- **Biggest lesson:** keep it **surgical** (like TouchTune). MZD-AIO sometimes breaks wireless CarPlay because it overwrites
  broad system files. See [docs/07](docs/07-risks.md).

## Documents
| # | File | Contents |
|---|---|---|
| 00 | [HANDOFF.md](HANDOFF.md) | **Read this first** — instructions + open questions for the reviewer |
| 01 | [docs/01-context.md](docs/01-context.md) | Goal, car, firmware, core conclusions |
| 02 | [docs/02-cmu-internals.md](docs/02-cmu-internals.md) | Hardware, boot chain, tweak mechanism (USB/serial/terminal) |
| 03 | [docs/03-touch-feature.md](docs/03-touch-feature.md) | Touch while driving: verified **TouchTune** deep-dive |
| 04 | [docs/04-boot-speedup.md](docs/04-boot-speedup.md) | Boot ordering, services, delays, core scheduling |
| 05 | [docs/05-ui-tweaks.md](docs/05-ui-tweaks.md) | Disclaimer + page-delay tweaks |
| 06 | [docs/06-ecosystem-and-repos.md](docs/06-ecosystem-and-repos.md) | Open-source projects/repos |
| 07 | [docs/07-risks.md](docs/07-risks.md) | Brick/CarPlay/warranty/legal/safety |
| 08 | [docs/08-approach-roadmap.md](docs/08-approach-roadmap.md) | Proposed architecture + phased plan |
| 09 | [docs/09-open-questions.md](docs/09-open-questions.md) | Open questions / next research steps |
| 10 | [docs/10-implementation-plan.md](docs/10-implementation-plan.md) | **Implementation plan** for this car: AA touch + boot, phased with a recovery ladder |
| 11 | [docs/11-dump-analysis.md](docs/11-dump-analysis.md) | **Analysis of the first dump**: go/no-go, exact AA-touch changes, boot profile |
| 12 | [docs/12-handoff-aa-touch.md](docs/12-handoff-aa-touch.md) | Handoff for the AA-touch builder: goal, facts, requirements, acceptance |
| 13 | [docs/13-gauges.md](docs/13-gauges.md) | Gauges/meters: data source, what is on the unit, approach |
| — | [docs/sources.md](docs/sources.md) | All sources |
| tool | [dump-stick/](dump-stick/README.md) | Phase 1: read-only USB dump of the CMU (TouchTune launcher) |
| tool | [collector/](collector/README.md) | Live vehicle data for Meters: D-Bus signals (6–10 Hz, lock-free) + slow smdb round → `/tmp/miatoff/live.txt` |
| tool | [aa-touch-stick/](aa-touch-stick/README.md) | Phase 3: touch in Android Auto (oem-aa-mod, touch shim only), reversible |

## Reliability of the sources
Much of the information comes from enthusiast forums, commercial vendors' websites (so partly vendor
claims) and security research (ZDI/Trend Micro). Where something is a **vendor claim** or an **unconfirmed forum report**,
that is stated. Performance figures (e.g. 48→32 s) are vendor measurements on specific units, not independently verified.

## Licence
MiatOff is GPL-3.0-or-later (see [LICENSE](LICENSE)). Third-party components and their licences are listed in [NOTICE](NOTICE).

## Licensing background
TouchTune and the AIO lineage are **GPL-3.0**. If MiatOff (re)uses that code, this project becomes copyleft (GPL-3.0) too.
See [docs/07](docs/07-risks.md).

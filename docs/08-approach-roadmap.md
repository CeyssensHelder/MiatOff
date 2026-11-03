# 08 — Proposed approach & roadmap

## Design principle
**Surgical, verifiable, reversible** — copy the TouchTune model for everything:
`stage (build a complete new version) → verify (hash + mode/uid/gid) → publish (atomic mv) → recheck → otherwise
roll back`, with a **backup** per change and a **boot-loop guard**.

## Proposed architecture
```
MiatOff/
├─ usb/                      # what goes on the FAT32 stick
│  ├─ <scanner-trigger>.up   # starts the installer via the Mazda update scanner
│  ├─ install.sh             # menu: INSTALL / REPAIR / REMOVE / CANCEL
│  ├─ patches/
│  │  ├─ touch-while-driving.sh   # Common.js line + 2 NVRAM flags (TouchTune approach)
│  │  ├─ disclaimer.sh            # HMI JS timer
│  │  ├─ page-delay.sh            # HMI timing 1.5→0.3s
│  │  └─ boot-*.sh                # sm.conf/stage-script edits (phased)
│  └─ lib/
│     └─ helpers.sh          # stage/verify/publish/rollback, backup, nvram, hash
├─ tools/                    # host-side builder/configurator
├─ tests/                    # host tests (shell) without a car
└─ docs/                     # this research
```
- **Builder/configurator:** Node (fits with `casdk`) or Python — builds a stick per car/firmware with the chosen
  patches (as commercial tools do).
- **Native extras** (if ever needed): `rpendleton/mazda-toolchain` for i.MX6.

## Phased plan (low → high risk)
1. **Phase 0 — Safety net.** Confirm the firmware exactly (74.00.324), find out whether there is wireless CarPlay, full
   **backup of the `JCI` folder**, failsafe boot + reflash image ready. **Change nothing without a recovery path.**
2. **Phase 1 — Access.** Reproduce a stable entry (USB autorun/terminal). Without reliable access + rollback
   the rest is pointless.
3. **Phase 2 — Touch (lowest risk, highest value).** Re-implement the TouchTune approach (or use TouchTune
   directly). Test, document the exact diff.
4. **Phase 3 — UI tweaks.** Disclaimer removed + page delay 1.5→0.3 s. Locate the exact HMI JS values on the EU build.
5. **Phase 4 — Boot speed-up (biggest job).** In this order of risk:
   a. Remove hard-coded `sleep`s in the AP script.
   b. Decouple the AHA gate / `stage_3` dependency.
   c. Trim absent-hardware services in `sm.conf`.
   d. Core affinity for WiFi/CarPlay (biggest gain, most investigation).
   Test each step separately with a full power-down + measurement.
6. **Phase 5 — Packaging.** Everything in the installer with INSTALL/REPAIR/REMOVE + configurator.
7. **Optional — Meters app** via `casdk`.

## Measurement method (so the gain is demonstrable)
- Measure **touch-ready** and **CarPlay-active** with a stopwatch/video, from a **cold boot** (12V interrupted, not
  resume). Repeat 3×, note the average. Compare stock vs. per phase.

## Definition of done per feature
- Touch: works while driving, REMOVE restores exactly, wireless CarPlay intact, no boot loop after 3 power-downs.
- Boot: measurable, reproducible gain without loss of function (CarPlay/AA/BT/audio/SWC).

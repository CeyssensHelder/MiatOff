# 01 — Context: goal, car, firmware

## Goal
An open-source software package ("MiatOff") that, on your own Mazda MX-5:
1. **makes the touchscreen usable while driving** (bypassing the factory lock), and
2. **speeds up startup** by switching off unneeded background things / shortening waits.


## The car
| | |
|---|---|
| Vehicle | 2017 Mazda MX-5 **ND1** 1.5L |
| Market | EU |
| Infotainment | Mazda Connect **Gen-6 (CMU)** |
| Hardware | **Visteon** unit, software originally from **Johnson Controls (JCI)** |
| SoC | Freescale/NXP **i.MX6** (ARM) |
| Kernel | Freescale tree **Linux 3.0.35** |
| Firmware | **74.00.324** |

## Why 74.00.324 matters
- This is the firmware that the **MZD-AIO** tweaks and **TouchTune** support.
- **Do not upgrade to 74.00.331**: community reports mention more frequent loss of wireless CarPlay, and the newest
  Mazda Connect software **cannot be rolled back** to an older version.
- Check the exact version via **Settings → System → About → Version Information** (the About screen sometimes omits
  the trailing "A"; 74.00.324 and 74.00.324A are treated as equal by TouchTune).

## Core conclusions of the research
1. **Touch** is the easiest, lowest-risk feature and is already solved in open source (TouchTune). → [docs/03](03-touch-feature.md)
2. **Boot speed-up** is the real reverse-engineering work; the mechanism is known, the exact edits are not. → [docs/04](04-boot-speedup.md)
3. The HMI is largely **web tech** (Opera engine, HTML/CSS/JS) → many tweaks = editing JS/CSS files. → [docs/02](02-cmu-internals.md)
4. Keep changes **surgical** with backup + verification + rollback; avoid broad system-file overwrites. → [docs/07](07-risks.md)

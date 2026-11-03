# 06 — Open-source ecosystem & repos

| Project | What | Status / usability |
|---|---|---|
| **`Miatafy/TouchTune`** | Free & open-source "touch while driving" | **Starting point #1** for touch. GPL-3.0, v1.2.1, FW 74.00.324(A). Verified — see [docs/03](03-touch-feature.md). |
| **`Trevelopment/MZD-AIO-TI`** | *All-In-One Tweaks Installer* (touch, disclaimer, page delay, speedometer, …) | The reference. Latest release v2.8.6 (Apr 2020). **GitHub DMCA-blocked (HTTP 451)**; mirror via **mazdatweaks.com**. Works manually on v74. Overwrites broad system files → CarPlay risk. |
| **`Trevelopment/MZD-AIO`** | Desktop app that builds the AIO USB stick | Publicly reachable (changelog readable). Contains the tweak-selection UI. |
| **`Trevelopment/mazdatweaks`** | Source of mazdatweaks.com | Distribution side. |
| **`casdk` (npm) / mzd-custom-application-sdk** | SDK + CLI to build **your own apps** for the CMU | `casdk create <name>` → `app.js`, `app.css`, `app.png`. Basis if we want our own UI/app (e.g. "Meters"-like gauges). Opera/web tech. |
| **`rpendleton/mazda-toolchain`** | Cross-compilation toolchain (i.MX6, kernel 3.0.35) | For building **native binaries**; kernel config from a running unit. |
| **`jmgao/mazda-connector`** | Binaries that extend MZD Connect (steering-wheel talk button → phone) | **Most useful reference for startup hooks**: shows how to start a daemon via `/jci/sm/sm.conf` + `/jci/scripts/stage_gap2.sh`, with a boot-loop guard (`enable_*` flag in `/tmp/mnt/data`). Tested on a 2014 Mazda3. |
| **`bencroskery/MZD-WEB`** | Customise the web side of the HMI | "Back up the `JCI` folder first". |
| **mzd-connect-1-root** | USB JS payload: speed lock off + terminal access | The "root/entry" piece. |
| **silverchris — mazda-cmu-documentation** | Documentation on failsafe boot/CMU | Recovery/failsafe reference. |
| **openmzdc (fandom wiki)** | "Getting started" with MZD modding | Overview (page could not be fully fetched during research). |

## Key mechanism lesson from `jmgao/mazda-connector` (verified)
This is how to safely start your own daemon at boot:
1. Add a service entry to **`/jci/sm/sm.conf`** that depends on `stage1`.
2. Let the input consumer `devices` (`/jci/devices/svc-com-jci-cpp-devices.so`) depend on it so that your service starts
   earlier.
3. **Boot-loop guard:** the daemon reads a flag file in `/tmp/mnt/data` (`1` = run once, then set to `0`;
   `2` = stay on). This prevents a permanent boot loop after a broken change.
4. Warning from the author themselves: a wrong `sm.conf` change can **brick** the system; stage names
   (`stage1` vs `stage_1`) differ per system → verify on your own unit.

## Licence overview
- TouchTune: **GPL-3.0-or-later**.
- MZD-AIO lineage: GPL family; TouchTune credits it in `NOTICE`.
- → A clone that builds on this is **copyleft (GPL-3.0)**. See [docs/07](07-risks.md).

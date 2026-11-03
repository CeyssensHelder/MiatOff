# 02 — CMU internals: hardware, boot chain, tweak mechanism

## Hardware & software stack
- **Unit:** Visteon hardware; software originally from **Johnson Controls (JCI)**.
- **SoC:** Freescale/NXP **i.MX6** (ARM). HABv4 secure boot is present in the silicon but is **not enabled** on the CMU
  (no signature checks between boot stages).
- **Kernel:** Freescale tree **Linux 3.0.35**.
- **Rootfs:** NAND with **Datalight Reliance (`relfs`)**.
- **HMI:** a **frameless Opera fullscreen window** that renders the interface (web tech). Consequence: much of the UI is
  **HTML/CSS/JS** and tweaks often just mean editing files.

## Boot chain (rough)
1. **Boot ROM** → reads the boot config from fuses, loads code from SPI-NOR flash.
2. **IBC1** → reads the boot-select byte: `0xFF` = Normal, `0x00` = **Failsafe**.
3. **IBC2** → validates the kernel header, decompresses the kernel, starts it.
4. **Kernel** → mounts the rootfs (relfs) from NAND, starts `init`.
5. **JCI Service Manager (SM)** → takes over userspace, starts services in a **stage-based order**. This is by far the
   largest part of the boot time.

### Where startup is defined
- **`/jci/sm/sm.conf`** — service definitions + dependencies; services hook onto stages (`stage1`/`stage_1`,
  `stage_3`, …).
- **Stage scripts**, e.g. **`/jci/scripts/stage_gap2.sh`** — binaries/daemons are (also) started here.
- A service = a `.so` that the SM loads, e.g. the input consumer `devices` = `/jci/devices/svc-com-jci-cpp-devices.so`.
- **Watchdog:** services are monitored; if a daemon breaks an invariant → **boot loop** that you cannot fix over ssh. Always
  back up first and have a recovery path ready.

### Rough timeline (stock Gen-6, vendor measurement)
| Milestone | Time |
|---|---|
| Home screen | ~25 s |
| **Touch-ready (HMI)** | ~48 s |
| WiFi AP ready | ~55 s |
| CarPlay active | ~71 s |

A **resume** (12V held) takes only a few seconds; a full ~48 s boot happens after a long standstill or a
12V interruption. A **weak 12V supply** can force unnecessary cold boots — check that first.

## Tweak/access mechanism (how code gets in)
- **USB autorun:** the CMU runs a payload when a stick is inserted. In the AIO world via a `*.up` file that triggers the
  Mazda update scanner (which starts the installer). Historically via `cmu_dataretrieval` →
  `dataRetrieval_config.txt` → `tweaks.sh`.
- **Serial console** on the back panel of the unit — used to re-enable USB autorun after
  firmware updates.
- **Terminal on v74:** a community method opens a terminal on the screen; with a **USB keyboard** you start the
  script manually (AIO refuses v74 automatically; needs a version-check edit).
- **Security context (ZDI/Trend Micro, 2024):** vulnerabilities in **74.00.324A** — including CVE-2024-8355 (SQL injection in
  DeviceManager) and command injections in `REFLASH_DDU_FindFile` / `REFLASH_DDU_ExtractFile` — give root + persistence
  via a prepared USB stick. Physical access required. This is the same class of mechanism the mod scene relies on.

## Failsafe / recovery
- IBC1 boot-select `0x00` = **Failsafe boot** (see the silverchris CMU documentation in [sources](sources.md)).
- Recovery after a broken tweak happens in practice by **reflashing the firmware**; AIO's own uninstaller did not
  restore everything in some cases (e.g. wireless CarPlay).

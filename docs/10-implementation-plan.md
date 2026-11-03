# 10 — Implementation plan for *your* MX-5 (Android Auto touch + faster startup)

> Target car: 2017 MX-5 ND1 1.5L, EU, Mazda Connect Gen-6, FW 74.00.324(A).
> Goal: **(1) touch in Android Auto** (also while driving) and **(2) a usable screen sooner after starting**.
> Guiding principle: **change nothing without a recovery path, one change at a time, reuse existing tested tools.**

---

## 1. Course corrections relative to the research (docs 01–09)

| # | Finding | Consequence for the plan |
|---|---|---|
| 1 | **TouchTune does *not* do Android Auto touch.** It only removes the speed lock in Mazda's own UI and in CarPlay. Stock Android Auto on Mazda Connect has **never** had touch, not even when stationary: Mazda does not declare the touchscreen to the phone. | AA touch is a **separate feature** with its own implementation (see §5). TouchTune stays useful, but serves a different purpose. |
| 2 | An **open-source AA touch** exists: [`VitaliyKurokhtin/oem-aa-mod`](https://github.com/VitaliyKurokhtin/oem-aa-mod) (AGPL-3.0). It is an `LD_PRELOAD` shim (`libpatch-blmjciaapa.so`) in Mazda's own AA service `jciAAPA`, plus modified `/etc/aap_system_attributes*.xml` in which the touchscreen is declared. Config key `touch = true` (default). | This is the usual mechanism for AA touch: declare touch and translate events. **Reuse, don't build it yourself.** |
| 3 | A 2017 EU ND1 has **no** factory CarPlay/AA: that comes from the **retrofit hub** (TK78-66-9U0C) + v70/v74 firmware, and is **wired**. | The big risk from docs 07 (wireless CarPlay breaks) is **largely irrelevant** for you. The boot levers for WiFi and CarPlay (AP `sleep`s, 5 WiFi modules, core affinity for WiFi and CarPlay) also yield **nothing for wired AA** → lowest priority or drop. |
| 4 | **EU ≠ NA.** DAB is factory-fitted on many EU MX-5s; SiriusXM, Aha, Pandora and Stitcher are NA services. | DAB is **not** on the trim list, unless the car demonstrably has no DAB. |
| 5 | All the "still to be determined on the EU build" items (sm.conf lines, JS locations, paths) are blocked on one thing: **a dump of your own unit**. | The first real step is a **read-only dump stick**. No write action happens before that dump has been reviewed. |
| 6 | TouchTune refuses an **unknown modified `Common.js`**. | Our own patches must **never** touch `Common.js`, otherwise you block TouchTune's REPAIR/REMOVE. |

**Honest alternative:** commercial one-click tools exist and do touch, AA touch and boot in about 2 minutes. The open-source route below takes several evenings, but is transparent, free and fully reversible.

---

## 2. Target architecture (minimal)

```
Mazda Connect (EU 74.00.324)
├─ Native touch while driving → TouchTune v1.2.1, unmodified   (Common.js line + 2 NVRAM keys)
├─ Android Auto touch         → oem-aa-mod, touch only          (sm.conf environ_var + aap XML + /data_persist .so)
├─ UI tweaks                  → own MiatOff patch, TouchTune style (NOT Common.js)
└─ Boot                       → own MiatOff patches, 1 service per iteration, with boot-loop guard
```

The components touch **different files**. TouchTune works in `Common.js` and NVRAM, oem-aa-mod in `sm.conf`, `/etc/aap_*.xml` and `/data_persist`. That means you can install them separately and roll them back separately.

An own "all-in-one" installer (docs 08, Phase 5) is **optional** for a single car. Separate sticks per feature are safer and simpler.

---

## 3. Phase 0 — Inventory & safety net (no changes)

### 3a. Car checklist
| Check | How | Why |
|---|---|---|
| Exact firmware | Settings → System → About → Version Information. Take a photo. | TouchTune and oem-aa-mod refuse or break on other builds. |
| AA works wired | Phone on the USB of the retrofit hub, AA starts and control with the commander works. | AA touch requires working AA. |
| Navigation SD present? | SD slot in the hub/console. | Determines whether `jcinavi` is needed; in oem-aa-mod always set `hud = false` (the ND has no HUD). |
| DAB / Bose present? | Audio source menu; speakers in the headrests = Bose. | Never trim these services if they are present. |
| 12V battery healthy | Resting voltage ≥ 12.4 V after a night. | A weak battery forces cold boots. That is "free" boot time. |

### 3b. Prepare the recovery kit (before every change)
- **EU firmware 74.00.324A** (official update package) on your own, labelled USB stick. Reinstalling the same version number is the known recovery path (this is also how the AIO damage was repaired).
- 3× empty **FAT32 stick with MBR partition table** (dump, feature, rescue).
- **USB keyboard** (for the terminal method on v74).
- Optional, as a last resort: a **USB-TTL 3.3 V serial adapter** and finding out how to get the CMU out of the ND dashboard (serial console and failsafe boot, see docs 02).

### 3c. Baseline measurement (stock)
Measure with a video camera on the screen, 3× each time:
- **T_touch**: ignition on → home screen responds to touch.
- **T_AA**: ignition on, phone already plugged in → AA projection visible.

Do this for both a **daily start** (what you experience in practice) and a **cold boot** (after standing a long time). Note everything in `measurements.md`. Without a baseline you cannot demonstrate any boot gain.

---

## 4. Phase 1 — Read-only dump (prove access without risk)

**Goal:** prove the USB entry on your car, and answer all open questions **without changing a single byte on the unit**.

**How:** with the **[dump stick](../dump-stick/README.md)** (`python dump-stick/build_stick.py E:\`). It uses the same `*.up` trigger mechanism as TouchTune, but the script **only reads** and writes to the stick. If that doesn't work, use the terminal method with a keyboard from the mazdas247 v74 thread.

**What to dump:**
- Identity: firmware version string, `uname -a`, `cat /proc/cpuinfo`, `mount`, `df`.
- Boot: `/jci/sm/sm.conf`, **`sm_WCP.conf`** (does it exist, and which of the two is active?), `/jci/scripts/` in full, boot logs if present, `dmesg`.
- AA: `/etc/aap_system_attributes.xml`, `/etc/aap_system_attributes_UCP.xml`, the path and **md5** of `blmjciaapa.so` and `/usr/bin/aap_service`, and the `jciAAPA` block from `sm.conf`.
- HMI: `Common.js` (for checking only), `systemApp.js` and the rest of the HMI JS folder (for disclaimer and page delay).
- Runtime: `ps` (with args), `free`, `cat /proc/meminfo`. Do that once right after boot and once after 5 minutes.
- NVRAM: `bus_bcm_speed_restriction` and `lvds_speed_restriction`.

> ⚠️ Dumps contain copyrighted Mazda/JCI code. Keep them local (e.g. `dumps/eu-74.00.324/`) and **never publish them**.

**Outcome / go-no-go:**
- [ ] The entry works reproducibly (tested 2×).
- [ ] It is known which SM config file is active and what the `jciAAPA` block looks like.
- [ ] The md5 of `blmjciaapa.so` is known, so you can check whether it matches the build oem-aa-mod was tested on (74.00.324A).
- [ ] The list of services for absent hardware has been drawn up (§7).
- [ ] The disclaimer and page-delay locations have been found (§6).

---

## 5. Phase 2 + 3 — Touch

### Phase 2 — Native touch while driving: TouchTune v1.2.1, unmodified
1. Make the stick according to the TouchTune README (release ZIP to the root of the stick, FAT32/MBR).
2. INSTALL, the unit restarts itself. Read `touchtune.log` from the stick.
3. **Test:** touch works stationary and while driving. Have the passenger test it, or do it on private ground.
4. **Test:** commander, steering-wheel buttons, BT calling, audio and AA (still without touch) work. Do 3 power-downs without problems.
5. **Test REMOVE** once and then reinstall. That way you know for sure the way back works.

**Why first:** it is low-risk and proves the install flow on your car. It also presumably holds that the NVRAM key **`lvds_speed_restriction`** blocks touch events while driving for AA as well. Native touch must therefore work while driving first, otherwise AA touch while driving is pointless.

### Phase 3 — Android Auto touch: oem-aa-mod, **touch shim only**
**Scope:** only `libpatch-blmjciaapa.so` plus the XML declaration. **Not** the `aap_service` shim (protocol 1.6), **not** `svcjcinavi` and **not** the HUD.

`/data_persist/oem-aa-mod/libpatch.conf`:
```
touch = true
hud = false
use_protocol_v1_6 = false
aa_audio_low_latency = false
```

**Preconditions (from the dump):**
- The md5 of `blmjciaapa.so` on your unit belongs to 74.00.324A. If it differs, **stop** and investigate first.
- You know which SM config file is active (`sm.conf` or `sm_WCP.conf`).
- **Diff** the release XMLs against the original EU XMLs. Take over only the touch-related change (the declaration of the touchscreen input source). If the diff contains more, analyse that first. That keeps it surgical.

**Steps (TouchTune style: backup → stage → verify → publish):**
1. Backups: `sm.conf` → `/data_persist/miatoff/backup/`, both XMLs → `.orig`, with a hash of each file.
2. Copy `libpatch-blmjciaapa.so` (0644) and `libpatch.conf` to `/data_persist/oem-aa-mod/` and then run `sync`.
3. Mount the rootfs writable. In the `jciAAPA` block add the `<environ_var>` with `LD_PRELOAD` and leave the rest alone. Modify the XML and run `sync`. Then mount back to read-only.
4. **Test live first without a reboot:** `smctl -r -n jciAAPA`. If AA stops working, restore directly from the backup, before rebooting.
5. Then a full power-down, followed by the test.

**Built-in kill switch:** an `LD_PRELOAD` pointing to a **missing** file is ignored by glibc (only a warning). A "rescue" stick that only renames `/data_persist/oem-aa-mod/libpatch-blmjciaapa.so` therefore puts AA back to stock without a rootfs change. Make that stick **before** the installation and test it once.

**Optional extra safety net:** the mzd-vietnav-hud project sets `reset_board="no"` on `jciAAPA` and `aap_service`. A crashing AA service then only restarts itself instead of the whole unit, which prevents boot loops through AA. Evaluate that after the dump: it deviates from the stock watchdog behaviour.

**Test (DoD):**
- [ ] Tap, swipe and drag in Google Maps, plus the on-screen keyboard (there is no pinch: the panel is single-touch).
- [ ] Works stationary **and** while driving (tested by the passenger or on private ground).
- [ ] Commander, steering-wheel buttons, voice, calling and audio work unchanged.
- [ ] 3 cold boots and 3 daily starts: AA comes up every time.
- [ ] Kill switch and full rollback have been tested once.

---

## 6. Phase 4 — UI tweaks (perceived speed)

| Tweak | Action | Note |
|---|---|---|
| Disclaimer | 3.5 s → gone (or 0.5 s) | A Mazda service bulletin describes reboots during the disclaimer screen, so test with power-downs. |
| Page delay | 1.5 s → 0.3 s | The exact location comes from the dump. |

- Implement as an own MiatOff patch following the TouchTune model: stage a complete new version → SHA-256 → atomic `mv` → recheck → rollback, with a backup in `/data_persist/miatoff/backup/`.
- **Never `Common.js`.** If a value does turn out to be in `Common.js`, drop that tweak.
- Do one tweak per installation and test it separately.

---

## 7. Phase 5 — Faster startup (adapted to wired AA)

**Expectation:** the vendor measures touch-ready 48 → 32 s **on a cold boot**. On a daily start (resume) the gain is much smaller. What it yields for the AA time has not been measured anywhere for wired AA. So measure it yourself (§3c).

**Procedure per iteration:** change one thing, keep the backup of `sm.conf`, do 3 cold boots with measurement, and check that AA, BT, audio, the steering-wheel buttons and the commander work. If you don't like it, restore.

| Prio | Lever | Why for you | Risk |
|---|---|---|---|
| **1** | **Profiling** (from the SM logs or `dmesg`; otherwise `ps` with uptime stamps via jmgao's boot-loop guard, docs 06) | You only know what is on the critical path to the HMI and `jciAAPA` if you measure it. | Low |
| **2** | **Trim services for absent hardware/services**. EU candidates: Aha, Pandora, Stitcher, Slacker, SiriusXM, TV tuner, DVD. Telematics only if demonstrably unused. **Not:** DAB (if present), navi (if there is an SD in it), BT, audio/Bose, `jciAAPA`/`aap_service`, devices/input. | Less CPU and RAM pressure in the first ~30 s. That helps both touch-ready and AA. | Medium: an error in `sm.conf` can cause a boot loop. **One service at a time.** |
| **3** | **Dependencies of `jciAAPA`/`aap_service`**: do they wait on stages or services they don't need? | This can bring AA-ready forward directly. | Medium/high: only with a proven rollback. |
| 4 | **CMU WiFi/AP**: only if the dump shows the AP starts while you have no wireless CarPlay. | With wired AA that is pure overhead. A wireless AA dongle uses its own WiFi, not the CMU's. | Medium |
| 5 | Core affinity (e.g. `taskset` for `aap_service` or `jciAAPA` to core 1) | Only if profiling shows core 0 is saturated during AA connect. | Medium |
| — | ~~AP `sleep`s, WiFi modules, core affinity for WiFi/CarPlay~~ | Not relevant for wired AA (see §1). | — |

**Boot-loop protection with `sm.conf` changes:**
- Always keep a backup of `sm.conf` on `/data_persist` and keep a rescue stick ready that restores the backup.
- A rescue stick only works if the unit boots far enough to start the USB scanner. For a boot loop before that point you need reflash or serial/failsafe (§8). Hence: one change at a time, and never touch services in the early stages (stage1, input, audio).

---

## 8. Recovery ladder (light to heavy)

1. **REMOVE** from the relevant feature stick (TouchTune, or your own patch).
2. **Kill-switch stick**: rename the AA shim in `/data_persist`.
3. **Rescue stick**: restore `sm.conf`, the XMLs and the JS from `/data_persist/miatoff/backup/`.
4. **Reflash EU 74.00.324A**, the same version. Note: `/data_persist` may survive that. Clean up `oem-aa-mod/` and `miatoff/` afterwards.
5. **Serial console / failsafe boot** (the CMU has to come out of the dashboard; see silverchris in the sources).
6. Dealer (does not cover damage caused by modification, see docs 07).

---

## 9. Order & estimate

| Phase | Contents | Risk | Indication |
|---|---|---|---|
| 0 | Inventory, recovery kit, baseline | None | 1 evening |
| 1 | Read-only dump | Very low | 1–2 evenings |
| 2 | TouchTune | Low | 1 hour |
| 3 | AA touch (oem-aa-mod, touch only) | Low-medium | 1–2 evenings |
| 4 | UI tweaks | Low-medium | 1–2 evenings |
| 5 | Boot, iterative | Medium | several evenings |
| 6 | (Optional) everything in one MiatOff installer | — | as desired |

**Most of the value for the least effort is in Phases 0–3.** With that you have AA touch, also while driving. Phase 5 is "nice to have" with an uncertain gain on daily starts.

---

## 10. Open questions: answered by the dump of 24-10-2026 (see [docs/11](11-dump-analysis.md))
- [x] Retrofit hub present, AA with cable works: **yes**
- [x] Active SM config: **`sm.conf`** (no WCP)
- [x] md5 of `blmjciaapa.so` = tested build `486628ae…`: **yes**
- [x] XML diff: stock EU has **no `<touch_screen>` block**; certificate paths are equal
- [ ] Does `lvds_speed_restriction` block touch in AA while driving? Test after Phase 3
- [x] CMU WiFi: `wlan0` (wl12xx) is running. Not used in this car for AA over the cable
- [x] Candidate services: see docs/11. `blm_ira_aha` and `jciCD` must **not** go; the gain from trimming is small

## Licence (only relevant when publishing)
oem-aa-mod is **AGPL-3.0**, TouchTune **GPL-3.0**. For use in your own car that changes nothing. If you publish MiatOff with this code in it, choose GPL-3.0 or AGPL-3.0 (GPLv3 §13 permits the combination) and **do not** publish Mazda dumps.

## Extra sources (for this plan)
- [VitaliyKurokhtin/oem-aa-mod](https://github.com/VitaliyKurokhtin/oem-aa-mod) · [installation](https://github.com/VitaliyKurokhtin/oem-aa-mod/blob/main/docs/installation.md)
- [dangkhoa116/mzd-vietnav-hud](https://github.com/dangkhoa116/mzd-vietnav-hud): example of a safe installer around oem-aa-mod (md5 checks, `reset_board="no"`, rollback)
- [mazda3revolution — Android Auto & touchscreen while driving](https://www.mazda3revolution.com/threads/android-auto-touchscreen-while-driving.241000/) (forum: the AIO touch tweak does nothing for AA on v70/v74)

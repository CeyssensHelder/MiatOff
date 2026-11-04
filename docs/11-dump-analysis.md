# 11 — Analysis of the first dump (EU 74.00.324A, own MX-5)

> Source: `dumps/eu-74.00.324/001-full-up174s/` (full dump, 24-10-2026), local; do not publish.
> The dump was started right after a **cold boot**: the car had been standing for almost 2 days and the script started at uptime 135 s.
> Integrity check: **unchanged**, `errors.txt` empty.

## Equipment (from the owner)
DAB ✅ · navigation SD ✅ · Bose ✅ · Android Auto over cable works ✅ (retrofit hub with SD reader and 2× USB).

## Go / no-go

| Check | Result | Meaning |
|---|---|---|
| Firmware | **74.00.324A** | Target version of TouchTune and oem-aa-mod ✅ |
| `Common.js` | **stock** (`376b30a4…`) | TouchTune 1.2.1 recognises the file → **Phase 2: GO** ✅ |
| NVRAM `bus_bcm_` / `lvds_speed_restriction` | **do not exist yet** | Factory state. TouchTune 1.2.1 treats that as `enable` (fix for GitHub #3) ✅ |
| `/jci/aapa/blmjciaapa.so` | md5 **`486628ae…`** | Exactly the build oem-aa-mod's touch shim was made for (fixed offsets match) ✅ |
| `/usr/bin/aap_service` | md5 **`964e9af0…`** | Also the tested build ✅ |
| Active SM config | **`/jci/sm/sm.conf`** (`sm -f /jci/sm/sm.conf`) | Not a WCP unit. `sm_WCP.conf` exists, but is not used. A second EU ND1 on the same firmware (with wireless CarPlay) runs `sm -f /jci/sm/sm_WCP.conf`; everything else there matched this unit, so the installer now edits whichever config is active (`SM_WCP_TABLE`) |
| Existing `LD_PRELOAD` | none | No other mods active |
| Hash tools | `md5sum` + `openssl` (no `sha256sum`) | Good to know for every installer |

## Android Auto touch: what exactly has to change
**XMLs** (`/etc/aap_system_attributes.xml` and `_UCP.xml`, LF, uid/gid 1000, mode 775):
- The stock EU XMLs have **no `<touch_screen>` block**. That is why Mazda does not declare touch to the phone.
- The certificate paths are **identical** to those in oem-aa-mod's XMLs, so that risk falls away.
- oem-aa-mod's XMLs change more than touch:
  - the `MEDIA_PAUSE` keycode;
  - the video elements `par`/`fps`/`decoder_additional_depth` in a different place;
  - the navigation subscription set to `TRUE` (for the HUD, which the MX-5 doesn't have).
- **Minimal change:** only insert the `<touch_screen>` block directly after `<input_devices>`, with the values per file
  as oem-aa-mod has them (`use_internally` = `true` in the main file and `false` in `_UCP`). Everything else stays stock.
  Which of the two files a non-WCP unit reads has not been proven; hence modify both, just as oem-aa-mod does.

**`sm.conf`**, line 297, the `jciAAPA` block:
- The block is clean: one line per tag, no `environ_var`, `reset_board="yes"`, `retry_count="0"`.
- Needed: one line `<environ_var env_name="LD_PRELOAD" env_value="/data_persist/oem-aa-mod/libpatch-blmjciaapa.so"/>`
  directly under the `<service …>` line.
- Optional: `reset_board="no"` on that line. A crashing shim then does not restart the whole unit (vietnav does this too).

**`/data_persist/oem-aa-mod/`**: `libpatch-blmjciaapa.so` (from release 0.10.0, verified) plus our own
`libpatch.conf` with only `touch = true`. HUD, protocol 1.6, audio fix and `block_headunit_media_play` are off.

> Installation method for Phase 3: the [AA-touch stick](../aa-touch-stick/README.md) (USB, TouchTune launcher), with
> `reset_board="no"` and a fully written-out `libpatch.conf` (missing keys fall back to defaults that are
> `true` for `hud` and `mute_pauses_phone`).

## Boot profile (cold start, start time per process)
| t (s) | What |
|---|---|
| 3 | compositor (`wayland-viv-compositor`), `vim_app` |
| 8 | Service Manager `sm -f /jci/sm/sm.conf` |
| **13.6** | **`opera`** (HMI). So the menu comes up quickly; the stock measurement of 48 s "touch-ready" does not seem to apply here |
| 17–18 | radio, DAB, CD, aux, `jciMMUI` |
| 22 | `bds` (Bluetooth stack), `jcinavi`, `JVMM` |
| 30–32 | `jciPA`, `jciBCA` (Bluetooth connection) |
| 32.9 | `devicemanager`, `mfid` |
| **36.0** | **`aap_service` + `jciAAPA`** (Android Auto available) |
| 38–50 | navigation engine, NMS, TTS, voice (`natp`) |

**Critical chain to Android Auto:**
`jciAAPA` ← `devicemanager` ← `mfid` ← `jciBCA` (Bluetooth) ← `stage_bt` ← `stage_3` ← `jciMMUI`, plus `bds` and `jciPA`.
So Android Auto waits on the **Bluetooth stack** (22 → 32 s). That gap is in the startup of `bds` itself,
not in a `sleep`. The `sleep 2` lines from the research (docs 04) are in `jci-wifiap.sh` (wifi hotspot) and are
not relevant for Android Auto over the cable.

**Core affinity is an ordinary config value:** `sm.conf` has an `affinity_mask` per service. Core 2 (`0x02`) already holds
`Opera`, `aap_service`, `carplayd`, `NNG` (navigation) and `JVMM`, among others. `jciAAPA` itself has no mask.

## Trimming services: revised
| Service | Start | Dependents | Verdict |
|---|---|---|---|
| `jcidvd`, `jcitv` | 32.9 | none | Candidate, *if* there is no DVD/TV (not visible on USB). Check |
| `blm_ira_pandora`, `blm_ira_stitcher` | 34 | none | Candidate (NA services) |
| `jciXMMGR`, `jcixm` | 17 / 30 | none | Candidate (SiriusXM, NA) |
| `jciSXMS` | 9.7 | `jciXMMGR`, `jciXMDATA`, `jcixmad` | Only together with those three |
| `blm_ira_aha` | 33 | **`stage_wifi`, `stage_vr`, `stage_gap2`** | **Do not just disable**: that breaks the stage chain (voice!). Possible together with decoupling those three (let them wait on `stage_ir`) |
| `jciCD` | 17 | **`jciMMUI`** | **Do not disable**: the HMI depends on it |
| `jciCARPLAY` (+ `carplayd`) | 36 | **`stage_vr`** (→ `natp`, voice), `jcibteca` | **Do not disable**, even without an iPhone: the voice chain waits on it. It is the largest consumer though (8.8 s CPU) |
| `jciDAB`, `jcinavi`, `jciRadio` | | | **Keep** (DAB, navigation and radio are used) |

The "candidates" without dependents (DVD, TV, SiriusXM, Pandora, Stitcher) are included as **boot trim** in the
[AA-touch stick](../aa-touch-stick/README.md) (menu EXTRA → TRIM, `autorun="no"`, reversible). Aha is in it as a second
level (WITH AHA): `blm_ira_aha` off, and `stage_gap2`/`stage_vr`/`stage_wifi` wait on `stage_ir` instead of on
Aha. Those are the only four references to `blm_ira_aha` in the text files of the dump (binaries not searched).
Mazda voice (`natp`) cannot go: `jciTTSPlayer` depends on it, and behind that `jciPB`, `jciMSG` and `jcibteca`
(calling via Bluetooth).

**Critical path to `jciAAPA`, with start times (24-10, checked after AA touch installation):**
`settings` 8.5 → `jciVBS` 9.7 → audio 14.7–16.6 → `jciRadio` 17.1 → `dmserver` 18.2 → **`bds` 22.0 → `jciPA` 30.3**
→ `jciBCA` 32.1 → `mfid` 33.1 → `devicemanager` 32.9 → `aap_service`/`jciAAPA` 36.0.
The 8 s gap is in the startup of the Bluetooth stack (`bds`; `stage_bt` and `emmc_mount` are already done around 22.8 s).
The hub's USB ports are only enumerated around **30.9 s** (the phone appears at 32.8 s). None of
the trim candidates is on this path.

**After the trim (dump 002, cold start 27-10-2026, trim with Aha + AA touch):** menu (`opera`) 12.6 s (was 13.6),
navigation 33.0 s (was 38.5), vehicle services (`jciblmVdt`) 32.8 s (was 36.6), voice 47.7 s (was 49.8), calling
(`jcibteca`) 52.7 s (was 54.5). Android Auto (`jciAAPA`) 37.0 s (was 36.0): within the noise of a single measurement, but
possibly also because navigation and vehicle services now run around 33 s. All trimmed services no longer run.

**Honest conclusion:** all candidates together use ~**3.3 s CPU** and ~**77 MB RAM** over the whole session. They
start after the HMI (≥ 30 s) and share the CPU with the Android Auto chain. Switching them off presumably yields only a
few seconds. The menu already appears at 13.6 s. **Phase 5 has a low priority for this car.** The real
gain is in touch in Android Auto (Phase 2 + 3).

## Next steps
1. **Phase 2 — TouchTune 1.2.1** (verified ZIP in `vendor/touchtune/`): all preconditions are OK. Use your own
   empty FAT32 stick.
2. **Phase 3 — touch in Android Auto**: the changes are determined exactly above and are included in the
   [AA-touch stick](../aa-touch-stick/README.md). Ready to test in the car.
3. **Phase 5**: only as an experiment (e.g. `jcidvd`/`jcitv` + Pandora/Stitcher), one at a time, with measurement.

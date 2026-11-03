# 03 — Touch while driving: TouchTune (the foundation)

## TouchTune — verified deep-dive (main source for our touch feature)
**Licence:** **GPL-3.0-or-later** (`LICENSE`, `NOTICE`, `DISCLAIMER.md`; builds on
the MZD-AIO community, credited in `NOTICE`). **Latest release:** v1.2.1 (22 Sep 2026). Bench-tested on a
2019 CX-5 CMU (NA 74.00.324A). Target FW: **74.00.324 / 74.00.324A**; refuses other versions and unknown modifications.

### Repo structure (verified)
- Folders: `docs/`, `launcher/`, `tests/`, `tools/`, `usb/`
- Installer code:
  - `usb/install-patches.sh`
  - `usb/patches/touch-while-driving.sh`
  - `usb/lib/touchtune-helpers.sh`
- Also: `CHANGELOG.md`, `SAFETY.md`, `VERSION`, `macos-usb-eject.sh`, host tests via `./tests/run.sh`
- Autorun via a `*.up` file in the USB root (this is how the Mazda update scanner starts the installer).

### What exactly it changes (verified from the scripts)
It touches **only two things**:

**1. Comment out one line in `Common.js`** (awk transform `mzd_transform_common`, install mode):
```
"Global.AtSpeed" : this._AtSpeedMsgHandler.bind(this),
→  // MZD_TOUCH_WHILE_DRIVING "Global.AtSpeed" : this._AtSpeedMsgHandler.bind(this),
```
This means the "speed reached → touch off" handler is no longer registered. Uninstall matches the commented line
and restores the original.

**2. Two NVRAM keys set to `disable`** (via the factory setters, `mzd_set_touch_nvram`):
| Key | Install | Factory | Setter |
|---|---|---|---|
| `bus_bcm_speed_restriction` | `disable` | `enable` | `set_speed_restriction_config.sh` |
| `lvds_speed_restriction` | `disable` | `enable` | `set_lvds_speed_restriction_config.sh` |

The setters live under `$MZD_JCI_SCRIPTS`; the value is read back from `$MZD_NVRAM_DIR/keys/<key>` and verified
(accepts only `enable`/`disable`).

### Robustness (blueprint for MiatOff)
1. Builds a **complete** replacement `Common.js` as `.Common.js.touchtune.new` in the same directory (the rename stays on one
   filesystem).
2. **fsync** + checks a **SHA-256** (`MZD_PROFILE_PATCHED_SHA256 = 019eba18…`), keeps the original **mode/uid/gid**.
3. **`mv -f`** over the live file, then fsync of the directory + hash/mode/uid/gid recheck.
4. **Backup** of the original in `/data/touchtune/backups/common-js`.
5. If a step fails → `rollback_touch_transaction` puts `Common.js` + both NVRAM values back to the entry state. A
   failed install does not request a restart.
6. In-car options: **INSTALL / REPAIR / REMOVE / CANCEL**. REMOVE only touches TouchTune's own backup.

### Why this is our foundation
- **Surgical** (1 JS line + 2 official settings) → low brick risk, and **no** wireless CarPlay breakage (does not put
  old system files back, unlike MZD-AIO).
- GPL-3.0 → if we build on it, MiatOff becomes copyleft too (see [docs/07](07-risks.md)).
- The install/verify/rollback structure can be reused directly for our **boot tweaks**.


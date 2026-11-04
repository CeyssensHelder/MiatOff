# MiatOff AA-touch stick (Phase 3: touch in Android Auto)

A USB stick that turns on touch in Android Auto on **this** MX-5 (Mazda Connect Gen-6, FW **74.00.324A**), using
only the touch shim of [oem-aa-mod](https://github.com/VitaliyKurokhtin/oem-aa-mod) 0.10.0. The requirements are in
[docs/12](../docs/12-handoff-aa-touch.md), the facts in [docs/11](../docs/11-dump-analysis.md).

## What changes on the unit (and nothing else)
| File | Change |
|---|---|
| `/etc/aap_system_attributes.xml` | `<touch_screen>` block directly after `<input_devices>`, `use_internally` = `true` |
| `/etc/aap_system_attributes_UCP.xml` | The same block, `use_internally` = `false` |
| `/jci/sm/sm.conf` (line 297, `jciAAPA`) | `reset_board="yes"` → `"no"`, plus one line `<environ_var env_name="LD_PRELOAD" env_value="/data_persist/oem-aa-mod/libpatch-blmjciaapa.so"/>` |
| `/data_persist/oem-aa-mod/` | `libpatch-blmjciaapa.so` (release 0.10.0, unmodified) and [`libpatch.conf`](stick/libpatch.conf) |
| `/data_persist/miatoff/aa-touch/backup/` | Copy of the 3 stock files (read-only) |

Separately, only if you choose them (menu **EXTRA**): the boot trim (`sm.conf`, EXTRA → TRIM), removing
the startup warning (`/jci/gui/apps/system/js/systemApp.js` + stock copy `systemApp.js.stock`, EXTRA →
WARNING) and **Meters** (gauges under Applications, EXTRA → METERS). See the sections below.

File permissions stay as stock (`775`, uid/gid `1000`). `Common.js`, NVRAM, the audio, the navigation and the HUD
are not touched. In `libpatch.conf` **every** key is written out: a missing key falls back to the built-in
default, and that is `true` for `hud`, `mute_pauses_phone` and `hud_fold_latin`. Here everything except `touch`
is `false`.

## How it stays safe
- **Refuses on an unknown state.** Every file is recognised by its exact sha256: stock or patched. The
  firmware must be `74.00.324A`, `blmjciaapa.so` and `aap_service` must be the analysed builds, the Service
  Manager must be running on `sm.conf` (not `sm_WCP.conf`), and `/data_persist` must be the writable mount. If
  one thing differs, nothing changes and the state with all hashes goes into `aa-touch-state.txt`.
- **No half-installed state.** Every file is staged next to its target, checked and replaced with a single
  `mv` (TouchTune style). The order ensures every intermediate state boots normally with working Android Auto:
  1. stage the backup and the shim as `libpatch-blmjciaapa.so.off` (nothing loads that);
  2. the two XMLs (touch declared; without the shim that does nothing, like the old AIO tweak);
  3. `sm.conf` (an `LD_PRELOAD` pointing to a missing file is ignored by glibc 2.11, only a warning);
  4. only last: `.off` → `.so`. That one `mv` on `/data_persist` turns touch on.

  Removing goes in reverse order: shim off first. If a run is aborted (ignition off), the script recognises
  the intermediate state next time and offers **FINISH** or **REMOVE**. If a step fails
  during installing, the script puts everything back to stock itself.
- **Never a boot loop through the shim.** With `reset_board="no"` on `jciAAPA` the Service Manager does not restart the
  whole unit when the shim crashes or hangs. At most Android Auto drops out until the next start (the `sm` binary
  otherwise literally reports: *configured as reset_board="yes" exited. Stop pinging watchdog*). No other service
  depends on `jciAAPA`. The shim itself also checks the code it patches and aborts on a deviation
  (`prologue mismatch … ABORT`).
- **Fast disable.** **DISABLE** only renames the `.so` on `/data_persist` (no root remount).
  After the restart Android Auto is stock again, but the XMLs and `sm.conf` stay patched. **ENABLE** reverses
  that. **REMOVE** puts everything back byte-exact and cleans up `/data_persist/oem-aa-mod` and
  `/data_persist/miatoff`.
- Root is only mounted read-write for the 3 config files, with the watchdog off (like TouchTune), and afterwards
  read-only again with the watchdog on. After every successful action the script requests a Mazda **SafeReboot**.

## Boot trim (menu EXTRA → TRIM)
Independent of AA touch, the stick can switch off 8 services for things this European MX-5 doesn't have. In `sm.conf`
each of those services goes from `autorun="yes"` to `autorun="no"`; nothing else changes.

| Service | What for |
|---|---|
| `jcidvd`, `jcitv` | DVD player, TV tuner |
| `jciSXMS`, `jciXMMGR` | SiriusXM (North America) |
| `blm_ira_pandora`, `irs_server` | Pandora |
| `blm_ira_stitcher`, `irsstitcher_server` | Stitcher |

- In `sm.conf` nothing depends on any of these services (the XM data and XM audio services are already
  `autorun="no"` in stock). Stock already uses `autorun="no"` for 7 services, including the navigation, which is started on request.
- Expected gain is small: together about 2 s CPU and 45 MB memory (measured in the first dump). Android Auto does not get faster from it (it
  waits on Bluetooth and USB, see docs/11); the menu perhaps a fraction.
- **WITH AHA** (trim level 2) additionally switches **Aha** (`blm_ira_aha`) off. Three boot phases wait on Aha in stock:
  `stage_gap2` (vehicle services such as warnings), `stage_vr` (voice, read-aloud, phone book, calling) and
  `stage_wifi`. For those three the wait line `value="blm_ira_aha"` is replaced by `value="stage_ir"`. Aha itself
  also waited on that, so the order stays the same (about 1 s earlier). These are the only four references to
  `blm_ira_aha` in the text files of the dump (the binaries were not searched). Without that decoupling
  those phases would never start.
- The trim is made of five independent groups: DVD/TV, SiriusXM, Pandora, Stitcher and Aha. `sm.conf` therefore has 64
  exact variants (AA touch off/on × 32 combinations of the groups), all pinned by sha256 in `SM_TABLE` and checked in the
  tests against an independent Python implementation. The in-car TRIM menu offers the three common levels (off, the four
  groups, all five); single groups are chosen in the PC builder's plan. Every action only changes its own part:
  installing or removing AA leaves the trim, and vice versa. A trim change is one atomic `mv`; an aborted run leaves
  `sm.conf` unchanged and REMOVE cleans up the rest.
- **After WITH AHA, test:** voice via the steering wheel (in Android Auto), calling, the phone book, and whether
  warnings from the car still appear. If something doesn't work: EXTRA → TRIM → **AHA BACK** (only Aha on again) or
  **RESTORE**.
- **Mazda voice** (`natp`) stays: the read-aloud service depends on it, and behind that the phone book, messages and
  calling via Bluetooth.

## Startup warning (menu EXTRA → WARNING)
Removes the warning ("disclaimer") at startup, like MZD-AIO's "No More Disclaimer". Details and how the
original works are in [docs/05](../docs/05-ui-tweaks.md).
- **One file:** `/jci/gui/apps/system/js/systemApp.js`. Not `Common.js`, so TouchTune doesn't notice.
- **The change:** the `"Disclaimer"` context block becomes a continuation of the startup logo (`NoCtrlTmplt` with the
  logo surfaces, like the stock `IntroAnimation`). A new function `_noMoreDisclaimer` immediately sends
  `Global.Yes` (like pressing AGREE) and `NotifyDisclaimerEnd`.
- **Safety net:** if the screen stays up anyway, Mazda's original timer ends it after 3.5 s, as in stock.
- **Same safety as the rest:** the file must be exactly the analysed stock file (sha256), the
  result exactly the expected one (sha256), with one atomic `mv`, and a stock copy in
  `/data_persist/miatoff/aa-touch/systemApp.js.stock`. RESTORE gives back the byte-exact original.
- **Tested:** the modified file is valid JavaScript (`node --check`).

## Meters (menu EXTRA → METERS)
Puts **Meters** under **Applications**: the gauges from `meters/`, fed by the collector. How the app gets into the menu
is in [meters-app/README.md](../meters-app/README.md), the research in [docs/13](../docs/13-gauges.md).

| On the unit | Change |
|---|---|
| `/jci/gui/apps/miatoff/` | New folder: the app, the Meters page, the collector, and the symlink `meters/live.txt` → `/tmp/miatoff/live.txt` |
| `/jci/opera/opera_dir/userjs-miatoff/` | New folder: the userscript `miatoff-apps.js` |
| `/jci/opera/opera_home/opera.ini` | `User JavaScript=0` → `=1`, below it `Allow File XMLHttpRequest=1`, and `User JavaScript File` to `userjs-miatoff/` |
| `/jci/scripts/stage_gap2.sh` | One comment line and one line that starts the collector (only if it exists) |
| `/data_persist/miatoff/aa-touch/` | Stock copies `opera.ini.stock` and `stage_gap2.sh.stock` |

- **Same safety as the rest:** `opera.ini` and `stage_gap2.sh` must be exactly the stock files (sha256),
  the result exactly the expected one, each with one atomic `mv`. The app files are listed with their sha256 in
  `miatoff-app/MANIFEST` on the stick and are checked before and after copying. A folder is staged next to its target
  (`.miatoff.new`) and put in place with `mv`.
- **Order:** first the app, then the userscript, then `stage_gap2.sh`, last `opera.ini` (only then does Opera load
  the script). Removing goes in reverse. An aborted run gives the state *incomplete*; the stick then offers
  **REPAIR** or **REMOVE**. An error during installing puts everything back to stock.
- **Updating:** if the stick holds a newer Meters than the unit, the state is also *incomplete*;
  **REPAIR** puts the new version on.
- **Stop the collector first:** the collector runs from the app folder and keeps its script open. Before REPAIR or
  REMOVE the stick stops it cleanly (its own stop procedure; `smdb-read` is never interrupted), otherwise
  root cannot go back to read-only ("busy", seen in the car on 28-10-2026 with 1.4.0). After the restart
  `stage_gap2.sh` starts it again. If read-only still fails while everything is right, the unit simply restarts (root is
  read-only again after the restart) instead of stopping with "failed".
- **Touches nothing else:** Meters leaves AA touch, `sm.conf`, `Common.js` (TouchTune) and the startup warning
  alone, and vice versa. **REMOVE** of AA touch leaves Meters in place.

| Meters now | Buttons |
|---|---|
| not installed | **INSTALL** / CANCEL |
| installed | **REMOVE** / CANCEL |
| incomplete or older than the stick | **REPAIR** / **REMOVE** / CANCEL |
| unknown | a message only; nothing happens |

### Emergency route: `MIATOFF-RESTORE`
Meters and the warning patch change the Mazda menu itself (Opera). If something goes wrong there, the stick's
dialog may no longer appear. Therefore:
- Put an **empty file `MIATOFF-RESTORE`** in the root of the stick. The script then puts Meters and the
  warning patch back to stock **without a dialog** and restarts the unit. AA touch, TouchTune and the trim stay in place.
  If there is nothing to restore, it does nothing (no restart). Remove the file afterwards.
- If the dialog fails while Meters or the warning patch is installed, the script tries again after 10 s.
  If that fails too, the same emergency route follows.

## One stick for TouchTune and AA touch
The stick holds the **unmodified** TouchTune 1.2.1 release in `touchtune/` (byte-identical to
`vendor/touchtune/TouchTune-1.2.1.zip`, checked against the `.sha256`). TouchTune cannot sit in the root next to
another launcher (it then refuses), but it does run from that subfolder: it checks its own payload there,
the firmware and `Common.js`, writes `touchtune/touchtune.log` and requests the restart itself. The AA-touch script
starts TouchTune only if you choose it, and only if Android Auto is still stock.

- **Step 1 (TouchTune):** touch while driving in the Mazda menus. Only changes `Common.js` and 2 NVRAM keys.
- **Step 2 (AA touch):** touch in Android Auto (the table at the top).

The two touch no common files. Removing goes in reverse order: first AA touch, then
the stick offers **REMOVE TT** (TouchTune's own REMOVE).

## Plan from the PC builder (`miatoff-plan.txt`)
`python miatoff_gui.py` writes your choices to the stick as `miatoff-plan.txt`, one `key=value` per line:
`touchtune`, `aa_touch`, `meters`, `warning`, `trim_dvdtv`, `trim_sirius`, `trim_pandora`, `trim_stitcher` and
`trim_aha` take `install`, `remove` or `keep`. In the car, the dialog first offers the next step that differs from the unit's current state
(**INSTALL** or **REMOVE**, and **CANCEL**). Removals come first (AA touch before TouchTune), then installs (TouchTune
before AA touch). All boot trim choices of the plan are one step (one `sm.conf`, one restart), so a stock unit with
everything chosen takes five steps: TouchTune, boot trim, startup warning, Meters, touch in Android Auto. Each step is confirmed and restarts the unit; leave the stick in for the next one. A stick with a
plan has no menu: it offers the plan's next step, and says "Your plan is complete" when nothing is left. A half-finished
install still gets its recovery dialog (FINISH / REMOVE, REPAIR / REMOVE). To get the menu below, build a stick without a
plan or delete `miatoff-plan.txt`. An invalid plan is ignored, and with no plan the stick behaves exactly as described here.

## Making the stick (Windows, macOS, Linux)
1. Take a stick (≤ 32 GB, **FAT32**, **MBR**) without any other kit on it: the builder refuses a stick with a
   different launcher or `.ID` in the root.
2. Build the stick (replace `E:\` with the stick's drive letter on Windows, or use its mount root such as
   `/Volumes/MAZDA` on macOS or `/media/you/MAZDA` on Linux; the builder refuses anything that is not an external FAT32 volume):
   ```bash
   python aa-touch-stick/build_stick.py E:\
   ```
   The builder checks the oem-aa-mod ZIP against `vendor/oem-aa-mod/SHA256SUMS`, the TouchTune ZIP against its
   `.sha256`, and the shim and `libpatch.conf` against the hashes in `aa-touch.sh`. Then it writes 41 files
   (including `miatoff-app/` with the Meters files and their `MANIFEST`) and reads them back. Check again later: `python aa-touch-stick/build_stick.py --check E:\`.
3. Eject the stick safely.

## In the car
1. **Engine on**, wait for the home screen. Do **not** connect the phone yet.
2. Insert the stick into the hub. First a choice menu appears with the current state: **ANDROID AUTO** / **EXTRA** /
   CANCEL (except after an interrupted AA run: then the FINISH dialog comes straight away).
   - **EXTRA:** first **TRIM** / **WARNING** / **METERS**.
     - **METERS:** see [Meters](#meters-menu-extra--meters). The unit restarts afterwards.
     - **WARNING:** **REMOVE** (the startup warning is skipped) or **RESTORE**. The unit restarts
       afterwards. See [Startup warning](#startup-warning-menu-extra--warning).
     - **TRIM:** the buttons depend on the trim. The unit restarts afterwards.

     | Trim now | Buttons |
     |---|---|
     | off | **DISABLE** (without Aha) / **WITH AHA** / CANCEL |
     | on, without Aha | **RESTORE** / **ALSO AHA** / CANCEL |
     | on, with Aha | **RESTORE** / **AHA BACK** / CANCEL |
   - **ANDROID AUTO:** the dialog depends on the state:

   | State | Buttons |
   |---|---|
   | everything stock | **TOUCHTUNE** (step 1) / **AA ONLY** / CANCEL |
   | TouchTune installed, AA stock | **INSTALL** (step 2) / **REMOVE TT** / CANCEL |
   | AA touch installed | **DISABLE** / **REMOVE** / CANCEL |
   | AA touch disabled | **ENABLE** / **REMOVE** / CANCEL |
   | interrupted run | **FINISH** / **REMOVE** / CANCEL |
   | unknown | a message only; nothing happens |
3. After **TOUCHTUNE**, TouchTune shows its own messages (English) and restarts the unit. Then insert the stick
   (again): now you get step 2. Test the touch in the Mazda menus first.
4. After the AA actions: wait for "… Remove the USB." The unit restarts itself. If the stick stays in, the
   dialog appears again after the restart (harmless, choose CANCEL).
5. If you ever see a **Mazda screen for a software update**: never confirm, cancel and remove the stick.

**First time: a dry run.** The first time, choose **CANCEL**. Nothing changes, but `miatoff-aa-touch.log` and
`aa-touch-state.txt` appear on the stick. They should say `overall: stock` and `TouchTune: stock`, and
"preflight OK" in the log.

The stick gets `miatoff-aa-touch.log` (everything the script did) and `aa-touch-state.txt` (the state with
sha256, permissions and owner of every file involved, before and after).

**Touch while driving:** step 1 (TouchTune) takes care of that. Whether `lvds_speed_restriction` also blocks
touch in Android Auto has not been proven yet (docs/10 §10). The log notes the value of that NVRAM key.

## Acceptance (docs/12)
- [ ] Tap, swipe, drag and the on-screen keyboard in Android Auto, stationary and while driving (no pinch).
- [ ] Rotary knob, steering-wheel buttons, voice, calling, radio/DAB, navigation and Bose as before.
- [ ] 3 cold starts and 3 normal starts without problems.
- [ ] DISABLE and ENABLE tested once.
- [ ] REMOVE tested once; a new dump afterwards shows the stock state again.
- [ ] A dump after the installation, to compare with the first one.

Meters, separately:
- [ ] Meters is under Applications, opens full screen, the rotary knob scrolls, back/home work.
- [ ] After leaving Meters the other apps and Applications work as before.
- [ ] The values move (the collector runs after a cold start).
- [ ] `MIATOFF-RESTORE` tested once (puts Meters back without a dialog).

The dump stick (1.0.1) now also shows the contents of `/data_persist` (before, only the symlink was there). That way you see
`oem-aa-mod/` and `miatoff/` after the installation, and their absence after removing.

## Recovery ladder if something doesn't work
0. The Mazda menu acts strangely after Meters or the warning patch: an empty file **`MIATOFF-RESTORE`** on the
   stick (see [Emergency route](#emergency-route-miatoff-restore)).
1. **DISABLE** with this stick (only a rename on `/data_persist`).
2. **REMOVE** with this stick (everything back byte-exact).
3. The unit comes up, but the state is "unknown": send `aa-touch-state.txt` and the log; force nothing.
4. Reflash EU 74.00.324A (docs/10 §8). Afterwards clean up `/data_persist/oem-aa-mod` and `/data_persist/miatoff`:
   a reflash may leave `/data_persist` in place, and an `sm.conf` without `LD_PRELOAD` no longer loads the shim.

## Testing without a car
```bash
python aa-touch-stick/tests/test_aa_touch_stick.py
```
```bash
MO_DOCKER_IMAGE=busybox:1.25 python aa-touch-stick/tests/test_aa_touch_stick.py
```
If the private dump is in `dumps/eu-74.00.324/001-full-up174s/`, the test uses the **real** stock `sm.conf` and
XMLs and the **production hashes** from the script; only the two AA binaries (not in the dump) get test hashes.
Without the dump (or with `MO_SYNTHETIC=1`) it runs on fabricated files.

Among other things, the test checks:
- installing, disabling, enabling and removing, with a **byte-exact** stock tree after removing
  (files and folders);
- a simulated power loss (`kill -9`) at every step of installing and removing: the config files are
  always stock or patched afterwards, the shim is never active without the rest, and FINISH or REMOVE completes it;
- an error halfway through installing: automatically back to stock;
- refusing without changing anything on: one byte difference in `sm.conf`, a modified XML, firmware 74.00.331, a
  different `blmjciaapa.so` or `aap_service`, `sm_WCP.conf` active, `/data_persist` read-only, foreign files in
  `/data_persist/oem-aa-mod`, a different shim version, and a damaged shim on the stick;
- that the awk edits in the script produce exactly the same files as a separate Python implementation;
- the boot trim with and without Aha: alone, combined with AA touch, and every transition between the levels
  (`sm.conf` is then always exactly the expected variant; another service waiting on `stage_ir` is left
  alone), a power loss during the trim, an error (nothing is left behind), and refusing on a modified
  trimmed `sm.conf`;
- the handover to the **real** TouchTune 1.2.1 (in its own test mode) from `touchtune/`: step 1, step 2,
  removing AA while keeping TouchTune, then REMOVE TT, and that TouchTune is not offered twice or too early;
- Meters (only under BusyBox in Docker, because it needs real symlinks): installing (`opera.ini` and
  `stage_gap2.sh` exactly patched, the folders exactly the stick files, the stock `fps.js` left alone), together with
  AA touch, the trim and the warning patch, removing to a byte-exact stock tree, a power loss at
  every step of installing and removing (Meters then becomes *incomplete*, AA touch is left alone), an error (back to stock), a damaged stick file, a modified `opera.ini`, updating to
  a newer version, REPAIR and REMOVE while the collector is running (stopped, no open deleted file,
  every `smdb-read` finishes by itself), and the emergency route `MIATOFF-RESTORE`.

The app and the userscript themselves have their own test: `node meters-app/tests/test_meters_app.js`.

**What is not tested:** the real CMU (BusyBox 1.19, `relfs`, `/bin/fsync`, `jci-dialog`, SafeReboot), and above all the
working of the shim itself. That comes from oem-aa-mod and was tested there on these builds. File permissions and owner
are not checked in the host test (Windows); on the CMU they are.

## Licence
`aa-touch.sh`, `libpatch.conf` and the builder: GPL-3.0-or-later (see `LICENSE`). Launcher, remount/watchdog and
SafeReboot follow Miatafy's TouchTune 1.2.1 (GPL-3.0-or-later); the complete TouchTune release is in `touchtune/` with its own
`LICENSE`, `NOTICE` and `SOURCE.txt`. `libpatch-blmjciaapa.so` is an unmodified binary
from oem-aa-mod 0.10.0 (**AGPL-3.0**); `NOTICE` on the stick states the source. There are no Mazda files on the
stick: the script only contains the hashes of the stock files and the lines it inserts.

# Guide for AI coding assistants

MiatOff builds USB sticks that tweak the Mazda Connect (CMU) head unit of a 2017 EU MX-5 ND1 (firmware 74.00.324A). The
scripts run on the car (BusyBox ash, no network); the tools and tests run on a PC. Read [README.md](README.md) first
for what the project does, then this file for how to change it safely.

## Layout

| Path | What |
|---|---|
| `aa-touch-stick/stick/aa-touch.sh` | The installer that runs **on the car**: state detection, the plan, every change. The critical file. |
| `aa-touch-stick/tests/` | Host simulator for it (fake car root, power-loss and failure injection). |
| `dump-stick/` | Read-only dump of the unit, and its tests. |
| `tools/check_dump.py` | Deterministic checker for a dump (uses the hashes pinned in `aa-touch.sh`). |
| `tools/stickkit.py` | Shared stick builder, launcher and USB drive inspection. |
| `tools/stickwriter.py` | Writes a kit to a stick: launcher last, what may be replaced or removed. |
| `tools/kits.py` | What goes on the check and install sticks, and the list of files in the packaged app. |
| `miatoff_gui.py` | The guided window; writes `miatoff-plan.txt`. Its decisions and wording are in `tools/stickflow.py` (no widgets, tested on its own), its look in `tools/stickui.py`. |
| `collector/`, `meters/`, `meters-app/` | Live vehicle data and the Meters gauges. |
| `dev/` | Synthetic drive → unchanged collector → real Meters UI; loopback-only preview ([dev/README.md](dev/README.md)). |
| `meters/designer/`, `tools/meters_designer.py`, `tools/meters_library.py` | Meters Designer: page editor and the builder's Custom pages library ([docs/15](docs/15-meters-designer.md)). |
| `meters/js/miatoff-home.js`, `tools/home_menu.py` | Home menu: the car's userscript that wraps Mazda's `MainMenuCtrl`, and the design validation, built-in menus and car files. It travels in the Meters payload; never edit Mazda's Home files ([docs/17](docs/17-unified-designer.md#home-menu-in-the-car)). |
| `meters/js/custom.js` | The car's ES5 port of the designer renderer for the CUSTOM group; pages come from the generated `custom-pages.js`. Keep it in step with `renderer.mjs` (a parity test checks). |
| `packaging/` | PyInstaller recipe and the check that a packaged app matches the source. |
| `vendor/` | Third-party releases, unmodified and checked by sha256. |
| `docs/` | Research. [docs/ai/HANDOFF.md](docs/ai/HANDOFF.md) and [docs/12-handoff-aa-touch.md](docs/12-handoff-aa-touch.md) are the briefs. |

## Rules that must not be broken

- **Never read, commit or publish `dumps/` or `miatoff-dumps/`.** They hold copyrighted Mazda files and personal data
  (they are git-ignored). Use `MO_SYNTHETIC=1` for fabricated test data.
- **Changes to the unit are surgical and hash-guarded:** exact sha256 of the stock or patched file, stage, verify, atomic
  `mv`, backup, rollback. An unknown state means "change nothing". Every intermediate state must still boot.
- **One action per run.** Each action leaves a valid end state and restarts the unit. The plan (`miatoff-plan.txt`) just
  selects the next action; it never batches unrelated files.
- **Never touch `Common.js`** in our own patches (it would block TouchTune's own repair/remove).
- **Pinned hashes live in `aa-touch.sh`.** `SM_TABLE` holds all 64 `sm.conf` variants; if you change an `sm.conf` edit,
  regenerate it from the Python implementation in the tests (`sm_table()`) and keep both in agreement.
- **Shell code must run on BusyBox 1.19 ash:** no bashisms, mind `awk`, `$(( ))` and `local`. Functions called inside
  `$(...)` must not print logs to stdout (use `>&2`), or the log text becomes their result.
- All user-facing text is English. Files use LF line endings (`.gitattributes`).
- Keep third-party notices intact (`NOTICE`, the vendored TouchTune zip is unmodified on purpose).

## Running the tests

```bash
MO_SYNTHETIC=1 python dump-stick/tests/test_dump_stick.py
MO_SYNTHETIC=1 python collector/tests/test_collector.py
MO_SYNTHETIC=1 python collector/tests/test_calibrate.py
python dev/tests/test_dev.py                                                        # needs native sh/gawk, or MO_DOCKER_IMAGE=busybox:1.25
python tools/tests/test_check_dump.py
python tools/tests/test_stickkit.py                                                  # Linux only (fixture paths contain ':')
python tools/tests/test_drives.py
python tools/tests/test_home_menu.py                                                  # Home menu designs, car files, library
python tools/tests/test_stickflow.py
python tools/tests/test_stickwriter.py
node meters-app/tests/test_meters_app.js
python tools/tests/test_meters_library.py                                             # Meters Designer library and GUI tab
python tools/tests/test_custom_pages_build.py                                         # custom pages in the Meters payload
node --test meters/tests/v3/*.test.mjs                                                # Meters Designer model, ES5 guard for meters/js
(cd meters/tests/v3 && npm ci && npx playwright test)                                 # Designer, car app and renderer parity in Chromium; see its README
#   set METERS_DESIGNER_URL=http://127.0.0.1:<port> and MIATOFF_METERS_LIBRARY=<temp file> when a designer server of yours runs on 8890
python aa-touch-stick/tests/test_aa_touch_stick.py                                   # uses the real dump if present, ~10 min
MO_SYNTHETIC=1 MO_DOCKER_IMAGE=busybox:1.25 python aa-touch-stick/tests/test_aa_touch_stick.py   # BusyBox + Meters scenarios
```

The shell-based suites need `sh` (Git Bash, WSL or Docker); they do not run in plain PowerShell. Nothing is tested in a real
car yet, so say so when you report results, and do not describe a feature as stable.

## Background

- [docs/README.md](docs/README.md): index of the research notes.
- [docs/ai/HANDOFF.md](docs/ai/HANDOFF.md): the reviewer brief, with the main uncertainties to challenge.
- [CONTRIBUTING.md](CONTRIBUTING.md): rules for human contributors.

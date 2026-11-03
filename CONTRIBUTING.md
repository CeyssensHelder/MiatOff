# Contributing

## Ground rules
- Never commit a firmware dump or any file copied from a head unit. `dumps/` and `miatoff-dumps/` are git-ignored; keep them that way.
- Changes to the head unit must stay surgical: exact-hash match on the stock file, stage, verify, atomic `mv`, backup, rollback. See `docs/08-approach-roadmap.md`.
- Anything that touches `Common.js` is out of scope (it would block TouchTune's own REPAIR/REMOVE).
- A feature is **Experimental** until it has been run on a real car and the acceptance list in its README is ticked.

## Running the tests
```bash
MO_SYNTHETIC=1 python dump-stick/tests/test_dump_stick.py
MO_SYNTHETIC=1 python collector/tests/test_collector.py
MO_SYNTHETIC=1 python collector/tests/test_calibrate.py
python tools/tests/test_check_dump.py
node meters-app/tests/test_meters_app.js
MO_DOCKER_IMAGE=busybox:1.25 python aa-touch-stick/tests/test_aa_touch_stick.py
```
`MO_SYNTHETIC=1` runs on fabricated files, so no private dump is needed. On Linux install `gawk` (Ubuntu's default `mawk` reads pipes in blocks and fails the collector test). The shell-script suites need `sh` (Git Bash,
WSL or Docker); they do not run in plain PowerShell, where you also set the variable with `$env:MO_SYNTHETIC = "1"`.

## Adding support for another firmware
Open an issue with the "Support a new firmware" template and attach `SUMMARY.txt` only. New hashes go into the pinned constants at the top of `aa-touch-stick/stick/aa-touch.sh`; the tests must keep passing and the new combination must be tested in a car before it is called supported.

## Licence
Contributions are GPL-3.0-or-later.

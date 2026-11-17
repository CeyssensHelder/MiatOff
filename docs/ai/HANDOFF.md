# HANDOFF: brief for a reviewer

MiatOff builds USB sticks that tweak the Mazda Connect (CMU) head unit of a 2017 EU MX-5 ND1 on firmware 74.00.324A
(ND2 on the same firmware also supported). It is for the owner's own car. Read [README.md](../../README.md) for what it
does and [AGENTS.md](../../AGENTS.md) for the layout, rules and tests.

## What exists

- A PC app (`miatoff_gui.py`) that builds a check stick or an install stick and writes a plan, `miatoff-plan.txt`.
- The on-car installer, `aa-touch-stick/stick/aa-touch.sh` (BusyBox ash), and a read-only dump stick plus a checker.
- Tweaks: touch while driving (TouchTune, vendored unmodified), touch in Android Auto (oem-aa-mod shim), boot trim,
  startup warning, list delay, camera text, parking graphics, Meters gauges, Meters Designer, Home menu, and an
  experimental shift sound.
- A host simulator for the installer (fake car root, power-loss and failure injection) under BusyBox.
- The research notes are in [docs/README.md](../README.md). They started as web research, then moved to a dump of our
  own unit ([docs/11](../11-dump-analysis.md)). [docs/12](../12-handoff-aa-touch.md) is the AA-touch brief.

## What was tested where

Source: [CHANGELOG.md](../../CHANGELOG.md). Nothing is described as stable.

- **In our ND1:** the dump, touch in Android Auto, boot trim, startup warning, shorter list delay, Meters, three
  custom Meters pages, the Home menu.
- **In a contributor's ND2:** the check, the install, the wireless CarPlay edits, camera safety text and parking
  graphics (our car has no reversing camera).
- **PC only:** the car setup (other engines, gearboxes, imperial units), the shift sound,
  the macOS and Linux downloads. Everything else is also covered by the simulator, which cannot replace a real unit.

## Safety design to challenge

- Every file is recognised by exact sha256 (stock or already patched). Unknown state means change nothing. The 64
  `sm.conf` variants are pinned in `aa-touch.sh` and must agree with the Python `sm_table()` in the tests.
- Each change is staged, verified, then swapped in with one atomic `mv`, with a backup and rollback. Every
  intermediate state must still boot. Is the ordering right, and is a power cut at every point really recoverable?
- One action per run: each run does one step, restarts the unit, and the plan only selects the next step.
- Meters data must never come from spawning `smdb-read` in a loop or killing one: that is suspected of locking SMDB so
  the Service Manager resets the unit ([docs/13](../13-gauges.md)). The collector is built around this; is it enough?
- Our patches never touch `Common.js`, so TouchTune's own repair and remove keep working.
- The Home menu is a userscript that wraps `MainMenuCtrl`; Mazda's Home files stay unchanged.
- Recovery: remove (byte-exact restore), the `MIATOFF-RESTORE` stick, last resort reflash of 74.00.324A.

## Main uncertainties

From [TODO.md](../../TODO.md) and the CHANGELOG "Not tested by us":

- (Meters lag and the rpm jump are reported fixed in the car.)
- Shift sound: does the unit play the sound file or only its own beep, and how loud over music.
- Consumption scale (`Drv1AvlFuelE`), and some scales still unknown (BrakePressure, DR_Slope).
- Bluetooth at startup: where v74 picks the start source is not found yet ([docs/14](../14-bluetooth-startup.md)).
- Only 74.00.324A is covered; other firmware and the ND3 are refused. Behaviour on cars other than our ND1 and the one ND2 is unknown.

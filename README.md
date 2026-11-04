# MiatOff

Open-source tweaks for the Mazda Connect infotainment in the **Mazda MX-5 (ND)**. You build a USB stick on your PC,
plug it into the car, and choose what to install. Every change can be undone, and the tool checks your car first and
refuses to touch anything it does not recognise.

> **Who this is for:** the **MX-5 ND1 and ND2** with the original Mazda Connect head unit on firmware **74.00.324A**
> (check *Settings → System → About → Version Information*). It is **not** for the **ND3** (2024 and later, a different
> head unit) or for any other firmware version. The tools check the car first and refuse to change anything else.

> ⚠️ **Early release.** Modifying a head unit can leave it unusable and is not covered by Mazda's warranty. You use this at
> your own risk. Read [Is it safe?](#is-it-safe) and the [support status](#support-status) first.

## What you can do

| Tweak | What it does |
|---|---|
| **Touch while driving** | The touchscreen keeps working in the Mazda menus while the car moves (uses TouchTune). |
| **Touch in Android Auto** | Tap, swipe and drag in Android Auto (uses the oem-aa-mod touch shim). |
| **Boot trim** | Stops things you don't use from starting at boot, each on its own: DVD/TV, SiriusXM, Pandora, Stitcher, Aha. |
| **Startup warning** | Skips the warning screen at startup. |
| **Meters** | Gauges under *Applications*: speed, rpm, G-meter, lap timer, fed by the car's own data. No OBD adapter needed. |

You choose per tweak: **Install**, **Remove** or **Leave as-is**. The tool never changes anything you did not pick.

## Support status

Only one combination has been analysed so far, and **nothing has been fully accepted in a car yet**.

| Firmware | Car | Feature | Status |
|---|---|---|---|
| 74.00.324A | EU MX-5 ND1 | Check my car (read-only dump) | Tested in the car |
| 74.00.324A | EU MX-5 ND1 | Touch in Android Auto, boot trim, startup warning | Experimental: tested on a simulator, in-car acceptance still open |
| 74.00.324A | EU MX-5 ND1 | Meters | Experimental: one in-car failure (busy root remount) was fixed but not re-tested |
| 74.00.324A | US-spec MX-5 ND1 | Not specified | Reported working by a user; not verified by us |
| 74.00.324A | MX-5 ND2 | everything | Same software as far as we know, but not analysed by us: run the check first |
| anything else | any | everything | Unsupported: the tools refuse to change anything |

Stay on firmware **74.00.324A** and do **not** upgrade to 74.00.331: it breaks wireless CarPlay more often and cannot be
rolled back. Check yours under *Settings → System → About → Version Information*.

Another car or firmware? Run the check (below) and open an issue with only `SUMMARY.txt` from the dump. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## What you need

- A PC with **Python 3** (including Tk, which the python.org installer has) and this repository
  (`git clone https://github.com/CeyssensHelder/MiatOff` or *Code → Download ZIP*). **Windows** is what we use. **macOS**
  also works (reported and tested by a contributor; the stick picker lists external FAT32/MBR volumes under `/Volumes`).
  **Linux** is supported in the code (vfat mounts under `/media`, `/run/media`, `/mnt`) but not yet tested by anyone.
- An **empty USB stick**, 32 GB or smaller, formatted **FAT32** with an **MBR** partition table.
- An **MX-5 ND1 or ND2** with Mazda Connect on firmware 74.00.324A (see the support status above). We analysed a 2017 EU
  ND1; a US-spec ND1 has been reported working. **Not** the ND3, and no other firmware.

## How to use it

1. **Open the builder:** `python miatoff_gui.py`, and pick your USB stick in the drive box.
2. **Check your car first** (tab *Check my car*):
   - Press **Build check stick**, put the stick in the car (engine on, home screen showing) and choose **FULL**. It only
     reads; it changes nothing. Bring the stick back.
   - Press **Read last dump**. You get a report that compares every file with the versions the installer knows, per
     tweak: *available*, *installed*, *blocked* or *not checked*. The same dump always gives the same report.
3. **Choose what you want** (tab *Install / remove*): per tweak *Install*, *Remove* or *Leave as-is*. Anything the car
   cannot take is greyed out after a check. Press **Build install stick**.
4. **In the car:** engine on, wait for the home screen, plug the stick into the USB hub. A dialog offers your next step with
   **INSTALL** (or **REMOVE**) and **CANCEL**. Each step restarts the unit; leave the stick in and the next step appears
   once the screen is back. When everything is done you see "Your plan is complete".

For a first try, choose **CANCEL** at the first dialog: nothing changes, but you get a log and a state file on the stick
that show the unit is recognised.

> Never confirm a Mazda *software update* screen. If one appears, cancel and remove the stick.

### Going back

- Choose **Remove** for the tweak and build a new stick; every change is restored byte for byte.
- If the Mazda menu misbehaves after Meters or the startup-warning tweak: put an empty file named `MIATOFF-RESTORE`
  in the root of the stick and plug it in. It puts those two back without any dialog.
- Last resort: reflash the official EU 74.00.324A firmware.

Details per stick, including exactly which files change on the car: [aa-touch-stick/README.md](aa-touch-stick/README.md).

## Is it safe?

MiatOff changes the **head unit only**. It never touches the engine computer or the CAN bus, and it needs no OBD adapter.

- **It refuses anything unknown.** Every file is recognised by its exact sha256, as stock or as already patched. A different
  firmware, a modified file or an unknown state: nothing is changed, and the state is written to the stick.
- **No half-installed state.** Each file is staged, verified and swapped in with one atomic rename, in an order where
  every in-between state still boots. A power cut or a failure is rolled back or finished by the next run.
- **Backups and byte-exact removal.** Stock copies are kept on the unit and removal restores them exactly.
- **No boot loops from the Android Auto shim.** A crash can at most switch Android Auto off, not restart the whole unit.
- **Tested without a car:** a simulator replays installs, removals, power cuts and failures under BusyBox, including against
  the real stock files. What it cannot cover is the real unit, so **start with the dry run** described above.

Touch while driving removes a deliberate distraction limit. Follow your local law and keep your eyes on the road.

## Troubleshooting

- **Nothing happens when I plug the stick in.** Look for `miatoff-aa-touch.log` (or `miatoff-dump.log`) on the stick. If it
  is missing the script did not start: check FAT32 + MBR, that only one such stick is plugged in, and that the home screen
  was showing.
- **"This unit differs from the analysed state."** The firmware or a file is not the known one. Nothing was changed. Run
  the check and see the report.
- **The dialog comes back every time I start the car.** The stick is still plugged in. Remove it.

## Documentation

| For | Where |
|---|---|
| Exactly what each stick does on the car | [aa-touch-stick/README.md](aa-touch-stick/README.md), [dump-stick/README.md](dump-stick/README.md) |
| The Meters gauges and their data | [meters/README.md](meters/README.md), [meters-app/README.md](meters-app/README.md), [collector/README.md](collector/README.md) |
| How the head unit works, research and design notes | [docs/README.md](docs/README.md) |
| What we plan to do next | [TODO.md](TODO.md) |

## Contributing

Bug reports, new-firmware reports and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Never
upload a firmware dump; it contains copyrighted Mazda files and personal data.

### Developing with an AI assistant

If you use an AI coding assistant, point it at [`AGENTS.md`](AGENTS.md) first: it explains the layout, the safety rules
and how to run the tests. Background and open questions are in [`docs/ai/`](docs/ai/).

## Credits and thanks

MiatOff stands on the work of the Mazda Connect modding community. Thank you to:

- **Miatafy** for **[TouchTune](https://github.com/Miatafy/TouchTune)**, the free, open-source (GPL-3.0) touch-while-driving
  tool. MiatOff ships TouchTune 1.2.1 unmodified, uses its launcher mechanism and its install/verify/rollback approach as
  the blueprint for everything else, and hands over to it for the touch-while-driving step.
- **Vitaliy Kurokhtin** for **[oem-aa-mod](https://github.com/VitaliyKurokhtin/oem-aa-mod)** (AGPL-3.0), the Android Auto touch shim.
- **Trevor G Martin (Trevelopment)** for **[MZD-AIO](https://github.com/Trevelopment/MZD-AIO)** and MZD_Speedometer, which
  TouchTune and the Meters menu integration build on.
- **jmgao** ([mazda-connector](https://github.com/jmgao/mazda-connector)) for the safe boot-hook pattern, **junoh-moon**
  ([mazda-aa-dr](https://github.com/junoh-moon/mazda-aa-dr)) for hard-won warnings about the vehicle data service, and
  **silverchris** ([Mazda CMU documentation](https://silverchris.github.io/mazda-cmu-documentation/)) for the boot and recovery notes.
- The security researchers at ZDI/Trend Micro whose public work documents how the unit boots.
- The **Chakra Petch** and **Share Tech Mono** fonts (SIL Open Font License).

See [NOTICE](NOTICE) for the exact licences. MiatOff is not affiliated with or endorsed by Mazda. It contains no Mazda files;
the scripts only hold the hashes of the stock files they expect.

## Licence

MiatOff is GPL-3.0-or-later; see [LICENSE](LICENSE). Because it builds on GPL-3.0 and AGPL-3.0 work, anyone who
redistributes it must keep the notices in [NOTICE](NOTICE) and provide the source.

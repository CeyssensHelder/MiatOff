# 14 — Bluetooth at startup and FM fallback

Research date: 2026-11-04. Target: EU 74.00.324A. **Feasibility remains open; no installer change and no in-car test.**
This review used project notes and public sources. It did not read `dumps/` or `miatoff-dumps/`, as prohibited by
AGENTS.md. Earlier TODO wording suggesting a dump inspection does not override that rule.

## What the evidence supports

Mazda's [version-55 FAQ, page 1](https://infotainment.mazdahandsfree.com/files/Mazda_SoftwareUpdateV55FAQ_USEnglish.pdf)
explains that the phone reconnects for hands-free operation before Bluetooth audio. If the phone responds too slowly,
the system falls back to FM instead of resuming Bluetooth audio. This establishes a documented mechanism on older
Mazda Connect software, **not proof of the exact implementation or timeout on v74**.

Our existing [boot analysis](11-dump-analysis.md) records radio starting at about 17 seconds, the Bluetooth stack at
22 seconds, and Bluetooth connection services at 30–32 seconds. These are process start times, not measurements of
audio readiness or the source-selection decision. They explain why ordering is worth investigating, but do not
establish that moving one service earlier would fix source restoration.

The public MZD-AIO implementation provides a concrete source-selection lead:

- Its [AIO app button handler](https://github.com/Trevelopment/MZD-AIO/blob/master/app/files/tweaks/config/aio-app/jci/gui/apps/_aiotweaks/js/mzd.js)
  sends `framework.sendEventToMmui("system", "SelectBTAudio")` when the Bluetooth button is clicked.
- The same request appears in its
  [CASDK app](https://github.com/Trevelopment/MZD-AIO/blob/master/app/files/tweaks/casdkapps/app.aio/app.js).

That is evidence of a community UI command, not a validated v74 startup hook. There is no evidence here that it can
select a disconnected device, suppress FM fallback, or automatically start playback. Those are separate questions.

MZD-AIO's [audio-order installer](https://github.com/Trevelopment/MZD-AIO/blob/master/app/files/tweaks/09_audioorder-i.txt)
replaces `systemApp.js` with firmware-specific resources and a configurable list-order prefix. It warns that the
tweak was tested only through 70.00.335 and offers a v70 file for later firmware. The
[builder list](https://github.com/Trevelopment/MZD-AIO/blob/master/app/assets/js/audioSourceList.js) exposes positions
for Bluetooth, FM and other sources. **Menu ordering alone is not evidence of startup-source priority.** We should
not install that older whole-file replacement on v74.

## Options and current verdict

| Option | Evidence and limitation | Decision |
|---|---|---|
| Select Bluetooth after its audio connection becomes ready | Public `SelectBTAudio` request exists; v74 readiness notification and boot hook unknown | Best first candidate to investigate; may still allow initial FM playback |
| Stay silent while waiting, then select Bluetooth | Meets the requested behavior; no verified FM-fallback suppression or source-specific audio-off command yet | Investigate alongside the selection request |
| Rewrite the remembered last source | Reconnection timeout may override it; storage key and lifecycle unknown | No implementation yet |
| Start Bluetooth services before radio | Existing stage dependencies and hardware readiness must be respected; timing alone proves no safe reorder | Do not change `sm.conf` on this evidence |
| Hide FM in the source list | Hiding a menu entry need not prevent backend fallback | Insufficient as an FM-disable solution |
| Disable `jciRadio` | Dependents, watchdog behavior, shared AM/FM functions and fallback behavior unverified | No safe FM-disable tweak established |

Bluetooth-first is therefore **plausible at the source-selection layer**, but neither strict Bluetooth-before-FM nor
FM disablement is established for our firmware. Disabling a service also does not itself tell the audio manager
what to do while a phone is unavailable.

## Next evidence needed

1. Identify the v74 source-restore decision, Bluetooth-audio-ready notification and a startup hook outside
   `Common.js`, using permitted public technical material or explicitly permitted on-unit investigation. Do not
   read the prohibited dump directories. Do not guess persisted keys or send exploratory write commands.
2. Establish whether the unit can retain Bluetooth as the selected source while disconnected, or suppress only
   automatic FM fallback while preserving manual FM selection. Find the exact silent-wait mechanism if available.
3. Before considering `jciRadio` disablement, establish the complete service dependency and watchdog graph and
   the behavior of a request for an unavailable radio source. Keeping the existing boot chain is preferable if
   source selection can solve the problem.
4. Prototype a bounded, one-time startup policy: wait for Bluetooth audio readiness, request the source once,
   and stop if the user chooses another source or phone projection starts. A fixed delay or continuous source
   forcing would not satisfy this behavior reliably. Define a finite wait and the no-phone outcome before coding.
5. Only after the exact v74 change is known, add Install/Remove with pinned hashes, stage/verify/atomic publish,
   stock backup and rollback. If the hook changes `systemApp.js`, account for both stock and startup-warning
   variants and both install/remove orders. Leave `Common.js` untouched.

Acceptance needs cold boot and warm restart, fast/slow/no phone, Bluetooth disabled, calls, manual source changes,
Android Auto/CarPlay handoff, FM/DAB behavior, removal and interrupted-install recovery. The simulator can exercise
our policy and installer, but cannot establish real Bluetooth timing or audio-manager behavior. **This feature has
not been tested in a real car.**

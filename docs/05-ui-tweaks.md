# 05 — UI tweaks: disclaimer & page delay

These are **not** boot services but timing values in the HMI (the Opera/JS UI). They come from the **MZD-AIO** lineage.
They work on 74.00.324 according to forum reports; note that AIO itself sometimes breaks wireless CarPlay (see [docs/07](07-risks.md)).

## No More Disclaimer
- Removes the warning screen at startup, **or** shortens its display from **3.5 s → 0.5 s** (that 0.5 s variant was
  later removed from AIO; "remove completely" remained).
- The disclaimer timer is in the **HMI JS**; the community names **`systemApp.js`** (forum report, still to be verified on the
  EU build).
- AIO keeps originals as **`.org` backups on the resources partition**.
- ⚠️ A Mazda service bulletin describes a bug where the system can **reboot during the disclaimer screen** →
  disclaimer edits can affect boot stability; test with a full power-down.

### On this unit (74.00.324A, dumps 001 and 003, 28-10-2026)
- File: **`/jci/gui/apps/system/js/systemApp.js`** (142,069 bytes, sha256 `23106b04…a022ca8e1`, LF, unchanged
  between dumps 001 and 003). `Common.js` (TouchTune) is not involved.
- How it works: the `"Disclaimer"` context block (l. 318) shows the text `DisclaimerText` with one button (`Global.Yes`).
  `_displayedDisclaimer` (l. 2476) starts a timer of **3500 ms**; when it ends `_disclaimerTimedout` itself sends
  `Timeout` to the MMUI, which closes the screen. That 3500 appears exactly **2 times** in the file
  (`this._disclaimerTime.remaining = 3500;`, l. 2483 and 2525).
- MZD-AIO did it in two steps ([Trevelopment/MZD-AIO](https://github.com/Trevelopment/MZD-AIO),
  `app/files/tweaks/02_disclaimer-i.txt` + `config/audio_order_AND_no_More_Disclaimer/`):
  1. first the timer **3500 → 500 ms** (the same two lines);
  2. later replacing the whole context block with an empty logo screen (`NoCtrlTmplt`) that immediately sends `Global.Yes`
     and `NotifyDisclaimerEnd`. For this AIO replaced the **entire** `systemApp.js` per firmware (tested up to v70;
     for v74 it itself asks "INSTALL AT YOUR OWN RISK").
- **Built (28-10-2026):** the full removal (AIO step 2) as a fixed edit of our own v74 file in
  the [AA-touch stick](../aa-touch-stick/README.md) (menu EXTRA →
  WARNING), with the original 3.5 s timer as a safety net. Modified file: sha256 `65bb9d50…5ada53`, valid
  JavaScript (`node --check`). Not yet tested in the car.

## Reversing-camera safety text
- 29 images `/jci/nativegui/images/SafetyText_<country>_<language>.png` (including `SafetyText_NL_Dutch.png`, 6,967 bytes);
  all 29 exist on this unit. MZD-AIO (`03_warning-i.txt`) replaces them with empty PNGs of 3,031 bytes.
- Only useful with a reversing camera.
- **Built (04-11-2026):** dump 1.4.0 copies and hashes them. A second EU ND1 has **46** SafetyText images (45 are
  800×50, `SafetyText_UK_Ukrainian.png` is 801×50; the blank is 800×50 and fully transparent, so that one pixel does not show); MZD-AIO only covers 29. All 46 are pinned in
  `SAFETY_TABLE` and replaced with MZD-AIO's blank (see the AA-touch stick README). Not yet tested in the car.

## Shorter Delay Mod (page delay)
- Shortens the wait on **page changes with the Commander knob** from **1.5 s → 0.3 s**.
- Split off from the "Improved List Loop" tweak (list wrapping).
- Also a UI timing value in the HMI (exact file/line still to be verified).

### Shorter delay: what MZD-AIO actually changes
`07_shorterdelay-i.txt` edits `/jci/gui/common/controls/List2/js/List2Ctrl.js`, not a page transition: the four
`autoscrollTier*` properties (1500/5000/500/1000 ms → 150/300/200/300). They time the auto-scroll while the
Commander is held tilted in a list. On 74.00.324A the four lines are byte-identical to AIO's patterns (one each);
**built (04-11-2026)** as a fixed edit with pinned stock/patched hashes. Not yet tested in the car.

## Related small tweaks (from AIO and similar tools)
- Camera warning text removed
- List wrapping / menu loops ("Improved List Loop")
- Backgrounds / colour schemes / status bar

## Status
| Known | Still to determine |
|---|---|
| Disclaimer: 3.5→0.5 s or removed completely; `.org` backups on resources | Exact JS file + line/regex on the EU build |
| Page delay: 1.5→0.3 s | Exact JS/CSS location |
| In the HMI JS (presumably `systemApp.js` for the disclaimer) | Confirm on our firmware |

> AIO's resource files with the exact edits are DMCA-blocked via GitHub (HTTP 451). The exact regex therefore has to
> come from the actual firmware files, not from the (blocked) AIO repo.

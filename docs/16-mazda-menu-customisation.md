# 16 — Customising the normal Mazda menu

The prototype now lives in the [shared studio](17-unified-designer.md). The notes below record the earlier
feasibility investigation. An experimental install now exists as a userscript in the Meters payload, which leaves
Mazda's files unchanged; see [docs/17](17-unified-designer.md#home-menu-in-the-car).

Research date: **6 November 2026**. Target: the original Gen-6 Mazda Connect on **74.00.324A**, EU MX-5 ND1.
Branch: `codex/mazda-menu-customisation`, based on `b9e32f9`. The existing uncommitted changes on `master`
(including Entertainment-source hiding) were not imported. This note concerns the factory **Home** menu;
it distinguishes that from recolouring every Mazda screen and from the separate Meters dashboards.

## Is it possible, and is it easy?

**Yes at the mechanism level. Basic appearance changes are a reasonable first feature; a complete home
editor with arbitrary shortcuts is a larger project. We do not yet have a verified v74 Home adapter.**

| Scope | Assessment | What still needs proving |
|---|---|---|
| Background, simpler button positioning, label colour | Relatively small visual experiment | Exact v74 files, selectors, image properties and stock hashes; effects outside Home |
| Custom labels, order and focus appearance | Moderate | Whether logical Commander order follows the visual positions; dynamic labels, control refresh and localisation |
| Meters shortcut or arbitrary destinations | Substantial | MMUI event/context routing and return behaviour; unavailable apps and factory hard keys |
| Multiple nested menus, per-button art, editor and safe updates | Substantial | Focus ownership, navigation stack, loading/memory budget, migration and recoverability |
| Recolour all Mazda screens | Separate, broader feature | Many shared PNG assets/controls and states, not one universal CSS accent variable |

The difficult part is validating the real control lifecycle and delivering a reversible install. An
attractive desktop preview does not establish either. No calendar estimate is justified before the
target-file and hook review.

## Evidence and its limits

### Miatafy: published product claims, not implementation evidence

[Miatafy Home](https://miatafy.com/miatafy-home/) currently advertises Home themes, backgrounds, custom
labels, destination/order changes and Commander navigation on Gen-6 v74.00.324. It describes an editor
and a USB-based restore to factory Home. This is useful feasibility evidence for the same firmware family,
but its public product page does not establish the injection hooks, changed files, or compatibility with
MiatOff. No commercial code or art was obtained or reused. This paragraph summarises vendor claims only.

### MZD-AIO: verified public installer mechanism

Reviewed at commit `409c724ed860497b2a34f9367cb4a019287846ea`:

- [`20_mainmenu-i.txt`](https://github.com/Trevelopment/MZD-AIO/blob/409c724ed860497b2a34f9367cb4a019287846ea/app/files/tweaks/20_mainmenu-i.txt)
  appends marked CSS to `/jci/gui/apps/system/controls/MainMenu/css/MainMenuCtrl.css`. Its rules affect the
  ellipse, coin size, focused coin transforms, label colour/visibility and glow. It selects alternative layouts.
- [`FlatLine.css`](https://github.com/Trevelopment/MZD-AIO/blob/409c724ed860497b2a34f9367cb4a019287846ea/app/files/tweaks/config/MainMenuTweaks/FlatLine.css)
  positions the application, communication, entertainment, navigation and settings elements with per-control
  classes, including focus/highlight positions. **Inference:** moving the artwork alone does not demonstrate
  a changed logical selection order or touch region; both need checking.
- [`00_background.txt`](https://github.com/Trevelopment/MZD-AIO/blob/409c724ed860497b2a34f9367cb4a019287846ea/app/files/tweaks/00_background.txt)
  replaces `/jci/gui/common/images/background.png`.
- [`21_theme-i.txt`](https://github.com/Trevelopment/MZD-AIO/blob/409c724ed860497b2a34f9367cb4a019287846ea/app/files/tweaks/21_theme-i.txt)
  copies a theme's `jci` tree wholesale. That is not an acceptable MiatOff installation strategy.

These scripts establish mechanisms in the older AIO lineage, **not** byte compatibility with 74.00.324A.
The shared background path also means a direct replacement may affect screens beyond Home. Exact PNG
dimensions and encoding have not been established here. No Mazda firmware files from AIO were read or copied.

### Existing MiatOff components

- [`meters-app/userjs/miatoff-apps.js`](../meters-app/userjs/miatoff-apps.js) demonstrates the project's
  guarded runtime wrapping pattern and MMUI integration for **Applications**. It does not verify Home hooks.
- [`docs/13`](13-gauges.md) records earlier v74 observations for that integration and `opera.ini`.
  This research uses those notes, not the private dump.
- [`aa-touch.sh`](../aa-touch-stick/stick/aa-touch.sh) already stages, verifies and restores the Opera
  configuration and the Meters userscript directory. Home must share ownership of this machinery; a second
  independent installer would risk removing Meters' loader or making its manifest appear unknown.
- Source hiding in the main checkout is an independent Entertainment-list experiment. Its `systemApp.js`
  hash combinations must be considered before any later Home implementation edits that same file.

## Do we have enough data to test it?

**Enough for design, validation and synthetic tests; not enough to claim a safe or visually correct car feature.**
No files under `dumps/` or `miatoff-dumps/` were read. This repository's rules prohibit that. Presence or
contents of an owner's old private captures have not been checked.

| Available from permitted repository material | Supports | Does not prove |
|---|---|---|
| Public AIO tweak scripts and CSS | Candidate paths, CSS-only first step | Exact current firmware content or hashes |
| Meters adapter and mock framework tests | Pattern for guarded hooks, originals and fallback | Home DOM, input handling or native context transitions |
| Synthetic stick simulator | Stage/verify/rollback, unknown-state refusal and interrupted writes | Real Opera rendering, filesystem behaviour or bootability |
| Existing FULL dump collector | Normally copies `/jci` JS/CSS/HTML below 2 MB and lists paths | Whether any particular past capture contains complete Home sources |
| New `inventory/home-menu.tsv` | On a **future** FULL run, sizes, attributes and hashes of MainMenu files and shared background | Image pixels/dimensions, DOM structure, runtime state or permission to install |

The existing text collector omits most images. It has a separate allow-list for camera/sensor images, not
Home artwork. `key-files.tsv` and the production installer do not currently pin Home CSS/JS/background
hashes. The new report hashes regular non-symlink files in the candidate MainMenu control directory and
the shared background, without adding image copies. A missing directory produces a header-only report;
unavailable hash tools produce `-`, never an implicit match. Existing synthetic fixtures remain fabricated.

Do not feed a dump to a new analysis tool to bypass the repository's access rule. Reviewing actual firmware
bytes later needs an explicitly permitted on-unit investigation or a change to the owner's access instructions.
Keep all captures private; a future review should share only the required metadata, not a full dump.

## The PC editor

The **Mazda Home** mode of the Designer ([docs/17](17-unified-designer.md)) replaces the earlier stand-alone
menu lab, which was never merged. It is an original offline editor and 800 × 480 mock-up. It supports
custom background images with fill/fit display, 1–12 editable items with separate normal and selected artwork,
custom names and destination choices, selection-order changes, and free placement by dragging or coordinates.
The initial five factory shortcuts can be removed or supplemented in the editor. Visual placement and Commander
selection order are independent. Presets use an automatic grid above five items.

The version 2 JSON embeds normalised PNG artwork and migrates earlier version 1 exports. Images are decoded
and resized locally, with bounded sizes/dimensions, and imported designs are applied only after all images
decode successfully. No supplied CSS, script, raw native event, remote URL or path becomes executable
configuration. Labels are inserted as text. These input limits are PC design choices, not measured CMU budgets.

This section describes the original prototype. The install that followed (docs/17) adds no plan key and no pinned
hashes: the menu travels in the Meters payload and its MANIFEST.
Its default symbols, DOM and navigation are synthetic. Supplied artwork stays on the PC. It does not include
Mazda or Miatafy assets. The destination catalogue includes factory menus, Meters, Bluetooth audio, FM/DAB,
Android Auto and CarPlay as design targets only. Their actual native routes/availability remain unverified;
the editor does not establish that any of these shortcuts can be installed. Arbitrary targets and nested menus
are deferred. A car implementation must preserve access to factory destinations before permitting removal.

The read-only dump change supplies metadata for the next investigation; it does not introduce a writer.
The existing car installer and USB install builder are unchanged on this branch.

## Proposed guarded implementation path

1. **Resolve the v74 Home surface.** Obtain the new metadata from a future read-only FULL run. In an
   explicitly permitted on-unit source review, identify `MainMenuCtrl.js`/CSS, templates, the Home context,
   selected/unselected asset dependencies and the functions called when Commander, touch and hard keys act.
   Check whether backgrounds are shared, and whether the Home lifecycle rebuilds labels or destroys styles.
2. **One fixed visual preset first.** Prefer a scoped, removable style attached to the actual Home control.
   If a CSS-only change suffices, a surgical edit to the known MainMenu CSS may be simpler than a new
   userscript. Choose only after verifying the actual control. Keep the stock event handlers and destinations.
   Do not ship the PC editor's modern CSS or assume its symbols render in Opera.
3. **Prove the install and recovery in the simulator.** Pin exact hashes in `aa-touch.sh`; require a known
   stock/managed state, verify the stock backup and staged output, publish atomically, and restore byte-exactly.
   Never modify `Common.js`. Keep one coherent action per run. For a userscript design, generalise ownership
   of `opera.ini`/the loader for Meters plus Home and test all four on/off combinations. Extend the no-dialog
   `MIATOFF-RESTORE` route before enabling Home. Interrupted installs must always leave a bootable state.
4. **Then editable themes.** Separate fixed trusted code from validated user data. For arbitrary themes,
   avoid a combinatorial static hash table: keep stock hashes pinned in `aa-touch.sh`, authenticate the
   selected generated payload through a verified manifest, record the managed installed hash, and reject
   unexplained edits. Design-switch/removal and backup corruption need their own recovery cases. Existing
   installers will need an explicit compatible state model; this has not been implemented.
5. **Finally labels/order/extra destinations.** Verify logical focus order and native routing independently
   from visual coordinates. Keep all factory destinations reachable; never invent MMUI event names. Meters
   shortcuts must use its established route and be unavailable when Meters is absent.

## Acceptance before enabling an install option

- Synthetic: missing hooks/assets/hash tools, unknown/corrupt stock or backups, malformed/oversize design,
  repeated runs, exact removal, each publish boundary interrupted, emergency restore and Meters coexistence.
- Browser: import/export round-trip, text escaping, all destinations reachable by keyboard and pointer,
  both layouts, longest allowed labels, readable selected state, failed imports preserve the last design.
- Actual unit, parked: default and modified Home, cold start/resume, clockwise/counterclockwise Commander,
  tilt/press/Back/Home, touch hit regions, hard Music/Nav/phone keys, transitions from other Mazda screens,
  incoming-call/parking-camera overlays, language changes, disabled destinations and real memory/load time.
- Regression: factory Applications/Settings, FM/DAB, phone/Bluetooth/Bose, navigation, AA/CarPlay and Meters.
- Recovery: remove once, recheck the exact stock hashes and confirm the original Home returns; exercise
  no-dialog restore with an intentionally disabled theme. Do not call it stable after a simulator pass.

The userscript install described in docs/17 worked on our car in a first test (10 November 2026). Test
outcomes are recorded in [docs/17](17-unified-designer.md#home-menu-in-the-car), not inferred from older
support-status claims.

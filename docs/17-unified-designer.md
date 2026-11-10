# Shared MiatOff Designer

Start `python tools/meters_designer.py` from this worktree and open the printed address. Existing addresses
open Meters. The **Meters | Home menu** tabs in the header switch between the two (or append `?mode=home`).
Both modes share that header: the main actions sit in the same places (Undo, Redo, Preview, Send to MiatOff,
Export, and the save status), and the Home designer uses the Meters layout: a tool panel on the left, the canvas
with its toolbar (+ Add item, Duplicate, Delete, layers, snap, fit) and Properties on the right; below 1200 px
its panels follow the canvas. Ctrl+Z / Ctrl+Y on the header reach the mode that is shown. In the desktop app, Home
has its own page, **Design your Home menu**, beside **Design your Meters** (`python miatoff_gui.py --menu`); both
use the one local designer. Keep the same port to return to browser drafts. The header shows the MiatOff app
icon (drawn inline, as in `packaging/make_icon.py`) and names the mode: MiatOff Meters Designer or MiatOff
Home Designer. The three desktop shell baselines were regenerated for this header and reviewed: only the
logo and name changed.

## Shared editing foundation

The modes share command/gesture history, transactional IndexedDB storage with revision/conflict checks and
retained originals, geometry/snapping, image normalization, preference storage and studio styling. Meters
wrappers preserve its original validation, storage namespace, builder API and deployment formats.

Each mode retains its controller and editing surface when hidden (Home uses a same-origin frame), preserving
selection and undo history. Switching cancels gestures, invalidates pending uploads/imports, pauses rendering
and flushes pending saves. In-memory edits remain exportable if saving fails. Home uses `miatoff-home-studio`,
separate from Meters' `miatoff-studio`; no Home document is sent to the Meters builder library.

## Mazda Home

Design one 800 × 480 screen with 1–12 items and name it (Menu name). Add, duplicate, delete, rename, choose a destination and upload
separate normal/selected icons. Missing selected artwork falls back to the normal icon. Backgrounds support
solid colours and local PNG/JPEG/WebP images with fill/fit. Artwork stays embedded in portable JSON.

Drag, resize at the lower-right handle, Shift-click for multi-selection, align/distribute, lock items and nudge
with arrows (Shift = eight pixels). Snap and Fit/100% preferences are saved independently. Undo/redo covers
layout, properties, artwork, imports and order. Narrow screens stack the panels below the canvas.

The numbered list sets **Commander order**; layer buttons set **drawing order**; coordinates set **placement**.
These are independent of each other and destinations. Design checks flag intersecting interactive items,
clipped captions and reserved screen strips. They do not establish driving safety.

Try menu exercises Previous/Next/Select/Back/Home, pointer activation and selected artwork. Destinations are
clearly simulated and hidden items are skipped. There are no nested menus or arbitrary URL/native-event
targets. Export design includes referenced artwork; Save preview PNG omits the editing selection and handles.

## Documents and recovery

`HomeMenuDocument`, version 1, contains a background, accent, items, explicit `order` IDs and an `assets` table.
Items carry geometry, destination, normal/selected asset references and lock/visibility flags. Old menu-lab
versions 1 and 2 import with their original 120 × 136 item dimensions. Meters files are rejected by Home.

Documents are limited to 8 MiB and images must decode before import is applied. Uploads are limited to 8 MiB
and 16 megapixels, normalized locally to PNG within 800 × 480 for backgrounds or 128 × 128 for icons.
WebP sizes are read from the file header, so the pixel limit applies before decoding. Artwork uploads go to
every unlocked selected item. Draft storage retains prior revisions. A conflicting tab pauses editing/autosave
until Load newer saved draft is used; Export design keeps a copy of the in-memory version. An unreadable draft
is not silently overwritten: **Export saved draft** saves it (with its artwork when that is still readable).
Recover with a new design retains the replaced draft, and its artwork is kept as long as it is retained;
**Export retained draft** gives it back. Only the first retained draft is kept, so a second recovery asks for
an export first. If Home cannot load, the Designer stays in (or falls back to) Meters and says so.

## Verification

Use `node --test meters/tests/v3/*.test.mjs`, the Python library/custom-build tests and the existing Chromium
harness with temporary drafts/libraries. `home.spec.mjs` covers switching/history, reload, conflicts, actual
normal/selected icon pixels, artwork export, pointer dragging, cancelled uploads and save failures. It captures
desktop/tablet/phone screens and checks preview PNG export. Meters renderer parity and canvas baselines remain
required. Three desktop shell baselines were individually reviewed for the new selector; no automatic snapshot
acceptance was used. The phone baseline remains unchanged.

After integrating `master` at `5d972db`, the three desktop shell snapshots were regenerated and individually
reviewed again to combine the mode selector with the updated crisp rendering. The phone and canvas baselines
follow upstream. CI now runs Home browser checks through `home-ci.config.mjs`, which owns its server and a
temporary library; these checks do not compare platform-dependent screenshots.

On 10 November 2026 the branch was rebased onto `master` after the packaged-app window (#13), with review
fixes: Import and New design now apply, Meters shortcuts are idle while Home is shown, recovery keeps and
exports the replaced draft, a failed Home load leaves Meters running, and WebP sizes are checked before
decoding. All 87 Chromium cases (8 of them Home), 58 JavaScript tests, 36 Python library tests and 9
custom-page build tests passed. No new real-car testing was performed.

Validation on 9 November 2026: all 82 Chromium cases, 50 JavaScript tests, 29 Python library tests and
9 custom-page build tests passed. The Home browser cases were rerun after the final recovery/resize changes,
including artwork re-import and retention of edited Meters data across mode switches. The Python build suite
emits existing unclosed-file ResourceWarnings; its assertions pass. Tests used fabricated data and temporary
libraries, without reading private firmware dumps.

## Home menu in the car

**Experimental.** Installed and working on our car in a first test on 10 November 2026 (the owner's report); not every item of the checklist below is confirmed yet. The Home designer's **Send to MiatOff** stores the design in the app's local library,
by name. The app's **Design your menu** page lists those menus under **Your menus**, beside five built-in ones,
each with a **Preview** that runs the car script in the browser. The menu chosen there is the one Custom menu
installs.

Under **Choose tweaks > Interface**, **Custom menu** decides what the next Meters stick does with the Home menu.
It is a choice of the builder only: the plan file has no key for it, because the car's installer rejects plans
with keys it does not know. Install and *Mazda's Home* need Meters set to Install (the app says so and builds
nothing otherwise).

| Custom menu | The Meters payload on the stick carries |
|---|---|
| Install | the menu chosen under Your menus (shown beside the choice) |
| Mazda's Home | no menu: REPAIR or INSTALL brings back Mazda's own Home |
| Leave as-is | the menu the last Meters stick carried, so reinstalling or updating Meters keeps the car as it is |

The app remembers which menu each Meters stick carried once that stick is written.

| Built-in | Style | Items |
|---|---|---|
| 2077 | The Meters 2077 style: yellow on black, chamfered panels, hazard stripes, Rajdhani labels | Navigation, Meters, Android Auto, Entertainment, Communication, Settings |
| 2077 Night | The same in the calmer 2077 NIGHT cyan | as 2077 |
| Cyber | The Meters CYBER style: cyan and magenta neon HUD frames over a grid floor, Share Tech Mono | FM, DAB, Bluetooth, Entertainment, Android Auto, CarPlay, Navigation, Settings |
| Track | The Meters TRACK style: dark dot grid, rounded panels, amber focus, Russo One; a large Meters tile | Meters, Navigation, Entertainment, Communication, Settings |
| Classic | Glass coins on an arc above a soft red line | Mazda's five |

Their layout, look and items are in `meters/home-menus/menus.json`; the artwork (a background and, per item, a
normal and a selected picture at the picture-box size) is drawn from that file by
`meters/tests/v3/generate-home-menus.mjs` and committed, like the Meters baselines: review every changed PNG. The
glyphs are drawn by that script; no Mazda or brand artwork is used. In the designer, **Start from built-in…**
copies one into the draft to change it and send it as your own.

A design has a **look**: an item frame (an outline, or none, when the selected picture shows focus), and the label
font, colour and size. The fonts are the Meters fonts, which are on the car with Meters. Each item's picture fits
the box above its label band (`round(labelSize × 1.6)` high); the designer, the car script and the generator use
that same rule.

The chosen menu travels in the MiatOff app payload, so the Meters action installs, updates (REPAIR) and removes
it, checked by the payload's MANIFEST; the installer itself is unchanged. On the unit:

- `/jci/opera/opera_dir/userjs-miatoff/miatoff-home.js`: the runtime (`meters/js/miatoff-home.js`, ES5).
- `/jci/opera/opera_dir/userjs-miatoff/miatoff-home-design.js`: `window.MiatOffHomeDesign`, generated by
  `tools/home_menu.py` (labels, positions, Commander order, routes, picture paths).
- `/jci/gui/apps/miatoff/home/<sha256>.png`: the menu's pictures.

The runtime wraps Mazda's `MainMenuCtrl` (74.00.324A) when it registers. No Mazda file is changed. It draws
the design, steps through the Commander order (knob and tilt), and hit-tests touches on the item boxes. The five
factory destinations call the system app's own Home select callback with Mazda's icon keys (`app`, `ent`,
`com`, `nav`, `set`), so MMUI routes them as before; without a picture they show Mazda's own coins. FM, DAB,
Bluetooth, Android Auto and CarPlay open Entertainment, Meters opens Applications, and then the runtime selects
the list item carrying that event (`SelectRadioFM`, `SelectDAB`, `SelectBTAudio`, `SelectAndroidAuto`,
`SelectCarPlay`/`SelectCarPlayWifi`, the Meters item) through the list's own callback, as a tap would. An item
that is unavailable leaves the list open. A missing or invalid design, a missing control method, or an error while
drawing leaves Mazda's Home. Custom menu set to Mazda's Home with Meters Install, removing Meters, or
`MIATOFF-RESTORE` returns the stock Home.

The routes come from `systemApp.js` and `MainMenuCtrl.js` as read in the owner's dump (with permission, for this
feature only); nothing of those files is in the repository. `home-car.spec.mjs` runs the runtime against a fake
HMI with those shapes, and also against the real `MainMenuCtrl.js` when a dump is on the computer.

### Checklist for the first car test (parked)

1. Install Meters with the **Classic** menu. Home shows the five coins; knob, tilt, press, touch and Back each
   work; all five open their screens; Home from another screen comes back to the menu.
2. **2077** (or **Track**): the label font loads, the selected tile changes with focus, Meters opens Meters, and
   Android Auto opens with a phone connected and leaves Entertainment open without one.
3. **Cyber**: FM, DAB (if fitted) and Bluetooth start that source; CarPlay leaves Entertainment open on a car without it.
4. A menu with your own pictures and background: they show, and the selected picture follows focus.
5. Restart the unit: the menu shows from the first Home. Incoming call, reverse camera and Mazda's own screens
   still work.
6. Custom menu set to Mazda's Home, REPAIR: the stock Home is back. Then remove Meters: byte-exact stock
   (installer).

First car result: the menu installed and worked on our car on 10 November 2026; record each checklist item here
as it is confirmed. Native integration beyond this userscript (for example editing Mazda's own Home files) is not
used; see [the research note](16-mazda-menu-customisation.md).

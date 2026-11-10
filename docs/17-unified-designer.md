# Shared MiatOff Designer

Start `python tools/meters_designer.py` from this worktree and open the printed address. Existing addresses
open Meters. Choose **Mazda Home** in the Designer selector or append `?mode=home`. The desktop builder's
Designer tab also has a Mazda Home button. Keep the same port to return to browser drafts.

## Shared editing foundation

The modes share command/gesture history, transactional IndexedDB storage with revision/conflict checks and
retained originals, geometry/snapping, image normalization, preference storage and studio styling. Meters
wrappers preserve its original validation, storage namespace, builder API and deployment formats.

Each mode retains its controller and editing surface when hidden (Home uses a same-origin frame), preserving
selection and undo history. Switching cancels gestures, invalidates pending uploads/imports, pauses rendering
and flushes pending saves. In-memory edits remain exportable if saving fails. Home uses `miatoff-home-studio`,
separate from Meters' `miatoff-studio`; no Home document is sent to the Meters builder library.

## Mazda Home

Design one 800 × 480 screen with 1–12 items. Add, duplicate, delete, rename, choose a destination and upload
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
targets. Export design includes referenced artwork; Save preview PNG omits editing handles.

## Documents and recovery

`HomeMenuDocument`, version 1, contains a background, accent, items, explicit `order` IDs and an `assets` table.
Items carry geometry, destination, normal/selected asset references and lock/visibility flags. Old menu-lab
versions 1 and 2 import with their original 120 × 136 item dimensions. Meters files are rejected by Home.

Documents are limited to 8 MiB and images must decode before import is applied. Uploads are limited to 8 MiB
and 16 megapixels, normalized locally to PNG within 800 × 480 for backgrounds or 128 × 128 for icons.
Draft storage retains prior revisions. A conflicting tab pauses editing/autosave until Load newer saved draft
is used; export preserves an in-memory copy. An unreadable draft is not silently overwritten. Recover with a
new design explicitly retains the original through the shared recovery path.

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
The merged branch passed all 82 Chromium cases, 57 JavaScript tests, 29 Python library tests and 9 custom-page
build tests. The self-contained CI command also passed its three Home cases locally. No new real-car testing
was performed.

Validation on 9 November 2026: all 82 Chromium cases, 50 JavaScript tests, 29 Python library tests and
9 custom-page build tests passed. The Home browser cases were rerun after the final recovery/resize changes,
including artwork re-import and retention of edited Meters data across mode switches. The Python build suite
emits existing unclosed-file ResourceWarnings; its assertions pass. Tests used fabricated data and temporary
libraries, without reading private firmware dumps.

**None of this new work has been tested in a real car.** Home has no USB install action. The car installer,
Meters runtime and custom-page payload generation are unchanged. Native menu integration requires the separate
firmware investigation in [the research note](16-mazda-menu-customisation.md).

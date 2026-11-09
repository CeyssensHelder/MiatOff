# Preview and builder handoff acceptance — 6 November 2026

Existing `codex/meters-theme-editor` worktree; Claude's GUI and retained-original recovery changes were preserved. No installer, head-unit renderer, firmware hash or Common.js changes were made.

## Behavior

- Fixed preview's collapsed grid allocation after hiding the toolbar. Preview temporarily fits an earlier 100% editing zoom, restores it on exit, supports Escape, and blocks editing shortcuts. It commits valid pending fields/cancels gestures through existing presentation handling.
- Added clear Send to builder controls in desktop headers and the tablet/phone Tools row. The selected theme is sent as an independent v3 snapshot with its pages, referenced images and vehicle settings. Image decoding operates on a deep copy, preserving immutable draft assets.
- Added a loopback-only API with Host/Origin checks, request tokens, bounded JSON and Python validation. Unchanged sends are no-ops; failed sends keep existing library records and browser drafts. Test drafts cannot write the normal library.
- Added the GUI Custom meters list, persistent include checkboxes (maximum eight), automatic refresh, Select all/none, read-only Preview and Export selected meters. Re-sends preserve selection and replace the same theme ID.
- A Meters install build carries the checked themes in `miatoff-custom-meters.json` as an explicit design archive. Unknown/corrupt existing archives are refused. Recognized stale selection is cleared on a subsequent build. The app-code manifest and one-action installer are unchanged; this file is not activated on the car.

## Checks

- **58 Chromium tests passed together**, including five new preview/handoff cases and the retained-original regression added during review. Tests use temporary browser contexts, draft namespaces, ephemeral servers and temporary library databases.
- **Nine Python library/API/Tk tests passed**, including all six JavaScript starters and every registry variant as shared acceptance fixtures, persistent selection, idempotent replacement, invalid-document refusal, corrupt database preservation, export hashes, request guards and fake USB build selection/clearing.
- **23 pure Node tests and all four existing editor JavaScript suites passed.**
- Synthetic checker and existing Meters app tests passed. The Linux stick checks use colon-containing sysfs fixture paths, so the native Windows run could not execute that fixture. They then passed in the already-installed `python:3.12-slim` Docker image with network disabled and only `tools/` mounted read-only.
- All six gauge visual baselines passed unchanged. The four shell candidates were reviewed and explicitly accepted for the Send button. Responsive checks passed at phone, tablet, laptop, desktop and ultrawide sizes; the tablet header overflow caught by regression tests was corrected.
- Mixed 24-widget warmed renderer p95 remained approximately **0.7 ms** on this PC, with bounded history/caches and stopped paused rendering. This is renderer time, not a head-unit result.
- Live review in Chrome sent the user's existing Street theme to the normal local library without editing the design. The GUI automatically displayed Street with three pages, seven instruments and an include checkbox. Its window and the editor were left open; preview was visually checked at full canvas size.

Screenshots were saved for the live Send confirmation, the GUI library and the corrected preview. Tests and documentation describe this as local design exchange. Car activation, the common deployment profile, transactional installation/replacement and in-car/Opera acceptance remain future work.

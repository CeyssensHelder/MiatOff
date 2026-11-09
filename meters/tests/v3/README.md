# Designer tests

Run from the feature worktree root:

```powershell
node --test meters/tests/v3/model.test.mjs meters/tests/v3/presentation.test.mjs
node meters/tests/test_designer.js
node meters/tests/test_studio.js
node meters/tests/test_signals.js
node meters/tests/test_editor.js
```

The browser harness is development-only, pinned in package-lock.json. It uses Playwright 1.65.0 with its Chromium revision and a fresh browser context/profile for every test; `?test=1&db=...` selects a unique test database. Never point acceptance helpers at the live draft.

Start the loopback server, then from `meters/tests/v3`:

```powershell
npm ci
npx playwright install chromium
npm run browser
node soak.mjs
```

The suite expects `http://127.0.0.1:8890`, or the server named in `METERS_DESIGNER_URL`. To start one from the root use `python tools/meters_designer.py --port 8890 --no-browser --library-db <temp file>`; to test another worktree, use another port and set `METERS_DESIGNER_URL=http://127.0.0.1:<port>` (and `MIATOFF_METERS_LIBRARY` to a temporary file) so your own server and library stay untouched. The editor itself requires neither npm nor Playwright.

`model.test.mjs` checks real v2 starter/v1 migrations, explicit styles/ranges, invalid references, transactions, no-op gestures, history bounds, unit conversion, warnings/track behavior, seeded recording and immutable shared assets. `editor.spec.mjs` checks real font metrics, all variants/effects/fonts, card regression geometry, keyboard/group/arrangement operations, image persistence, upload races, malformed imports, quota injection, revisions, two-tab/CAS conflicts, export pixels, responsive layouts and paused rendering. Its performance figure measures warmed canvas drawing, not the full browser frame or head-unit performance.

`visual.spec.mjs` compares frozen telemetry and loaded fonts at pixel ratio one to reviewed PNGs in `baselines`. Each PNG contains both pages in both modes. `updateSnapshots` is **none**. Never auto-accept a screenshot change. Generate candidates with `node generate-visuals.mjs`, inspect every changed image and its reason, then copy only approved candidates explicitly into `baselines`. Generation alone does not change a baseline.

`presentation.test.mjs` covers independent preferences, metadata coverage, numeric appearance mappings and converted warning directions. `studio-ui.spec.mjs` exercises Basic's complete add/resize/preview/share workflow and compact inspector, all registry controls in Expert, non-mutating detail changes, imported custom settings, mixed/locked selection, pending invalid fields, focus/scroll preservation, gesture cancellation, unavailable preference storage, native sheets, keyboard tabs/slider and independent error feedback. It captures 390x844, 768x1024, 1366x768, 1920x1080 and 2560x1080 workspaces with reduced motion.

The four `ui-*.png` baselines cover Basic, Advanced, Expert and a selected instrument in the phone Properties sheet. They mask only the changing save timestamp. Generate candidates with `node generate-shell-visuals.mjs`; it disables transitions to match test capture. Inspect each candidate before explicitly copying it from `test-results/shell-candidates` into `baselines`. Existing canvas baselines must stay unchanged for presentation-only edits.

`builder.spec.mjs` checks usable full-canvas preview at Fit/100%, desktop/phone and Escape without changing the document. Its handoff cases start their own Python server on an ephemeral port with a temporary SQLite library: actual sends/resends, preserved include choices, image round trips, phone sends, read-only multi-page/day/night/playback preview, actionable failures and unchanged browser drafts. Production-library writes from test drafts are refused. No live draft or library is used.

The handoff now sends every Custom page, including pages from all legacy style containers, to the protocol-2 page endpoint. `custom-pages.spec.mjs` verifies removal of the theme picker, Blank/twelve starter choices, cancellation/undo, flat legacy navigation/reload and independent page styling/backgrounds. `pages.test.mjs` checks non-mutating flat navigation, complete snapshots and independently styled starter/blank creation. The Python suite additionally checks preservation of original grouped records, transactional full-collection synchronization and retired copies of removed pages.

Run `MO_SYNTHETIC=1 python tools/tests/test_meters_library.py` from the worktree root (PowerShell: set `$env:MO_SYNTHETIC='1'` first). This shares real JavaScript starter/variant fixtures with the Python validator, checks SQLite/idempotency/selection limits/corrupt data, API origin/token/Host guards, exact selected exports and a temporary Tk GUI/fake-stick workflow. It needs Node and Tk for development testing. The production library/bridge uses Python's standard library only.

`soak.mjs` runs ten minutes of actual wall-clock playback with 24 mixed widgets and visible gallery previews, checks bounded history/cache/undo sizes, then checks that paused rendering stops. `artifacts/soak.json` records samples and elapsed time. The model test also runs an accelerated ten-minute clock; these are separate checks. Test outputs and node_modules are ignored.

`custom-speed.test.mjs` records the canvas calls of `custom.js`: fixed parts are drawn once, a live frame sets no clip regions, unchanged instruments are skipped, a changing number is not re-measured, bars land on whole pixels and corners do not use `arcTo` (it left steps in them on the car).

`es5.test.mjs` parses every `meters/js/*.js` with acorn (pinned devDependency) as ES5 and rejects canvas and library calls the car lacks (`roundRect`, `setLineDash`, text bounding boxes, `Array.from`, `Object.assign` and so on). `car-app.spec.mjs` serves `meters/` with a generated `custom-pages.js` (the six starters, twelve pages; the car keeps eight) and checks in Chromium that CUSTOM is the fifth style row, the picker offers eight pages (keyboard and touch), every page draws without errors and the group is absent without pages; screenshots go to `test-results/car` for review. `car-parity.spec.mjs` draws every starter page and an instrument matrix (about 150 pages, four states each) with `renderer.mjs` and with the car's `MeterCustom.render` and compares the pixels (a channel off by more than 16 counts; a page fails above 10 such pixels); failures leave side-by-side and diff images in `test-results/parity`. Both specs start their own static server and call `custom_pages_tool.py`, so they need Python and no designer server. None of this runs on the car.

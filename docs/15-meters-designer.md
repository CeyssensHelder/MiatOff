# Meters Designer v3

The standalone editor is served by `python tools/meters_designer.py --port 8890` at `http://127.0.0.1:8890/designer/index.html`. Keep the same origin and port when returning to a browser draft. It uses native JavaScript modules, bundled fonts and local browser storage; no production build, account, CDN or network service is needed. This work does not connect v3 designs to the car app or USB installer.

## Custom pages

The editor has one flat **Custom** collection. There is no theme picker or user-defined page grouping. All pages from older projects remain accessible in the Pages tab, with their layouts, styles, backgrounds and vehicle settings preserved. Repeated legacy DRIVE/TELEMETRY names receive readable display labels such as Street driving and Neon telemetry; the original draft names are retained until you edit them explicitly.

- **New page** opens a starting-screen chooser: Blank plus twelve individual driving/telemetry screens from Street, Track, Classic Analog, Minimal, Neon and Retro Digital. Choosing one adds exactly one independent page. Cancel changes nothing; addition is undoable.
- **Page style** edits the current page's name, palette, typography and effects. **Page background** edits only its background. These actions do not restyle other pages. New instruments inherit the current page's defaults.
- **Send to builder** synchronizes every Custom page, including pages that used to belong to another theme. There is no selected-group scope. Each page becomes an individual checkbox and Preview entry in **MiatOff > Meters Designer > Custom pages**.
- Re-sending updates existing page IDs and preserves their include choices. Pages deleted from the editor are removed from the active builder list on the next send; their previous library copies are retained in the database's retired-pages records. The original grouped-library table is retained as well.
- **Share current page** exports one page and its referenced images as a compatible v3 ThemeDocument wrapper. **Back up entire project** retains every Custom page, components and vehicle settings. Importing older theme files adds their pages to Custom while preserving the receiving vehicle profile. Contact sheets include all Custom pages.

## Editing and preview

**Editing detail** defaults to Basic. Its native slider and clickable Basic/Advanced/Expert labels reveal controls without changing the document, saved revision or undo history. Hidden custom settings remain active, with an explicit reveal action. Preferences (detail, panel widths, tabs and open sections) are stored separately and continue for the session if preference storage is unavailable.

Basic shows Content and Appearance for a standard Number: reading, caption mode, text size, value color and five visual treatments. Every instrument remains available, including essential G-meter ranges, chart windows, warning triggers and session choices. Advanced reveals coordinates, grouping/alignment, typography, fonts, detailed colors, backgrounds, manual simulation and RPM settings. Expert reveals exact effects, gradient stops, overlap exemptions, recording and detailed vehicle calculations.

The left panel has Pages, Instruments and Layers tabs. Add instrument opens the searchable visual library; choose an instrument and variant, then explicitly add it. Layers controls instrument order, lock/hide and instrument groups; these are layout tools, not groups of pages. The inspector follows selection, shows Mixed common values and offers page-scoped style/background actions when nothing is selected. Custom appearance properties have accessible resets to page defaults.

Free dragging, snapping, duplication, deletion and **Resize…** (Width/Height) work at every level. Shift or Multi-select selects multiple instruments. Arrow keys nudge by one pixel, Shift+Arrow by eight. Standard selection/clipboard/duplicate/undo shortcuts remain available and do not intercept typing. Alignment and arrangement are available in Advanced. Touching borders and positive gaps are valid; actual intersections remain checked. The Design checks count opens the review drawer. Pair exemptions suppress only the specified external intersection, never internal clipping/readability checks. Checks do not establish driving safety.

### Instruments and starters

- **Dials** show the value inside the arc by default (Advanced: Value position). Scale labels are at least 14 px (18 px where they fit) and use round steps; a label that would run into the value is left out, its tick stays. Needle dials keep the value in the open bottom of the arc.
- **Colour zones** (Advanced, for Number, Dial and Bar) colour the value, the dial track and bar segments by value. Automatic follows the vehicle RPM settings (amber, red) and each reading's warning threshold (for example low fuel). Custom offers up to four zones, each from a value in the display unit, plus an optional colour below the first zone; it starts from what Automatic shows. Warnings (red, flashing) still take priority.
- **Shift lights** start a configurable number of rpm before the amber line (default 1,500) and use a green, amber and red ramp; all lights flash at the shift point.
- **G-meters** draw dashed rings every 0.5 g with labels when Show grid is on, and a live g readout (Show live g).
- **Session** shows top speed, maximum RPM and laps as cards; charts use 16 px axis labels.
- **Fonts:** Arial, MO Chakra (Chakra Petch), MO Mono (Share Tech Mono), MO Condensed (Rajdhani Bold) and MO Sport (Russo One), all bundled under the SIL Open Font License.
- **Use this look on all pages** (Page style) and **Use this background on all pages** (Page background) copy the current page's day and night styling or background to every other page in one undoable step.
- Each starter has its own layout: Street (dial, speed, coolant and fuel), Track (shift lights, gear, speed, lap timer), Classic Analog (twin needle dials, three small dials), Minimal (one large speed and an RPM bar), Neon (speed, segmented dial, gear) and Retro Digital (segmented RPM bar, large digits).

Documents saved before these options existed keep their original appearance: missing options load as value below the dial, colour zones off, shift lights from the amber line in one colour, and no live g readout. Only new instruments and starters use the new defaults. Larger scale and chart labels apply to every design.

Preview hides editing guides and fits the full canvas, temporarily fitting an earlier 100% editing zoom and restoring it on exit. Escape exits. Simulation starts paused and is labelled Simulated. Desktop panels resize; tablet/phone expose Tools and Properties through focus-managed scrolling sheets. Phone controls have touch targets. Image/gradient contrast diagnostics remain advisory.

## Builder selection and design archives

The desktop builder refreshes its Custom pages list automatically. Choose up to eight individual pages for **Export selected meters…**. When Meters = Install is selected in Install/remove, the checked pages are also copied to the stick as `miatoff-custom-meters.json`, separate from the executable app manifest. A recognized older archive is updated or cleared to avoid retaining stale selections; an unknown/corrupt archive is refused. Selection changes alone never write a USB stick.

**This is a design archive, not a car installation.** Car activation remains deferred. The archive retains the legacy `MetersThemeSelection` version-1 wrapper, with independently checksummed v3 single-page snapshots and a vehicle snapshot for accurate preview. Neither the four built-ins nor the car navigation are changed. A future runtime adapter and separately guarded configuration lifecycle are still required.

The local library is per user, not per checkout: `%APPDATA%\MiatOff\custom-meters.sqlite3` on Windows, `~/Library/Application Support/MiatOff/` on macOS, `$XDG_DATA_HOME/MiatOff` or `~/.local/share/MiatOff` on Linux (override with `MIATOFF_METERS_LIBRARY`). On first use an older `.miatoff/custom-meters.sqlite3` in the checkout is copied there with SQLite's backup API; the old file is never modified. It is separate from browser drafts. Send to builder asks first when the draft lacks pages that are in the builder list (`POST /api/builder/pages/plan` is a dry run); the server refuses such a send with 409 unless `X-MiatOff-Confirm-Removal` lists the ids. Removed pages stay in `retired_pages` and are restored from the builder's Removed pages section. Older theme records that cannot be converted are skipped and listed in `migration_skipped`; their rows stay untouched. Original grouped records are retained; page-library initialization and full-collection updates use transactions. Failed sends leave the current library intact, and unchanged sends are no-ops. The builder's Preview is read-only and does not open/edit the browser draft. Back up through the editor's project JSON or the builder selection archive.

Run `python miatoff_gui.py --designer` to open the list directly. The loopback bridge uses protocol 2, Host/Origin checks and a same-origin request token. Restart an older server at the same port before sending. Test drafts may send only to a temporary test-library server (`--library-db PATH`).

## Simulated telemetry

New sessions start paused. All editor readings are explicitly marked Simulated. Idle, acceleration, braking/cornering, high RPM, warnings and missing-data scenarios share a deterministic clock. Manual inputs use canonical units (km/h, degrees C, PS, Nm, L/100 km, g); each can be marked unavailable. Vehicle RPM settings drive the high-RPM scenario and default tachometer/shift warnings. The acceleration scenario derives speed from RPM through the vehicle's gear ratios, final drive and tyre circumference (when known), so speed, RPM and gear agree. Choosing a vehicle identity does not supply verified specifications or establish collector support: the retained initial profile is explicitly labelled legacy ND1 1.5 assumptions.

Display units affect values, axes, scales, legends and session maxima. A custom range carries its display unit; changing units converts both endpoints. A reciprocal consumption range with a zero endpoint cannot be converted to a finite endpoint. Set positive endpoints or restore Automatic scale before changing that unit.

Pause freezes telemetry, histories, laps and statistics. Missing data creates chart gaps and suspends measurements/lap accumulation. Lap timing uses integer milliseconds; Reset clears comparisons and maxima together. Histories retain the longest configured chart window (up to 120 seconds), with at most 1,200 samples. G-meter markers clamp to the plotting shape and identify over-range readings; session peaks survive history trimming.

Record preview captures up to five minutes, its seeded phase, initial track state and manual/scenario/lap/reset events. Recordings remain local and export as a separate JSON file, never inside a theme/setup. Replay uses the same simulation clock. Recordings are design aids, not captured vehicle telemetry.

## Drafts, recovery and sharing

IndexedDB version 2 separates `projects`, immutable SHA-256-addressed `assets`, `revisions`, and `originals`; the old `drafts` store is retained. Saves debounce for 500 ms and atomically commit assets/document/revision. The header shows Saving, Saved with a timestamp or Save failed. Action feedback is separate; routine save/export messages do not dismiss an unresolved storage error or revision conflict. Up to the latest ten automatic recovery revisions are retained within a 32 MiB metadata budget. Named checkpoints can be deleted explicitly in Recovery revisions. Automatic revisions yield space to checkpoints; a failed transaction preserves the previous committed state. Undo/redo is bounded to 100 commands or 16 MiB, accounting for command metadata and unique retained image bytes without copying images into every snapshot. Assets referenced by the project, revisions, checkpoints or undo/redo remain retained.

A tab has its own session ID. BroadcastChannel announces newer revisions, and an IndexedDB compare-and-swap protects the commit even without that announcement. On conflict, autosave pauses: reload the latest revision or export local work. It never silently overwrites the other tab.

Recovery revisions also offers export or undoable restoration of the retained pre-migration original. A load, decode or migration failure enters recovery without saving a blank default. Retry, export original data, restore a revision or explicitly start a new project. Storage failures preserve the last committed project, but unsaved edits still require an explicit export before closing. Browser storage is origin/profile specific and is not a portable backup.

Export > Back up entire project includes every Custom page, vehicle and reusable library; Share current page includes just that page and its referenced assets. Theme imports preserve the receiving vehicle. Component JSON carries independent widget/group definitions. Page PNG and contact-sheet PNG omit guides, selection and editor UI; contact sheets include page names and the selected day/night mode.

Limits: up to 64 Custom pages (the portable v3 format retains its eight-by-eight legacy style containers), 24 widgets per page, 256 KiB of definitions, three embedded normalized images up to 1.5 MiB each, and 8 MiB total JSON. Source images are PNG/JPEG only, up to 10 MiB and 16 megapixels, normalized to at most 800x480. Imports decode and validate all assets before applying. Async uploads capture theme/page identity and cancel if the target disappears. Arbitrary JavaScript, external URLs, custom CSS and uploaded fonts are not supported.

## Migration

V1/v2 documents migrate in memory and validate before being committed. The untouched legacy source is retained in `originals/pre-v3` within the same atomic save, and its old `drafts` record is left intact. Stable IDs are introduced for pages/widgets/groups/components. Positions, dimensions, vehicle settings, explicit colors and manual ranges survive. Existing appearance becomes night style; an editable light style/background is generated.

Recognized signal captions become Automatic; other captions stay Custom. Fixed-purpose G-meter, lap, session and power widgets lose meaningless generic RPM bindings. Known generic RPM captions on these widgets are corrected; authored captions remain. Legacy blanket overlap flags become explicit intersecting pairs. Large decorative backgrounds receive a background role; other shapes participate in collision checks.

Legacy reciprocal consumption scales used a 0-80 fallback when an endpoint was unavailable. Migration retains that visible manual fallback and records its original canonical endpoints in `legacyScaleSource`, instead of silently switching to Automatic. Unknown future versions are rejected without changing the current draft. V3 exports target this standalone editor and are not accepted as a claim of compatibility with the older car runtime. The former HTML entry is retained as `legacy-v2.html` for source/reference purposes; do not use it to edit an upgraded database.

## Implementation

| Module | Responsibility |
| --- | --- |
| `meters/designer/v3/model.mjs` | V3 model, migration, registry/defaults and validation |
| `commands.mjs` | Transaction rollback, bounded undo/redo, selection snapshots and gestures |
| `persistence.mjs` | Atomic saves, revision checks, checkpoints, asset hashes/decoding/collection |
| `signals.mjs` | Canonical signal catalog, units, scales, precision and warnings |
| `layout.mjs` | Shared panel/text measurements, diagnostics, clamping, guides and arrangement |
| `renderer.mjs` | Canvas painting and bounded background/effect/image caches |
| `simulation.mjs` | Controlled clock, scenarios, gaps, track state and recording/replay |
| `exports.mjs` | Referenced-asset JSON documents and guide-free PNGs |
| `pages.mjs` | Flat Custom-page navigation, readable legacy labels, independent page creation/style and snapshots |
| `presentation.mjs` | UI preferences, registry property metadata, appearance commands and warning presentation |
| `workspace.mjs` | Detail control, panels, focus-managed sheets, menus, feedback and canvas fitting |
| `inspector.mjs` | Incremental scoped properties, mixed values, inheritance and inline errors |
| `app.mjs` | Existing commands, galleries, layers, clipboard and browser interactions |

The legacy ES5 car renderer is separate. No car installation scripts, stock hashes or `Common.js` were changed for this studio work.

## Verification and limits

See `meters/tests/v3/README.md` for isolated tests and reviewed screenshot procedures, and `docs/designer-acceptance/` for recorded evidence. Browser acceptance is provisional. Opera rendering, head-unit performance, physical touch-device ergonomics and in-car operation require separate acceptance. No real car testing has been performed.

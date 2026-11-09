# Studio UI acceptance — 6 November 2026

Implemented in the existing `codex/meters-theme-editor` worktree. This is a presentation redesign of the standalone editor: portable documents remain version 3, with no document migration required. Existing design and vehicle values are retained. UI preferences use a separate namespace and never enter exports.

## Delivered behavior

- Basic / Advanced / Expert native stepped slider, named announcements and clickable stops; Basic is the initial preference. Free placement, resizing, shortcuts, preview and export work at every level.
- Three areas: tabbed Pages/Instruments/Layers, flexible canvas, scoped properties. Theme management is in the theme picker. Project and Export provide focused entry points instead of permanent tool rows.
- Basic's standard Number starts with two open sections and four visible input/select controls, plus one grouped five-choice appearance control. Advanced and Expert progressively expose typography, arrangements, effects, warning/range policies, backgrounds, vehicle and recording tools.
- Registry-backed presentation metadata, readable instrument names, visual variants/presets, search/category filters, explicit Add, mixed common properties, inheritance summaries, reset actions and local validation errors.
- Separate save and action feedback; unresolved errors survive successful save/export notices. Preference storage failures do not prevent draft persistence. Changing detail commits valid pending inputs, retains invalid-field focus, and cancels an active drag through gesture rollback.
- Paused simulated telemetry on session startup. Compact issue-count review dialog. Touching borders and positive gaps remain valid.
- Resizable desktop panels; tablet/phone Tools and Properties sheets with native modal focus containment, scrolling and trigger restoration. Phone header actions share the title row, with labelled detail stops below. Reduced motion suppresses transitions.

## Recorded checks

- **23 Node tests passed:** 19 model/command/layout/simulation fixtures and four new presentation tests.
- **52 Chromium browser tests passed together:** 26 editor regression cases, 20 studio UI cases, six existing gauge visual comparisons. After the phone-only header refinement, all three affected phone/responsive/screenshot cases passed again.
- All four existing JavaScript suites passed: designer, studio, signals and editor.
- Basic workflow: new page, Number, Speed reading, Raised appearance, explicit 300×180 resize, Preview and theme download.
- Detail cycling preserves byte-for-byte project JSON, undo count and saved revision. Expert settings survive Basic, reload and autosave. Registry coverage checks ensure applicable properties have Expert controls.
- Mixed values/locked selection, invalid pending geometry, ordinary-edit focus/scroll preservation, drag cancellation, keyboard slider/tab navigation, preference-storage failure, sticky storage errors and phone Escape/focus restoration passed.
- Existing import/assets/recovery/checkpoint/quota/two-tab conflict tests passed under the new shell. Async upload target-deletion protection remains intact.
- Reviewed workspaces at **390×844, 768×1024, 1366×768, 1920×1080 and 2560×1080**. Fit remains inside the available viewport, without horizontal document overflow. These are browser viewports, not physical-device tests.
- Six existing canvas baselines passed unchanged. Four new editor-shell baselines (Basic, Advanced, Expert and phone Properties) were generated as candidates, inspected and explicitly accepted. Automatic screenshot acceptance remains disabled. Save timestamps alone are masked; transitions are disabled during comparison.
- Warmed mixed 24-widget canvas-renderer **p95: 0.8 ms** over 150 measured draws after 30 warmups. History: 1,200 samples; caches: one background, five finishes, no images. See `ui-performance-2026-11-06.json`. This measures renderer drawing time, not full-frame latency. Gallery-cap and paused-render checks passed; accelerated ten-minute simulation bounds passed. The earlier real-time soak remains separately recorded and was not represented as a new UI soak.

The user's normal local draft was opened separately in Chrome for final visual review. Only selection and presentation preferences were changed; no design edits were made. The editor remains open at `http://127.0.0.1:8890/designer/index.html`.

## Review artifacts and limits

Reviewed baselines are in `meters/tests/v3/baselines/ui-basic.png`, `ui-advanced.png`, `ui-expert.png` and `ui-phone.png`. `node generate-shell-visuals.mjs` produces unmasked delivery screenshots under `artifacts/review-*.png`, plus comparison candidates in `test-results/shell-candidates`. Responsive captures are `artifacts/workspace-<width>x<height>.png`. See `meters/tests/v3/README.md` for reproducible isolated commands.

The browser review does not establish physical phone keyboard ergonomics, Opera/head-unit performance or in-car operation. Screen-reader announcements use native semantics and were inspected/tested through accessibility attributes; a dedicated assistive-technology user study has not been performed. No car-app, USB, hosting or tunnel changes were made in this redesign.

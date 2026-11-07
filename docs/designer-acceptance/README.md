# Browser acceptance — 6 November 2026

> Dated records of earlier states of the editor, kept as evidence. Later changes (one flat list of Custom pages, the builder library, the gauge and starter rework) are described in [15-meters-designer.md](../15-meters-designer.md); current test counts come from running the suites.

Standalone editor on `codex/meters-theme-editor`, Windows development PC. Synthetic documents/images, temporary Playwright Chromium contexts, unique test databases. The live browser draft was opened separately only for the requested migration/review.

- 18 pure Node model/command/layout/simulation tests passed.
- 31 distinct browser cases passed across the full 29-case suite and focused final performance/original-recovery runs. The final height-aware Fit adjustment also passed responsive, pointer/group, keyboard and recovery checks.
- Existing designer, studio, signals and editor JavaScript regression suites passed.
- Six inspected screenshot baselines passed exact comparisons. Each includes driving/telemetry pages in night/day mode, frozen telemetry, loaded bundled fonts and pixel ratio one.
- Viewports checked: 390x844, 768x1024, 1366x768, 1920x1080 and 3440x1440. This is browser viewport testing, not physical phone/tablet certification.
- The 160x104 coolant/fuel regression fixture passed measured text-region containment and internal-overlap checks for all five effect treatments. The broader matrix covers variants, bundled fonts, effect intensities, constrained/normal/large geometry, long labels, negative/large/unavailable readings, and metric/UK/US presentation.
- Warmed canvas rendering p95: approximately **1.2 ms**, 24 mixed widgets, all five treatments, 1,200 history samples, 120-second charts, 150 measured frames after 30 warmup frames. See `performance-2026-11-06.json`. This measures canvas drawing, not total browser frame time.
- Ten minutes of real-time playback passed with 24 mixed widgets and visible gallery previews. Histories stayed at 301 samples for the configured 30-second window; caches and undo stayed bounded. Gallery batches stayed below five per second. No browser errors occurred. One queued redraw followed Pause, with no continuing animation. See `soak-2026-11-06.json` for elapsed time and all ten samples. An additional accelerated-clock soak passed in pure/model/browser tests.
- Actual PNG upload normalized from 1600x960 to 800x480, survived reload and JSON sharing, and reused one embedded image asset. Corrupt assets, deleted upload targets, quota failures, unknown versions, stale writers and two-tab conflicts preserve the last valid project.

The local editor is open at `http://127.0.0.1:8890/designer/index.html`. Existing design positions, dimensions, vehicle settings and inherited colors were retained. Its spacing advisories remain visible rather than silently moving the user's widgets.

Remaining limits: diagnostics cannot prove legibility or contrast in every visual composition; textured/image contrast is advisory. Real touch-device ergonomics need review. V3 portability is between editor instances; car-app/USB integration is deferred. No Opera/head-unit performance or real-car operation is validated.

# Flat Custom pages — 7 November 2026

The editor now presents one Custom collection. The top-left theme picker and theme-management dialog are removed. New page opens Blank plus twelve individual starter screens, adding one independently styled page per choice. Page style/background edits, page sharing and contact-sheet export follow page scope. Send to builder includes the entire collection.

Existing v3 data is preserved: legacy style containers remain in portable JSON, but all their pages are shown together. Optional validated page style/dayStyle overrides isolate new edits. Duplicate default DRIVE/TELEMETRY labels receive readable starter-based display names; sending uses these labels on an independent snapshot, leaving the original browser document unchanged.

The builder uses a transactional flat page library. Each page has its own include checkbox and preview. Original grouped records remain in the old table, and removed active pages are archived in retired-pages records. A whole-collection send validates every page before updating anything and preserves include choices for surviving page IDs. The same eight selected-page limit applies to design archives. No car runtime, installer, manifest or stock hash was changed.

Validation:

- Complete Chromium run: **62 passed**, including new Custom-page flows, full-collection sends, starter/blank creation, cancellation/undo, page style/background independence, legacy-page navigation and reload, existing persistence/recovery cases and all six unchanged gauge baselines.
- After the final readable-label adjustment, all **nine** focused builder/Custom-page browser cases passed again.
- **25** model/presentation/page Node tests passed; the two page-specific tests were rerun after the label adjustment. All four existing editor JavaScript suites passed.
- **12** Python tests passed, including shared JavaScript fixtures, grouped-library retention, transactional complete sync, preserved selection, retired copies, per-page styles, invalid-send refusal and the synthetic Tk/fake-stick workflow.
- The four editor-shell screenshot candidates were inspected and explicitly accepted for the removed picker and page-style labels. Instrument rendering baselines were unchanged.
- Live review preserved all **seven** pages in the user's existing project. Send reported all seven Custom pages, and the refreshed builder displayed separate checkbox entries for them. The starting-screen chooser and updated builder were left open for review.

Car deployment/Opera/head-unit validation remain outside this change. Retired library copies are retained in SQLite; a dedicated recovery UI for those archived records is not yet provided.

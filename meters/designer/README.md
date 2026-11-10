# Meters Designer studio

The current studio has Meters and Mazda Home modes; see [the unified guide](../../docs/17-unified-designer.md).
Current Meters editing and deployment are described in [docs/15](../../docs/15-meters-designer.md).

Both modes send to the MiatOff app with Send to MiatOff, which puts them on the stick.
Run `python tools/meters_designer.py --port 8878` from the repository root and keep
Python running. Open http://127.0.0.1:8878/designer/index.html. The server is loopback-only.
A fixed port preserves the browser origin used for drafts.

## Designing

Expand **Starter gallery** to add Street, Track, Classic Analog, Minimal, Neon or Retro
Digital. Starters add a theme without replacing your project. Each has driving and
telemetry pages. Switch themes/pages with their selectors; duplicate/delete operations
are undoable. Limit: eight themes, eight pages each and 24 widgets per page.

The widget library is grouped into Gauges, Indicators, Charts, Track and Decoration.
Choose a variant beneath a live preview, then click the preview to add it. Use Content,
Layout, Appearance and Effects to edit it. Shift-click widgets for multi-selection;
align top or distribute horizontally. Arrow keys nudge by one pixel, Shift by eight.
Locked widgets cannot be dragged or nudged. Hidden widgets stay in the layer list.
The lower-right handle resizes; dragging snaps to eight pixels. Fit/100% changes zoom.
Preview hides guides and panels. The toolbar exits preview.

Theme accent, font and effect settings apply to widgets without explicit overrides.
**Reset to theme style** removes overrides. Flat, Raised, Inset and Neon provide 2D depth.
Static finishes/backgrounds use bounded caches; text remains dynamic.

Background supports solid, gradients, procedural grid/carbon/noise and local PNG/JPEG.
Enable a page override to customize just that page. Image controls include cover/contain,
crop alignment, opacity and dimming. Removing an image resets references to solid.
Sources are limited to 10 MiB and 16 megapixels, normalized within 800×480; up to three
normalized images of 1.5 MiB each are embedded in JSON. Project limit: 8 MiB including
assets; design definitions retain the 256 KiB limit. No external assets are fetched.

## Preview and files

All telemetry is simulated. Choose idle, acceleration, braking, high RPM, warnings or
missing data. Play/pause controls the shared clock; lap/reset buttons exercise track
widgets. No simulated widget implies support for that signal in the future car app.

Drafts save to IndexedDB. Existing v1 localStorage drafts migrate automatically;
undo history resets on reload. Save failures are shown in the status line. Export JSON
for a portable backup. Theme export includes only its referenced assets; importing it
preserves vehicle settings. Setup export includes the whole project. Future document
versions and invalid imports leave the current project intact. Documents use version 2;
the earlier car renderer is not a deployment target for these files.

## Verification

```
node meters/tests/test_designer.js
node meters/tests/test_studio.js
```

Open `/designer/verify.html` for real-canvas variant/boundary checks, synthetic image
normalization/JSON round trip and a 24-widget render timing sample. Chrome was checked
for gallery selection, v1 migration, theme/page persistence, widget controls and previews.
This is an experimental editor. Nothing here has been accepted in a real car.

## Temporary remote access from a phone

With the official Cloudflare executable in the ignored `build/designer-remote/` folder:

```
python tools/meters_remote.py --email you@example.com
```

The launcher starts a separate loopback editor on port 8890, then an email-protected
Cloudflare Quick Tunnel. Open the printed HTTPS URL from your phone and sign in with
the allowed email and Cloudflare's one-time code. No Cloudflare account is needed.
The launcher refuses binaries without the email gate. It never starts an anonymous tunnel.

On Windows it temporarily inhibits system sleep while running; the screen may turn off.
Keep the PC powered and online. Closing the launcher stops access and restores ordinary
sleep behavior. The hostname changes when the tunnel is restarted. No uptime guarantee
is provided by this development tunnel. To stop a hidden session, use the launcher PID
in `build/designer-remote/session.json`; stop its tunnel PID as well if forcefully terminating
rather than sending Ctrl+C. Logs and the URL are stored under the ignored build directory.

Drafts are local to each browser/origin: export/import JSON to transfer work between PC
and phone. The tunnel provides access to the designer, not remote desktop or a shell.

Official instructions: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/

## Signal-aware scales and layout checks

Changing the Signal on a number, dial, bar, chart or warning applies a meaningful label,
range, precision and default threshold. Automatic scales follow the vehicle RPM maximum
and display units. Speed dials use 0–260 km/h or 0–160 mph; fuel uses 0–100%, temperatures
use temperature ranges, and G signals use signed ranges. Turn off Automatic signal scale
to set a custom range in the selected display units. Fixed-purpose widgets retain their
own signals instead of presenting a selector that would have no effect.

Check layout highlights overlapping visible widgets. Shape backgrounds and widgets marked
Allow intentional overlap are excluded. New widgets and duplicates seek free space.
Arrange without overlaps respects locked widgets and rolls back if the page cannot fit.
Small widgets receive readability notices. The check detects bounding-box overlap; it is
not a guarantee of legibility for every custom font, color, or composition.

Duplicate page provides a quick alternate layout. Save preview PNG exports an 800×480
render without editing guides. Text fitting and reserved caption/value areas reduce
internal collisions; chart samples now retain every supported simulated signal.

Additional regression checks: `node meters/tests/test_signals.js`.

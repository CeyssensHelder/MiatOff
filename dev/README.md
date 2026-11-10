# Meters development without a car

Run a **fabricated drive through the real collector into the real Meters page**:

```sh
python3 dev/serve.py --docker busybox:1.25
```

Run from the repository root. Needs Python 3.10+ and a running Docker daemon (Docker Desktop on macOS/Windows).
On Windows use `python` if that is your Python command. Docker downloads the image on first use; for an offline
session, pull it beforehand with `docker pull busybox:1.25`.

The browser opens `http://127.0.0.1:8765/index.html?src=poll:live.txt`. It is the normal Meters UI, reading
collector output, **not** its built-in `src=sim` simulator. The preview is loopback-only and serves only Meters
assets and the generated `live.txt`, never the repository root or a firmware dump. No car or D-Bus connection is used.

On a POSIX host with `sh` and **GNU awk** installed (`brew install gawk` on macOS, `sudo apt-get install gawk` on Ubuntu),
Docker is optional:

```sh
python3 dev/serve.py
```

The native child uses `gawk` as `awk`. Some host awk implementations buffer pipe input, unlike the car's BusyBox awk.
The collector is copied byte-for-byte to a temporary directory and runs without code changes in either mode.
The BusyBox version matches the existing host tests; it is not proof of behaviour on the CMU's BusyBox 1.19.

## Controls

- In the terminal, press **Enter** to pause/resume the fake D-Bus traffic. While paused, the last `live.txt` stays
  readable, its `LiveSeq` stops changing, and a gauge shows **NO DATA** after about three seconds. Resume clears it.
- **Ctrl-C** stops the preview, collector and fake tools, then removes their temporary files/container.
- `--no-browser` prints the URL without opening it.
- `--port 8800` chooses another port; `--port 0` chooses an available port.
- `--at 6` holds the scenario at second six (30 km/h, full throttle). Traffic still arrives at 10 Hz; this is
  different from pausing the feed.
- Use the normal Meters touch/keyboard navigation to switch styles and gauges. Append `&set=street&page=0`
  to open a gauge directly when testing NO DATA.

## Data path and limitations

```
drive.py → atomic synthetic text files
                  ↓
      mock-dbus-monitor / mock-smdb-read
                  ↓
       unchanged miatoff-collector.sh
                  ↓
          temporary out/live.txt
                  ↓
       HTTP → unchanged Meters UI
```

The deterministic 28-second scenario covers idle (0–4 s), acceleration/shifts (4–12), cruise (12–16),
braking (16–20), a corner (20–24) and stopping (24–28). Temperatures, fuel and trip use fixed fabricated values.
Raw encoding follows `meters/js/data.js` and `docs/13-gauges.md`: RPM ÷2, speed ×100, acceleration centred
on 4000, temperatures +40. Slow mock reads run once per second for convenient development, not the car's ten-second interval.

This is a development fixture, not a physics model or calibration evidence. Brake pressure and slope are fixed
because their scales are unknown. It does not invent working gear/steering signals on the ND1: gear still uses
Meters' existing RPM/speed fallback. It does not simulate the Mazda menu framework, installation, hardware timing,
CPU limits or smdb locking. **Nothing here has been tested in a real car.**

## Tests

Node is also needed to check the real Meters data module's scaling and freshness:

```sh
# Native: POSIX sh + gawk
python3 dev/tests/test_dev.py
# Or the same lifecycle and collector tests under BusyBox
MO_DOCKER_IMAGE=busybox:1.25 python3 dev/tests/test_dev.py
# Browser test (after the existing Playwright setup in meters/tests/v3/README.md)
cd meters/tests/v3
MO_DOCKER_IMAGE=busybox:1.25 npx playwright test collector-dev
```

On PowerShell set `$env:MO_DOCKER_IMAGE = "busybox:1.25"` instead of the POSIX variable prefix.
The tests use only fabricated data, regardless of whether private dumps exist. They check continuous collector
output, raw-to-unit conversion (including intake/outside temperature and fuel), HTTP isolation and malformed-path
rejection, pause/resume, stale-data detection and cleanup.

This contribution is independent of nd-gauges' dashboard revisions: no nd-gauges UI, Mazda firmware assets or fonts
are imported. Stock-menu emulation and recording replay are separate follow-up work, not part of this synthetic preview.

Inspired by the simulator/mock-D-Bus/preview approach in [gabrik/nd-gauges](https://github.com/gabrik/nd-gauges),
adapted for MiatOff's raw data format and passive collector. GPL-3.0-or-later.

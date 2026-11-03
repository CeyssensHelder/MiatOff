# MiatOff collector (live vehicle data for Meters)

`miatoff-collector.sh` writes the live vehicle data shown by the Meters page (`meters/`) to
**`/tmp/miatoff/live.txt`**. Background and measurements are in [docs/13](../docs/13-gauges.md).

## How it works
- **Fast, 6–10 times per second:** Mazda's own `dbus-monitor` listens to the broadcast signals of the
  vehicle service (`com.jci.vbs.vdt`, `com.jci.vbs.bcm`) on `/tmp/dbus_service_socket`. Listening in uses
  **no lock** and does not touch smdb. `awk` keeps the last value of each signal and rewrites `live.txt` on
  every speed signal (±10 Hz).
- **Slow, every 10 s:** one `smdb-read -n vdm_vdt_current_data` and one `smdb-read -n vdm`, one after the other, for values
  that are not on D-Bus: temperatures, yaw rate, brake pressure, fuel level, trip and consumption. They are included in
  `live.txt` on the next write.
- **smdb safety:** at most one `smdb-read` at a time, no timeout, and the collector never sends a signal
  to `smdb-read`. If the collector stops, a running `smdb-read` simply finishes. Background: an aborted
  `smdb-read` can hold the smdb lock, after which the unit restarts itself (docs/13).
- Only BusyBox and Mazda's own programs; nothing to compile. Everything stays in `/tmp/miatoff` (RAM):
  `live.txt`, `slow.txt`, `collector.pid`, `collector.log`. Runs at `nice 5`. If `dbus-monitor` stops, it restarts
  after 2 s. A second instance stops immediately.

## Format of live.txt
One `Field=value` per line, raw values, replaced atomically (`live.txt.tmp` → `mv`). Field names are the
smdb names where they exist. Example, made from the recording of 27-10-2026 (±122 km/h in 6th):

```
VehicleSpeed=12256              ×0.01 km/h            (D-Bus Veh_V_ActlEng)
EngineSpeed=1604                ×2 rpm                (D-Bus EngAout_N_Actl)
AccelPedalPosition=661                                (D-Bus ApedPos_Pc_ActlArb)
LongitudinalAccelerometer=3994  ×0.01 − 40 m/s² (4000 = 0)   (D-Bus VehLong_A_Actl)
LateralAcceleration=3977        ×0.01 − 40 m/s² (4000 = 0)   (D-Bus Lateral_Acceleration)
WheelSpeed1..4=22214…22261      ×0.01 − 100 km/h, presumably FL, FR, RL, RR (D-Bus WheelSpeedNotification)
WheelSpeedSeq=3663              counter of that signal
CarSpeedResp=22230              ×0.01 − 100 km/h     (D-Bus, bcm)
FuelPulse=108, Odocount=193     counters              (D-Bus)
EngClnt_Te_Actl=129             −40 → 89 °C           (smdb, every 10 s)
DR_IntakeAirTemp=58, Out-CarTemperature=53   −40 °C  (smdb)
YawRate=2051                    ×0.03663 − 75 °/s (2047.5 = 0)  (smdb)
BrakePressure=152, DR_Slope=32  scale unknown         (smdb)
FuelGaugePosition=180           full ≈ 184            (smdb)
PID_Drv1Dstnc_curr, Drv1AvlFuelE                      (smdb vdm: trip, consumption)
LiveSeq=97                      counts the writes; if it stops rising, the data has stopped
```

The scales come from public sources (see [docs/13](../docs/13-gauges.md#scales-from-public-sources)) and
match the measurements in the car. Other signals of these two interfaces keep their own name (e.g. `BrakePedalDepressedStatus`,
`GearPosNotification`, `SteWhlComp_An_Est` if the car sends them). Diagnostics, DTCs and the `$PASCD` text are left out.

## Starting
Not yet installed in the car: that belongs to the Meters installation (automatic start and stop still has to
be designed). By hand, on the unit:
```bash
sh /path/to/miatoff-collector.sh &
```
Stop with `kill $(cat /tmp/miatoff/collector.pid)` (TERM, never `-9`).

## Testing without a car
```bash
python collector/tests/test_collector.py
```
```bash
MO_DOCKER_IMAGE=busybox:1.25 python collector/tests/test_collector.py
```
If the private dump of 27-10-2026 is present, the fake `dbus-monitor` and `smdb-read` play back the **real** recording of
that drive; otherwise (or with `MO_SYNTHETIC=1`) a small fabricated one. The tests check:
- every D-Bus field against a separate parser, and the slow fields;
- that other interfaces, diagnostics and NMEA text stay out;
- continuous rewriting and that only one instance runs;
- a clean stop while `smdb-read` is busy (it has to finish by itself).

**Result (27-10-2026):** all tests pass natively (real and fabricated data) and under BusyBox 1.25.
**Not tested:** on the CMU itself (BusyBox 1.19, the real `dbus-monitor` with two match rules, CPU load while
driving).

## Calibration
`tools/calibrate.py` calculates the scales from a recording of the dump stick (**MORE → CALIBRATION**, see
[dump-stick/README](../dump-stick/README.md#calibration-drive)). It does not need precise manoeuvres:
- **zero points:** standstill of at least 5 s;
- **throttle pedal:** minimum and maximum;
- **longitudinal acceleration:** the sensor against the change in speed;
- **yaw rate:** against the rotation rate derived from the difference between left and right wheels (track width 1.50 m);
- **lateral acceleration:** against speed × rotation rate;
- **wheel order:** in a corner the front wheel on each side travels a wider arc, and is therefore slightly faster.

Tested on fabricated drives with known values (`python collector/tests/test_calibrate.py`): zero points exact,
wheel scale within 0.1 %, lateral acceleration and yaw rate within 1 %, longitudinal within 5 %, and the swapped wheel order
correctly recognised.

## Licence
GPL-3.0-or-later.

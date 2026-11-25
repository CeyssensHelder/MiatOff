# 13 — Gauges (meters) on the Mazda Connect screen

> Status 27-10-2026. Sources: Trevelopment/MZD_Speedometer (GPL-3.0, source code read), and the
> first dump of this unit (EU 74.00.324A). Nothing built or tested in the car yet.

## What commercial tools offer (vendor claims)
Commercial tweak products advertise a gauges app ("Meters") fed by vehicle data the screen already has: roughly 60 live
values (speed, rpm, coolant, trip, individual wheel speeds, relative brake pressure, steering torque, slope, intake
pressure, battery voltage, GPS), several themes and no OBD adapter. Some claim a faster reader of the vehicle messages than
the standard data source, without saying how.

## Open-source reference: MZD_Speedometer (Trevelopment, GPL-3.0)
Last changed 2019, made for MZD-AIO (officially up to firmware v59, manually also on v74).
This is how it works (from the source code):
1. **Data:** `speedometer.sh` queries values in a loop:
   - `smdb-read -n vdm_vdt_current_data -e VehicleSpeed` (and `EngineSpeed`, `EngineLoad`,
     `TransmissionGearPosition`, `EngClnt_Te_Actl`, `DR_IntakeAirTemp`, `Out-CarTemperature`, `FuelGaugePosition`,
     `Battery_StateOfCharge`, …), every 0.5 s for driving data and every 3 s for the rest;
   - `smdb-read -n vdm -e PID_Drv1Dstnc_curr` / `Drv1AvlFuelE` (trip and consumption);
   - GPS via D-Bus: `com.jci.lds.data.GetPosition` on `/tmp/dbus_service_socket`.
2. **Transport:** `websocketd` (a 5.9 MB ARM binary) puts the output of that script on a websocket.
3. **Screen:** an HTML/JS/CSS app in `/jci/gui/apps/_speedometer/`, shown by Opera (the Mazda HMI).
4. **Hooking into the menu:** via Opera **user scripts** (`/jci/opera/opera_dir/userjs/`), which MZD-AIO enables.

Forums report that the standard data source refreshes only about **once per second** (rpm sometimes slower). That is
probably why commercial products use a faster reader of their own.

## What is present on this unit (74.00.324A)
| Needed | On the unit | Remark |
|---|---|---|
| `smdb-read` | ✅ `/jci/bin/smdb-read` | |
| Data source `vdm_vdt_current_data` | ✅ schema with **279 fields** (`/jci/smdb/vdm_vdt_current_data.xml`) | Filled by `jciblmVdt` (starts 36.6 s, behind `stage_gap2`). **Do not switch off.** |
| Trip/consumption `vdm` | ✅ 37 fields | |
| GPS (`com.jci.lds.data`) | ✅ service `jciLDS` is running | |
| Opera user scripts | ⚠️ folder exists (`fps.js`), but **`User JavaScript=0`** in `/jci/opera/opera_home/opera.ini` | Enabling = 1 line on root |
| `websocketd` | ❌ | Ship it, or a lighter alternative (see below) |

Interesting fields in the schema (whether they are filled on an ND1 has **not been measured yet**):
`VehicleSpeed`, `EngineSpeed`, `AccelPedalPosition`, `SteeringWheel`, `LongitudinalAccelerometer`,
`LateralAcceleration`, `YawRate`, `BrakePressure`, `EngineLoad`, `TransmissionGearPosition`, `DR_ClutchSW`,
`DR_NeutralSW`, `EngClnt_Te_Actl`, `DR_IntakeAirTemp`, `Out-CarTemperature`, `Battery_StateOfCharge`,
`FuelGaugePosition`, `DR_Slope`, `Headlight_HiBeam_OutputStatus`, `BlowerSpeed`.

## Measurement 27-10-2026 (dump 002, cold start, driving during the sweeps)
Source: `dumps/eu-74.00.324/002-snapshot-up84s-2026-10-27/vehicle-data/` (private: contains GPS positions and a drive log).

**748 fields** in 21 namespaces; 56 changed between the two sweeps (±80 s between them).

| Field (`vdm_vdt_current_data`) | Seen | Live? | Presumed scale (to be calibrated) |
|---|---|---|---|
| `VehicleSpeed` | 1029 driving, 0 stationary | ✅ | ×0.01 km/h (10.3 km/h); see "Scales from public sources" |
| `EngineSpeed` | 709 driving, 355 idle | ✅ | ×2 rpm (idle ≈ 710) |
| `AccelPedalPosition` | 355 / 0 | ✅ | unknown |
| `BrakePressure` | 152–153 | ✅ | relative (commercial tools show "% of hard braking") |
| `LongitudinalAccelerometer` | 4018–4190 | ✅ | ×0.01 − 40 m/s² (4000 = 0) → G-meter possible |
| `LateralAcceleration` | 3966–4226 | ✅ | ×0.01 − 40 m/s² (4000 = 0) |
| `YawRate` | 2047–2872 | ✅ | rest ≈ 2047 |
| `EngClnt_Te_Actl` | 93 → 108 | ✅ | −40 °C? (53 → 68 °C, warming up) |
| `DR_IntakeAirTemp`, `Out-CarTemperature` | 64–65, 60–61 | ✅ | −40 °C? |
| `FuelGaugePosition` | 74 → 70 | ✅ | unknown |
| `DR_Slope` | 32–35 | ✅ | slope |
| `LatitudeByGPS`, `LongitudeByGPS` | | ✅ | |
| `SteeringWheel` | 32766 fixed | ❌ | invalid on the ND1 |
| `TransmissionGearPosition`, `EngineLoad`, `Battery_StateOfCharge` | 0 | ❌ or unknown | |

Trip/consumption in `vdm` is live (`PID_Drv1Dstnc_curr`, `Drv1AvlFuelE`, …). GPS via D-Bus works (`GetPosition`:
fix status, time, position, altitude, heading, speed).

**Speed of the data source:** one `smdb-read` call costs **±90 ms** on the CMU (1496 values in 170 s; 8 fields
per row → one row per 0.7 s). The values themselves change on every row, so the data source refreshes at least that fast.
With `smdb-read` you therefore get about **1.4 frames per second** for 8 values: enough for temperatures, fuel
and trip, too slow for a smooth rev counter or G-meter.

**Faster:** the smdb lives in System V shared memory (`/tmp/shm_key_gen.txt`) and there is a library
**`/jci/lib/libjcismdb.so`**. A small ARM program of our own using that library can read all fields in one process,
presumably 10× per second or more. That is probably what commercial products do. The API of that
library is still unknown: for that, `libjcismdb.so` and `smdb-read` have to be examined from a FULL dump.

## Scales from public sources
The D-Bus signals carry **Ford CAN names** (Mazda/Ford heritage). The scales are in the Ford and Mazda definitions
of [commaai/opendbc](https://github.com/commaai/opendbc) (`ford_lincoln_base_pt.dbc`, `ford_fusion_2018_pt.dbc`,
`mazda_2017.dbc`) and in [MZD_Speedometer](https://github.com/Trevelopment/MZD_Speedometer) (`speedometer.js`).
They match what we measured in the car (drive 27-10-2026, 122 km/h in 6th):

| Field | Scale | Source | Check in the car |
|---|---|---|---|
| `VehicleSpeed` | ×0.01 km/h | Ford `Veh_V_ActlEng` | ✅ = GPS 122.5 km/h |
| `EngineSpeed` | ×2 rpm | Ford `EngAout_N_Actl`, MZD_Speedometer | ✅ 3204 rpm fits 6th |
| `AccelPedalPosition` | ×0.1 % (0–102.3) | Ford `ApedPos_Pc_ActlArb` | plausible (66 % at 122 km/h) |
| `LongitudinalAccelerometer`, `LateralAcceleration` | ×0.01 − 40 m/s² (**4000 = 0**) | Ford `VehLong_A_Actl`/`VehLat_A_Actl`, Mazda `VEHICLE_ACC_X` | ✅ 3993–3999 = −0.07…−0.01 m/s² at constant speed; stationary 4024 = +0.24 m/s² (slope) |
| `YawRate` | ×0.03663 − 75 °/s (**2047.5 = 0**) | Ford `VehYaw…_W` | ✅ stationary 2046–2047 |
| `WheelSpeed1..4`, `CarSpeedResp` | ×0.01 − 100 km/h; wheels presumably FL, FR, RL, RR | Mazda `WHEEL_SPEEDS` | ✅ 22228 = 122.3 km/h |
| `EngClnt_Te_Actl`, `DR_IntakeAirTemp`, `Out-CarTemperature` | −40 °C | MZD_Speedometer (as with OBD) | plausible (89 °C warm, 13 °C outside) |
| `FuelGaugePosition` | full ≈ 184 (another source: ≈ 181), not linear in litres | MZD_Speedometer | |
| `BrakePressure`, `DR_Slope` | unknown (commercial docs: brake pressure relative) | | |

With that, a separate calibration drive is no longer needed. Only brake pressure and slope have no published scale.

**Direction (left/right), probable but not proven:** positive = **turn to the left**, for both
`YawRate` and `LateralAcceleration`.
- openpilot (`opendbc/car/ford/carstate.py`) uses Ford's `VehYaw_W_Actl` unchanged as `yawRate`, and openpilot
  counts a left turn as positive (ISO 8855).
- In dump 002, `YawRate` (+30 °/s) and `LateralAcceleration` (+2.3 m/s²) both swung positive in the same sweep,
  at 10 km/h. So they follow the same direction, and the magnitude fits speed × yaw rate (±1.5 m/s²).
- Not proven because Mazda's `YawRate` (12 bit, ×0.03663 − 75) is a different Ford signal than `VehYaw_W_Actl`, and the
  VBS converts the values. One corner with the gauges on confirms it.

## ⚠️ Risk: starting `smdb-read` repeatedly (and aborting it)
[junoh-moon/mazda-aa-dr](https://github.com/junoh-moon/mazda-aa-dr) (same type of car and firmware, MX-5 ND2
74.00.324A) reports in [v0.3.12-shadow.4](https://github.com/junoh-moon/mazda-aa-dr/releases/tag/v0.3.12-shadow.4):
- Their collector started `smdb-read` about every 3 s and **killed** it on a timeout (SIGKILL; 175 times in one boot).
- After ±24 min of driving the CMU restarted: `jciblmVdt` (which fills smdb) did not answer for 30 s, and the Service Manager
  stopped the watchdog.
- Their best explanation (60–80 %, not proven): an aborted `smdb-read` left smdb's **named POSIX semaphore**
  locked, without recovery, after which `jciblmVdt` kept hanging. They no longer read smdb at all and get
  wheel speed, yaw rate and acceleration from the VBS (a hook in `libjcivim_api.so`/`libjcimod_can.so` in `jciVBS`).

Consequences for MiatOff:
- Never abort (or crash) an `smdb-read` (or an own reader holding the smdb lock) while it is reading.
- A gauge app that keeps starting `smdb-read` has this risk as soon as something aborts it; MZD_Speedometer does so
  without a timeout and is therefore less sensitive to it, but not free of it either.
- **Prefer a source without a lock.** Candidate: D-Bus signals from the VBS (listening in does not use the smdb lock).
  Dump stick 1.2.0 (FULL) therefore records 10 s of signals on both buses, plus the interfaces, `ipcs` and
  copies of `libjcismdb.so`/`smdb-read`/VBS modules to examine the API on the PC.
- A hook in `jciVBS` as mazda-aa-dr does is too risky for MiatOff: 85 services depend on it and it is
  set to `reset_board="yes"`.

## Fast data source found: D-Bus signals from the VBS (dump 003, 27-10-2026)
Source: `dumps/eu-74.00.324/003-full-up88s-2026-10-27/research/` (FULL, driving ±122 km/h in 6th; private).

The vehicle service (`jciVBS`) sends the driving data out as **broadcast signals** on the service bus
(`/tmp/dbus_service_socket`). Listening in (`dbus-monitor`, present on the unit) touches **no smdb and no lock**.
Measured over 10 s:

| Signal (interface.member) | Type | Per s | Same value as smdb field | Example |
|---|---|---|---|---|
| `com.jci.vbs.vdt.Veh_V_ActlEng` | q | 9.6 | `VehicleSpeed` (×0.01 km/h) | 12268 = 122.7 km/h |
| `com.jci.vbs.vdt.EngAout_N_Actl` | q | 6.3 | `EngineSpeed` (×2 rpm) | 1602 = 3204 rpm (6th ✓) |
| `com.jci.vbs.vdt.ApedPos_Pc_ActlArb` | q | 6.9 | `AccelPedalPosition` | 660 |
| `com.jci.vbs.vdt.VehLong_A_Actl` | q | 9.4 | `LongitudinalAccelerometer` | 3993 |
| `com.jci.vbs.vdt.Lateral_Acceleration` | q | 9.6 | `LateralAcceleration` | 3980 |
| `com.jci.vbs.bcm.WheelSpeedNotification` | (qqqqqqt) | 9.7 | — (4 wheels) | 3567, 0, 22228, 22219, 22276, 22270, 0 |
| `com.jci.vbs.bcm.CarSpeedResp` | u | 9.7 | — | 22248 (×0.01 − 100 = 122.5 km/h) |
| `com.jci.vbs.bcm.PASCDNotification` | (ay) | 3.9 | — | `$PASCD,…,34.039,…` (speed in m/s, 10 Hz samples) |
| `com.jci.vbs.vdt.FuelPulse`, `OdoCount` | y | 9.9 | | counters |

Also available (on change, or via a method without a lock): `SteWhlComp_An_Est` (steering angle estimate),
`BrakePedalDepressedStatus`, `GearPosNotification`, `TransmChangeLeverPositionNotification`,
`PrkBrkActvNotification`, `BatteryVoltageFlag`, `Ignition_Status`, `CmltAvlFuelE_D_HEC` (consumption); methods including
`com.jci.vbs.bcm.GetGearPos`, `GetWheelSpeed`, `GetCarSpeed`.
**Not via D-Bus:** coolant, intake and outside temperature, yaw rate, brake pressure, fuel level. Those are
only in smdb.

**smdb side (for completeness):** every namespace has its own named POSIX semaphore
(`/dev/shm/sem.smdb_<namespace>`); `libjcismdb.so` uses `sem_wait`/`sem_post` without recovery
(`SMDB_Open`, `SMDB_Lock`, `SMDB_ReadIntData`, …). `smdb-read -n vdm_vdt_current_data` **without `-e`** returns all
fields in **one** call (one process, taking the lock once).

**Built:** [collector/](../collector/README.md) (`miatoff-collector.sh`, 27-10-2026). Writes
`/tmp/miatoff/live.txt` according to the plan below; tested with the real recording of this drive. Not yet run in the car
and not yet started automatically.

**Calibration (27-10-2026):** dump stick 1.3.0 has **MORE → CALIBRATION** (5 min recording of the signals with
timestamps, plus `YawRate` from smdb). `collector/tools/calibrate.py` calculates zero points, pedal range,
gains and the wheel order from that; see [collector/README](../collector/README.md#calibration). **Calibration drive
skipped (28-10-2026):** the scales come from public sources (see "Scales from public sources"). The mode
remains available to verify them, e.g. the left/right direction.

### Recommended collector
1. **Fast (6–10 Hz), lock-free:** `dbus-monitor --address unix:path=/tmp/dbus_service_socket` with match rules
   for `com.jci.vbs.vdt` and `com.jci.vbs.bcm` → `awk` → `field=value` lines with the smdb names the gauges
   expect (`Veh_V_ActlEng`→`VehicleSpeed`, etc.), rewritten in place in `/tmp` (tmpfs) with `LiveSeq` last, so a
   reader can skip a write it caught halfway (no `mv` per write; see docs/15, Known issues). Only BusyBox and
   Mazda's own `dbus-monitor`; nothing to compile.
2. **Slow (about every 10 s), for temperatures, yaw rate, brake pressure and fuel:** one `smdb-read -n vdm_vdt_current_data`
   per round, **never abort** and never two at once. Optional: without this part everything works except those values.

## Meters in the Mazda menu: existing projects (research 28-10-2026)
There is **no ready-made open-source project** that adds an own app to the menu on v74. There are:

| Project | What | v74? | Usable? |
|---|---|---|---|
| [MZD-AIO](https://github.com/Trevelopment/MZD-AIO) (GPL-3.0) | Userscript `userjs/additionalApps.js` + `additionalApps.json` puts apps in **Applications** | Officially up to v70. The speedometer, which uses the same mechanism, works on 74.00.324 for most reporters according to community reports | The **mechanism** yes; the AIO package itself no (replaces whole files; the AA app causes boot loops on v70/v74) |
| [CASDK](https://github.com/flyandi/mazda-custom-application-sdk) | Same idea via `userjs/CustomApplicationsProxy.js` | Up to v59 | No: also switches off the watchdog in `sm.conf` and replaces `stage_wifi.sh` |
| [softwarecrash/mzd-v74-tweaks](https://github.com/softwarecrash/mzd-v74-tweaks) (Oct. 2026, no licence) | v74 tweaks (disclaimer, consumption, HUD, oem-aa-mod) | Yes, 74.00.324 | No apps. It does confirm our disclaimer approach: their `systemApp.js` does functionally the same, on the same source file |

**How AIO's mechanism works** (`additionalApps.js`, read):
1. Opera loads user scripts when `User JavaScript=1` in `/jci/opera/opera_home/opera.ini`.
2. When `systemApp` loads, the script adds items to `_masterApplicationDataList` (the Applications
   list), with a text in `framework.localize._appDicts` and a category.
3. When such an item is chosen it **borrows** a disabled Mazda app (`vdt` = "Drive Record",
   MMUI event `SelectDriveRecord`, context `DriveChartDetails`). The MMUI thinks that app opens; the script
   uses `framework.routeMmuiMsg` and `framework.sendEventToMmui` to redirect the messages to the own app in
   `/jci/gui/apps/<name>/`.

**Checked in our v74 files (dump 003):** all hooks exist. `_masterApplicationDataList`,
`_applicationsCtxtWiseAppNames`, context `Applications` with `List2Ctrl`, `_menuItemSelectCallback`,
`GuiFramework.prototype.routeMmuiMsg` / `sendEventToMmui` / `getAppInstance` / `getCurrentApp` / `getCurrCtxtId`,
`Websockets.prototype.sendEventMsg` (same parameters), and `vdt` is set to `disabled : true` with
`SelectDriveRecord`; `vdtApp.js` has `DriveChartDetails`. In `opera.ini`: `User JavaScript=0`,
`User JavaScript File=$OPERA_DIR/userjs/` (where only the stock `fps.js` lives, an FPS counter) and **no**
`Allow File XMLHttpRequest`.

**Built for MiatOff (28-10-2026, not yet tested in the car)** — [meters-app/](../meters-app/README.md), installation via the AA-touch stick (EXTRA → METERS, [README](../aa-touch-stick/README.md#meters-menu-extra--meters)):
- `opera.ini`: `User JavaScript=1`, `User JavaScript File` to an **own folder** (so the stock `fps.js` does not
  run along and does not need renaming) and `Allow File XMLHttpRequest=1` (for `live.txt`). No
  watchdog changes.
- One own userscript modelled on AIO's, but which **wraps** the original framework functions instead of
  replacing them (AIO's `sendEventToMmui` omits the stock logic).
- A small Mazda app `/jci/gui/apps/miatoff/` that shows the Meters page full screen, and the collector as a service
  that starts at boot.
- Everything hash-checked and reversible via the stick, like the rest.
- The collector starts through one line in `/jci/scripts/stage_gap2.sh` (stock that script is empty); the page reads
  `live.txt` via a symlink to `/tmp/miatoff/live.txt`.
- **Risk:** an error in `opera.ini` or the userscript affects the Mazda menu itself. Whether `jci-dialog` (the stick's
  dialog) still works then, we do not know. Hence the emergency route without a dialog: an empty file `MIATOFF-RESTORE` on
  the stick puts Meters and the warning patch back; if the dialog fails twice, the same happens.

## Feasibility and approach
**Feasible:** the data, the GPS and the display mechanism are there. What is still unknown: **which fields are really live
on this car and how fast they refresh.** That determines whether it becomes a nice speedometer or something approaching
commercial gauge apps (G-meter, pedal, steering).

Proposed steps:
1. ~~**Measure (read only).**~~ Done on 27-10-2026, see above. Still open: the scales (a drive with known
   speed and rpm) and the API of `libjcismdb.so` for a fast reader.
2. **Choose a design** based on that measurement:
   - **A. Port MZD_Speedometer** (GPL-3.0): proven, but old, depends on `websocketd` (5.9 MB) and on the
     AIO menu mechanism.
   - **B. Own MiatOff Meters**: own HTML/JS gauges with the same data source, as small as possible (e.g. a
     background script that writes values to `/tmp` and an app that reads them, if Opera allows it).
3. **Install like AA touch:** everything hash-checked and reversible. Changes on root: `opera.ini`
   (1 line), a userscript, and the app files. No `Common.js` (TouchTune) and no `sm.conf`.

**Risks:** an error in `opera.ini` or in a userscript affects the Mazda menu itself (Opera). Android Auto runs
separately, but the home screen can then drop out until it is restored. Hence test first with an invisible
userscript, and always with the DISABLE/REMOVE route of the stick.

## Sound on the unit
For the Meters shift sound ([meters/README.md](../meters/README.md)). **Nothing here is tried in a car yet.**

- **What the page can try.** HTML5 audio with the payload's `sounds/tick.wav` and `sounds/shift.wav`, or the HMI's
  own `framework.common.beep("Short", "Touch")`. Our Home script already uses that beep for a tap. The Meters page sits in
  an iframe of the HMI template, so it calls the beep through `window.parent`.
- **What the audio capture shows** (the private run of the [audio research stick](../audio-research-stick/README.txt),
  read on the PC and summarised in our own words). The unit's audio manager is a set of Lua services on D-Bus. They
  give each stream a type and settle what happens when a second stream starts. A *tone* stream is mixed over media
  instead of replacing it. There is also a separate *BEEP* volume group next to media, navigation and the phone. The
  HMI's beep probably goes this way: over the music, at the beep volume.
- **Still unknown.**
  - Whether Opera Presto on this unit plays HTML5 audio at all, and which output it would get next to the audio
    manager, which owns ALSA.
  - Whether the touch-beep setting in the car mutes the HMI beep.
  - Which other beep types the HMI accepts besides `"Short", "Touch"`.

  The style list's sound test settles the first two in the car.
- **First car result (sound test, parked).** The sound files play, and are heard over Bluetooth audio and Android Auto, but
  not over the FM radio. Likely reason (not measured): the radio reaches the speakers on its own path, which the
  software mix of the browser does not join. The [audio paths stick](../audio-paths-stick/README.txt) plays a test
  sound on each ALSA output of the unit with the radio on and asks the driver which ones were heard. That decides
  whether a helper on the unit can play the files over the radio.
- **Audio paths 0.1.0 result (FM on).** The probe played without an error on the first 16 outputs (`default`, the
  `information*` and `telephonyPrompt*` outputs), and none was heard. So the output name is not what matters: the
  audio manager decides what reaches the speakers while the tuner is the source. The public
  [gartnera/headunit](https://github.com/gartnera/headunit) (AGPL-3.0) gets Android Auto audio through by asking
  `com.xsembedded.service.AudioManagement` (`com.xsembedded.ServiceProvider.Request`) first: `openSession`,
  `registerAudioStream` (stream `MLENT`, focus `transient` or `permanent`), `requestAudioFocus`, and later
  `abandonAudioFocus` / `closeSession`.
- **Audio paths 0.2.0 result.** The audio manager refused headunit's request: `registerAudioStream` answered
  `Mandatory arg (streamType) missing`, so no turn was granted and nothing was really tested (none heard). Its stream
  list shows the types this firmware uses: `Media` (FM is `5.Media.FM.gained.playing`), `InfoMix` (`NAVIVOL`, the
  navigation voice), `InfoUser`, `LowAlert` (TA), `HighAlert`, `IncomingRg`, `Telephony`, `VR`, `AAMedia`,
  `AAGuidance`, `AAGuidanceNoMix`, `AAVR` and the CarPlay types. Public serial logs show the unit's own services
  registering with `streamName`, `streamModeName`, `streamType` and `focusType`. Another public app requests focus
  with `"requestType":"request"` and reports `audioActive` `{"playing":true}`. Audio paths 0.3.0 does that with
  transient turns of `InfoMix`, `AAGuidance`, `LowAlert` and `Media`.
- **Audio paths 0.3.0 result.** Every turn was granted: the audio manager sent `audioFocusChangeEvent` gained and lost
  for each stream. `InfoMix` and `AAGuidance` got a `mixId` with FM still playing. `LowAlert` put FM in
  `temporarilyLost` and `Media` made FM `lost`: the radio went quiet and came back. The beeps were never heard, not
  even while FM was muted. Likely (not proven): level and routing belong to the unit's known stream names
  (`NAVIVOL`, `BTHFVOL`, `RINGTONEVOL` read like volume groups), so a stream of our own name stays silent. Audio
  paths 0.4.0 borrows the existing `NAVIVOL` and `AAGuidance` sessions instead, as the public dump1090 app and
  headunit reuse existing sessions. It skips a stream that is in use.
- **Audio paths 0.4.0 result: first sound over FM.** Borrowing the unit's own `AAGuidance` session works. The audio
  manager gave it the focus (`gained`, `focusType` `permanent`; the list showed `AAGuidance.gained.playing` with a
  `mixId`, FM still `gained.playing`). The beeps on `androidautoAltAudio` and on `informationAndroidAutoAltAudVol` were
  both heard, and the radio was lowered (ducked) during them, as for Android Auto directions. The first try on
  `androidautoAltAudio` was repeated (AGAIN) before it was heard. Borrowing `NAVIVOL` gave the focus too, but nothing
  was heard on `informationNavi`, `informationNaviVol` or `default`. Open: how soon after the request a beep can
  start (the test waited 1 s), whether one turn can carry several beeps, and what happens when Android Auto itself is
  connected and owns that session. Audio paths 0.5.0 measures the first two: waits of 1, 0.5, 0.2 and 0 s after the
  turn, with the time of each call recorded, and three groups of beeps in one turn.
- **Audio paths 0.5.0 result.** All three beeps were heard in every test, even with no wait after the turn, on both
  outputs; one turn carried three groups of beeps, with the radio lowered the whole time. The calls cost the time:
  `requestAudioFocus` took about 0.2 s and `audioActive` about 0.5 s, so a beep asked for at the shift point starts
  about 0.75 s late. The ducking is the guidance stream's normal behaviour. The driver wants neither the delay nor the
  ducking. Untested: whether the focus alone (without `audioActive`) is heard and ducks, whether holding the focus
  ahead of the shift point keeps the radio at full volume, and the `alertGeneric` outputs that 0.1.0 never reached.
  Audio paths 0.6.0 tests those three: `alertGeneric` and `alertGenericVol` without a turn, the `AAGuidance` focus
  without `audioActive`, and that focus held 3 s silent before the beeps, asking each time whether the radio kept its
  normal volume.
- **Audio paths 0.6.0 result: heard without the dip.** `alertGeneric` and `alertGenericVol` without a turn: not
  heard. The `AAGuidance` focus WITHOUT `audioActive`: all beeps heard on `androidautoAltAudio` and
  `informationAndroidAutoAltAudVol`, and the radio kept its overall volume. The audio manager still listed the stream
  as `gained.playing` with a `mixId`, so `audioActive` is not needed. What the driver hears: the guidance sound plays
  on one speaker, and the radio goes quiet on that speaker only while the others keep playing, the same as the
  car's lane-assist warning. `requestAudioFocus` took 0.20 to 0.45 s (the first one the slowest), and the play
  started about 0.05 s after it. A focus held 3 s before the beeps carried both groups; the answer for the radio
  during that wait was "lowered", but the driver reported one misclick, so that answer is not certain. So a beep
  asked for at the shift point starts about 0.3 to 0.5 s late; a focus taken ahead of the shift point (for example
  at the amber zone) leaves only the player's start.
- **Radio shift beep: open question (not built).** Only a helper on the unit can make the beep heard over the
  radio: it would borrow the idle `AAGuidance` session and play `shift.wav` on `androidautoAltAudio`, only on a
  tuner source (Android Auto not connected). Two designs, and the choice is put to the users first:
  - **Simple: beep at all times.** The collector already reads the rpm about 10 times a second. It plays one tone
    shortly before the shift point, about 0.4 s early to cover the focus request, whatever is on screen. It is
    switched on or off in the builder. About 40 lines in the collector, no signal from the page.
  - **Only while Meters is open**, with the page's ticks and steady tone. The helper would hold the focus from the
    amber zone to the upshift and needs a signal from the page, which runs in Opera and can neither start a program
    nor write a file. Audio paths 0.7.0 is a read-only probe for that signal (built and checked on a fake car only,
    not run in the car): it checks whether BusyBox `nc` can listen on 127.0.0.1 for a web request from the page,
    whether opening Meters shows on the HMI D-Bus, whether the page's sound test shows in the ALSA playback state,
    and which files Opera writes.

  Without either, the shift sound stays as it is: heard over Bluetooth audio and Android Auto, silent over the radio.

## Sources
- [Trevelopment/MZD_Speedometer](https://github.com/Trevelopment/MZD_Speedometer) (GPL-3.0; `speedometer.sh` read)
- [forum.miata.net — Real-time ECT on MZD Connect](https://forum.miata.net/vb/archive/index.php/t-648756.html) ·
  [mazda3revolution — AIO + CASDK](https://www.mazda3revolution.com/threads/aio-casdk.229797/) (forum: update ~1×/s)

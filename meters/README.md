# MiatOff Meters

Gauge pages for the Mazda Connect screen (800×480), as in [docs/13](../docs/13-gauges.md). Plain HTML, canvas and
ES5 JavaScript, because the CMU shows pages in an old Opera. There are no libraries and no build step.
Installed and used on our own car (see the [main README](../README.md#support-status) for which cars are supported).

**Menu.** First a list of styles (street, track, cyberpunk, 2077, 2077 night and, when there are any, custom), each with a live preview. Open one and you get
live previews of its pages. Pick one and the gauge fills the screen. **Back** goes up one level each time, and at
the style list it leaves the app. The app always starts in the style list, with the style used last time highlighted: press twice to get back to the page you used last.

| Control | Style list / previews | Gauge |
|---|---|---|
| Knob turn (`MiatoffMeters.next()` / `prev()`) | move the selection | next / previous page of the same style |
| Knob press (`MiatoffMeters.select()`) | open | (nothing, returns `false`) |
| Back button (`MiatoffMeters.back()`) | up one level; `false` at the style list = leave the app | back to the previews |
| Touch | tap a style or preview; ‹ in the header = back | long-press = back (on a lap page with the timer running: stop the timer), other taps as below |
| Keyboard (PC) | arrows, Enter, Esc / Backspace | same |

`?set=street|track|cyber|y2077|y2077n|custom&page=N` opens a gauge directly, `?menu` opens the style list.

**Custom.** The pages designed in the Meters Designer (`js/custom-pages.js`, written by the stick builder; empty in a checkout, so the group is hidden) drawn by `js/custom.js`, an ES5 port of the designer's renderer. At most eight pages, night styling, live data from the same values as the built-in pages. The picker shows four columns when there are more than six pages. No rev ring on these pages. Experimental: tried on our own car; see [docs/15](../docs/15-meters-designer.md) for the known issues.

**Street**
| Page | What's on it |
|---|---|
| DRIVE | Large tachometer (red zone from 7000) with the speed in it, a big gear number whose box also works as the shift light (amber from 6500, flashing red from 7200), coolant and fuel |
| G-METER | Full-height G-meter showing what you feel (accelerating moves the dot back/down, a left turn moves it right; `?gm=car` mirrors it) with trail, peak G left/right/accel/brake (tap the circle to reset), throttle and brake bars |
| POWER | Estimated power (PS) and torque (Nm) at the crank, and a dyno curve of the last full-throttle pull, next to the factory figures (131 PS at 7000, 150 Nm at 4800). The previous pull stays faintly visible for comparison. In other units (hp, kW, lb-ft) the chart has a power axis on the left and a torque axis on the right, each in its unit and in round steps that suit it |
| INFO | Six large tiles with a 1-minute sparkline: coolant, intake air, outside, fuel, trip, average fuel use |

**Track** (trackday). Every track page has a thin ring around the screen edge that fades inward: amber from
6200 rpm (fading in up to 6500), red from 7000. From 7200 it flashes: a brighter, thicker red ring that
reaches further in, alternating with no ring.

| Page | What's on it |
|---|---|
| TRACK | For reading from the corner of your eye: a full-width rpm bar 1000–7500 (green, amber from 6500, red from 7000, the whole bar flashes blue from 7200), a giant gear number, speed and rpm. Coolant only takes space when it is 105 °C or hotter (a red box) |
| LAP | Lap timer: tap the screen at the start/finish line (or `L`). Taps less than 5 s after the lap start are ignored and say TOO SOON. Long-press (1.2 s) stops the timer and drops the lap in progress (finished laps stay); with the timer stopped a long-press goes back as usual. Current lap time, the difference of the last lap to the best one (green faster, red slower), last, best and top speed of the last lap |
| G-METER | The same G-meter page |
| POWER | The same POWER page |
| SESSION | Maxima since the last reset: top speed, max rpm, best lap, max lateral G, max brake G, max coolant, number of laps and session time. RESET needs a second tap within 5 s |

**Power and torque are calculated, not measured.** The car sends no torque or power signal (`EngineLoad` and the
torque fields read 0 on the 1.5). [js/power.js](js/power.js) computes them from acceleration and speed:
wheel force = mass × acceleration + air drag + rolling resistance, crank power = force × speed ÷ 0.85, torque =
power ÷ engine speed. Assumptions: 1050 kg (`?mass=` changes it, e.g. with a passenger), CdA 0.55, Crr 0.012.
It is only right at full throttle (≥ 90 % pedal) with the clutch engaged; expect about ±10 %. A pull is recorded
while that holds in one gear and kept if it covers at least 1500 rpm. 3rd or 4th gives the cleanest curve:
in 1st and 2nd the revs rise too fast for the 10 updates per second.

**Cyber** (neon cyan / magenta / yellow, designs in [design/cyberpunk/](design/cyberpunk/)) and **2077** (yellow,
black-on-yellow, angular, designs in [design/cyberpunk2077/](design/cyberpunk2077/)) each have three pages: DRIVE,
G-meter and TRACK. All their pages have the rev ring, like the track set; their TRACK pages also work as a lap timer (tap the page
at the line). **2077 night** is the same three pages in a calmer palette: muted cyan instead of yellow, at about
40 % of its brightness, so the large fills do not draw the eye at night; red alerts stay red. On both 2077 sets the ring also gets "damage" glitches like in the game: amber LED-grid streaks from the
left and right edges from 6200 rpm, red streaks reaching further in from 7000, and from 7200 red streaks flash
across the whole screen. Kept light for the i.MX6: the small streak textures are made once when the page loads,
each redraw copies 4–10 random bands of them (new bands at most every 120 ms), and the glitch never forces a
redraw itself; only the shift flash does, once per toggle (every 90 ms). Big numbers
glitch for a moment at random every 3–8 s and on every gear change ([js/fx.js](js/fx.js)). Glow is drawn once into
offscreen layers; the frame loop only copies them, because shadow blur is too slow for the i.MX6.
They use two bundled fonts from [google/fonts](https://github.com/google/fonts): `fonts/ChakraPetch-Bold.ttf` and
`fonts/ShareTechMono-Regular.ttf`, both under the SIL Open Font License (`fonts/OFL-ChakraPetch.txt`,
`fonts/OFL-ShareTechMono.txt`). Without them the pages still work with system fonts, but look plainer. Numbers are
sized to fit their space (`FX.fit`), so a wider fallback font cannot run into its neighbours.

Laps are triggered by hand for now. Automatic laps need GPS in the collector, which it does not provide yet.
Lap times and session maxima are kept in memory only and are lost when the page is reloaded.

Rev limits (one table, `RPM` in [js/app.js](js/app.js)), for the ND1 1.5: 131 PS at 7000 rpm, 150 Nm at
4800 rpm, Mazda's redline 7000, fuel cut around 7500 (owner reports; some say lower in higher gears). Amber 6500,
red 7000, SHIFT 7200. Power stays close to its peak up to the cut-off and the gears are close together, so shifting
late is quickest. 7200 leaves about a quarter of a second to react before the cut-off.

**Shift sound.** A progressive shift beeper, like the ones of aftermarket tachometers: short ticks that speed up from
the amber line, then a steady tone at the shift point until you shift. Switched on per style and per page:
- **Built-in styles:** in the MiatOff app, under Meters (*Shift sound*: Street, Track, Cyberpunk, 2077, 2077 Night),
  for example on for Track and off for Street. The list travels in `js/car-profile.js` (`shiftSound`), with or without
  a car setup. They use the car's amber line and shift rpm.
- **Custom pages:** each page has its own switch in the designer (*Page style → Beep at the shift point*), and uses
  its own vehicle's amber line and shift rpm.

Off everywhere unless switched on. [js/shiftsound.js](js/shiftsound.js) decides when:
- **Ticks** from the amber line (or 700 rpm before the shift point), 450 ms apart there and 110 ms just below the
  shift point.
- **Steady tone** at the shift point (`sounds/shift.wav`, at most 1.5 s). It stops at the upshift: the rpm falls 200
  below its highest point.
- **Early:** both use the rpm a quarter of a second ahead, predicted from how fast it rises, so the tone comes when you
  move the lever rather than a reaction time later. It is never more than 1,000 rpm ahead, so a glitch in the data
  cannot sound the shift point far too early. At steady revs it is the rpm itself.
- **Then quiet**, the limiter included, until the rpm is back below the amber line.
- Only while moving (above 5 km/h), on fresh data (not when NO DATA would show) and on a gauge, not in the menus. It
  uses the raw rpm, not the smoothed needle. The car sends the rpm about six times a second, so the ticks and the
  early tone are only as fine as that.

The sounds are `sounds/tick.wav` (1.6 kHz, 50 ms) and `sounds/shift.wav` (2.6 kHz), made by
[tools/make_shift_sound.py](../tools/make_shift_sound.py); two pitches so the warning and the shift point sound
different. If the page cannot play them, the head unit's own short beep (`framework.common.beep("Short", "Touch")` of
the Mazda HMI that hosts the page) plays the ticks, and repeats every 120 ms in place of the steady tone.

A third choice, `sounds/rx7.wav`, is an **RX-7-style shift buzzer**: a loud, low electrical buzzer (about 220 Hz,
soft-clipped so it sounds louder) that sounds at the shift point in place of the steady tone, with no ticks before it
(the buzzer it imitates has none). It is synthesised by the same script, not a recording of any car. If its file cannot
play, the repeated Mazda beep takes its place.

**Not tried in a car yet:** whether Opera on the unit plays the files, how quickly, and how either sound mixes with the music, is
unknown. To find out, the style list shows *SHIFT SOUND* top right when the sound is on for at least one style or page
(touch only): tap it to hear a short demo of the chosen route (four ticks speeding up, then the steady tone; the buzzer
alone for the RX-7 one), tap again within 4 s to go on to the next route (*File*, *Mazda beep*, *RX-7 buzzer*, and
round again) and hear that one. The last choice is kept.

**Hearing it on a PC** (no car, no revving): open the page with the built-in simulator and `&sound=`, which switches
the sound on without a car file, for example `index.html?src=sim&set=track&sound=track`. The simulator drives a loop
up to about 7,400 rpm, so you hear the ticks and the steady tone every lap. `&sound=` takes style keys separated by commas
(`street`, `track`, `cyber`, `y2077`, `y2077n`), `custom` for every custom page, or `all`. The PC has no Mazda HMI,
so only the file plays (the sound test shows *No sound available* for the Mazda beep). The `dev/serve.py` drive
stays below 4,000 rpm and never reaches the shift point.

Sized for the 7" screen: no more than about six things per page, numbers 50–280 px, labels at least 18 px.

To change page: swipe, tap the page, tap the ‹ › corners, or press the arrow keys. `R` resets the peak G.

## Trying it on a PC
```
python -m http.server 8800 --directory meters
```
Then open `http://localhost:8800/` (the built-in driving simulator) or `http://localhost:8800/?src=sim:1` (the
simulator at 1 update per second, roughly what `smdb-read` gives).

To exercise the **real shell collector and file-polling path** instead of the browser simulator, use the
[full-stack development harness](../dev/README.md): `python3 dev/serve.py --docker busybox:1.25` from the
repository root. It supplies only synthetic data; no car or firmware dump is needed.

## Data
`?src=` chooses the source:
- `sim` / `sim:<hz>`: the simulator (this is the default)
- `ws://host:port`: a websocket
- `poll:<url>`: reads a file or URL every 100 ms

Each message can be JSON (`{"VehicleSpeed": 5000, ...}`) or lines like `Field=value` / `Field#value`, using raw
smdb field names. The scales are kept in a single table in [js/data.js](js/data.js). They come from public signal
definitions (commaai/opendbc, MZD_Speedometer) and match the 122 km/h drive (docs/13): speed ×0.01 km/h, rpm ×2,
temperatures −40 °C, throttle ×0.1 %, acceleration ×0.01 − 40 m/s², yaw ×0.03663 − 75 °/s, fuel raw/181 (not
linear in litres). Still unknown: `BrakePressure` (so the BRAKING bar shows deceleration in g instead) and
`DR_Slope`. The left/right sign is provisional (raw positive is probably a left turn, after openpilot and dump 002); confirm
it with one turn. On the ND1, `SteeringWheel`
(always 32766) and `TransmissionGearPosition` (always 0) are not usable, so the gear is calculated from rpm and speed.

The page itself never reads smdb. Its data comes from [collector/](../collector/README.md), which writes
`/tmp/miatoff/live.txt` about 10× per second from Mazda's own D-Bus signals, plus one `smdb-read` every 10 s for the
temperatures, fuel and trip. `LiveSeq` in that file counts the writes: if it stops rising, the page shows NO DATA
after 3 s. **Do not spawn `smdb-read` in a loop, and never kill one.** On this car and firmware that is suspected
of locking SMDB, after which the Service Manager resets the CMU (see docs/13).

In the car the page is meant to read the file through a symlink in its own folder (`?src=poll:live.txt`), because
it is not yet known whether Opera lets a page in `/jci/gui/apps` read `file:///tmp`.

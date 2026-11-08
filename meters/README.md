# MiatOff Meters

Gauge pages for the Mazda Connect screen (800×480), as in [docs/13](../docs/13-gauges.md). Plain HTML, canvas and
ES5 JavaScript, because the CMU shows pages in an old Opera. There are no libraries and no build step.
Not yet tested on the car.

**Menu.** First a list of styles (street, track, cyberpunk, 2077), each with a live preview. Open one and you get
live previews of its pages. Pick one and the gauge fills the screen. **Back** goes up one level each time, and at
the style list it leaves the app. The app reopens on the last gauge, and starts in the style list the very first time.

| Control | Style list / previews | Gauge |
|---|---|---|
| Knob turn (`MiatoffMeters.next()` / `prev()`) | move the selection | next / previous page of the same style |
| Knob press (`MiatoffMeters.select()`) | open | (nothing, returns `false`) |
| Back button (`MiatoffMeters.back()`) | up one level; `false` at the style list = leave the app | back to the previews |
| Touch | tap a style or preview; ‹ in the header = back | long-press = back (on a lap page with the timer running: stop the timer), other taps as below |
| Keyboard (PC) | arrows, Enter, Esc / Backspace | same |

`?set=street|track|cyber|y2077&page=N` opens a gauge directly, `?menu` opens the style list.

**Street**
| Page | What's on it |
|---|---|
| DRIVE | Large tachometer (red zone from 7000) with the speed in it, a big gear number whose box also works as the shift light (amber from 6500, flashing red from 7200), coolant and fuel |
| G-METER | Full-height G-meter showing what you feel (accelerating moves the dot back/down, a left turn moves it right; `?gm=car` mirrors it) with trail, peak G left/right/accel/brake (tap the circle to reset), throttle and brake bars |
| POWER | Estimated power (PS) and torque (Nm) at the crank, and a dyno curve of the last full-throttle pull, next to the factory figures (131 PS at 7000, 150 Nm at 4800). The previous pull stays faintly visible for comparison |
| INFO | Six large tiles with a 1-minute sparkline: coolant, intake air, outside, fuel, trip, average fuel use |

**Track** (trackday). Every track page has a thin ring around the screen edge that fades inward: amber from
6200 rpm (fading in up to 6500), red from 7000. From 7200 it flashes: a brighter, thicker red ring that
reaches further in, alternating with no ring.

| Page | What's on it |
|---|---|
| TRACK | For reading from the corner of your eye: a full-width rpm bar 3000–7500 (green, amber from 6500, red from 7000, the whole bar flashes blue from 7200), a giant gear number, speed and rpm. Coolant only takes space when it is 105 °C or hotter (a red box) |
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
at the line). On 2077 the ring also gets "damage" glitches like in the game: amber LED-grid streaks from the
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

Sized for the 7" screen: no more than about six things per page, numbers 50–280 px, labels at least 18 px.

To change page: swipe, tap the page, tap the ‹ › corners, or press the arrow keys. `R` resets the peak G.

## Trying it on a PC
```
python -m http.server 8800 --directory meters
```
Then open `http://localhost:8800/` (the built-in driving simulator) or `http://localhost:8800/?src=sim:1` (the
simulator at 1 update per second, roughly what `smdb-read` gives).

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

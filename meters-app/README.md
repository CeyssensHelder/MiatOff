# MiatOff Meters app (menu integration for Mazda Connect 74.00.324A)

Puts **Meters** under **Applications** in the Mazda menu and shows the gauges from
[`meters/`](../meters/) full screen there, fed by the [collector](../collector/). The research and the choices are in
[docs/13](../docs/13-gauges.md). Installing and removing is done with the
[AA-touch stick](../aa-touch-stick/README.md) (menu EXTRA → METERS).

## Components
| Path in this folder | On the unit | What |
|---|---|---|
| `userjs/miatoff-apps.js` | `/jci/opera/opera_dir/userjs-miatoff/` | Userscript: adds the item and borrows the disabled app *Drive Record* (`vdt`) |
| `app/js/miatoffApp.js`, `app/css/` | `/jci/gui/apps/miatoff/` | The Mazda app `miatoff` with a single context `Start` |
| `app/templates/MiatoffMeters/` | `/jci/gui/apps/miatoff/templates/` | Template: a full-screen iframe with `meters/index.html?src=poll:live.txt` |
| (from `meters/`) | `/jci/gui/apps/miatoff/meters/` | The Meters page (without `overview.html`) |
| (from `collector/`) | `/jci/gui/apps/miatoff/collector/` | The collector; `stage_gap2.sh` starts it at every boot |

`/jci/gui/apps/miatoff/meters/live.txt` is a symlink to `/tmp/miatoff/live.txt`, the collector's file.

In addition the stick changes two stock files, each hash-checked and with a stock copy:
- `/jci/opera/opera_home/opera.ini`: `User JavaScript=1`, `Allow File XMLHttpRequest=1`, and
  `User JavaScript File` to the own folder `userjs-miatoff/` (so the stock `fps.js` stays off);
- `/jci/scripts/stage_gap2.sh`: one comment line and one line that starts the collector.

## How it works
1. Opera runs the userscript in every page. In the HMI it waits (at most 20 load events) for the system app and
   first checks **all** hooks. If one is missing (other firmware, another mod), it changes nothing.
2. It adds "Meters" to `_masterApplicationDataList`. If you choose that item, it asks the MMUI for
   *Drive Record* (`SelectDriveRecord`). Messages for that app (`ctxtChg`, `focusStack`, alerts) go to `miatoff`;
   events from `miatoff` go back to the MMUI as *Drive Record*.
3. Unlike MZD-AIO it **wraps** `selectCallback`, `routeMmuiMsg` and `sendEventToMmui`: the original function
   always runs, only the parameters are adjusted while Meters is open. After leaving, everything is stock.
4. **Controls:** the page has its own menu (style → previews → gauge). Turning = `MiatoffMeters.next()` /
   `prev()`, pressing = `select()` (on release). **Back:** v74's `Common` sends `Global.GoBack` to the MMUI
   before the template sees the key. Therefore, while Meters is open, the userscript first asks the page
   (`back()`): if that returns exactly `true`, the page went up one level and the MMUI hears nothing. On `false`
   (at the top, in the style list) or on an error the normal `Global.GoBack` goes through and closes the app. Home works
   as always.

## Testing
```bash
node meters-app/tests/test_meters_app.js
```
Against an imitation v74 framework (shapes from dump 003): ES5 only, the adding (once), the borrowing, the
translating of messages in both directions, returning to stock after leaving, doing nothing with a
missing hook, the back key (page first, then closing the app), and the app and the template. The installation itself (files, `opera.ini`, `stage_gap2.sh`,
power loss, restoring) is in the AA-touch stick's test, under BusyBox in Docker.

**Not tested:** the real Opera Presto and MMUI. Only in the car will it turn out whether borrowing *Drive Record* works like
it does with AIO.

## Licence
GPL-3.0-or-later. The idea of the userscript comes from MZD-AIO's `additionalApps.js` (GPL-3.0); no code was
taken over.

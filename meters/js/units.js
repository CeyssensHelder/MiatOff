/* SPDX-License-Identifier: GPL-3.0-or-later */
/* MiatOff Meters - display units, shared by the built-in styles (app.js, cyber.js, y2077.js) and the CUSTOM pages
 * (custom.js). ES5 only. Values stay in canonical units everywhere (km/h, km, deg C, PS, Nm, L/100km); they are
 * converted only where text is drawn. Keep in step with meters/designer/v3/signals.mjs (toUnit / fromUnit). */
(function (W) {
    'use strict';

    var METRIC = { speed: 'km/h', distance: 'km', temperature: 'C', power: 'PS', torque: 'Nm', consumption: 'L/100km' };

    function finite(n) { return typeof n === 'number' && isFinite(n); }
    // Canonical -> display unit, or back. mpg is the reciprocal of L/100km, so 0 has no value.
    function convert(n, unit, back) {
        if (!finite(n)) return null;
        if (unit === 'mph' || unit === 'mi') return back ? n / 0.621371192237334 : n * 0.621371192237334;
        if (unit === '°F') return back ? (n - 32) / 1.8 : n * 1.8 + 32;
        if (unit === 'hp') return back ? n / 0.9863200706 : n * 0.9863200706;
        if (unit === 'kW') return back ? n / 0.73549875 : n * 0.73549875;
        if (unit === 'lb-ft') return back ? n / 0.7375621493 : n * 0.7375621493;
        if (unit.indexOf('mpg') === 0) return n > 0 ? (unit === 'mpg UK' ? 282.480936 : 235.214583) / n : null;
        return n;
    }
    // The display unit of a reading for a units choice ({speed, distance, temperature, power, torque, consumption}),
    // or null for readings without one (rpm, fuel %, g...). 'econ' is the car data's name for consumption.
    function unit(signal, units) {
        var u = units || METRIC;
        if (signal === 'coolant' || signal === 'iat' || signal === 'outside') return '°' + (u.temperature || 'C');
        if (signal === 'speed') return u.speed || 'km/h';
        if (signal === 'trip') return u.distance || 'km';
        if (signal === 'power') return u.power || 'PS';
        if (signal === 'torque') return u.torque || 'Nm';
        if (signal === 'consumption' || signal === 'econ') return u.consumption || 'L/100km';
        return null;
    }
    function display(signal, n, units) {
        var to = unit(signal, units);
        return to ? convert(n, to, false) : (finite(n) ? n : null);
    }

    // Axis ticks for a chart drawn in canonical values from 0 to max: round numbers of the display unit, as
    // { at: canonical value, label }. Power and torque convert differently, so each needs its own axis.
    // The step is the smallest of STEPS that leaves at most six ticks above 0: 180 PS or Nm count in 50s, as they
    // always did, while the same axis in kW (132) or lb-ft (133) counts in 25s instead of showing only 50 and 100.
    var STEPS = [25, 50, 100, 200, 500, 1000];
    function ticks(signal, max, units) {
        var to = unit(signal, units), top = display(signal, max, units) + 1e-9, out = [], step, n;
        for (n = 0; n < STEPS.length - 1 && Math.floor(top / STEPS[n]) > 6; n++) { /* next step */ }
        step = STEPS[n];
        for (n = 0; n <= top; n += step) out.push({ at: to ? convert(n, to, true) : n, label: String(n) });
        return out;
    }

    W.MeterUnits = { METRIC: METRIC, convert: convert, unit: unit, display: display, ticks: ticks };
})(window);

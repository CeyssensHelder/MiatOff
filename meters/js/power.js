/* MiatOff Meters — estimated engine power and torque, and a dyno recorder. ES5 only.
 *
 * The car sends no torque or power signal (EngineLoad and the torque fields read 0 on the 1.5), so this
 * calculates it from the calibrated longitudinal acceleration and the speed:
 *   wheel force  = m·a + ½·ρ·CdA·v² + Crr·m·g     (the accelerometer already includes the slope)
 *   crank power  = force · v / driveline efficiency
 *   crank torque = power / ω(rpm)
 * Only meaningful at full throttle with the clutch engaged. Expect about ±10 %: mass and drag are assumptions.
 */
(function (W) {
    'use strict';

    var g = 9.80665;
    // ND1 1.5 roadster with driver, or the car profile's kerb mass plus 75 kg for the driver.
    // ?mass=<kg> overrides, e.g. with a passenger.
    var CAR = { mass: 1050, cda: 0.55, crr: 0.012, rho: 1.2, eff: 0.85 };
    var P = W.MeterCarProfile;
    if (P && typeof P.mass === 'number' && P.mass > 500 && P.mass < 3000) CAR.mass = Math.round(P.mass + 75);
    var m = /[?&]mass=(\d+)/.exec(W.location.search);
    if (m) CAR.mass = +m[1];

    var WOT = 90;           // % pedal that counts as full throttle
    var MIN_SPAN = 1500;    // rpm a pull must cover to be kept
    var BIN = 100;          // rpm per dyno bin

    function estimate(kmh, gLong, rpm) {
        if (!(kmh > 3) || !(rpm > 500) || gLong === undefined || isNaN(gLong)) return null;
        var v = kmh / 3.6,
            f = CAR.mass * g * gLong + 0.5 * CAR.rho * CAR.cda * v * v + CAR.crr * CAR.mass * g,
            p = f * v / CAR.eff;
        return { ps: p / 735.5, nm: p / (rpm * Math.PI / 30) };
    }

    function Dyno() {
        this.pulls = [];        // finished pulls, newest first
        this.cur = null;        // pull being recorded
        this.badSince = 0;
        this.live = { ps: undefined, nm: undefined, wot: false };
        this.lastT = 0;
    }

    // s: { speed, gLong, rpm, throttle, gear }, raw (unsmoothed) values from one data update.
    Dyno.prototype.sample = function (now, s) {
        var e = estimate(s.speed, s.gLong, s.rpm), L = this.live, c = this.cur,
            dt = this.lastT ? Math.min(1, (now - this.lastT) / 1000) : 0.1, k, b;
        this.lastT = now;
        L.wot = !!(e && s.gear && s.throttle >= WOT && s.gLong > 0.03);
        if (e) {
            k = 1 - Math.exp(-dt / 0.4);
            L.ps = L.ps === undefined ? e.ps : L.ps + (e.ps - L.ps) * k;
            L.nm = L.nm === undefined ? e.nm : L.nm + (e.nm - L.nm) * k;
        }

        if (c && (!L.wot || s.gear !== c.gear || s.rpm < c.hi - 400)) {
            if (!L.wot && !this.badSince) this.badSince = now;
            if (L.wot || now - this.badSince > 300) this.end();   // a gear change or rpm drop ends it at once
            c = this.cur;
        }
        if (!L.wot) return;
        this.badSince = 0;
        if (!c) c = this.cur = { gear: s.gear, bins: {}, lo: s.rpm, hi: s.rpm };
        if (s.rpm < c.lo) c.lo = s.rpm;
        if (s.rpm > c.hi) c.hi = s.rpm;
        k = Math.round(s.rpm / BIN) * BIN;
        b = c.bins[k] || (c.bins[k] = [0, 0, 0]);
        b[0] += e.ps; b[1] += e.nm; b[2]++;
    };

    Dyno.prototype.end = function () {
        var c = this.cur, keys = [], pts = [], i, k, b, a, n, j;
        this.cur = null; this.badSince = 0;
        if (!c || c.hi - c.lo < MIN_SPAN) return;
        for (k in c.bins) if (c.bins.hasOwnProperty(k)) keys.push(+k);
        keys.sort(function (x, y) { return x - y; });
        for (i = 0; i < keys.length; i++) {
            b = c.bins[keys[i]];
            pts.push({ rpm: keys[i], ps: b[0] / b[2], nm: b[1] / b[2] });
        }
        // 5-bin moving average: accelerometer noise is a few PS per sample.
        c.pts = [];
        for (i = 0; i < pts.length; i++) {
            a = { rpm: pts[i].rpm, ps: 0, nm: 0 }; n = 0;
            for (j = Math.max(0, i - 2); j <= Math.min(pts.length - 1, i + 2); j++) { a.ps += pts[j].ps; a.nm += pts[j].nm; n++; }
            a.ps /= n; a.nm /= n;
            c.pts.push(a);
        }
        c.peakPs = c.pts[0]; c.peakNm = c.pts[0];
        for (i = 1; i < c.pts.length; i++) {
            if (c.pts[i].ps > c.peakPs.ps) c.peakPs = c.pts[i];
            if (c.pts[i].nm > c.peakNm.nm) c.peakNm = c.pts[i];
        }
        delete c.bins;
        this.pulls.unshift(c);
        if (this.pulls.length > 5) this.pulls.pop();
    };

    Dyno.prototype.reset = function () { this.pulls = []; this.cur = null; this.badSince = 0; };

    W.MeterPower = { CAR: CAR, estimate: estimate, Dyno: Dyno };
})(window);

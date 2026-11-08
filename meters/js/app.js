/* MiatOff Meters — pages, smoothing, render loop and navigation. ES5 only.
 *
 * URL options: ?src=sim|sim:<hz>|ws://...|poll:<url>  &set=street|track|cyber|y2077|y2077n|custom  &page=<0..n-1>
 *              &gm=car (G-meter shows what the car does instead of what you feel)
 * Navigation: swipe, tap a page edge arrow, tap anywhere that is not a control, or arrow keys.
 * Menu: a style list, then live previews of its pages, then the gauge. Knob: turn = next/prev, press = select,
 * back button = up one level (MiatoffMeters API). Long-press on a gauge = back. ?menu opens the style menu.
 * Layout is sized for the 7-inch CMU screen: few gauges per page, big numbers.
 */
(function (W, doc) {
    'use strict';

    var G = W.MeterGauges, D = W.MeterData, C = G.C, text = G.text, fmt = G.fmt;

    function $(id) { return doc.getElementById(id); }
    function num(x) { return (x === undefined || x === null || isNaN(x)) ? 0 : x; }
    function query() {
        var o = {}, parts = W.location.search.replace(/^\?/, '').split('&'), i, kv;
        for (i = 0; i < parts.length; i++) {
            if (!parts[i]) continue;
            kv = parts[i].split('=');
            o[decodeURIComponent(kv[0])] = decodeURIComponent(kv.slice(1).join('='));
        }
        return o;
    }
    // The ND1 manual reports TransmissionGearPosition 0, so derive the gear from rpm per km/h.
    // 1.5 6MT ratios, final drive 2.866, 195/50R16 (1.89 m around).
    var RPM_PER_KMH = [0, 5.087, 2.991, 2.035, 1.594, 1.286, 1.000];
    for (var g0 = 1; g0 < RPM_PER_KMH.length; g0++) RPM_PER_KMH[g0] *= 2.866 * 60 / (1.89 * 3.6);
    function derivedGear() {
        if (D.target.gear !== undefined) return v.gear;
        var sp = D.target.speed, r = D.target.rpm, best, err = 0.12, k, e;
        if (!(sp > 5) || !(r > 0) || v.clutch) return undefined;
        for (k = 1; k < RPM_PER_KMH.length; k++) {
            e = Math.abs(r / sp / RPM_PER_KMH[k] - 1);
            if (e < err) { err = e; best = k; }
        }
        return best;
    }
    function gearText(g) {
        if (g === undefined || g === null || isNaN(g)) return '-';
        g = Math.round(g);
        return g === 0 ? 'N' : (g < 0 ? 'R' : String(g));
    }

    var v = {};        // displayed (smoothed) value per channel
    var hist = {};     // sparkline history per channel

    // colour rules
    function coolantCol(t) { return t >= 105 ? C.red : (t < 60 ? C.blue : C.text); }
    function lowCol(lim) { return function (x) { return x <= lim ? C.amber : C.text; }; }
    function plain() { return C.text; }
    // Rev limits of the ND1 1.5 (P5): 131 PS at 7000 rpm, 150 Nm at 4800 rpm, Mazda's redline 7000 rpm, fuel cut
    // around 7500 (owner reports). Power stays near its peak to the limiter and the gears are close, so the
    // quickest upshift is late: SHIFT leaves ~0.25 s of reaction time before the cut in 2nd/3rd.
    var RPM = { low: 1000, amber: 6500, red: 7000, shift: 7200, limit: 7500 };   // low: start of the TRACK shift bars
    function rpmBand(r) { return r >= RPM.red ? C.red : (r >= RPM.amber ? C.amber : C.band); }

    // Readable on the 7" screen: few things per page, numbers at least ~50 px, labels ~20 px.

    // label left, big value right, optional thin bar underneath
    function Readout(o) {
        this.x = o.x; this.y = o.y; this.w = o.w; this.label = o.label; this.unit = o.unit || '';
        this.dec = o.dec || 0; this.color = o.color || plain;
        this.bar = o.max !== undefined ? new G.HBar({ x: o.x, y: o.y + 36, w: o.w, h: 10, min: o.min, max: o.max }) : null;
    }
    Readout.prototype.drawStatic = function (ctx) {
        text(ctx, this.label, this.x, this.y + 4, 20, C.dim, 'left', true);
        if (this.bar) { ctx.fillStyle = C.track; ctx.fillRect(this.bar.x, this.bar.y, this.bar.w, this.bar.h); }
    };
    Readout.prototype.draw = function (ctx, val) {
        var col = this.color(val), right = this.x + this.w;
        text(ctx, this.unit, right, this.y + 6, 20, C.dim, 'right', false);
        ctx.font = G.font(20, false);
        text(ctx, fmt(val, this.dec), right - ctx.measureText(this.unit).width - 6, this.y, 58, col, 'right', true);
        if (this.bar) { this.bar.color = col; this.bar.draw(ctx, val); }
    };

    // ================================================================== page 1: drive
    function drivePage() {
        var tach = new G.Dial({ cx: 262, cy: 246, r: 222, min: 0, max: 8000, major: 1000, minor: 500,
            labelDiv: 1000, red: RPM.red, band: 22, tick: 22, numPx: 34, title: 'x1000 r/min', bandColor: rpmBand });
        var rows = [
            [new Readout({ x: 522, y: 290, w: 262, label: 'COOLANT', unit: '°C', color: coolantCol, min: 40, max: 120 }), 'coolant'],
            [new Readout({ x: 522, y: 392, w: 262, label: 'FUEL', unit: '%', color: lowCol(15), min: 0, max: 100 }), 'fuel']
        ];
        return {
            name: 'DRIVE',
            drawStatic: function (ctx) {
                tach.drawStatic(ctx);
                for (var i = 0; i < rows.length; i++) rows[i][0].drawStatic(ctx);
                text(ctx, 'km/h', 262, 316, 22, C.dim, 'center', true);
            },
            draw: function (ctx, now) {
                var rpm = num(v.rpm), i, box = '#16161b', ink = C.text;
                tach.draw(ctx, rpm);
                for (i = 0; i < rows.length; i++) rows[i][0].draw(ctx, v[rows[i][1]]);
                text(ctx, fmt(v.speed, 0), 262, 236, 124, C.text, 'center', true);
                // The gear box doubles as the shift light.
                if (rpm >= RPM.shift) { if (Math.floor(now / 100) % 2) box = C.red; }
                else if (rpm >= RPM.amber) { box = C.amber; ink = '#000'; }
                G.roundRect(ctx, 522, 18, 262, 212, 16);
                ctx.fillStyle = box; ctx.fill();
                ctx.lineWidth = 3; ctx.strokeStyle = v.clutch ? C.amber : C.ring; ctx.stroke();
                text(ctx, gearText(derivedGear()), 653, 130, 180, ink, 'center', true);
            },
            animating: function () { return num(v.rpm) >= RPM.shift; }
        };
    }

    // ================================================================== page 2: G-meter
    function dynamicsPage() {
        var gm = new G.GMeter({ cx: 236, cy: 236, r: 214, max: 1.25, felt: query().gm !== 'car' });
        var thr = new G.HBar({ x: 492, y: 330, w: 292, h: 34, min: 0, max: 100, label: 'THROTTLE', color: C.green });
        // BrakePressure has no known scale yet (it reads ~152 while cruising), so the bar shows deceleration instead.
        var brk = new G.HBar({ x: 492, y: 416, w: 292, h: 34, min: 0, max: 1.2, label: 'BRAKING  0–1.2 g', color: C.red });
        var peaks = [['l', 'LEFT', C.text], ['r', 'RIGHT', C.text], ['acc', 'ACCEL', C.green], ['brk', 'BRAKE', C.red]];
        return {
            name: 'G-METER',
            gm: gm,
            drawStatic: function (ctx) {
                gm.drawStatic(ctx); thr.drawStatic(ctx); brk.drawStatic(ctx);
                text(ctx, 'PEAK G', 492, 22, 16, C.dim, 'left', true);
                text(ctx, 'tap circle: reset', 784, 22, 14, C.faint, 'right', false);
                for (var i = 0; i < peaks.length; i++) text(ctx, peaks[i][1], 492, 70 + i * 60, 22, C.dim, 'left', true);
            },
            draw: function (ctx, now) {
                gm.draw(ctx, num(v.gLat), num(v.gLong), now);
                thr.draw(ctx, v.throttle);
                brk.draw(ctx, -num(v.gLong));
                for (var i = 0; i < peaks.length; i++) {
                    text(ctx, fmt(gm.peak[peaks[i][0]], 2), 784, 66 + i * 60, 50, peaks[i][2], 'right', true);
                }
            },
            animating: function () { return gm.trail.length > 1; },
            tap: function (x, y) {
                if (!gm.hit(x, y)) return false;
                gm.reset();
                return true;
            }
        };
    }

    // ================================================================== page 3: info tiles
    function infoPage() {
        var defs = [
            // key       label         unit     dec colour       min. sparkline span
            ['coolant', 'COOLANT',    '°C',    0, coolantCol, 10],
            ['iat',     'INTAKE AIR', '°C',    0, plain,      10],
            ['outside', 'OUTSIDE',    '°C',    1, plain,      5],
            ['fuel',    'FUEL',       '%',     0, lowCol(15), 5],
            ['trip',    'TRIP',       'km',    0, plain,      1],
            ['econ',    'AVG FUEL',   'L/100', 1, plain,      2]
        ];
        var tiles = [], i, d, w = 248, h = 212;
        for (i = 0; i < defs.length; i++) {
            d = defs[i];
            tiles.push({ key: d[0], t: new G.Tile({ x: 16 + (i % 3) * (w + 12), y: 14 + Math.floor(i / 3) * (h + 12),
                w: w, h: h, label: d[1], unit: d[2], dec: d[3], color: d[4], span: d[5] }) });
        }
        return {
            name: 'INFO',
            drawStatic: function (ctx) { for (var k = 0; k < tiles.length; k++) tiles[k].t.drawStatic(ctx); },
            draw: function (ctx) {
                for (var k = 0; k < tiles.length; k++) tiles[k].t.draw(ctx, v[tiles[k].key], hist[tiles[k].key]);
            },
            animating: function () { return false; }
        };
    }

    // ================================================================== track day
    // Session state for the track pages: maxima since the last reset, and a lap timer that is triggered by a
    // tap at the start/finish line (automatic GPS laps need GPS in the collector first).
    function fmtLap(ms, dec) {
        if (ms === undefined || ms === null || isNaN(ms)) return '--';
        var neg = ms < 0, t = Math.abs(ms) / 1000, m = Math.floor(t / 60), sec = t - m * 60, s = sec.toFixed(dec);
        if (m && sec < 10) s = '0' + s;
        return (neg ? '-' : '') + (m ? m + ':' + s : s);
    }
    function fmtDelta(ms) {
        if (ms === undefined || ms === null || isNaN(ms)) return '';
        return (ms > 0 ? '+' : (ms < 0 ? '-' : '')) + (Math.abs(ms) / 1000).toFixed(2);
    }

    var sess = {
        MIN_LAP: 5000,    // taps closer together than this are ignored (double tap, bump), with a message
        reset: function () {
            var s = this;
            s.start = Date.now(); s.lapStart = 0; s.laps = 0; s.last = null; s.best = null; s.delta = null;
            s.vmaxLap = 0; s.vmaxLast = null; s.armed = 0; s.msg = ''; s.msgUntil = 0;
            s.maxSpeed = 0; s.maxRpm = 0; s.maxCoolant = undefined; s.maxLat = 0; s.maxBrk = 0;
        },
        say: function (msg, sub, now) { this.msg = msg; this.msgSub = sub; this.msgUntil = now + 1800; },
        lap: function (now) {
            var s = this, t;
            if (s.lapStart && now - s.lapStart < s.MIN_LAP) {
                s.say('TOO SOON', 'laps under ' + s.MIN_LAP / 1000 + ' s are ignored · hold to stop', now);
                return;
            }
            if (s.lapStart) {
                t = now - s.lapStart;
                s.laps++;
                s.delta = s.best === null ? null : t - s.best;
                s.last = t;
                if (s.best === null || t < s.best) s.best = t;
                s.vmaxLast = s.vmaxLap;
            }
            s.lapStart = now; s.vmaxLap = 0;
            s.msgUntil = 0;
        },
        // Long-press on a lap page: stop the timer, dropping the lap in progress (finished laps stay).
        stop: function (now) {
            if (!this.lapStart) return false;
            this.lapStart = 0; this.vmaxLap = 0;
            this.say('LAP TIMER STOPPED', 'tap at the line to start again', now);
            return true;
        },
        update: function () {
            var s = this, T = D.target;
            if (T.speed > s.maxSpeed) s.maxSpeed = T.speed;
            if (T.speed > s.vmaxLap) s.vmaxLap = T.speed;
            if (T.rpm > s.maxRpm) s.maxRpm = T.rpm;
            if (T.coolant !== undefined && !(T.coolant <= s.maxCoolant)) s.maxCoolant = T.coolant;
            if (Math.abs(num(T.gLat)) > s.maxLat) s.maxLat = Math.abs(T.gLat);
            if (-num(T.gLong) > s.maxBrk) s.maxBrk = -T.gLong;
        }
    };
    sess.reset();

    // ------------------------------------------------------------------ TRACK: shift bar + giant gear
    // Made to be read from the corner of your eye: one full-width rpm bar, the gear, nothing else unless hot.
    function trackPage() {
        var N = 30, X0 = 16, W = 768, Y = 16, H = 104, LO = RPM.low, HI = RPM.limit, sw = W / N;
        function segCol(i) {
            var r = LO + (i + 1) * (HI - LO) / N;
            return r > RPM.red ? C.red : (r > RPM.amber ? C.amber : C.green);
        }
        function seg(ctx, i) { ctx.fillRect(X0 + i * sw + 2, Y, sw - 4, H); }
        return {
            name: 'TRACK',
            drawStatic: function (ctx) {
                var i, r;
                ctx.fillStyle = C.track;
                for (i = 0; i < N; i++) seg(ctx, i);
                for (r = LO; r <= 7000; r += 1000) {
                    text(ctx, String(r / 1000), X0 + (r - LO) / (HI - LO) * W, Y + H + 20, 18, C.dim, 'center', true);
                }
                text(ctx, 'km/h', 130, 372, 22, C.dim, 'center', true);
                text(ctx, 'rpm', 670, 372, 22, C.dim, 'center', true);
            },
            draw: function (ctx, now) {
                var rpm = num(v.rpm), shift = rpm >= RPM.shift, blink = Math.floor(now / 100) % 2, i, lit, hot;
                if (shift) {
                    if (blink) { ctx.fillStyle = C.blue; for (i = 0; i < N; i++) seg(ctx, i); }
                } else {
                    lit = Math.floor(G.clamp((rpm - LO) / (HI - LO), 0, 1) * N);
                    for (i = 0; i < lit; i++) { ctx.fillStyle = segCol(i); seg(ctx, i); }
                }
                text(ctx, gearText(derivedGear()), 400, 318, 280, shift ? C.red : C.text, 'center', true);
                text(ctx, fmt(v.speed, 0), 130, 302, 96, C.text, 'center', true);
                text(ctx, fmt(v.rpm, 0), 670, 302, 72, rpm >= RPM.red ? C.red : C.text, 'center', true);
                hot = v.coolant >= 105;
                if (hot) {
                    G.roundRect(ctx, 200, 404, 400, 52, 10);
                    ctx.fillStyle = C.red; ctx.fill();
                    text(ctx, 'COOLANT ' + fmt(v.coolant, 0) + '°C', 400, 431, 30, '#fff', 'center', true);
                } else {
                    text(ctx, 'WATER ' + fmt(v.coolant, 0) + '°', 16, 420, 22, C.dim, 'left', true);
                    text(ctx, 'AIR ' + fmt(v.iat, 0) + '°', 784, 420, 22, C.dim, 'right', true);
                }
            },
            animating: function () { return num(v.rpm) >= RPM.shift; }
        };
    }

    // ------------------------------------------------------------------ LAP: tap-to-lap timer
    function lapPage() {
        var cols = [['LAST', 16], ['BEST', 280], ['VMAX', 544]];
        return {
            name: 'LAP',
            drawStatic: function (ctx) {
                for (var i = 0; i < cols.length; i++) {
                    G.roundRect(ctx, cols[i][1], 352, 240, 100, 12);
                    ctx.fillStyle = C.face; ctx.fill();
                    ctx.lineWidth = 1.5; ctx.strokeStyle = C.ring; ctx.stroke();
                    text(ctx, cols[i][0], cols[i][1] + 16, 374, 18, C.dim, 'left', true);
                }
            },
            draw: function (ctx, now) {
                var d = sess.delta;
                if (!sess.lapStart) {
                    text(ctx, 'TAP AT START / FINISH', 400, 170, 44, C.text, 'center', true);
                    text(ctx, 'tap the screen every time you cross the line', 400, 228, 22, C.dim, 'center', false);
                } else {
                    text(ctx, 'LAP ' + (sess.laps + 1), 16, 34, 28, C.dim, 'left', true);
                    text(ctx, fmtLap(now - sess.lapStart, 1), 400, 170, 150, C.text, 'center', true);
                    if (d !== null) {
                        text(ctx, fmtDelta(d), 400, 296, 60, d <= 0 ? C.green : C.red, 'center', true);
                    } else if (sess.laps === 1) {
                        text(ctx, 'FIRST LAP', 400, 296, 40, C.dim, 'center', true);
                    }
                }
                text(ctx, fmtLap(sess.last, 2), 32, 420, 46, C.text, 'left', true);
                text(ctx, fmtLap(sess.best, 2), 296, 420, 46, C.green, 'left', true);
                text(ctx, fmt(sess.vmaxLast, 0), 560, 420, 46, C.text, 'left', true);
                if (sess.vmaxLast !== null) {
                    ctx.font = G.font(46, true);
                    text(ctx, 'km/h', 560 + ctx.measureText(fmt(sess.vmaxLast, 0)).width + 8, 428, 20, C.dim, 'left', false);
                }
            },
            animating: function () { return !!sess.lapStart; },
            tap: function () { sess.lap(Date.now()); return true; },
            hold: function () { return sess.stop(Date.now()); }
        };
    }

    // ------------------------------------------------------------------ SESSION: maxima since reset
    function sessionPage() {
        var defs = [
            ['maxSpeed', 'TOP SPEED', 'km/h', 0],
            ['maxRpm', 'MAX RPM', '', 0],
            ['best', 'BEST LAP', '', 2],
            ['maxLat', 'MAX LATERAL G', '', 2],
            ['maxBrk', 'MAX BRAKE G', '', 2],
            ['maxCoolant', 'MAX COOLANT', '°C', 0]
        ];
        var tiles = [], i, d, w = 248, h = 186;
        for (i = 0; i < defs.length; i++) {
            d = defs[i];
            tiles.push({ key: d[0], t: new G.Tile({ x: 16 + (i % 3) * (w + 12), y: 14 + Math.floor(i / 3) * (h + 10),
                w: w, h: h, label: d[1], unit: d[2], dec: d[3],
                color: d[0] === 'maxCoolant' ? coolantCol : plain,
                format: d[0] === 'best' ? function (x) { return fmtLap(x, 2); } : null }) });
        }
        var BTN = { x: 584, y: 404, w: 200, h: 48 };
        return {
            name: 'SESSION',
            drawStatic: function (ctx) { for (var k = 0; k < tiles.length; k++) tiles[k].t.drawStatic(ctx); },
            draw: function (ctx, now) {
                var k, armed = now - sess.armed < 5000, mins = Math.floor((now - sess.start) / 60000);
                for (k = 0; k < tiles.length; k++) tiles[k].t.draw(ctx, sess[tiles[k].key], null);
                text(ctx, sess.laps + (sess.laps === 1 ? ' LAP' : ' LAPS') + '   ·   ' +
                    Math.floor(mins / 60) + ':' + (mins % 60 < 10 ? '0' : '') + (mins % 60) + ' h',
                    16, 428, 24, C.dim, 'left', true);
                G.roundRect(ctx, BTN.x, BTN.y, BTN.w, BTN.h, 10);
                ctx.fillStyle = armed ? C.red : C.face; ctx.fill();
                ctx.lineWidth = 2; ctx.strokeStyle = armed ? C.red : C.amber; ctx.stroke();
                text(ctx, armed ? 'TAP AGAIN' : 'RESET', BTN.x + BTN.w / 2, BTN.y + BTN.h / 2, 22,
                    armed ? '#fff' : C.amber, 'center', true);
            },
            animating: function () { return Date.now() - sess.armed < 5200; },
            tap: function (x, y) {
                if (x < BTN.x || x > BTN.x + BTN.w || y < BTN.y || y > BTN.y + BTN.h) return false;
                var now = Date.now();
                if (now - sess.armed < 5000) { sess.reset(); resetG(); } else { sess.armed = now; }
                return true;
            }
        };
    }

    // ================================================================== POWER: estimated PS/Nm + dyno curve
    var dyno = new W.MeterPower.Dyno();

    function powerPage() {
        var X0 = 312, X1 = 776, Y0 = 44, Y1 = 384, R0 = 2000, R1 = 7500, V1 = 180;
        function px(r) { return X0 + (r - R0) / (R1 - R0) * (X1 - X0); }
        function py(val) { return Y1 - G.clamp(val, 0, V1) / V1 * (Y1 - Y0); }
        function curve(ctx, pts, key, col, w, alpha) {
            ctx.beginPath();
            for (var i = 0; i < pts.length; i++) {
                if (i) ctx.lineTo(px(pts[i].rpm), py(pts[i][key])); else ctx.moveTo(px(pts[i].rpm), py(pts[i][key]));
            }
            ctx.lineWidth = w; ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineJoin = 'round'; ctx.stroke();
            ctx.globalAlpha = 1;
        }
        function ring(ctx, r, val, col, label, below) {
            ctx.beginPath(); ctx.arc(px(r), py(val), 7, 0, Math.PI * 2);
            ctx.lineWidth = 2.5; ctx.strokeStyle = col; ctx.stroke();
            text(ctx, label, px(r), py(val) + (below ? 22 : -20), 14, col, 'center', true);
        }
        return {
            name: 'POWER',
            drawStatic: function (ctx) {
                var r, val;
                text(ctx, 'POWER', 16, 30, 20, C.dim, 'left', true);
                text(ctx, 'TORQUE', 16, 176, 20, C.dim, 'left', true);
                text(ctx, 'estimated at the crank', 16, 312, 15, C.dim, 'left', false);
                ctx.lineWidth = 1; ctx.strokeStyle = '#26262c';
                for (r = R0; r <= R1; r += 1000) {
                    ctx.beginPath(); ctx.moveTo(px(r), Y0); ctx.lineTo(px(r), Y1); ctx.stroke();
                    text(ctx, String(r / 1000), px(r), Y1 + 16, 15, C.dim, 'center', true);
                }
                for (val = 0; val <= V1; val += 50) {
                    ctx.beginPath(); ctx.moveTo(X0, py(val)); ctx.lineTo(X1, py(val)); ctx.stroke();
                    text(ctx, String(val), X0 - 8, py(val), 14, C.dim, 'right', false);
                }
                text(ctx, 'x1000 rpm', X1, Y1 + 36, 14, C.dim, 'right', false);
                text(ctx, 'PS', X0 + 8, 18, 18, C.red, 'left', true);
                text(ctx, 'Nm', X0 + 44, 18, 18, C.blue, 'left', true);
                text(ctx, 'o = factory', X0 + 84, 18, 14, C.dim, 'left', false);
                ring(ctx, 7000, 131, C.red, '131', true);
                ring(ctx, 4800, 150, C.blue, '150', false);
            },
            draw: function (ctx, now) {
                var L = dyno.live, last = dyno.pulls[0], prev = dyno.pulls[1], c = dyno.cur, col = L.wot ? C.text : C.dim, k, b;
                text(ctx, L.ps === undefined ? '--' : fmt(Math.max(0, L.ps), 0), 16, 100, 84, col, 'left', true);
                text(ctx, 'PS', 250, 116, 22, C.dim, 'right', true);
                text(ctx, L.nm === undefined ? '--' : fmt(Math.max(0, L.nm), 0), 16, 246, 84, col, 'left', true);
                text(ctx, 'Nm', 250, 262, 22, C.dim, 'right', true);
                if (L.wot) {
                    G.roundRect(ctx, 16, 336, 236, 36, 8);
                    ctx.fillStyle = C.green; ctx.fill();
                    text(ctx, 'FULL THROTTLE', 134, 354, 18, '#000', 'center', true);
                }
                if (last) {
                    text(ctx, 'last pull  ·  gear ' + last.gear, 16, 396, 15, C.dim, 'left', true);
                    text(ctx, fmt(last.peakPs.ps, 0) + ' PS @ ' + fmt(last.peakPs.rpm, 0) + '   ' +
                        fmt(last.peakNm.nm, 0) + ' Nm @ ' + fmt(last.peakNm.rpm, 0), 16, 420, 17, C.text, 'left', true);
                }
                ctx.save();
                ctx.beginPath(); ctx.rect(X0, Y0 - 10, X1 - X0, Y1 - Y0 + 10); ctx.clip();   // pulls can start below 2000 rpm
                if (prev) { curve(ctx, prev.pts, 'ps', C.red, 2, 0.3); curve(ctx, prev.pts, 'nm', C.blue, 2, 0.3); }
                if (last) { curve(ctx, last.pts, 'ps', C.red, 3.5, 1); curve(ctx, last.pts, 'nm', C.blue, 3.5, 1); }
                if (c) {
                    for (k in c.bins) {
                        if (!c.bins.hasOwnProperty(k)) continue;
                        b = c.bins[k];
                        ctx.fillStyle = C.red; ctx.fillRect(px(+k) - 2, py(b[0] / b[2]) - 2, 4, 4);
                        ctx.fillStyle = C.blue; ctx.fillRect(px(+k) - 2, py(b[1] / b[2]) - 2, 4, 4);
                    }
                }
                ctx.restore();
                if (c) {
                    if (Math.floor(now / 400) % 2) {
                        ctx.beginPath(); ctx.arc(X1 - 96, 18, 7, 0, Math.PI * 2); ctx.fillStyle = C.red; ctx.fill();
                    }
                    text(ctx, 'REC gear ' + c.gear, X1, 18, 16, C.red, 'right', true);
                } else if (!last) {
                    text(ctx, 'Full throttle in 3rd or 4th', (X0 + X1) / 2, 196, 22, C.text, 'center', true);
                    text(ctx, 'from about 3000 rpm to the limiter', (X0 + X1) / 2, 226, 18, C.dim, 'center', false);
                }
            },
            animating: function () { return !!dyno.cur; }
        };
    }

    // ================================================================== app
    var q = query();
    var stage = $('stage'), bctx = $('bg').getContext('2d'), fctx = $('fg').getContext('2d');
    var dyn = dynamicsPage(), power = powerPage();
    var SETS = {
        street: [drivePage(), dyn, power, infoPage()],
        track: [trackPage(), lapPage(), dyn, power, sessionPage()]
    };
    // Pedal history for the 2077 G-FORCE chart: throttle %, or braking as a negative % of 1 g.
    var pedal = [], lastPedal = 0;
    function samplePedal(now) {
        if (now - lastPedal < 214) return;   // 14 bars = 3 s
        lastPedal = now;
        pedal.push(num(v.gLong) < -0.15 ? -Math.min(100, -num(v.gLong) * 100) : num(v.throttle));
        if (pedal.length > 14) pedal.shift();
    }

    // The cyberpunk sets (cyber.js, y2077.js) get the shared state through this object.
    var API = {
        v: v, num: num, fmt: fmt, G: G, RPM: RPM, sess: sess, pedal: pedal, gms: [dyn.gm],
        felt: query().gm !== 'car', dyno: dyno, gear: derivedGear, gearText: gearText, fmtLap: fmtLap, fmtDelta: fmtDelta
    };
    function resetG() { for (var k = 0; k < API.gms.length; k++) API.gms[k].reset(); }
    (function () {
        var names = ['cyber', 'y2077', 'y2077n', 'custom'], k, made;
        for (k = 0; k < names.length; k++) {
            if (W.MeterSets && W.MeterSets[names[k]]) {
                made = W.MeterSets[names[k]](API);
                if (made && made.length) SETS[names[k]] = made;   // a set without pages leaves the menu
            }
        }
    })();
    var FX = W.MeterFX, lastGear;
    // The menu: first a style, then a page of that style (with live previews), then the gauge itself.
    // Back goes up one level; at the top it is left to the Mazda framework (leave the app).
    var STYLES = [], STYLE_DEFS = [
        ['street', 'STREET', 'Tachometer, G-meter, power, info', C.red],
        ['track', 'TRACK', 'Shift bar, lap timer, G-meter, power, session', C.amber],
        ['cyber', 'CYBERPUNK', 'Neon: drive, G-force, track', '#ff2bd6'],
        ['y2077', '2077', 'Yellow: drive, G-force, track', '#fcee0a'],
        ['y2077n', '2077 NIGHT', 'Muted cyan: drive, G-force, track', '#35a9b5'],
        ['custom', 'CUSTOM', 'Your designer pages', '#38bdf8']
    ];
    (function () {
        for (var k = 0; k < STYLE_DEFS.length; k++) {
            var d = STYLE_DEFS[k];
            if (SETS[d[0]]) STYLES.push({ key: d[0], name: d[1], sub: d[2], accent: d[3] });
        }
    })();
    function styleIndex(key) { for (var k = 0; k < STYLES.length; k++) if (STYLES[k].key === key) return k; return 0; }

    var mode = 'style', styleSel = 0, pickSet = 'street', pickSel = 0;
    var setName = 'street', pages = SETS.street, cur = 0;
    var dots = $('dots');

    function remember() {
        try { W.localStorage.setItem('miatoff.set', setName); W.localStorage.setItem('miatoff.page', String(cur)); } catch (e) { /* no storage */ }
    }

    // Open a gauge page.
    function useSet(name, page) {
        mode = 'gauge';
        setName = name;
        pages = SETS[name];
        stage.className = 'set-' + name;   // lets the CSS theme the dots and hide the corner arrows
        while (dots.firstChild) dots.removeChild(dots.firstChild);
        for (var k = 0; k < pages.length; k++) dots.appendChild(doc.createElement('span'));
        show(page || 0);
    }

    function show(n) {
        cur = (n + pages.length) % pages.length;
        bctx.clearRect(0, 0, 800, 480);
        pages[cur].drawStatic(bctx);
        for (var k = 0; k < dots.childNodes.length; k++) dots.childNodes[k].className = k === cur ? 'on' : '';
        remember();
        forceDraw = true;
    }

    // Live previews: each page is drawn full size into a scratch canvas twice a second and scaled down.
    var TW = 240, TH = 144, thumbs = {}, scratch = doc.createElement('canvas');
    scratch.width = 800; scratch.height = 480;
    function thumb(key, i, now) {
        var t = (thumbs[key] || (thumbs[key] = []))[i], sc;
        if (!t) {
            t = thumbs[key][i] = { stat: doc.createElement('canvas'), small: doc.createElement('canvas'), at: 0 };
            t.stat.width = 800; t.stat.height = 480; t.small.width = TW; t.small.height = TH;
        }
        if (!t.ready) { SETS[key][i].drawStatic(t.stat.getContext('2d')); t.ready = true; }
        if (now - t.at >= 500) {
            t.at = now;
            sc = scratch.getContext('2d');
            sc.clearRect(0, 0, 800, 480);
            sc.drawImage(t.stat, 0, 0);
            SETS[key][i].draw(sc, now);
            t.small.getContext('2d').drawImage(scratch, 0, 0, 800, 480, 0, 0, TW, TH);
        }
        return t.small;
    }
    function staleThumbs() { for (var k in thumbs) if (thumbs.hasOwnProperty(k)) for (var i = 0; i < thumbs[k].length; i++) if (thumbs[k][i]) thumbs[k][i].ready = false; }

    function menuStatic(title, canBack, hint) {
        var c = bctx;
        c.fillStyle = '#000'; c.fillRect(0, 0, 800, 480);
        c.fillStyle = '#121216'; c.fillRect(0, 0, 800, 58);
        c.fillStyle = C.ring; c.fillRect(0, 58, 800, 2);
        if (canBack) text(c, '‹', 28, 26, 48, C.dim, 'center', false);
        text(c, title, canBack ? 58 : 24, 30, 28, C.text, 'left', true);
        text(c, 'MIATA', 776, 30, 15, C.dim, 'right', true);
        text(c, hint, 400, 458, 15, C.faint, 'center', false);
    }
    function openStyle() {
        mode = 'style';
        styleSel = styleIndex(setName);
        stage.className = 'mode-menu';
        menuStatic('Choose a style', false, 'Turn: choose  ·  Press: open  ·  Back: leave');
        forceDraw = true;
    }
    function openPick(key, sel) {
        mode = 'pick';
        pickSet = key; pickSel = sel || 0;
        stage.className = 'mode-menu';
        menuStatic(STYLES[styleIndex(key)].name, true, 'Turn: choose  ·  Press: open  ·  Back: styles');
        forceDraw = true;
    }

    // The style list fits from y 72 to the hint at 458. Up to four styles use the full 84 px rows; with more, the
    // rows get shorter (five fit at 69 px) and the preview keeps its 5:3 shape.
    var ROW_Y = 72, ROW_GAP = 10, ROWS_END = 452;
    function rowHeight() { return Math.min(84, Math.floor((ROWS_END - ROW_Y - (STYLES.length - 1) * ROW_GAP) / STYLES.length)); }
    function drawStyleMenu(c, now) {
        var i, st, y, on, rh = rowHeight(), small = rh < 84, tw = Math.round(rh * TW / TH);
        for (i = 0; i < STYLES.length; i++) {
            st = STYLES[i]; y = ROW_Y + i * (rh + ROW_GAP); on = i === styleSel;
            if (on) { c.fillStyle = '#1b1b21'; c.fillRect(16, y, 768, rh); }
            c.globalAlpha = on ? 1 : 0.35; c.fillStyle = st.accent; c.fillRect(16, y, 6, rh); c.globalAlpha = 1;
            text(c, st.name, 40, y + (small ? 26 : 32), small ? 30 : 34, on ? C.text : '#9a9aa3', 'left', true);
            text(c, st.sub, 40, y + (small ? 53 : 64), small ? 15 : 17, on ? C.dim : C.faint, 'left', false);
            c.globalAlpha = on ? 1 : 0.45;
            c.drawImage(thumb(st.key, 0, now), 0, 0, TW, TH, 784 - tw, y, tw, rh);
            c.globalAlpha = 1;
            if (on) { c.strokeStyle = st.accent; c.lineWidth = 2; c.strokeRect(784 - tw + 1, y + 1, tw - 2, rh - 2); }
        }
    }
    // Page picker: three columns of 240x144 previews for up to six pages, four columns of 180x108 for more (up to 8).
    function pickLayout(n) {
        if (n > 6) return { cols: 4, w: 180, h: 108, gap: 16, top: 76, rowGap: 52, label: 16, chars: 16 };
        return { cols: 3, w: TW, h: TH, gap: 24, top: n <= 3 ? 150 : 76, rowGap: 54, label: 20, chars: 22 };
    }
    function pickPos(i, n) {
        var L = pickLayout(n);
        return { x: 16 + (i % L.cols) * (L.w + L.gap), y: L.top + Math.floor(i / L.cols) * (L.h + L.rowGap) };
    }
    function drawPickMenu(c, now) {
        var ps = SETS[pickSet], acc = STYLES[styleIndex(pickSet)].accent, i, p, on, L = pickLayout(ps.length), nm;
        for (i = 0; i < ps.length; i++) {
            p = pickPos(i, ps.length); on = i === pickSel;
            c.drawImage(thumb(pickSet, i, now), 0, 0, TW, TH, p.x, p.y, L.w, L.h);
            c.lineWidth = on ? 4 : 1; c.strokeStyle = on ? acc : C.ring;
            c.strokeRect(p.x - (on ? 3 : 0.5), p.y - (on ? 3 : 0.5), L.w + (on ? 6 : 1), L.h + (on ? 6 : 1));
            nm = ps[i].name;
            if (nm.length > L.chars) nm = nm.substr(0, L.chars - 1) + '..';
            text(c, nm, p.x + L.w / 2, p.y + L.h + 26, L.label, on ? C.text : C.dim, 'center', true);
        }
    }

    // Knob / keys / touch all end up here. Each returns true when it handled the input.
    function move(d) {
        if (mode === 'gauge') show(cur + d);
        else if (mode === 'style') styleSel = Math.max(0, Math.min(STYLES.length - 1, styleSel + d));
        else pickSel = Math.max(0, Math.min(SETS[pickSet].length - 1, pickSel + d));
        forceDraw = true;
        return true;
    }
    function select() {
        if (mode === 'style') { openPick(STYLES[styleSel].key, 0); return true; }
        if (mode === 'pick') { useSet(pickSet, pickSel); return true; }
        return false;   // not used inside a gauge
    }
    function back() {
        if (mode === 'gauge') { openPick(setName, cur); return true; }
        if (mode === 'pick') { setName = pickSet; openStyle(); return true; }
        return false;   // top level: the Mazda framework leaves the app
    }

    var last = Date.now(), lastHist = 0, lastDraw = 0, lastSeen = 0, forceDraw = true;

    function smooth(dt) {
        var chans = D.CHANNELS, k, key, t, cur2, tau, moving = false;
        for (k = 0; k < chans.length; k++) {
            key = chans[k].key;
            t = D.target[key];
            if (t === undefined) continue;
            cur2 = v[key];
            if (cur2 === undefined || chans[k].discrete) { v[key] = t; continue; }
            // Glide over roughly the update interval so ~1 Hz data still moves smoothly.
            tau = G.clamp(D.interval * (key === 'gLat' || key === 'gLong' ? 0.35 : 0.5), 0.05, 0.6);
            v[key] = cur2 + (t - cur2) * (1 - Math.exp(-dt / tau));
            if (Math.abs(t - v[key]) > 0.002 * (Math.abs(t) + 1)) moving = true;
        }
        return moving;
    }

    function sampleHistory(now) {
        if (now - lastHist < 500) return;
        lastHist = now;
        var chans = D.CHANNELS, k, key, a;
        for (k = 0; k < chans.length; k++) {
            key = chans[k].key;
            if (v[key] === undefined) continue;
            a = hist[key] || (hist[key] = []);
            a.push(v[key]);
            if (a.length > G.HIST_LEN) a.shift();
        }
    }

    // ------------------------------------------------------------------ rev ring and 2077 damage glitch
    // A thin border around the screen that turns amber, then red with the revs, fading inward. Rendered once
    // per colour; drawing it is four drawImage calls of the edge strips (no gradients in the frame loop).
    // Both are drawn over the page whenever it is redrawn; they never force a redraw themselves, except the
    // shift flash (no extra canvas layer: on the car every layer costs a full-screen blend per repaint).
    // depth: how far it fades in (px); solid: width of the full-colour edge; peak: opacity where the fade starts.
    function makeRing(col, depth, solid, peak) {
        var c = doc.createElement('canvas'), x, i;
        c.width = 800; c.height = 480;
        x = c.getContext('2d');
        x.strokeStyle = col; x.lineWidth = 1;
        for (i = 0; i < depth; i++) {
            x.globalAlpha = i < solid ? 1 : peak * Math.pow(1 - (i - solid) / (depth - solid), 2);
            x.strokeRect(i + 0.5, i + 0.5, 800 - 2 * i - 1, 480 - 2 * i - 1);
        }
        return { img: c, depth: depth };
    }
    var rings = {
        amber: makeRing(C.amber, 26, 4, 0.55),
        red: makeRing(C.red, 26, 4, 0.55),
        flash: makeRing('#ff2a2a', 64, 12, 0.9)    // shift now: brighter, thicker and deeper
    };
    var lastFlash = false, lastToast = false;

    // Short message over the page (lap timer: tap ignored, timer stopped), in the style's accent colour.
    function drawToast(ctx) {
        var acc = STYLES[styleIndex(setName)].accent;
        ctx.globalAlpha = 0.92; ctx.fillStyle = '#000'; ctx.fillRect(150, 176, 500, 128); ctx.globalAlpha = 1;
        ctx.lineWidth = 3; ctx.strokeStyle = acc; ctx.strokeRect(151.5, 177.5, 497, 125);
        text(ctx, sess.msg, 400, 230, 44, acc, 'center', true);
        text(ctx, sess.msgSub, 400, 275, 20, '#ccc', 'center', false);
    }
    function flashOn(now) { return Math.floor(now / 90) % 2 === 0; }
    function drawRing(ctx, rpm, now) {
        var ring, a = 1, R, H;
        if (rpm >= RPM.shift) {
            if (!flashOn(now)) return;                                       // flash: full ring / nothing
            ring = rings.flash;
        } else if (rpm >= RPM.red) {
            ring = rings.red;
        } else if (rpm >= RPM.amber - 300) {
            ring = rings.amber;
            a = G.clamp((rpm - (RPM.amber - 300)) / 300, 0, 1);              // fades in over the last 300 rpm
        } else {
            return;
        }
        R = ring.depth; H = 480 - 2 * R;
        ctx.globalAlpha = a;
        ctx.drawImage(ring.img, 0, 0, 800, R, 0, 0, 800, R);
        ctx.drawImage(ring.img, 0, 480 - R, 800, R, 0, 480 - R, 800, R);
        ctx.drawImage(ring.img, 0, R, R, H, 0, R, R, H);
        ctx.drawImage(ring.img, 800 - R, R, R, H, 800 - R, R, R, H);
        ctx.globalAlpha = 1;
    }

    function frame() {
        var now = Date.now(), dt = Math.min(0.25, (now - last) / 1000), moving, fresh;
        last = now;
        D.tick(dt);
        moving = smooth(dt);
        sess.update();
        sampleHistory(now);
        if (v.gLat !== undefined) { for (var gi = 0; gi < API.gms.length; gi++) API.gms[gi].push(v.gLat, num(v.gLong), now); }
        samplePedal(now);
        if (SETS.custom && SETS.custom.tick) SETS.custom.tick(now);
        if (FX) {
            var g = derivedGear();
            if (g !== lastGear && g !== undefined && lastGear !== undefined) FX.kick(now, 220);   // glitch on a gear change
            lastGear = g;
            if (FX.updateGlitch(now)) forceDraw = true;
        }

        fresh = D.lastData !== lastSeen;
        lastSeen = D.lastData;
        // The dyno works on raw values per data update: smoothing would shift rpm against acceleration.
        if (fresh) {
            dyno.sample(now, { speed: D.target.speed, gLong: D.target.gLong, rpm: D.target.rpm,
                throttle: D.target.throttle, gear: derivedGear() });
        }
        if (mode !== 'gauge') {
            if (forceDraw || now - lastDraw > 250) {
                forceDraw = false;
                lastDraw = now;
                fctx.clearRect(0, 0, 800, 480);
                if (mode === 'style') drawStyleMenu(fctx, now); else drawPickMenu(fctx, now);
                $('nodata').style.display = 'none';
            }
            setTimeout(frame, 33);
            return;
        }
        // Rev ring on every page of the track, cyber and 2077 sets; both 2077 sets add the damage glitch on top.
        var rpm = num(v.rpm), ring = setName !== 'street' && setName !== 'custom', dmg = setName.indexOf('y2077') === 0 ? W.MeterSets.y2077Damage : null,
            flip = ring && rpm >= RPM.shift && flashOn(now) !== lastFlash;   // redraw only when the flash toggles
        lastFlash = flashOn(now);
        var toast = now < sess.msgUntil;
        if (forceDraw || moving || fresh || flip || toast || pages[cur].animating() || now - lastDraw > 1000 ||
                (lastToast && !toast)) {
            // Custom pages can redraw just the instruments that changed; anything painted over the whole page needs a full redraw.
            var partial = pages[cur].drawChanged && !forceDraw && !toast && !lastToast;
            forceDraw = false;
            lastDraw = now;
            if (partial) {
                pages[cur].drawChanged(fctx, now);
            } else {
                fctx.clearRect(0, 0, 800, 480);
                pages[cur].draw(fctx, now);
            }
            if (ring) drawRing(fctx, rpm, now);
            if (dmg) dmg.draw(fctx, rpm, now, RPM, flashOn(now));
            if (toast) drawToast(fctx);
            $('nodata').style.display = D.live && D.stale() ? 'block' : 'none';
        }
        lastToast = toast;
        setTimeout(frame, 33);
    }

    // ------------------------------------------------------------------ input
    var down = null, lastTouch = 0;

    function local(e) {
        var r = stage.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function start(p) { p.t = Date.now(); down = p; }
    function end(p) {
        if (!down) return;
        var dx = p.x - down.x, dy = p.y - down.y, held = Date.now() - down.t, i, q2, rh, pl;
        down = null;
        if (mode !== 'gauge') {
            if (Math.abs(dx) > 20 || Math.abs(dy) > 20) return;
            if (mode === 'pick' && p.y < 60 && p.x < 200) { back(); return; }
            if (mode === 'style') {
                rh = rowHeight();
                for (i = 0; i < STYLES.length; i++) {
                    if (p.y >= ROW_Y + i * (rh + ROW_GAP) && p.y < ROW_Y + i * (rh + ROW_GAP) + rh) { styleSel = i; select(); return; }
                }
            } else {
                pl = pickLayout(SETS[pickSet].length);
                for (i = 0; i < SETS[pickSet].length; i++) {
                    q2 = pickPos(i, SETS[pickSet].length);
                    if (p.x >= q2.x && p.x < q2.x + pl.w && p.y >= q2.y && p.y < q2.y + pl.h + 40) { pickSel = i; select(); return; }
                }
            }
            return;
        }
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { show(cur + (dx < 0 ? 1 : -1)); return; }
        if (Math.abs(dx) > 20 || Math.abs(dy) > 20) return;
        if (held > 1200) {                        // long-press: stop the lap timer on a lap page, else back
            if (pages[cur].hold && pages[cur].hold()) forceDraw = true; else back();
            return;
        }
        if (p.y > 400 && p.x < 90) { show(cur - 1); return; }
        if (p.y > 400 && p.x > 710) { show(cur + 1); return; }
        if (pages[cur].tap && pages[cur].tap(p.x, p.y)) { forceDraw = true; return; }
        show(cur + 1);
    }

    stage.addEventListener('touchstart', function (e) {
        lastTouch = Date.now(); start(local(e.touches[0])); e.preventDefault();
    }, false);
    stage.addEventListener('touchend', function (e) {
        lastTouch = Date.now(); end(local(e.changedTouches[0])); e.preventDefault();
    }, false);
    stage.addEventListener('mousedown', function (e) { if (Date.now() - lastTouch > 800) start(local(e)); }, false);
    stage.addEventListener('mouseup', function (e) { if (Date.now() - lastTouch > 800) end(local(e)); }, false);
    doc.addEventListener('keydown', function (e) {
        var k = e.keyCode;
        if (k === 37 || k === 38) move(-1);
        else if (k === 39 || k === 40) move(1);
        else if (k === 13 || k === 32) select();
        else if (k === 27 || k === 8) { back(); e.preventDefault(); }
        else if (k === 82) { resetG(); forceDraw = true; }                  // R
        else if (k === 76) { sess.lap(Date.now()); forceDraw = true; }     // L
    }, false);

    // For the HMI wrapper (meters-app/): knob turn -> next/prev, knob press -> select, back button -> back.
    // select() and back() return false when they did nothing; for back() that means "leave the app".
    W.MiatoffMeters = {
        next: function () { return move(1); },
        prev: function () { return move(-1); },
        select: select,
        back: back
    };

    // ------------------------------------------------------------------ go
    D.start(q.src || 'sim');
    $('src').innerHTML = D.sourceName;
    // Start where the driver left off; the very first time, in the style menu.
    (function () {
        var set = SETS[q.set] ? q.set : null, page = parseInt(q.page, 10) || 0;
        if (!set) {
            try {
                if (SETS[W.localStorage.getItem('miatoff.set')]) {
                    set = W.localStorage.getItem('miatoff.set');
                    page = parseInt(W.localStorage.getItem('miatoff.page'), 10) || 0;
                }
            } catch (e) { /* no storage */ }
        }
        if (q.menu !== undefined) set = null;
        if (set) useSet(set, page); else openStyle();
    })();
    // Bundled fonts load after the first paint: redraw the static layers once they are likely in.
    function refreshStatic() {
        if (SETS.custom && SETS.custom.flush) SETS.custom.flush();   // text sizes measured before the fonts came in
        staleThumbs();
        if (mode === 'gauge') show(cur); else if (mode === 'style') openStyle(); else openPick(pickSet, pickSel);
    }
    // A background image of a custom page finished loading: draw the static layers again.
    if (W.MeterCustom) W.MeterCustom.onImage = refreshStatic;
    setTimeout(refreshStatic, 700);
    setTimeout(refreshStatic, 2500);
    frame();
})(window, document);

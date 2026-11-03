/* MiatOff Meters — 2077 page set: yellow, black-on-yellow, red/cyan accents, all angular
 * (design: meters/design/cyberpunk2077/). ES5 only. Registers W.MeterSets.y2077(api) -> pages.
 */
(function (W) {
    'use strict';

    var FX = W.MeterFX;
    var Y = '#fcee0a', K = '#0b0b0c', RD = '#ff003c', CN = '#02d7f2', WH = '#f2f2f2';
    var OFF = '#1c1c1a', OFFL = '#3a3a32', DIM = '#8c8550', GRID = '#3a3510';
    var F = FX.COND;

    function fringe(bg) { return { left: RD, right: CN, shift: 3, alpha: 0.55, bg: bg || K, fam: F }; }

    function header(c, title, sub, right) {
        c.fillStyle = Y; FX.poly(c, [[0, 0], [800, 0], [800, 30], [784, 44], [0, 44]]); c.fill();
        var end = FX.spaced(c, title, 16, 36, 34, F, K, 2);
        if (sub) FX.text(c, sub, end + 16, 30, 13, FX.MONO, K, 'left');
        FX.hazard(c, 600, 8, 70, 26, K, Y);
        if (right) FX.text(c, right, 784, 30, 13, FX.MONO, K, 'right');
    }

    // Slanted blocks, lit from the left.
    function blocks(c, x, y, n, step, w, h, k, col) {
        for (var i = 0; i < n; i++) {
            FX.skew(c, x + i * step, y, w, h, 3);
            if (i < k) { c.fillStyle = col; c.fill(); } else if (k < 0) { c.fillStyle = OFF; c.strokeStyle = OFFL; c.fill(); c.stroke(); }
        }
    }
    function blocksOff(c, x, y, n, step, w, h) { blocks(c, x, y, n, step, w, h, -1); }

    // ================================================================== 2077 DRIVE
    function drive(A) {
        var N = 32, X0 = 16, X1 = 508, BASE = 236, SK = 12, STEP = (X1 - X0) / N;
        function ramp(c, i) {
            var h = 34 + 136 * Math.pow(i / (N - 1), 1.25), x = X0 + i * STEP;
            FX.poly(c, [[x + SK, BASE - h], [x + SK + STEP - 5, BASE - h], [x + STEP - 5, BASE], [x, BASE]]);
        }
        return {
            name: '2077 DRIVE',
            drawStatic: function (c) {
                var i, k, r;
                FX.backdrop(c, K, GRID);
                header(c, 'CYBER-MIATA', '// ND1 1.5 · 74.00.324', 'SYS ONLINE');
                c.lineWidth = 1;
                for (i = 0; i < N; i++) {
                    r = (i + 1) * 8000 / N;
                    c.fillStyle = r > A.RPM.red ? '#2a0a10' : OFF; c.strokeStyle = r > A.RPM.red ? '#5a1020' : OFFL;
                    ramp(c, i); c.fill(); c.stroke();
                }
                for (k = 0; k <= 8; k++) FX.text(c, String(k), X0 + k / 8 * (X1 - X0), 262, 22, F, k >= 7 ? RD : Y, 'left');
                c.strokeStyle = Y; c.globalAlpha = 0.35; c.beginPath(); c.moveTo(X0, 270.5); c.lineTo(X1, 270.5); c.stroke(); c.globalAlpha = 1;
                c.fillStyle = Y; FX.chamfer(c, 532, 68, 252, 206, 26); c.fill();
                FX.spaced(c, 'GEAR', 550, 98, 22, F, K, 3);
                c.fillStyle = RD; c.fillRect(752, 82, 14, 14);
                FX.spaced(c, 'COOLANT', 532, 318, 14, FX.MONO, RD, 3);
                FX.spaced(c, 'FUEL', 532, 390, 14, FX.MONO, RD, 3);
                blocksOff(c, 532, 334, 21, 12, 9, 14);
                blocksOff(c, 532, 406, 21, 12, 9, 14);
                FX.hazard(c, 16, 454, 120, 14, K, Y);
            },
            draw: function (c, now) {
                var v = A.v, rpm = A.num(v.rpm), i, r;
                for (i = 0; i < N; i++) {
                    r = (i + 1) * 8000 / N;
                    if (r > rpm) break;
                    c.fillStyle = r > A.RPM.red ? RD : Y; ramp(c, i); c.fill();
                }
                FX.spaced(c, 'RPM ' + A.fmt(v.rpm, 0), 16, 298, 15, FX.MONO, RD, 3);
                var sp = A.fmt(v.speed, 0), px = FX.fit(c, sp, 168, F, 400), o = fringe();
                o.align = 'left';
                FX.gtext(c, sp, 16, 448, px, Y, o);
                c.font = FX.font(px, F);
                FX.spaced(c, 'KM/H', 16 + c.measureText(sp).width + 18, 448, 30, F, Y, 4, 'left', 0.75);
                FX.text(c, A.gearText(A.gear()), 658, 262, 230, F, K, 'center');
                FX.text(c, A.fmt(v.coolant, 0) + '°C', 784, 326, 48, F, v.coolant >= 105 ? RD : Y, 'right');
                FX.text(c, A.fmt(v.fuel, 0) + '%', 784, 398, 48, F, Y, 'right');
                blocks(c, 532, 334, 21, 12, 9, 14, Math.round(Math.max(0, Math.min(1, (A.num(v.coolant) - 40) / 80)) * 21), Y);
                blocks(c, 532, 406, 21, 12, 9, 14, Math.round(Math.max(0, Math.min(1, A.num(v.fuel) / 100)) * 21), Y);
                // short enough to stay left of the page dots
                FX.text(c, 'THR ' + A.fmt(v.throttle, 0) + '% · IAT ' + A.fmt(v.iat, 0) + '° · OUT ' +
                    A.fmt(v.outside, 0) + '°', 146, 466, 13, FX.MONO, Y, 'left', 0.85);
            },
            animating: function () { return FX.glitching(); }
        };
    }

    // ================================================================== 2077 G-FORCE
    function gforce(A) {
        var cx = 236, cy = 258, R = 188, MAX = 1.25, CUT = 34;
        var gm = new A.G.GMeter({ cx: cx, cy: cy, r: R, max: MAX, felt: A.felt });
        A.gms.push(gm);
        var rows = [['L-TURN', 'l', Y], ['R-TURN', 'r', Y], ['ACCEL', 'acc', CN], ['BRAKE', 'brk', RD]];
        function box(c, r, k) {
            FX.poly(c, [[cx - r + k, cy - r], [cx + r - k, cy - r], [cx + r, cy - r + k], [cx + r, cy + r - k],
                [cx + r - k, cy + r], [cx - r + k, cy + r], [cx - r, cy + r - k], [cx - r, cy - r + k]]);
        }
        return {
            name: '2077 G-FORCE',
            gm: gm,
            drawStatic: function (c) {
                var g, r, i, yy, major;
                FX.backdrop(c, K, GRID);
                c.fillStyle = Y; FX.poly(c, [[0, 0], [300, 0], [280, 40], [0, 40]]); c.fill();
                FX.spaced(c, 'G-FORCE', 16, 34, 34, F, K, 2);
                c.strokeStyle = Y; c.lineWidth = 2; c.beginPath(); c.moveTo(300, 1); c.lineTo(800, 1); c.stroke();
                c.fillStyle = '#121210'; c.lineWidth = 3; box(c, R, CUT); c.fill(); c.stroke();
                for (g = 0.25; g <= 1.0001; g += 0.25) {
                    r = R * g / MAX; major = Math.abs(g - 0.5) < 1e-6 || Math.abs(g - 1) < 1e-6;
                    c.strokeStyle = major ? Y : '#5a5410'; c.globalAlpha = major ? 0.7 : 1; c.lineWidth = 1.5;
                    box(c, r, CUT * r / R); c.stroke(); c.globalAlpha = 1;
                    if (major) FX.text(c, g.toFixed(1), cx + r - 30, cy - r + 16, 14, FX.MONO, Y, 'left');
                }
                c.strokeStyle = Y; c.globalAlpha = 0.35; c.lineWidth = 1; c.beginPath();
                c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke(); c.globalAlpha = 1;
                FX.spaced(c, A.felt ? 'BRAKE' : 'ACCEL', cx, cy - R + 30, 22, F, Y, 3, 'center', 0.8);
                FX.spaced(c, A.felt ? 'ACCEL' : 'BRAKE', cx, cy + R - 14, 22, F, Y, 3, 'center', 0.8);
                FX.text(c, A.felt ? 'R' : 'L', cx - R + 14, cy - 10, 24, F, Y, 'left', 0.8);
                FX.text(c, A.felt ? 'L' : 'R', cx + R - 14, cy - 10, 24, F, Y, 'right', 0.8);
                for (i = 0; i < rows.length; i++) {
                    yy = 64 + i * 56;
                    c.fillStyle = rows[i][2]; FX.poly(c, [[470, yy], [478, yy], [478, yy + 44], [470, yy + 36]]); c.fill();
                    FX.spaced(c, rows[i][0], 490, yy + 18, 13, FX.MONO, DIM, 2);
                    FX.text(c, 'PEAK', 490, yy + 38, 11, FX.MONO, DIM, 'left');
                }
                FX.text(c, 'THROTTLE / BRAKE  ·  LAST 3S', 470, 312, 13, FX.MONO, DIM, 'left');
            },
            draw: function (c, now) {
                var v = A.v, t = gm.trail, i, p, q, age, lat = A.num(v.gLat), lng = A.num(v.gLong), dot, sx, sy, s,
                    h = A.pedal, bw = 17, gap = 5, top = 322, base = 440, x, val, hh, g;
                c.strokeStyle = Y;
                for (i = 1; i < t.length; i++) {
                    p = t[i - 1]; q = t[i]; age = (now - q.t) / gm.trailMs;
                    c.globalAlpha = Math.max(0, 1 - age); c.lineWidth = 2 + 4 * (1 - age);
                    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke();
                }
                c.globalAlpha = 1;
                dot = gm.pos(lat, lng);
                c.strokeStyle = Y; c.lineWidth = 2.5; c.beginPath();
                for (i = 0; i < 4; i++) {
                    sx = i === 1 || i === 2 ? 1 : -1; sy = i < 2 ? -1 : 1;
                    c.moveTo(dot.x + sx * 20, dot.y + sy * 10); c.lineTo(dot.x + sx * 20, dot.y + sy * 20); c.lineTo(dot.x + sx * 10, dot.y + sy * 20);
                }
                c.stroke();
                c.fillStyle = RD; FX.poly(c, [[dot.x, dot.y - 12], [dot.x + 12, dot.y], [dot.x, dot.y + 12], [dot.x - 12, dot.y]]); c.fill();
                g = Math.sqrt(lat * lat + lng * lng);
                s = dot.x > cx + R - 120 ? -1 : 1;   // keep the tag inside the screen
                x = s > 0 ? dot.x + 26 : dot.x - 108;
                c.fillStyle = Y; FX.poly(c, [[x, dot.y - 46], [x + 82, dot.y - 46], [x + 82, dot.y - 30], [x + 72, dot.y - 20], [x, dot.y - 20]]); c.fill();
                FX.text(c, g.toFixed(2) + 'G', x + 40, dot.y - 24, FX.fit(c, g.toFixed(2) + 'G', 26, F, 72), F, K, 'center');
                for (i = 0; i < rows.length; i++) FX.text(c, A.fmt(gm.peak[rows[i][1]], 2), 784, 64 + i * 56 + 44, 58, F, rows[i][2], 'right');
                for (i = 0; i < 14; i++) {
                    x = 470 + i * (bw + gap);
                    c.fillStyle = '#3a3a36'; c.fillRect(x, top, bw, base - top);
                    val = h[h.length - 14 + i];
                    if (val === undefined) continue;
                    hh = Math.min(100, Math.abs(val)) / 100 * (base - top);
                    c.fillStyle = val < 0 ? RD : Y; c.fillRect(x, base - hh, bw, hh);
                }
                FX.text(c, A.fmt(v.throttle, 0) + '%', 470 + 13 * (bw + gap) + bw / 2, top - 4, 18, F, Y, 'center');
            },
            animating: function () { return gm.trail.length > 1; },
            tap: function (x, y) {
                if (Math.abs(x - cx) > R || Math.abs(y - cy) > R) return false;
                gm.reset();
                return true;
            }
        };
    }

    // ================================================================== 2077 TRACK
    function track(A) {
        var N = 24, X0 = 16, STEP = (784 - X0) / N, LO = 3000, HI = A.RPM.limit;
        function bar(c, i) {
            var x = X0 + i * STEP;
            FX.poly(c, [[x + 8, 18], [x + STEP - 7 + 8, 18], [x + STEP - 7, 118], [x, 118]]);
        }
        return {
            name: '2077 TRACK',
            drawStatic: function (c) {
                var i, k, x;
                FX.backdrop(c, K, GRID);
                c.fillStyle = '#3a3a36';
                for (i = 0; i < N; i++) { bar(c, i); c.fill(); }
                for (k = 3; k <= 7; k++) {
                    x = X0 + (k * 1000 - LO) / (HI - LO) * (784 - X0);
                    FX.text(c, String(k), x, 144, 22, F, k >= 7 ? RD : Y, 'center');
                }
                c.fillStyle = Y; FX.chamfer(c, 296, 156, 208, 228, 30); c.fill();
                FX.spaced(c, 'GEAR', 314, 186, 20, F, K, 3);
                FX.spaced(c, 'KM/H', 140, 344, 22, F, Y, 6, 'center', 0.75);
                FX.spaced(c, 'RPM', 662, 344, 22, F, Y, 6, 'center', 0.75);
                c.fillStyle = Y; FX.chamfer(c, 16, 400, 768, 62, 20); c.fill();
                FX.hazard(c, 460, 414, 90, 34, K, Y);
            },
            draw: function (c, now) {
                var v = A.v, s = A.sess, rpm = A.num(v.rpm), i, r, d = s.delta;
                for (i = 0; i < N; i++) {
                    r = LO + (i + 1) * (HI - LO) / N;
                    if (r > rpm) break;
                    c.fillStyle = r > A.RPM.red ? RD : Y; bar(c, i); c.fill();
                }
                FX.text(c, A.gearText(A.gear()), 400, 378, 236, F, rpm >= A.RPM.red ? RD : K, 'center');
                FX.gtext(c, A.fmt(v.speed, 0), 140, 310, FX.fit(c, A.fmt(v.speed, 0), 120, F, 230), Y, fringe());
                FX.text(c, A.fmt(v.rpm, 0), 662, 310, FX.fit(c, A.fmt(v.rpm, 0), 110, F, 210), F, rpm >= A.RPM.red ? RD : WH, 'center');
                var lx = FX.spaced(c, 'LAP ' + (s.laps + 1 < 10 ? '0' : '') + (s.laps + 1), 32, 442, 24, F, K, 2) + 14,
                    lt = s.lapStart ? A.fmtLap(now - s.lapStart, 1) : 'TAP AT LINE';
                FX.text(c, lt, lx, 452, FX.fit(c, lt, s.lapStart ? 60 : 40, F, 308 - lx), F, K, 'left');
                if (d !== null && d !== undefined) {
                    c.fillStyle = K; FX.poly(c, [[318, 410], [436, 410], [436, 442], [426, 452], [318, 452]]); c.fill();
                    FX.text(c, A.fmtDelta(d), 377, 443, 38, F, d <= 0 ? CN : RD, 'center');
                }
                FX.text(c, 'BEST ' + A.fmtLap(s.best, 2), 764, 442, FX.fit(c, 'BEST ' + A.fmtLap(s.best, 2), 30, F, 200), F, K, 'right');
            },
            animating: function () { return FX.glitching() || !!A.sess.lapStart; },
            tap: function () { A.sess.lap(Date.now()); return true; },
            hold: function () { return A.sess.stop(Date.now()); }
        };
    }

    // ================================================================== damage glitch (shift light)
    // Like taking damage in the game: red LED-grid streaks. Amber revs: amber streaks from the left and right
    // edges; red: red, reaching further in; shift: red streaks flash across the whole screen. Drawn over the
    // page by app.js when it redraws anyway (it never forces a redraw). The streak textures are made once when
    // the set loads (small: one edge strip, mirrored for the right side, and one half-height full-width strip);
    // a draw copies a few random bands of them, new bands at most every 120 ms.
    var EW = 240, FH = 240;                                                   // edge texture width, full texture height
    function streakTex(col, core, full) {
        var cv = W.document.createElement('canvas'), c, i, y, h, len, a, x0, g, cw = full ? 800 : EW, ch = full ? FH : 480;
        cv.width = cw; cv.height = ch; c = cv.getContext('2d');
        for (i = 0; i < (full ? 20 : 20); i++) {                              // dim bands behind the streaks
            c.globalAlpha = 0.12 + Math.random() * 0.18; c.fillStyle = col;
            c.fillRect(0, Math.random() * ch, full ? 800 : 40 + Math.random() * (EW - 40), 8 + Math.random() * 40);
        }
        for (i = 0; i < (full ? 300 : 460); i++) {
            y = Math.floor(Math.random() * ch); h = 1 + Math.floor(Math.pow(Math.random(), 2) * 7);
            a = 0.3 + Math.random() * 0.7;
            if (full) {
                len = 60 + Math.random() * 600; x0 = Math.random() * 900 - 100;
                g = c.createLinearGradient(x0, 0, x0 + len, 0);
                g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.2, col); g.addColorStop(0.8, col); g.addColorStop(1, 'rgba(0,0,0,0)');
            } else {                                                          // from the left edge inward
                len = 30 + Math.pow(Math.random(), 2) * (EW - 30); x0 = 0;
                g = c.createLinearGradient(0, 0, len, 0);
                g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
            }
            c.globalAlpha = a; c.fillStyle = g; c.fillRect(x0, y, len, h);
            if (h >= 3 && Math.random() < 0.6) {                              // hot core
                c.globalAlpha = a * 0.9; c.fillStyle = core;
                c.fillRect(x0 + (full ? len * 0.25 : 0), y + Math.floor(h / 2), len * 0.5, 1);
            }
        }
        // LED grid: dim every 4th row and column.
        c.globalAlpha = 0.7; c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000';
        for (i = 3; i < cw; i += 4) c.fillRect(i, 0, 1, ch);
        for (i = 3; i < ch; i += 4) c.fillRect(0, i, cw, 1);
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
        return cv;
    }

    var Damage = (function () {
        var tex = null, frame = -1, lvl = 0, bands = [];
        function rnd(a, b) { return a + Math.random() * (b - a); }
        function level(rpm, R) {
            if (rpm >= R.shift) return 3;
            if (rpm >= R.red) return 2;
            return rpm >= R.amber - 300 ? 1 : 0;
        }
        function heat(rpm, R) { return Math.max(0, Math.min(1, (rpm - (R.amber - 300)) / (R.red - R.amber + 300))); }
        function reroll(lv, t) {
            var i, n = lv === 1 ? Math.round(4 + 4 * t) : (lv === 2 ? 10 : 6), h;
            bands = [];
            for (i = 0; i < n; i++) {
                h = Math.floor(rnd(6, lv === 3 ? 48 : 36));
                bands.push({ y: Math.floor(rnd(0, 480 - h)), h: h, sy: Math.floor(rnd(0, (lv === 3 ? FH : 480) - h)),
                    dl: rnd(-24, 6), dr: rnd(-6, 24), side: i % 2 });
            }
        }
        return {
            build: function () {
                if (!tex) tex = { amber: streakTex('#ff9418', '#ffe6a8', false), red: streakTex(RD, '#ffd2dc', false),
                    full: streakTex(RD, '#ffd2dc', true) };
            },
            draw: function (c, rpm, now, R, flashOn) {
                var lv = level(rpm, R), t = heat(rpm, R), f = Math.floor(now / 120), i, b, img, w;
                if (!lv) { lvl = 0; return; }
                if (!tex) this.build();
                if (f !== frame || lv !== lvl) { frame = f; lvl = lv; reroll(lv, t); }
                if (lv === 3 && flashOn) {                                      // shift: across the whole screen
                    for (i = 0; i < bands.length; i++) {
                        b = bands[i];
                        c.drawImage(tex.full, 0, b.sy, 800, b.h, b.dl * 1.5, b.y, 800, b.h);
                    }
                    return;
                }
                img = lv === 1 ? tex.amber : tex.red;
                w = lv === 1 ? Math.round(120 + 80 * t) : EW;                   // how far in from each side
                c.globalAlpha = lv === 1 ? 0.6 + 0.4 * t : 1;
                for (i = 0; i < bands.length; i++) {
                    b = bands[i];
                    if (b.side) {                                               // right side: the strip mirrored
                        c.save(); c.translate(800, 0); c.scale(-1, 1);
                        c.drawImage(img, 0, b.sy, w, b.h, -b.dr, b.y, w, b.h);
                        c.restore();
                    } else {
                        c.drawImage(img, 0, b.sy, w, b.h, b.dl, b.y, w, b.h);
                    }
                }
                c.globalAlpha = 1;
            }
        };
    })();

    W.MeterSets = W.MeterSets || {};
    W.MeterSets.y2077 = function (A) { Damage.build(); return [drive(A), gforce(A), track(A)]; };
    W.MeterSets.y2077Damage = Damage;
})(window);

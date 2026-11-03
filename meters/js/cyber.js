/* MiatOff Meters — CYBER page set: neon cyan / magenta / yellow (design: meters/design/cyberpunk/). ES5 only.
 * Registers W.MeterSets.cyber(api) -> pages; app.js passes the shared state in `api`.
 */
(function (W) {
    'use strict';

    var FX = W.MeterFX;
    var BG = '#07060d', GRID = '#24154a', DIM = '#8b7bb5', TXT = '#eafcff';
    var CY = '#00f0ff', MG = '#ff2bd6', YE = '#fcee0a', OFF = '#140d26', OFFL = '#2e2052';

    function rpmCol(r, A) { return r >= A.RPM.red ? YE : (r >= A.RPM.amber ? MG : CY); }
    function fringe(bg) { return { left: MG, right: CY, shift: 4, bg: bg || BG, fam: FX.SANS }; }

    // Row of parallelogram bars. lit layer = all bars on with glow; static = all bars off.
    function SkewBar(x, y, n, step, w, h, skew, color) {
        this.x = x; this.y = y; this.n = n; this.step = step; this.w = w; this.h = h; this.skew = skew;
        var self = this;
        this.lit = FX.layer(function (c) {
            FX.glow(c, color, 8); c.fillStyle = color;
            for (var i = 0; i < n; i++) { FX.skew(c, x + i * step, y, w, h, skew); c.fill(); }
        });
        this.drawStatic = function (c) {
            c.fillStyle = OFF; c.strokeStyle = OFFL; c.lineWidth = 1;
            for (var i = 0; i < self.n; i++) { FX.skew(c, x + i * step, y, w, h, skew); c.fill(); c.stroke(); }
        };
    }
    SkewBar.prototype.draw = function (ctx, frac) {
        var k = Math.round(Math.max(0, Math.min(1, frac || 0)) * this.n);
        if (k) FX.blit(ctx, this.lit, this.x - 8, this.y - 10, (k - 1) * this.step + this.w + this.skew + 10, this.h + 20);
    };

    function header(ctx, title) {
        FX.spaced(ctx, title, 20, 26, 14, FX.MONO, MG, 2);
    }
    function ticker(ctx, right) {
        ctx.strokeStyle = CY; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.moveTo(16, 446.5); ctx.lineTo(784, 446.5); ctx.stroke();
        ctx.globalAlpha = 1;
        FX.text(ctx, right, 780, 467, 13, FX.MONO, MG, 'right');
    }

    // ================================================================== CYBER DRIVE
    function drive(A) {
        var cx = 290, cy = 286, r0 = 172, r1 = 208, A0 = 150, SPAN = 240, N = 48, step = SPAN / N;
        function ang(r) { return A0 + SPAN * Math.max(0, Math.min(8000, r)) / 8000; }
        var tachLit = FX.layer(function (c) {
            for (var i = 0; i < N; i++) {
                c.fillStyle = rpmCol((i + 0.5) * 8000 / N, A);
                FX.glow(c, c.fillStyle, 9);
                FX.sector(c, cx, cy, r0, r1, A0 + i * step + 0.65, A0 + (i + 1) * step - 0.65);
                c.fill();
            }
        });
        var cool = new SkewBar(552, 306, 19, 12, 9, 14, 4, CY), fuel = new SkewBar(552, 386, 19, 12, 9, 14, 4, MG);
        return {
            name: 'CYBER DRIVE',
            drawStatic: function (c) {
                var i, k, a, mid;
                FX.backdrop(c, BG, GRID);
                c.strokeStyle = CY; c.globalAlpha = 0.6; c.lineWidth = 1.5;
                c.beginPath(); c.moveTo(16, 34); c.lineTo(300, 34); c.lineTo(312, 22); c.lineTo(784, 22); c.stroke();
                c.globalAlpha = 1;
                header(c, 'CYBER-MIATA');
                FX.text(c, 'NODE ND1-P5 ▸ LINK OK', 784, 16, 12, FX.MONO, CY, 'right', 0.8);
                for (i = 0; i < N; i++) {
                    mid = (i + 0.5) * 8000 / N;
                    c.fillStyle = mid >= A.RPM.red ? '#2a0f2a' : OFF; c.strokeStyle = OFFL; c.lineWidth = 1;
                    FX.sector(c, cx, cy, r0, r1, A0 + i * step + 0.65, A0 + (i + 1) * step - 0.65);
                    c.fill(); c.stroke();
                }
                c.strokeStyle = CY; c.globalAlpha = 0.35; c.lineWidth = 1.5;
                for (a = 0; a < 360; a += 2.4) { c.beginPath(); c.arc(cx, cy, 160, a * Math.PI / 180, (a + 0.6) * Math.PI / 180); c.stroke(); }
                c.globalAlpha = 1;
                for (k = 0; k <= 8; k++) {
                    a = (A0 + SPAN * k / 8) * Math.PI / 180;
                    FX.text(c, String(k), cx + 236 * Math.cos(a), cy + 236 * Math.sin(a) + 7, 20, FX.MONO,
                        k >= 7 ? YE : (k >= 6 ? MG : CY), 'center', 0.85);
                }
                FX.spaced(c, 'KM/H', cx, 352, 18, FX.MONO, CY, 8, 'center');
                FX.spaced(c, 'x1000 R/MIN', cx, 430, 12, FX.MONO, DIM, 3, 'center');
                c.fillStyle = '#0d0a1c'; c.strokeStyle = CY; c.lineWidth = 1.5; c.globalAlpha = 1;
                FX.chamfer(c, 540, 52, 244, 196, 20); c.fill(); c.globalAlpha = 0.7; c.stroke(); c.globalAlpha = 1;
                FX.spaced(c, 'GEAR', 558, 78, 14, FX.MONO, CY, 4);
                FX.text(c, '■■□', 766, 78, 12, FX.MONO, MG, 'right');
                FX.spaced(c, 'COOLANT', 552, 290, 15, FX.MONO, DIM, 3);
                FX.spaced(c, 'FUEL', 552, 370, 15, FX.MONO, DIM, 3);
                cool.drawStatic(c); fuel.drawStatic(c);
                ticker(c, '◢◤ 0x7F3A');
                FX.brackets(c, CY);
            },
            draw: function (c, now) {
                var v = A.v, rpm = A.num(v.rpm), a = ang(rpm) * Math.PI / 180;
                if (rpm > 0) {
                    c.save();
                    c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r1 + 20, (A0 - 2) * Math.PI / 180, a, false); c.closePath(); c.clip();
                    c.drawImage(tachLit, 0, 0);
                    c.restore();
                }
                c.strokeStyle = '#fff'; c.lineCap = 'round';
                c.globalAlpha = 0.25; c.lineWidth = 9; c.beginPath();
                c.moveTo(cx + 150 * Math.cos(a), cy + 150 * Math.sin(a)); c.lineTo(cx + 218 * Math.cos(a), cy + 218 * Math.sin(a)); c.stroke();
                c.globalAlpha = 1; c.lineWidth = 3; c.stroke(); c.lineCap = 'butt';
                FX.spaced(c, 'RPM ' + A.fmt(v.rpm, 0), cx, 196, 16, FX.MONO, MG, 3, 'center');
                FX.gtext(c, A.fmt(v.speed, 0), cx, 318, FX.fit(c, A.fmt(v.speed, 0), 132, FX.SANS, 270), TXT, fringe());
                FX.gtext(c, A.gearText(A.gear()), 662, 222, 176, rpm >= A.RPM.red ? MG : YE, fringe('#0d0a1c'));
                FX.text(c, A.fmt(v.coolant, 0) + '°C', 784, 296, 40, FX.SANS, v.coolant >= 105 ? MG : CY, 'right');
                FX.text(c, A.fmt(v.fuel, 0) + '%', 784, 376, 40, FX.SANS, MG, 'right');
                cool.draw(c, (A.num(v.coolant) - 40) / 80);
                fuel.draw(c, A.num(v.fuel) / 100);
                // short enough to stay left of the page dots
                FX.text(c, '> THR ' + A.fmt(v.throttle, 0) + '%  > IAT ' + A.fmt(v.iat, 0) + '°C  > OUT ' +
                    A.fmt(v.outside, 1) + '°C', 20, 467, 13, FX.MONO, CY, 'left', 0.75);
            },
            animating: function () { return FX.glitching(); }
        };
    }

    // ================================================================== CYBER G
    function gforce(A) {
        var cx = 236, cy = 240, R = 192, MAX = 1.25;
        var gm = new A.G.GMeter({ cx: cx, cy: cy, r: R, max: MAX, felt: A.felt });
        A.gms.push(gm);
        var thr = new SkewBar(480, 306, 24, 12.6, 9, 26, 5, YE), brk = new SkewBar(480, 380, 24, 12.6, 9, 26, 5, MG);
        var boxes = [[480, 54, 'L-TURN', 'l', CY], [636, 54, 'R-TURN', 'r', CY], [480, 160, 'ACCEL', 'acc', YE], [636, 160, 'BRAKE', 'brk', MG]];
        function octa(c, r) {
            var pts = [], k, a;
            for (k = 0; k < 8; k++) { a = (22.5 + 45 * k) * Math.PI / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
            FX.poly(c, pts);
        }
        return {
            name: 'CYBER G',
            gm: gm,
            drawStatic: function (c) {
                var g, r, k, d, i, b;
                FX.backdrop(c, BG, GRID);
                header(c, 'G-FORCE // VECTOR');
                c.fillStyle = '#0a0818'; c.strokeStyle = CY; c.lineWidth = 2;
                FX.glow(c, CY, 10); octa(c, R); c.fill(); c.stroke(); FX.noGlow(c);
                for (g = 0.25; g <= 1.0001; g += 0.25) {
                    r = R * g / MAX;
                    var major = Math.abs(g - 0.5) < 1e-6 || Math.abs(g - 1) < 1e-6;
                    c.strokeStyle = major ? CY : '#3a2a66'; c.globalAlpha = major ? 0.55 : 1; c.lineWidth = 1.5;
                    octa(c, r); c.stroke(); c.globalAlpha = 1;
                    if (major) FX.text(c, g.toFixed(1) + 'G', cx + r * 0.38 + 4, cy - r * 0.92 + 16, 13, FX.MONO, CY, 'left', 0.8);
                }
                c.strokeStyle = CY; c.globalAlpha = 0.3; c.lineWidth = 1; c.beginPath();
                c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
                c.globalAlpha = 0.5; c.beginPath();
                for (k = 1; k < 10; k++) {
                    d = R * k * 0.125 / MAX;
                    c.moveTo(cx + d, cy - 4); c.lineTo(cx + d, cy + 4); c.moveTo(cx - d, cy - 4); c.lineTo(cx - d, cy + 4);
                    c.moveTo(cx - 4, cy + d); c.lineTo(cx + 4, cy + d); c.moveTo(cx - 4, cy - d); c.lineTo(cx + 4, cy - d);
                }
                c.stroke(); c.globalAlpha = 1;
                FX.spaced(c, A.felt ? 'BRAKE' : 'ACCEL', cx, cy - R + 24, 14, FX.MONO, DIM, 3, 'center');
                FX.spaced(c, A.felt ? 'ACCEL' : 'BRAKE', cx, cy + R - 14, 14, FX.MONO, DIM, 3, 'center');
                FX.text(c, A.felt ? 'R' : 'L', cx - R + 18, cy - 10, 16, FX.MONO, DIM, 'left');
                FX.text(c, A.felt ? 'L' : 'R', cx + R - 18, cy - 10, 16, FX.MONO, DIM, 'right');
                FX.spaced(c, 'PEAK.G', 480, 40, 16, FX.MONO, CY, 4);
                c.strokeStyle = CY; c.globalAlpha = 0.4; c.beginPath(); c.moveTo(560, 35.5); c.lineTo(784, 35.5); c.stroke(); c.globalAlpha = 1;
                for (i = 0; i < boxes.length; i++) {
                    b = boxes[i];
                    c.fillStyle = '#0d0a1c'; c.strokeStyle = b[4]; c.lineWidth = 1.5;
                    FX.chamfer(c, b[0], b[1], 148, 94, 14); c.fill(); c.globalAlpha = 0.6; c.stroke(); c.globalAlpha = 1;
                    FX.spaced(c, b[2], b[0] + 14, b[1] + 24, 13, FX.MONO, DIM, 2);
                }
                FX.spaced(c, 'THROTTLE', 480, 296, 14, FX.MONO, DIM, 3);
                FX.spaced(c, 'BRAKING', 480, 370, 14, FX.MONO, DIM, 3);
                thr.drawStatic(c); brk.drawStatic(c);
                ticker(c, 'SYS ■ G-VEC');
                FX.text(c, '> TRACE 1.5S   > 10HZ   > TAP CORE TO RESET', 20, 467, 13, FX.MONO, CY, 'left', 0.75);
                FX.brackets(c, CY);
            },
            draw: function (c, now) {
                var v = A.v, t = gm.trail, i, p, q, age, lat = A.num(v.gLat), lng = A.num(v.gLong), dot, b, decel;
                c.strokeStyle = CY; c.lineCap = 'round';
                for (i = 1; i < t.length; i++) {
                    p = t[i - 1]; q = t[i]; age = (now - q.t) / gm.trailMs;
                    c.globalAlpha = Math.max(0, 0.9 * (1 - age)); c.lineWidth = 2 + 3 * (1 - age);
                    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke();
                }
                c.globalAlpha = 1; c.lineCap = 'butt';
                dot = gm.pos(lat, lng);
                c.strokeStyle = MG; c.lineWidth = 7; c.globalAlpha = 0.25;
                c.beginPath(); c.arc(dot.x, dot.y, 15, 0, Math.PI * 2); c.stroke();
                c.globalAlpha = 1; c.lineWidth = 3; c.stroke();
                c.beginPath();
                c.moveTo(dot.x + 19, dot.y); c.lineTo(dot.x + 28, dot.y); c.moveTo(dot.x - 19, dot.y); c.lineTo(dot.x - 28, dot.y);
                c.moveTo(dot.x, dot.y + 19); c.lineTo(dot.x, dot.y + 28); c.moveTo(dot.x, dot.y - 19); c.lineTo(dot.x, dot.y - 28);
                c.stroke();
                c.fillStyle = '#fff'; c.beginPath(); c.arc(dot.x, dot.y, 4, 0, Math.PI * 2); c.fill();
                FX.text(c, Math.sqrt(lat * lat + lng * lng).toFixed(2) + 'G', dot.x + 18, dot.y - 26, 18, FX.MONO, MG, 'left');
                for (i = 0; i < boxes.length; i++) {
                    b = boxes[i];
                    FX.text(c, A.fmt(gm.peak[b[3]], 2), b[0] + 134, b[1] + 78, 48, FX.SANS, b[4], 'right');
                }
                decel = Math.max(0, -lng);
                FX.text(c, A.fmt(v.throttle, 0) + '%', 784, 296, 22, FX.SANS, YE, 'right');
                FX.text(c, decel.toFixed(2) + 'G', 784, 370, 22, FX.SANS, MG, 'right');
                thr.draw(c, A.num(v.throttle) / 100);
                brk.draw(c, decel / 1.2);
            },
            animating: function () { return gm.trail.length > 1; },
            tap: function (x, y) {
                var dx = x - cx, dy = y - cy;
                if (dx * dx + dy * dy > R * R) return false;
                gm.reset();
                return true;
            }
        };
    }

    // ================================================================== CYBER TRACK
    function track(A) {
        var N = 32, X0 = 18, W = 24, STEP = (784 - X0) / N, LO = 3000, HI = A.RPM.limit;
        function bar(c, i) {
            var h = 26 + 74 * Math.pow(i / (N - 1), 1.4), x = X0 + i * STEP;
            FX.poly(c, [[x + 6, 120 - h], [x + W, 120 - h], [x + W - 6, 120], [x, 120]]);
        }
        var lit = FX.layer(function (c) {
            for (var i = 0; i < N; i++) {
                c.fillStyle = rpmCol(LO + (i + 1) * (HI - LO) / N, A);
                FX.glow(c, c.fillStyle, 9); bar(c, i); c.fill();
            }
        });
        return {
            name: 'CYBER TRACK',
            drawStatic: function (c) {
                var i, k, x;
                FX.backdrop(c, BG, GRID);
                c.fillStyle = OFF; c.strokeStyle = OFFL; c.lineWidth = 1;
                for (i = 0; i < N; i++) { bar(c, i); c.fill(); c.stroke(); }
                for (k = 3; k <= 7; k++) {
                    x = X0 + (k * 1000 - LO) / (HI - LO) * (784 - X0);
                    FX.text(c, String(k), x, 140, 14, FX.MONO, k >= 7 ? MG : DIM, 'center');
                }
                FX.spaced(c, 'KM/H', 132, 334, 16, FX.MONO, CY, 6, 'center', 0.8);
                FX.spaced(c, 'RPM', 668, 334, 16, FX.MONO, MG, 6, 'center', 0.8);
                c.fillStyle = '#0d0a1c'; c.strokeStyle = CY; c.lineWidth = 1.5;
                FX.chamfer(c, 16, 398, 768, 64, 18); c.fill(); c.globalAlpha = 0.6; c.stroke(); c.globalAlpha = 1;
                FX.spaced(c, 'LAP', 36, 438, 18, FX.MONO, DIM, 3);
            },
            draw: function (c, now) {
                var v = A.v, s = A.sess, rpm = A.num(v.rpm), k = Math.floor(Math.max(0, Math.min(1, (rpm - LO) / (HI - LO))) * N), d = s.delta;
                if (k) FX.blit(c, lit, 0, 0, X0 + (k - 1) * STEP + W + 2, 136);   // not into the next bar
                FX.gtext(c, A.gearText(A.gear()), 400, 382, 280, rpm >= A.RPM.red ? MG : TXT, fringe());
                FX.gtext(c, A.fmt(v.speed, 0), 132, 300, FX.fit(c, A.fmt(v.speed, 0), 92, FX.SANS, 220), CY, fringe());
                FX.text(c, A.fmt(v.rpm, 0), 668, 300, FX.fit(c, A.fmt(v.rpm, 0), 76, FX.SANS, 230), FX.SANS, MG, 'center');
                FX.text(c, (s.laps + 1 < 10 ? '0' : '') + (s.laps + 1), 84, 438, 18, FX.MONO, DIM, 'left');
                var lt = s.lapStart ? A.fmtLap(now - s.lapStart, 1) : 'TAP AT LINE';
                FX.text(c, lt, 140, 446, FX.fit(c, lt, s.lapStart ? 46 : 30, FX.SANS, 180), FX.SANS, TXT, 'left');
                if (d !== null && d !== undefined) {
                    c.fillStyle = d <= 0 ? '#002b30' : '#2b0026'; c.strokeStyle = d <= 0 ? CY : MG; c.lineWidth = 1.5;
                    FX.chamfer(c, 330, 410, 120, 40, 10); c.fill(); c.stroke();
                    FX.text(c, A.fmtDelta(d), 390, 440, 28, FX.SANS, d <= 0 ? CY : MG, 'center');
                }
                FX.spaced(c, 'BEST ' + A.fmtLap(s.best, 2), 764, 438, 18, FX.MONO, YE, 2, 'right');
            },
            animating: function () { return FX.glitching() || !!A.sess.lapStart; },
            tap: function () { A.sess.lap(Date.now()); return true; },
            hold: function () { return A.sess.stop(Date.now()); }
        };
    }

    W.MeterSets = W.MeterSets || {};
    W.MeterSets.cyber = function (A) { return [drive(A), gforce(A), track(A)]; };
})(window);

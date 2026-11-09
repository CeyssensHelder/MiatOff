/* MiatOff Meters — canvas gauge widgets. ES5 only: the CMU runs an old Opera (Presto).
 *
 * Each widget has drawStatic(ctx) for the background canvas (drawn once per page switch)
 * and draw(ctx, ...) for the foreground canvas (redrawn every frame). No shadows or
 * gradients in the per-frame path: the i.MX6 has no fill rate to spare.
 */
(function (W) {
    'use strict';

    var TAU = Math.PI * 2;
    var HIST_LEN = 120;     // sparkline samples (2 per second = 1 minute)
    var C = {
        face: '#0b0b0e', ring: '#25252b', track: '#18181d',
        tickMinor: '#4c4c54', tickMajor: '#d2d2d8',
        text: '#ececf0', dim: '#85858e', faint: '#3a3a42',
        red: '#e0262f', amber: '#f2a422', green: '#36c46a', blue: '#3b8fe8', band: '#c9ccd2'
    };
    var FACE = 'Arial, Helvetica, "DejaVu Sans", sans-serif';

    function font(px, bold) { return (bold ? 'bold ' : '') + px + 'px ' + FACE; }
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function fmt(v, dec) {
        if (v === undefined || v === null || isNaN(v)) return '--';
        var s = v.toFixed(dec || 0);
        return s === '-0' ? '0' : s;
    }
    function text(ctx, s, x, y, px, color, align, bold) {
        ctx.font = font(px, bold);
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s, x, y);
    }
    // Quarter circles: arcTo left steps in the corners on the car.
    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
        ctx.lineTo(x + w, y + h - r); ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
        ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
        ctx.lineTo(x, y + r); ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
        ctx.closePath();
    }

    // ------------------------------------------------------------------ Dial
    // 270° sweep, value band on the inside of the ticks plus a needle that leaves the centre free.
    function Dial(o) {
        this.cx = o.cx; this.cy = o.cy; this.r = o.r;
        this.min = o.min; this.max = o.max;
        this.a0 = 0.75 * Math.PI; this.a1 = 2.25 * Math.PI;
        this.major = o.major; this.minor = o.minor; this.labelDiv = o.labelDiv || 1;
        this.red = o.red; this.band = o.band || 14; this.title = o.title || '';
        this.numPx = o.numPx || 24; this.tick = o.tick || 16;
        this.bandColor = o.bandColor || function () { return C.band; };
    }
    Dial.prototype.ang = function (v) {
        return this.a0 + (this.a1 - this.a0) * clamp((v - this.min) / (this.max - this.min), 0, 1);
    };
    Dial.prototype.drawStatic = function (ctx) {
        var cx = this.cx, cy = this.cy, r = this.r, v, a, maj, len, rt, rb;
        ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, TAU);
        ctx.fillStyle = C.face; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = C.ring; ctx.stroke();

        rb = r - 8 - this.band / 2;
        ctx.beginPath(); ctx.arc(cx, cy, rb, this.a0, this.a1);
        ctx.lineWidth = this.band; ctx.strokeStyle = C.track; ctx.stroke();

        if (this.red !== undefined) {
            ctx.beginPath(); ctx.arc(cx, cy, r - 2, this.ang(this.red), this.a1);
            ctx.lineWidth = 5; ctx.strokeStyle = C.red; ctx.stroke();
        }

        rt = r - this.band - 14;
        ctx.lineCap = 'butt';
        for (v = this.min; v <= this.max + 1e-9; v += this.minor) {
            maj = Math.abs(v / this.major - Math.round(v / this.major)) < 1e-6;
            a = this.ang(v); len = maj ? this.tick : this.tick / 2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * rt, cy + Math.sin(a) * rt);
            ctx.lineTo(cx + Math.cos(a) * (rt - len), cy + Math.sin(a) * (rt - len));
            ctx.lineWidth = maj ? 4 : 2;
            ctx.strokeStyle = (this.red !== undefined && v >= this.red) ? C.red : (maj ? C.tickMajor : C.tickMinor);
            ctx.stroke();
            if (maj) {
                text(ctx, String(Math.round(v / this.labelDiv)),
                    cx + Math.cos(a) * (rt - this.tick - this.numPx * 0.8), cy + Math.sin(a) * (rt - this.tick - this.numPx * 0.8), this.numPx,
                    (this.red !== undefined && v >= this.red) ? C.red : C.text, 'center', true);
            }
        }
        if (this.title) text(ctx, this.title, cx, cy + r * 0.86, 16, C.dim, 'center', true);
    };
    Dial.prototype.draw = function (ctx, v) {
        var cx = this.cx, cy = this.cy, r = this.r, a = this.ang(v);
        ctx.beginPath(); ctx.arc(cx, cy, r - 8 - this.band / 2, this.a0, a);
        ctx.lineWidth = this.band; ctx.lineCap = 'butt'; ctx.strokeStyle = this.bandColor(v); ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5);
        ctx.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
        ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.strokeStyle = C.red; ctx.stroke();
        ctx.lineCap = 'butt';
    };

    // ------------------------------------------------------------------ vertical segment bar
    function Bar(o) {
        this.x = o.x; this.y = o.y; this.w = o.w; this.h = o.h;
        this.min = o.min; this.max = o.max; this.dec = o.dec || 0;
        this.label = o.label; this.unit = o.unit || ''; this.segs = o.segs || 20;
        this.color = o.color || function () { return C.text; };
        this.showValue = o.showValue !== false;
        this.top = this.y + (this.showValue ? 72 : 30);
        this.bw = Math.min(this.w - 16, 40);
        this.bx = this.x + (this.w - this.bw) / 2;
        this.segH = (this.y + this.h - this.top) / this.segs;
    }
    Bar.prototype.seg = function (ctx, i) {
        ctx.fillRect(this.bx, this.y + this.h - (i + 1) * this.segH + 1, this.bw, this.segH - 3);
    };
    Bar.prototype.drawStatic = function (ctx) {
        var cx = this.x + this.w / 2, i;
        text(ctx, this.label, cx, this.y + 10, 13, C.dim, 'center', true);
        if (this.showValue) text(ctx, this.unit, cx, this.y + 58, 13, C.dim, 'center', false);
        ctx.fillStyle = C.track;
        for (i = 0; i < this.segs; i++) this.seg(ctx, i);
    };
    Bar.prototype.draw = function (ctx, v) {
        var col = this.color(v), i,
            lit = Math.round(clamp((v - this.min) / (this.max - this.min), 0, 1) * this.segs);
        if (this.showValue) text(ctx, fmt(v, this.dec), this.x + this.w / 2, this.y + 36, 28, col, 'center', true);
        ctx.fillStyle = col;
        for (i = 0; i < lit; i++) this.seg(ctx, i);
    };

    // ------------------------------------------------------------------ shift lights
    function ShiftLights(o) {
        this.cx = o.cx; this.y = o.y; this.n = o.n || 10; this.gap = o.gap || 30; this.r = o.r || 9;
        this.from = o.from; this.to = o.to; this.flash = o.flash;
    }
    ShiftLights.prototype.px = function (i) { return this.cx + (i - (this.n - 1) / 2) * this.gap; };
    ShiftLights.prototype.dot = function (ctx, i, col) {
        ctx.beginPath(); ctx.arc(this.px(i), this.y, this.r, 0, TAU);
        ctx.fillStyle = col; ctx.fill();
    };
    ShiftLights.prototype.drawStatic = function (ctx) {
        for (var i = 0; i < this.n; i++) this.dot(ctx, i, C.track);
    };
    ShiftLights.prototype.colorOf = function (i) {
        return i < this.n * 0.4 ? C.green : (i < this.n * 0.7 ? C.amber : C.red);
    };
    ShiftLights.prototype.draw = function (ctx, rpm, now) {
        var i, lit;
        if (rpm >= this.flash) {
            if (Math.floor(now / 90) % 2) return;
            for (i = 0; i < this.n; i++) this.dot(ctx, i, C.blue);
            return;
        }
        lit = Math.floor(clamp((rpm - this.from) / (this.to - this.from), 0, 1) * this.n);
        for (i = 0; i < lit; i++) this.dot(ctx, i, this.colorOf(i));
    };

    // ------------------------------------------------------------------ G-meter
    function GMeter(o) {
        this.cx = o.cx; this.cy = o.cy; this.r = o.r; this.max = o.max || 1.25;
        this.trail = []; this.trailMs = o.trailMs || 1500;
        // felt: the dot moves the way you are pushed (accelerating = back/down, left turn = right), like a ball in
        // a bowl. Otherwise it shows what the car does (accelerating = up, left turn = left).
        this.felt = o.felt !== false;
        this.reset();
    }
    GMeter.prototype.reset = function () { this.peak = { l: 0, r: 0, acc: 0, brk: 0 }; this.trail = []; };
    GMeter.prototype.pos = function (lat, lng) {
        var k = this.felt ? -1 : 1, x = k * lat / this.max, y = -k * lng / this.max, d = Math.sqrt(x * x + y * y);
        if (d > 1) { x /= d; y /= d; }
        return { x: this.cx + x * this.r, y: this.cy + y * this.r };
    };
    GMeter.prototype.drawStatic = function (ctx) {
        var cx = this.cx, cy = this.cy, r = this.r, g, rr;
        ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, TAU);
        ctx.fillStyle = C.face; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = C.ring; ctx.stroke();
        for (g = 0.25; g <= this.max + 1e-9; g += 0.25) {
            rr = r * g / this.max;
            ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = (Math.abs(g * 2 - Math.round(g * 2)) < 1e-6) ? '#45454e' : '#24242a';
            ctx.stroke();
            if (Math.abs(g * 2 - Math.round(g * 2)) < 1e-6) {
                text(ctx, g.toFixed(1), cx + rr * 0.707 + 4, cy - rr * 0.707 - 6, 16, C.dim, 'left', false);
            }
        }
        ctx.beginPath();
        ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
        ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
        ctx.lineWidth = 1; ctx.strokeStyle = '#2c2c33'; ctx.stroke();
        // Edge labels name the manoeuvre that puts the dot there.
        text(ctx, this.felt ? 'BRAKE' : 'ACCEL', cx, cy - r + 22, 17, C.dim, 'center', true);
        text(ctx, this.felt ? 'ACCEL' : 'BRAKE', cx, cy + r - 22, 17, C.dim, 'center', true);
        text(ctx, this.felt ? 'RIGHT' : 'LEFT', cx - r + 14, cy - 30, 15, C.dim, 'left', true);
        text(ctx, 'turn', cx - r + 14, cy - 13, 13, C.dim, 'left', false);
        text(ctx, this.felt ? 'LEFT' : 'RIGHT', cx + r - 14, cy - 30, 15, C.dim, 'right', true);
        text(ctx, 'turn', cx + r - 14, cy - 13, 13, C.dim, 'right', false);
    };
    GMeter.prototype.push = function (lat, lng, now) {
        var p = this.pos(lat, lng), pk = this.peak;
        p.t = now;
        this.trail.push(p);
        while (this.trail.length && now - this.trail[0].t > this.trailMs) this.trail.shift();
        if (-lat > pk.l) pk.l = -lat;
        if (lat > pk.r) pk.r = lat;
        if (lng > pk.acc) pk.acc = lng;
        if (-lng > pk.brk) pk.brk = -lng;
    };
    GMeter.prototype.draw = function (ctx, lat, lng, now) {
        var i, p, age;
        ctx.fillStyle = C.red;
        for (i = 0; i < this.trail.length; i++) {
            p = this.trail[i];
            age = (now - p.t) / this.trailMs;
            ctx.globalAlpha = clamp(0.5 * (1 - age), 0, 1);
            ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
        p = this.pos(lat, lng);
        ctx.beginPath(); ctx.arc(p.x, p.y, 17, 0, TAU);
        ctx.fillStyle = C.red; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = C.text; ctx.stroke();
    };
    GMeter.prototype.hit = function (x, y) {
        var dx = x - this.cx, dy = y - this.cy;
        return dx * dx + dy * dy <= this.r * this.r;
    };

    // ------------------------------------------------------------------ steering wheel
    function Wheel(o) { this.cx = o.cx; this.cy = o.cy; this.r = o.r; }
    Wheel.prototype.draw = function (ctx, deg) {
        var r = this.r;
        ctx.save();
        ctx.translate(this.cx, this.cy);
        ctx.rotate(deg * Math.PI / 180);
        ctx.lineWidth = 11; ctx.strokeStyle = C.tickMajor;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
        ctx.lineWidth = 9; ctx.strokeStyle = C.dim;
        ctx.beginPath();
        ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
        ctx.moveTo(0, 0); ctx.lineTo(0, r);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, TAU);
        ctx.fillStyle = '#2a2a31'; ctx.fill();
        ctx.lineWidth = 6; ctx.strokeStyle = C.red;
        ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2 - 0.12, -Math.PI / 2 + 0.12); ctx.stroke();
        ctx.restore();
    };

    // ------------------------------------------------------------------ centred horizontal bar
    function CBar(o) {
        this.x = o.x; this.y = o.y; this.w = o.w; this.h = o.h || 14;
        this.max = o.max; this.label = o.label; this.dec = o.dec || 0;
        this.color = o.color || C.amber;
    }
    CBar.prototype.drawStatic = function (ctx) {
        text(ctx, this.label, this.x, this.y - 14, 12, C.dim, 'left', true);
        ctx.fillStyle = C.track; ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.fillStyle = C.faint; ctx.fillRect(this.x + this.w / 2 - 1, this.y - 4, 2, this.h + 8);
    };
    CBar.prototype.draw = function (ctx, v) {
        var mid = this.x + this.w / 2, len = clamp(v / this.max, -1, 1) * this.w / 2;
        ctx.fillStyle = this.color;
        if (len >= 0) ctx.fillRect(mid, this.y, len, this.h);
        else ctx.fillRect(mid + len, this.y, -len, this.h);
        text(ctx, fmt(v, this.dec), this.x + this.w, this.y - 14, 15, C.text, 'right', true);
    };

    // ------------------------------------------------------------------ horizontal bar
    function HBar(o) {
        this.x = o.x; this.y = o.y; this.w = o.w; this.h = o.h || 30;
        this.min = o.min || 0; this.max = o.max; this.label = o.label; this.color = o.color || C.text;
    }
    HBar.prototype.drawStatic = function (ctx) {
        text(ctx, this.label, this.x, this.y - 18, 20, C.dim, 'left', true);
        ctx.fillStyle = C.track; ctx.fillRect(this.x, this.y, this.w, this.h);
    };
    HBar.prototype.draw = function (ctx, v) {
        var f = clamp((v - this.min) / (this.max - this.min), 0, 1);
        if (v === undefined || isNaN(v)) f = 0;
        ctx.fillStyle = this.color; ctx.fillRect(this.x, this.y, this.w * f, this.h);
    };

    // ------------------------------------------------------------------ number tile with sparkline
    function Tile(o) {
        this.x = o.x; this.y = o.y; this.w = o.w; this.h = o.h;
        this.label = o.label; this.unit = o.unit || ''; this.dec = o.dec || 0;
        this.color = o.color || function () { return C.text; };
        this.span = o.span || 1;    // smallest range the sparkline stretches to, so sensor noise stays flat
        this.format = o.format || null;  // optional value -> text, e.g. lap times
    }
    Tile.prototype.drawStatic = function (ctx) {
        roundRect(ctx, this.x, this.y, this.w, this.h, 10);
        ctx.fillStyle = C.face; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = C.ring; ctx.stroke();
        text(ctx, this.label, this.x + 18, this.y + 28, 20, C.dim, 'left', true);
    };
    Tile.prototype.draw = function (ctx, v, hist) {
        var col = this.color(v), s = this.format ? this.format(v) : fmt(v, this.dec), x = this.x + 18, y = this.y + 100, i, lo, hi, n, sx, sy, sw, sh;
        text(ctx, s, x, y, 72, col, 'left', true);
        ctx.font = font(72, true);
        text(ctx, this.unit, x + ctx.measureText(s).width + 8, y + 14, 24, C.dim, 'left', false);
        if (!hist || hist.length < 2) return;
        lo = hi = (v === undefined || isNaN(v)) ? hist[0] : v;
        for (i = 0; i < hist.length; i++) { if (hist[i] < lo) lo = hist[i]; if (hist[i] > hi) hi = hist[i]; }

        if (hi - lo < this.span) { i = (this.span - (hi - lo)) / 2; lo -= i; hi += i; }
        sx = this.x + 18; sw = this.w - 36; sh = 34; sy = this.y + this.h - 16 - sh;
        n = hist.length;
        ctx.beginPath();
        for (i = 0; i < n; i++) {
            var px = sx + sw * (i + HIST_LEN - n) / (HIST_LEN - 1), py = sy + sh - (hist[i] - lo) / (hi - lo) * sh;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1;
    };

    W.MeterGauges = {
        C: C, font: font, fmt: fmt, text: text, clamp: clamp, roundRect: roundRect,
        Dial: Dial, Bar: Bar, HBar: HBar, ShiftLights: ShiftLights, GMeter: GMeter, Wheel: Wheel, CBar: CBar, Tile: Tile,
        HIST_LEN: HIST_LEN
    };
})(window);

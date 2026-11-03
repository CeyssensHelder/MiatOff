/* MiatOff Meters — shared drawing helpers for the cyberpunk page sets (cyber.js, y2077.js). ES5 only.
 *
 * Glow is expensive on the i.MX6, so anything that glows is drawn once into an offscreen "lit layer" and the
 * frame loop only copies (part of) it. Text in the frame loop never uses shadowBlur.
 */
(function (W, doc) {
    'use strict';

    var FX = {};

    // Bundled fonts (fonts/*.ttf, see index.html) first; the rest are PC fallbacks for the preview.
    FX.SANS = "'MO Chakra', Bahnschrift, Arial, sans-serif";
    FX.COND = "'MO Chakra', 'Agency FB', Bahnschrift, Arial, sans-serif";
    FX.MONO = "'MO Mono', Consolas, 'Courier New', monospace";

    FX.font = function (px, fam, weight) { return (weight || 'bold') + ' ' + px + 'px ' + fam; };

    // Text with its baseline at y, like the SVG designs.
    FX.text = function (ctx, s, x, y, px, fam, color, align, alpha) {
        ctx.font = FX.font(px, fam);
        ctx.fillStyle = color;
        ctx.textAlign = align || 'left';
        ctx.textBaseline = 'alphabetic';
        if (alpha !== undefined) ctx.globalAlpha = alpha;
        ctx.fillText(s, x, y);
        if (alpha !== undefined) ctx.globalAlpha = 1;
    };

    // Letter-spaced text (canvas has no letter-spacing): draws one character at a time.
    FX.spaced = function (ctx, s, x, y, px, fam, color, spacing, align, alpha) {
        var i, w = 0, widths = [];
        ctx.font = FX.font(px, fam);
        for (i = 0; i < s.length; i++) { widths.push(ctx.measureText(s.charAt(i)).width); w += widths[i] + spacing; }
        w -= spacing;
        if (align === 'center') x -= w / 2; else if (align === 'right') x -= w;
        ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        if (alpha !== undefined) ctx.globalAlpha = alpha;
        for (i = 0; i < s.length; i++) { ctx.fillText(s.charAt(i), x, y); x += widths[i] + spacing; }
        if (alpha !== undefined) ctx.globalAlpha = 1;
        return x - spacing;   // where the text ends
    };

    // Largest size up to px at which s fits in maxW (the bundled font is wider than most fallbacks).
    FX.fit = function (ctx, s, px, fam, maxW) {
        ctx.font = FX.font(px, fam);
        var w = ctx.measureText(s).width;
        return w > maxW ? Math.floor(px * maxW / w) : px;
    };

    FX.poly = function (ctx, pts) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
    };

    // Rectangle with the top-left and bottom-right corners cut off.
    FX.chamfer = function (ctx, x, y, w, h, c) {
        FX.poly(ctx, [[x + c, y], [x + w, y], [x + w, y + h - c], [x + w - c, y + h], [x, y + h], [x, y + c]]);
    };

    // Ring segment between radii r0 and r1, angles in degrees (0 = right, clockwise).
    FX.sector = function (ctx, cx, cy, r0, r1, a0, a1) {
        a0 = a0 * Math.PI / 180; a1 = a1 * Math.PI / 180;
        ctx.beginPath();
        ctx.arc(cx, cy, r1, a0, a1, false);
        ctx.arc(cx, cy, r0, a1, a0, true);
        ctx.closePath();
    };

    // Parallelogram leaning right by `skew` px.
    FX.skew = function (ctx, x, y, w, h, skew) {
        FX.poly(ctx, [[x + skew, y], [x + skew + w, y], [x + w, y + h], [x, y + h]]);
    };

    FX.layer = function (draw) {
        var c = doc.createElement('canvas');
        c.width = 800; c.height = 480;
        draw(c.getContext('2d'));
        return c;
    };

    FX.glow = function (ctx, color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; };
    FX.noGlow = function (ctx) { ctx.shadowBlur = 0; ctx.shadowColor = 'rgba(0,0,0,0)'; };

    // Copy a rectangle of a lit layer onto the screen.
    FX.blit = function (ctx, layer, x, y, w, h) {
        if (w <= 0 || h <= 0) return;
        ctx.drawImage(layer, x, y, w, h, x, y, w, h);
    };

    // Background shared by both styles: flat colour, 40 px grid, scanlines and a vignette (static canvas only).
    FX.backdrop = function (ctx, bg, grid) {
        var x, y, g;
        ctx.fillStyle = bg; ctx.fillRect(0, 0, 800, 480);
        ctx.strokeStyle = grid; ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
        ctx.beginPath();
        for (x = 0.5; x < 800; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, 480); }
        for (y = 0.5; y < 480; y += 40) { ctx.moveTo(0, y); ctx.lineTo(800, y); }
        ctx.stroke();
        ctx.globalAlpha = 0.04; ctx.fillStyle = '#fff';
        for (y = 0; y < 480; y += 4) ctx.fillRect(0, y, 800, 1);
        ctx.globalAlpha = 1;
        g = ctx.createRadialGradient(400, 240, 200, 400, 240, 520);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.7)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 800, 480);
    };

    // Diagonal hazard stripes in a rectangle.
    FX.hazard = function (ctx, x, y, w, h, stripe, bg) {
        var i;
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = stripe;
        for (i = -h; i < w + h; i += 14) {
            FX.poly(ctx, [[x + i, y + h], [x + i + 7, y + h], [x + i + 7 + h, y], [x + i + h, y]]);
            ctx.fill();
        }
        ctx.restore();
    };

    // Corner brackets around the screen.
    FX.brackets = function (ctx, color) {
        var L = 26, m = 8;
        ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(m, m + L); ctx.lineTo(m, m); ctx.lineTo(m + L, m);
        ctx.moveTo(800 - m - L, m); ctx.lineTo(800 - m, m); ctx.lineTo(800 - m, m + L);
        ctx.moveTo(m, 480 - m - L); ctx.lineTo(m, 480 - m); ctx.lineTo(m + L, 480 - m);
        ctx.moveTo(800 - m - L, 480 - m); ctx.lineTo(800 - m, 480 - m); ctx.lineTo(800 - m, 480 - m - L);
        ctx.stroke();
        ctx.globalAlpha = 1;
    };

    // ------------------------------------------------------------------ glitch
    // Short bursts at random every 3-8 s, and on demand (gear change). During a burst the colour fringes
    // spread and a few horizontal slices of every glitch text jump sideways.
    var GL = FX.glitchState = { until: 0, next: Date.now() + 3000, slices: [], on: false };

    function burst(now, ms) {
        var n = 1 + Math.floor(Math.random() * 3), i, top;
        GL.slices = [];
        for (i = 0; i < n; i++) {
            top = 0.12 + Math.random() * 0.7;
            GL.slices.push([top, top + 0.04 + Math.random() * 0.07, (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 12)]);
        }
        GL.until = now + ms;
    }
    FX.kick = function (now, ms) { burst(now, ms || 220); };

    // Called every frame; returns true when a burst starts or ends (the page must be redrawn).
    FX.updateGlitch = function (now) {
        var was = GL.on;
        if (now >= GL.next) { burst(now, 120 + Math.random() * 100); GL.next = now + 3000 + Math.random() * 5000; }
        GL.on = now < GL.until;
        return GL.on !== was;
    };
    FX.glitching = function () { return GL.on; };

    // Text with red/cyan (or magenta/cyan) fringes; slices only while a glitch burst is on.
    // o: { left, right, shift, bg, align, fam }
    FX.gtext = function (ctx, s, x, y, px, color, o) {
        var fam = o.fam || FX.SANS, align = o.align || 'center', sh = (o.shift || 3) * (GL.on ? 2.5 : 1), i, w, x0, sl, y0, h;
        ctx.font = FX.font(px, fam);
        ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
        ctx.globalAlpha = o.alpha || 0.7;
        ctx.fillStyle = o.left; ctx.fillText(s, x - sh, y);
        ctx.fillStyle = o.right; ctx.fillText(s, x + sh, y);
        ctx.globalAlpha = 1;
        ctx.fillStyle = color; ctx.fillText(s, x, y);
        if (!GL.on) return;
        w = ctx.measureText(s).width + 24;
        x0 = align === 'center' ? x - w / 2 : (align === 'right' ? x - w : x - 12);
        for (i = 0; i < GL.slices.length; i++) {
            sl = GL.slices[i];
            y0 = y - px * 0.72 * (1 - sl[0]); h = px * 0.72 * (sl[1] - sl[0]);
            ctx.save();
            ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
            ctx.fillStyle = o.bg; ctx.fillRect(x0, y0, w, h);
            ctx.fillStyle = color; ctx.fillText(s, x + sl[2], y);
            ctx.restore();
        }
    };

    W.MeterFX = FX;
})(window, document);

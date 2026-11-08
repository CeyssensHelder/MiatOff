"""Cyberpunk gauge mockups for MiatOff Meters (800x480 SVGs).

make_mockups.py <design-dir>: writes <design-dir>/cyberpunk/*.svg (neon) and <design-dir>/cyberpunk2077/*.svg (yellow).
"""
import math, os, sys

ROOT = sys.argv[1]

BG, GRID, DIM, TXT = '#07060d', '#24154a', '#8b7bb5', '#eafcff'
CY, MG, YE = '#00f0ff', '#ff2bd6', '#fcee0a'
OFF_FILL, OFF_LINE = '#140d26', '#2e2052'
SANS = "Bahnschrift, 'Segoe UI', sans-serif"
MONO = "Consolas, 'Courier New', monospace"

_id = [0]
def uid(p):
    _id[0] += 1
    return '%s%d' % (p, _id[0])

def head(bg=None, grid=None):
    bg, grid = bg or BG, grid or GRID
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480">
<defs>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="glowBig" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#ffffff" opacity="0.04"/></pattern>
  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="{grid}" stroke-width="1" opacity="0.45"/></pattern>
  <pattern id="haz" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="14" fill="#fcee0a"/></pattern>
  <pattern id="hazk" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="12" fill="#0b0b0c"/></pattern>
  <radialGradient id="vign" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.75"/></radialGradient>
</defs>
<rect width="800" height="480" fill="{bg}"/>
<rect width="800" height="480" fill="url(#grid)"/>
'''

def tail():
    return '<rect width="800" height="480" fill="url(#scan)"/>\n<rect width="800" height="480" fill="url(#vign)"/>\n</svg>\n'

def t(x, y, s, size, fill, anchor='start', fam=SANS, weight=400, ls=0, extra=''):
    return (f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
            f'text-anchor="{anchor}" letter-spacing="{ls}" {extra}>{s}</text>\n')

def glitch(x, y, s, size, fill, anchor='middle', slices=((0.62, 0.70, 9), (0.28, 0.33, -7)), left=None, right=None,
           bg=None, op=0.75, shift=4, glow=True, fam=SANS, cw=0.6):
    """Chromatic aberration (magenta left, cyan right) plus horizontal slices shifted sideways."""
    o = t(x - shift, y, s, size, left or MG, anchor, fam, 700, extra=f'opacity="{op}"')
    o += t(x + shift, y, s, size, right or CY, anchor, fam, 700, extra=f'opacity="{op}"')
    o += t(x, y, s, size, fill, anchor, fam, 700, extra='filter="url(#glow)"' if glow else '')
    # The slices only cover the text itself, not the whole screen width.
    tw = size * cw * len(s) + 24
    tx = x - tw / 2 if anchor == 'middle' else (x - tw if anchor == 'end' else x - 12)
    for top, bot, dx in slices:
        cid = uid('cl')
        y0 = y - size * 0.72 * (1 - top)
        h = size * 0.72 * (bot - top)
        o += f'<clipPath id="{cid}"><rect x="{tx:.1f}" y="{y0:.1f}" width="{tw:.1f}" height="{h:.1f}"/></clipPath>\n'
        o += f'<g clip-path="url(#{cid})"><rect x="{tx:.1f}" y="{y0:.1f}" width="{tw:.1f}" height="{h:.1f}" fill="{bg or BG}"/>'
        o += t(x + dx, y, s, size, fill, anchor, fam, 700).strip() + '</g>\n'
    return o

def chamfer(x, y, w, h, c=16, fill='#0d0a1c', stroke=CY, sw=1.5, op=0.7):
    pts = [(x + c, y), (x + w, y), (x + w, y + h - c), (x + w - c, y + h), (x, y + h), (x, y + c)]
    p = ' '.join('%.1f,%.1f' % q for q in pts)
    return f'<polygon points="{p}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-opacity="{op}"/>\n'

def sector(cx, cy, r0, r1, a0, a1):
    a0, a1 = math.radians(a0), math.radians(a1)
    p = [(cx + r1 * math.cos(a0), cy + r1 * math.sin(a0)), (cx + r1 * math.cos(a1), cy + r1 * math.sin(a1)),
         (cx + r0 * math.cos(a1), cy + r0 * math.sin(a1)), (cx + r0 * math.cos(a0), cy + r0 * math.sin(a0))]
    return (f'M{p[0][0]:.1f},{p[0][1]:.1f} A{r1},{r1} 0 0 1 {p[1][0]:.1f},{p[1][1]:.1f} '
            f'L{p[2][0]:.1f},{p[2][1]:.1f} A{r0},{r0} 0 0 0 {p[3][0]:.1f},{p[3][1]:.1f}Z')

def skewbar(x, y, n, step, w, h, lit, colors, skew=4):
    """Row of parallelogram segments; colors(i) gives the lit colour."""
    on, off = '', ''
    for i in range(n):
        xi = x + i * step
        pts = '%.1f,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f' % (xi + skew, y, xi + skew + w, y, xi + w, y + h, xi, y + h)
        if i < lit:
            on += f'<polygon points="{pts}" fill="{colors(i)}"/>'
        else:
            off += f'<polygon points="{pts}" fill="{OFF_FILL}" stroke="{OFF_LINE}" stroke-width="1"/>'
    return off + '\n' + f'<g filter="url(#glow)">{on}</g>\n'

def brackets(col=CY, L=26, m=8):
    o = f'<g stroke="{col}" stroke-width="2.5" fill="none" opacity="0.8">'
    for (x, y, dx, dy) in [(m, m, 1, 1), (800 - m, m, -1, 1), (m, 480 - m, 1, -1), (800 - m, 480 - m, -1, -1)]:
        o += f'<path d="M{x},{y + dy * L} L{x},{y} L{x + dx * L},{y}"/>'
    return o + '</g>\n'

def rpm_col(r):
    return YE if r >= 7000 else (MG if r >= 6500 else CY)

# ====================================================================== 1: NEON DRIVE
def neon_drive():
    rpm, speed, gear = 6300, 128, 4
    cx, cy, r0, r1 = 290, 286, 172, 208
    A0, SPAN = 150, 240
    o = head()
    # header
    o += f'<path d="M16,34 H300 L312,22 H784" stroke="{CY}" stroke-width="1.5" fill="none" opacity="0.6"/>\n'
    o += t(20, 24, 'MIATOFF//OS', 14, MG, fam=MONO, weight=700, ls=2)
    o += t(784, 16, 'NODE MX-5 ND &#9656; LINK OK', 12, CY, 'end', MONO, ls=1, extra='opacity="0.8"')
    # segmented tach
    N, gap = 48, 1.3
    step = SPAN / N
    off, on = '', ''
    for i in range(N):
        a0 = A0 + i * step + gap / 2
        a1 = A0 + (i + 1) * step - gap / 2
        mid = (i + 0.5) * 8000 / N
        d = sector(cx, cy, r0, r1, a0, a1)
        if (i + 1) * 8000 / N <= rpm:
            on += f'<path d="{d}" fill="{rpm_col(mid)}"/>'
        else:
            col = '#2a0f2a' if mid >= 7000 else OFF_FILL
            off += f'<path d="{d}" fill="{col}" stroke="{OFF_LINE}" stroke-width="1"/>'
    o += off + '\n' + f'<g filter="url(#glow)">{on}</g>\n'
    # inner ring + ticks
    o += f'<circle cx="{cx}" cy="{cy}" r="160" fill="none" stroke="{CY}" stroke-opacity="0.35" stroke-width="1.5" stroke-dasharray="2 6"/>\n'
    for k in range(9):
        a = math.radians(A0 + SPAN * k / 8)
        col = YE if k >= 7 else (CY if k < 6 else MG)
        o += t(round(cx + 236 * math.cos(a), 1), round(cy + 236 * math.sin(a) + 7, 1), str(k), 20, col, 'middle', MONO, 700,
               extra='opacity="0.85"')
    # current-rpm marker
    a = math.radians(A0 + SPAN * rpm / 8000)
    o += (f'<line x1="{cx + 150 * math.cos(a):.1f}" y1="{cy + 150 * math.sin(a):.1f}" x2="{cx + 218 * math.cos(a):.1f}" '
          f'y2="{cy + 218 * math.sin(a):.1f}" stroke="#fff" stroke-width="3" filter="url(#glow)"/>\n')
    # centre
    o += t(cx, 196, f'RPM {rpm}', 16, MG, 'middle', MONO, 700, ls=3)
    o += glitch(cx, 318, str(speed), 132, TXT)
    o += t(cx, 352, 'KM/H', 18, CY, 'middle', MONO, 700, ls=8)
    o += t(cx, 430, 'x1000 R/MIN', 12, DIM, 'middle', MONO, ls=3)
    # gear panel
    o += chamfer(540, 52, 244, 196, 20)
    o += t(558, 78, 'GEAR', 14, CY, fam=MONO, weight=700, ls=4)
    o += t(766, 78, '&#9632;&#9632;&#9633;', 12, MG, 'end', MONO)
    o += glitch(662, 222, str(gear), 176, YE, slices=((0.45, 0.52, 10),))
    # data rows
    o += t(552, 290, 'COOLANT', 15, DIM, fam=MONO, weight=700, ls=3)
    o += t(784, 296, '89&#176;C', 40, CY, 'end', SANS, 700, extra='filter="url(#glow)"')
    o += skewbar(552, 306, 19, 12, 9, 14, 13, lambda i: CY)
    o += t(552, 370, 'FUEL', 15, DIM, fam=MONO, weight=700, ls=3)
    o += t(784, 376, '71%', 40, MG, 'end', SANS, 700, extra='filter="url(#glow)"')
    o += skewbar(552, 386, 19, 12, 9, 14, 13, lambda i: MG)
    # ticker
    o += f'<line x1="16" y1="446" x2="784" y2="446" stroke="{CY}" stroke-opacity="0.3"/>\n'
    o += t(20, 467, '&gt; THR 92%   &gt; IAT 34&#176;C   &gt; OUT 17.5&#176;C   &gt; TRIP 128 KM', 13, CY, fam=MONO,
           extra='opacity="0.75"')
    o += t(780, 467, '&#9698;&#9700; 0x7F3A', 13, MG, 'end', MONO)
    o += brackets()
    return o + tail()

# ====================================================================== 2: NEON G
def neon_g():
    cx, cy, R, MAX = 236, 240, 192, 1.25
    o = head()
    o += t(20, 26, 'G-FORCE // VECTOR', 14, MG, fam=MONO, weight=700, ls=2)

    def octa(r):
        pts = []
        for k in range(8):
            a = math.radians(22.5 + 45 * k)
            pts.append('%.1f,%.1f' % (cx + r * math.cos(a), cy + r * math.sin(a)))
        return ' '.join(pts)
    o += f'<polygon points="{octa(R)}" fill="#0a0818" stroke="{CY}" stroke-width="2" filter="url(#glow)"/>\n'
    for g in (0.25, 0.5, 0.75, 1.0):
        r = R * g / MAX
        major = g in (0.5, 1.0)
        o += (f'<polygon points="{octa(r)}" fill="none" stroke="{CY if major else "#3a2a66"}" '
              f'stroke-opacity="{0.55 if major else 1}" stroke-width="1.5" {"" if major else "stroke-dasharray=\'4 5\'"}/>\n')
        if major:
            o += t(cx + r * 0.38 + 4, cy - r * 0.92 + 16, f'{g:.1f}G', 13, CY, fam=MONO, extra='opacity="0.8"')
    o += f'<g stroke="{CY}" stroke-opacity="0.3"><line x1="{cx - R}" y1="{cy}" x2="{cx + R}" y2="{cy}"/><line x1="{cx}" y1="{cy - R}" x2="{cx}" y2="{cy + R}"/></g>\n'
    for k in range(1, 10):
        d = R * k * 0.125 / MAX
        for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            px, py = cx + sx * d, cy + sy * d
            if sx:
                o += f'<line x1="{px:.1f}" y1="{cy - 4}" x2="{px:.1f}" y2="{cy + 4}" stroke="{CY}" stroke-opacity="0.5"/>'
            else:
                o += f'<line x1="{cx - 4}" y1="{py:.1f}" x2="{cx + 4}" y2="{py:.1f}" stroke="{CY}" stroke-opacity="0.5"/>'
    o += '\n'
    o += t(cx, cy - R + 24, 'BRAKE', 14, DIM, 'middle', MONO, 700, ls=3)
    o += t(cx, cy + R - 14, 'ACCEL', 14, DIM, 'middle', MONO, 700, ls=3)
    o += t(cx - R + 18, cy - 10, 'R', 16, DIM, 'start', MONO, 700)
    o += t(cx + R - 18, cy - 10, 'L', 16, DIM, 'end', MONO, 700)
    # trail: left turn while braking (felt: dot goes right and up)
    trail = [(236, 240), (244, 220), (262, 194), (292, 178), (326, 174), (352, 182), (362, 190)]
    for i in range(1, len(trail)):
        (x0, y0), (x1, y1) = trail[i - 1], trail[i]
        op = 0.15 + 0.85 * i / (len(trail) - 1)
        o += f'<line x1="{x0}" y1="{y0}" x2="{x1}" y2="{y1}" stroke="{CY}" stroke-width="{2 + 3 * i / len(trail):.1f}" stroke-opacity="{op:.2f}" stroke-linecap="round" filter="url(#glow)"/>\n'
    dx, dy = trail[-1]
    o += f'<g filter="url(#glow)" stroke="{MG}" fill="none" stroke-width="3"><circle cx="{dx}" cy="{dy}" r="15"/>'
    for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        o += f'<line x1="{dx + sx * 19}" y1="{dy + sy * 19}" x2="{dx + sx * 28}" y2="{dy + sy * 28}"/>'
    o += f'</g><circle cx="{dx}" cy="{dy}" r="4" fill="#fff"/>\n'
    o += t(dx + 18, dy - 26, '0.89G', 18, MG, fam=MONO, weight=700, extra='filter="url(#glow)"')
    # right panel
    o += t(480, 40, 'PEAK.G', 16, CY, fam=MONO, weight=700, ls=4)
    o += f'<line x1="560" y1="35" x2="784" y2="35" stroke="{CY}" stroke-opacity="0.4"/>\n'
    boxes = [(480, 54, 'L-TURN', '0.94', CY), (636, 54, 'R-TURN', '0.88', CY),
             (480, 160, 'ACCEL', '0.41', YE), (636, 160, 'BRAKE', '1.02', MG)]
    for x, y, lab, val, col in boxes:
        o += chamfer(x, y, 148, 94, 14, stroke=col, op=0.6)
        o += t(x + 14, y + 24, lab, 13, DIM, fam=MONO, weight=700, ls=2)
        o += t(x + 134, y + 78, val, 48, col, 'end', SANS, 700, extra='filter="url(#glow)"')
    o += t(480, 296, 'THROTTLE', 14, DIM, fam=MONO, weight=700, ls=3)
    o += t(784, 296, '92%', 22, YE, 'end', SANS, 700)
    o += skewbar(480, 306, 24, 12.6, 9, 26, 22, lambda i: YE, skew=5)
    o += t(480, 370, 'BRAKING', 14, DIM, fam=MONO, weight=700, ls=3)
    o += t(784, 370, '0.35G', 22, MG, 'end', SANS, 700)
    o += skewbar(480, 380, 24, 12.6, 9, 26, 7, lambda i: MG, skew=5)
    o += f'<line x1="16" y1="446" x2="784" y2="446" stroke="{CY}" stroke-opacity="0.3"/>\n'
    o += t(20, 467, '&gt; TRACE 1.5S   &gt; 10HZ   &gt; TAP CORE TO RESET', 13, CY, fam=MONO, extra='opacity="0.75"')
    o += t(780, 467, 'SYS &#9632; G-VEC', 13, MG, 'end', MONO)
    o += brackets()
    return o + tail()

# ====================================================================== 3: NEON TRACK
def neon_track():
    rpm = 7050
    o = head()
    # edge glow: the rev ring in the red zone
    o += f'<rect x="3" y="3" width="794" height="474" fill="none" stroke="{MG}" stroke-width="6" filter="url(#glowBig)"/>\n'
    # equaliser shift bar
    N, x0, w = 32, 18, 24
    step = (784 - x0) / N
    off, on = '', ''
    for i in range(N):
        r_hi = 3000 + (i + 1) * 4500 / N
        h = 26 + 74 * (i / (N - 1)) ** 1.4
        x = x0 + i * step
        pts = '%.1f,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f' % (x + 6, 120 - h, x + 6 + w - 6, 120 - h, x + w - 6, 120, x, 120)
        if r_hi <= rpm:
            on += f'<polygon points="{pts}" fill="{rpm_col(r_hi)}"/>'
        else:
            off += f'<polygon points="{pts}" fill="{OFF_FILL}" stroke="{OFF_LINE}"/>'
    o += off + '\n' + f'<g filter="url(#glow)">{on}</g>\n'
    for k in range(3, 8):
        x = x0 + (k * 1000 - 3000) / 4500 * (784 - x0)
        o += t(round(x, 1), 140, str(k), 14, MG if k >= 7 else DIM, 'middle', MONO, 700)
    # giant gear
    o += glitch(400, 382, '3', 280, TXT, slices=((0.58, 0.66, 14), (0.22, 0.27, -10), (0.83, 0.86, 6)))
    # speed / rpm
    o += glitch(132, 300, '131', 92, CY, slices=((0.5, 0.56, 6),))
    o += t(132, 334, 'KM/H', 16, CY, 'middle', MONO, 700, ls=6, extra='opacity="0.8"')
    o += t(668, 300, '7050', 76, MG, 'middle', SANS, 700, extra='filter="url(#glow)"')
    o += t(668, 334, 'RPM', 16, MG, 'middle', MONO, 700, ls=6, extra='opacity="0.8"')
    # lap strip
    o += chamfer(16, 398, 768, 64, 18, fill='#0d0a1c', stroke=CY, op=0.6)
    o += t(36, 438, 'LAP 07', 18, DIM, fam=MONO, weight=700, ls=3)
    o += t(140, 446, '1:23.4', 46, TXT, fam=SANS, weight=700, extra='filter="url(#glow)"')
    o += chamfer(330, 410, 120, 40, 10, fill='#002b30', stroke=CY, op=1)
    o += t(390, 440, '-0.42', 28, CY, 'middle', SANS, 700, extra='filter="url(#glow)"')
    o += t(764, 438, 'BEST 1:22.98', 18, YE, 'end', MONO, 700, ls=2)
    return o + tail()


# ====================================================================== CYBERPUNK 2077 (yellow) style
# Angular on purpose: straight lines, slanted cuts and parallelograms, no arcs or circles, and a squared
# condensed font. Agency FB stands in for the mockups; the car needs a free font with the same feel
# (Chakra Petch or Rajdhani, both OFL).
Y, K, RD, CN, WH = '#fcee0a', '#0b0b0c', '#ff003c', '#02d7f2', '#f2f2f2'
Y_OFF, Y_OFFL, Y_DIM = '#1c1c1a', '#3a3a32', '#8c8550'
YS = "'Agency FB', Bahnschrift, sans-serif"

def yt(x, y, s, size, fill, anchor='start', fam=YS, weight=700, ls=0, extra=''):
    return t(x, y, s, size, fill, anchor, fam, weight, ls, extra)

def yglitch(x, y, s, size, fill, anchor='middle', slices=((0.55, 0.61, 7),), bg=K):
    return glitch(x, y, s, size, fill, anchor, slices, left=RD, right=CN, bg=bg, op=0.55, shift=3, glow=False,
                  fam=YS, cw=0.45)

def poly(pts, fill, extra=''):
    return '<polygon points="%s" fill="%s" %s/>' % (' '.join('%.1f,%.1f' % p for p in pts), fill, extra)

def yheader(title, sub, right):
    o = poly([(0, 0), (800, 0), (800, 30), (784, 44), (0, 44)], Y) + '\n'
    o += yt(16, 36, title, 34, K, ls=2)
    o += t(150, 30, sub, 13, K, fam=MONO, weight=700)
    o += f'<rect x="600" y="8" width="70" height="26" fill="url(#hazk)"/>\n'
    o += t(784, 30, right, 13, K, 'end', MONO, 700)
    return o

def ybar_h(x, y, n, step, w, h, lit, col=Y):
    o = ''
    for i in range(n):
        if i < lit:
            o += poly([(x + i * step + 3, y), (x + i * step + 3 + w, y), (x + i * step + w, y + h), (x + i * step, y + h)], col)
        else:
            o += poly([(x + i * step + 3, y), (x + i * step + 3 + w, y), (x + i * step + w, y + h), (x + i * step, y + h)],
                      Y_OFF, f'stroke="{Y_OFFL}"')
    return o + '\n'

def y_drive():
    rpm, speed, gear = 6300, 128, 4
    o = head(bg=K, grid='#3a3510')
    o += yheader('MIATOFF', '// MX-5 ND &#183; 74.00.324', 'SYS ONLINE')
    # rev ramp: slanted bars that grow towards the redline, bottoms aligned
    N, x0, x1, base, skew = 32, 16, 508, 236, 12
    step = (x1 - x0) / N
    for i in range(N):
        r_hi = (i + 1) * 8000 / N
        h = 34 + 136 * (i / (N - 1)) ** 1.25
        x = x0 + i * step
        pts = [(x + skew, base - h), (x + skew + step - 5, base - h), (x + step - 5, base), (x, base)]
        if r_hi <= rpm:
            o += poly(pts, RD if r_hi > 7000 else Y)
        else:
            o += poly(pts, '#2a0a10' if r_hi > 7000 else Y_OFF, f'stroke="{"#5a1020" if r_hi > 7000 else Y_OFFL}"')
    o += '\n'
    for k in range(9):
        o += yt(round(x0 + k * 1000 / 8000 * (x1 - x0), 1), 262, str(k), 22, RD if k >= 7 else Y, 'start')
    o += f'<line x1="{x0}" y1="270" x2="{x1}" y2="270" stroke="{Y}" stroke-opacity="0.35"/>\n'
    o += t(16, 298, f'RPM {rpm}', 15, RD, fam=MONO, weight=700, ls=3)
    o += yglitch(16, 448, str(speed), 168, Y, anchor='start')
    o += yt(272, 448, 'KM/H', 30, Y, ls=4, extra='opacity="0.75"')
    # gear block: black on yellow
    o += chamfer(532, 68, 252, 206, 26, fill=Y, stroke=Y, op=1)
    o += yt(550, 98, 'GEAR', 22, K, ls=3)
    o += f'<rect x="752" y="82" width="14" height="14" fill="{RD}"/>\n'
    o += yt(658, 262, str(gear), 230, K, 'middle')
    for (yy, lab, val, lit) in ((318, 'COOLANT', '89&#176;C', 14), (390, 'FUEL', '71%', 14)):
        o += t(532, yy, lab, 14, RD, fam=MONO, weight=700, ls=3)
        o += yt(784, yy + 8, val, 48, Y, 'end')
        o += ybar_h(532, yy + 16, 21, 12, 9, 14, lit)
    o += f'<rect x="16" y="454" width="120" height="14" fill="{Y}"/><rect x="16" y="454" width="120" height="14" fill="url(#hazk)"/>\n'
    o += t(150, 466, 'THR 92%  &#183;  IAT 34&#176;C  &#183;  OUT 17.5&#176;C', 13, Y, fam=MONO, weight=700, extra='opacity="0.85"')
    return o + tail()

def y_gmeter():
    cx, cy, R, MAX, C = 236, 258, 188, 1.25, 34
    o = head(bg=K, grid='#3a3510')
    o += poly([(0, 0), (300, 0), (280, 40), (0, 40)], Y) + '\n'
    o += yt(16, 34, 'G-FORCE', 34, K, ls=2)
    o += f'<line x1="300" y1="1" x2="800" y2="1" stroke="{Y}" stroke-width="2"/>\n'

    def box(r, c):
        return [(cx - r + c, cy - r), (cx + r - c, cy - r), (cx + r, cy - r + c), (cx + r, cy + r - c),
                (cx + r - c, cy + r), (cx - r + c, cy + r), (cx - r, cy + r - c), (cx - r, cy - r + c)]
    o += poly(box(R, C), '#121210', f'stroke="{Y}" stroke-width="3"') + '\n'
    for g in (0.25, 0.5, 0.75, 1.0):
        r = R * g / MAX
        major = g in (0.5, 1.0)
        o += poly(box(r, C * r / R), 'none', f'stroke="{Y if major else "#5a5410"}" stroke-opacity="{0.7 if major else 1}" stroke-width="1.5" ' +
                  ('' if major else 'stroke-dasharray="4 5"')) + '\n'
        if major:
            o += t(cx + r - 30, cy - r + 16, f'{g:.1f}', 14, Y, fam=MONO, weight=700)
    o += f'<g stroke="{Y}" stroke-opacity="0.35"><line x1="{cx - R}" y1="{cy}" x2="{cx + R}" y2="{cy}"/><line x1="{cx}" y1="{cy - R}" x2="{cx}" y2="{cy + R}"/></g>\n'
    o += yt(cx, cy - R + 30, 'BRAKE', 22, Y, 'middle', ls=3, extra='opacity="0.8"')
    o += yt(cx, cy + R - 14, 'ACCEL', 22, Y, 'middle', ls=3, extra='opacity="0.8"')
    o += yt(cx - R + 14, cy - 10, 'R', 24, Y, extra='opacity="0.8"')
    o += yt(cx + R - 14, cy - 10, 'L', 24, Y, 'end', extra='opacity="0.8"')
    trail = [(236, 258), (244, 238), (262, 212), (292, 196), (326, 192), (350, 200), (360, 208)]
    for i in range(1, len(trail)):
        (x0, y0), (x1, y1) = trail[i - 1], trail[i]
        o += f'<line x1="{x0}" y1="{y0}" x2="{x1}" y2="{y1}" stroke="{Y}" stroke-width="{2 + 4 * i / len(trail):.1f}" stroke-opacity="{0.15 + 0.85 * i / (len(trail) - 1):.2f}"/>\n'
    dx, dy = trail[-1]
    # target: a diamond in a square bracket frame
    o += f'<g fill="none" stroke="{Y}" stroke-width="2.5">'
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        o += f'<path d="M{dx + sx * 20},{dy + sy * 10} V{dy + sy * 20} H{dx + sx * 10}"/>'
    o += '</g>' + poly([(dx, dy - 12), (dx + 12, dy), (dx, dy + 12), (dx - 12, dy)], RD) + '\n'
    o += poly([(dx + 26, dy - 46), (dx + 108, dy - 46), (dx + 108, dy - 30), (dx + 98, dy - 20), (dx + 26, dy - 20)], Y)
    o += yt(dx + 66, dy - 24, '0.89G', 26, K, 'middle') + '\n'
    rows = [('L-TURN', '0.94', Y), ('R-TURN', '0.88', Y), ('ACCEL', '0.41', CN), ('BRAKE', '1.02', RD)]
    for i, (lab, val, col) in enumerate(rows):
        yy = 64 + i * 56
        o += poly([(470, yy), (478, yy), (478, yy + 44), (470, yy + 36)], col)
        o += t(490, yy + 18, lab, 13, Y_DIM, fam=MONO, weight=700, ls=2)
        o += t(490, yy + 38, 'PEAK', 11, Y_DIM, fam=MONO)
        o += yt(784, yy + 44, val, 58, col, 'end') + '\n'
    o += t(470, 312, 'THROTTLE / BRAKE  &#183;  LAST 3S', 13, Y_DIM, fam=MONO, weight=700, ls=1)
    hist = [100, 100, 100, 100, 95, 60, 0, -70, -90, -80, -40, 30, 75, 92]
    bw, gap, top, base = 17, 5, 322, 440
    for i, val in enumerate(hist):
        x = 470 + i * (bw + gap)
        o += f'<rect x="{x}" y="{top}" width="{bw}" height="{base - top}" fill="#3a3a36"/>'
        h = abs(val) / 100 * (base - top)
        o += f'<rect x="{x}" y="{base - h:.1f}" width="{bw}" height="{h:.1f}" fill="{RD if val < 0 else Y}"/>'
    o += yt(470 + 13 * (bw + gap) + bw / 2, top - 4, '92%', 18, Y, 'middle') + '\n'
    return o + tail()

def y_track():
    rpm = 6800
    o = head(bg=K, grid='#3a3510')
    o += f'<rect x="2" y="2" width="796" height="476" fill="none" stroke="{Y}" stroke-width="4" filter="url(#glow)"/>\n'
    N, x0 = 24, 16
    step = (784 - x0) / N
    for i in range(N):
        r_hi = 3000 + (i + 1) * 4500 / N
        x = x0 + i * step
        pts = [(x + 8, 18), (x + step - 7 + 8, 18), (x + step - 7, 118), (x, 118)]
        o += poly(pts, (RD if r_hi > 7000 else Y) if r_hi <= rpm else '#3a3a36')
    o += '\n'
    for k in range(3, 8):
        x = x0 + (k * 1000 - 3000) / 4500 * (784 - x0)
        o += yt(round(x, 1), 144, str(k), 22, RD if k >= 7 else Y, 'middle')
    o += chamfer(296, 156, 208, 228, 30, fill=Y, stroke=Y, op=1)
    o += yt(400, 378, '3', 236, K, 'middle')
    o += yt(314, 186, 'GEAR', 20, K, ls=3)
    o += yglitch(140, 310, '131', 120, Y)
    o += yt(140, 344, 'KM/H', 22, Y, 'middle', ls=6, extra='opacity="0.75"')
    o += yt(662, 310, '6800', 110, WH, 'middle')
    o += yt(662, 344, 'RPM', 22, Y, 'middle', ls=6, extra='opacity="0.75"')
    o += chamfer(16, 400, 768, 62, 20, fill=Y, stroke=Y, op=1)
    o += yt(36, 442, 'LAP 07', 28, K, ls=2)
    o += yt(140, 452, '1:23.4', 60, K)
    o += poly([(318, 410), (436, 410), (436, 442), (426, 452), (318, 452)], K) + yt(377, 443, '-0.42', 38, CN, 'middle') + '\n'
    o += f'<rect x="460" y="414" width="90" height="34" fill="url(#hazk)"/>\n'
    o += yt(764, 442, 'BEST 1:22.98', 30, K, 'end', ls=1)
    return o + tail()


SETS = {
    'cyberpunk': (('cyber-drive', neon_drive), ('cyber-gmeter', neon_g), ('cyber-track', neon_track)),
    'cyberpunk2077': (('y2077-drive', y_drive), ('y2077-gmeter', y_gmeter), ('y2077-track', y_track)),
}
for folder, pages in SETS.items():
    out = os.path.join(ROOT, folder)
    os.makedirs(out, exist_ok=True)
    for name, fn in pages:
        with open(os.path.join(out, name + '.svg'), 'w', encoding='utf-8') as f:
            f.write(fn())
        print('wrote', folder + '/' + name)

// Draws the artwork of the built-in Home menus (meters/home-menus/menus.json): for each menu a background
// (800 x 480) and, per item, a normal and a selected picture the size of the item's picture box. Original
// artwork in the palettes of the Meters styles; glyphs are drawn here, no Mazda or brand art.
//
//   cd meters/tests/v3 && node generate-home-menus.mjs
//
// Review every changed PNG before committing (as with the Meters baselines). SPDX-License-Identifier: GPL-3.0-or-later
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUT = join(ROOT, "home-menus");
const spec = JSON.parse(readFileSync(join(OUT, "menus.json"), "utf8"));
const fonts = {
  "MO Chakra": "ChakraPetch-Bold.ttf",
  "MO Mono": "ShareTechMono-Regular.ttf",
  "MO Condensed": "Rajdhani-Bold.ttf",
  "MO Sport": "RussoOne-Regular.ttf",
};
const fontCss = Object.entries(fonts)
  .map(
    ([family, file]) =>
      `@font-face{font-family:"${family}";src:url(data:font/ttf;base64,${readFileSync(join(ROOT, "fonts", file)).toString("base64")})}`,
  )
  .join("");

// Everything below PAINT runs in the browser.
const PAINT = String.raw`
const TAU = Math.PI * 2;
const PAL = {
  yellow: { Y: "#fcee0a", K: "#0b0b0c", RD: "#ff003c", CN: "#02d7f2", PANEL: "#121210", DIM: "#8c8550", GRID: "#1d1b0a", OFF: "#3a3a32" },
  night: { Y: "#35a9b5", K: "#0b0b0c", RD: "#ff003c", CN: "#d8f3f6", PANEL: "#0e1415", DIM: "#5f8a8f", GRID: "#0b1b1d", OFF: "#243234" },
};
function poly(c, pts) { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); }
function rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
// Chamfered box: cut top-right and bottom-left corners.
function chamfer(c, x, y, w, h, k) { poly(c, [[x, y], [x + w - k, y], [x + w, y + k], [x + w, y + h], [x + k, y + h], [x, y + h - k]]); }
function hazard(c, x, y, w, h, a, b) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillStyle = b; c.fillRect(x, y, w, h); c.fillStyle = a;
  for (let i = -h; i < w + h; i += 14) poly(c, [[x + i, y + h], [x + i + 7, y + h], [x + i + 7 + h, y], [x + i + h, y]]), c.fill();
  c.restore();
}
function scanlines(c, w, h, alpha) { c.fillStyle = "rgba(0,0,0," + alpha + ")"; for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1); }
function spaced(c, text, x, y, size, font, color, gap) {
  c.font = size + 'px "' + font + '"'; c.fillStyle = color; c.textBaseline = "alphabetic"; c.textAlign = "left";
  for (const ch of text) { c.fillText(ch, x, y); x += c.measureText(ch).width + gap; } return x;
}

// ---------------------------------------------------------------- glyphs: centred on (x, y), about s across
function glyph(c, kind, x, y, s, color, opts = {}) {
  const lw = Math.max(2, s * (opts.weight || 0.075));
  c.save(); c.translate(x, y); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = lw; c.lineCap = "round"; c.lineJoin = "round";
  const h = s / 2;
  switch (kind) {
    case "applications": {
      const cell = s * 0.24, gap = s * 0.12, o = -(cell * 3 + gap * 2) / 2;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { rrect(c, o + i * (cell + gap), o + j * (cell + gap), cell, cell, cell * 0.25); c.fill(); }
      break;
    }
    case "entertainment": {
      c.beginPath(); c.moveTo(-h * 0.35, h * 0.55); c.lineTo(-h * 0.35, -h * 0.7); c.lineTo(h * 0.65, -h * 0.9); c.lineTo(h * 0.65, h * 0.35); c.stroke();
      c.lineWidth = lw * 1.6; c.beginPath(); c.moveTo(-h * 0.35, -h * 0.7); c.lineTo(h * 0.65, -h * 0.9); c.stroke(); c.lineWidth = lw;
      c.beginPath(); c.ellipse(-h * 0.58, h * 0.6, h * 0.26, h * 0.19, -0.4, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(h * 0.42, h * 0.4, h * 0.26, h * 0.19, -0.4, 0, TAU); c.fill();
      break;
    }
    case "communication": {
      // A handset: two cups joined by a curved grip.
      c.rotate(-0.75);
      c.beginPath(); c.moveTo(-h * 0.8, -h * 0.05); c.quadraticCurveTo(0, -h * 0.55, h * 0.8, -h * 0.05); c.lineWidth = lw * 1.9; c.stroke();
      c.lineWidth = lw;
      for (const side of [-1, 1]) { rrect(c, side * h * 0.8 - h * 0.2, -h * 0.12, h * 0.4, h * 0.42, h * 0.1); c.fill(); }
      break;
    }
    case "navigation": {
      poly(c, [[0, -h * 0.9], [h * 0.7, h * 0.85], [0, h * 0.45], [-h * 0.7, h * 0.85]]);
      if (opts.outline) c.stroke(); else c.fill();
      break;
    }
    case "settings": {
      const teeth = 8, ro = h * 0.92, ri = h * 0.7;
      c.beginPath();
      for (let i = 0; i < teeth * 2; i++) {
        const a0 = (i / (teeth * 2)) * TAU, a1 = ((i + 1) / (teeth * 2)) * TAU, r = i % 2 ? ri : ro;
        c.lineTo(Math.cos(a0 + 0.05) * r, Math.sin(a0 + 0.05) * r); c.lineTo(Math.cos(a1 - 0.05) * r, Math.sin(a1 - 0.05) * r);
      }
      c.closePath(); c.fill();
      c.globalCompositeOperation = "destination-out"; c.beginPath(); c.arc(0, 0, h * 0.3, 0, TAU); c.fill();
      break;
    }
    case "meters": {
      const r = h * 0.88, a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
      c.beginPath(); c.arc(0, h * 0.12, r, a0, a1); c.stroke();
      for (let i = 0; i <= 8; i++) {
        const a = a0 + ((a1 - a0) * i) / 8, r1 = r * (i % 2 ? 0.82 : 0.72);
        c.beginPath(); c.moveTo(Math.cos(a) * r * 0.97, h * 0.12 + Math.sin(a) * r * 0.97); c.lineTo(Math.cos(a) * r1, h * 0.12 + Math.sin(a) * r1); c.stroke();
      }
      const n = a0 + (a1 - a0) * (opts.needle ?? 0.72);
      c.strokeStyle = opts.needleColor || color; c.lineWidth = lw * 1.2;
      c.beginPath(); c.moveTo(0, h * 0.12); c.lineTo(Math.cos(n) * r * 0.7, h * 0.12 + Math.sin(n) * r * 0.7); c.stroke();
      c.fillStyle = opts.needleColor || color; c.beginPath(); c.arc(0, h * 0.12, lw * 1.4, 0, TAU); c.fill();
      break;
    }
    case "bluetooth": {
      // Headphones: a band and two cups.
      c.beginPath(); c.arc(0, h * 0.1, h * 0.75, Math.PI, 0); c.stroke();
      for (const side of [-1, 1]) { rrect(c, side * h * 0.75 - h * 0.17, h * 0.05, h * 0.34, h * 0.62, h * 0.12); c.fill(); }
      break;
    }
    case "fm": {
      c.beginPath(); c.arc(0, 0, lw * 1.3, 0, TAU); c.fill();
      for (const [r, a] of [[0.42, 0.7], [0.78, 0.7]]) for (const side of [0, Math.PI]) {
        c.beginPath(); c.arc(0, 0, h * r, side - a, side + a); c.stroke();
      }
      c.beginPath(); c.moveTo(0, lw * 1.3); c.lineTo(0, h * 0.9); c.stroke();
      break;
    }
    case "dab": {
      rrect(c, -h * 0.9, -h * 0.55, h * 1.8, h * 1.2, h * 0.16); c.stroke();
      c.beginPath(); c.arc(h * 0.42, h * 0.05, h * 0.28, 0, TAU); c.stroke();
      for (let i = 0; i < 3; i++) { c.fillRect(-h * 0.62, -h * 0.28 + i * h * 0.26, h * 0.62, lw * 0.9); }
      c.beginPath(); c.moveTo(-h * 0.5, -h * 0.55); c.lineTo(h * 0.2, -h * 0.98); c.stroke();
      break;
    }
    case "android-auto": {
      // A steering wheel: car mode.
      c.beginPath(); c.arc(0, 0, h * 0.85, 0, TAU); c.stroke();
      c.beginPath(); c.arc(0, 0, h * 0.24, 0, TAU); c.fill();
      for (const a of [Math.PI * 0.5, Math.PI * 1.15, Math.PI * 1.85]) {
        c.beginPath(); c.moveTo(Math.cos(a) * h * 0.24, Math.sin(a) * h * 0.24); c.lineTo(Math.cos(a) * h * 0.85, Math.sin(a) * h * 0.85); c.stroke();
      }
      break;
    }
    case "carplay": {
      rrect(c, -h * 0.5, -h * 0.9, h, h * 1.8, h * 0.18); c.stroke();
      poly(c, [[-h * 0.17, -h * 0.28], [h * 0.25, 0], [-h * 0.17, h * 0.28]]); c.fill();
      c.beginPath(); c.moveTo(-h * 0.14, h * 0.7); c.lineTo(h * 0.14, h * 0.7); c.stroke();
      break;
    }
  }
  c.restore();
}

// ---------------------------------------------------------------- 2077 (and 2077 Night)
const y2077 = {
  background(c, m) {
    const P = PAL[m.palette];
    c.fillStyle = P.K; c.fillRect(0, 0, 800, 480);
    c.strokeStyle = P.GRID; c.lineWidth = 1;
    for (let x = 0; x <= 800; x += 32) { c.beginPath(); c.moveTo(x + 0.5, 64); c.lineTo(x + 0.5, 480); c.stroke(); }
    for (let y = 64; y <= 480; y += 32) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(800, y + 0.5); c.stroke(); }
    // Header: a slanted yellow strip with the name, hazard stripes, status text.
    c.fillStyle = P.Y; poly(c, [[0, 66], [420, 66], [420, 82], [404, 96], [0, 96]]); c.fill();
    spaced(c, "MIATOFF", 16, 90, 26, "MO Condensed", P.K, 2);
    c.font = '13px "MO Mono"'; c.fillStyle = P.K; c.fillText("// HOME · MX-5 ND", 132, 88);
    hazard(c, 440, 70, 76, 22, P.Y, P.K);
    c.fillStyle = P.RD; c.fillRect(530, 74, 12, 12);
    c.font = '13px "MO Mono"'; c.fillStyle = P.DIM; c.textAlign = "right"; c.fillText("SYS ONLINE", 784, 88); c.textAlign = "left";
    // Footer: a rule with an angled end and a short hazard strip.
    c.fillStyle = P.Y; poly(c, [[0, 440], [560, 440], [552, 444], [0, 444]]); c.fill();
    hazard(c, 0, 452, 220, 14, P.Y, P.K);
    c.font = '12px "MO Mono"'; c.fillStyle = P.DIM; c.fillText("NODE 74.00.324 · LINK STABLE", 240, 464);
    c.globalAlpha = 0.06; c.font = '220px "MO Condensed"'; c.fillStyle = P.Y; c.textAlign = "right"; c.fillText("2077", 800, 470);
    c.globalAlpha = 1; c.textAlign = "left";
    scanlines(c, 800, 480, 0.18);
  },
  item(c, m, it, w, h, on, index) {
    const P = PAL[m.palette], k = 18;
    chamfer(c, 1, 1, w - 2, h - 2, k);
    c.fillStyle = on ? P.Y : P.PANEL; c.fill();
    c.lineWidth = 2; c.strokeStyle = on ? P.Y : P.DIM; c.stroke();
    // Number, slanted blocks, a red mark when chosen.
    c.font = '13px "MO Mono"'; c.fillStyle = on ? P.K : P.DIM; c.fillText(String(index + 1).padStart(2, "0"), 12, 22);
    for (let i = 0; i < 5; i++) { c.fillStyle = on ? P.K : P.OFF; poly(c, [[w - 74 + i * 11 + 4, h - 16], [w - 74 + i * 11 + 11, h - 16], [w - 74 + i * 11 + 7, h - 8], [w - 74 + i * 11, h - 8]]); c.fill(); }
    if (on) { c.fillStyle = P.RD; c.fillRect(w - 36, 10, 12, 12); }
    const s = Math.min(h * 0.62, w * 0.4), gx = w / 2, gy = h / 2;
    if (on) {
      c.globalAlpha = 0.55; glyph(c, it.opens, gx - 3, gy, s, P.RD); glyph(c, it.opens, gx + 3, gy, s, P.CN); c.globalAlpha = 1;
      glyph(c, it.opens, gx, gy, s, P.K, { needleColor: P.RD });
    } else {
      glyph(c, it.opens, gx, gy, s, P.Y, { needleColor: P.RD });
    }
  },
};

// ---------------------------------------------------------------- Cyber
const CY = "#00f0ff", MG = "#ff2bd6", YE = "#fcee0a";
const cyber = {
  background(c) {
    c.fillStyle = "#07060d"; c.fillRect(0, 0, 800, 480);
    const glow = c.createRadialGradient(400, 300, 20, 400, 300, 420);
    glow.addColorStop(0, "rgba(255,43,214,0.16)"); glow.addColorStop(1, "rgba(7,6,13,0)");
    c.fillStyle = glow; c.fillRect(0, 0, 800, 480);
    // A perspective floor below the horizon.
    c.strokeStyle = "#24154a"; c.lineWidth = 1;
    for (let i = -12; i <= 12; i++) { c.beginPath(); c.moveTo(400 + i * 8, 300); c.lineTo(400 + i * 90, 480); c.stroke(); }
    for (let j = 0; j < 9; j++) { const y = 300 + Math.pow(j / 8, 2) * 180; c.beginPath(); c.moveTo(0, y); c.lineTo(800, y); c.stroke(); }
    // HUD line and labels.
    c.strokeStyle = "rgba(0,240,255,0.55)"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(16, 92); c.lineTo(16, 74); c.lineTo(300, 74); c.lineTo(318, 86); c.lineTo(784, 86); c.stroke();
    c.font = '14px "MO Mono"'; c.fillStyle = MG; c.fillText("MIATOFF//OS", 28, 94);
    c.fillStyle = "rgba(0,240,255,0.75)"; c.textAlign = "right"; c.fillText("NODE MX-5 ND ▸ LINK OK", 784, 80); c.textAlign = "left";
    c.beginPath(); c.moveTo(16, 446); c.lineTo(16, 464); c.lineTo(40, 464); c.moveTo(784, 446); c.lineTo(784, 464); c.lineTo(760, 464); c.stroke();
    c.font = '12px "MO Mono"'; c.fillStyle = "#8b7bb5"; c.fillText("> HOME > SELECT A NODE", 52, 468);
    c.fillStyle = MG; c.textAlign = "right"; c.fillText("◢◤ 0x7F3A", 752, 468); c.textAlign = "left";
    scanlines(c, 800, 480, 0.22);
  },
  item(c, m, it, w, h, on) {
    const k = 14, x = 3, y = 3, ww = w - 6, hh = h - 6;
    poly(c, [[x + k, y], [x + ww, y], [x + ww, y + hh - k], [x + ww - k, y + hh], [x, y + hh], [x, y + k]]);
    c.fillStyle = on ? "rgba(255,43,214,0.16)" : "rgba(13,10,28,0.88)"; c.fill();
    c.save(); c.shadowColor = on ? MG : CY; c.shadowBlur = on ? 10 : 4;
    c.lineWidth = on ? 2.5 : 1.5; c.strokeStyle = on ? MG : "rgba(0,240,255,0.8)"; c.stroke(); c.restore();
    // Corner ticks.
    c.fillStyle = on ? YE : CY; c.fillRect(x + ww - 22, y + 6, 14, 3); c.fillRect(x + 6, y + hh - 9, 14, 3);
    c.font = '11px "MO Mono"'; c.fillStyle = on ? MG : "#8b7bb5"; c.fillText(on ? "> LINKED" : "> IDLE", x + 22, y + 16);
    const s = Math.min(h * 0.5, w * 0.42);
    c.save(); c.shadowColor = on ? MG : CY; c.shadowBlur = on ? 18 : 8;
    glyph(c, it.opens, w / 2, h / 2 + 6, s, on ? "#ffffff" : CY, { weight: 0.065, needleColor: on ? MG : YE });
    c.restore();
  },
};

// ---------------------------------------------------------------- Track
const AM = "#f2a93b";
const track = {
  background(c) {
    c.fillStyle = "#0b0f17"; c.fillRect(0, 0, 800, 480);
    c.fillStyle = "#1a2232";
    for (let x = 8; x < 800; x += 16) for (let y = 72; y < 480; y += 16) c.fillRect(x, y, 2, 2);
    // A racing stripe and the wordmark.
    c.fillStyle = "rgba(242,169,59,0.07)"; poly(c, [[520, 64], [600, 64], [360, 480], [280, 480]]); c.fill();
    c.fillStyle = "rgba(242,169,59,0.04)"; poly(c, [[620, 64], [650, 64], [410, 480], [380, 480]]); c.fill();
    c.font = '20px "MO Sport"'; c.fillStyle = "#eaf0f6"; c.fillText("MIATOFF", 28, 92);
    c.font = '13px "MO Sport"'; c.fillStyle = AM; c.fillText("TRACK MODE", 148, 92);
    c.fillStyle = "#2b3747"; c.fillRect(28, 444, 748, 2); c.fillStyle = AM; c.fillRect(28, 444, 120, 2);
    c.font = '12px "MO Sport"'; c.fillStyle = "#5b6b82"; c.fillText("MX-5 ND", 28, 466);
  },
  item(c, m, it, w, h, on) {
    rrect(c, 3, 3, w - 6, h - 6, 18);
    c.fillStyle = on ? "#182233" : "#121a26"; c.fill();
    c.lineWidth = on ? 4 : 1.5; c.strokeStyle = on ? AM : "#2b3747"; c.stroke();
    const big = it.opens === "meters" && h > 200, s = big ? Math.min(w, h) * 0.62 : Math.min(h * 0.6, w * 0.45);
    glyph(c, it.opens, w / 2, h / 2 + (big ? 8 : 4), s, on ? AM : "#eaf0f6", { weight: big ? 0.05 : 0.085, needleColor: on ? "#eaf0f6" : AM, needle: 0.8 });
    if (big) {
      c.font = '15px "MO Sport"'; c.textAlign = "center"; c.fillStyle = on ? AM : "#93a2b8";
      c.fillText("RPM · SPEED · LAP", w / 2, h - 22); c.textAlign = "left";
    }
  },
};

// ---------------------------------------------------------------- Classic
const RED = "#d4202a";
const classic = {
  background(c) {
    const g = c.createRadialGradient(400, 120, 40, 400, 200, 560);
    g.addColorStop(0, "#262a32"); g.addColorStop(0.6, "#121419"); g.addColorStop(1, "#07080a");
    c.fillStyle = g; c.fillRect(0, 0, 800, 480);
    // A soft red arc below the buttons, and a faint sheen.
    c.save(); c.shadowColor = RED; c.shadowBlur = 24; c.strokeStyle = "rgba(212,32,42,0.75)"; c.lineWidth = 2.5;
    c.beginPath(); c.ellipse(400, 640, 560, 300, 0, Math.PI * 1.08, Math.PI * 1.92); c.stroke(); c.restore();
    c.strokeStyle = "rgba(255,255,255,0.06)"; c.lineWidth = 1;
    c.beginPath(); c.ellipse(400, 660, 600, 320, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    const sheen = c.createLinearGradient(0, 64, 0, 200); sheen.addColorStop(0, "rgba(255,255,255,0.05)"); sheen.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = sheen; c.fillRect(0, 64, 800, 136);
  },
  item(c, m, it, w, h, on) {
    const d = Math.min(w, h) - 16, cx = w / 2, cy = h / 2, r = d / 2;
    if (on) {
      c.save(); c.shadowColor = RED; c.shadowBlur = 14; c.strokeStyle = RED; c.lineWidth = 4;
      c.beginPath(); c.arc(cx, cy, r + 3, 0, TAU); c.stroke(); c.restore();
    }
    const face = c.createRadialGradient(cx - r * 0.25, cy - r * 0.35, r * 0.05, cx, cy, r);
    face.addColorStop(0, on ? "#50565f" : "#40454e"); face.addColorStop(0.7, on ? "#24272d" : "#1b1d22"); face.addColorStop(1, "#101114");
    c.fillStyle = face; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
    const rim = c.createLinearGradient(0, cy - r, 0, cy + r); rim.addColorStop(0, "#eef1f4"); rim.addColorStop(0.5, "#9aa1aa"); rim.addColorStop(1, "#4a5058");
    c.strokeStyle = rim; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, r - 1.5, 0, TAU); c.stroke();
    // Glass: a thin highlight along the top edge, a darker ring inside the rim.
    c.strokeStyle = "rgba(0,0,0,0.45)"; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, r - 4.5, 0, TAU); c.stroke();
    c.strokeStyle = "rgba(255,255,255,0.22)"; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, r - 8, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    glyph(c, it.opens, cx, cy, d * 0.5, "#ffffff", { weight: 0.075, needleColor: RED });
  },
};

const THEMES = { y2077, cyber, track, classic };
window.paint = async (m) => {
  await document.fonts.ready;
  for (const f of ["MO Chakra", "MO Mono", "MO Condensed", "MO Sport"]) await document.fonts.load('20px "' + f + '"');
  const T = THEMES[m.theme], out = {}, band = Math.round(m.look.labelSize * 1.6);
  const canvas = (w, h) => { const e = document.createElement("canvas"); e.width = w; e.height = h; return [e, e.getContext("2d")]; };
  let [e, c] = canvas(800, 480); T.background(c, m); out.background = e.toDataURL("image/png");
  m.items.forEach((it, index) => {
    const w = it.w - 8, h = it.h - 8 - band;
    for (const on of [false, true]) {
      [e, c] = canvas(w, h); T.item(c, m, it, w, h, on, index);
      out[it.opens + (on ? "-selected" : "")] = e.toDataURL("image/png");
    }
  });
  return out;
};
`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><style>${fontCss}</style><body>${Object.keys(fonts).map((f) => `<span style="font-family:'${f}'">.</span>`).join("")}</body>`);
  await page.addScriptTag({ content: PAINT });
  for (const menu of spec.menus) {
    const dir = join(OUT, menu.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const pictures = await page.evaluate((m) => window.paint(m), menu);
    for (const [name, url] of Object.entries(pictures))
      writeFileSync(join(dir, name + ".png"), Buffer.from(url.split(",")[1], "base64"));
    console.log(menu.id, Object.keys(pictures).length, "pictures");
  }
} finally {
  await browser.close();
}

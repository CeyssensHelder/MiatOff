// SPDX-License-Identifier: GPL-3.0-or-later
// The car's shift sound (meters/js/shiftsound.js): ticks speeding up from the amber line, a steady tone at the shift
// point (predicted a little early from the rpm rise), quiet after it until the revs come down, and which route plays.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const source = readFileSync(fileURLToPath(new URL("../../js/shiftsound.js", import.meta.url)), "utf8");

function load(extra = {}) {
  const window = { ...extra };
  vm.runInNewContext(source, { window });
  return window.MeterShiftSound;
}

const gates = (more = {}) => ({ enabled: true, live: true, speed: 60, amber: 6500, shift: 7200, ...more });

// Drive a Shifter: rpm samples every `dt` ms (as data updates), one update per sample. Returns [time, rpm, cue] rows.
function drive(S, rpms, { dt = 100, start = 0, more = {}, sh = new S.Shifter() } = {}) {
  const out = [];
  let t = start;
  for (const r of rpms) {
    t += dt;
    sh.sample(t, r);
    const cue = sh.update(t, gates(more));
    if (cue) out.push([t, r, cue]);
  }
  return { out, sh, t };
}
const steady = (r, n) => Array(n).fill(r);

test("quiet below amber, ticks in the amber band with gaps shrinking towards the shift point", () => {
  const S = load();
  // Hold each rpm long enough to hear its gap (no rise: the prediction is the rpm itself).
  const gapAt = (rpm) => {
    const { out } = drive(S, steady(rpm, 60), { dt: 10 });
    const ticks = out.filter((row) => row[2] === "tick").map((row) => row[0]);
    return ticks.length > 1 ? ticks[1] - ticks[0] : null;
  };
  assert.equal(drive(S, steady(6400, 50)).out.length, 0, "below amber: quiet");
  const slow = gapAt(6500), mid = gapAt(6850), fast = gapAt(7190);
  assert.ok(slow >= 440 && slow <= 460, `450 ms at amber (${slow})`);
  assert.ok(mid > fast && mid < slow, `shrinking (${slow}, ${mid}, ${fast})`);
  assert.ok(fast >= 110 && fast <= 130, `about 110 ms just below the shift point (${fast})`);
});

test("steady tone at the shift point, then quiet on the limiter until the revs come down", () => {
  const S = load();
  const { out, sh, t } = drive(S, [...steady(7200, 1), ...steady(7400, 30)], { dt: 100 });
  assert.deepEqual(out.map((row) => row[2]), ["start", "stop"], "one tone, stopped by the time limit");
  assert.equal(out[1][0] - out[0][0], S.HOLD_MAX);
  // Still on the limiter, then just below amber, then down: armed again only below amber.
  const more = drive(S, [...steady(7400, 10), 6600, 6450, 6600, 6800, 7300], { sh, start: t });
  assert.deepEqual(more.out.map((row) => row[2]), ["tick", "start"], "re-armed once below amber");
  assert.equal(more.out[0][1], 6600);
});

test("the upshift ends the steady tone", () => {
  const S = load();
  const { out } = drive(S, [7000, 7250, 7300, 7350, 7100, 5100], { dt: 100 });
  const cues = out.map((row) => row[2]);
  assert.deepEqual(cues.slice(-2), ["start", "stop"]);
  assert.equal(out.at(-1)[1], 7100, "a fall of 250 rpm from the peak is the upshift (200 or more)");
});

test("the tone comes early when the revs rise fast", () => {
  const S = load();
  // 4,000 rpm/s (2nd gear at full throttle): 0.25 s ahead is 1,000 rpm; the tone starts near 6,200.
  const rising = Array.from({ length: 30 }, (_, i) => 5000 + i * 200);   // every 50 ms
  const { out } = drive(S, rising, { dt: 50 });
  const start = out.find((row) => row[2] === "start");
  assert.ok(start[1] >= 6100 && start[1] <= 6300, `early start at ${start[1]}`);
  const firstTick = out.find((row) => row[2] === "tick");
  assert.ok(firstTick[1] < 6500, `ticks start early too (${firstTick[1]})`);
  // A sudden jump in the data is at most 1,000 rpm early: 3,000 to 6,000 gives a tick, not the shift tone.
  const glitch = drive(S, [3000, 3000, 6000], { dt: 100 }).out;
  assert.deepEqual(glitch.map((row) => row[2]), ["tick"], "a jump to 6000 predicts at most 7000");
  // Steady revs: exactly at the shift point.
  const flat = drive(S, [...steady(7190, 10), ...steady(7200, 2)], { dt: 100 }).out;
  assert.equal(flat.find((row) => row[2] === "start")[1], 7200);
});

test("silent when stationary, on stale data, switched off or without a shift point", () => {
  const S = load();
  for (const [why, more] of [
    ["standing still", { speed: 0 }],
    ["at walking pace", { speed: 5 }],
    ["no speed", { speed: undefined }],
    ["stale data", { live: false }],
    ["switched off", { enabled: false }],
    ["no shift point", { shift: undefined }],
  ])
    assert.equal(drive(S, [6000, 6800, 7300, 7500], { more }).out.length, 0, why);
  // A gate that closes during the steady tone stops it.
  const sh = new S.Shifter();
  sh.sample(100, 7300);
  assert.equal(sh.update(100, gates()), "start");
  sh.sample(200, 7300);
  assert.equal(sh.update(200, gates({ speed: 0 })), "stop");
});

test("no amber line: ticks start 700 rpm before the shift point", () => {
  const S = load();
  assert.equal(drive(S, steady(6450, 5), { more: { amber: undefined } }).out.length, 0);
  assert.equal(drive(S, steady(6550, 5), { more: { amber: undefined } }).out[0][2], "tick");
});

// A window stand-in: Audio elements that log play/pause, the HMI's framework, and manual timers.
function win({ wav = "maybe", playThrows = false, beep = true } = {}) {
  const log = [], els = [], timers = [];
  function Audio() {
    const handlers = {};
    const el = {
      handlers,
      src: "",
      canPlayType: () => wav,
      addEventListener: (name, fn) => { handlers[name] = fn; },
      load() {},
      play() { if (playThrows) throw Error("no audio device"); log.push("play " + el.src); },
      pause() { log.push("pause " + el.src); },
    };
    els.push(el);
    return el;
  }
  const w = {
    Audio, log, els, timers,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
  };
  w.parent = beep ? { framework: { common: { beep: (a, b) => log.push(`beep:${a},${b}`) } } } : w;
  return w;
}
const run = (w) => { while (w.timers.some((x) => x.fn)) { const x = w.timers.find((y) => y.fn); const f = x.fn; x.fn = null; f(); } };

test("the files: a tick, the steady tone, and pause to stop it", () => {
  const S = load(), w = win(), p = new S.Player({ base: "sounds/", win: w });
  assert.equal(p.tick("file"), "file");
  assert.equal(p.start("file"), "file");
  p.stop();
  assert.deepEqual(w.log, ["play sounds/tick.wav", "pause sounds/shift.wav", "play sounds/shift.wav", "pause sounds/shift.wav"]);
});

test("the Mazda beep: a tick per beep, and a 120 ms repeat in place of the steady tone that stop cancels", () => {
  const S = load(), w = win(), p = new S.Player({ win: w });
  let now = 0;
  p.now = () => now;
  assert.equal(p.tick("beep"), "beep");
  assert.equal(p.start("beep"), "beep");
  assert.equal(w.timers.at(-1).ms, 120);
  for (let i = 0; i < 3; i++) { now += 120; const x = w.timers.at(-1); const f = x.fn; x.fn = null; f(); }
  assert.equal(w.log.filter((l) => l.startsWith("beep")).length, 5, "tick, start, three repeats");
  p.stop();
  assert.equal(w.timers.at(-1).fn, null, "stop cancels the repeat");
  // The repeat ends by itself after 1.5 s.
  p.start("beep");
  now += 2000;
  run(w);
  assert.equal(w.log.filter((l) => l.startsWith("beep")).length, 6);
});

test("the file first, the Mazda beep when the file cannot play", () => {
  const S = load();
  for (const [why, opts] of [["no WAV support", { wav: "" }], ["old Opera answers 'no'", { wav: "no" }], ["play() throws", { playThrows: true }]]) {
    const w = win(opts), p = new S.Player({ win: w });
    assert.equal(p.tick("file"), "beep", why);
    assert.equal(p.tick("file"), "beep", why + ": the file is not tried again");
  }
  const w = win({ wav: "", beep: false }), p = new S.Player({ win: w });
  assert.equal(p.tick("file"), "none", "nothing to play with");
});

test("a file that fails to load after play() gets the Mazda beep", () => {
  const S = load(), w = win(), p = new S.Player({ win: w });
  assert.equal(p.tick("file"), "file");
  w.els.find((el) => el.src.endsWith("tick.wav")).handlers.error();
  assert.equal(p.last, "beep");
  assert.equal(p.tick("file"), "beep", "the broken files are not tried again");
});

test("the sound test plays ticks speeding up, then the steady tone, then stops", () => {
  const S = load(), w = win(), p = new S.Player({ win: w });
  assert.equal(p.demo("file"), "file");
  assert.deepEqual(w.timers.map((x) => x.ms), [380, 640, 840, 1000, 1600]);
  run(w);
  assert.deepEqual(w.log.filter((l) => l.startsWith("play")), [
    "play sounds/tick.wav", "play sounds/tick.wav", "play sounds/tick.wav", "play sounds/tick.wav", "play sounds/shift.wav",
  ]);
  assert.equal(w.log.at(-1), "pause sounds/shift.wav");
});

test("the RX-7 buzzer: no ticks, the buzzer file at the shift point, pause to stop it", () => {
  const S = load(), w = win(), p = new S.Player({ base: "sounds/", win: w });
  assert.equal(p.tick("rx7"), "none", "no warning ticks on this route");
  assert.deepEqual(w.log, [], "and nothing plays for them");
  assert.equal(p.start("rx7"), "file");
  p.stop();
  assert.deepEqual(w.log, ["play sounds/rx7.wav", "pause sounds/shift.wav", "pause sounds/rx7.wav"]);
  assert.equal(w.els.filter((el) => el.src.endsWith("shift.wav")).length, 1, "the steady tone is not played on this route");
  // The buzzer file is only fetched once it is used: the other routes never create it.
  const other = win(), q = new S.Player({ win: other });
  q.tick("file"); q.start("file"); q.stop();
  assert.equal(other.els.some((el) => el.src.endsWith("rx7.wav")), false);
});

test("the RX-7 buzzer falls back to the repeated Mazda beep when its file cannot play", () => {
  const S = load();
  const w = win({ playThrows: true }), p = new S.Player({ win: w });
  assert.equal(p.start("rx7"), "beep");
  assert.equal(w.timers.at(-1).ms, 120);
  const none = win({ wav: "", beep: false }), q = new S.Player({ win: none });
  assert.equal(q.start("rx7"), "none");
  // A buzzer file that fails to load after play() gets the Mazda beep too.
  const x = win(), r = new S.Player({ win: x });
  assert.equal(r.start("rx7"), "file");
  x.els.find((el) => el.src.endsWith("rx7.wav")).handlers.error();
  assert.equal(r.last, "beep");
});

test("the sound test on the RX-7 route: the buzzer at once for 0.9 s, no ticks", () => {
  const S = load(), w = win(), p = new S.Player({ win: w });
  assert.equal(p.demo("rx7"), "file");
  assert.deepEqual(w.timers.map((x) => x.ms), [900]);
  assert.equal(p.last, "file", "the result is known at once, for the screen");
  run(w);
  assert.deepEqual(w.log.filter((l) => l.startsWith("play")), ["play sounds/rx7.wav"]);
  assert.equal(w.log.at(-1), "pause sounds/rx7.wav");
});

test("no Audio at all and a parent that cannot be read", () => {
  const S = load(), w = {};
  Object.defineProperty(w, "parent", { get() { throw Error("cross-origin"); } });
  const p = new S.Player({ win: w });
  assert.equal(p.tick("file"), "none");
  assert.equal(p.start("file"), "none");
  assert.equal(p.demo("file"), "none");
  assert.equal(p.demo("rx7"), "none");
});

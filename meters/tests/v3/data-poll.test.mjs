// meters/js/data.js reading live.txt: the collector rewrites the file in place with LiveSeq as its last line, so a poll
// can catch it halfway through a write (empty, or cut anywhere). Such a read must change nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../../js/data.js", import.meta.url), "utf8");

function load() {
  const box = { window: {}, Date };
  vm.runInNewContext(source, box);
  return box.window.MeterData;
}

const file = (seq, speed, rpm) =>
  `VehicleSpeed=${speed}\nEngineSpeed=${rpm}\nEngClnt_Te_Actl=129\nLiveSeq=${seq}\n`;

test("a complete poll read is taken", () => {
  const d = load();
  d.ingestText(file(97, 12256, 1604), true);
  assert.equal(d.target.speed, 122.56);
  assert.equal(d.target.rpm, 3208);
  assert.equal(d.target.coolant, 89);
  assert.notEqual(d.lastData, 0);
});

test("every cut of a write is skipped, whatever its length", () => {
  const text = file(98, 13000, 1700);
  for (let n = 0; n < text.length; n++) {
    const d = load();
    d.ingestText(file(97, 12256, 1604), true);
    const before = JSON.stringify(d.target), at = d.lastData;
    d.ingestText(text.slice(0, n), true);
    assert.equal(JSON.stringify(d.target), before, `cut after ${n} bytes changed the values`);
    assert.equal(d.lastData, at, `cut after ${n} bytes counted as fresh data`);
  }
});

test("a torn LiveSeq line is not mistaken for a whole one", () => {
  const d = load();
  d.ingestText(file(97, 12256, 1604), true);
  d.ingestText("VehicleSpeed=13000\nEngineSpeed=17\nLiveSeq=9", true);   // "LiveSeq=98\n" cut short
  assert.equal(d.target.rpm, 3208);
});

test("the next complete write after a cut one is taken", () => {
  const d = load();
  d.ingestText(file(97, 12256, 1604), true);
  d.ingestText("VehicleSpeed=13", true);
  d.ingestText(file(98, 13000, 1700), true);
  assert.equal(d.target.speed, 130);
  assert.equal(d.target.rpm, 3400);
});

test("CRLF files and websocket messages without LiveSeq still work", () => {
  const d = load();
  d.ingestText("VehicleSpeed=5000\r\nLiveSeq=3\r\n", true);
  assert.equal(d.target.speed, 50);
  d.ingestText("EngineSpeed=1000");                                  // ws: one message, no completeness rule
  assert.equal(d.target.rpm, 2000);
});

test("the poll source asks for complete reads", () => {
  assert.match(source, /ingestText\(x\.responseText, true\)/);
});

// Poll watchdog: a request that never completes must not stop the polling for good.
function loadPoll() {
  let clock = 1000, tick = null;
  const requests = [];
  class XHR {
    constructor() { this.readyState = 0; this.status = 0; this.responseText = ""; this.aborted = false; requests.push(this); }
    open() {}
    send() {}
    abort() { this.aborted = true; }
    finish(text) { this.readyState = 4; this.status = 200; this.responseText = text; this.onreadystatechange(); }
  }
  const box = {
    window: { XMLHttpRequest: XHR, location: { protocol: "http:" } },
    Date: { now: () => clock },
    setInterval: (fn) => { tick = fn; },
  };
  vm.runInNewContext(source, box);
  const d = box.window.MeterData;
  d.start("poll:live.txt");
  return { d, requests, tick: () => tick(), advance: (ms) => { clock += ms; } };
}

test("a hung request is aborted after 2 s and a new one is started", () => {
  const p = loadPoll();
  assert.equal(p.requests.length, 1);
  p.advance(1900); p.tick();
  assert.equal(p.requests.length, 1, "still waiting before the watchdog time");
  p.advance(200); p.tick();
  assert.equal(p.requests.length, 2);
  assert.equal(p.requests[0].aborted, true);
  p.requests[1].finish(file(5, 12256, 1604));
  assert.equal(p.d.target.speed, 122.56);
});

test("a late callback of an aborted request is ignored and keeps the newer request busy", () => {
  const p = loadPoll();
  p.advance(2100); p.tick();
  assert.equal(p.requests.length, 2);
  p.requests[0].finish(file(6, 1000, 1000));          // late answer of the aborted one
  assert.equal(p.d.target.speed, undefined);
  p.tick();
  assert.equal(p.requests.length, 2, "newer request is still in flight, no third one");
  p.requests[1].finish(file(7, 13000, 1700));
  assert.equal(p.d.target.speed, 130);
  p.tick();
  assert.equal(p.requests.length, 3);
});

test("an abort that throws does not stop the watchdog", () => {
  const p = loadPoll();
  p.requests[0].abort = () => { throw new Error("nope"); };
  p.advance(2500); p.tick();
  assert.equal(p.requests.length, 2);
});

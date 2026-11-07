// SPDX-License-Identifier: GPL-3.0-or-later
import { signals, clone } from "./model.mjs";
export function formatTime(milliseconds) {
  const tenths = Math.floor(Math.max(0, Math.round(milliseconds)) / 100);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}.${tenths % 10}`;
}
export class Simulator {
  constructor(seed = 17) {
    this.seed = seed;
    this.running = true;
    this.scenario = "acceleration";
    this.manual = {};
    this.unavailable = new Set();
    this.recording = null;
    this.replay = null;
    this.reset();
  }
  reset() {
    this.time = 0;
    this.history = [];
    this.lapStart = 0;
    this.lastLapMs = null;
    this.bestLapMs = null;
    this.deltaMs = null;
    this.laps = 0;
    this.maxSpeed = 0;
    this.maxG = 0;
    this.peakG = null;
    this.maxRpm = 0;
    this.lastSample = -1;
    this.state = { time: 0, history: [], lap: "0:00.0" };
  }
  event(kind, value) {
    if (this.recording && this.time - this.recording.start <= 300)
      this.recording.events.push({
        time: this.time - this.recording.start,
        kind,
        value: clone(value),
      });
  }
  setScenario(value) {
    if (
      ![
        "idle",
        "acceleration",
        "braking",
        "high RPM",
        "warnings",
        "missing",
      ].includes(value)
    )
      throw Error("Unknown scenario");
    this.scenario = value;
    this.event("scenario", value);
  }
  setManual(signal, value) {
    if (!signals[signal] || (value !== null && !Number.isFinite(value)))
      throw Error("Invalid manual value");
    if (value === null) this.unavailable.add(signal);
    else {
      this.unavailable.delete(signal);
      this.manual[signal] = value;
    }
    this.event("manual", { signal, value });
  }
  clearManual() {
    this.manual = {};
    this.unavailable.clear();
    this.event("clear", null);
  }
  sample(v) {
    const t = this.time + (this.replay?.offset ?? 0),
      cycle = (t + this.seed / 100) % 12,
      gear = Math.min(6, 1 + Math.floor(cycle / 2));
    let speed = 20 + cycle * 13,
      rpm = 1000 + ((cycle % 2) / 2) * (v.rpm.limit - 1200),
      gLong = 0.2,
      gLat = Math.sin(t * 0.7) * 0.65;
    if (this.scenario === "idle") {
      speed = 0;
      rpm = 850;
      gLong = gLat = 0;
    }
    if (this.scenario === "braking") {
      const f = (t % 8) / 8;
      speed = 140 * (1 - f);
      rpm = Math.max(850, 6500 * (1 - f));
      gLong = -0.5;
      gLat = Math.sin(t) * 0.45;
    }
    // Acceleration through the gears: each gear pulls from where the last upshift landed to the
    // shift point, and speed follows from the vehicle's gearing (when it is known).
    const ratios = v.ratios ?? [],
      perKmh = (g) =>
        Number.isFinite(ratios[g - 1]) &&
        Number.isFinite(v.finalDrive) &&
        v.circumference > 0
          ? (ratios[g - 1] * v.finalDrive * 60) / (v.circumference * 3.6)
          : null;
    if (
      !["idle", "braking"].includes(this.scenario) &&
      perKmh(gear) &&
      (gear === 1 || perKmh(gear - 1))
    ) {
      const top = v.rpm.shift,
        low = gear === 1 ? 1500 : (top * perKmh(gear)) / perKmh(gear - 1),
        f = (cycle % 2) / 2;
      rpm = low + f * (top - low);
      speed = Math.min(rpm / perKmh(gear), 220);
      rpm = speed * perKmh(gear);
    }
    if (this.scenario === "high RPM")
      rpm = Math.min(v.rpm.limit - 20, v.rpm.shift + 80);
    const ps = Math.max(0, (rpm / Math.max(1, v.rpm.max)) * 140);
    const values = {
      speed,
      rpm,
      gear,
      coolant: this.scenario === "warnings" ? 115 : 90,
      iat: 32,
      outside: 18,
      fuel: this.scenario === "warnings" ? 10 : 70,
      trip: t / 80,
      consumption: 6.5 + Math.sin(t * 0.3),
      gLat,
      gLong,
      throttle:
        this.scenario === "braking" ? 0 : this.scenario === "idle" ? 0 : 95,
      power: ps,
      torque: rpm > 500 ? (ps * 0.73549875 * 9549) / rpm : 0,
      ...this.manual,
    };
    for (const signal of this.unavailable) values[signal] = null;
    if (this.scenario === "missing")
      for (const signal of Object.keys(signals)) values[signal] = null;
    return values;
  }
  step(dt, v, { force = false } = {}) {
    if (!this.running && !force) return this.state;
    if (this.replay)
      dt = Math.min(dt, Math.max(0, this.replay.duration - this.time));
    if (this.running) this.time += Math.max(0, dt);
    if (this.replay) {
      while (
        this.replay.index < this.replay.events.length &&
        this.replay.events[this.replay.index].time <= this.time
      ) {
        const e = this.replay.events[this.replay.index++];
        if (e.kind === "scenario") this.scenario = e.value;
        if (e.kind === "manual") {
          if (e.value.value === null) this.unavailable.add(e.value.signal);
          else {
            this.manual[e.value.signal] = e.value.value;
            this.unavailable.delete(e.value.signal);
          }
        }
        if (e.kind === "lap" || e.kind === "reset") {
          const now = this.time;
          this.time = e.time;
          e.kind === "lap" ? this.lap() : this.resetSession();
          this.time = now;
        }
        if (e.kind === "clear") {
          this.manual = {};
          this.unavailable.clear();
        }
      }
    }
    const values = this.sample(v),
      valid = this.scenario !== "missing";
    if (this.running && !valid) this.lapStart += Math.max(0, dt);
    if (this.running && valid) {
      if (Number.isFinite(values.gLat) && Number.isFinite(values.gLong))
        if (Math.hypot(values.gLat, values.gLong) > this.maxG) {
          this.maxG = Math.hypot(values.gLat, values.gLong);
          this.peakG = { gLat: values.gLat, gLong: values.gLong };
        }
      if (Number.isFinite(values.speed))
        this.maxSpeed = Math.max(this.maxSpeed, values.speed);
      if (Number.isFinite(values.rpm))
        this.maxRpm = Math.max(this.maxRpm, values.rpm);
    }
    if (this.running && this.time - this.lastSample >= 0.099) {
      this.history.push({ time: this.time, ...values });
      this.lastSample = this.time;
      while (
        this.history.length > 1200 ||
        (this.history.length &&
          this.history[0].time < this.time - (this.windowLimit ?? 120))
      )
        this.history.shift();
    }
    this.state = {
      ...values,
      time: this.time,
      history: this.history,
      vehicle: v,
      lap: valid ? formatTime((this.time - this.lapStart) * 1000) : "—",
      lastLap: this.lastLapMs === null ? "—" : formatTime(this.lastLapMs),
      bestLap: this.bestLapMs === null ? "—" : formatTime(this.bestLapMs),
      delta:
        this.deltaMs === null
          ? "—"
          : `${this.deltaMs > 0 ? "+" : ""}${(this.deltaMs / 1000).toFixed(1)}`,
      maxSpeed: this.maxSpeed,
      maxG: this.maxG,
      peakG: this.peakG,
      maxRpm: this.maxRpm,
      laps: this.laps,
    };
    if (this.replay && this.time >= this.replay.duration) this.running = false;
    if (this.recording && this.time - this.recording.start >= 300)
      this.stopRecording();
    return this.state;
  }
  lap() {
    if (!this.running || this.scenario === "missing") return false;
    const ms = Math.round((this.time - this.lapStart) * 1000);
    if (ms < 5000) return false;
    this.lastLapMs = ms;
    this.deltaMs = this.bestLapMs === null ? null : ms - this.bestLapMs;
    this.bestLapMs =
      this.bestLapMs === null ? ms : Math.min(this.bestLapMs, ms);
    this.laps++;
    this.lapStart = this.time;
    this.event("lap", null);
    return true;
  }
  resetSession() {
    this.event("reset", null);
    this.history = [];
    this.lastSample = -1;
    this.lapStart = this.time;
    this.lastLapMs = this.bestLapMs = this.deltaMs = null;
    this.laps = this.maxSpeed = this.maxRpm = this.maxG = 0;
    this.peakG = null;
  }
  startRecording() {
    this.recording = {
      version: 1,
      kind: "MetersRecording",
      seed: this.seed,
      offset: this.time,
      track: {
        lapStart: this.lapStart - this.time,
        lastLapMs: this.lastLapMs,
        bestLapMs: this.bestLapMs,
        deltaMs: this.deltaMs,
        laps: this.laps,
        maxSpeed: this.maxSpeed,
        maxRpm: this.maxRpm,
        maxG: this.maxG,
        peakG: this.peakG,
        lastSample: this.lastSample - this.time,
        history: this.history.map((s) => ({ ...s, time: s.time - this.time })),
      },
      start: this.time,
      scenario: this.scenario,
      manual: clone(this.manual),
      unavailable: [...this.unavailable],
      events: [],
    };
  }
  stopRecording() {
    if (!this.recording) return this.lastRecording;
    const r = this.recording;
    this.lastRecording = { ...r, duration: Math.min(300, this.time - r.start) };
    delete this.lastRecording.start;
    this.recording = null;
    return this.lastRecording;
  }
  playRecording(r) {
    if (
      r?.kind !== "MetersRecording" ||
      r.version !== 1 ||
      !Number.isFinite(r.duration) ||
      r.duration < 0 ||
      r.duration > 300 ||
      !Array.isArray(r.events) ||
      r.events.length > 10000
    )
      throw Error("Invalid recording");
    if (
      !Number.isFinite(r.seed) ||
      !Number.isFinite(r.offset ?? 0) ||
      ![
        "idle",
        "acceleration",
        "braking",
        "high RPM",
        "warnings",
        "missing",
      ].includes(r.scenario) ||
      !r.manual ||
      !Array.isArray(r.unavailable) ||
      r.unavailable.some((k) => !signals[k]) ||
      Object.entries(r.manual).some(
        ([k, v]) => !signals[k] || !Number.isFinite(v),
      )
    )
      throw Error("Invalid initial recording state");
    for (const e of r.events) {
      if (
        !Number.isFinite(e.time) ||
        e.time < 0 ||
        e.time > r.duration ||
        !["scenario", "manual", "clear", "lap", "reset"].includes(e.kind)
      )
        throw Error("Invalid recording event");
      if (
        e.kind === "manual" &&
        (!signals[e.value?.signal] ||
          (e.value.value !== null && !Number.isFinite(e.value.value)))
      )
        throw Error("Invalid recorded value");
      if (
        e.kind === "scenario" &&
        ![
          "idle",
          "acceleration",
          "braking",
          "high RPM",
          "warnings",
          "missing",
        ].includes(e.value)
      )
        throw Error("Invalid recorded scenario");
    }
    let track = null;
    if (r.track) {
      track = clone(r.track);
      if (
        !Array.isArray(track.history) ||
        track.history.length > 1200 ||
        ["lapStart", "lastSample", "laps", "maxSpeed", "maxRpm", "maxG"].some(
          (k) => !Number.isFinite(track[k]),
        ) ||
        track.history.some(
          (s) =>
            !Number.isFinite(s.time) ||
            Object.entries(s).some(
              ([k, v]) =>
                k !== "time" &&
                (!signals[k] || (v !== null && !Number.isFinite(v))),
            ),
        )
      )
        throw Error("Invalid recorded track state");
      for (const k of ["lastLapMs", "bestLapMs", "deltaMs"])
        if (track[k] !== null && !Number.isFinite(track[k]))
          throw Error("Invalid recorded lap state");
      if (
        track.peakG &&
        (!Number.isFinite(track.peakG.gLat) ||
          !Number.isFinite(track.peakG.gLong))
      )
        throw Error("Invalid recorded G peak");
    }
    this.reset();
    if (track) {
      for (const k of [
        "lapStart",
        "lastSample",
        "laps",
        "maxSpeed",
        "maxRpm",
        "maxG",
        "lastLapMs",
        "bestLapMs",
        "deltaMs",
        "history",
        "peakG",
      ])
        this[k] = track[k];
    }
    this.seed = r.seed;
    this.scenario = r.scenario;
    this.manual = clone(r.manual);
    this.unavailable = new Set(r.unavailable);
    this.replay = {
      ...clone(r),
      index: 0,
      events: [...r.events].sort((a, b) => a.time - b.time),
    };
    this.running = true;
  }
}

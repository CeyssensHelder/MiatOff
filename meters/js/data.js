/* MiatOff Meters — data layer. ES5 only: the CMU runs an old Opera (Presto).
 *
 * Every gauge reads a *channel* (speed, rpm, ...). A channel maps to one smdb field (docs/13).
 * Raw-to-unit scaling lives in the table below and nowhere else.
 *
 * This page never reads smdb itself. A separate collector feeds it. Do not build that collector by spawning
 * smdb-read in a loop, and never kill one: on this car/firmware that is suspected of locking SMDB and
 * making the Service Manager reset the CMU (docs/13).
 *
 * Sources (pick with ?src=...):
 *   sim                 built-in driving simulator (default)
 *   ws://host:port      websocket; each message is JSON {"Field": value} or lines "Field=value" / "Field#value"
 *   poll:<url>          XHR every 100 ms on a file/URL with the same text format (e.g. poll:live.txt); line text
 *                       must end with a "LiveSeq=<n>" line, or the read is taken as half-written and skipped
 */
(function (W) {
    'use strict';

    var G = 9.80665;   // m/s² per g

    // Scales from public signal definitions (opendbc Ford/Mazda DBCs, MZD_Speedometer), checked against the 122 km/h
    // drive of 27-10-2026; see docs/13 "Schalen uit openbare bronnen". Still unknown: BrakePressure, DR_Slope.
    // Sign convention on the page: gLat and yaw positive = turning RIGHT; gLong positive = accelerating.
    // invalid: raw value the CMU uses for "no data" on this car; it is dropped so the gauge shows "--".
    //   key         smdb field                    namespace               scale  offset  discrete invalid
    var CHANNELS = [
        ['speed',    'VehicleSpeed',               'vdm_vdt_current_data', 0.01,  0],              // ×0.01 km/h?
        ['rpm',      'EngineSpeed',                'vdm_vdt_current_data', 2,     0],              // ×2 rpm? (idle 355)
        ['gear',     'TransmissionGearPosition',   'vdm_vdt_current_data', 1,     0,     true, 0], // 0 on ND1 MT: app derives gear
        ['clutch',   'DR_ClutchSW',                'vdm_vdt_current_data', 1,     0,     true],
        ['throttle', 'AccelPedalPosition',         'vdm_vdt_current_data', 0.1,   0],              // ×0.1 % (opendbc ApedPos_Pc_ActlArb)
        ['brake',    'BrakePressure',              'vdm_vdt_current_data', 1,     0],              // relative
        ['steer',    'SteeringWheel',              'vdm_vdt_current_data', 1,     0,     false, 32766], // invalid on ND1
        ['gLat',     'LateralAcceleration',        'vdm_vdt_current_data', -0.01 / G, 40 / G],     // m/s² = ×0.01 − 40 (opendbc); raw + = left (provisional), flipped: + = right
        ['gLong',    'LongitudinalAccelerometer',  'vdm_vdt_current_data', 0.01 / G, -40 / G],     // m/s² = ×0.01 − 40, + = accelerating (opendbc)
        ['yaw',      'YawRate',                    'vdm_vdt_current_data', -0.03663, 75],          // deg/s (MZD_Speedometer / opendbc); raw + = left (provisional), flipped: + = right
        ['load',     'EngineLoad',                 'vdm_vdt_current_data', 1,     0],              // reads 0 on ND1
        ['coolant',  'EngClnt_Te_Actl',            'vdm_vdt_current_data', 1,     -40],
        ['iat',      'DR_IntakeAirTemp',           'vdm_vdt_current_data', 1,     -40],
        ['outside',  'Out-CarTemperature',         'vdm_vdt_current_data', 1,     -40],
        ['battery',  'Battery_StateOfCharge',      'vdm_vdt_current_data', 1,     0],              // reads 0 on ND1
        ['fuel',     'FuelGaugePosition',          'vdm_vdt_current_data', 100 / 181, 0],          // full ≈ 181 (MZD_Speedometer says 184), not linear in litres
        ['slope',    'DR_Slope',                   'vdm_vdt_current_data', 1,     0],              // live, scale unknown
        ['trip',     'PID_Drv1Dstnc_curr',         'vdm',                  1,     0],
        ['econ',     'Drv1AvlFuelE',               'vdm',                  1,     0]
    ];

    var byKey = {}, byField = {}, i, c;
    for (i = 0; i < CHANNELS.length; i++) {
        c = CHANNELS[i];
        c = { key: c[0], field: c[1], ns: c[2], scale: c[3], offset: c[4], discrete: !!c[5], invalid: c[6] };
        CHANNELS[i] = c;
        byKey[c.key] = c;
        byField[c.field] = c;
    }

    var D = {
        CHANNELS: CHANNELS,
        target: {},          // latest value per channel, already scaled
        lastData: 0,         // ms timestamp of the last update
        interval: 1.0,       // running average of seconds between updates
        sourceName: '-',
        live: false
    };

    function markData() {
        var now = Date.now();
        if (D.lastData) {
            var gap = (now - D.lastData) / 1000;
            if (gap < 5) D.interval = D.interval * 0.8 + gap * 0.2;
        }
        D.lastData = now;
    }

    var lastSeq = null;

    // Accepts raw smdb field names (scaled) or channel keys (taken as-is).
    function ingest(obj) {
        var name, ch, n, any = false;
        // The collector bumps LiveSeq on every write. Polling the same file again is not new data, and a
        // LiveSeq that stops rising means the vehicle signals stopped: let the page go stale.
        if (obj.hasOwnProperty('LiveSeq')) {
            if (obj.LiveSeq === lastSeq) return;
            lastSeq = obj.LiveSeq;
        }
        for (name in obj) {
            if (!obj.hasOwnProperty(name)) continue;
            n = parseFloat(obj[name]);
            if (isNaN(n)) continue;
            ch = byField[name];
            if (ch) {
                if (n === ch.invalid) continue;
                D.target[ch.key] = n * ch.scale + ch.offset;
            } else if (byKey[name]) {
                D.target[name] = n;
            } else {
                continue;
            }
            any = true;
        }
        if (any) markData();
    }

    var LINE = /^\s*([^=#:\s]+)\s*[=#:\s]\s*(-?[0-9.]+)/;
    // The collector rewrites live.txt in place with LiveSeq as its last line (no tmp + mv: forking mv ten times a
    // second made it fall behind on the car). A read that does not end with that whole line, newline included,
    // caught a write halfway.
    var WHOLE = /(^|\n)LiveSeq=[0-9]+\r?\n$/;

    // whole: the text is a file that may be read halfway through a write (poll); skip it unless it is complete.
    function ingestText(s, whole) {
        if (!s) return;
        s = String(s);
        if (s.replace(/^\s+/, '').charAt(0) === '{') {
            try { ingest(JSON.parse(s)); } catch (e) { /* half-written file: next poll */ }
            return;
        }
        if (whole && !WHOLE.test(s)) return;
        var lines = s.split(/\r?\n/), obj = {}, m, k;
        for (k = 0; k < lines.length; k++) {
            m = LINE.exec(lines[k]);
            if (m) obj[m[1]] = m[2];
        }
        ingest(obj);
    }

    // ------------------------------------------------------------------ car profile
    // The car chosen in the designer's car setup (js/car-profile.js, written by the builder), or null. Each part is
    // used only when it is complete and sane; anything else keeps the ND1 1.5 values. Shared with app.js (which loads
    // after this file), so the simulator and the gauges always agree on which parts of a profile count. Never throws:
    // this runs at load for every source, the car's live poll included.
    function isInt(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x; }
    function isPos(x) { return typeof x === 'number' && isFinite(x) && x > 0; }
    function isList(x) { return Object.prototype.toString.call(x) === '[object Array]'; }
    function carProfile(p) {
        if (!p || typeof p !== 'object') return null;
        var r = p.rpm, out = {}, k;
        if (r && isInt(r.amber) && isInt(r.red) && isInt(r.shift) && isInt(r.limit) && isInt(r.max) &&
                1000 < r.amber && r.amber <= r.red && r.red <= r.shift && r.shift <= r.limit && r.limit <= r.max &&
                r.max <= 15000)
            out.rpm = { amber: r.amber, red: r.red, shift: r.shift, limit: r.limit, max: r.max };
        if (isList(p.ratios) && p.ratios.length && p.ratios.every(isPos) && isPos(p.finalDrive) && isPos(p.circumference))
            out.gearing = { ratios: p.ratios, finalDrive: p.finalDrive, circumference: p.circumference };
        if (isPos(p.ratedPower) && isPos(p.powerRpm) && isPos(p.ratedTorque) && isPos(p.torqueRpm))
            out.power = { ps: p.ratedPower, psRpm: p.powerRpm, nm: p.ratedTorque, nmRpm: p.torqueRpm };
        out.label = typeof p.label === 'string' ? p.label : '';
        out.units = p.units && typeof p.units === 'object' ? p.units : null;
        // The built-in styles with the shift sound on, chosen in the MiatOff app (custom pages carry their own).
        out.shiftSound = {};
        if (isList(p.shiftSound)) {
            for (k = 0; k < p.shiftSound.length; k++) if (typeof p.shiftSound[k] === 'string') out.shiftSound[p.shiftSound[k]] = true;
        }
        return out;
    }
    D.carProfile = carProfile;

    // ------------------------------------------------------------------ simulator
    // A 1.5 ND1 lapping an imaginary circuit: pull through the gears, brake, corner, repeat. Another car's profile
    // brings its own gearing and rev limits, or the gauges would show the wrong gear and rev past its limiter.
    // A preview on the PC only: the car runs Meters with ?src=poll:live.txt.
    var RATIO = [0, 5.087, 2.991, 2.035, 1.594, 1.286, 1.000], FINAL = 2.866, CIRC = 1.89;
    // Upshift halfway between the shift point and the limiter (7200 and 7500), but at least LIMIT_GAP below the
    // limiter so the lag of one step and the rpm noise stay under it; in the lap's top gear, brake at 6/7 of that.
    var LIMIT_GAP = 100, SHIFT = 7350, LIFT = 6300;
    var SIM_CAR = carProfile(W.MeterCarProfile) || {};
    if (SIM_CAR.gearing) {
        RATIO = [0].concat(SIM_CAR.gearing.ratios); FINAL = SIM_CAR.gearing.finalDrive; CIRC = SIM_CAR.gearing.circumference;
    }
    if (SIM_CAR.rpm) {
        SHIFT = Math.min((SIM_CAR.rpm.shift + SIM_CAR.rpm.limit) / 2, SIM_CAR.rpm.limit - LIMIT_GAP);
        LIFT = SHIFT * 6 / 7;
    }
    // Full-throttle torque curve shaped like the 1.5's specs (150 Nm at 4800, 131 PS at 7000), so the
    // estimated power on the POWER page has something realistic to recover. Mass and curve stay the ND1's for
    // every profile.
    var TQ = [[0, 90], [1000, 100], [2000, 122], [3000, 135], [4000, 145], [4800, 150], [5500, 148],
              [6000, 145], [6500, 140], [7000, 134], [7500, 122], [8000, 100]];
    var MASS = 1050;   // kg
    // A gear of another car may be too tall to reach its shift point with this engine. It ends once its pull has
    // fallen below MIN_PULL (m/s²) and to half the best it gave: the ND1 1.5 never gets that low (about 1 m/s² at the
    // end of 4th), and a tall first gear that starts weak is still free to pull away.
    var MIN_PULL = 0.5;
    function torqueAt(r) {
        for (var i = 1; i < TQ.length; i++) {
            if (r <= TQ[i][0]) return TQ[i - 1][1] + (TQ[i][1] - TQ[i - 1][1]) * (r - TQ[i - 1][0]) / (TQ[i][0] - TQ[i - 1][0]);
        }
        return TQ[TQ.length - 1][1];
    }
    // Acceleration (m/s²) at full throttle in gear g at speed v (m/s) with the engine at rpm r: 85 % driveline,
    // CdA 0.55, Crr 0.012, wheel radius from the circumference.
    function pullAt(r, g, v) {
        return (torqueAt(r) * RATIO[g] * FINAL * 0.85 / (CIRC / (2 * Math.PI))
            - 0.33 * v * v - 0.012 * MASS * 9.81) / MASS;
    }

    function Sim(hz) {
        this.period = 1 / (hz || 10);
        this.acc = 0;
        this.v = 0; this.gear = 1; this.rpm = 850;
        this.phase = 'accel'; this.pt = 0; this.lap = 0; this.dir = 1;
        this.a = 0; this.best = 0; this.lat = 0; this.steer = 0; this.thr = 0; this.brk = 0;
        this.coolant = 62; this.fuel = 71; this.trip = 128.4; this.econ = 6.8; this.t = 0;
    }
    Sim.prototype.rpmFor = function (v, g) {
        return Math.max(850, v / CIRC * 60 * RATIO[g] * FINAL);
    };
    Sim.prototype.step = function (dt) {
        var s = this, topGear = Math.min((s.lap % 2) ? 4 : 3, RATIO.length - 1), k;   // a car may have fewer gears
        s.t += dt;
        if (s.phase === 'accel') {
            s.thr = 100; s.brk = 0; s.lat = 0; s.steer *= 0.9;
            s.a = pullAt(s.rpm, s.gear, s.v);
            s.best = Math.max(s.best, s.a);   // the most this gear has pulled since it went in
            if (s.rpm > (s.gear < topGear ? SHIFT : LIFT)) {   // shift late, like on track
                if (s.gear < topGear) { s.phase = 'shift'; s.pt = 0.35; s.gear++; }
                else { s.phase = 'brake'; }
            } else if (s.a < MIN_PULL && s.a < s.best / 2) {
                // Out of pull before the shift point: the next gear only if it pulls harder at this speed (it does
                // when the revs are past the curve, not when drag is what holds the car back), or else brake.
                if (s.gear < topGear && pullAt(s.rpmFor(s.v, s.gear + 1), s.gear + 1, s.v) > s.a) {
                    s.phase = 'shift'; s.pt = 0.35; s.gear++;
                } else { s.phase = 'brake'; }
            }
            if (s.phase !== 'accel') s.best = 0;
        } else if (s.phase === 'shift') {
            s.thr = 0; s.a = -0.4; s.pt -= dt;
            if (s.pt <= 0) s.phase = 'accel';
        } else if (s.phase === 'brake') {
            s.thr = 0; s.brk = 78; s.a = -8.6;
            if (s.rpmFor(s.v, s.gear) < 2900 && s.gear > 2) s.gear--;
            if (s.v < 12) { s.phase = 'corner'; s.pt = 5; }
        } else if (s.phase === 'corner') {
            k = Math.sin(Math.PI * (5 - s.pt) / 5);
            s.thr = 25 + 30 * k; s.brk = 0; s.a = 0.3;
            s.lat = 0.92 * k * s.dir; s.steer = 110 * k * s.dir;
            s.pt -= dt;
            if (s.pt <= 0) { s.phase = 'accel'; s.dir = -s.dir; s.lap++; }
        }
        s.v = Math.max(0, s.v + s.a * dt);
        var want = s.phase === 'shift' ? s.rpmFor(s.v, s.gear) * 1.05 : s.rpmFor(s.v, s.gear);
        s.rpm += (want - s.rpm) * Math.min(1, dt * 12);
        s.coolant += (91 - s.coolant) * dt * 0.02;
        s.fuel = Math.max(0, s.fuel - dt * 0.002 * (1 + s.thr / 50));
        s.trip += s.v * dt / 1000;
        s.econ += ((4.5 + s.thr * 0.09) - s.econ) * dt * 0.01;

        s.acc += dt;
        if (s.acc < s.period) return;
        s.acc = 0;
        function n(x) { return (Math.random() - 0.5) * x; }
        ingest({
            speed: s.v * 3.6, rpm: s.rpm + n(30), gear: s.gear, clutch: s.phase === 'shift' ? 1 : 0,
            throttle: s.thr, brake: s.brk, steer: s.steer + n(2),
            gLat: s.lat + n(0.04), gLong: s.a / 9.81 + n(0.04),
            yaw: s.v > 1 ? s.lat * 9.81 / s.v * 57.3 : 0,
            load: Math.min(100, 8 + s.thr * 0.9 + n(3)),
            coolant: s.coolant, iat: 31 + s.thr * 0.04 + n(0.3), outside: 17.5,
            battery: 84 + n(0.5), fuel: s.fuel, slope: 2.5 * Math.sin(s.t / 9),
            trip: s.trip, econ: s.econ
        });
    };

    // ------------------------------------------------------------------ live sources
    function WsSource(url) {
        var ws = null;
        function connect() {
            try { ws = new W.WebSocket(url); } catch (e) { setTimeout(connect, 3000); return; }
            ws.onmessage = function (ev) { ingestText(ev.data); };
            ws.onclose = function () { setTimeout(connect, 3000); };
        }
        connect();
    }

    function PollSource(url) {
        var busy = false, cur = null, startedAt = 0;
        function poll() {
            if (busy) {
                // Watchdog: a request that never completes must not stop the gauges until a reload.
                if (Date.now() - startedAt < 2000) return;
                var old = cur;
                cur = null;          // its late callback is now ignored
                busy = false;
                try { old.abort(); } catch (e) { /* nothing to abort */ }
            }
            busy = true;
            startedAt = Date.now();
            var x = new W.XMLHttpRequest();
            cur = x;
            x.onreadystatechange = function () {
                if (x !== cur || x.readyState !== 4) return;   // aborted and replaced: not ours any more
                busy = false;
                cur = null;
                // file:// answers with status 0
                if (x.status === 200 || (x.status === 0 && x.responseText)) ingestText(x.responseText, true);
            };
            try {
                // Cache-buster only over HTTP: on file:// a query string may become part of the file name.
                x.open('GET', /^https?:/.test(W.location.protocol) && !/^file:/.test(url)
                    ? url + (url.indexOf('?') < 0 ? '?' : '&') + '_=' + Date.now() : url, true);
                x.send(null);
            } catch (e) { busy = false; cur = null; }
        }
        setInterval(poll, 100);    // VBS signals arrive at 6-10 Hz
        poll();
    }

    var sim = null;

    D.start = function (src) {
        src = src || 'sim';
        if (src === 'sim' || src.indexOf('sim:') === 0) {
            sim = new Sim(parseFloat(src.split(':')[1]) || 10);
            D.sourceName = 'SIM';
        } else if (/^wss?:\/\//.test(src)) {
            WsSource(src); D.sourceName = 'LIVE'; D.live = true;
        } else if (src.indexOf('poll:') === 0) {
            PollSource(src.substr(5)); D.sourceName = 'LIVE'; D.live = true;
        }
    };

    D.tick = function (dt) { if (sim) sim.step(dt); };

    D.stale = function () { return !D.lastData || Date.now() - D.lastData > 3000; };

    D.discrete = function (key) { return byKey[key] && byKey[key].discrete; };

    D.ingest = ingest;
    D.ingestText = ingestText;

    W.MeterData = D;
})(window);

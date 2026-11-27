/* MiatOff Meters — shift sound: beeps that speed up towards the shift point, then a steady tone. ES5 only.
 *
 * Like the progressive shift beepers of aftermarket tachometers: from the amber line short ticks whose gap shrinks
 * as the rpm climbs (450 ms at amber, 110 ms just below the shift point), then a steady tone at the shift point that
 * stops at the upshift (the rpm falls RELEASE below its highest point since the tone began) or after HOLD_MAX. After
 * the tone it stays quiet, the limiter included, until the rpm is below the amber line and at least REARM below where
 * the tone began. Only while driving (above 5 km/h) on live data.
 *
 * Early tone: both stages use the rpm LEAD ms ahead, predicted from how fast the raw rpm rises (as sim-racing shift
 * tones do), so the tone lands when the driver moves the lever rather than a reaction time later. At a steady or
 * falling rpm the prediction is the rpm itself; it is never more than MAX_AHEAD rpm ahead (a glitch in the data).
 *
 * Player: the WAVs of the Meters payload (sounds/tick.wav, sounds/shift.wav) through HTML5 audio, else the head unit's
 * own short beep (framework.common.beep of the Mazda HMI, which hosts this page in an iframe), repeated every 120 ms in
 * place of the steady tone. Neither route is tested in the car yet; the style menu's sound test lets the driver pick.
 *
 * Third route, 'rx7': the RX-7-style shift buzzer (sounds/rx7.wav) at the shift point, in place of the steady tone. Like
 * the buzzer it imitates it has no warning ticks, so the ticks are silent on that route. A file that cannot play falls
 * back to the repeated Mazda beep, as for the steady tone.
 */
(function (W) {
    'use strict';

    var LEAD = 250, REARM = 500, RELEASE = 200, GAP_SLOW = 450, GAP_FAST = 110, HOLD_MAX = 1500, MIN_SPEED = 5,
        WINDOW = 500, MAX_RATE = 10000, MAX_AHEAD = 1000, AMBER_SPAN = 700, BEEP_REPEAT = 120;

    function finite(x) { return typeof x === 'number' && isFinite(x); }

    function Shifter() {
        this.samples = [];
        this.state = 'quiet';     // 'quiet', 'warn' or 'shift' (the steady tone is playing)
        this.armed = true;
        this.lastTick = -1e15;
        this.holdAt = 0;
        this.holdFrom = 0;        // rpm when the steady tone began (early, so possibly still below the shift point)
        this.holdPeak = 0;        // highest rpm since then: the upshift shows as a fall from it
    }
    // A new raw rpm reading at time t (ms). Call it once per data update, not per frame.
    Shifter.prototype.sample = function (t, rpm) {
        var s = this.samples;
        if (!finite(rpm) || !finite(t)) return;
        s.push({ t: t, r: rpm });
        while (s.length > 2 && s[0].t < t - WINDOW) s.shift();
        if (s.length > 12) s.shift();
    };
    // Rise in rpm per second over the last WINDOW ms; 0 when steady, falling or not known.
    Shifter.prototype.rate = function () {
        var s = this.samples, a, b, dt;
        if (s.length < 2) return 0;
        a = s[0]; b = s[s.length - 1]; dt = b.t - a.t;
        if (dt < 100 || dt > WINDOW * 2) return 0;
        return Math.max(0, Math.min(MAX_RATE, (b.r - a.r) * 1000 / dt));
    };
    Shifter.prototype.rpm = function () { var s = this.samples; return s.length ? s[s.length - 1].r : undefined; };
    // At most MAX_AHEAD rpm ahead, so a glitch in the data (a sudden jump) cannot sound the shift point far too early.
    Shifter.prototype.predicted = function () {
        var r = this.rpm();
        return finite(r) ? r + Math.min(MAX_AHEAD, this.rate() * LEAD / 1000) : r;
    };
    // o: { enabled, live, speed (km/h), amber, shift (rpm) }. Returns what to play now: null, 'tick', 'start' (the
    // steady tone) or 'stop' (end the steady tone).
    Shifter.prototype.update = function (now, o) {
        var r = this.rpm(), p, amber, gap, open = false;
        if (finite(o.shift) && o.shift > 0) {
            amber = finite(o.amber) && o.amber < o.shift ? o.amber : o.shift - AMBER_SPAN;
            if (finite(r) && !this.armed && this.state !== 'shift' && r < Math.min(amber, this.holdFrom - REARM)) this.armed = true;
            open = !!o.enabled && !!o.live && o.speed > MIN_SPEED && finite(r);
        }
        if (this.state === 'shift') {
            if (open && r > this.holdPeak) this.holdPeak = r;
            if (!open || r < this.holdPeak - RELEASE || now - this.holdAt >= HOLD_MAX) { this.state = 'quiet'; return 'stop'; }
            return null;
        }
        this.state = 'quiet';
        if (!open || !this.armed) return null;
        p = this.predicted();
        if (p >= o.shift) {
            this.state = 'shift';
            this.armed = false;
            this.holdAt = now;
            this.holdFrom = this.holdPeak = r;
            return 'start';
        }
        if (p < amber) return null;
        this.state = 'warn';
        gap = GAP_SLOW - (GAP_SLOW - GAP_FAST) * (p - amber) / (o.shift - amber);
        if (now - this.lastTick < gap) return null;
        this.lastTick = now;
        return 'tick';
    };
    // Stop at once (menu opened, page left): the next update starts from quiet.
    Shifter.prototype.reset = function () { this.state = 'quiet'; this.samples = []; };

    // opts: { base: folder of the WAVs, win: the page's window (tests pass a stand-in) }
    function Player(opts) {
        this.win = opts.win || W;
        this.base = opts.base || 'sounds/';
        this.el = null;           // { tick: Audio, shift: Audio } once loaded, and rx7 once the buzzer route is used
        this.fileBroken = false;
        this.pendingAt = 0;       // a file play that has not started yet: an error then still gets the Mazda beep
        this.repeat = null;       // the Mazda beep's repeat in place of the steady tone
        this.timers = [];         // the sound test's scheduled steps
        this.last = 'none';       // the route of the last sound: 'file', 'beep' or 'none'
    }
    Player.prototype.now = function () { return new Date().getTime(); };
    Player.prototype.make = function (A, name) {
        var self = this, el = new A();
        el.addEventListener('error', function () {
            self.fileBroken = true;
            if (self.pendingAt && self.now() - self.pendingAt < 2000) { self.pendingAt = 0; self.last = self.beep() ? 'beep' : 'none'; }
        }, false);
        el.addEventListener('playing', function () { self.pendingAt = 0; }, false);
        el.preload = 'auto';
        el.src = this.base + name + '.wav';
        if (el.load) el.load();
        return el;
    };
    // Prepare both audio elements once, so a broken or unsupported file shows up before the first sound.
    Player.prototype.load = function () {
        var A = this.win.Audio, probe, can;
        if (this.el || this.fileBroken) return;
        try {
            if (typeof A !== 'function') throw new Error('no Audio');
            probe = new A();
            can = probe.canPlayType ? probe.canPlayType('audio/wav; codecs="1"') : '';
            if (!can || can === 'no') throw new Error('no WAV');
            this.el = { tick: this.make(A, 'tick'), shift: this.make(A, 'shift') };
        } catch (e) {
            this.fileBroken = true;
        }
    };
    // The head unit's short beep. The page runs in an iframe of the HMI, so the framework is the parent's.
    Player.prototype.beep = function () {
        var w = this.win, f = null;
        try {
            if (w.parent && w.parent !== w && w.parent.framework) f = w.parent.framework;
            else if (w.framework) f = w.framework;
            if (f && f.common && typeof f.common.beep === 'function') {
                f.common.beep('Short', 'Touch');
                return true;
            }
        } catch (e) { /* not in the HMI, or the parent is not reachable */ }
        return false;
    };
    Player.prototype.file = function (name) {
        var self = this, el, p;
        this.load();
        if (this.fileBroken || !this.el) return false;
        try {
            // The buzzer is only fetched once the driver has chosen it (the sound test, or the choice kept from before).
            if (name === 'rx7' && !this.el.rx7) this.el.rx7 = this.make(this.win.Audio, 'rx7');
            el = this.el[name];
            try { el.currentTime = 0; } catch (e) { /* not seekable yet */ }
            this.pendingAt = this.now();
            p = el.play();
            // Newer browsers (the PC preview) report a refused play through a promise.
            if (p && typeof p.then === 'function') {
                p.then(null, function () { self.fileBroken = true; self.pendingAt = 0; self.last = self.beep() ? 'beep' : 'none'; });
            }
            return true;
        } catch (e) {
            this.fileBroken = true;
            this.pendingAt = 0;
            return false;
        }
    };
    // route 'beep': the Mazda beep only. Anything else: the files, and the Mazda beep when they cannot play.
    // route 'rx7': no ticks at all (nothing plays, and what the last sound was stays).
    Player.prototype.tick = function (route) {
        var r = 'none';
        if (route === 'rx7') return r;
        if (route !== 'beep' && this.file('tick')) r = 'file';
        else if (this.beep()) r = 'beep';
        this.last = r;
        return r;
    };
    Player.prototype.start = function (route) {
        var self = this, until, r = 'none';
        this.stop();
        if (route !== 'beep' && this.file(route === 'rx7' ? 'rx7' : 'shift')) r = 'file';
        else if (this.beep()) {
            r = 'beep';
            until = this.now() + HOLD_MAX;
            if (typeof this.win.setTimeout === 'function') {
                (function again() {
                    self.repeat = self.win.setTimeout(function () {
                        self.repeat = null;
                        if (self.now() >= until) return;
                        self.beep();
                        again();
                    }, BEEP_REPEAT);
                })();
            }
        }
        this.last = r;
        return r;
    };
    Player.prototype.stop = function () {
        if (this.repeat !== null && typeof this.win.clearTimeout === 'function') this.win.clearTimeout(this.repeat);
        this.repeat = null;
        if (this.el && this.el.shift) {
            try { this.el.shift.pause(); } catch (e) { /* nothing playing */ }
        }
        if (this.el && this.el.rx7) {
            try { this.el.rx7.pause(); } catch (e) { /* nothing playing */ }
        }
    };
    // The sound test: four ticks speeding up, then 0.6 s of the steady tone. Returns the route of the first sound. On the
    // rx7 route there are no ticks: the buzzer sounds at once for 0.9 s.
    Player.prototype.demo = function (route) {
        var self = this, w = this.win, k, first, rx7 = route === 'rx7',
            steps = rx7 ? [[900, 'stop']] : [[380, 'tick'], [640, 'tick'], [840, 'tick'], [1000, 'start'], [1600, 'stop']];
        for (k = 0; k < this.timers.length; k++) if (typeof w.clearTimeout === 'function') w.clearTimeout(this.timers[k]);
        this.timers = [];
        this.stop();
        first = rx7 ? this.start(route) : this.tick(route);
        if (typeof w.setTimeout !== 'function') return first;
        for (k = 0; k < steps.length; k++) {
            (function (step) {
                self.timers.push(w.setTimeout(function () {
                    if (step[1] === 'tick') self.tick(route);
                    else if (step[1] === 'start') self.start(route);
                    else self.stop();
                }, step[0]));
            })(steps[k]);
        }
        return first;
    };

    W.MeterShiftSound = {
        Shifter: Shifter, Player: Player, LEAD: LEAD, REARM: REARM, RELEASE: RELEASE, GAP_SLOW: GAP_SLOW,
        GAP_FAST: GAP_FAST, HOLD_MAX: HOLD_MAX, MIN_SPEED: MIN_SPEED
    };
})(window);

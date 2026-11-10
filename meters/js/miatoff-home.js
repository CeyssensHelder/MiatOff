/*
 * MiatOff Home menu: draws your Home design (window.MiatOffHomeDesign, from miatoff-home-design.js) in place of
 * Mazda's five-coin Home on Mazda Connect 74.00.324A.
 *
 * Opera runs every userscript in its userjs folder in every page. In the HMI this one waits for the framework,
 * then wraps MainMenuCtrl (apps/system/controls/MainMenu) when that control registers. The control keeps its
 * place in the system app: the factory buttons call the app's own select callback with Mazda's icon keys
 * (app, ent, com, nav, set), so MMUI routes them exactly as before. Other destinations open their list the stock
 * way, then select the list item that carries the wanted MMUI event, as a tap on that item would; nothing here
 * names an event Mazda's own lists do not carry.
 *
 * Nothing changes when the design is missing or invalid, or when a hook is not as expected; an error while
 * building the screen falls back to Mazda's own Home. ES5 only (Opera Presto).
 *
 * The same file runs in the PC preview (meters/designer/home/car-preview.html) against a stand-in control.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
(function (W) {
    var STATUS_BAR = 64;                // the control starts below the status bar; designs use screen coordinates
    var LIST_WAIT_MS = 4000;            // how long to wait for a list after opening it
    var LIST_POLL_MS = 100;
    var INPUT_BLOCK_MS = 1000;          // as Mazda's control: no input while the next screen comes
    var ICONS = { app: "HomeApps", ent: "HomeAudio", com: "HomeCom", nav: "HomeNav", set: "HomeSet" };
    var COINS = "apps/system/controls/MainMenu/images/coins/";
    var LIST_ICON = { Entertainment: "ent", Applications: "app" };
    // Shown when an item has no picture of its own (and, for factory buttons, no coin: the PC preview).
    var TEXT_ICON = { applications: "APP", entertainment: "ENT", communication: "COM", navigation: "NAV",
                      settings: "SET", meters: "M", bluetooth: "BT", fm: "FM", dab: "DAB", "android-auto": "AA",
                      carplay: "CP" };
    var METHODS = ["createStructure", "init", "handleControllerEvent", "startTransitionFrom", "endTransitionTo",
                   "getContextCapture", "restoreContext", "finishPartialActivity", "cleanUp", "setText",
                   "getRemoteUiButtonStatus"];
    var state = { hooked: false, design: undefined, pending: null, timer: null };

    function warn(text) {
        try {
            if (W.log && typeof W.log.error === "function") {
                W.log.error("[miatoff-home] " + text);
            }
        } catch (e) {
        }
    }

    // ------------------------------------------------------------ the design
    function isColor(v) {
        return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
    }
    function isPicture(v) {
        return v === null || (typeof v === "string" &&
            (/^apps\/miatoff\/home\/[0-9a-f]{16}\.png$/.test(v) || /^data:image\/png;base64,[A-Za-z0-9+\/]+=*$/.test(v)));
    }
    function isNumber(v, low, high) {
        return typeof v === "number" && v === v && v >= low && v <= high;
    }
    function isRoute(r) {
        var i;
        if (!r || typeof r !== "object") {
            return false;
        }
        if (typeof r.icon === "string") {
            return ICONS.hasOwnProperty(r.icon);
        }
        if (!LIST_ICON.hasOwnProperty(r.list)) {
            return false;
        }
        if (typeof r.appName === "string") {
            return r.appName.length > 0;
        }
        if (!(r.events instanceof Array) || r.events.length < 1) {
            return false;
        }
        for (i = 0; i < r.events.length; i++) {
            if (typeof r.events[i] !== "string" || !/^Select\w+$/.test(r.events[i])) {
                return false;
            }
        }
        return true;
    }
    function check(d) {
        var ids = {}, i, w;
        if (!d || d.version !== 1 || !d.background || !isColor(d.background.color) || !isColor(d.accent) ||
                !isPicture(d.background.image) || (d.background.fit !== "cover" && d.background.fit !== "contain") ||
                !(d.items instanceof Array) || d.items.length < 1 || d.items.length > 12 ||
                !(d.order instanceof Array) || d.order.length !== d.items.length) {
            return false;
        }
        for (i = 0; i < d.items.length; i++) {
            w = d.items[i];
            if (!w || typeof w.id !== "string" || ids.hasOwnProperty(w.id) || typeof w.label !== "string" ||
                    typeof w.opens !== "string" || !isRoute(w.route) || !isPicture(w.normal) || !isPicture(w.selected) ||
                    !isNumber(w.x, 0, 800) || !isNumber(w.y, 0, 480) || !isNumber(w.w, 48, 800) || !isNumber(w.h, 64, 480) ||
                    w.x + w.w > 800 || w.y + w.h > 480) {
                return false;
            }
            ids[w.id] = i;
        }
        for (i = 0; i < d.order.length; i++) {
            if (!ids.hasOwnProperty(d.order[i])) {
                return false;
            }
            ids[d.order[i]] = -1;           // each id once
        }
        for (i in ids) {
            if (ids.hasOwnProperty(i) && ids[i] !== -1) {
                return false;
            }
        }
        return true;
    }
    function design() {
        if (state.design === undefined) {
            state.design = check(W.MiatOffHomeDesign) ? W.MiatOffHomeDesign : null;
            if (!state.design && W.MiatOffHomeDesign !== undefined) {
                warn("design not valid; Mazda's Home stays");
            }
        }
        return state.design;
    }

    // ------------------------------------------------------------ drawing
    function px(n) {
        return Math.round(n) + "px";
    }
    function element(tag, css, parent) {
        var e = W.document.createElement(tag);
        e.style.cssText = css;
        if (parent) {
            parent.appendChild(e);
        }
        return e;
    }
    // A picture fitted into a size x size square at the top of the item, as the designer draws it.
    function picture(parent, url, size, w) {
        var img = element("img", "position:absolute;top:4px;left:" + px((w - size) / 2) + ";width:" + px(size) +
            ";height:" + px(size) + ";display:none", parent);
        img.onload = function () {
            var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, s;
            if (iw > 0 && ih > 0) {
                s = Math.min(size / iw, size / ih);
                img.style.width = px(iw * s);
                img.style.height = px(ih * s);
                img.style.left = px((w - iw * s) / 2);
            }
        };
        img.src = url;
        return img;
    }
    function frameCss(item, width, color) {
        var inset = 2 - Math.floor(width / 2);
        return "position:absolute;left:" + px(inset) + ";top:" + px(inset) + ";width:" + px(item.w - 2 * inset - 2 * width) +
            ";height:" + px(item.h - 2 * inset - 2 * width) + ";border:" + width + "px solid " + color;
    }
    function build(ctrl, d) {
        var root, bg, i, w, box, size, coin, normal, selected, label, mark, view = [];
        root = W.document.createElement("div");
        root.id = ctrl.controlId;
        root.className = "MainMenuCtrl MiatOffHome";
        root.style.cssText = "position:absolute;left:0;top:0;width:800px;height:" + px(480 - STATUS_BAR) +
            ";overflow:hidden;background-color:" + d.background.color;
        if (d.background.image) {
            bg = element("div", "position:absolute;left:0;top:" + px(-STATUS_BAR) + ";width:800px;height:480px;" +
                "background-repeat:no-repeat;background-position:center center;background-size:" + d.background.fit, root);
            bg.style.backgroundImage = "url(" + d.background.image + ")";
        }
        for (i = 0; i < d.items.length; i++) {
            w = d.items[i];
            box = element("div", "position:absolute;left:" + px(w.x) + ";top:" + px(w.y - STATUS_BAR) + ";width:" +
                px(w.w) + ";height:" + px(w.h), root);
            mark = element("div", frameCss(w, 1, "#8997aa"), box);
            size = Math.max(8, Math.min(w.w - 8, w.h - 28));
            // Mazda's own coins for factory buttons without a picture; the PC preview has none of Mazda's files.
            coin = w.route.icon && W.MiatOffHomeCoins !== false ? COINS + ICONS[w.route.icon] : null;
            normal = w.normal || (coin ? coin + ".png" : null);
            selected = w.selected || (w.normal ? w.normal : (coin ? coin + "_Focus.png" : null));
            normal = normal ? picture(box, normal, size, w.w) : null;
            selected = selected ? picture(box, selected, size, w.w) : null;
            if (normal) {
                normal.style.display = "block";
            } else {
                element("div", "position:absolute;left:0;top:" + px(size * 0.3) + ";width:100%;text-align:center;color:#e5eaf4;" +
                    "font-family:Tipperary,Arial,Helvetica,sans-serif;font-size:" + px(Math.min(size * 0.45, 40)), box)
                    .appendChild(W.document.createTextNode(TEXT_ICON[w.opens] || "*"));
            }
            label = element("div", "position:absolute;left:4px;top:" + px(w.h - 26) + ";width:" + px(w.w - 8) +
                ";height:22px;line-height:22px;overflow:hidden;white-space:nowrap;text-align:center;color:#fff;" +
                "font-family:Tipperary,Arial,Helvetica,sans-serif;font-size:14px", box);
            label.appendChild(W.document.createTextNode(w.label));
            view.push({ item: w, box: box, frame: mark, normal: normal, selected: selected });
        }
        ctrl.divElt = root;
        ctrl._mo = { design: d, view: view, order: [], focus: -1, lit: false, previous: -1, allow: true,
                     allowTimer: null, last: "", handlers: null };
        for (i = 0; i < d.order.length; i++) {
            for (w = 0; w < view.length; w++) {
                if (view[w].item.id === d.order[i]) {
                    ctrl._mo.order.push(w);
                }
            }
        }
        ctrl._mo.focus = 0;
    }

    // Highlight the item at this Commander position (-1: none).
    function light(ctrl, at) {
        var m = ctrl._mo, i, v, on;
        for (i = 0; i < m.view.length; i++) {
            v = m.view[i];
            on = at !== -1 && m.order[at] === i;
            v.frame.style.cssText = on ? frameCss(v.item, 4, m.design.accent) : frameCss(v.item, 1, "#8997aa");
            if (v.selected && v.normal && v.selected !== v.normal) {
                v.normal.style.display = on ? "none" : "block";
                v.selected.style.display = on ? "block" : "none";
            }
        }
        if (at === -1) {
            m.previous = m.lit ? m.focus : m.previous;
            m.lit = false;
        } else {
            m.focus = at;
            m.lit = true;
            m.previous = -1;
        }
    }
    function step(ctrl, direction) {
        var m = ctrl._mo, at = Math.max(0, Math.min(m.order.length - 1, m.focus + direction));
        if (at !== m.focus || !m.lit) {
            light(ctrl, at);
        }
    }

    // ------------------------------------------------------------ choosing
    function stopPending() {
        if (state.timer) {
            W.clearInterval(state.timer);
        }
        state.timer = null;
        state.pending = null;
    }
    // Waits for the opened list, then selects the wanted item the way the list itself would.
    function pollList() {
        var p = state.pending, fw = W.framework, sys, tmpl, list, items, i, a, hit = null, cb;
        if (!p) {
            stopPending();
            return;
        }
        if (new Date().getTime() > p.until) {
            warn("list " + p.list + " did not come; staying there");
            stopPending();
            return;
        }
        try {
            if (fw.getCurrentApp() !== "system" || fw.getCurrCtxtId() !== p.list) {
                return;
            }
            sys = fw.getAppInstance("system");
            tmpl = sys && sys._currentContextTemplate;
            list = tmpl && tmpl.list2Ctrl;
            items = list && list.dataList && list.dataList.items;
            if (!items || !items.length) {
                return;
            }
            for (i = 0; i < items.length && !hit; i++) {
                a = items[i] && items[i].appData;
                if (a && (p.route.appName ? a.appName === p.route.appName : p.route.events.indexOf(a.mmuiEvent) !== -1)) {
                    hit = items[i];
                }
            }
            if (!hit) {
                return;                     // not built yet, or not on this car: wait, then stay in the list
            }
            stopPending();
            if (hit.disabled) {
                return;                     // not available now (no phone, no DAB): the list is shown
            }
            cb = sys._contextTable[p.list].controlProperties.List2Ctrl.selectCallback;
            cb.call(sys, list, hit.appData, {});
        } catch (e) {
            warn("list selection: " + e);
            stopPending();
        }
    }
    function choose(ctrl) {
        var m = ctrl._mo, item, route, cb;
        if (m.focus < 0 || !m.allow) {
            return;
        }
        m.allow = false;
        m.allowTimer = W.setTimeout(function () {
            m.allow = true;
            m.allowTimer = null;
        }, INPUT_BLOCK_MS);
        item = m.view[m.order[m.focus]].item;
        route = item.route;
        cb = ctrl.properties && ctrl.properties.selectCallback;
        if (typeof cb !== "function") {
            return;
        }
        stopPending();
        if (route.list) {
            state.pending = { list: route.list, route: route, until: new Date().getTime() + LIST_WAIT_MS };
            state.timer = W.setInterval(pollList, LIST_POLL_MS);
            cb(ctrl, ctrl.properties.appData, { icon: LIST_ICON[route.list] });
        } else {
            cb(ctrl, ctrl.properties.appData, { icon: route.icon });
        }
    }

    // ------------------------------------------------------------ touch
    function hit(ctrl, evt) {
        // Screen pixels, as the car reports touches; the PC preview, which is scaled, maps them itself.
        var m = ctrl._mo, i, j, w, at = W.MiatOffHomePoint ? W.MiatOffHomePoint(evt) : evt, x = at.pageX, y = at.pageY;
        for (i = m.view.length - 1; i >= 0; i--) {           // topmost first
            w = m.view[i].item;
            if (x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h) {
                for (j = 0; j < m.order.length; j++) {
                    if (m.order[j] === i) {
                        return j;
                    }
                }
            }
        }
        return -1;
    }
    function touchHandlers(ctrl) {
        var m = ctrl._mo, body = W.document.body, h = {};
        h.move = function (evt) {
            var at = hit(ctrl, evt);
            if (at !== -1 && at !== m.focus) {
                light(ctrl, at);
            }
        };
        h.up = function (evt) {
            var at = hit(ctrl, evt);
            body.removeEventListener("mousemove", h.move, false);
            body.removeEventListener("mouseup", h.up, false);
            if (at !== -1) {
                light(ctrl, at);
                try {
                    W.framework.common.beep("Short", "Touch");
                } catch (e) {
                }
                choose(ctrl);
            }
        };
        h.down = function (evt) {
            var at;
            if (!m.allow) {
                return;
            }
            at = hit(ctrl, evt);
            if (at === -1) {
                return;
            }
            if (!m.lit) {
                try {
                    W.framework.common.stealFocus();
                } catch (e) {
                }
            }
            body.addEventListener("mousemove", h.move, false);
            body.addEventListener("mouseup", h.up, false);
            light(ctrl, at);
        };
        return h;
    }

    // ------------------------------------------------------------ the control's methods, in our mode
    var mine = {
        init: function () {
            this._mo.handlers = touchHandlers(this);
            W.document.body.addEventListener("mousedown", this._mo.handlers.down, false);
        },
        handleControllerEvent: function (eventId) {
            var m = this._mo, response = "consumed";
            switch (eventId) {
            case "lostFocus":
                light(this, -1);
                break;
            case "acceptFocusInit":
            case "acceptFocusFromTop":
                light(this, m.previous !== -1 ? m.previous : (m.focus !== -1 ? m.focus : 0));
                break;
            case "ccw":
            case "leftStart":
                if (m.allow) {
                    step(this, -1);
                }
                break;
            case "cw":
            case "rightStart":
                if (m.allow) {
                    step(this, 1);
                }
                break;
            case "left":
            case "right":
            case "up":
                break;
            case "selectStart":
                if (m.allow) {
                    m.last = eventId;
                    if (!m.lit) {
                        light(this, m.focus);
                    }
                }
                break;
            case "select":
                if (m.allow && m.last === "selectStart") {
                    choose(this);
                }
                m.last = "";
                break;
            case "upStart":
                if (m.allow) {
                    m.last = "";
                    response = "giveFocusUp";
                }
                break;
            default:
                response = "ignored";
                break;
            }
            return response;
        },
        startTransitionFrom: function () {
        },
        endTransitionTo: function () {
        },
        getContextCapture: function () {
            return { focusedIcon: -1, miatoffFocus: this._mo.focus };
        },
        restoreContext: function (capture) {
            var at = capture && capture.miatoffFocus;
            if (typeof at === "number" && at >= 0 && at < this._mo.order.length) {
                this._mo.focus = at;
            }
        },
        finishPartialActivity: function () {
            if (this.properties) {
                this.properties.selectCallback = null;
            }
        },
        cleanUp: function () {
            var h = this._mo.handlers, body = W.document.body;
            if (h) {
                body.removeEventListener("mousedown", h.down, false);
                body.removeEventListener("mousemove", h.move, false);
                body.removeEventListener("mouseup", h.up, false);
            }
            if (this._mo.allowTimer) {
                W.clearTimeout(this._mo.allowTimer);
            }
            delete this.properties;
        },
        setText: function () {
        },
        getRemoteUiButtonStatus: function () {
        }
    };

    function wrap(name, original) {
        return function () {
            return this._mo ? mine[name].apply(this, arguments) : original.apply(this, arguments);
        };
    }
    function patch(Ctrl) {
        var P = Ctrl && Ctrl.prototype, original = {}, i;
        if (!P || P.miatoffHome) {
            return;
        }
        for (i = 0; i < METHODS.length; i++) {
            if (typeof P[METHODS[i]] !== "function") {
                warn("MainMenuCtrl." + METHODS[i] + " is missing; Mazda's Home stays");
                return;
            }
            original[METHODS[i]] = P[METHODS[i]];
        }
        P.miatoffHome = true;
        P.createStructure = function () {
            var d = design();
            this._mo = null;
            if (d) {
                try {
                    build(this, d);
                    return;
                } catch (e) {
                    warn("could not draw the design (" + e + "); Mazda's Home stays");
                    this._mo = null;
                }
            }
            return original.createStructure.apply(this, arguments);
        };
        for (i = 1; i < METHODS.length; i++) {
            P[METHODS[i]] = wrap(METHODS[i], original[METHODS[i]]);
        }
    }

    function tryHook() {
        var fw = W.framework, orig;
        try {
            if (state.hooked || !fw || typeof fw.registerCtrlLoaded !== "function") {
                return;
            }
            state.hooked = true;
            if (!design()) {
                return;
            }
            orig = fw.registerCtrlLoaded;
            fw.registerCtrlLoaded = function (name) {
                if (name === "MainMenuCtrl") {
                    try {
                        patch(W.MainMenuCtrl);
                    } catch (e) {
                        warn("patch: " + e);
                    }
                }
                return orig.apply(this, arguments);
            };
            if (typeof W.MainMenuCtrl === "function") {
                patch(W.MainMenuCtrl);
            }
        } catch (e) {
            warn("hook: " + e);
        }
    }

    W.MiatOffHome = { hook: tryHook, check: check };
    if (W.opera && typeof W.opera.addEventListener === "function") {
        W.opera.addEventListener("AfterEvent.load", tryHook, false);
    }
    tryHook();
})(typeof window !== "undefined" ? window : this);

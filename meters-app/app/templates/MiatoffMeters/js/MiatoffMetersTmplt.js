/*
 * MiatOff Meters template: shows the Meters page (apps/miatoff/meters/) full
 * screen in an iframe. The page reads live.txt in its own folder, a link to
 * /tmp/miatoff/live.txt written by the collector. The rotary knob and the
 * back key drive the page's own menus.
 * ES5 only.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

log.addSrcFile("MiatoffMetersTmplt.js", "miatoff");

var MIATOFF_METERS_URL = "apps/miatoff/meters/index.html?src=poll:live.txt";

function MiatoffMetersTmplt(uiaId, parentDiv, templateId, controlProperties)
{
    this.divElt = null;
    this.frame = null;
    this.templateName = "MiatoffMetersTmplt";
    this.onScreenClass = "TemplateFull";

    this.properties = {
        "statusBarVisible" : false,
        "leftButtonVisible" : false,
        "hasActivePanel" : false,
        "isDialog" : false
    };

    this.divElt = document.createElement("div");
    this.divElt.id = templateId;
    this.divElt.className = "TemplateFull MiatoffMetersTmplt";

    this.frame = document.createElement("iframe");
    this.frame.className = "MiatoffMetersFrame";
    this.frame.setAttribute("frameborder", "0");
    this.frame.setAttribute("scrolling", "no");
    this.frame.src = MIATOFF_METERS_URL;
    this.divElt.appendChild(this.frame);

    parentDiv.appendChild(this.divElt);
}

// window.MiatoffMeters of the page, or null while it is not loaded.
MiatoffMetersTmplt.prototype._meters = function()
{
    try
    {
        return (this.frame && this.frame.contentWindow && this.frame.contentWindow.MiatoffMeters) || null;
    }
    catch (e)
    {
        return null;
    }
};

/*
 * Multicontroller: turning the knob (or pushing it left/right) moves through the
 * page's menus and pages, pressing it selects (MiatoffMeters.next/prev/select).
 * Everything else goes to the framework as for any template. Back is handled
 * in miatoffBack (called from the userscript), because Common sends
 * Global.GoBack to MMUI before the template sees the key.
 */
MiatoffMetersTmplt.prototype.handleControllerEvent = function(eventID)
{
    var meters = this._meters();
    if (!meters)
    {
        return;
    }
    if ((eventID === "cw" || eventID === "right") && typeof meters.next === "function")
    {
        meters.next();
        return "consumed";
    }
    if ((eventID === "ccw" || eventID === "left") && typeof meters.prev === "function")
    {
        meters.prev();
        return "consumed";
    }
    if (eventID === "selectStart" && typeof meters.select === "function")
    {
        return "consumed";                  // the press acts on release ("select")
    }
    if (eventID === "select" && typeof meters.select === "function")
    {
        meters.select();
        return "consumed";
    }
};

/*
 * Back key: true when the page went up one level (gauge -> previews -> styles).
 * false at the top, or without the page API: then the app closes as usual.
 */
MiatoffMetersTmplt.prototype.miatoffBack = function()
{
    var meters = this._meters();
    if (!meters || typeof meters.back !== "function")
    {
        return false;
    }
    try
    {
        return meters.back() === true;
    }
    catch (e)
    {
        return false;
    }
};

/*
 * Called when the template is no longer displayed: stop the page and its timers.
 */
MiatoffMetersTmplt.prototype.cleanUp = function()
{
    if (this.frame)
    {
        try
        {
            this.frame.src = "about:blank";
        }
        catch (e)
        {
        }
        this.frame = null;
    }
};

framework.registerTmpltLoaded("MiatoffMetersTmplt");

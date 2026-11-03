/*
 * MiatOff Meters: a Mazda Connect app that shows the Meters page full screen.
 * Installed as /jci/gui/apps/miatoff/ and opened from Applications through the
 * userscript userjs/miatoff-apps.js. ES5 only (the HMI runs in Opera Presto).
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * App structure after the Mazda Connect framework and MZD_Speedometer (GPL-3.0).
 */

log.addSrcFile("miatoffApp.js", "miatoff");

function miatoffApp(uiaId)
{
    log.debug("miatoffApp constructor called");
    // Base application functionality (framework/js/BaseApp.js).
    baseApp.init(this, uiaId);
}

/*
 * Called by the framework right after the app is instantiated.
 */
miatoffApp.prototype.appInit = function()
{
    this._contextTable = {
        "Start" : {
            "sbName" : "Meters",
            "template" : "MiatoffMetersTmplt",
            "templatePath" : "apps/miatoff/templates/MiatoffMeters",
        }
    };
    this._messageTable = {};
};

framework.registerAppLoaded("miatoff", null, false);

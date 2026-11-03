#!/bin/sh
# MiatOff AA touch for Mazda Connect Gen-6 (CMU), firmware 74.00.324A.
#
# Installs, disables, enables or removes touch input in Android Auto with the
# touch shim of oem-aa-mod 0.10.0 (libpatch-blmjciaapa.so). Nothing else of
# oem-aa-mod is used: no HUD, no GAL 1.6, no audio fix, no navigation shim.
#
# What changes on the unit when installed (and nothing else):
#   /etc/aap_system_attributes.xml       + <touch_screen> block (use_internally true)
#   /etc/aap_system_attributes_UCP.xml   + <touch_screen> block (use_internally false)
#   /jci/sm/sm.conf                      jciAAPA: reset_board="no" + LD_PRELOAD environ_var
#   /data_persist/oem-aa-mod/            libpatch-blmjciaapa.so + libpatch.conf
#   /data_persist/miatoff/aa-touch/      backup of the three stock files
#
# Separately, the boot trim (menu EXTRA -> TRIM) sets autorun="no" in sm.conf for the
# services in TRIM_SERVICES; level 2 also turns off Aha and lets the three
# stages that waited for it wait for stage_ir. sm.conf then has six known
# variants (AA off/on x trim 0/1/2); each action changes only its own part.
# The startup warning (menu EXTRA -> WARNING) is a fixed edit of
# /jci/gui/apps/system/js/systemApp.js that skips the Disclaimer screen.
# Meters (menu EXTRA -> METERS) adds two folders (/jci/gui/apps/miatoff,
# /jci/opera/opera_dir/userjs-miatoff) and edits opera.ini and stage_gap2.sh.
# The file MIATOFF-RESTORE on the stick takes back Meters and the warning
# patch without a dialog.
#
# Safety model:
# - Every file is recognised by its exact sha256: stock or patched. Anything
#   else, or a binary/firmware that differs from the analysed unit, stops the
#   script before it changes anything.
# - Each file is staged next to its target, verified, and renamed atomically.
#   The order makes every intermediate state harmless: the shim is activated
#   last (one rename on /data_persist) and deactivated first. LD_PRELOAD to a
#   missing file is ignored by glibc, so sm.conf without the active .so is
#   stock Android Auto.
# - reset_board="no" on jciAAPA: if the shim crashes, the Service Manager only
#   loses Android Auto instead of resetting the whole unit (no bootloop).
# - DISABLE/ENABLE only rename the .so on /data_persist (no root remount).
#
# Target: BusyBox 1.19 ash, glibc 2.11, /bin/fsync, /usr/bin/openssl.
#
# SPDX-License-Identifier: GPL-3.0-or-later
# Launcher, remount/watchdog handling and SafeReboot follow TouchTune
# 1.2.1 (GPL-3.0-or-later). libpatch-blmjciaapa.so is oem-aa-mod 0.10.0 by
# Vitaliy Kurokhtin (AGPL-3.0); see NOTICE on this stick.

MO_VERSION=1.4.1
R="${MO_ROOT:-}"                        # test hook: fixture root; empty on the CMU
MO_TEST="${MO_TEST:-0}"                 # test hook: 1 = no dialogs, remount, watchdog or reboot
MO_ACTION="${MO_ACTION:-}"              # test hook: install | disable | enable | remove | cancel
MO_FAULT="${MO_FAULT:-}"                # test hook: kill:<step> (power loss) or fail:<step>
MO_GUARD="${MO_GUARD:-/tmp/miatoff-aa-touch.guard}"
USB=$(CDPATH='' cd "$(dirname "$0")" && pwd) || exit 1

# ---------------------------------------------------------------- known state
# From the read-only dump of this unit (docs/11) and the oem-aa-mod release.

FW_WANTED=74.00.324A
BLM_SHA256=10e7235bfce075b44c1a8ffc99bbc9b63af85d9262df868ca1874ec36d8d3b71   # /jci/aapa/blmjciaapa.so (md5 486628ae...)
AAP_SHA256=a0187afab34eaf0e0fb84db6974162465004ad1227ad7866eeb15ac7672546cd   # /usr/bin/aap_service (md5 964e9af0...)
SM_STOCK=fa3484d7c644393ab6cb083990e483201129a207e7755459296dde8ec82a4d84
SM_PATCHED=6050d325b4ea6a98afa4980674652a946b2afef10ec06fe336d3094e23c0d058     # + AA touch
# Every sm.conf variant: AA touch (0 1) plus a boot trim char: bit 1 DVD/TV, 2 SiriusXM,
# 4 Pandora, 8 Stitcher, 16 Aha, counted in 0-9 then a-v (0 = no trim, f = the four
# groups, v = all five). The 64 files are the stock sm.conf with exactly those edits.
SM_TABLE='00 fa3484d7c644393ab6cb083990e483201129a207e7755459296dde8ec82a4d84
01 77e6177f4e11b57f914b64bc825ce0f2c7b2dfa449fdb0bcd9c46106d621d9c9
02 827f4e146e9497ed19c23abb38e581bf2c743566a9bef58548f9a86bf63ea525
03 0870851b30bd7b746e93b4d57ff2ac984c57a06f229b554feacf03c7cf3cbb21
04 da4a72936371097950577aadc64fb508540aafe845d223e3087b225a158d06bc
05 e94acee8f2009f577f6a3ab565b9fa1cc8cb58a144a46182e4fa36f615d05526
06 662edcb99e47168e2a9a66f4cc5a223a81d3bf67669d030bd6edb4d7e28fd863
07 2371b281056fe4c4ca84ac8fd8311e90f8435919d8959c981e55860802a560eb
08 a6d130087467083cca11f13066daa4bb4d496714a6b00aa2cff9388783a11412
09 015c8f9563bb4f0f02675ffaaa9f70ac8b81d312c3e304399fb56ba2444f6da0
0a c77560675f6c3c2aabfbb93220285aa449c3eaf0a32627834a0786588d388957
0b 13d3ba027f0bbf50d170237b5dc47977bbee2d93ac67ef63a61bf2ffb279a44d
0c a5942ec83dc185e911b9aaef1e4efbb9a6ede0190c9a40166e18e858ee854931
0d f9c171a76e73961cba32ea0dfcdbc7f525a4c08623a5632be6db52c4165e36e4
0e 1f37089fe8cdfbcbf3bd573d32760a5b3a51651a820bec510fc07929022056cd
0f 88718e401e148bef82797cbda76ba8a33f13d03f59e308f0c487b90cd945d351
0g d73c3ee3fd46b53007cc207481bdba2982a94000c73a32f4bdecd43fdd8b6b97
0h e75588b449cef15d286a6873be2931f7ead7ab400ff7137f6a2247c68df58dfa
0i 2c4910ec8f570c8bc8d6e591d5c6d69fad2413425ae6e24ca25c8d7df6a8e3ed
0j 3c64fbd0d653d0777dac88ac9846794a01d3649fa3bd578173d49c27450e995a
0k 34652f1dd926ce43a260f0bf6d0bac6dca82d4be268668be4bba904a67b79512
0l 23cbb3c93db7c4a4f35c85c14da5e30532b5e785a26fb353ebd11d93acba5e1a
0m ebedcd0b7d781b549d81bc1b5d7d51a6ea164036419104dd3a47974ec8d2c128
0n 43fc45d71128dcdccf28861fda5ea7ac09978410eec1904a0e51e7a50b7c404e
0o fb07f4e2079dfc37df8b92c1a9489870811f0c772ede6158e007a5a23538557c
0p fb5e6debadad779d5198ed3d72a8bee9983f651ff99e2fddffdef0dfcc61fa3c
0q 2a1f614d2f3d9dbc479d951bb624382bdb870b0b8b23e5bdc64c98a14e1d44e0
0r c7f12233592532df233039c7efc782797cea6a99a16d5042dc6bc289018c1cfe
0s 48d28d67301de03ce6bd729e07ebf8cff9b9ff0816c08e4f40d64b5daa9f36f8
0t 9cfa9f1f7c94234a45b32aa0445eb2eec1a54b60e1a9b4b1828f55a40f729c0c
0u a0bb39f642667eda3ba4d090ad2de710ad67a969127eb0f54c75e18e2d44f689
0v 0e95e5ec5d1fc7d1ac5c46fe710e86bf20207b74ebad7b28e2721b7d69725d16
10 6050d325b4ea6a98afa4980674652a946b2afef10ec06fe336d3094e23c0d058
11 cdeecfe837d2573bac110a3f5bc724e3b107c469d4de692e028d45a0c33c5019
12 604ad4600cb4fed8f0764747449111bd60493e654dc3285bbf6dd2b5707c39f3
13 20626482f6af4d96201c6f06c262bccbd653a637539b63d57ecc30767f325001
14 6524960a35d96ad9d0320be7eb7685df075418d04f172b950c8a28ea5ab750f2
15 37f5ec1cfd84ac0c945a24720289693c29349e293e3b0b5e04094b3e031f46ff
16 7d30995451b6e1715c46f643b11069d69613798d4929099280fb0a62742cc250
17 06358f2424ad5299a16502cd5a62642d307159ff08d67d2f35f7b509ca865827
18 a278a524ce07c4d948c99f63acc0a6a29bf06e5aeea60d94346028a3d064b37a
19 33f7d7e57850610d075365246f8ff8f162bc6a8d6c0cf5d3ba2190f615c0527f
1a e8ef3f03b33a07145d12684d6d66ece5bcb1474a236d37f7c49b5fc7bfe11556
1b 1c2fbc40e7a9ce02f76155a0637ab4c94890b5fc5a58996654638dd098567636
1c 58a87b66b2326f3b99a71fc135d09c588a0baaf5b0637b73d5ed2814de904a1d
1d 130dc69364b5cb58b6127a420e6d797c4deabb375a8910e08809e4c4d18f495d
1e 3f56b7058ab0bac913b01dbdaf8274608fff3e653a23a01c7a152604b3a1774b
1f a66f8cb758e5ee468902737a196b6e2033909283719ff3d593ebd98539a03909
1g fd44db25ebf53cd95d445f64109fc93516343d6d908e6af6fffa6c56f3c5dfed
1h cf8cea4b4c27d98c6398e1ddddc1a6769c8c2d46f3d5b2c952e5b8c5fbd8bfa5
1i 4b7b3bd682678d2c08a55efd114dd731bf88927520dfdf9f3c441f331e4dd947
1j 71ca12598c2222bcf3be8135d005dfbac87c9affd473ec56fd756ee9435ecb82
1k 75690c636ee6da8dd51d21160cd0e829c7f4e7d2bf10826cc162d782eb39e58b
1l c3b84c335256384d7bf13340380383f7e77e04911d3183ed196790d8999466a8
1m 6d82ffb0c82deba33ffe5a06e398acbe40d98dcf627457d7e5db8dcfe2fdc960
1n 01511bd3d958ce34eb9cd5489199fc615ec5029088281617745fa5f865447e17
1o 30ad0143c4ba18f3ba8623e1bb97cbfaf4e4593520a71219588901051e55deeb
1p d5d3ab47b99fd2e7e08dd8e137bb69775467324e1fcc42bd466e6ebc1733c517
1q 1f227e8266ed9d67680dfc83036d1bc4b447f72a2e79b11e8e75228117df03ac
1r b4d0ff2cbdecb625dbc2e9d5affe09c41ca402bc5a6beb70f194f7ab42f5ca96
1s ff9c606b1f0c77dbec4ee5af0a167000e55f0136476729b51f6aa6b3cdc1e8ae
1t 338c77b54492e32be20ff4f0ddfa03a1c4bd1102d58a1093663821082be71c45
1u 5d0bdb0e0e4ad07d9484fa5983e271bf848abfd65fb22a444aae959a117614ef
1v 63fdd65e26ceeffb18e7781156320fd6e6f54d2de76c07be90fcccc664f9ed3a'
XML_STOCK=bc852037615dcb4e4eb24ab6f30a2e6f817fe00a22a2f767478b25f75b036812
XML_PATCHED=8cfd05c4466e7ce71930d9437acf8a3c7bae1cb883a5dcdd11d50c4ca757e57f
UCP_STOCK=6a59ae58b903af4a943dfc2cd94560128b2d42f3d097c8c82d43b5d899c17063
UCP_PATCHED=8ff4fb4186036221e234ee05d9d99e11368728d7217e8c44a438e1cf4aace3e6
SHIM_SHA256=a6b87f72ae31429cebe14eea5c6d3a4a2749d4ea643a8c73303b3437533ad5b5 # oem-aa-mod 0.10.0 libpatch-blmjciaapa.so
CONF_SHA256=8868e35a8fb2fae27c114e2a5e74e68edd336703f8218d811a1aea080a5b67f8 # stick/libpatch.conf
OPERA_STOCK=a6db0eb9a67198dd0c55cae34ad7459a42241392421710196acba6313a2a988e    # opera.ini (docs/13)
OPERA_PATCHED=981d24bc756682830315edc5dde9fd30111a53f5d3eff66f7bdf207f546666a6  # opera.ini, MiatOff userscripts on
GAP2_STOCK=2ec71fc955d0107a6e90d1ab4e6f00c9438b56d3e621ef018d57c8ef07bfae7f     # stage_gap2.sh (empty stage)
GAP2_PATCHED=449c4bfccc8a32b88639abd499aa5ed8e83cbf551b0a2d54c65dfebdb896430e   # stage_gap2.sh, starts the collector
SYS_STOCK=23106b04bd6bad514dd879b217a34a0f0289d58f86a0ae022488be6a022ca8e1      # systemApp.js (docs/05)
SYS_PATCHED=65bb9d50020f83ab3e3cf3c1390e4b83ee1882bfb8b7aa405f966c05c35ada53    # systemApp.js, no disclaimer
COMMON_STOCK=376b30a46366a543122956d7feb1b44f147425015837a4d83fedf12a67943351    # Common.js, from TouchTune 1.2.1
COMMON_PATCHED=019eba18e8d629ddb1d55563aab138ce1eb3329fab67b71d9b4178377cf9d9ce  # Common.js with TouchTune
CFG_MODE=775                            # sm.conf and both XMLs: mode, uid, gid
CFG_OWNER=1000:1000
SHIM_MODE=644
CHECK_ATTRS=1

SM_LINE_STOCK='        <service type="jci_service" name="jciAAPA" path="/jci/aapa/blmjciaapa.so" autorun="yes" reset_board="yes" retry_count="0" ping_timeout="30000">'
SM_LINE_PATCHED='        <service type="jci_service" name="jciAAPA" path="/jci/aapa/blmjciaapa.so" autorun="yes" reset_board="no" retry_count="0" ping_timeout="30000">'
SM_ENV_LINE='            <environ_var env_name="LD_PRELOAD" env_value="/data_persist/oem-aa-mod/libpatch-blmjciaapa.so"/>'
XML_ANCHOR='        <input_devices>'
# Boot trim: services for hardware/services this EU MX-5 does not have. Nothing
# in sm.conf depends on them (the XM data/audio services are autorun="no" in
# stock). Their autorun="yes" becomes "no"; nothing else changes.
TRIM_SERVICES='jcidvd jcitv jciSXMS jciXMMGR blm_ira_pandora irs_server blm_ira_stitcher irsstitcher_server'
TRIM_DIGITS=0123456789abcdefghijklmnopqrstuv
TRIM_DVDTV='jcidvd jcitv'
TRIM_SIRIUS='jciSXMS jciXMMGR'
TRIM_PANDORA='blm_ira_pandora irs_server'
TRIM_STITCHER='blm_ira_stitcher irsstitcher_server'
# Trim level 2 also turns off Aha (blm_ira_aha). Three stages wait for it in
# stock; they wait for stage_ir instead, which Aha itself waited for, so the
# start order stays the same. These are the only references to blm_ira_aha in
# the text files of the dump (sm.conf).
AHA_STAGES='stage_gap2 stage_vr stage_wifi'
# Startup warning (menu EXTRA -> WARNING): the "Disclaimer" context of
# systemApp.js becomes a continuation of the intro logo (NoCtrlTmplt, like the
# stock "IntroAnimation") that agrees at once, after MZD-AIO "No More
# Disclaimer". If the screen were still shown after 3.5 s, the stock timeout
# ends it. Exact lines, verified by hash; Common.js (TouchTune) is not touched.
# Meters (menu EXTRA -> METERS, docs/13): Opera loads user scripts from MiatOff's
# own folder (the stock fps.js stays inactive), may read local files (for
# live.txt), and stage_gap2.sh starts the collector at boot. The app and the
# userscript are two new folders; their files are listed with sha256 in
# miatoff-app/MANIFEST on the stick.
OPERA_JS_OFF='User JavaScript=0'
OPERA_JS_ON='User JavaScript=1'
OPERA_XHR='Allow File XMLHttpRequest=1'
OPERA_DIR_STOCK='User JavaScript File=$OPERA_DIR/userjs/'
OPERA_DIR_OURS='User JavaScript File=/jci/opera/opera_dir/userjs-miatoff/'
GAP2_LINE1='# MiatOff: start the Meters collector (docs/13); it writes /tmp/miatoff/live.txt.'
GAP2_LINE2='[ -f /jci/gui/apps/miatoff/collector/miatoff-collector.sh ] && /bin/sh /jci/gui/apps/miatoff/collector/miatoff-collector.sh </dev/null >/dev/null 2>&1 &'
LIVE_LINK_TARGET=/tmp/miatoff/live.txt

DISC_START='        "Disclaimer" : {'
DISC_END='        }, // end of Disclaimer'
DISC_ANCHOR='systemApp.prototype._displayedDisclaimer = function()'
DISC_STOCK_BODY=$(cat <<'EOF'
            "template" : "Dialog3Tmplt",|
            "controlProperties": {|
                "Dialog3Ctrl" : {|
                    titleStyle : "titleStyle01", |
                    titleId : "WarningTitle", |
                    contentStyle : "style02", |
                    fullScreen : true,|
                    defaultSelectCallback :  this._selectCallbackDisclaimer.bind(this),|
                    buttonCount : 1,|
                    buttonConfig : {|
                        button1 : {|
                            labelId : "agree", |
                            appData : "Global.Yes" |
                        },|
                    },|
                    text1Id : 'DisclaimerText',     |
                }|
            },|
            "displayedFunction" : this._displayedDisclaimer.bind(this),|
            "noLongerDisplayedFunction" : this._noLongerDisplayedDisclaimer.bind(this),|
            "contextOutFunction": this._displayedDisclaimerOut.bind(this),|
EOF
)
DISC_PATCHED_BODY=$(cat <<'EOF'
            "hideHomeBtn" : true,
            "template" : "NoCtrlTmplt",
            "properties": {
                "visibleSurfaces" : ["TRANLOGO_SURFACE", "TRANLOGOEND_SURFACE"],
                "statusBarVisible" : false,
                "customBgImage" : "common/images/FullTransparent.png",
            },
            // MiatOff: the Disclaimer is skipped (after MZD-AIO "No More Disclaimer")
            "readyFunction" : this._noMoreDisclaimer.bind(this),
            "noLongerDisplayedFunction" : this._noLongerDisplayedDisclaimer.bind(this),
EOF
)
DISC_FUNCTION=$(cat <<'EOF'
// MiatOff: agree to the Disclaimer at once (after MZD-AIO "No More Disclaimer").
// If the screen is still shown after 3.5 s, the stock timeout below ends it.
systemApp.prototype._noMoreDisclaimer = function()
{
    framework.sendEventToMmui("system", "DisposeIntroVideo");
    framework.sendEventToMmui("common", "Global.Yes");
    framework.sendEventToMmui("system", "NotifyDisclaimerEnd");
    this._disclaimerTime.reset = false;
    this._disclaimerTime.remaining = 3500;
    this._disclaimerTime.whenStarted = Date.now();
    this._disclaimerTime.timeoutId = setTimeout(this._disclaimerTimedout.bind(this), this._disclaimerTime.remaining);
};
EOF
)

# Tests replace the hashes above with those of their fixture files.
if [ "$MO_TEST" = 1 ] && [ -n "${MO_TEST_OVERRIDES:-}" ]; then
    . "$MO_TEST_OVERRIDES" || exit 1
fi

SM="$R/jci/sm/sm.conf"
XML="$R/etc/aap_system_attributes.xml"
UCP="$R/etc/aap_system_attributes_UCP.xml"
BLM="$R/jci/aapa/blmjciaapa.so"
AAP="$R/usr/bin/aap_service"
MOD_DIR="$R/data_persist/oem-aa-mod"
SHIM="$MOD_DIR/libpatch-blmjciaapa.so"
SHIM_OFF="$SHIM.off"
SHIM_NEW="$MOD_DIR/.libpatch-blmjciaapa.so.new"
CONF="$MOD_DIR/libpatch.conf"
CONF_NEW="$MOD_DIR/.libpatch.conf.new"
STATE_DIR="$R/data_persist/miatoff/aa-touch"
BACKUP="$STATE_DIR/backup"
BACKUP_NEW="$STATE_DIR/.backup.new"
STICK_SHIM="$USB/oem-aa-mod/libpatch-blmjciaapa.so"
STICK_CONF="$USB/oem-aa-mod/libpatch.conf"
COMMON="$R/jci/gui/common/js/Common.js"
SYSAPP="$R/jci/gui/apps/system/js/systemApp.js"
SYS_BACKUP="$STATE_DIR/systemApp.js.stock"   # own file, so the AA backup set stays as it is
OPERA_INI="$R/jci/opera/opera_home/opera.ini"
GAP2="$R/jci/scripts/stage_gap2.sh"
MAPP_DIR="$R/jci/gui/apps/miatoff"           # the Meters app (+ page, + collector)
COLLECTOR_PIDFILE="$R/tmp/miatoff/collector.pid"
MJS_DIR="$R/jci/opera/opera_dir/userjs-miatoff"
STICK_MAPP="$USB/miatoff-app"                # app/, userjs/ and MANIFEST on the stick
MANIFEST="$STICK_MAPP/MANIFEST"
RESTORE="$USB/MIATOFF-RESTORE"               # emergency: revert the HMI changes without a dialog
PLAN="$USB/miatoff-plan.txt"                 # optional: the parts chosen in the PC builder
TT_SCRIPT="$USB/touchtune/install-patches.sh"   # unmodified TouchTune 1.2.1 release
WATCHDOG="$R/sys/class/gpio/Watchdog Disable/value"
LOG="$USB/miatoff-aa-touch.log"
REPORT="$USB/aa-touch-state.txt"

GUARD_CREATED=0
ROOT_WRITABLE=0
WATCHDOG_DISABLED=0

# ---------------------------------------------------------------- helpers

uptime_s() { cut -d' ' -f1 "$R/proc/uptime" 2>/dev/null || echo '?'; }
log() { printf '%s\n' "[aa-touch $(uptime_s)] $*"; }

popup() {
    [ "$MO_TEST" = 1 ] && return 0
    [ -x /jci/tools/jci-dialog ] || return 0
    killall -q jci-dialog 2>/dev/null || true
    /jci/tools/jci-dialog --info --title="MiatOff AA-touch" --text="$1" \
        --no-cancel >/dev/null 2>&1 &
}

# ask <ok-label> <cancel-label> [<button3-label>] <text>: prints 0, 1 or 2.
ask() {
    local code
    [ -x /jci/tools/jci-dialog ] || return 1
    killall -q jci-dialog 2>/dev/null || true
    if [ "$#" = 4 ]; then
        /jci/tools/jci-dialog --3-button-dialog --title="MIATOFF AA-TOUCH" --text="$4" \
            --ok-label="$1" --cancel-label="$2" --button3-label="$3" >/dev/null 2>&1
    else
        /jci/tools/jci-dialog --confirm --title="MIATOFF AA-TOUCH" --text="$3" \
            --ok-label="$1" --cancel-label="$2" >/dev/null 2>&1
    fi
    code=$?
    case "$code" in 0|1|2) echo "$code" ;; *) return 1 ;; esac
}

OPENSSL=/usr/bin/openssl
[ -x "$OPENSSL" ] || OPENSSL=$(command -v openssl 2>/dev/null || true)
HAVE_SHA256SUM=0
command -v sha256sum >/dev/null 2>&1 && HAVE_SHA256SUM=1
FSYNC=/bin/fsync
[ -x "$FSYNC" ] || FSYNC=$(command -v fsync 2>/dev/null || true)

sha256_of() {
    local out value
    if [ -n "$OPENSSL" ]; then
        out=$("$OPENSSL" dgst -sha256 "$1" 2>/dev/null) && value=${out##* }
    fi
    if [ -z "$value" ] && [ "$HAVE_SHA256SUM" = 1 ]; then
        out=$(sha256sum "$1" 2>/dev/null) && value=${out%% *}
    fi
    [ "${#value}" -eq 64 ] || return 1
    case "$value" in *[!0-9a-fA-F]*) return 1 ;; esac
    printf '%s\n' "$value" | tr 'A-F' 'a-f'
}

is_file() { [ -f "$1" ] && [ ! -L "$1" ]; }
exists() { [ -e "$1" ] || [ -L "$1" ]; }
attrs_of() { stat -c '%a %u:%g' "$1" 2>/dev/null; }

fsync_path() {
    if [ -n "$FSYNC" ]; then
        "$FSYNC" "$1"
    elif [ "$MO_TEST" = 1 ]; then
        return 0
    else
        log "ERROR: fsync is unavailable"
        return 1
    fi
}

# fault <step>: test hook. kill:<step> stops the shell like a power loss (no
# trap, no rollback); fail:<step> makes this step fail.
fault() {
    [ "$MO_TEST" = 1 ] || return 0
    case "$MO_FAULT" in
        "kill:$1") log "TEST: power loss at $1"; kill -KILL $$ ;;
        "fail:$1") log "TEST: failure at $1"; return 1 ;;
    esac
    return 0
}

firmware() {
    local ini="$R/jci/version.ini" ver patch
    [ -r "$ini" ] || return 1
    ver=$(grep '^JCI_SW_VER=' "$ini" | cut -d'"' -f2 | tr -d '\r')
    ver=${ver##*_}
    patch=$(grep '^JCI_SW_VER_PATCH=' "$ini" | cut -d'"' -f2 | tr -d '\r')
    case "$ver" in *"$patch") ;; *) ver="$ver$patch" ;; esac
    [ -n "$ver" ] || return 1
    printf '%s\n' "$ver"
}

mount_has() {   # mount_has <mountpoint> <ro|rw>
    awk -v mp="$1" -v want="$2" '
        $2 == mp { n = split($4, o, ","); m = "rw"; for (i = 1; i <= n; i++) if (o[i] == "ro") m = "ro"; mode = m }
        END { exit mode == want ? 0 : 1 }' "$R/proc/mounts" 2>/dev/null
}

# The Service Manager must be running on sm.conf (not sm_WCP.conf).
sm_conf_active() {
    local c cmd
    for c in "$R"/proc/[0-9]*/cmdline; do
        [ -r "$c" ] || continue
        cmd=$(tr '\000' ' ' < "$c" 2>/dev/null)
        case "$cmd" in "/jci/sm/sm -f /jci/sm/sm.conf "*|"/jci/sm/sm -f /jci/sm/sm.conf") return 0 ;; esac
    done
    return 1
}

# ---------------------------------------------------------------- config files

cfg_path() {
    case "$1" in
        sm) echo "$SM" ;; xml) echo "$XML" ;; ucp) echo "$UCP" ;; sys) echo "$SYSAPP" ;;
        opera) echo "$OPERA_INI" ;; gap2) echo "$GAP2" ;;
    esac
}
cfg_sha() {    # cfg_sha <key> <stock|patched>
    case "$1:$2" in
        sm:stock) echo "$SM_STOCK" ;;   sm:patched) echo "$SM_PATCHED" ;;
        xml:stock) echo "$XML_STOCK" ;; xml:patched) echo "$XML_PATCHED" ;;
        ucp:stock) echo "$UCP_STOCK" ;; ucp:patched) echo "$UCP_PATCHED" ;;
        sys:stock) echo "$SYS_STOCK" ;; sys:patched) echo "$SYS_PATCHED" ;;
        opera:stock) echo "$OPERA_STOCK" ;; opera:patched) echo "$OPERA_PATCHED" ;;
        gap2:stock) echo "$GAP2_STOCK" ;; gap2:patched) echo "$GAP2_PATCHED" ;;
    esac
}
cfg_backup() {  # cfg_backup <key>: where the stock copy is kept
    case "$1" in
        sys) echo "$SYS_BACKUP" ;;
        opera) echo "$STATE_DIR/opera.ini.stock" ;;
        gap2) echo "$STATE_DIR/stage_gap2.sh.stock" ;;
        *) local live; live=$(cfg_path "$1"); echo "$BACKUP/${live##*/}" ;;
    esac
}

attrs_ok() { [ "$CHECK_ATTRS" = 0 ] || [ "$(attrs_of "$1")" = "$CFG_MODE $CFG_OWNER" ]; }

# sm_variant <file>: two chars, AA touch (0 1) and the boot trim char (see
# SM_TABLE); empty when the file is none of the 64 known sm.conf files.
sm_variant() {
    local d
    is_file "$1" || return 0
    d=$(sha256_of "$1") || return 0
    printf '%s\n' "$SM_TABLE" | awk -v d="$d" '$2 == d { print $1; exit }'
}

# Boot trim helpers. A trim char is a 5-bit mask: 1 DVD/TV, 2 SiriusXM, 4 Pandora,
# 8 Stitcher, 16 Aha.
trim_mask() { awk -v c="$1" -v d="$TRIM_DIGITS" 'BEGIN { print index(d, c) - 1 }'; }
trim_char() { awk -v n="$1" -v d="$TRIM_DIGITS" 'BEGIN { print substr(d, n + 1, 1) }'; }
trim_has() { [ $(( $(trim_mask "$1") / $2 % 2 )) = 1 ]; }        # trim_has <char> <bit>
trim_group_bit() {  # <dvdtv|sirius|pandora|stitcher|aha>: its bit
    case "$1" in dvdtv) echo 1 ;; sirius) echo 2 ;; pandora) echo 4 ;; stitcher) echo 8 ;; aha) echo 16 ;; *) return 1 ;; esac
}
trim_group_names() {
    case "$1" in dvdtv) echo "$TRIM_DVDTV" ;; sirius) echo "$TRIM_SIRIUS" ;; pandora) echo "$TRIM_PANDORA" ;; stitcher) echo "$TRIM_STITCHER" ;; esac
}
trim_name() {       # trim_name <char>: off | on (the four groups) | aha (all five) | custom
    case "$1" in 0) echo off ;; f) echo on ;; v) echo aha ;; unknown) echo unknown ;; *) echo custom ;; esac
}
trim_list() {       # trim_list <char>: the groups that are on
    local g out=
    for g in dvdtv sirius pandora stitcher aha; do
        trim_has "$1" "$(trim_group_bit "$g")" && out="$out $g"
    done
    echo "${out:- none}"
}

# file_state <key> <file>: stock | patched | unknown (content and attributes).
# For sm.conf this is the AA-touch part only; the boot trim is read apart.
file_state() {
    local d s
    is_file "$2" || { echo unknown; return 0; }
    if [ "$1" = sm ]; then
        case "$(sm_variant "$2")" in
            0?) s=stock ;;
            1?) s=patched ;;
            *) echo unknown; return 0 ;;
        esac
    else
        d=$(sha256_of "$2") || { echo unknown; return 0; }
        if [ "$d" = "$(cfg_sha "$1" stock)" ]; then
            s=stock
        elif [ "$d" = "$(cfg_sha "$1" patched)" ]; then
            s=patched
        else
            echo unknown
            return 0
        fi
    fi
    attrs_ok "$2" || { echo unknown; return 0; }
    echo "$s"
}

# Hash only, for copies in the backup (mode 444) and staging files.
content_is() { [ "$(sha256_of "$2" 2>/dev/null)" = "$(cfg_sha "$1" "$3")" ]; }

sm_transform() {    # sm_transform <src> <dst> <install|remove>
    awk -v mode="$3" -v stock="$SM_LINE_STOCK" -v patched="$SM_LINE_PATCHED" -v env="$SM_ENV_LINE" '
        mode == "install" && $0 == stock { print patched; print env; n++; next }
        mode == "remove" && $0 == patched { print stock; skip = 1; next }
        skip { skip = 0; if ($0 == env) { n++; next } }
        { print }
        END { exit n == 1 ? 0 : 1 }' "$1" > "$2"
}

xml_transform() {   # xml_transform <src> <dst> <install|remove> <use_internally>
    awk -v mode="$3" -v ui="$4" -v anchor="$XML_ANCHOR" '
        BEGIN {
            b[1] = "            <touch_screen>"
            b[2] = "                <use_internally>" ui "</use_internally>"
            b[3] = "                <path>/dev/input/filtered-touchscreen0</path>"
            b[4] = "                <type>AAP_TOUCH_SCREEN_TYPE_CAPACITIVE</type>"
            b[5] = "                <as_secondary_input>false</as_secondary_input>"
            b[6] = "            </touch_screen>"
        }
        mode == "install" { print; if ($0 == anchor) { for (i = 1; i <= 6; i++) print b[i]; n++ } next }
        want > 0 { if ($0 == b[7 - want]) { want--; if (want == 0) n++; next } bad = 1; exit }
        { print; if ($0 == anchor) want = 6 }
        END { exit (n == 1 && want == 0 && !bad) ? 0 : 1 }' "$1" > "$2"
}

trim_transform() {  # trim_transform <src> <dst> <install|remove> <service names>
    awk -v mode="$3" -v names="$4" '
        BEGIN {
            count = split(names, list, " ")
            for (i = 1; i <= count; i++) wanted[list[i]] = 1
            from = mode == "install" ? "autorun=\"yes\"" : "autorun=\"no\""
            to = mode == "install" ? "autorun=\"no\"" : "autorun=\"yes\""
        }
        /<service / && match($0, / name="[^"]*"/) {
            name = substr($0, RSTART + 7, RLENGTH - 8)
            if (name in wanted) { if (index($0, from) == 0) bad = 1; sub(from, to); n++ }
        }
        { print }
        END { exit (n == count && !bad) ? 0 : 1 }' "$1" > "$2"
}

aha_transform() {   # aha_transform <src> <dst> <install|remove>
    awk -v mode="$3" -v stages="$AHA_STAGES" '
        BEGIN {
            count = split(stages, list, " ")
            for (i = 1; i <= count; i++) staged[list[i]] = 1
            dep_from = mode == "install" ? "value=\"blm_ira_aha\"" : "value=\"stage_ir\""
            dep_to = mode == "install" ? "value=\"stage_ir\"" : "value=\"blm_ira_aha\""
            run_from = mode == "install" ? "autorun=\"yes\"" : "autorun=\"no\""
            run_to = mode == "install" ? "autorun=\"no\"" : "autorun=\"yes\""
        }
        /<service / && match($0, / name="[^"]*"/) {
            service = substr($0, RSTART + 7, RLENGTH - 8)
            if (service == "blm_ira_aha") { if (index($0, run_from) == 0) bad = 1; sub(run_from, run_to); n++ }
        }
        /<\/service>/ { print; service = ""; next }
        (service in staged) && index($0, "<dependency type=\"service\" " dep_from "/>") {
            sub(dep_from, dep_to); deps++
        }
        { print }
        END { exit (n == 1 && deps == count && !bad) ? 0 : 1 }' "$1" > "$2"
}

# sm_build <src> <from> <dst> <to>: turn sm.conf variant <from> into <to>
# (two digits, see sm_variant): first undo every change in <from>, then apply
# those in <to>. Intermediate steps stay in /tmp (RAM).
sm_step() {         # sm_step <transform> <install|remove>: on sm_build's $a, via $b
    "$1" "$a" "$b" "$2" && mv -f "$b" "$a"
}

sm_build() {
    local a="$MO_GUARD/sm.a" b="$MO_GUARD/sm.b" from_aa="${2%?}" from_trim="${2#?}" to_aa="${4%?}" to_trim="${4#?}" g bit
    cp "$1" "$a" || return 1
    if [ "$from_aa" != "$to_aa" ]; then
        if [ "$to_aa" = 1 ]; then sm_step sm_transform install || return 1; else sm_step sm_transform remove || return 1; fi
    fi
    for g in dvdtv sirius pandora stitcher aha; do
        bit=$(trim_group_bit "$g")
        if trim_has "$from_trim" "$bit" && ! trim_has "$to_trim" "$bit"; then
            if [ "$g" = aha ]; then sm_step aha_transform remove || return 1
            else sm_trim_step "$g" remove || return 1; fi
        fi
    done
    for g in dvdtv sirius pandora stitcher aha; do
        bit=$(trim_group_bit "$g")
        if trim_has "$to_trim" "$bit" && ! trim_has "$from_trim" "$bit"; then
            if [ "$g" = aha ]; then sm_step aha_transform install || return 1
            else sm_trim_step "$g" install || return 1; fi
        fi
    done
    cp "$a" "$3" || return 1
    rm -f "$a"
}

sm_trim_step() {    # sm_trim_step <group> <install|remove>: on sm_build's $a, via $b
    trim_transform "$a" "$b" "$2" "$(trim_group_names "$1")" && mv -f "$b" "$a"
}

disc_transform() {  # disc_transform <src> <dst> <install|remove>
    awk -v mode="$3" -v start="$DISC_START" -v end="$DISC_END" -v anchor="$DISC_ANCHOR" \
        -v stockbody="$DISC_STOCK_BODY" -v newbody="$DISC_PATCHED_BODY" -v fntext="$DISC_FUNCTION" '
        BEGIN {
            nb = split(mode == "install" ? newbody : stockbody, body, "\n")
            # The stock lines end in "|" so their trailing spaces survive editors.
            for (i = 1; i <= nb; i++) sub(/\|$/, "", body[i])
            nf = split(fntext, fnl, "\n")
            first = fnl[1]
        }
        $0 == start { print; for (i = 1; i <= nb; i++) print body[i]; skip = 1; blocks++; next }
        skip && $0 == end { skip = 0; print; next }
        skip { next }
        mode == "install" && $0 == anchor { for (i = 1; i <= nf; i++) print fnl[i]; print ""; print; anchors++; next }
        mode == "remove" && $0 == first { drop = nf; anchors++ }
        drop > 0 { drop--; if (drop == 0) blank = 1; next }
        blank { blank = 0; if ($0 == "") next }
        { print }
        END { exit (blocks == 1 && anchors == 1 && !skip) ? 0 : 1 }' "$1" > "$2"
}

opera_transform() { # opera_transform <src> <dst> <install|remove>
    awk -v mode="$3" -v off="$OPERA_JS_OFF" -v on="$OPERA_JS_ON" -v xhr="$OPERA_XHR" \
        -v dstock="$OPERA_DIR_STOCK" -v dours="$OPERA_DIR_OURS" '
        mode == "install" && $0 == off { print on; print xhr; a++; next }
        mode == "install" && $0 == dstock { print dours; b++; next }
        mode == "install" && $0 == xhr { bad = 1 }
        mode == "remove" && $0 == on { print off; a++; skip = 1; next }
        mode == "remove" && skip { skip = 0; if ($0 == xhr) next; bad = 1 }
        mode == "remove" && $0 == dours { print dstock; b++; next }
        { print }
        END { exit (a == 1 && b == 1 && !bad) ? 0 : 1 }' "$1" > "$2"
}

gap2_transform() {  # gap2_transform <src> <dst> <install|remove>
    awk -v mode="$3" -v l1="$GAP2_LINE1" -v l2="$GAP2_LINE2" '
        mode == "remove" && ($0 == l1 || $0 == l2) { n++; next }
        { print }
        END {
            if (mode == "install") { print l1; print l2; n = 2 }
            exit n == 2 ? 0 : 1
        }' "$1" > "$2"
}

cfg_transform() {   # cfg_transform <key> <src> <dst> <install|remove>
    case "$1" in
        sm) sm_transform "$2" "$3" "$4" ;;
        xml) xml_transform "$2" "$3" "$4" true ;;
        ucp) xml_transform "$2" "$3" "$4" false ;;
        sys) disc_transform "$2" "$3" "$4" ;;
        opera) opera_transform "$2" "$3" "$4" ;;
        gap2) gap2_transform "$2" "$3" "$4" ;;
        *) return 1 ;;
    esac
}

# make_stock <key> <dst>: the exact stock file, from the backup, the live
# stock file, or by reversing the live patched file. Verified by hash.
make_stock() {
    local key="$1" dst="$2" live bak
    live=$(cfg_path "$key")
    bak=$(cfg_backup "$key")
    rm -f "$dst"
    if is_file "$bak" && content_is "$key" "$bak" stock; then
        cp "$bak" "$dst" || return 1
    elif [ "$key" = sm ] && [ -n "$(sm_variant "$live")" ]; then
        sm_build "$live" "$(sm_variant "$live")" "$dst" 00 || return 1
    elif content_is "$key" "$live" stock; then
        cp "$live" "$dst" || return 1
    elif content_is "$key" "$live" patched; then
        cfg_transform "$key" "$live" "$dst" remove || return 1
    else
        log "ERROR: no verified stock source for ${live#"$R"}"
        return 1
    fi
    content_is "$key" "$dst" stock || { log "ERROR: rebuilt stock ${live#"$R"} does not match its hash"; return 1; }
}

# publish_sm <aa 0|1> <trim char>: sm.conf as that variant. Staged beside the target, verified by hash, renamed atomically.
publish_sm() {
    local want="$1$2" new="${SM%/*}/.sm.conf.miatoff.new" tmp="${SM%/*}/.sm.conf.miatoff.tmp"
    if [ "$(sm_variant "$SM")" = "$want" ] && attrs_ok "$SM"; then
        log "/jci/sm/sm.conf already variant $want"
        return 0
    fi
    fault stage-sm || return 1
    make_stock sm "$tmp" || return 1
    sm_build "$tmp" 00 "$new" "$want" || { log "ERROR: cannot build sm.conf variant $want"; return 1; }
    rm -f "$tmp"
    chmod "$CFG_MODE" "$new" || return 1
    chown "$CFG_OWNER" "$new" 2>/dev/null || [ "$CHECK_ATTRS" = 0 ] || return 1
    [ "$(sm_variant "$new")" = "$want" ] && attrs_ok "$new" || { log "ERROR: staged sm.conf failed verification"; return 1; }
    fsync_path "$new" || return 1
    fault rename-sm || return 1
    mv -f "$new" "$SM" || return 1
    fsync_path "${SM%/*}" || return 1
    [ "$(sm_variant "$SM")" = "$want" ] && attrs_ok "$SM" || { log "ERROR: sm.conf failed read-back"; return 1; }
    log "published sm.conf variant $want (AA touch $1, boot trim $2:$(trim_list "$2")) ($(sha256_of "$SM"))"
}

# publish_cfg <key> <stock|patched>: stage beside the target, verify, rename.
# For sm.conf only the AA-touch part changes; the boot trim stays as it is.
publish_cfg() {
    local key="$1" want="$2" live new tmp v
    if [ "$key" = sm ]; then
        v=$(sm_variant "$SM")
        [ -n "$v" ] || { log "ERROR: sm.conf is not a known variant"; return 1; }
        if [ "$want" = patched ]; then publish_sm 1 "${v#?}"; else publish_sm 0 "${v#?}"; fi
        return
    fi
    live=$(cfg_path "$key")
    [ "$(file_state "$key" "$live")" = "$want" ] && { log "${live#"$R"} already $want"; return 0; }
    new="${live%/*}/.${live##*/}.miatoff.new"
    tmp="${live%/*}/.${live##*/}.miatoff.tmp"
    fault "stage-$key" || return 1
    make_stock "$key" "$tmp" || return 1
    if [ "$want" = patched ]; then
        cfg_transform "$key" "$tmp" "$new" install || { log "ERROR: cannot patch ${live#"$R"}"; return 1; }
        rm -f "$tmp"
    else
        mv -f "$tmp" "$new" || return 1
    fi
    chmod "$CFG_MODE" "$new" || return 1
    chown "$CFG_OWNER" "$new" 2>/dev/null || [ "$CHECK_ATTRS" = 0 ] || return 1
    [ "$(file_state "$key" "$new")" = "$want" ] || { log "ERROR: staged ${live#"$R"} failed verification"; return 1; }
    fsync_path "$new" || return 1
    fault "rename-$key" || return 1
    mv -f "$new" "$live" || return 1
    fsync_path "${live%/*}" || return 1
    [ "$(file_state "$key" "$live")" = "$want" ] || { log "ERROR: ${live#"$R"} failed read-back"; return 1; }
    log "published $want ${live#"$R"} ($(sha256_of "$live"))"
}

# cfg_leftovers <key>...: staged copies of config files left by an interrupted run.
cfg_leftovers() {
    local key live
    for key in "$@"; do
        live=$(cfg_path "$key")
        exists "${live%/*}/.${live##*/}.miatoff.new" && echo "${live%/*}/.${live##*/}.miatoff.new"
        exists "${live%/*}/.${live##*/}.miatoff.tmp" && echo "${live%/*}/.${live##*/}.miatoff.tmp"
    done
    return 0
}

# Meters' own leftovers: they make Meters "partial", not AA touch.
meters_leftovers() {
    local d
    for d in "$MAPP_DIR" "$MJS_DIR"; do
        exists "$d.miatoff.new" && echo "$d.miatoff.new"
        exists "$d.miatoff.old" && echo "$d.miatoff.old"
    done
    cfg_leftovers opera gap2
}

rootfs_leftovers() {
    meters_leftovers
    cfg_leftovers sm xml ucp sys
}

remove_rootfs_leftovers() {
    local f
    for f in $(rootfs_leftovers); do
        if [ -d "$f" ] && [ ! -L "$f" ]; then
            remove_tree "$f" || return 1     # a staged Meters folder
        else
            rm -f "$f" || return 1
        fi
    done
}

# ---------------------------------------------------------------- shim files

shim_state() {      # absent | on | off | unknown
    local on=0 off=0
    if exists "$SHIM"; then
        is_file "$SHIM" && [ "$(sha256_of "$SHIM")" = "$SHIM_SHA256" ] || { echo unknown; return 0; }
        on=1
    fi
    if exists "$SHIM_OFF"; then
        is_file "$SHIM_OFF" && [ "$(sha256_of "$SHIM_OFF")" = "$SHIM_SHA256" ] || { echo unknown; return 0; }
        off=1
    fi
    case "$on$off" in 00) echo absent ;; 10) echo on ;; 01) echo off ;; *) echo unknown ;; esac
}

conf_state() {      # absent | ours | unknown
    exists "$CONF" || { echo absent; return 0; }
    is_file "$CONF" && [ "$(sha256_of "$CONF")" = "$CONF_SHA256" ] && { echo ours; return 0; }
    echo unknown
}

# Files in /data_persist/oem-aa-mod that this kit did not put there.
mod_dir_foreign() {
    local e
    [ -d "$MOD_DIR" ] || return 0
    for e in "$MOD_DIR"/* "$MOD_DIR"/.[!.]* "$MOD_DIR"/..?*; do
        exists "$e" || continue
        case "$e" in "$SHIM"|"$SHIM_OFF"|"$CONF"|"$SHIM_NEW"|"$CONF_NEW") ;; *) echo "${e#"$R"}" ;; esac
    done
}

# copy_verified <src> <tmp> <dst> <sha256> <mode>: data_persist write, atomic.
copy_verified() {
    rm -f "$2"
    cp "$1" "$2" || return 1
    chmod "$5" "$2" || return 1
    [ "$(sha256_of "$2")" = "$4" ] || { log "ERROR: copy of ${1##*/} failed verification"; rm -f "$2"; return 1; }
    fsync_path "$2" || return 1
    mv -f "$2" "$3" || return 1
    fsync_path "${3%/*}"
}

stage_shim_off() {
    local s
    if [ ! -d "$MOD_DIR" ]; then
        mkdir -p "$MOD_DIR" || return 1
        fsync_path "${MOD_DIR%/*}" || return 1
    fi
    fault stage-shim || return 1
    s=$(shim_state)
    case "$s" in
        off) ;;
        on) shim_rename "$SHIM" "$SHIM_OFF" || return 1 ;;
        absent) copy_verified "$STICK_SHIM" "$SHIM_NEW" "$SHIM_OFF" "$SHIM_SHA256" "$SHIM_MODE" || return 1 ;;
        *) log "ERROR: shim state $s"; return 1 ;;
    esac
    if [ "$(conf_state)" != ours ]; then
        copy_verified "$STICK_CONF" "$CONF_NEW" "$CONF" "$CONF_SHA256" 644 || return 1
    fi
    log "staged inactive shim and libpatch.conf in ${MOD_DIR#"$R"}"
}

shim_rename() {
    mv -f "$1" "$2" || return 1
    fsync_path "${2%/*}" || return 1
    log "renamed ${1#"$R"} -> ${2##*/}"
}

purge_mod_dir() {
    rm -f "$SHIM" "$SHIM_OFF" "$CONF" "$SHIM_NEW" "$CONF_NEW" || return 1
    if [ -d "$MOD_DIR" ]; then
        rmdir "$MOD_DIR" || { log "ERROR: ${MOD_DIR#"$R"} holds other files"; return 1; }
        fsync_path "${MOD_DIR%/*}" || return 1
    fi
}

# ---------------------------------------------------------------- backup

backup_state() {    # absent | valid | invalid
    local key live
    exists "$BACKUP" || { echo absent; return 0; }
    [ -d "$BACKUP" ] && [ ! -L "$BACKUP" ] || { echo invalid; return 0; }
    for key in sm xml ucp; do
        live=$(cfg_path "$key")
        content_is "$key" "$BACKUP/${live##*/}" stock || { echo invalid; return 0; }
    done
    echo valid
}

ensure_backup() {
    local key live
    case "$(backup_state)" in
        valid) log "backup present and verified"; return 0 ;;
        invalid) log "ERROR: backup in ${BACKUP#"$R"} is not the stock set"; return 1 ;;
    esac
    discard_backup_new || return 1
    mkdir -p "$BACKUP_NEW" || return 1
    for key in sm xml ucp; do
        live=$(cfg_path "$key")
        make_stock "$key" "$BACKUP_NEW/${live##*/}" || return 1
        chmod 444 "$BACKUP_NEW/${live##*/}" || return 1
        fsync_path "$BACKUP_NEW/${live##*/}" || return 1
    done
    fsync_path "$BACKUP_NEW" || return 1
    fault backup || return 1
    mv "$BACKUP_NEW" "$BACKUP" || return 1
    fsync_path "$STATE_DIR" || return 1
    [ "$(backup_state)" = valid ] || { log "ERROR: backup failed read-back"; return 1; }
    log "backup of stock sm.conf and AAP XMLs written to ${BACKUP#"$R"}"
}

discard_backup_new() {
    exists "$BACKUP_NEW" || return 0
    [ -d "$BACKUP_NEW" ] && [ ! -L "$BACKUP_NEW" ] || return 1
    rm -f "$BACKUP_NEW"/sm.conf "$BACKUP_NEW"/aap_system_attributes.xml "$BACKUP_NEW"/aap_system_attributes_UCP.xml
    rmdir "$BACKUP_NEW"
}

remove_state_dir() {
    local key live parent="${STATE_DIR%/*}"
    discard_backup_new || return 1
    if exists "$BACKUP"; then
        for key in sm xml ucp; do
            live=$(cfg_path "$key")
            rm -f "$BACKUP/${live##*/}" || return 1
        done
        rmdir "$BACKUP" || return 1
    fi
    for key in sys opera gap2; do
        live=$(cfg_backup "$key")
        rm -f "$live" "$live.new" || return 1
    done
    if [ -d "$STATE_DIR" ]; then
        rmdir "$STATE_DIR" || { log "ERROR: ${STATE_DIR#"$R"} holds other files"; return 1; }
    fi
    rmdir "$parent" 2>/dev/null || true
    [ -d "$R/data_persist" ] && fsync_path "$R/data_persist/" || true
}

# ---------------------------------------------------------------- state

S_SM= S_XML= S_UCP= S_SHIM= S_CONF= S_BACKUP= S_TT= S_TRIM= S_DISC= S_METERS= FOREIGN= LEFTOVERS= STATE=
# refresh_state: sets the S_* component states and STATE (AA touch), which is
# one of stock | installed | disabled | partial | unknown, S_TRIM (boot trim char, see SM_TABLE;
# unknown) and S_DISC (startup warning: stock | patched |
# unknown). Runs in the main shell.
refresh_state() {
    S_SM=$(file_state sm "$SM")
    S_DISC=$(file_state sys "$SYSAPP")
    S_METERS=$(meters_state)
    S_TRIM=$(sm_variant "$SM")
    S_TRIM=${S_TRIM#?}
    S_TRIM=${S_TRIM:-unknown}
    S_XML=$(file_state xml "$XML")
    S_UCP=$(file_state ucp "$UCP")
    S_SHIM=$(shim_state)
    S_CONF=$(conf_state)
    S_BACKUP=$(backup_state)
    S_TT=$(touchtune_state)
    FOREIGN=$(mod_dir_foreign)
    LEFTOVERS=$(cfg_leftovers sm xml ucp sys)
    exists "$SHIM_NEW" && LEFTOVERS="$LEFTOVERS ${SHIM_NEW#"$R"}"
    exists "$CONF_NEW" && LEFTOVERS="$LEFTOVERS ${CONF_NEW#"$R"}"
    exists "$BACKUP_NEW" && LEFTOVERS="$LEFTOVERS ${BACKUP_NEW#"$R"}"
    case "$S_SM $S_XML $S_UCP $S_SHIM $S_CONF $S_BACKUP" in
        *unknown*|*invalid*) STATE=unknown; return 0 ;;
    esac
    if [ -n "$FOREIGN" ]; then
        STATE=unknown
    elif [ -z "$LEFTOVERS" ] && aa_files_stock && { other_features_on || ! exists "$STATE_DIR"; }; then
        STATE=stock     # with the boot trim or the warning patch on, their backups stay in STATE_DIR
    elif [ -z "$LEFTOVERS" ] && [ "$S_SM $S_XML $S_UCP $S_CONF $S_SHIM" = "patched patched patched ours on" ]; then
        STATE=installed
    elif [ -z "$LEFTOVERS" ] && [ "$S_SM $S_XML $S_UCP $S_CONF $S_SHIM" = "patched patched patched ours off" ]; then
        STATE=disabled
    else
        STATE=partial
    fi
}

aa_files_stock() {
    [ "$S_SM $S_XML $S_UCP $S_SHIM $S_CONF" = "stock stock stock absent absent" ] && ! exists "$MOD_DIR"
}

# Boot trim or warning patch installed: STATE_DIR then holds their backups.
other_features_on() { [ "$S_TRIM" != 0 ] || [ "$S_DISC" = patched ] || [ "$S_METERS" != off ]; }

report_state() {
    refresh_state
    describe_state > "$REPORT" 2>&1
    cat "$REPORT"
}

describe_state() {
    local f
    printf 'MiatOff AA-touch %s, uptime %s s\n' "$MO_VERSION" "$(uptime_s)"
    printf 'overall:      %s\n' "$STATE"
    printf 'firmware:     %s (wanted %s)\n' "$(firmware || echo unreadable)" "$FW_WANTED"
    printf 'sm.conf:      %s\n' "$S_SM"
    printf 'aap XML:      %s\n' "$S_XML"
    printf 'aap UCP XML:  %s\n' "$S_UCP"
    printf 'shim:         %s\n' "$S_SHIM"
    printf 'libpatch.conf:%s\n' " $S_CONF"
    printf 'backup:       %s\n' "$S_BACKUP"
    printf 'TouchTune:    %s (Common.js)\n' "$S_TT"
    printf 'boot trim:    %s (groups on:%s)\n' "$(trim_name "$S_TRIM")" "$( [ "$S_TRIM" = unknown ] && echo ' ?' || trim_list "$S_TRIM")"
    printf 'disclaimer:   %s (stock = startup warning shown, patched = skipped)\n' "$S_DISC"
    printf 'meters:       %s (app %s, userscript %s)\n' "$S_METERS" "$(area_state app)" "$(area_state userjs)"
    [ -z "$FOREIGN" ] || printf 'foreign:      %s\n' $FOREIGN
    [ -z "$LEFTOVERS" ] || printf 'leftovers:    %s\n' $LEFTOVERS
    f=$(meters_leftovers)
    [ -z "$f" ] || printf 'meters left:  %s\n' $f
    for f in "$SM" "$XML" "$UCP" "$BLM" "$AAP" "$SHIM" "$SHIM_OFF" "$CONF" "$COMMON" "$SYSAPP" "$OPERA_INI" "$GAP2"; do
        exists "$f" || continue
        printf '  %s  %s  %s\n' "$(sha256_of "$f" || echo -)" "$(attrs_of "$f")" "${f#"$R"}"
    done
}

# ---------------------------------------------------------------- preflight

preflight() {
    local fw d
    fw=$(firmware) || { log "ERROR: cannot read firmware version"; return 1; }
    [ "$fw" = "$FW_WANTED" ] || { log "ERROR: firmware $fw, this kit is for $FW_WANTED only"; return 1; }
    d=$(sha256_of "$BLM") && [ "$d" = "$BLM_SHA256" ] || { log "ERROR: /jci/aapa/blmjciaapa.so is not the analysed build (${d:-unreadable})"; return 1; }
    d=$(sha256_of "$AAP") && [ "$d" = "$AAP_SHA256" ] || { log "ERROR: /usr/bin/aap_service is not the analysed build (${d:-unreadable})"; return 1; }
    sm_conf_active || { log "ERROR: the Service Manager is not running on /jci/sm/sm.conf"; return 1; }
    # /data_persist (a symlink on the CMU) must lead to the read-write mount.
    if ! [ -d "$R/data_persist/" ] || ! mount_has /tmp/mnt/data_persist rw || \
        [ "$(stat -c %d "$R/data_persist/." 2>/dev/null)" != "$(stat -c %d "$R/tmp/mnt/data_persist/." 2>/dev/null)" ]; then
        log "ERROR: /data_persist is not the read-write data_persist mount"
        return 1
    fi
    log "preflight OK: firmware $fw, AA binaries match, sm.conf active, /data_persist rw"
}

preflight_payload() {
    [ "$(sha256_of "$STICK_SHIM")" = "$SHIM_SHA256" ] || { log "ERROR: shim on the stick is missing or damaged"; return 1; }
    [ "$(sha256_of "$STICK_CONF")" = "$CONF_SHA256" ] || { log "ERROR: libpatch.conf on the stick is missing or damaged"; return 1; }
    log "stick payload verified"
}

# ---------------------------------------------------------------- root mount

root_rw() {
    [ "$ROOT_WRITABLE" = 1 ] && return 0
    ROOT_WRITABLE=1
    [ "$MO_TEST" = 1 ] && return 0
    log "remounting root read-write"
    mount -o rw,remount / || return 1
    if [ -e "$WATCHDOG" ]; then
        WATCHDOG_DISABLED=1
        printf '1\n' > "$WATCHDOG" && [ "$(tr -d '\r\n' < "$WATCHDOG")" = 1 ] || return 1
    fi
}

root_ro() {
    local failures=0
    sync
    if [ "$ROOT_WRITABLE" = 1 ]; then
        if [ "$MO_TEST" = 1 ]; then
            ROOT_WRITABLE=0
        else
            log "remounting root read-only"
            if mount -o ro,remount / && mount_has / ro; then
                ROOT_WRITABLE=0
            else
                log "ERROR: could not remount root read-only"
                failures=1
            fi
        fi
    fi
    if [ "$WATCHDOG_DISABLED" = 1 ]; then
        log "re-enabling watchdog"
        if printf '0\n' > "$WATCHDOG" && [ "$(tr -d '\r\n' < "$WATCHDOG")" = 0 ]; then
            WATCHDOG_DISABLED=0
        else
            log "ERROR: could not verify watchdog re-enable"
            failures=1
        fi
    fi
    sync
    [ "$failures" = 0 ]
}

# ---------------------------------------------------------------- actions
# Order matters: every step leaves a state that boots to working Android Auto.

do_install() {
    preflight_payload || return 1
    ensure_backup || return 1
    stage_shim_off || return 1              # inactive: nothing loads it yet
    root_rw || return 1
    remove_rootfs_leftovers || return 1
    publish_cfg xml patched || return 1     # touch declared; without the shim it does nothing
    publish_cfg ucp patched || return 1
    publish_cfg sm patched || return 1      # LD_PRELOAD to a missing file is ignored
    root_ro || return 1
    fault activate || return 1
    shim_rename "$SHIM_OFF" "$SHIM" || return 1   # the one step that turns touch on
    refresh_state
    [ "$STATE" = installed ] || { log "ERROR: final state is $STATE, not installed"; return 1; }
}

do_remove() {
    if [ "$(shim_state)" = on ]; then
        shim_rename "$SHIM" "$SHIM_OFF" || return 1   # first: touch off
    fi
    fault remove-config || return 1
    root_rw || return 1
    publish_cfg sm stock || return 1
    publish_cfg xml stock || return 1
    publish_cfg ucp stock || return 1
    remove_rootfs_leftovers || return 1
    root_ro || return 1
    purge_mod_dir || return 1
    # The boot trim and the warning patch are independent; their backups stay while they are on.
    if [ "$(sm_variant "$SM")" = 00 ] && [ "$(file_state sys "$SYSAPP")" != patched ] && [ "$(meters_state)" = off ]; then
        remove_state_dir || return 1
    fi
    refresh_state
    [ "$STATE" = stock ] || { log "ERROR: final state is $STATE, not stock"; return 1; }
}

# ---------------------------------------------------------------- boot trim
# One sm.conf change, independent of AA touch: autorun="no" for the services
# in TRIM_SERVICES. A single atomic rename, so no partial state is possible.

do_trim() {         # do_trim <boot trim char: see SM_TABLE>
    local v wanted="$1"
    v=$(sm_variant "$SM")
    [ -n "$v" ] || { log "ERROR: sm.conf is not a known variant"; return 1; }
    case "$1" in ?) ;; *) return 1 ;; esac
    [ "$(trim_mask "$1")" -ge 0 ] 2>/dev/null && [ "$(trim_mask "$1")" -le 31 ] || return 1
    if [ "$1" != 0 ]; then
        ensure_backup || return 1
    fi
    root_rw || return 1
    if ! publish_sm "${v%?}" "$1"; then
        # sm.conf is unchanged (the rename is the only write); clean up.
        remove_rootfs_leftovers
        root_ro
        refresh_state
        if aa_files_stock && ! other_features_on; then remove_state_dir; fi
        return 1
    fi
    root_ro || return 1
    refresh_state
    if [ "$1" = 0 ] && aa_files_stock && ! other_features_on; then
        remove_state_dir || return 1     # nothing of MiatOff is left on the unit
        refresh_state
    fi
    case "$S_TRIM:$STATE" in
        "$wanted:stock"|"$wanted:installed"|"$wanted:disabled") return 0 ;;
    esac
    log "ERROR: after boot trim: trim $S_TRIM (wanted $wanted), AA touch $STATE"
    return 1
}

# ---------------------------------------------------------------- Meters
# Two folders (the app with the page and the collector, and the userscript),
# copied from the stick and checked file by file against miatoff-app/MANIFEST
# ("<sha256>  <area>/<path>", area app or userjs), then two one-line edits.
# Install order: folders, stage_gap2.sh, opera.ini last (that turns it on);
# removal in reverse. Every state in between boots to a stock HMI.

meters_area_dir() { case "$1" in app) echo "$MAPP_DIR" ;; userjs) echo "$MJS_DIR" ;; esac; }

# remove_tree <dir>: only the MiatOff folders and their staging names.
remove_tree() {
    case "$1" in
        "$MAPP_DIR"|"$MAPP_DIR.miatoff.new"|"$MAPP_DIR.miatoff.old"|\
        "$MJS_DIR"|"$MJS_DIR.miatoff.new"|"$MJS_DIR.miatoff.old") ;;
        *) log "ERROR: refusing to remove $1"; return 1 ;;
    esac
    exists "$1" || return 0
    rm -rf "$1"
}

# manifest_ok: the stick's manifest is sane and every listed file matches it.
manifest_ok() {
    local sum rel extra n=0
    is_file "$MANIFEST" || return 1
    while read -r sum rel extra; do
        [ -n "$sum" ] || continue
        [ -z "$extra" ] || return 1
        case "$rel" in app/?*|userjs/?*) ;; *) return 1 ;; esac
        case "$rel" in *..*|*//*|*/) return 1 ;; esac
        [ "$(sha256_of "$STICK_MAPP/$rel")" = "$sum" ] || return 1
        n=$((n + 1))
    done < "$MANIFEST"
    [ "$n" -gt 0 ]
}

# area_state <area>: absent | ours (exactly the manifest's files) | other
area_state() {
    local area="$1" dir sum rel extra n=0 files
    dir=$(meters_area_dir "$area")
    exists "$dir" || { echo absent; return 0; }
    { [ -d "$dir" ] && [ ! -L "$dir" ] && is_file "$MANIFEST"; } || { echo other; return 0; }
    while read -r sum rel extra; do
        case "$rel" in "$area"/*) ;; *) continue ;; esac
        [ "$(sha256_of "$dir/${rel#*/}" 2>/dev/null)" = "$sum" ] || { echo other; return 0; }
        n=$((n + 1))
    done < "$MANIFEST"
    files=$(find "$dir" -type f 2>/dev/null | wc -l | tr -d ' ')
    [ "$files" = "$n" ] || { echo other; return 0; }
    if [ "$area" = app ]; then
        { [ -L "$dir/meters/live.txt" ] && [ "$(readlink "$dir/meters/live.txt")" = "$LIVE_LINK_TARGET" ]; } ||
            { echo other; return 0; }
    fi
    echo ours
}

meters_state() {    # off | on | partial | unknown
    local o g a j
    o=$(file_state opera "$OPERA_INI")
    g=$(file_state gap2 "$GAP2")
    case "$o $g" in *unknown*) echo unknown; return 0 ;; esac
    a=$(area_state app)
    j=$(area_state userjs)
    [ -z "$(meters_leftovers)" ] || { echo partial; return 0; }
    case "$o $g $a $j" in
        "stock stock absent absent") echo off ;;
        "patched patched ours ours") echo on ;;
        *) echo partial ;;
    esac
}

# install_area <area>: build the folder beside its place, verify, swap it in.
install_area() {
    local area="$1" dir new old sum rel extra d
    dir=$(meters_area_dir "$area")
    new="$dir.miatoff.new"
    old="$dir.miatoff.old"
    remove_tree "$new" || return 1
    mkdir "$new" || return 1
    while read -r sum rel extra; do
        case "$rel" in "$area"/*) ;; *) continue ;; esac
        mkdir -p "$new/$(dirname "${rel#*/}")" || return 1
        cp "$STICK_MAPP/$rel" "$new/${rel#*/}" && chmod 644 "$new/${rel#*/}" || return 1
        [ "$(sha256_of "$new/${rel#*/}")" = "$sum" ] || { log "ERROR: copy of $rel failed verification"; return 1; }
    done < "$MANIFEST"
    if [ "$area" = app ]; then
        mkdir -p "$new/meters" && ln -s "$LIVE_LINK_TARGET" "$new/meters/live.txt" || return 1
    fi
    find "$new" -type d | while IFS= read -r d; do chmod 755 "$d"; done
    sync
    fault "rename-$area" || return 1
    remove_tree "$old" || return 1
    if exists "$dir"; then
        mv "$dir" "$old" || return 1
    fi
    mv "$new" "$dir" || return 1
    fsync_path "${dir%/*}" || return 1
    remove_tree "$old" || return 1
    [ "$(area_state "$area")" = ours ] || { log "ERROR: ${dir#"$R"} failed read-back"; return 1; }
    log "installed ${dir#"$R"}"
}

remove_area() {
    local dir
    dir=$(meters_area_dir "$1")
    remove_tree "$dir.miatoff.new" && remove_tree "$dir.miatoff.old" && remove_tree "$dir" || return 1
    fsync_path "${dir%/*}"
}

meters_off_steps() {
    publish_cfg opera stock && publish_cfg gap2 stock &&
        remove_area userjs && remove_area app && remove_rootfs_leftovers
}

# stop_collector: the collector started at boot runs from the app folder, and
# ash keeps its script open. Replacing or removing the folder would leave an
# open deleted file, and root then cannot go read-only ("busy"). Its own TERM
# handler stops its loops; a running smdb-read is never signalled and finishes
# on its own. stage_gap2.sh starts it again after the restart.
stop_collector() {
    local pid n=0
    pid=$(cat "$COLLECTOR_PIDFILE" 2>/dev/null)
    case "$pid" in ""|*[!0-9]*) return 0 ;; esac
    kill -0 "$pid" 2>/dev/null || return 0
    tr '\000' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q 'miatoff-collector' || return 0
    log "stopping the Meters collector (pid $pid) before its folder changes"
    kill -TERM "$pid" 2>/dev/null
    while kill -0 "$pid" 2>/dev/null && [ "$n" -lt 10 ]; do
        sleep 1
        n=$((n + 1))
    done
    kill -0 "$pid" 2>/dev/null && log "WARNING: the collector did not stop; root may stay busy until the restart"
    return 0
}

# meters_root_ro: everything is in place and verified; if root still cannot go
# read-only (a file kept open), the restart that follows mounts it read-only.
meters_root_ro() {
    root_ro && return 0
    log "WARNING: root stays read-write until the restart (a file is still open); the changes are complete"
    return 0
}

do_meters() {       # do_meters <on | off>
    if [ "$1" = on ]; then
        manifest_ok || { log "ERROR: miatoff-app on the stick is missing or damaged"; return 1; }
        ensure_file_backup opera && ensure_file_backup gap2 || return 1
        stop_collector
        root_rw || return 1
        if ! { remove_rootfs_leftovers && install_area app && install_area userjs &&
               publish_cfg gap2 patched && publish_cfg opera patched; }; then
            log "Meters install failed; rolling back"
            meters_off_steps || log "ERROR: Meters rollback incomplete"
            root_ro
            refresh_state
            [ "$S_METERS" = off ] && rm -f "$(cfg_backup opera)" "$(cfg_backup gap2)"
            if aa_files_stock && ! other_features_on; then remove_state_dir; fi
            return 1
        fi
        meters_root_ro
    else
        stop_collector
        root_rw || return 1
        meters_off_steps || { root_ro; return 1; }
        meters_root_ro
        rm -f "$(cfg_backup opera)" "$(cfg_backup gap2)" || return 1
    fi
    refresh_state
    if [ "$1" = off ] && aa_files_stock && ! other_features_on; then
        remove_state_dir || return 1     # nothing of MiatOff is left on the unit
        refresh_state
    fi
    case "$S_METERS:$STATE" in
        "$1:stock"|"$1:installed"|"$1:disabled") return 0 ;;
    esac
    log "ERROR: after Meters: $S_METERS (wanted $1), AA touch $STATE"
    return 1
}

do_meters_on() { do_meters on; }
do_meters_off() { do_meters off; }

# revert_hmi: take back everything that changes the HMI (Meters, startup
# warning). Used by MIATOFF-RESTORE on the stick and when no dialog appears.
revert_hmi() {
    local ok=0
    refresh_state
    case "$S_METERS" in on|partial) do_meters off || ok=1 ;; esac
    refresh_state
    [ "$S_DISC" = patched ] && { do_disc stock || ok=1; }
    return $ok
}

# ---------------------------------------------------------------- startup warning
# systemApp.js with or without the Disclaimer screen. One atomic rename on root;
# the stock copy is kept in STATE_DIR while the patch is on.

# ensure_file_backup <key>: a verified stock copy of one file in STATE_DIR.
ensure_file_backup() {
    local bak
    bak=$(cfg_backup "$1")
    if is_file "$bak" && content_is "$1" "$bak" stock; then
        return 0
    fi
    exists "$bak" && { log "ERROR: ${bak#"$R"} is not the stock file"; return 1; }
    mkdir -p "$STATE_DIR" || return 1
    make_stock "$1" "$bak.new" || return 1
    chmod 444 "$bak.new" && fsync_path "$bak.new" || return 1
    mv "$bak.new" "$bak" && fsync_path "$STATE_DIR" || return 1
    log "backup of stock ${bak##*/} written to ${STATE_DIR#"$R"}"
}

ensure_sys_backup() { ensure_file_backup sys; }

do_disc() {         # do_disc <patched | stock>
    if [ "$1" = patched ]; then
        ensure_sys_backup || return 1
    fi
    root_rw || return 1
    if ! publish_cfg sys "$1"; then
        # systemApp.js is unchanged (the rename is the only write); clean up.
        remove_rootfs_leftovers
        root_ro
        refresh_state
        if [ "$S_DISC" != patched ]; then
            rm -f "$SYS_BACKUP" "$SYS_BACKUP.new"
            if aa_files_stock && ! other_features_on; then remove_state_dir; fi
        fi
        return 1
    fi
    root_ro || return 1
    refresh_state
    if [ "$1" = stock ]; then
        rm -f "$SYS_BACKUP" "$SYS_BACKUP.new" || return 1
        if aa_files_stock && ! other_features_on; then
            remove_state_dir || return 1     # nothing of MiatOff is left on the unit
        fi
        refresh_state
    fi
    case "$S_DISC:$STATE" in
        "$1:stock"|"$1:installed"|"$1:disabled") return 0 ;;
    esac
    log "ERROR: after warning patch: systemApp.js $S_DISC (wanted $1), AA touch $STATE"
    return 1
}

do_disc_off() { do_disc patched; }      # warning off = the patch on
do_disc_on() { do_disc stock; }

do_trim_on() { do_trim f; }
do_trim_aha() { do_trim v; }
do_trim_off() { do_trim 0; }

# trim_<group>_<on|off>: one group of the boot trim.
trim_group_char() { # trim_group_char <action>: the trim char after the action
    local rest="${1#trim_}" g dir bit n
    g=${rest%_*}
    dir=${rest##*_}
    bit=$(trim_group_bit "$g") || return 1
    n=$(trim_mask "$S_TRIM")
    if [ "$dir" = on ]; then n=$((n + bit)); else n=$((n - bit)); fi
    trim_char "$n"
}
do_trim_group() { do_trim "$(trim_group_char "$1")"; }

# ---------------------------------------------------------------- TouchTune
# Step 1 of the one-stick flow: the unmodified TouchTune 1.2.1 release lives in
# touchtune/ on this stick. It verifies its own payload, firmware and Common.js,
# writes touchtune/touchtune.log, and requests its own SafeReboot. It touches
# only Common.js and two NVRAM keys, none of the files above.

touchtune_state() { # stock | installed | unknown
    case "$(sha256_of "$COMMON" 2>/dev/null)" in
        "$COMMON_STOCK") echo stock ;;
        "$COMMON_PATCHED") echo installed ;;
        *) echo unknown ;;
    esac
}

run_touchtune() {
    is_file "$TT_SCRIPT" || { log "ERROR: TouchTune is not on this stick"; return 1; }
    log "starting TouchTune ($1); see touchtune/touchtune.log"
    if [ "$MO_TEST" = 1 ]; then
        MZD_TEST_MODE=1 MZD_ROOT="$R" sh "$TT_SCRIPT" "$1"
    else
        MZD_TEST_MODE=0 sh "$TT_SCRIPT" "$1"
    fi
}

do_tt_install() { run_touchtune touch-while-driving; }
do_tt_remove() { run_touchtune --restore; }

do_disable() {
    shim_rename "$SHIM" "$SHIM_OFF" || return 1
    refresh_state
    [ "$STATE" = disabled ]
}

do_enable() {
    shim_rename "$SHIM_OFF" "$SHIM" || return 1
    refresh_state
    [ "$STATE" = installed ]
}

# ---------------------------------------------------------------- plan
# miatoff-plan.txt holds the end state chosen in the PC builder, one key=value per
# line: touchtune, aa_touch, meters, warning, trim_dvdtv, trim_sirius, trim_pandora,
# trim_stitcher, trim_aha = install | remove | keep. Every run offers the next step that
# differs from the unit's current state, so the plan is followed one confirmed
# step (and one restart) at a time. An invalid plan is ignored.

plan_valid() {
    [ -f "$PLAN" ] || return 1
    awk '
        /^[ \t\r]*(#|$)/ { next }
        { gsub(/[ \t\r]/, ""); split($0, kv, "="); k = kv[1]; v = kv[2]
          if (k == "touchtune" || k == "aa_touch" || k == "meters" || k == "warning")
              ok = (v == "install" || v == "remove" || v == "keep")
          else if (k == "trim_dvdtv" || k == "trim_sirius" || k == "trim_pandora" || k == "trim_stitcher" || k == "trim_aha")
              ok = (v == "install" || v == "remove" || v == "keep")
          else ok = 0
          if (!ok) bad = 1; seen = 1 }
        END { exit (bad || !seen) }' "$PLAN"
}

plan_get() { awk -F= -v k="$1" '{ gsub(/[ \t\r]/, "") } $1 == k { print $2; exit }' "$PLAN"; }

# plan_target_trim: the boot trim char the plan asks for, starting from the current one.
# All trim groups of the plan are done in one step (one sm.conf, one restart).
plan_target_trim() {
    local n g bit v
    [ "$S_TRIM" != unknown ] || return 0
    n=$(trim_mask "$S_TRIM")
    for g in dvdtv sirius pandora stitcher aha; do
        bit=$(trim_group_bit "$g")
        v=$(plan_get "trim_$g")
        if [ "$v" = install ] && [ $((n / bit % 2)) = 0 ]; then n=$((n + bit))
        elif [ "$v" = remove ] && [ $((n / bit % 2)) = 1 ]; then n=$((n - bit)); fi
    done
    trim_char "$n"
}

plan_trim_diff() {  # plan_trim_diff <on|off>: labels of the groups the trim step turns off (on) or back on (off) at boot
    local cur tgt g bit label out=
    cur=$(trim_mask "$S_TRIM")
    tgt=$(trim_mask "$(plan_target_trim)")
    for g in dvdtv sirius pandora stitcher aha; do
        bit=$(trim_group_bit "$g")
        case "$g" in dvdtv) label="DVD/TV" ;; sirius) label=SiriusXM ;; pandora) label=Pandora ;; stitcher) label=Stitcher ;; aha) label=Aha ;; esac
        if [ "$1" = on ] && [ $((cur / bit % 2)) = 0 ] && [ $((tgt / bit % 2)) = 1 ]; then out="$out, $label"; fi
        if [ "$1" = off ] && [ $((cur / bit % 2)) = 1 ] && [ $((tgt / bit % 2)) = 0 ]; then out="$out, $label"; fi
    done
    echo "${out#, }"
}

do_trim_plan() { do_trim "$(plan_target_trim)"; }

# plan_candidates <state>: the plan's steps in a safe order, removals first
# (AA touch before TouchTune), then installs (TouchTune before AA touch).
plan_candidates() {
    local aa tt me wa g v
    aa=$(plan_get aa_touch); tt=$(plan_get touchtune); me=$(plan_get meters)
    wa=$(plan_get warning)
    [ "$aa" = remove ] && echo remove
    [ "$tt" = remove ] && echo tt_remove
    [ "$me" = remove ] && echo meters_off
    [ "$wa" = remove ] && echo disc_on
    [ -n "$(plan_target_trim)" ] && [ "$(plan_target_trim)" != "$S_TRIM" ] && echo trim_plan
    [ "$me" = install ] && echo meters_on
    [ "$wa" = install ] && echo disc_off
    [ "$tt" = install ] && is_file "$TT_SCRIPT" && echo tt_install
    if [ "$aa" = install ]; then
        case "$1" in disabled) echo enable ;; *) echo install ;; esac
    fi
    return 0
}

plan_next() {       # plan_next <state>: prints the next allowed step, or nothing
    local act
    plan_valid || return 0
    for act in $(plan_candidates "$1"); do
        if action_allowed "$1" "$act"; then
            echo "$act"
            return 0
        fi
    done
    return 0
}

plan_text() {
    local on off text
    case "$1" in
        remove) echo "remove touch in Android Auto" ;;
        install) echo "install touch in Android Auto" ;;
        enable) echo "enable touch in Android Auto" ;;
        tt_install) echo "install TouchTune (touch while driving)" ;;
        tt_remove) echo "remove TouchTune" ;;
        trim_on) echo "boot trim on" ;;
        trim_aha) echo "boot trim on, with Aha off too" ;;
        trim_off) echo "boot trim off" ;;
        trim_plan)
            on=$(plan_trim_diff on); off=$(plan_trim_diff off)
            text="boot trim:"
            [ -z "$on" ] || text="$text stop $on from starting"
            [ -z "$on" ] || [ -z "$off" ] || text="$text; and"
            [ -z "$off" ] || text="$text let $off start again"
            echo "$text" ;;
        trim_dvdtv_on) echo "stop DVD and TV from starting" ;;
        trim_dvdtv_off) echo "let DVD and TV start again" ;;
        trim_sirius_on) echo "stop SiriusXM from starting" ;;
        trim_sirius_off) echo "let SiriusXM start again" ;;
        trim_pandora_on) echo "stop Pandora from starting" ;;
        trim_pandora_off) echo "let Pandora start again" ;;
        trim_stitcher_on) echo "stop Stitcher from starting" ;;
        trim_stitcher_off) echo "let Stitcher start again" ;;
        trim_aha_on) echo "stop Aha from starting" ;;
        trim_aha_off) echo "let Aha start again" ;;
        disc_off) echo "skip the startup warning" ;;
        disc_on) echo "show the startup warning again" ;;
        meters_on) echo "install Meters" ;;
        meters_off) echo "remove Meters" ;;
        *) echo "$1" ;;
    esac
}

plan_blockers() {   # plan_blockers <state>: why a wanted step cannot run now, one line each
    local tt g
    tt=$(plan_get touchtune)
    if [ "$tt" = install ] && [ "$S_TT" = stock ]; then
        is_file "$TT_SCRIPT" || echo "TouchTune is not on this stick."
        [ "$1" = stock ] || echo "Remove touch in Android Auto first, then install TouchTune."
    fi
    if [ "$tt" = remove ] && [ "$S_TT" = installed ] && [ "$1" != stock ]; then
        echo "Remove touch in Android Auto before TouchTune."
    fi
    if [ "$tt" != keep ] && [ "$S_TT" != stock ] && [ "$S_TT" != installed ]; then
        echo "Common.js is not a known version (TouchTune)."
    fi
    if [ "$(plan_get warning)" != keep ] && [ "$S_DISC" != stock ] && [ "$S_DISC" != patched ]; then
        echo "systemApp.js is not a known version (startup warning)."
    fi
    if [ "$(plan_get meters)" != keep ] && [ "$S_METERS" = unknown ]; then
        echo "opera.ini or stage_gap2.sh is not a known version (Meters)."
    fi
    if [ "$S_TRIM" = unknown ]; then
        for g in dvdtv sirius pandora stitcher aha; do
            case "$(plan_get "trim_$g")" in install|remove) echo "sm.conf is not a known version (boot trim)."; break ;; esac
        done
    fi
    return 0
}

plan_report() {     # plan_report <state>: say why the plan has nothing more to run
    local why text= line
    why=$(plan_blockers "$1")
    if [ -n "$why" ]; then
        log "plan not finished: $(printf '%s' "$why" | tr '\n' ';')" >&2
        while IFS= read -r line; do text="$text$line\n"; done <<EOF
$why
EOF
        popup "Your plan is not finished.\n\n${text}\nNothing was changed."
    else
        log "plan: nothing left to do for state $1" >&2
        popup "Your plan is complete.\n\nNothing left to do. You can remove the USB."
    fi
}

plan_button() {     # plan_button <action>: INSTALL for steps that add something, REMOVE for those that undo it
    case "$1" in
        trim_plan) [ -n "$(plan_trim_diff on)" ] && echo INSTALL || echo REMOVE ;;
        remove|tt_remove|meters_off|disc_on|trim_off|trim_*_off) echo REMOVE ;;
        *) echo INSTALL ;;
    esac
}

choose_action() {   # choose_action <state>: prints the action
    local a next
    if [ "$MO_TEST" = 1 ]; then
        if [ -z "$MO_ACTION" ]; then
            next=$(plan_next "$1")
            [ -n "$next" ] || { [ "$1" = partial ] || plan_report "$1"; }
            printf '%s\n' "${next:-cancel}"
        else
            printf '%s\n' "$MO_ACTION"
        fi
        return 0
    fi
    # A plan from the PC builder decides what is offered: its next step, or nothing.
    # A half-finished install still gets the recovery dialog below.
    next=$(plan_next "$1")
    if [ -n "$next" ]; then
        a=$(ask "$(plan_button "$next")" CANCEL "MiatOff plan\n\nNext step: $(plan_text "$next")\n\nThe unit restarts afterwards.") || return 1
        case "$a" in 0) echo "$next" ;; *) echo cancel ;; esac
        return 0
    elif plan_valid && [ "$1" != partial ] && [ "$S_METERS" != partial ]; then
        plan_report "$1"
        echo cancel
        return 0
    fi
    # Main menu: Android Auto touch or the extras. An unfinished AA run is
    # handled first.
    if [ "$1" != partial ]; then
        a=$(ask "ANDROID AUTO" EXTRA CANCEL "MiatOff\n\nAndroid Auto touch: $1\nBoot trim: $(trim_name "$S_TRIM")\nStartup warning: $(disc_label)\nMeters: $(meters_label)\n\nChoose a component.") || return 1
        case "$a" in
            1) choose_extra; return ;;
            2) echo cancel; return 0 ;;
        esac
    fi
    choose_aa "$1"
}

disc_label() { case "$S_DISC" in stock) echo on ;; patched) echo removed ;; *) echo unknown ;; esac; }
meters_label() {
    case "$S_METERS" in off) echo off ;; on) echo on ;; partial) echo incomplete ;; *) echo unknown ;; esac
}

# Each next dialog has its own CANCEL.
choose_extra() {
    local a
    a=$(ask TRIM WARNING METERS "Extras\n\nTRIM = turn off services ($(trim_name "$S_TRIM"))\nWARNING = startup warning ($(disc_label))\nMETERS = gauges in Applications ($(meters_label))") || return 1
    case "$a" in
        0) choose_trim ;;
        1) choose_disc ;;
        2) choose_meters ;;
        *) echo cancel ;;
    esac
}

choose_meters() {
    local a
    case "$S_METERS" in
        off)
            a=$(ask INSTALL CANCEL "Install Meters?\n\nGauges under Applications > Meters.\nThe collector starts at every boot.\nThe unit restarts afterwards.") || return 1
            case "$a" in 0) echo meters_on ;; *) echo cancel ;; esac ;;
        on)
            a=$(ask REMOVE CANCEL "Meters is installed.\n\nREMOVE = remove everything of Meters") || return 1
            case "$a" in 0) echo meters_off ;; *) echo cancel ;; esac ;;
        partial)
            a=$(ask REPAIR REMOVE CANCEL "Meters is incomplete or older than\nthis stick.\n\nREPAIR = install from this stick\nREMOVE = remove everything of Meters") || return 1
            case "$a" in 0) echo meters_on ;; 1) echo meters_off ;; *) echo cancel ;; esac ;;
        *)
            popup "opera.ini or stage_gap2.sh is not the analysed file.\n\nNothing was changed."
            echo cancel ;;
    esac
}

choose_disc() {
    local a
    case "$S_DISC" in
        stock)
            a=$(ask REMOVE CANCEL "Remove the startup warning?\n\nThe screen is skipped,\nas if you pressed AGREE.\nThe unit restarts afterwards.") || return 1
            case "$a" in 0) echo disc_off ;; *) echo cancel ;; esac ;;
        patched)
            a=$(ask RESTORE CANCEL "The startup warning has been removed.\n\nRESTORE = back to stock") || return 1
            case "$a" in 0) echo disc_on ;; *) echo cancel ;; esac ;;
        *)
            popup "systemApp.js is not the analysed file.\n\nNothing was changed."
            echo cancel ;;
    esac
}

choose_trim() {
    local a
    case "$(trim_name "$S_TRIM")" in
        off)
            a=$(ask DISABLE "WITH AHA" CANCEL "Stop DVD, TV, SiriusXM, Pandora\nand Stitcher from starting at boot?\n\nWITH AHA = Aha off too\nThe unit restarts afterwards.") || return 1
            case "$a" in 0) echo trim_on ;; 1) echo trim_aha ;; *) echo cancel ;; esac ;;
        on)
            a=$(ask RESTORE "ALSO AHA" CANCEL "DVD, TV, SiriusXM, Pandora and Stitcher\nno longer start at boot.\n\nRESTORE = back to stock\nALSO AHA = Aha off too") || return 1
            case "$a" in 0) echo trim_off ;; 1) echo trim_aha ;; *) echo cancel ;; esac ;;
        aha)
            a=$(ask RESTORE "AHA BACK" CANCEL "DVD, TV, SiriusXM, Pandora, Stitcher\nand Aha no longer start at boot.\n\nRESTORE = back to stock\nAHA BACK = only Aha on again") || return 1
            case "$a" in 0) echo trim_off ;; 1) echo trim_on ;; *) echo cancel ;; esac ;;
        custom)
            a=$(ask RESTORE CANCEL "Boot trim is on for:$(trim_list "$S_TRIM")\n\nRESTORE = all back to stock\nChange single parts in the PC builder.") || return 1
            case "$a" in 0) echo trim_off ;; *) echo cancel ;; esac ;;
        *) return 1 ;;
    esac
}

choose_aa() {       # choose_aa <state>: prints the action
    local a
    case "$1" in
        stock)
            if [ "$S_TT" = stock ] && is_file "$TT_SCRIPT"; then
                a=$(ask TOUCHTUNE "AA ONLY" CANCEL "Step 1 of 2: TouchTune\n(touch while driving in the Mazda menus).\nThe unit restarts afterwards.\n\nStep 2: plug the USB in again\nfor touch in Android Auto.") || return 1
                case "$a" in 0) echo tt_install ;; 1) echo install ;; *) echo cancel ;; esac
            elif [ "$S_TT" = installed ] && is_file "$TT_SCRIPT"; then
                a=$(ask INSTALL "REMOVE TT" CANCEL "Step 2 of 2: install touch in Android Auto?\nTouchTune is already installed.\nThe unit restarts afterwards.\n\nREMOVE TT = take TouchTune off") || return 1
                case "$a" in 0) echo install ;; 1) echo tt_remove ;; *) echo cancel ;; esac
            else
                a=$(ask INSTALL CANCEL "Install touch in Android Auto?\n\nTouch only; everything else stays stock.\nThe unit restarts afterwards.") || return 1
                case "$a" in 0) echo install ;; *) echo cancel ;; esac
            fi ;;
        installed)
            a=$(ask DISABLE REMOVE CANCEL "Touch in Android Auto is installed.\n\nDISABLE = temporarily off (fast)\nREMOVE = everything back to stock") || return 1
            case "$a" in 0) echo disable ;; 1) echo remove ;; *) echo cancel ;; esac ;;
        disabled)
            a=$(ask ENABLE REMOVE CANCEL "Touch in Android Auto is disabled.\n\nENABLE = on again\nREMOVE = everything back to stock") || return 1
            case "$a" in 0) echo enable ;; 1) echo remove ;; *) echo cancel ;; esac ;;
        partial)
            a=$(ask FINISH REMOVE CANCEL "A previous run was not finished.\nAndroid Auto works, without touch.\n\nFINISH = complete the installation\nREMOVE = back to stock") || return 1
            case "$a" in 0) echo install ;; 1) echo remove ;; *) echo cancel ;; esac ;;
        *) return 1 ;;
    esac
}

trim_group_allowed() {  # trim_group_allowed <trim_<group>_<on|off>> <on|off>
    local rest="${1#trim_}" bit
    bit=$(trim_group_bit "${rest%_*}") || return 1
    [ "$S_TRIM" != unknown ] || return 1
    if [ "$2" = on ]; then ! trim_has "$S_TRIM" "$bit"; else trim_has "$S_TRIM" "$bit"; fi
}

action_allowed() {  # action_allowed <state> <action>
    case "$1:$2" in
        *:cancel|stock:install|partial:install|partial:remove|installed:disable|installed:remove|disabled:enable|disabled:remove) return 0 ;;
        stock:tt_install) [ "$S_TT" = stock ]; return ;;
        stock:tt_remove) [ "$S_TT" = installed ]; return ;;
        stock:trim_on|installed:trim_on|disabled:trim_on) [ "$S_TRIM" != unknown ] && [ "$S_TRIM" != f ]; return ;;
        stock:trim_aha|installed:trim_aha|disabled:trim_aha) [ "$S_TRIM" != unknown ] && [ "$S_TRIM" != v ]; return ;;
        stock:trim_off|installed:trim_off|disabled:trim_off) [ "$S_TRIM" != unknown ] && [ "$S_TRIM" != 0 ]; return ;;
        stock:trim_plan|installed:trim_plan|disabled:trim_plan)
            [ "$S_TRIM" != unknown ] && [ -n "$(plan_target_trim)" ] && [ "$(plan_target_trim)" != "$S_TRIM" ]; return ;;
        stock:trim_*_on|installed:trim_*_on|disabled:trim_*_on) trim_group_allowed "$2" on; return ;;
        stock:trim_*_off|installed:trim_*_off|disabled:trim_*_off) trim_group_allowed "$2" off; return ;;
        stock:disc_off|installed:disc_off|disabled:disc_off) [ "$S_DISC" = stock ]; return ;;
        stock:disc_on|installed:disc_on|disabled:disc_on) [ "$S_DISC" = patched ]; return ;;
        stock:meters_on|installed:meters_on|disabled:meters_on) [ "$S_METERS" = off ] || [ "$S_METERS" = partial ]; return ;;
        stock:meters_off|installed:meters_off|disabled:meters_off) [ "$S_METERS" = on ] || [ "$S_METERS" = partial ]; return ;;
    esac
    return 1
}

safe_reboot() {
    local reply status
    [ "$MO_TEST" = 1 ] && { log "test mode: no reboot"; return 0; }
    [ -x /usr/bin/dbus-send ] || { log "ERROR: dbus-send is unavailable"; return 1; }
    log "requesting SafeReboot"
    sync        # the log on the USB stick must be complete before the unit goes down
    reply=$(/usr/bin/dbus-send --address=unix:path=/tmp/dbus_service_socket \
        --print-reply --reply-timeout=5000 --type=method_call \
        --dest=com.jci.blm.system /com/jci/blm/system \
        com.jci.blmsystem.Interface.SafeReboot 2>&1) || { log "ERROR: SafeReboot failed: $reply"; return 1; }
    status=$(printf '%s\n' "$reply" | awk '$1 == "int32" { print $2; exit }')
    [ "$status" = 100 ] || { log "ERROR: SafeReboot returned ${status:-no status}; no raw reboot"; return 1; }
    log "Mazda SafeReboot accepted"
}

# ---------------------------------------------------------------- main

cleanup() {
    status=$?
    trap - 0
    trap '' HUP INT TERM
    # Interrupted with root writable: put the mount and watchdog back. Every
    # step leaves a bootable state, so no rollback is attempted here.
    [ "$ROOT_WRITABLE" = 0 ] && [ "$WATCHDOG_DISABLED" = 0 ] || root_ro || status=1
    sync 2>/dev/null
    [ "$GUARD_CREATED" = 0 ] || { rm -f "$MO_GUARD/pid" "$MO_GUARD/sm.a" "$MO_GUARD/sm.b"; rmdir "$MO_GUARD" 2>/dev/null; }
    exit "$status"
}
trap cleanup 0
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

if [ ! -d "$R/jci" ]; then
    echo "ERROR: /jci not found; this script runs on a Mazda CMU." >&2
    exit 1
fi
if [ "$MO_TEST" != 1 ]; then
    case "$USB" in
        /tmp/mnt/sd[a-z][0-9]) ;;
        *) echo "ERROR: not started from a USB stick ($USB)" >&2; exit 1 ;;
    esac
    mount -o rw,remount "$USB" 2>/dev/null || true
fi
if : >> "$LOG" 2>/dev/null; then
    exec >> "$LOG" 2>&1
else
    popup "The USB is not writable.\n\nNothing was changed."
    exit 1
fi
log "=== MiatOff AA-touch $MO_VERSION started from $USB ==="

# A guard left by a run that was cut off is taken over, also when its PID has
# since been reused by another process (or by this run).
if ! mkdir "$MO_GUARD" 2>/dev/null; then
    old_pid=$(tr -cd '0-9' < "$MO_GUARD/pid" 2>/dev/null)
    if [ -n "$old_pid" ] && [ "$old_pid" != "$$" ] && kill -0 "$old_pid" 2>/dev/null && \
        tr '\000' ' ' < "/proc/$old_pid/cmdline" 2>/dev/null | grep -q 'aa-touch\.sh'; then
        log "another run is active (pid $old_pid); exiting"
        exit 0
    fi
    log "stale guard (pid ${old_pid:-?} gone); taking over"
    rm -f "$MO_GUARD/pid" "$MO_GUARD/sm.a" "$MO_GUARD/sm.b"
    rmdir "$MO_GUARD" 2>/dev/null
    mkdir "$MO_GUARD" 2>/dev/null || { log "ERROR: cannot take guard $MO_GUARD"; exit 1; }
fi
GUARD_CREATED=1
echo $$ > "$MO_GUARD/pid"

if [ -z "$OPENSSL" ] && [ "$HAVE_SHA256SUM" = 0 ]; then
    log "ERROR: no sha256 tool (openssl)"
    popup "No sha256 tool found.\n\nNothing was changed."
    exit 1
fi
[ "$MO_TEST" = 1 ] && [ "${MO_TEST_ATTRS:-0}" = 0 ] && CHECK_ATTRS=0

if ! preflight; then
    report_state
    popup "This unit differs from the analysed state.\n\nNothing was changed.\nSee miatoff-aa-touch.log on the USB."
    exit 1
fi

report_state

# Emergency route for a broken HMI (where a dialog may not show): take back
# Meters and the startup-warning patch, then restart. Triggered by the file
# MIATOFF-RESTORE on the stick, or by two failed dialogs while one is on.
hmi_emergency() {
    log "EMERGENCY ($1): reverting the HMI changes (Meters, startup warning)"
    if [ "$S_METERS" = off ] && [ "$S_DISC" != patched ]; then
        log "nothing to revert: Meters off and the startup warning is stock; no restart"
        exit 0
    fi
    if revert_hmi; then log "HMI changes reverted"; else log "ERROR: HMI revert incomplete"; fi
    report_state
    sync
    safe_reboot
    exit 0
}
if [ -f "$RESTORE" ]; then
    hmi_emergency "MIATOFF-RESTORE on the stick"
fi

if [ "$STATE" = unknown ]; then
    log "ERROR: unknown state; refusing to change anything"
    popup "Unknown state of the Android Auto files.\n\nNothing was changed.\nSee aa-touch-state.txt on the USB."
    exit 1
fi
NVRAM_LVDS=
[ -r "$R/sys/class/nvram/nv-config/keys/lvds_speed_restriction" ] && \
    NVRAM_LVDS=$(tr -d '\r\n' < "$R/sys/class/nvram/nv-config/keys/lvds_speed_restriction" 2>/dev/null)
log "NVRAM lvds_speed_restriction=${NVRAM_LVDS:-absent (factory: enable)} (touch while driving needs TouchTune)"

if ! ACTION=$(choose_action "$STATE"); then
    if [ "$S_METERS" = off ] && [ "$S_DISC" != patched ]; then
        log "ERROR: dialog failed; nothing done"
        exit 1
    fi
    log "dialog failed with HMI changes installed; trying again in 10 s"
    sleep 10
    ACTION=$(choose_action "$STATE") || hmi_emergency "no dialog twice"
fi
log "state $STATE, action $ACTION"
action_allowed "$STATE" "$ACTION" || { log "ERROR: action $ACTION not allowed in state $STATE"; exit 1; }
[ "$ACTION" = cancel ] && { log "cancelled; nothing done"; exit 0; }

case "$ACTION" in
    install) popup "Installing touch for Android Auto...\n\nDo not remove the USB, do not press any buttons." ;;
    remove) popup "Restoring to stock...\n\nDo not remove the USB, do not press any buttons." ;;
    tt_*) ;;                            # TouchTune shows its own messages
    *) popup "Working...\n\nDo not remove the USB." ;;
esac

result=0
case "$ACTION" in
    trim_*_on|trim_*_off) do_trim_group "$ACTION" || result=1 ;;
    *) "do_$ACTION" || result=1 ;;
esac
root_ro || result=1

case "$ACTION" in
    tt_*)
        # TouchTune already showed its result and, on success, requested its
        # own SafeReboot. No popup or reboot from here on top of that.
        report_state
        sync
        if [ "$result" = 0 ]; then
            log "TouchTune finished ($ACTION, now $S_TT); it requested the restart itself"
            exit 0
        fi
        log "FAILED: TouchTune $ACTION (TouchTune now $S_TT); see touchtune/touchtune.log"
        exit 1
        ;;
esac

refresh_state
if [ "$result" != 0 ] && [ "$ACTION" = install ] && [ "$STATE" != stock ]; then
    log "install failed in state $STATE; rolling back to stock"
    if do_remove && root_ro; then
        RESULT_TEXT="Installation failed and restored to stock."
    else
        root_ro
        RESULT_TEXT="Installation failed; restore incomplete.\nAndroid Auto works without touch.\nStart again and choose REMOVE."
    fi
fi

report_state
sync

if [ "$result" != 0 ]; then
    log "FAILED ($ACTION); final state $STATE; no reboot"
    popup "${RESULT_TEXT:-Failed; final state: $STATE.\nStart again with this USB.}\n\nSee miatoff-aa-touch.log on the USB."
    exit 1
fi

case "$ACTION" in
    install) done_text="Touch in Android Auto is installed." ;;
    remove) done_text="Everything has been restored to stock." ;;
    disable) done_text="Touch in Android Auto is disabled." ;;
    enable) done_text="Touch in Android Auto is on again." ;;
    trim_on) done_text="DVD, TV, SiriusXM, Pandora and Stitcher\nno longer start at boot." ;;
    trim_aha) done_text="DVD, TV, SiriusXM, Pandora, Stitcher\nand Aha no longer start at boot." ;;
    trim_off) done_text="Boot trim restored to stock." ;;
    disc_off) done_text="The startup warning has been removed." ;;
    disc_on) done_text="The startup warning is on again." ;;
    meters_on) done_text="Meters is under Applications.\nThe collector starts at every boot." ;;
    meters_off) done_text="Meters has been removed." ;;
esac
log "done: $ACTION, state $STATE; requesting SafeReboot"
popup "$done_text\n\nRemove the USB. The unit is restarting..."
if ! safe_reboot; then
    popup "$done_text\n\nRestart failed: switch the car off and on again."
    exit 1
fi
exit 0

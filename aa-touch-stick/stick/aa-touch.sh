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
#                                        (sm_WCP.conf instead on a unit whose Service
#                                        Manager runs that one: wireless CarPlay on)
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
# Shorter list delay (menu EXTRA -> MORE -> DELAY) is a fixed edit of four
# autoscroll timings in /jci/gui/common/controls/List2/js/List2Ctrl.js (after
# MZD-AIO "Shorter Delay Mod"). Camera text (menu EXTRA -> MORE -> CAMERA)
# replaces the reversing-camera safety text images
# /jci/nativegui/images/SafetyText_*.png with a blank one (from MZD-AIO); the
# originals are kept in /data_persist/miatoff/aa-touch/safety. Parking sensors
# (menu EXTRA -> MORE -> CAMERA -> SENSORS) do the same with MZD-AIO's
# semi-transparent parking sensor graphics (originals in .../sensors).
# The file MIATOFF-RESTORE on the stick takes back Meters, the warning patch
# and the list delay without a dialog.
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

MO_VERSION=1.6.0
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
# The same 64 variants of sm_WCP.conf, the config the Service Manager runs on a
# unit with wireless CarPlay (from a dump of an EU ND1 on 74.00.324A; jciAAPA there
# has args="new_hw", see SM_WCP_LINE_STOCK). Only the running config is changed.
SM_WCP_TABLE='00 92034449e76689b995fcd369d584f441829a0ee6e8d74c858cd92f4049f7b27d
01 e5ce622545dba267859d98b37de060b95932e293b7c43289b250a237b9d8df8c
02 85fb888bb6b1cb24fb90616605dc73c97b7289d9a6b78e508fb58ec19ec7e4f8
03 040e6cdd55436a13d7ba406938b192a4012135adb3877c81fdff7feee7ff7702
04 ed4562f9389b4ec6bab5d0cf6abbe9404de9382ebd3631005ff4b018bd08b481
05 beb8e5ac60cba8b77497e67a39df9680326b1afeac45734809b38b9ada90b763
06 c941759505c67a408d53813e23b6b1ad1a488aa41c15f06f0d2113eb980d84df
07 a757d706626fc74bf3c76427a98425a8c6e60a45d3fbe5c25acae4394cb17ecc
08 aeed1574404cc57b6229a9140d2677ef5d02ca439608b0b6e7033f1795ae0bda
09 968b9decd8f050a708ef2acc762890a6edc923b2432e778589a89d11d158263d
0a 85dc435ac398fd0af552e0035b68c7656d881f4ce155f40fae9f9e847650b88c
0b 5150d3cd2191f35ed1b86b26d5a5be88677ea16e87d1c6966dd70db4597d4718
0c dc36ce411067da4427fb5d865ad6b819075ecfed585e5e003df4292c80ede2a7
0d 7fe0cbb995673622dcce0c5a3ca26f55c158894066cc29ff1dbe9fba51ab7d2b
0e d1d0f60f918dc4e284f5931880eadc8edc1bdbd231d2ad5b3a9f92f49c530536
0f 57ad723df04c8bdf989f2cb8374d781da7d994ba7bcc66e7a7bbfc008b581cc9
0g 002a0eaf8ff8a41df394c2b4135b2e1cd7c8c610bddc58e0dffe2c3f71f740e6
0h 5854641b79949f5c46d9c5d4596774594434dbb1b20beb75364b6f0678a6f31c
0i 39908e721d439936cc7b78ad90ba5254a4367af5e0a161763b6a8b66637904cd
0j 850416a79faa8b4205b3631d86805c22042ce0c55660354672d9703be0b0f330
0k c0d1ab6be6334ed43ac19d4438ee045634844c8e3fa370029121af6a478628e9
0l 704cca02ea18988835230b12a60c16a3ba0bdf78d9d8b1eb7bd7f8310a623b0c
0m ed4451e14df537b1a67ccbd41c31f516e2f0f6125ced55e9d27103cb3e49e976
0n 4736c9474f27841be518ad7f53221b62dc0ef49f54c72779d01f4a75b7faad3d
0o 61b1cb0602d3ae29ec4a0b265653ca4a7ba2955c550a9c5aad649f8c255c038f
0p d0e88d0f6158ee5ea2feefc0d3b1702b4331c97e2fb0f92581fabdc1722edb39
0q 44081fac72236ce765ff037bff0eaef62f300d061f6de106a83bae45e2dda1ca
0r f681d1482fc209f6920d428469ce5d125c14e53a84fb26f334350727049ba89c
0s 0779462c19c0bafdc7ce73a09c8062c03b1eb9d1467bef8904cfd6f6139767c1
0t e08a7ef40f42b4bdd2451df7ef665f904b2a50421e8680a3b1a9de49debf9042
0u 27db2f6c384a933dd4a64eb66edd6ea1555e67297ca079d5f0d19d8084caec9f
0v 75b517c7bf5f5dc9991d802741ae2e513b86c0a2c11f573d92e64eff6a6a008d
10 d6d2a0ee0970befa239990d802a614792ac537eaac9b9f315a42dbaa3b07f2ed
11 6abcf9d3be47cad829d663533210daab4f433dabddc122defa5abfaf20d01482
12 35c2b0f26c70ced9bfee3b00200cb02baf5168d3c2b31b91d0babe5821c79091
13 78f333e4fdf9452fb424f2d64fcd84aca2b9799c8aa4dd0471c662b1d0e32b04
14 79194fba0613aa1d5e067101b34b58eca7560eaeeb09d359c6f8d2f23da79bf9
15 1f0b6c13bcbb1028ae1238743e21c0bdb4541b7a01db352b67bcdb0278c361ec
16 9942f818b7cdec23e88435cc637ad80174bf6fda5a3acfca7b2f550ab609514a
17 b7411bd6511c3b797c7120bd90a59656cabbf3a860a130d80b5d4fb7fca6b145
18 0e2658937784ae3a26a1ffd08261218f84501cee52f1873ad6ca51c69e89848b
19 db5af2db1299c77df3ac6df3b9286795d4f547a5c23c16ed374045f7b7f65cc6
1a 68c4536eb3c6fc7f76b5fb3aa927f599034ffb11fb54d47ce5e763e24b87ff54
1b 0cbd574b693edc3db97c71e4923c8a905e3d04115bb8728899a84462e5663268
1c 1d972ab2357c7bbd19a5faa65feb5bc4378df67c70e15efaf782e9453e551643
1d 73d5cb2f0bacc4d7fc09aa0272d86cbaa1d7dbf1a6989b9783373d1b5670cf57
1e d79bf2faba7f8142db8a52b4f51b73b360eb1c856721b28fe437f91948dc63f7
1f 5a30263fc4e416e4584c3a11f63559f5d714bc1419a96b9187fa62aa222e03f4
1g 573f273289722f266e87e18f42eda357d7757e5f289c57870e68652cff477953
1h 3b31979ccb30ab77bebecff93a55f6146dd60eb17eb20d4e313fe68b53b803c6
1i 36bc701e174da3bdd93058545e417ffe76f42b1fde9aceb2c8883666e1cd8044
1j 478faf49c48e107a8e9d5abd857e15ff19600cf5633f88c5be95e0b432a7651c
1k ee6da32e495322111c4de938144ba4b4cbad36cbea2567e83888aef55024706f
1l 2f74db8e019f6408d8a4c8995cb118c6f90a04d61070195a01fe4346d7a7b3de
1m b6019ba863d65cc55d77079ad3707f1c960d9762ead1f1c318f9143f1cb8d2c9
1n ebe625cb33253d75bb30262a3bf6af40637760dddc97c0ab53b4f7ce8882227d
1o ef190c967894a66f7a450ef9e05547ced417bb2e5e551b70dd11984fb7f2f665
1p 7623db9bad9d6c75398d3af417989a8a032f8a42de2e5c2af7640d832ff2bf95
1q 47ef555c4a844e908663a0caa97aceb401d77b52c4ffa40f853bf18b4d82d987
1r 80a63f37a3b5a303c520b76e2dc9d2e05cb6b421f471dfa3be042f919ba3d3d6
1s 567aaa55cf864f7fb9335baf221134ac927623fd8e71213889dda4ea5fb09ca4
1t 98e03e6cc28f87cdb2eae16f460a913acb0de87ba99b9b66a9f34e91ff8ba471
1u bd1003b199c4f6c64c5b193ca7a6f9cc2309e936a306ecee08c2d97b431e4217
1v 7275555523766dc6921d2d20ef3b025f6e7e0a6175ff77c1221e57558ad0cff4'
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
# systemApp.js holds two independent edits: no disclaimer (first char 0/1) and the hidden
# Entertainment sources of the boot-trim groups (second char, the menu code: 0 = off, w = on with
# nothing hidden yet, else the trim char of the groups hidden; see TRIM_DIGITS). SYS_TABLE has all
# 66 known files: "<disc 0|1><menu code> <sha256>"; 00 is SYS_STOCK and 10 is SYS_PATCHED.
# Regenerate with tests/print_sys_table.py.
SYS_TABLE='00 23106b04bd6bad514dd879b217a34a0f0289d58f86a0ae022488be6a022ca8e1
0w b32dc1eb157f4a6ff6d6044c30e795d3b9b06e3ac3dab1f197d01e65af7bcf00
01 402e2eb8c55ed777690ee5720999cca7558c6de1c81abf5bdb68f19c3f767c92
02 cef7c71f874640a351fc9d38a1004ccf3e2abafc2475226e1d4b8a7bd04e3a09
03 933b75d51aede088c69dbe3dba20798d98c57d37e79016a19499d6ad4f3b093c
04 7f53bfdcf4ad302e435c4029677ac6ac1251bbac5ca544f152b03b009138d23d
05 5fa790ea452e032527bb70c90e00a96fa9b3ca6900b6dd18b2bfff3f85170dee
06 ba0046daca87187aa20078a4d358d344bac42dfec3ed41b86a9aa4d480a27ffd
07 cb67a420b6bc1395169344a96567b619d2a4c14432069b5acaa2b8b87635dd6e
08 63ed747d54ea39fd9e4f501b2a5624ef56dcde0a52a7fb00c96aac3ed582e9ef
09 80eccaccb1cf4688026d1e350f40261e7023c908fe57160286f6ce1774ee4a6d
0a b4a555ecc729170c15ae828b2d548146c2c7e16fb1bf0eb051d1df111f798645
0b 27568ffb7b8cbec061ea65ac9e1b9059c9c217d99cfe0feb846378fa47dff8ba
0c 21f4676764e412dd6a1ab200578812dd7b718a5cc0bf814a71ac7a483914e865
0d 79855bee542de2359288d9772d9b0a85000856d5162507e70e0ec2be991cd972
0e c51334102efdd0ee87ab00f91967c7714824099bbc7f311c263b22e78a2db9e4
0f 7c1b85724cb02a47c66bba312ffdf846b5e1ebf3910e3481cd126b0e2b6a9748
0g ec2c13ab42a0b7d5967a1785f6ae5cbf13607bd547f227aa41855021bcb659f8
0h 0614be47888b5908cc99325b82f99e68da9d057dd27384efe1cc8fc9fbd54b55
0i 5b80aba746459c98a7ad06c1f2b434843f8520660f3076f5e2ca363b26c665df
0j 604ba2d57e016af30e212b4d9e45149d9347dd89eb6b38598370bec6174e5346
0k b8273c19e61beb094740bc22a32d9081cdeb872148fb25f93e6129cd5cb1a666
0l 3f4fb4e5a99d44ec5b8904260d787a93a2402d03081c71f0fd927bab24f5e0b4
0m 0ba6ce55a271e5a099cc1a93a7423f3c150023e831886a8da2798c0e69d66a84
0n b67ab5fae91fe73b03d925117e1ca1a4b7af101fb2d3b81d31c4026648e31b2a
0o 540bd6435b8f29bb246edae454088968f700ce67f8a253fba1026ad6426b383b
0p 5574234f809958aa99fac0a1cf61802ff234c13f51468b302304eeb1895374bd
0q 0d7f2fc42486d4b6c43bf9a569938f47025cf40c30e74baf63c9f79361108329
0r b09dcdfc0296fd7e5859c66bbc2db9e95fc4b32e4e0c680132479709e7174bef
0s 41fc68095ef54809264489735f93b288af071980707383b983dacc641143786a
0t b078667e39d9e65b0ca583c6696f4fa09408a24c20742a844ec7b3c52509830f
0u 10ea4aa0d3ae4a89eb0aac8e5a77c8bd5d0d22532b1ca1aaebf68161b309af5e
0v 8eae248dc152e67b885e47273c19b1e157d958c22daa48fe22cd173c7f21c218
10 65bb9d50020f83ab3e3cf3c1390e4b83ee1882bfb8b7aa405f966c05c35ada53
1w bc2801c63b2f567b5a0a7e505e8125417203b6eceb95188022e51ac32d2dde6d
11 28b80e6c0a85a669f4fc36aa56311f97751e5c6801fc3fb8df3ab6fa43f1289c
12 aa126a1a2f2a5d89139fcf0e4bcb13d52f9d2741ec66f0701700062d045a71e8
13 6954e85321d9e1c04afa64bb81d1936214fa0f935655938328115bd3f58b7d42
14 77815fee3fdc3b1c3ddba807046c0549cee5fc86e2bab79d1a3e9e511395270a
15 8cea33f44af31b45028e50d74c4b55cb884a33407a80cdab098120662caad73d
16 8d9b6c761d58793ef7e68fea89a2429ea9f6a9cc3bef75509e4ac49ee05bffd2
17 5028d419df9fd588df283f5dd1a47018789b50bf634d46ed8de1c954a98d03d0
18 b28785c8cda8b7a4b13c1106f08fed0f68a297f0e7b777738ac4467f59d7f5c9
19 a001f7dbc5ddab3eb46c3b0fa043329ceee3258a2f09ed642d07116c809eda64
1a e9d186867335f797f502e10607fd75a2b9caf3d1a2b60ea717bf7de4dbf8454a
1b 4b601524b75f5fa3d4090de0ed5f3564bcafddb66a40cd7acfaff089635cd3d4
1c 30c2858b7372d653c043807c2dba5cd95e00c0ea07d3f5823fbf5fe6b19ef154
1d 72f4db10357603b65c34a678fb4028febdc1bf8e2e32499e655086ddcc55acef
1e f75e20380cd1e3ca527dd08426c999efe30c63d9ec7eea71758c2a015f091127
1f fb2dbd2d2e7e66d6d3a7e155f5532175c875ddee339497ae814de57901537c26
1g 0e581d499b069946bed2bf75e8e806836602b026b25b8153ae5fb83ec96ed7da
1h 7cc3ce24ae4bd9f0a88fc32ac3788ac51b059adc0437b9077022da5f6aec3455
1i 9a7d39d972a9f534babaf5c7e681fdec42740915432b7a1db2fd1bd0e388f52e
1j 151f9d6621bc2e52bb7003c36207bb1c64581997d5edc9203cdc3c7cd7758300
1k e543f37b0b105f40f2f90d4087e7ad868a2d613abf9d584e2af259a295922652
1l 11b9eeedeaa7a1d92dea8afe4fa466b7bfbba047b285c7fbffbf6ef1d3bb9f09
1m e7c0abb00b2eb22b0f318f9a5ee73626831703785c15686abe34c289f420ca82
1n 82d032b123304cf3bee760d214892e38a02f1757381a887d51d9eeab8de44947
1o 87b7b8a7f7884798de09d0e2fe6e629adaf81ec0dd5ea100f95e6bfd6686394c
1p 0bc6cff14180149bfe646634578cf7a78de81f2987d114661c045e18cf702c69
1q b52b1fedf5d5ebed0ba1318bc37ac0fb7690974c2f1cfd8e6b4a2bbaca6d484c
1r 8dfe2bbe9a644fd64d0f0686b41e8d328c70f8b6e78dc0e40bc464fedeb334c5
1s 26e1679a371cc5b757f3cb2980a34aab56e5729c5c196e2595d5633faae6d695
1t 12374fb5c4d8e8e374bd725b55b63ae48e7d9981ee87d6e68bf704ac6ca4b185
1u f88ff2c6dccd0b8a20f9e4166b7459038a08cbd04435c0fcc48910f7cd3a4219
1v 425fbf11a4bafb84b15abc17297071204132c26196620872fee777985c7bd988'
LIST_STOCK=52195d55c6615b9d61e9b25f48f90382e8ebe671edb154daa08d8915eca6f96f     # List2Ctrl.js (dump 1.4.0)
LIST_PATCHED=5a41a407f217a662d470611ec5ffe85a14a0ec2e5ace30e3329ae37b60d4e5bd   # List2Ctrl.js, shorter delay
# Camera text: every SafetyText image of the unit, its stock sha256 and the sha256
# it gets (the blank image from MZD-AIO, on the stick as images/safety/<name>).
SAFETY_TABLE='SafetyText_ADR_English.png e02c4ee5dcfbfb3847eef85f86c37c8ea0d9e2cacf24d97a746628b49393c79c 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_AU_English.png 0ad75c8610fe1ce3c71017cad74d93da1e2589ba85001befcfb0d3b0df76eb2b 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_BG_Bulgarian.png 8c1b038cba7015bef56c903fe27d62dcf9454dde95e9744abffaa1ab53ea8789 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_BR_Portuguese.png dacd036879763d61e5c65b832fa4de41f87df1bfbd0ef3fe8744e6805d1e4ba8 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_BS_Malaysia.png 2af3fdc281705d2f2f223a3ede3faaf9772920e606e4868283015456d7c81760 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_CH_Cantonese.png e02c4ee5dcfbfb3847eef85f86c37c8ea0d9e2cacf24d97a746628b49393c79c 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_CN_Chinese.png feea7a39f59869ffc0f444926f75f41473b3d50594e29b254b84c3fb3e5ecbfd 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_CN_Croatian.png 08ad5643b63d1fe42cefec6ee285c5e4a3bc1923f906281e62daa1d613c73555 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_CN_French.png 75bc1cf3367d95f489aa25c3bdca6a6f39baa771872989818282d887f8696054 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_CZ_Czech.png ca9762150acc35eca8db74536366733dae0dcf75ee9b8d790b8f517a1d0eba53 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_DA_Danish.png be604f1c399be602465c99c5aa42417550fccb5e22127fa70cdce34f3492fda4 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_DE_German.png 651ab79e931501c93dac7f75e8ceced91ad096cdb65f7c4cd875fd3b4e44be83 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_ET_Estonian.png 0d44bcd5a52f04e3c00d569c9d6f017267027b09895383465fe3ea5f2f4372e5 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_FI_Finnish.png a4ff00fd752bdfdec8d5c1a450296c5426ce6adbdf25c26222d524b7a58babc3 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_FR_French.png 75bc1cf3367d95f489aa25c3bdca6a6f39baa771872989818282d887f8696054 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_GCC_Arabic.png 2e8f7ee413aa8b5a4e7add98ed1808f75332591bf34a3ca02b2d52b59fbd224c 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_GR_Greek.png a6315c86b96a11e662c301488b13c0689ef9af143c29e9fe5cb60d0f315d0300 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_HB_Hebrew.png d6466ed15a7ac70e3bb3f86ed9197352e6cd3ee111f9b982a5cc3dd28df176dd 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_HK_Cantonese.png d920f95edc2a750bf7694f13a5041ecb8344d8884d239b9689f69bb3cce93fc2 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_HU_Hungarian.png 819b7f840708027a004651b72403b11f25e8f2c24dd6e022376a51f5640b4bc3 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_IN_Indonesia.png d816433d33f1b0b624b8031cd459ec3bd3ea700fd3486a62c187e2ceebb655b7 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_IT_Italian.png 9192e63823111925ec4cac10c55f4df56789186bc0894395170bd160cc53eba2 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_JA_Japanese.png 5509076dc0d21306cb9c445414109d7b67afeddf0633ca4e241502e8229d50f7 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_KO_Korean.png e02c4ee5dcfbfb3847eef85f86c37c8ea0d9e2cacf24d97a746628b49393c79c 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_LT_Lithuanian.png a0787fd15d4fc3e9e2589a674bc5f2fe4bdc261441932a435410b9ba27932e2a 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_LV_Latvian.png 2c5e73b895b79971d53dd8861de497c1a229fccfb2822c76b216c769c544e202 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_ML_Malay.png 217ea6ddeeb88b154f6875d16a90f796439f171e8f1972ca74735c47aa67a276 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_MN_Chinese.png d0792cffe3868c3e74cefdd4330ef62836417de9fdf3bdf96e7327be1f9625b0 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_NA_Spanish.png 35754c11fd29b0c55238016086315c68069582750bdc411c286e5b3745eeb8c6 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_NL_Dutch.png 1440a73200f4b8d02747d4f8d9d6eae40d97d016e54dba5ccc4f7cfa4809e1e7 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_NO_Norwegian.png d0bc3f8b9584d7d6ab4561ae4cc39555c162a4f0b5113aee0a198686f9ff3e5f 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_PL_Polish.png d3dd8dca97a71634b1131e42d731ec832075eaf8c05272bcb904aaa133451fb6 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_PT_Portuguese.png ab6e47597e3b74cd680ad75b76e737f343dfdcf270228c33cbe488ea77e213b6 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_RO_Romanian.png fe7db237f399baaed1e256420f32d9c40742f1c3b6245cf7fba1136cdbe598e5 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_RU_Russian.png ed75a70d88e1108eb93ed7805624647d4b148a036193aa0700d174a913a472d0 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_SE_Serbian.png 4622636c1cc0fb7682adbe5f6ea2e9f8ef344100dad00c35727da8f7c2fdbe64 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_SK_Slovak.png fadf52dace1a3b86c1236bece7e2d5b92847d2d6440d32be4aa873408a6416e4 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_SP_Spanish.png 35754c11fd29b0c55238016086315c68069582750bdc411c286e5b3745eeb8c6 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_SW_Swedish.png ca57f89e8c4717184949c4a8b7dfd4fa1cc13d839f7a802d2f8937d9cc8858b1 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_TH_Thai.png 8181550162ae94fdbcdc38c9d71f6ee635a466bf40025d39af4a08a5663fe82e 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_TR_Turkish.png 250be13a49b608023fb6b7b53073d3af2c02438a509753807040dfdf13174931 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_TW_Chinese.png dbdc7a96f4ad99a6992abace9cff6c4dd12d8aa914eaa3826cfc764bc1809fe3 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_TW_Mandarin.png 25628f2584a1f6c06bdbc7c99e4b5d3d25cb30694eccff5cb0479dcbde786846 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_UK_English.png 661c1d8bcf8b45f1bcd567d91bf85f2c7f35a962c8616ec63452d532cdf8407f 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_UK_Ukrainian.png b58afd5c6178791c9852cd808b7284936b6518aec9b1357300ae7b31738f8423 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c
SafetyText_US_English.png e02c4ee5dcfbfb3847eef85f86c37c8ea0d9e2cacf24d97a746628b49393c79c 009b4ac1f36eb2b5d91125e79ba9dcff7f1a24cfe19169b7e6aa2fe3209e339c'
COMMON_STOCK=376b30a46366a543122956d7feb1b44f147425015837a4d83fedf12a67943351    # Common.js, from TouchTune 1.2.1
COMMON_PATCHED=019eba18e8d629ddb1d55563aab138ce1eb3329fab67b71d9b4178377cf9d9ce  # Common.js with TouchTune
CFG_MODE=775                            # sm.conf and both XMLs: mode, uid, gid
CFG_OWNER=1000:1000
SHIM_MODE=644
CHECK_ATTRS=1

SM_LINE_STOCK='        <service type="jci_service" name="jciAAPA" path="/jci/aapa/blmjciaapa.so" autorun="yes" reset_board="yes" retry_count="0" ping_timeout="30000">'
SM_LINE_PATCHED='        <service type="jci_service" name="jciAAPA" path="/jci/aapa/blmjciaapa.so" autorun="yes" reset_board="no" retry_count="0" ping_timeout="30000">'
# sm_WCP.conf starts jciAAPA with args="new_hw"; the edit is the same, args stay.
SM_WCP_LINE_STOCK='        <service type="jci_service" name="jciAAPA" path="/jci/aapa/blmjciaapa.so" autorun="yes" reset_board="yes" retry_count="0" ping_timeout="30000" args="new_hw">'
SM_WCP_LINE_PATCHED='        <service type="jci_service" name="jciAAPA" path="/jci/aapa/blmjciaapa.so" autorun="yes" reset_board="no" retry_count="0" ping_timeout="30000" args="new_hw">'
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
# Hidden Entertainment sources (builder item "menu", opt-in): _buildEntertainmentDataList() of
# systemApp.js keeps the items whose isVisible flag is set. The native MMUI sets that flag too
# (StatusMenuVisible), so the one filter line is replaced by one that also drops the sources of
# every trimmed group (menu_line). Independent of the Disclaimer edit above; no other line is touched.
MENU_STOCK_LINE='        if (this._masterEntertainmentDataList.items[i].appData.isVisible)'
MENU_LINE_A='        if (this._masterEntertainmentDataList.items[i].appData.isVisible && ['
MENU_LINE_B='].indexOf(this._masterEntertainmentDataList.items[i].appData.appName) < 0) // MiatOff: hidden with the boot trim'
# Parking sensors: the MZD-AIO semi-transparent images that fit this firmware
# (same size as the stock image, and not identical to it), on the stick as
# images/sensors/<folder>/<name>. MZD-AIO's HorizontalSensors arcs are smaller than
# the v74 ones and are left out.
SENSOR_TABLE='MiniView/BackCtr_1_sm.png a6a1f6bc29ee915ca69faf27c22ed76a06c75efe50abb9177d0bde4aa228f5cb 5e45f853b9a04c0e9a7346d011e26ca670761827d4e48f1bb2e2ead3841e9da0
MiniView/BackCtr_2_sm.png ef15beba6a50492069c10a9caf5ab9ed8bd0301711b83e90676a434ffa054f5e 584ee09e55464885deb90906c598a4fb627e008292b16325412c2c6a4380b4e5
MiniView/BackCtr_3_sm.png ba594e2f07559adf0f1fdd8d23e140d88b11205f6677c8c48fef2a8b2cbff2e7 e8e46acc3d51385e5dffdb51ceac2e6ce002ab19d394b52790ad312d462ec110
MiniView/BackCtr_4_sm.png 3ee98e70f49748799bdf14de9da4beab5088c268bd7d63114fee8a92f44808da 2a4739720c3f63a5c4112f4c3695039fb6d1728e2753f552a420cade9e6d1ca1
MiniView/BackLt_1_sm.png cea0216f291a3613136f71898a6398b7cd057a8a31d6bc3726cabca241e702fd 7c142235515b73f9a5f3587db4d92a0ce6b575cfc030e3c1a13590e146a00d2c
MiniView/BackLt_2_sm.png ba05601796ae621f78ecd39d6c743c9b1788976fd75778c667084a3e45f1d08e b80d892449b0c16297778d1c379fb72288404274083854d42ed91934daf60fdf
MiniView/BackLt_3_sm.png 12bae78a156358361c8722ab2d44917089241ef794952027821b13a34b78a93a bcd04ddea3af3aaeb42d6b41358ce14a872534b9de668e22819e5253d3974e3f
MiniView/BackRt_1_sm.png dd3dec136fc0a084030569667bbc9451d3f40c78bbc6497f346e2d8b85c60f96 06dee94538a44cc4c3517e98fb47839957b227bfae6dccb49b57afd2cbe6b9c5
MiniView/BackRt_2_sm.png eb9e564bfb194828cb38666c6100d4b4dc8627d0e6fff2f7af23a5173dd77ee3 4598ef689ce8e8e1e1f83b1f6430d59ec8ba5f4ea38cb9795c23871be2331993
MiniView/BackRt_3_sm.png e8d196cfc839205e8d5259faae7cca26a3eb35f07273eeff88469b243a3c7e83 90e72c6b77fd72caf2f55232ba4e26625cebfba31b33d58ebb03ed513bdc4e9a
MiniView/Background_sm.png 99372643929b5eb53ebc4f8635f049300a86176d96b538c2ad70c5b0d5441ecc 1ba9691984a6b2365716b92c8df9afb8592b2461777559fee7c1b7c32af25e0b
MiniView/Background_sm_4s.png 9ca0831a39a5700f6735b95fec52b4e843152d84ba84816af15ec9c0cb8553df 8d780d91faf49ab067ca08d17f7a36a72574e6ef28281eb3b0fcbef109e6b2eb
MiniView/Car_Ds_sm.png 0aa40d25a1c218b01db7ff4f9f1777eba7d6928abeb52d3af06dfdf9c4b5fe74 3a2874d260fd67b6b30a5684d8c4e46030d179ebec3afb80cb3108169d141c36
MiniView/Car_sm.png 1784c506755f3e62d4187c1c158d55843c192864fb736a9ea7dd7e2c12bfc053 9556a408bcd7fb3106244d152d65b4e9548f5cb29b71c06a52584a3f6597a0bf
MiniView/FrontCtr_1_sm.png 6571902deb545fbda82731345a7ebc2b75505af22c1cb9b221d6cf1b785f8aa3 72878e4f308db7c8604bb40e6991222ae0da0e55e6ec2f6b6080db8161f3ccff
MiniView/FrontCtr_2_sm.png bb2bcb0a25b28a4c04a58a6eb8db2533a8ea186343082f9d7ca868957155c4b7 3acf02240cb286411d60407431b9a6a16e8e00e573f90bd46c1cef379c4bb565
MiniView/FrontCtr_3_sm.png 8a4a542297b834f1f5ef884a859a185c48266b366a972da44bfb5039c27df3fd c27ed96ae00d5122f83f0237962fbedb1451bec3fa5cd42540e9d52e40ad63db
MiniView/FrontCtr_4_sm.png 4cccd6708a8bdef44678f6fed5108e229d2409b4cb91cad39443666e2437ebd0 44034066c6ba745bce4372df3663669f4b7f3985b7e217b03b808e42ba8fb76e
MiniView/FrontLt_1_sm.png fb9f2ab8d658cec007ccef5597845d68ceb504d5b86adff65e09619ba6c707f9 be0c3cdabc1c2f3d95f3e6e9d48a91f19cbb48d8f5f7b4ece92c3f032e77ab11
MiniView/FrontLt_2_sm.png 602c6ef8204b5c49f40a81a1310a834d3cabfdb5580e93c88e337867eb2205a3 995fab7dc6fd49af3cc1dc5109881adfa8a5183fb606b24713ff98441ef14d17
MiniView/FrontLt_3_sm.png cf4de78463c83acc4c1d381fa588e142d011a3917e9ead9095607a2ffdcfe89e 29a94425f39e8cc2db6ae3d4be6c655ff8152c691ddbeb4a9b65f16b000ee3b6
MiniView/FrontRt_1_sm.png d7560f91fb8c82c383199e936d0e6dd4adecb2db4df8fda55fbeaf3c0bc4624b 7332a72d0be07e6c07c752a10f067289149034ebdae8fb019805fa07664831d6
MiniView/FrontRt_2_sm.png d6868557b02fc1335ba5cbb1fd6bce70a4665ec32305d1110e97abde97db1b6a 46f2f0314d47a2c9790dda7ce250af8599b0350c25b12989c54db2b953e037d4
MiniView/FrontRt_3_sm.png ba5163d3aeda0d8f160aba05ee2706e0761397384ca41e3d10efeef6a34c3c21 49d5b1f41211dc0e4a67c8c116fe04a5689b04788c3c946e5bebb7859c7f78a8
VerticalSensors/BackCtr_1_lg.png 936f0afbc57b081e95eac7c0334495911917590a2ac200754167472ab76ac1e0 82d39dfec46eb0677f66c194f264552a101ecbe6758c348985a477564c9a2098
VerticalSensors/BackCtr_2_lg.png 99a6cee528310e18ac79247cf9911e510bfb97487d315efd2d98f05da13b1dab d8e3278e69547bf46adb928df50adfb67eed5a20ccafe766f698639d387acfe8
VerticalSensors/BackCtr_3_lg.png 92beb9dad66dbf1023df9c6dd3c9186e0113c0e123ca15d8db0058eee5f5ecd8 273b3f79063ededf935354b52f4b07c7582e391172b3f721c37d93d47e3692aa
VerticalSensors/BackCtr_4_lg.png a611eafa0de761ea641fb2419f75997579954e5f84bddfab5c31201b3b36c800 ff2ca8e7bf0f58e1b2e9d3347bf32547c40dd0cbf6a44ed21e02f25c19595aad
VerticalSensors/BackLt_1_lg.png e5f4444b467abd7271be3cddcf17e1ab98e48adcf8515492dd8e2a47bc41d55b 5c0b4fc27b90c3b73637ed61bc0a013da6548302c9a660a16838573b7cb9801a
VerticalSensors/BackLt_2_lg.png ec0ded722e338063f50abdb4b812dfb11ddc63b6452e78cf8b80d21d824d070c 02052ea517abb8865b0e006b78d50bf49d8466b5aee8b160a84526e4283f4fc8
VerticalSensors/BackLt_3_lg.png 12f12dd60a02d1ed41af1b9d5f876802d1da10e127e975862bc58293a047c3a5 275dda7d855ce2c3816b607438aaa0027cce5282cd8cda0862b0beb5d15e48ba
VerticalSensors/BackRt_1_lg.png a2521513d5280916fe30aaf8c4242eec73d6bb461fc26da4d0476096ae05f304 f04d9b94f2668f8d76e6dc4d435447e476cbce0bacfa998773b7d75a038773cd
VerticalSensors/BackRt_2_lg.png d2fb0b8477861613a3971afd41f3f1d91421cbd6b6a82303d2ad8cb42d226d08 b866af3302bb457827754868b6823dcacea0aa1804c636bae362669e2a792036
VerticalSensors/BackRt_3_lg.png cf5fd36e7d989f1d8951e992c071b48e618a3eab4e094662627d0ddf437275e4 bbec938e432c557c49822edb901c2873a7929a5ecf0fc396f9e6f988ca5582fa
VerticalSensors/FrontCtr_1_lg.png a3dce913c911f03d07585b43a1c27e56a2cb3814a7617a86f5a54d510ef94b68 72aa796b4f0f69592d3f320c4a6a6ef5d26d75e253b2d47fd78c05fc26cc53ee
VerticalSensors/FrontCtr_2_lg.png 5a52bcc0af7e6b76e714e003aac5f02c6ae88e8fd1cd3d5bf6817491720df0be 7c0edb447e0f33c1f980150469e35f27e792ff689d097dbbe320de2f88bcf705
VerticalSensors/FrontCtr_3_lg.png a4224fa6486dbbc3e81b6f260900bc9a4b10d9e6f534426bb8075f59eb51ab7e 894185c7c3bd4817caf044ee37487a02202fcdf692a8dcb2880b5771aa11d474
VerticalSensors/FrontCtr_4_lg.png 895855ae29aca94968e657ca156985548426a316f8a0f3864b4039239b027af7 fcaca51bf6b96f9b2ad840d7413f7c5100f76b1e619aa19c55ce567c860ad400
VerticalSensors/FrontLt_1_lg.png 8448f92e1a14b02c7f4d89de790a3d9853510f2512ea59964d94e92aaaea632d 55123d5b1952a3bc66764a176241f22aa21a9024f83f95a2b248c0fcf7839140
VerticalSensors/FrontLt_2_lg.png ea6b373a761282ce42d76fc6952be0aa475c983c72b61b1341a0202fcd569927 fc8a47f750c93fe086e515d6aaa07a259343af805daecefae48067ca3c708681
VerticalSensors/FrontLt_3_lg.png e7ab1c585ead6dddbcb3509c7a5b40caf50ab9364b865885635d307adba92c02 6a0978c4d6370354a069b9e0b67cf34645981a6282363831fcf88de25070b2b9
VerticalSensors/FrontRt_1_lg.png a9e82cfac56aba4c19988b5a0b0c4757be98c5208c3eebf11c7263a218b0c2ee 33745d1d25a021d07bee98171642dcb8602e81282f1c36fa9d823e531b395685
VerticalSensors/FrontRt_2_lg.png 461b3a5d275474eba3eb6593a873b23323e06901a6182cab7929bbb9ed9a897c fd8059cefb411f6f765bb86f098236e5eb4e4f4bf11be118639a86a4a6a2d0e7
VerticalSensors/FrontRt_3_lg.png 735a6604329f278f921f0506172d08f72b581742a76a84eb2aa94186eac05c34 864b544cf5e5c332dbdf22f22c4f4df964a02082a37d9b8ed09a46f00ad3c997'

# Shorter list delay: the four autoscroll timings of List2Ctrl.js (ms), stock -> new
# (tier 1 = hold the Commander tilted, tier 2 = keep holding: page by page).
DELAY_LINES='autoscrollTier1Timeout :                1500,|autoscrollTier1Timeout :                150,
autoscrollTier2Timeout :                5000,|autoscrollTier2Timeout :                300,
autoscrollTier1Interval :               500,|autoscrollTier1Interval :               200,
autoscrollTier2Interval :               1000,|autoscrollTier2Interval :               300,'

# Tests replace the hashes above with those of their fixture files.
if [ "$MO_TEST" = 1 ] && [ -n "${MO_TEST_OVERRIDES:-}" ]; then
    . "$MO_TEST_OVERRIDES" || exit 1
fi

# The config the Service Manager runs on: sm.conf, or sm_WCP.conf with wireless
# CarPlay. That one is changed; the other stays as it is. Unknown: sm.conf, and
# preflight refuses.
sm_active_name() {
    local c cmd
    for c in "$R"/proc/[0-9]*/cmdline; do
        [ -r "$c" ] || continue
        cmd=$(tr '\000' ' ' < "$c" 2>/dev/null)
        case "$cmd" in
            "/jci/sm/sm -f /jci/sm/sm.conf "*|"/jci/sm/sm -f /jci/sm/sm.conf") echo sm.conf; return 0 ;;
            "/jci/sm/sm -f /jci/sm/sm_WCP.conf "*|"/jci/sm/sm -f /jci/sm/sm_WCP.conf") echo sm_WCP.conf; return 0 ;;
        esac
    done
}
SM_NAME=$(sm_active_name)
if [ "$SM_NAME" = sm_WCP.conf ]; then
    SM_TABLE=$SM_WCP_TABLE
    SM_LINE_STOCK=$SM_WCP_LINE_STOCK
    SM_LINE_PATCHED=$SM_WCP_LINE_PATCHED
fi
SM="$R/jci/sm/${SM_NAME:-sm.conf}"
# The config that is not running. A backup or edits of it mean the unit switched
# configs since MiatOff changed it: refused (see backup_state, describe_state).
case "$SM_NAME" in sm_WCP.conf) SM_OTHER=sm.conf ;; *) SM_OTHER=sm_WCP.conf ;; esac
SM_STOCK=$(printf '%s\n' "$SM_TABLE" | awk '$1 == "00" { print $2 }')
SM_PATCHED=$(printf '%s\n' "$SM_TABLE" | awk '$1 == "10" { print $2 }')   # + AA touch
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
LIST2="$R/jci/gui/common/controls/List2/js/List2Ctrl.js"
NATIVE_IMAGES="$R/jci/nativegui/images"
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

# The Service Manager must be running on sm.conf or sm_WCP.conf.
sm_conf_active() { [ -n "$SM_NAME" ]; }

# ---------------------------------------------------------------- config files

cfg_path() {
    case "$1" in
        sm) echo "$SM" ;; xml) echo "$XML" ;; ucp) echo "$UCP" ;; sys) echo "$SYSAPP" ;; list) echo "$LIST2" ;;
        opera) echo "$OPERA_INI" ;; gap2) echo "$GAP2" ;;
    esac
}
cfg_sha() {    # cfg_sha <key> <stock|patched>
    case "$1:$2" in
        sm:stock) echo "$SM_STOCK" ;;   sm:patched) echo "$SM_PATCHED" ;;
        xml:stock) echo "$XML_STOCK" ;; xml:patched) echo "$XML_PATCHED" ;;
        ucp:stock) echo "$UCP_STOCK" ;; ucp:patched) echo "$UCP_PATCHED" ;;
        sys:stock) echo "$SYS_STOCK" ;; sys:patched) echo "$SYS_PATCHED" ;;
        list:stock) echo "$LIST_STOCK" ;; list:patched) echo "$LIST_PATCHED" ;;
        opera:stock) echo "$OPERA_STOCK" ;; opera:patched) echo "$OPERA_PATCHED" ;;
        gap2:stock) echo "$GAP2_STOCK" ;; gap2:patched) echo "$GAP2_PATCHED" ;;
    esac
}
cfg_backup() {  # cfg_backup <key>: where the stock copy is kept
    case "$1" in
        sys) echo "$SYS_BACKUP" ;;
        list) echo "$STATE_DIR/List2Ctrl.js.stock" ;;
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

# sys_variant <file>: the two-char code of systemApp.js (<disc 0|1><menu: trim char>, see
# SYS_TABLE); empty when the file is none of the 64 known files.
sys_variant() {
    local d
    is_file "$1" || return 0
    d=$(sha256_of "$1") || return 0
    printf '%s\n' "$SYS_TABLE" | awk -v d="$d" '$2 == d { print $1; exit }'
}

# sys_part_state <disc|menu> <file>: disc: stock | patched | unknown; menu: the trim char the
# Entertainment menu follows (0 = nothing hidden) or unknown. Content and attributes.
sys_part_state() {
    local v
    v=$(sys_variant "$2")
    [ -n "$v" ] || { echo unknown; return 0; }
    attrs_ok "$2" || { echo unknown; return 0; }
    if [ "$1" = menu ]; then
        echo "${v#?}"
    elif [ "${v%?}" = 1 ]; then
        echo patched
    else
        echo stock
    fi
}

# file_state <key> <file>: stock | patched | unknown (content and attributes).
# For sm.conf this is the AA-touch part only; the boot trim is read apart. For
# systemApp.js (sys) it is the Disclaimer edit only; see sys_part_state.
file_state() {
    local d s
    is_file "$2" || { echo unknown; return 0; }
    if [ "$1" = sys ]; then
        sys_part_state disc "$2"
        return 0
    fi
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

# menu_line <menu code>: the filter line for the groups of that code: 0 = the stock line, w = an
# empty list (on, nothing hidden), else the trim char. Mask bits: 1 DVD/TV, 2 SiriusXM, 4 Pandora,
# 8 Stitcher, 16 Aha. No logs: used in $(...).
menu_line() {
    local m names=
    [ "$1" != 0 ] || { printf '%s\n' "$MENU_STOCK_LINE"; return 0; }
    if [ "$1" = w ]; then m=0; else m=$(trim_mask "$1"); fi
    [ $(( m / 1 % 2 )) = 1 ] && names="$names,\"dvd\",\"tv\""
    [ $(( m / 2 % 2 )) = 1 ] && names="$names,\"satradio\",\"xmaudio\""
    [ $(( m / 4 % 2 )) = 1 ] && names="$names,\"pandora\""
    [ $(( m / 8 % 2 )) = 1 ] && names="$names,\"stitcher\""
    [ $(( m / 16 % 2 )) = 1 ] && names="$names,\"aharadio\""
    printf '%s%s%s\n' "$MENU_LINE_A" "${names#,}" "$MENU_LINE_B"
    return 0
}

menu_transform() {  # menu_transform <src> <dst> <from menu code> <to menu code>: the one filter line, nothing else
    local old new
    old=$(menu_line "$3"); new=$(menu_line "$4")
    awk -v old="$old" -v new="$new" '
        $0 == old { print new; n++; next }
        { print }
        END { exit n == 1 ? 0 : 1 }' "$1" > "$2"
}

# sys_build <src> <from> <dst> <to>: turn systemApp.js code <from> into <to> (two chars, see
# sys_variant): the Disclaimer edit and the menu line are changed independently. Intermediate
# steps stay in /tmp (RAM).
sys_build() {
    local a="$MO_GUARD/sys.a" b="$MO_GUARD/sys.b" fd="${2%?}" fm="${2#?}" td="${4%?}" tm="${4#?}" mode
    cp "$1" "$a" || return 1
    if [ "$fd" != "$td" ]; then
        if [ "$td" = 1 ]; then mode=install; else mode=remove; fi
        disc_transform "$a" "$b" "$mode" && mv -f "$b" "$a" || return 1
    fi
    if [ "$fm" != "$tm" ]; then
        menu_transform "$a" "$b" "$fm" "$tm" && mv -f "$b" "$a" || return 1
    fi
    cp "$a" "$3" || return 1
    rm -f "$a" "$b"
}

delay_transform() { # delay_transform <src> <dst> <install|remove>: the four timings, nothing else
    awk -v mode="$3" -v lines="$DELAY_LINES" '
        BEGIN {
            n = split(lines, l, "\n")
            for (i = 1; i <= n; i++) {
                split(l[i], p, "|")
                if (mode == "install") map["        " p[1]] = "        " p[2]
                else map["        " p[2]] = "        " p[1]
            }
        }
        ($0 in map) { print map[$0]; done[$0]++; next }
        { print }
        END { for (k in map) if (done[k] != 1) exit 1; exit 0 }' "$1" > "$2"
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
        list) delay_transform "$2" "$3" "$4" ;;
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
    elif [ "$key" = sys ] && [ -n "$(sys_variant "$live")" ]; then
        sys_build "$live" "$(sys_variant "$live")" "$dst" 00 || return 1
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
    local want="$1$2" new="${SM%/*}/.${SM##*/}.miatoff.new" tmp="${SM%/*}/.${SM##*/}.miatoff.tmp"
    if [ "$(sm_variant "$SM")" = "$want" ] && attrs_ok "$SM"; then
        log "${SM#"$R"} already variant $want"
        return 0
    fi
    fault stage-sm || return 1
    make_stock sm "$tmp" || return 1
    sm_build "$tmp" 00 "$new" "$want" || { log "ERROR: cannot build ${SM##*/} variant $want"; return 1; }
    rm -f "$tmp"
    chmod "$CFG_MODE" "$new" || return 1
    chown "$CFG_OWNER" "$new" 2>/dev/null || [ "$CHECK_ATTRS" = 0 ] || return 1
    [ "$(sm_variant "$new")" = "$want" ] && attrs_ok "$new" || { log "ERROR: staged ${SM##*/} failed verification"; return 1; }
    fsync_path "$new" || return 1
    fault rename-sm || return 1
    mv -f "$new" "$SM" || return 1
    fsync_path "${SM%/*}" || return 1
    [ "$(sm_variant "$SM")" = "$want" ] && attrs_ok "$SM" || { log "ERROR: ${SM##*/} failed read-back"; return 1; }
    log "published ${SM##*/} variant $want (AA touch $1, boot trim $2:$(trim_list "$2")) ($(sha256_of "$SM"))"
}

# publish_sys <code>: systemApp.js as that code (see sys_variant). Staged beside the target,
# verified by hash, renamed atomically.
publish_sys() {
    local want="$1" new="${SYSAPP%/*}/.${SYSAPP##*/}.miatoff.new" tmp="${SYSAPP%/*}/.${SYSAPP##*/}.miatoff.tmp"
    if [ "$(sys_variant "$SYSAPP")" = "$want" ] && attrs_ok "$SYSAPP"; then
        log "${SYSAPP#"$R"} already variant $want"
        return 0
    fi
    fault stage-sys || return 1
    make_stock sys "$tmp" || return 1
    sys_build "$tmp" 00 "$new" "$want" || { log "ERROR: cannot build ${SYSAPP##*/} variant $want"; return 1; }
    rm -f "$tmp"
    chmod "$CFG_MODE" "$new" || return 1
    chown "$CFG_OWNER" "$new" 2>/dev/null || [ "$CHECK_ATTRS" = 0 ] || return 1
    [ "$(sys_variant "$new")" = "$want" ] && attrs_ok "$new" || { log "ERROR: staged ${SYSAPP##*/} failed verification"; return 1; }
    fsync_path "$new" || return 1
    fault rename-sys || return 1
    mv -f "$new" "$SYSAPP" || return 1
    fsync_path "${SYSAPP%/*}" || return 1
    [ "$(sys_variant "$SYSAPP")" = "$want" ] && attrs_ok "$SYSAPP" || { log "ERROR: ${SYSAPP##*/} failed read-back"; return 1; }
    log "published ${SYSAPP##*/} variant $want (disclaimer ${want%?}, menu follows trim ${want#?}) ($(sha256_of "$SYSAPP"))"
}

# publish_cfg <key> <stock|patched>: stage beside the target, verify, rename.
# For sm.conf only the AA-touch part changes; the boot trim stays as it is. For
# systemApp.js (sys) only the Disclaimer edit changes; the menu line stays as it is.
publish_cfg() {
    local key="$1" want="$2" live new tmp v
    if [ "$key" = sys ]; then
        v=$(sys_variant "$SYSAPP")
        [ -n "$v" ] || { log "ERROR: ${SYSAPP##*/} is not a known variant"; return 1; }
        if [ "$want" = patched ]; then publish_sys "1${v#?}"; else publish_sys "0${v#?}"; fi
        return
    fi
    if [ "$key" = sm ]; then
        v=$(sm_variant "$SM")
        [ -n "$v" ] || { log "ERROR: ${SM##*/} is not a known variant"; return 1; }
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
    cfg_leftovers sm xml ucp sys list
    image_leftovers
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
    exists "$BACKUP/$SM_OTHER" && { echo invalid; return 0; }   # made while the other config ran
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
    log "backup of stock ${SM##*/} and AAP XMLs written to ${BACKUP#"$R"}"
}

discard_backup_new() {
    exists "$BACKUP_NEW" || return 0
    [ -d "$BACKUP_NEW" ] && [ ! -L "$BACKUP_NEW" ] || return 1
    rm -f "$BACKUP_NEW"/sm.conf "$BACKUP_NEW"/sm_WCP.conf "$BACKUP_NEW"/aap_system_attributes.xml "$BACKUP_NEW"/aap_system_attributes_UCP.xml
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
        rm -f "$BACKUP/$SM_OTHER" || return 1
        rmdir "$BACKUP" || return 1
    fi
    for key in sys list opera gap2; do
        live=$(cfg_backup "$key")
        rm -f "$live" "$live.new" || return 1
    done
    remove_image_backup safety || return 1
    remove_image_backup sensors || return 1
    if [ -d "$STATE_DIR" ]; then
        rmdir "$STATE_DIR" || { log "ERROR: ${STATE_DIR#"$R"} holds other files"; return 1; }
    fi
    rmdir "$parent" 2>/dev/null || true
    [ -d "$R/data_persist" ] && fsync_path "$R/data_persist/" || true
}

# ---------------------------------------------------------------- state

S_SM= S_XML= S_UCP= S_SHIM= S_CONF= S_BACKUP= S_TT= S_TRIM= S_DISC= S_MENU= S_DELAY= S_SAFETY= S_SENSORS= S_METERS= FOREIGN= LEFTOVERS= STATE=
# refresh_state: sets the S_* component states and STATE (AA touch), which is
# one of stock | installed | disabled | partial | unknown, S_TRIM (boot trim char, see SM_TABLE;
# unknown), S_DISC (startup warning), S_MENU (the menu code: 0 = Entertainment sources not hidden, w = on with
# nothing hidden, else the trim char of the groups hidden; unknown) and S_DELAY (list delay): stock | patched |
# unknown, S_SAFETY (camera text) and S_SENSORS (parking sensors): stock | patched | partial | unknown. Runs in the main shell.
refresh_state() {
    S_SM=$(file_state sm "$SM")
    S_DISC=$(file_state sys "$SYSAPP")
    S_MENU=$(sys_part_state menu "$SYSAPP")
    S_DELAY=$(file_state list "$LIST2")
    S_SAFETY=$(image_set_state safety)
    S_SENSORS=$(image_set_state sensors)
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
    elif [ -z "$LEFTOVERS" ] && aa_files_stock && { other_features_on || ! exists "$BACKUP"; }; then
        # STATE_DIR may still hold backups of features (on, or left by an interrupted
        # RESTORE); only the AA backup set without any feature on means an AA run was cut.
        STATE=stock
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

# A feature that is on, half done or unknown: its backup in STATE_DIR must stay.
other_features_on() {
    [ "$S_TRIM" != 0 ] || [ "$S_DISC" != stock ] || [ "$S_MENU" != 0 ] || [ "$S_METERS" != off ] || [ "$S_DELAY" != stock ] || \
        [ "$S_SAFETY" != stock ] || [ "$S_SENSORS" != stock ]
}

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
    printf 'sm config:    %s (%s)\n' "$S_SM" "${SM_NAME:-none active}"
    printf 'aap XML:      %s\n' "$S_XML"
    printf 'aap UCP XML:  %s\n' "$S_UCP"
    printf 'shim:         %s\n' "$S_SHIM"
    printf 'libpatch.conf:%s\n' " $S_CONF"
    printf 'backup:       %s\n' "$S_BACKUP"
    printf 'TouchTune:    %s (Common.js)\n' "$S_TT"
    printf 'boot trim:    %s (groups on:%s)\n' "$(trim_name "$S_TRIM")" "$( [ "$S_TRIM" = unknown ] && echo ' ?' || trim_list "$S_TRIM")"
    printf 'disclaimer:   %s (stock = startup warning shown, patched = skipped)\n' "$S_DISC"
    printf 'menu hides:   %s (0 = off, w = on and nothing trimmed, else the groups hidden in the Entertainment menu:%s)\n' "$S_MENU" "$( case "$S_MENU" in unknown) echo ' ?' ;; 0|w) echo ' none' ;; *) trim_list "$S_MENU" ;; esac)"
    printf 'list delay:   %s (patched = shorter)\n' "$S_DELAY"
    printf 'camera text:  %s (patched = blank safety text)\n' "$S_SAFETY"
    printf 'sensors:      %s (patched = semi-transparent parking sensors)\n' "$S_SENSORS"
    printf 'meters:       %s (app %s, userscript %s)\n' "$S_METERS" "$(area_state app)" "$(area_state userjs)"
    if exists "$BACKUP/$SM_OTHER"; then
        printf 'NOTE:         the backup was made while the unit ran %s; it now runs %s.\n' "$SM_OTHER" "${SM_NAME:-?}"
        printf '              Nothing is changed. Switch wireless CarPlay back, run REMOVE, then switch again.\n'
    fi
    [ -z "$FOREIGN" ] || printf 'foreign:      %s\n' $FOREIGN
    [ -z "$LEFTOVERS" ] || printf 'leftovers:    %s\n' $LEFTOVERS
    f=$(meters_leftovers)
    [ -z "$f" ] || printf 'meters left:  %s\n' $f
    for f in "$SM" "$XML" "$UCP" "$BLM" "$AAP" "$SHIM" "$SHIM_OFF" "$CONF" "$COMMON" "$SYSAPP" "$LIST2" "$OPERA_INI" "$GAP2"; do
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
    sm_conf_active || { log "ERROR: the Service Manager is not running on /jci/sm/sm.conf or sm_WCP.conf"; return 1; }
    # /data_persist (a symlink on the CMU) must lead to the read-write mount.
    if ! [ -d "$R/data_persist/" ] || ! mount_has /tmp/mnt/data_persist rw || \
        [ "$(stat -c %d "$R/data_persist/." 2>/dev/null)" != "$(stat -c %d "$R/tmp/mnt/data_persist/." 2>/dev/null)" ]; then
        log "ERROR: /data_persist is not the read-write data_persist mount"
        return 1
    fi
    log "preflight OK: firmware $fw, AA binaries match, $SM_NAME active, /data_persist rw"
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
    refresh_state
    if [ "$(sm_variant "$SM")" = 00 ] && ! other_features_on; then
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
    [ -n "$v" ] || { log "ERROR: ${SM##*/} is not a known variant"; return 1; }
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
        "$wanted:stock"|"$wanted:installed"|"$wanted:disabled") do_menu_follow; return ;;
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
    refresh_state
    { [ "$S_MENU" != 0 ] && [ "$S_MENU" != unknown ]; } && { do_menu 0 || ok=1; }
    refresh_state
    [ "$S_DELAY" = patched ] && { do_delay stock || ok=1; }
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
    fault "backup-$1" || return 1
    mv "$bak.new" "$bak" && fsync_path "$STATE_DIR" || return 1
    log "backup of stock ${bak##*/} written to ${STATE_DIR#"$R"}"
}

ensure_sys_backup() { ensure_file_backup sys; }

# hmi_file_patched <sys | list> <file>: any edit of the file is on (the stock backup must stay).
hmi_file_patched() {
    local v
    if [ "$1" = sys ]; then
        v=$(sys_variant "$2")
        [ -n "$v" ] && [ "$v" != 00 ]
    else
        [ "$(file_state "$1" "$2")" = patched ]
    fi
}

# do_hmi_file <sys | list> <patched | stock>: one HMI file, one atomic rename on
# root; the stock copy stays in STATE_DIR while any edit of the file is on.
do_hmi_file() {
    local key="$1" live bak st
    live=$(cfg_path "$key")
    bak=$(cfg_backup "$key")
    if [ "$2" = patched ]; then
        ensure_file_backup "$key" || return 1
    fi
    root_rw || return 1
    if ! publish_cfg "$key" "$2"; then
        # The file is unchanged (the rename is the only write); clean up.
        remove_rootfs_leftovers
        root_ro
        refresh_state
        if ! hmi_file_patched "$key" "$live"; then
            rm -f "$bak" "$bak.new"
            if aa_files_stock && ! other_features_on; then remove_state_dir; fi
        fi
        return 1
    fi
    root_ro || return 1
    refresh_state
    if [ "$2" = stock ] && ! hmi_file_patched "$key" "$live"; then
        rm -f "$bak" "$bak.new" || return 1
        if aa_files_stock && ! other_features_on; then
            remove_state_dir || return 1     # nothing of MiatOff is left on the unit
        fi
        refresh_state
    fi
    st=$(file_state "$key" "$live")
    case "$st:$STATE" in
        "$2:stock"|"$2:installed"|"$2:disabled") return 0 ;;
    esac
    log "ERROR: after the ${live##*/} change: $st (wanted $2), AA touch $STATE"
    return 1
}

do_disc() { do_hmi_file sys "$1"; }     # do_disc <patched | stock>
do_delay() { do_hmi_file list "$1"; }   # do_delay <patched | stock>
do_delay_on() { do_delay patched; }     # shorter delay = the patch on
do_delay_off() { do_delay stock; }

do_disc_off() { do_disc patched; }      # warning off = the patch on
do_disc_on() { do_disc stock; }

# Hidden Entertainment sources (opt-in, plan item "menu"): the sources of the boot-trim groups that
# are on are dropped from the Entertainment list, one line of systemApp.js. While it is on, every
# boot trim step moves it along (do_menu_follow). An unknown systemApp.js only skips that; the trim
# is not blocked.
do_menu() {         # do_menu <menu code: 0 off, w on and nothing hidden, else the trim char hidden>
    local live="$SYSAPP" bak="$SYS_BACKUP" v want
    v=$(sys_variant "$live")
    [ -n "$v" ] || { log "ERROR: ${live##*/} is not a known variant"; return 1; }
    want="${v%?}$1"
    if [ "$want" != 00 ]; then
        ensure_file_backup sys || return 1
    fi
    root_rw || return 1
    if ! publish_sys "$want"; then
        remove_rootfs_leftovers
        root_ro
        refresh_state
        if ! hmi_file_patched sys "$live"; then
            rm -f "$bak" "$bak.new"
            if aa_files_stock && ! other_features_on; then remove_state_dir; fi
        fi
        return 1
    fi
    root_ro || return 1
    refresh_state
    if [ "$want" = 00 ]; then
        rm -f "$bak" "$bak.new" || return 1
        if aa_files_stock && ! other_features_on; then
            remove_state_dir || return 1     # nothing of MiatOff is left on the unit
        fi
        refresh_state
    fi
    [ "$S_MENU" = "$1" ] && return 0
    log "ERROR: after the menu change: menu code $S_MENU (wanted $1)"
    return 1
}

menu_target() {     # the menu code that matches the boot trim now
    if [ "$S_TRIM" = 0 ]; then echo w; else echo "$S_TRIM"; fi
}
do_menu_on() { [ "$S_TRIM" != unknown ] || return 1; do_menu "$(menu_target)"; }
do_menu_off() { do_menu 0; }

do_menu_follow() {  # after a boot trim step: the menu moves with the trim, if the user turned it on
    refresh_state
    case "$S_MENU" in
        0) return 0 ;;
        unknown) log "systemApp.js is not a known version: the Entertainment menu is left as it is"; return 0 ;;
    esac
    [ "$S_MENU" != "$(menu_target)" ] || return 0
    do_menu "$(menu_target)"
}

# ---------------------------------------------------------------- image sets
# A set of PNGs replaced as one feature (camera text: SafetyText_*.png; parking
# sensors: images in HorizontalSensors/, VerticalSensors/ and MiniView/). Each
# file is either its stock or its new version; anything else is unknown and
# nothing changes. All stock files are backed up (verified) before the first one
# is replaced; then each file is staged, verified and renamed on its own, so a
# power loss leaves a mix of stock and new files: "partial", which both
# directions can finish.

image_table() { case "$1" in safety) echo "$SAFETY_TABLE" ;; sensors) echo "$SENSOR_TABLE" ;; esac; }
image_dir() { case "$1" in safety|sensors) echo "$NATIVE_IMAGES" ;; esac; }
image_backup() { echo "$STATE_DIR/$1"; }
image_src() { echo "$USB/images/$1/$2"; }        # image_src <set> <name>: the new file on the stick
# image_stage <dir> <name>: where a file is staged before its rename (same folder;
# a name may hold one subfolder, e.g. MiniView/Car_sm.png).
image_stage() {
    case "$2" in
        */*) echo "$1/${2%/*}/.${2##*/}.miatoff.new" ;;
        *) echo "$1/.$2.miatoff.new" ;;
    esac
}
image_names() { image_table "$1" | awk '{ print $1 }'; }

# image_hashes <dir> <names>: "name sha256" per file, one hashing process for all.
image_hashes() {
    local dir="$1" out
    shift
    if [ -n "$OPENSSL" ]; then
        out=$(cd "$dir" 2>/dev/null && "$OPENSSL" dgst -sha256 "$@" 2>/dev/null)
    fi
    if [ -z "$out" ] && [ "$HAVE_SHA256SUM" = 1 ]; then
        out=$(cd "$dir" 2>/dev/null && sha256sum "$@" 2>/dev/null)
    fi
    printf '%s\n' "$out" | awk '
        /\)= / { h = $NF; f = $0; sub(/^[^(]*\(/, "", f); sub(/\)= [0-9A-Fa-f]+$/, "", f); print f, tolower(h); next }
        NF == 2 { f = $2; sub(/^\*/, "", f); print f, tolower($1) }'
}

# image_check <set> <where: live | backup | stick>: "name stock|new|other" per entry.
image_check() {
    local set="$1" dir names
    case "$2" in live) dir=$(image_dir "$set") ;; backup) dir=$(image_backup "$set") ;; stick) dir="$USB/images/$set" ;; esac
    names=$(image_names "$set")
    # shellcheck disable=SC2086
    image_hashes "$dir" $names | awk -v table="$(image_table "$set")" '
        BEGIN { n = split(table, t, "\n"); for (i = 1; i <= n; i++) { split(t[i], f, " "); st[f[1]] = f[2]; nw[f[1]] = f[3]; order[i] = f[1] } }
        { h[$1] = $2 }
        END {
            for (i = 1; i <= n; i++) {
                k = order[i]
                print k, (h[k] == st[k] ? "stock" : (h[k] == nw[k] ? "new" : "other"))
            }
        }'
}

image_set_state() {  # stock | patched | partial | unknown
    local set="$1" name dir
    dir=$(image_dir "$set")
    [ -n "$(image_table "$set")" ] || { echo unknown; return 0; }
    for name in $(image_names "$set"); do
        is_file "$dir/$name" || { echo unknown; return 0; }
    done
    if [ "$CHECK_ATTRS" = 1 ]; then
        # one stat for all: "mode uid:gid" per file, all must be the stock attributes
        # shellcheck disable=SC2046
        (cd "$dir" && stat -c '%a %u:%g' $(image_names "$set")) 2>/dev/null | \
            awk -v want="$CFG_MODE $CFG_OWNER" -v n="$(image_names "$set" | wc -l)" '$0 == want { ok++ } END { exit ok == n ? 0 : 1 }' || \
            { echo unknown; return 0; }
    fi
    image_check "$set" live | awk '
        { c[$2]++ }
        END {
            if (c["other"] > 0) print "unknown"
            else if (c["new"] == 0) print "stock"
            else if (c["stock"] == 0) print "patched"
            else print "partial"
        }'
}

image_backup_valid() {  # image_backup_valid <set>: every stock file, verified
    local bak
    bak=$(image_backup "$1")
    [ -d "$bak" ] && [ ! -L "$bak" ] || return 1
    ! image_check "$1" backup | grep -qv ' stock$'
}

IMAGE_SETS="safety sensors"
image_set_leftovers() {  # image_set_leftovers <set>: staged copies left by a run that was cut off
    local name dir f
    dir=$(image_dir "$1")
    for name in $(image_names "$1"); do
        f=$(image_stage "$dir" "$name")
        exists "$f" && echo "$f"
    done
    return 0
}
image_leftovers() {
    local set
    for set in $IMAGE_SETS; do image_set_leftovers "$set"; done
}

ensure_image_backup() {
    local set="$1" bak new name dir
    bak=$(image_backup "$set")
    image_backup_valid "$set" && return 0
    [ "$(image_set_state "$set")" = stock ] || { log "ERROR: no verified backup and the $set images are not all stock"; return 1; }
    if exists "$bak"; then
        # Left by an interrupted RESTORE: every live image is stock, so this copy is not needed.
        log "discarding the incomplete backup ${bak#"$R"} (the live $set images are all stock)"
        rm -rf "$bak" || return 1
    fi
    dir=$(image_dir "$set")
    new="$STATE_DIR/.$set.new"
    rm -rf "$new"
    mkdir -p "$new" || return 1
    for name in $(image_names "$set"); do
        case "$name" in */*) mkdir -p "$new/${name%/*}" || return 1 ;; esac
        cp "$dir/$name" "$new/$name" && chmod 444 "$new/$name" && fsync_path "$new/$name" || return 1
    done
    fsync_path "$new" || return 1
    fault "image-backup-$set" || return 1
    mv "$new" "$bak" && fsync_path "$STATE_DIR" || return 1
    image_backup_valid "$set" || { log "ERROR: backup of the $set images failed verification"; rm -rf "$bak"; return 1; }
    log "backup of the stock $set images written to ${bak#"$R"}"
}

remove_image_backup() {
    local bak name
    bak=$(image_backup "$1")
    rm -rf "$STATE_DIR/.$1.new" || return 1
    exists "$bak" || return 0
    for name in $(image_names "$1"); do
        rm -f "$bak/$name" || return 1
    done
    for name in $(image_names "$1" | awk -F/ 'NF > 1 { print $1 }' | sort -u); do
        [ ! -d "$bak/$name" ] || rmdir "$bak/$name" || return 1
        fault "image-rmdir-$1" || return 1
    done
    rmdir "$bak"
}

# image_put <set> <name> <src> <sha256>: one file, staged beside the target, verified, renamed.
image_put() {
    local dir new
    dir=$(image_dir "$1")
    new=$(image_stage "$dir" "$2")
    rm -f "$new"
    cp "$3" "$new" || return 1
    chmod "$CFG_MODE" "$new" || return 1
    chown "$CFG_OWNER" "$new" 2>/dev/null || [ "$CHECK_ATTRS" = 0 ] || return 1
    [ "$(sha256_of "$new")" = "$4" ] || { log "ERROR: staged $2 failed verification"; rm -f "$new"; return 1; }
    fsync_path "$new" || return 1
    fault "put-$1-$2" || return 1
    mv -f "$new" "$dir/$2" || return 1
}

# do_images <set> <patched | stock>
do_images() {
    local set="$1" want="$2" name state sum src n=0
    state=$(image_set_state "$set")
    case "$state" in stock|patched|partial) ;; *) log "ERROR: the $set images are not a known version"; return 1 ;; esac
    if [ "$want" = patched ]; then
        if image_check "$set" stick | grep -qv ' new$'; then
            log "ERROR: the $set images on the stick are missing or damaged"
            return 1
        fi
        ensure_image_backup "$set" || return 1
    else
        image_backup_valid "$set" || { log "ERROR: no verified backup of the $set images"; return 1; }
    fi
    root_rw || return 1
    for name in $(image_set_leftovers "$set"); do
        rm -f "$name" || return 1     # never a live file: the name is the hidden staging name
    done
    image_check "$set" live > "$MO_GUARD/images" || return 1
    while read -r name state; do
        if [ "$want" = patched ] && [ "$state" = stock ]; then
            src=$(image_src "$set" "$name")
            sum=$(image_table "$set" | awk -v k="$name" '$1 == k { print $3 }')
        elif [ "$want" = stock ] && [ "$state" = new ]; then
            src="$(image_backup "$set")/$name"
            sum=$(image_table "$set" | awk -v k="$name" '$1 == k { print $2 }')
        else
            continue
        fi
        image_put "$set" "$name" "$src" "$sum" || { rm -f "$MO_GUARD/images"; remove_rootfs_leftovers; root_ro; return 1; }
        n=$((n + 1))
    done < "$MO_GUARD/images"
    rm -f "$MO_GUARD/images"
    for name in $(image_names "$set" | awk -F/ 'NF > 1 { print $1 }' | sort -u); do
        fsync_path "$(image_dir "$set")/$name" || return 1
    done
    fsync_path "$(image_dir "$set")" || return 1
    root_ro || return 1
    log "$set images: $n replaced"
    [ "$(image_set_state "$set")" = "$want" ] || { log "ERROR: $set images are not all $want"; return 1; }
    if [ "$want" = stock ]; then
        fault "image-unbackup-$set" || return 1
        remove_image_backup "$set" || return 1
        refresh_state
        if aa_files_stock && ! other_features_on; then remove_state_dir || return 1; fi
    fi
    refresh_state
}

do_safety_on() { do_images safety patched; }    # camera text blank
do_safety_off() { do_images safety stock; }
do_sensors_on() { do_images sensors patched; }  # semi-transparent parking sensors
do_sensors_off() { do_images sensors stock; }

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
# line: touchtune, aa_touch, meters, warning, menu, delay, safety, sensors, trim_dvdtv, trim_sirius, trim_pandora,
# trim_stitcher, trim_aha = install | remove | keep. Every run offers the next step that
# differs from the unit's current state, so the plan is followed one confirmed
# step (and one restart) at a time. An invalid plan is ignored.

plan_valid() {
    [ -f "$PLAN" ] || return 1
    awk '
        /^[ \t\r]*(#|$)/ { next }
        { gsub(/[ \t\r]/, ""); split($0, kv, "="); k = kv[1]; v = kv[2]
          if (k == "touchtune" || k == "aa_touch" || k == "meters" || k == "warning" || k == "menu" || k == "delay" || k == "safety" || k == "sensors")
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

# The trim step of the plan also hides the trimmed sources when the plan asks for the menu item
# (menu=install), so the unit restarts once for both.
do_trim_plan() {
    do_trim "$(plan_target_trim)" || return 1
    if [ "$(plan_get menu)" = install ] && [ "$S_MENU" = 0 ]; then
        do_menu_on
    fi
}

# plan_candidates <state>: the plan's steps in a safe order, removals first
# (AA touch before TouchTune), then installs (TouchTune before AA touch).
plan_candidates() {
    local aa tt me wa g v
    aa=$(plan_get aa_touch); tt=$(plan_get touchtune); me=$(plan_get meters)
    wa=$(plan_get warning)
    [ "$aa" = remove ] && echo remove
    [ "$(plan_get delay)" = remove ] && echo delay_off
    [ "$(plan_get safety)" = remove ] && echo safety_off
    [ "$(plan_get sensors)" = remove ] && echo sensors_off
    [ "$tt" = remove ] && echo tt_remove
    [ "$me" = remove ] && echo meters_off
    [ "$wa" = remove ] && echo disc_on
    [ "$(plan_get menu)" = remove ] && echo menu_off
    [ -n "$(plan_target_trim)" ] && [ "$(plan_target_trim)" != "$S_TRIM" ] && echo trim_plan
    [ "$(plan_get menu)" = install ] && echo menu_on
    [ "$me" = install ] && echo meters_on
    [ "$wa" = install ] && echo disc_off
    [ "$(plan_get delay)" = install ] && echo delay_on
    [ "$(plan_get safety)" = install ] && echo safety_on
    [ "$(plan_get sensors)" = install ] && echo sensors_on
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
        menu_on) echo "hide the trimmed sources in the Entertainment menu" ;;
        menu_off) echo "show the trimmed sources in the Entertainment menu again" ;;
        delay_on) echo "shorter list delay" ;;
        delay_off) echo "stock list delay" ;;
        safety_on) echo "blank camera safety text" ;;
        safety_off) echo "camera safety text back" ;;
        sensors_on) echo "semi-transparent parking sensors" ;;
        sensors_off) echo "stock parking sensors" ;;
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
    case "$(plan_get menu)" in install|remove)
        [ "$S_MENU" != unknown ] || echo "systemApp.js is not a known version (Entertainment menu)." ;;
    esac
    if [ "$(plan_get delay)" != keep ] && [ "$S_DELAY" = unknown ]; then
        echo "List2Ctrl.js is not a known version (list delay)."
    fi
    if [ "$(plan_get safety)" != keep ] && [ "$S_SAFETY" = unknown ]; then
        echo "The camera safety text images are not a known version."
    fi
    if [ "$(plan_get sensors)" != keep ] && [ "$S_SENSORS" = unknown ]; then
        echo "The parking sensor images are not a known version."
    fi
    if [ "$(plan_get meters)" != keep ] && [ "$S_METERS" = unknown ]; then
        echo "opera.ini or stage_gap2.sh is not a known version (Meters)."
    fi
    if [ "$S_TRIM" = unknown ]; then
        for g in dvdtv sirius pandora stitcher aha; do
            case "$(plan_get "trim_$g")" in install|remove) echo "${SM##*/} is not a known version (boot trim)."; break ;; esac
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
        remove|tt_remove|meters_off|disc_on|menu_off|delay_off|safety_off|sensors_off|trim_off|trim_*_off) echo REMOVE ;;
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
delay_label() { case "$S_DELAY" in stock) echo stock ;; patched) echo shorter ;; *) echo unknown ;; esac; }
safety_label() { case "$S_SAFETY" in stock) echo shown ;; patched) echo blank ;; partial) echo incomplete ;; *) echo unknown ;; esac; }
sensors_label() { case "$S_SENSORS" in stock) echo stock ;; patched) echo semi-transparent ;; partial) echo incomplete ;; *) echo unknown ;; esac; }
meters_label() {
    case "$S_METERS" in off) echo off ;; on) echo on ;; partial) echo incomplete ;; *) echo unknown ;; esac
}

# Each next dialog has its own CANCEL.
choose_extra() {
    local a
    a=$(ask TRIM WARNING MORE "Extras\n\nTRIM = turn off services ($(trim_name "$S_TRIM"))\nWARNING = startup warning ($(disc_label))\nMORE = Meters, list delay, camera text") || return 1
    case "$a" in
        0) choose_trim ;;
        1) choose_disc ;;
        2) choose_more ;;
        *) echo cancel ;;
    esac
}

choose_more() {
    local a
    a=$(ask METERS DELAY CAMERA "More extras\n\nMETERS = gauges in Applications ($(meters_label))\nDELAY = list scroll delay ($(delay_label))\nCAMERA = camera text ($(safety_label)),\n         parking sensors ($(sensors_label))") || return 1
    case "$a" in
        0) choose_meters ;;
        1) choose_delay ;;
        2) choose_camera ;;
        *) echo cancel ;;
    esac
}

choose_delay() {
    local a
    case "$S_DELAY" in
        stock)
            a=$(ask SHORTER CANCEL "Shorter list delay?\n\nHolding the Commander tilted scrolls\nlists after 0.15 s instead of 1.5 s.\nThe unit restarts afterwards.") || return 1
            case "$a" in 0) echo delay_on ;; *) echo cancel ;; esac ;;
        patched)
            a=$(ask RESTORE CANCEL "The list delay is shorter.\n\nRESTORE = back to stock") || return 1
            case "$a" in 0) echo delay_off ;; *) echo cancel ;; esac ;;
        *)
            popup "List2Ctrl.js is not the analysed file.\n\nNothing was changed."
            echo cancel ;;
    esac
}

choose_camera() {
    local a
    a=$(ask "SAFETY TEXT" SENSORS CANCEL "Reversing camera\n\nSAFETY TEXT = the text over the picture ($(safety_label))\nSENSORS = parking sensor graphics ($(sensors_label))") || return 1
    case "$a" in
        0) choose_safety ;;
        1) choose_sensors ;;
        *) echo cancel ;;
    esac
}

choose_sensors() {
    local a
    case "$S_SENSORS" in
        stock)
            a=$(ask INSTALL CANCEL "Semi-transparent parking sensor graphics?\n\nThe originals are kept on the unit.\nThe unit restarts afterwards.") || return 1
            case "$a" in 0) echo sensors_on ;; *) echo cancel ;; esac ;;
        patched)
            a=$(ask RESTORE CANCEL "The parking sensor graphics are\nsemi-transparent.\n\nRESTORE = back to stock") || return 1
            case "$a" in 0) echo sensors_off ;; *) echo cancel ;; esac ;;
        partial)
            a=$(ask FINISH RESTORE CANCEL "A previous run was not finished:\nsome sensor graphics are replaced.\n\nFINISH = replace them all\nRESTORE = back to stock") || return 1
            case "$a" in 0) echo sensors_on ;; 1) echo sensors_off ;; *) echo cancel ;; esac ;;
        *)
            popup "The parking sensor images are not\nthe analysed files.\n\nNothing was changed."
            echo cancel ;;
    esac
}

choose_safety() {
    local a
    case "$S_SAFETY" in
        stock)
            a=$(ask BLANK CANCEL "Blank the reversing camera safety text?\n\nThe originals are kept on the unit.\nThe unit restarts afterwards.") || return 1
            case "$a" in 0) echo safety_on ;; *) echo cancel ;; esac ;;
        patched)
            a=$(ask RESTORE CANCEL "The camera safety text is blank.\n\nRESTORE = back to stock") || return 1
            case "$a" in 0) echo safety_off ;; *) echo cancel ;; esac ;;
        partial)
            a=$(ask FINISH RESTORE CANCEL "A previous run was not finished:\nsome camera texts are blank.\n\nFINISH = blank them all\nRESTORE = back to stock") || return 1
            case "$a" in 0) echo safety_on ;; 1) echo safety_off ;; *) echo cancel ;; esac ;;
        *)
            popup "The camera safety text images are not\nthe analysed files.\n\nNothing was changed."
            echo cancel ;;
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
        stock:menu_on|installed:menu_on|disabled:menu_on)
            [ "$S_MENU" != unknown ] && [ "$S_TRIM" != unknown ] && [ "$S_MENU" != "$(menu_target)" ]; return ;;
        stock:menu_off|installed:menu_off|disabled:menu_off) [ "$S_MENU" != 0 ] && [ "$S_MENU" != unknown ]; return ;;
        stock:disc_off|installed:disc_off|disabled:disc_off) [ "$S_DISC" = stock ]; return ;;
        stock:disc_on|installed:disc_on|disabled:disc_on) [ "$S_DISC" = patched ]; return ;;
        stock:delay_on|installed:delay_on|disabled:delay_on) [ "$S_DELAY" = stock ]; return ;;
        stock:delay_off|installed:delay_off|disabled:delay_off) [ "$S_DELAY" = patched ]; return ;;
        stock:safety_on|installed:safety_on|disabled:safety_on) [ "$S_SAFETY" = stock ] || [ "$S_SAFETY" = partial ]; return ;;
        stock:safety_off|installed:safety_off|disabled:safety_off) [ "$S_SAFETY" = patched ] || [ "$S_SAFETY" = partial ]; return ;;
        stock:sensors_on|installed:sensors_on|disabled:sensors_on) [ "$S_SENSORS" = stock ] || [ "$S_SENSORS" = partial ]; return ;;
        stock:sensors_off|installed:sensors_off|disabled:sensors_off) [ "$S_SENSORS" = patched ] || [ "$S_SENSORS" = partial ]; return ;;
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
    [ "$GUARD_CREATED" = 0 ] || { rm -f "$MO_GUARD/pid" "$MO_GUARD/sm.a" "$MO_GUARD/sm.b" "$MO_GUARD/images"; rmdir "$MO_GUARD" 2>/dev/null; }
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
    rm -f "$MO_GUARD/pid" "$MO_GUARD/sm.a" "$MO_GUARD/sm.b" "$MO_GUARD/images"
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
# Meters, the startup-warning patch and the list delay, then restart. Triggered by the file
# MIATOFF-RESTORE on the stick, or by two failed dialogs while one is on.
hmi_emergency() {
    log "EMERGENCY ($1): reverting the HMI changes (Meters, startup warning, hidden menu entries, list delay)"
    if [ "$S_METERS" = off ] && [ "$S_DISC" != patched ] && [ "$S_MENU" = 0 ] && [ "$S_DELAY" != patched ]; then
        log "nothing to revert: Meters off, the startup warning and list delay stock; no restart"
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

# Backups left in STATE_DIR by an interrupted RESTORE of a feature that is stock
# again (and no AA backup): not needed any more, so they go (only /data_persist).
if [ "$STATE" = stock ] && ! other_features_on && ! exists "$BACKUP" && exists "$STATE_DIR"; then
    log "removing leftover backups of features that are stock again"
    remove_state_dir && refresh_state
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
    if [ "$S_METERS" = off ] && [ "$S_DISC" != patched ] && [ "$S_MENU" = 0 ] && [ "$S_DELAY" != patched ]; then
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
    menu_on) done_text="The sources you turned off at boot\nare hidden in the Entertainment menu." ;;
    menu_off) done_text="The Entertainment menu shows all sources again." ;;
    delay_on) done_text="The list delay is shorter." ;;
    delay_off) done_text="The list delay is back to stock." ;;
    safety_on) done_text="The camera safety text is blank." ;;
    safety_off) done_text="The camera safety text is back." ;;
    sensors_on) done_text="The parking sensor graphics are\nsemi-transparent." ;;
    sensors_off) done_text="The parking sensor graphics are back to stock." ;;
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

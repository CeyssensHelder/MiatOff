#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Draw the car cards of the Meters Designer car setup (meters/designer/setup-outlines.svg).

Blueprint line drawings: the body outline, side glass, door seams and character lines, lamps, grille, mirror,
handles and fuel door, detailed wheels (tyre, rim, twin spokes, brake disc, hub), and faint construction lines
(the road and the wheel centres). Everything is drawn in the card's colour (currentColor). Shapes are smooth
curves through hand-placed points (a point marked "c" is a corner).

Every car is drawn to one scale from its published length, wheelbase, height and tyre size, so the cards show
the real size differences (an MX-5 next to a CX-9). The lines between those fixed dimensions are drawn by hand to
look like the car; they are not traced from photos. The map symbols in the file are left as they are.

    python tools/make_car_outlines.py          # rewrite the car symbols in place
    python tools/make_car_outlines.py --check  # exit 1 if the file is not what this script makes
    python tools/make_car_outlines.py --json   # the car drawings as JSON (for previews)
"""
import json
import math
import re
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "meters" / "designer" / "setup-outlines.svg"
VIEW_W, VIEW_H = 200, 80
GROUND = 76.0  # y of the road in the 200 x 80 view box
SCALE = 0.0368  # view units per mm: a 5,075 mm CX-9 spans 187 units
C = "c"  # marks a corner in a point list
# Line weights in view units: the body outline, details, fine details, construction lines.
BODY, MID, FINE, CONS = 0.8, 0.5, 0.34, 0.28
LINE = 'stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"'


def stroke(width, extra="", fill="none", opacity=None):
    """Stroke attributes; fill is given once (a tinted shape passes fill="currentColor" and its opacity)."""
    tint = f' fill-opacity="{opacity}"' if opacity is not None else ""
    return f'fill="{fill}"{tint} {LINE} stroke-width="{width}"' + (" " + extra if extra else "")


# Dimensions in mm; x runs from the front bumper (0) to the rear (length), y up from the road.
# length, wheelbase, height: the commonly published figures for the generation and body shown, rounded.
# front: front overhang, estimated. tyre: a size from presets.mjs. clearance: sill height.
# outline: the body above the wheels, from the front bumper's lowest point over the car to the rear bumper's
# lowest point (corners: bumper ends, cowl, roof spoiler).
# glass: side windows. dlo: the surround of the side glass. top_fill: a tinted panel (soft top, black pillar).
# lines: open curves (doors, creases, rocker, cladding, seams). lamps, grille, mirror: closed shapes;
# lamp_lines: lines inside the lamps. handles: door handle centres. fuel: fuel door centre.
# spokes: (count, twin) of the wheel design. A car traced over a photo names it (credits in docs/19).
CARS = {
    "mx5": dict(
        # Traced over a photo: Mazda MX-5 Miata (ND, roadster), PlotagonNoah, CC BY-SA 4.0 (docs/19).
        name='MX-5 (ND) roadster', length=3915, wheelbase=2310, height=1235, front=800, tyre='205/45R17',
        clearance=130, kind='roadster', spokes=(7, False),
        outline=[
            (64, 202, C), (10, 275), (0, 384), (0, 492), (10, 555), (64, 600), (124, 642), (244, 697), (363, 744),
            (602, 812), (833, 856), (1026, 882), (1219, 899), (1412, 909), (1558, 924, C), (1701, 968), (1894, 1074),
            (2010, 1136), (2106, 1185), (2184, 1215), (2280, 1229), (2377, 1225), (2473, 1218), (2570, 1210),
            (2666, 1193), (2763, 1176), (2859, 1146), (2956, 1076), (3033, 997), (3081, 950, C), (3215, 940),
            (3426, 933), (3623, 911), (3755, 883), (3826, 834), (3878, 743), (3910, 632), (3907, 490), (3878, 379),
            (3826, 304), (3747, 257), (3597, 231, C),
        ],
        glass=[
            [(1885, 839, C), (1991, 950), (2087, 1046), (2174, 1124, C), (2377, 1139), (2570, 1147), (2637, 1128, C),
             (2666, 1031), (2676, 933), (2670, 848, C), (2280, 841),],
        ],
        lamps=[
            [(112, 618, C), (196, 645), (363, 650, C), (279, 617), (148, 600),],
            [(3689, 734, C), (3768, 782), (3836, 798, C), (3839, 741), (3757, 713),],
            [(1196, 643, C), (1315, 652, C), (1296, 625), (1219, 626),],
        ],
        lines=[
            [(1591, 896), (1759, 991), (1952, 1099), (2130, 1185),],
            [(1634, 835, C), (1589, 684), (1580, 514), (1605, 362), (1634, 282, C), (1991, 274), (2338, 287),
             (2570, 337), (2714, 452), (2778, 599), (2797, 831, C),],
            [(1219, 256), (1798, 274), (2280, 303), (2801, 373),],
            [(2685, 854), (2878, 874), (3077, 942),],
            [(2801, 634), (3052, 680), (3373, 710), (3689, 726),],
            [(339, 644), (673, 685), (987, 696), (1257, 682),],
            [(2377, 1229), (2386, 1145),],
        ],
        lamp_lines=[
            [(160, 625), (327, 639),],
            [(3728, 744), (3820, 774),],
        ],
        top_fill=[
            (2103, 1200, C), (2280, 1227), (2570, 1210), (2763, 1175), (2917, 1107), (3033, 997), (3077, 946, C),
            (2878, 890), (2685, 858, C), (2676, 933), (2666, 1031), (2637, 1128, C), (2377, 1141), (2174, 1126, C),
        ],
        mirror=[
            (1904, 839, C), (1917, 908), (1991, 933), (2078, 908), (2087, 845), (2029, 804), (1929, 793),
        ],
        handles=[(2589, 751)],
        fuel=(3518, 824),
    ),
    "fiat124": dict(
        # Traced over a photo: Fiat 124 Spider side.jpg, zombieite, CC BY 2.0 (docs/19).
        name='Fiat 124 Spider (348)', length=4054, wheelbase=2310, height=1233, front=834, tyre='205/45R17',
        clearance=130, kind='roadster', spokes=(14, False),
        outline=[
            (327, 168, C), (173, 194), (38, 253), (0, 363), (0, 511), (27, 585), (96, 656), (192, 711), (327, 749),
            (519, 793), (826, 827), (1075, 852), (1321, 870), (1566, 892), (1640, 916, C), (1763, 957), (1935, 1030),
            (2107, 1112), (2230, 1175), (2353, 1213, C), (2598, 1233), (2844, 1233), (2992, 1213), (3115, 1149),
            (3225, 1049), (3331, 955, C), (3480, 957), (3650, 964), (3820, 938), (3948, 912), (3980, 857),
            (3973, 791, C), (4011, 704), (4050, 618), (4054, 508), (4043, 442), (4011, 387), (3884, 318, C),
            (3735, 280),
        ],
        glass=[
            [(1984, 866, C), (2070, 995), (2205, 1089), (2328, 1140, C), (2574, 1136), (2648, 1114), (2684, 1069, C),
             (2684, 874, C), (2353, 854), (2107, 856),],
            [(3021, 1124, C), (3161, 1111), (3299, 1004, C), (3267, 982), (3021, 1070),],
        ],
        lamps=[
            [(154, 636, C), (192, 691), (269, 700), (300, 676, C), (288, 626), (219, 576),],
            [(3654, 680, C), (3682, 765), (3735, 798, C), (3905, 806), (3905, 702, C), (3820, 675),],
            [(1149, 637, C), (1247, 649), (1247, 618, C), (1173, 611),],
            [(3480, 505, C), (3618, 524), (3618, 486, C), (3522, 477),],
        ],
        lines=[
            [(1505, 813, C), (1493, 610), (1517, 398), (1566, 281, C),],
            [(1566, 281), (1861, 270), (2230, 277), (2537, 309),],
            [(2684, 845, C), (2746, 749), (2746, 636), (2697, 497), (2598, 369), (2537, 309, C),],
            [(1247, 179), (1861, 181), (2353, 184), (2660, 176),],
            [(1517, 836), (1861, 848), (2353, 854), (2697, 863), (3090, 885), (3331, 933),],
            [(327, 713), (878, 792), (1173, 827), (1505, 824),],
            [(19, 400), (327, 455),],
            [(3735, 633), (3948, 615), (4043, 573),],
            [(1714, 910), (2107, 1100), (2218, 1166),],
        ],
        lamp_lines=[
            [(181, 632), (288, 658),],
            [(3724, 754), (3895, 761),],
        ],
        top_fill=[
            (2242, 1177, C), (2353, 1213), (2598, 1233), (2844, 1233), (2992, 1213), (3115, 1149), (3225, 1049),
            (3331, 955, C), (3161, 909), (2844, 883), (2684, 874, C), (2684, 1069, C), (2648, 1114), (2574, 1136),
            (2328, 1140, C), (2205, 1089),
        ],
        mirror=[
            (1824, 864, C), (1849, 918), (1910, 928), (1940, 889), (1935, 807), (1898, 736), (1837, 747),
        ],
        handles=[(2512, 734)],
        fuel=(3480, 817),
    ),
    "mazda2": dict(
        # The CX-3 trace (same platform) stretched to this car's overhangs, wheelbase and height (docs/19).
        name='Mazda2 (DJ) hatchback', length=4060, wheelbase=2570, height=1495, front=800, tyre='185/60R16',
        clearance=140, kind='hatch', spokes=(5, True),
        outline=[
            (103, 198, C), (18, 281), (0, 406), (0, 558), (27, 636), (81, 738), (193, 809), (395, 883), (620, 940),
            (848, 990), (1016, 1019), (1184, 1043), (1292, 1069, C), (1424, 1154), (1569, 1245), (1713, 1321),
            (1857, 1378), (2001, 1421), (2145, 1454), (2385, 1484), (2625, 1495), (2866, 1493), (3106, 1487),
            (3322, 1481, C), (3521, 1469), (3690, 1440), (3740, 1414, C), (3824, 1300), (3891, 1210), (3959, 1149),
            (3979, 1101), (3996, 1034), (4006, 945), (4016, 857), (4034, 778), (4057, 700), (4060, 612), (4060, 505),
            (4034, 423, C), (3942, 352), (3808, 310, C),
        ],
        glass=[
            [(1352, 1015, C), (1400, 1108), (1569, 1223), (1785, 1321), (2025, 1389), (2289, 1416, C), (2361, 1416),
             (2289, 1230), (2217, 1081, C), (1905, 1046), (1665, 1024),],
            [(2404, 1415, C), (2625, 1420), (2866, 1411), (3106, 1387, C), (3190, 1261), (3274, 1151, C),
             (2866, 1115), (2409, 1094, C),],
            [(3142, 1387, C), (3404, 1328), (3555, 1225), (3656, 1153, C), (3286, 1152, C),],
        ],
        lamps=[
            [(3597, 1104, C), (3724, 1084), (3925, 1082), (3976, 1060, C), (3967, 997), (3891, 973), (3824, 960, C),
             (3740, 989), (3656, 1042),],
            [(59, 757, C), (171, 785), (283, 795, C), (216, 743), (103, 700),],
            [(3824, 498), (3925, 518), (3925, 472), (3833, 455),],
        ],
        lines=[
            [(1280, 1029), (1196, 957), (1148, 827), (1141, 593), (1172, 363), (1196, 249),],
            [(2241, 1076, C), (2181, 916), (2145, 723), (2140, 468), (2145, 341),],
            [(3279, 1145), (3303, 1011), (3286, 876), (3238, 739), (3190, 639),],
            [(1184, 322), (1665, 359), (2193, 398), (2625, 402), (2866, 378),],
            [(1629, 938), (1857, 914), (2121, 871), (2385, 799), (2625, 759), (2818, 748),],
            [(148, 514), (260, 644), (486, 732), (755, 772), (920, 748), (1040, 656), (1124, 522), (1184, 365),],
            [(2830, 399), (2866, 521), (2938, 615), (3082, 701), (3274, 770), (3420, 796), (3555, 767), (3639, 707),
             (3724, 621), (3774, 534), (3791, 496),],
            [(3748, 492), (3858, 524), (3993, 588), (4057, 682),],
        ],
        lamp_lines=[
            [(3656, 1069), (3942, 1064),],
            [(103, 748), (260, 778),],
        ],
        mirror=[
            (1360, 1089, C), (1376, 1129), (1436, 1149), (1485, 1141), (1489, 967), (1449, 920), (1388, 907),
            (1376, 964),
        ],
        handles=[(1982, 830), (3082, 940)],
        fuel=(3586, 899),
    ),
    "mazda3": dict(
        # Traced over a photo: Mazda 3 GT side (20846440748).jpg, Zytonits, CC BY-SA 2.0 (docs/19).
        name='Mazda3 (BM/BN) sedan', length=4580, wheelbase=2700, height=1450, front=910, tyre='205/60R16',
        clearance=155, kind='sedan', spokes=(5, True),
        outline=[
            (165, 162, C), (36, 240), (0, 398), (0, 557), (36, 664), (139, 740), (319, 815), (576, 880), (922, 924),
            (1088, 955), (1254, 981), (1439, 1010, C), (1586, 1140), (1775, 1252), (1965, 1340), (2155, 1402),
            (2344, 1435), (2510, 1450), (2747, 1446), (2984, 1430), (3221, 1406), (3411, 1367), (3577, 1314),
            (3787, 1242), (3993, 1180), (4199, 1137), (4384, 1118), (4508, 1107, C), (4510, 1072), (4498, 1006),
            (4487, 931), (4498, 838), (4539, 774), (4580, 692, C), (4580, 601), (4570, 507), (4533, 420),
            (4446, 372), (4364, 347, C),
        ],
        glass=[
            [(1538, 1000, C), (1728, 1106), (2060, 1289), (2273, 1355), (2593, 1391, C), (2510, 1226),
             (2403, 1037, C), (1917, 991),],
            [(2629, 1383, C), (2747, 1377), (3103, 1352), (3340, 1300), (3577, 1218), (3601, 1188, C), (3577, 1117),
             (3221, 1086), (2605, 1044, C),],
        ],
        lamps=[
            [(62, 757, C), (267, 828), (463, 846, C), (422, 804), (165, 715),],
            [(4034, 1019, C), (4323, 1021), (4508, 1006, C), (4508, 913), (4405, 895), (4281, 945),],
        ],
        lines=[
            [(1436, 981), (1344, 856), (1325, 563), (1349, 320), (1420, 224),],
            [(2605, 1390), (2498, 1203), (2403, 1037), (2368, 846), (2349, 578), (2344, 422), (2392, 336),
             (2629, 300), (2866, 312),],
            [(3601, 1188), (3589, 1027), (3506, 843), (3340, 703), (3221, 615),],
            [(1420, 217), (1917, 216), (2629, 235), (3221, 248),],
            [(4117, 940), (4075, 823), (3952, 701),],
            [(1491, 951), (2155, 948),],
        ],
        lamp_lines=[
            [(4075, 1006), (4323, 1006), (4487, 978),],
        ],
        mirror=[
            (1597, 1104, C), (1680, 1141), (1709, 1106), (1704, 1011), (1633, 895), (1586, 960),
        ],
        handles=[(2202, 830), (3233, 895)],
        fuel=(3859, 923),
    ),
    "mazda6": dict(
        # The Mazda3 sedan trace stretched to this car's overhangs, wheelbase and height (docs/19).
        name='Mazda6 (GL) sedan', length=4870, wheelbase=2830, height=1450, front=955, tyre='225/55R17',
        clearance=165, kind='sedan', spokes=(5, True),
        outline=[
            (173, 162, C), (38, 240), (0, 398), (0, 557), (38, 664), (146, 740), (335, 815), (604, 880), (968, 924),
            (1142, 955), (1316, 981), (1509, 1010, C), (1664, 1140), (1862, 1252), (2061, 1340), (2260, 1402),
            (2458, 1435), (2632, 1450), (2880, 1446), (3129, 1430), (3377, 1406), (3576, 1367), (3750, 1314),
            (3983, 1242), (4213, 1180), (4444, 1137), (4651, 1118), (4789, 1107, C), (4792, 1072), (4778, 1006),
            (4766, 931), (4778, 838), (4824, 774), (4870, 692, C), (4870, 601), (4859, 507), (4817, 420),
            (4720, 372), (4628, 347, C),
        ],
        glass=[
            [(1613, 1000, C), (1812, 1106), (2160, 1289), (2384, 1355), (2719, 1391, C), (2632, 1226),
             (2520, 1037, C), (2010, 991),],
            [(2757, 1383, C), (2880, 1377), (3254, 1352), (3502, 1300), (3750, 1218), (3776, 1188, C), (3750, 1117),
             (3377, 1086), (2732, 1044, C),],
        ],
        lamps=[
            [(65, 757, C), (280, 828), (486, 846, C), (443, 804), (173, 715),],
            [(4259, 1019, C), (4583, 1021), (4789, 1006, C), (4789, 913), (4674, 895), (4536, 945),],
        ],
        lines=[
            [(1506, 981), (1410, 856), (1390, 563), (1415, 320), (1490, 224),],
            [(2732, 1390), (2619, 1203), (2520, 1037), (2483, 846), (2463, 578), (2458, 422), (2508, 336),
             (2757, 300), (3005, 312),],
            [(3776, 1188), (3763, 1027), (3676, 843), (3502, 703), (3377, 615),],
            [(1490, 217), (2010, 216), (2757, 235), (3377, 248),],
            [(4352, 940), (4305, 823), (4168, 701),],
            [(1564, 951), (2260, 948),],
        ],
        lamp_lines=[
            [(4305, 1006), (4583, 1006), (4766, 978),],
        ],
        mirror=[
            (1675, 1104, C), (1762, 1141), (1792, 1106), (1787, 1011), (1713, 895), (1664, 960),
        ],
        handles=[(2309, 830), (3390, 895)],
        fuel=(4064, 923),
    ),
    "cx3": dict(
        # Traced over a photo: 2015 Mazda CX-3 Maxx AWD - Dynamic Blue (16822456507).jpg, TuRbO_J from Adelaide, Australia, CC BY 2.0 (docs/19).
        name='CX-3 (DK)', length=4275, wheelbase=2570, height=1550, front=870, tyre='215/60R16',
        clearance=175, kind='suv', spokes=(5, True),
        outline=[
            (112, 205, C), (20, 291), (0, 421), (0, 579), (29, 659), (88, 765), (210, 839), (430, 916), (674, 975),
            (918, 1026), (1086, 1056), (1254, 1081), (1362, 1108, C), (1494, 1196), (1639, 1291), (1783, 1370),
            (1927, 1429), (2071, 1473), (2215, 1507), (2455, 1539), (2695, 1550), (2936, 1548), (3176, 1542),
            (3392, 1536, C), (3623, 1523), (3827, 1493), (3888, 1466, C), (3990, 1348), (4071, 1255), (4153, 1191),
            (4177, 1142), (4198, 1072), (4210, 980), (4222, 889), (4244, 807), (4271, 726), (4275, 634), (4275, 524),
            (4244, 439, C), (4132, 365), (3970, 321, C),
        ],
        glass=[
            [(1422, 1052, C), (1470, 1149), (1639, 1268), (1855, 1370), (2095, 1440), (2359, 1468, C), (2431, 1468),
             (2359, 1275), (2287, 1121, C), (1975, 1085), (1735, 1062),],
            [(2474, 1467, C), (2695, 1472), (2936, 1463), (3176, 1438, C), (3260, 1307), (3344, 1193, C),
             (2936, 1156), (2479, 1134, C),],
            [(3212, 1438, C), (3481, 1377), (3664, 1270), (3786, 1195, C), (3356, 1194, C),],
        ],
        lamps=[
            [(3715, 1145, C), (3868, 1124), (4112, 1122), (4173, 1099, C), (4163, 1034), (4071, 1009),
             (3990, 995, C), (3888, 1025), (3786, 1080),],
            [(64, 785, C), (186, 814), (308, 824, C), (235, 770), (112, 726),],
            [(3990, 516), (4112, 537), (4112, 489), (4000, 472),],
        ],
        lines=[
            [(1350, 1067), (1266, 992), (1218, 857), (1211, 615), (1242, 376), (1266, 258),],
            [(2311, 1116, C), (2251, 950), (2215, 750), (2210, 485), (2215, 354),],
            [(3349, 1187), (3373, 1048), (3356, 908), (3308, 766), (3260, 663),],
            [(1254, 334), (1735, 372), (2263, 413), (2695, 417), (2936, 392),],
            [(1699, 973), (1927, 948), (2191, 903), (2455, 828), (2695, 787), (2888, 775),],
            [(161, 533), (283, 668), (528, 759), (821, 800), (990, 776), (1110, 680), (1194, 541), (1254, 378),],
            [(2900, 414), (2936, 540), (3008, 638), (3152, 727), (3344, 798), (3501, 825), (3664, 795), (3766, 733),
             (3868, 644), (3929, 554), (3949, 514),],
            [(3898, 510), (4031, 543), (4194, 610), (4271, 707),],
        ],
        lamp_lines=[
            [(3786, 1108), (4132, 1103),],
            [(112, 775), (283, 807),],
        ],
        top_fill=[
            (3188, 1447, C), (3416, 1462), (3725, 1448), (3888, 1386), (4031, 1255), (4122, 1191, C), (3786, 1195),
            (3664, 1270), (3481, 1377), (3212, 1438),
        ],
        mirror=[
            (1430, 1129, C), (1446, 1171), (1506, 1191), (1555, 1183), (1559, 1003), (1519, 954), (1458, 940),
            (1446, 999),
        ],
        handles=[(2052, 861), (3152, 975)],
        fuel=(3701, 932),
    ),
    "cx5": dict(
        # Traced over a photo: Mazda CX5 2017 Seitenansicht.JPG, KarleHorn, CC BY 3.0 (docs/19).
        name='CX-5 (KF)', length=4550, wheelbase=2700, height=1680, front=1030, tyre='225/65R17',
        clearance=205, kind='suv', spokes=(10, False),
        outline=[
            (34, 329, C), (6, 404), (0, 535), (11, 665), (0, 773), (0, 838), (0, 904), (28, 959), (120, 1009),
            (290, 1049), (518, 1086), (802, 1124), (1076, 1151), (1309, 1174), (1541, 1192), (1703, 1189, C),
            (1912, 1343), (2051, 1463), (2191, 1572), (2284, 1615, C), (2469, 1650), (2702, 1672), (2934, 1680),
            (3166, 1675), (3305, 1653), (3421, 1628), (3584, 1615), (3783, 1611), (3946, 1554, C), (4065, 1508),
            (4221, 1412), (4347, 1329), (4456, 1231), (4534, 1094), (4550, 893), (4550, 692), (4544, 517),
            (4503, 416), (4425, 353, C), (4253, 337),
        ],
        glass=[
            [(1866, 1169, C), (1982, 1276), (2144, 1408), (2330, 1519), (2469, 1566, C), (2678, 1583), (2702, 1568),
             (2690, 1201, C),],
            [(2743, 1577, C), (2934, 1589), (3166, 1586), (3386, 1554, C), (3619, 1250, C), (2743, 1203, C),],
            [(3444, 1556, C), (3677, 1526), (3883, 1444, C), (3736, 1315), (3630, 1245, C),],
        ],
        lamps=[
            [(125, 901, C), (262, 918), (432, 913), (552, 921, C), (489, 866), (319, 820), (205, 815), (120, 839),],
            [(4237, 1189, C), (4425, 1187), (4541, 1165, C), (4534, 1114), (4487, 1074, C), (4362, 1096),
             (4253, 1152),],
            [(4465, 491), (4519, 486), (4509, 421), (4465, 428),],
        ],
        lines=[
            [(1668, 1149), (1610, 1073), (1592, 856), (1587, 628), (1606, 435),],
            [(2783, 1583), (2748, 1297), (2702, 870), (2667, 586), (2648, 409),],
            [(3653, 1238), (3704, 1178), (3716, 1032), (3718, 909),],
            [(1518, 394), (2005, 399), (2469, 402), (3166, 405), (3305, 407),],
            [(1529, 305), (2237, 300), (3305, 293),],
            [(1866, 1162), (2469, 1183), (3166, 1213), (3630, 1238),],
            [(376, 404), (390, 558), (461, 711), (603, 811), (802, 858), (1076, 876), (1262, 863), (1401, 786),
             (1494, 650), (1541, 491), (1564, 400),],
            [(3305, 395), (3340, 564), (3398, 686), (3514, 808), (3653, 871), (3815, 885), (4002, 863), (4190, 790),
             (4315, 641), (4347, 491), (4268, 416),],
            [(1634, 1084), (2005, 1010), (2469, 996), (2934, 988), (3166, 1016),],
            [(3893, 1434), (3752, 1315), (3642, 1251),],
        ],
        lamp_lines=[
            [(162, 862), (532, 910),],
            [(4268, 1172), (4534, 1155),],
        ],
        mirror=[
            (1908, 1228, C), (1917, 1285), (1982, 1311), (2075, 1307), (2121, 1268), (2117, 1175), (2075, 1116, C),
            (1982, 1103), (1924, 1124),
        ],
        handles=[(2574, 986), (3537, 1064)],
    ),
    "cx8": dict(
        # The CX5 trace stretched to this car's overhangs, wheelbase and height (docs/19).
        name='CX-8 (KG)', length=4900, wheelbase=2930, height=1730, front=935, tyre='225/65R17',
        clearance=205, kind='suv', spokes=(10, False),
        outline=[
            (31, 339, C), (5, 416), (0, 551), (10, 685), (0, 796), (0, 863), (0, 931), (25, 988), (109, 1039),
            (263, 1080), (470, 1118), (728, 1157), (985, 1185), (1238, 1209), (1490, 1227), (1665, 1224, C),
            (1892, 1383), (2043, 1507), (2195, 1619), (2296, 1663, C), (2497, 1699), (2749, 1722), (3001, 1730),
            (3253, 1725), (3404, 1702), (3530, 1676), (3707, 1663), (3932, 1659), (4138, 1600, C), (4288, 1553),
            (4485, 1454), (4644, 1369), (4781, 1268), (4880, 1127), (4900, 920), (4900, 713), (4892, 532),
            (4841, 428), (4742, 364, C), (4525, 347),
        ],
        glass=[
            [(1842, 1204, C), (1968, 1314), (2144, 1450), (2346, 1564), (2497, 1613, C), (2723, 1630), (2749, 1615),
             (2736, 1237, C),],
            [(2794, 1624, C), (3001, 1636), (3253, 1633), (3492, 1600, C), (3745, 1287, C), (2794, 1239, C),],
            [(3555, 1602, C), (3807, 1571), (4058, 1487, C), (3873, 1354), (3756, 1282, C),],
        ],
        lamps=[
            [(113, 928, C), (238, 945), (392, 940), (501, 948, C), (444, 892), (290, 844), (186, 839), (109, 864),],
            [(4505, 1224, C), (4742, 1222), (4889, 1200, C), (4880, 1147), (4820, 1106, C), (4663, 1129),
             (4525, 1186),],
            [(4793, 506), (4861, 500), (4848, 434), (4793, 441),],
        ],
        lines=[
            [(1627, 1183), (1564, 1105), (1545, 881), (1539, 647), (1560, 448),],
            [(2837, 1630), (2799, 1336), (2749, 896), (2711, 603), (2691, 421),],
            [(3781, 1275), (3837, 1213), (3850, 1063), (3852, 936),],
            [(1465, 406), (1993, 411), (2497, 414), (3253, 417), (3404, 419),],
            [(1477, 314), (2245, 309), (3404, 302),],
            [(1842, 1197), (2497, 1218), (3253, 1249), (3756, 1275),],
            [(341, 416), (354, 575), (418, 732), (547, 835), (728, 884), (985, 902), (1187, 889), (1338, 809),
             (1439, 669), (1490, 506), (1514, 412),],
            [(3404, 407), (3442, 581), (3505, 706), (3631, 832), (3781, 897), (3972, 911), (4208, 889), (4446, 814),
             (4603, 660), (4644, 506), (4544, 428),],
            [(1590, 1116), (1993, 1040), (2497, 1026), (3001, 1017), (3253, 1046),],
            [(4071, 1477), (3893, 1354), (3770, 1288),],
        ],
        lamp_lines=[
            [(147, 888), (483, 937),],
            [(4544, 1207), (4880, 1189),],
        ],
        mirror=[
            (1888, 1265, C), (1898, 1323), (1968, 1350), (2069, 1346), (2119, 1306), (2115, 1210), (2069, 1149, C),
            (1968, 1136), (1905, 1157),
        ],
        handles=[(2611, 1015), (3656, 1096)],
    ),
    "cx9": dict(
        # The CX5 trace stretched to this car's overhangs, wheelbase and height (docs/19).
        name='CX-9 (TC)', length=5075, wheelbase=2930, height=1747, front=985, tyre='255/60R18',
        clearance=220, kind='suv', spokes=(10, False),
        outline=[
            (33, 342, C), (6, 420), (0, 556), (11, 692), (0, 804), (0, 871), (0, 940), (27, 997), (115, 1049),
            (277, 1091), (495, 1129), (767, 1169), (1035, 1197), (1288, 1221), (1540, 1240), (1715, 1236, C),
            (1942, 1397), (2093, 1521), (2245, 1635), (2346, 1679, C), (2547, 1716), (2799, 1739), (3051, 1747),
            (3303, 1742), (3454, 1719), (3580, 1693), (3757, 1679), (3990, 1675), (4221, 1616, C), (4389, 1568),
            (4610, 1468), (4788, 1382), (4942, 1280), (5052, 1138), (5075, 929), (5075, 720), (5067, 538),
            (5009, 433), (4898, 367, C), (4655, 350),
        ],
        glass=[
            [(1892, 1216, C), (2018, 1327), (2194, 1464), (2396, 1580), (2547, 1628, C), (2773, 1646), (2799, 1631),
             (2786, 1249, C),],
            [(2844, 1640, C), (3051, 1652), (3303, 1649), (3542, 1616, C), (3795, 1300, C), (2844, 1251, C),],
            [(3605, 1618, C), (3857, 1587), (4131, 1502, C), (3923, 1367), (3806, 1295, C),],
        ],
        lamps=[
            [(120, 937, C), (251, 955), (413, 949), (528, 958, C), (468, 901), (305, 853), (196, 848), (115, 872),],
            [(4632, 1236, C), (4898, 1234), (5062, 1211, C), (5052, 1158), (4986, 1117, C), (4809, 1140),
             (4655, 1198),],
            [(4955, 511), (5031, 505), (5017, 438), (4955, 445),],
        ],
        lines=[
            [(1677, 1195), (1614, 1116), (1595, 890), (1589, 653), (1610, 452),],
            [(2887, 1646), (2849, 1349), (2799, 905), (2761, 609), (2741, 425),],
            [(3831, 1287), (3887, 1225), (3900, 1073), (3902, 945),],
            [(1515, 410), (2043, 415), (2547, 418), (3303, 421), (3454, 423),],
            [(1527, 317), (2295, 312), (3454, 305),],
            [(1892, 1208), (2547, 1230), (3303, 1261), (3806, 1287),],
            [(360, 420), (373, 580), (441, 739), (577, 843), (767, 892), (1035, 911), (1237, 897), (1388, 817),
             (1489, 676), (1540, 511), (1564, 416),],
            [(3454, 411), (3492, 586), (3555, 713), (3681, 840), (3831, 906), (4035, 920), (4300, 897), (4566, 822),
             (4743, 667), (4788, 511), (4676, 433),],
            [(1640, 1127), (2043, 1050), (2547, 1036), (3051, 1027), (3303, 1057),],
            [(4146, 1491), (3946, 1367), (3820, 1301),],
        ],
        lamp_lines=[
            [(155, 896), (509, 946),],
            [(4676, 1219), (5052, 1201),],
        ],
        mirror=[
            (1938, 1277, C), (1948, 1336), (2018, 1363), (2119, 1359), (2169, 1319), (2165, 1222), (2119, 1161, C),
            (2018, 1147), (1955, 1169),
        ],
        handles=[(2661, 1025), (3706, 1106)],
    ),
}


def tyre_mm(tyre):
    width, aspect, rim = map(int, re.fullmatch(r"(\d{3})/(\d{2})R(\d{2})", tyre).groups())
    return rim * 25.4 + 2 * width * aspect / 100, rim * 25.4


def fmt(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


class View:
    """mm (x from the front bumper, y up from the road) to view units, centred in the box."""

    def __init__(self, length):
        self.x0 = (VIEW_W - length * SCALE) / 2

    def xy(self, x, y):
        return self.x0 + x * SCALE, GROUND - y * SCALE

    def pt(self, x, y):
        px, py = self.xy(x, y)
        return f"{fmt(px)} {fmt(py)}"

    def path(self, steps):
        out = []
        for step in steps:
            op, nums = step[0], step[1:]
            out.append(op + " ".join(self.pt(nums[i], nums[i + 1]) for i in range(0, len(nums), 2)))
        return "".join(out)

    def spline(self, pts, closed=False):
        """Smooth curve through the points (Catmull-Rom as cubic Beziers); a point marked "c" is a corner."""
        p = [self.xy(q[0], q[1]) for q in pts]
        corner = [len(q) > 2 for q in pts]
        n = len(p)

        def at(j):
            return p[j % n] if closed else p[max(0, min(n - 1, j))]

        out = [f"M{fmt(p[0][0])} {fmt(p[0][1])}"]
        for i in range(n if closed else n - 1):
            a, b = p[i], at(i + 1)
            prev = a if corner[i] else at(i - 1)
            nxt = b if corner[(i + 1) % n] else at(i + 2)
            c1 = (a[0] + (b[0] - prev[0]) / 6, a[1] + (b[1] - prev[1]) / 6)
            c2 = (b[0] - (nxt[0] - a[0]) / 6, b[1] - (nxt[1] - a[1]) / 6)
            out.append("C" + " ".join(f"{fmt(x)} {fmt(y)}" for x, y in (c1, c2, b)))
        return "".join(out) + ("Z" if closed else "")


def arch_point(axle, centre_y, radius, y, behind):
    """The point of a wheel arch circle at height y, behind (+x) or in front of (-x) the axle."""
    dx = math.sqrt(max(radius**2 - (y - centre_y) ** 2, 0))
    return (axle + dx if behind else axle - dx, y)


def wheel(view, axle, r, rim, design=(5, True)):
    """Tyre, rim and brake; design: (spoke count, twin spokes)."""
    cx, cy = view.xy(axle, r)
    s = SCALE

    def circle(radius, width, extra=""):
        return f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(radius * s)}" {stroke(width, extra)}/>'

    def polar(radius, deg):
        t = math.radians(deg)
        return f"{fmt(cx + radius * s * math.cos(t))} {fmt(cy + radius * s * math.sin(t))}"

    rr = rim / 2
    spokes = []
    count, twin = design
    for k in range(count):
        base = -90 + 360 / count * k
        for side in ((-7, 7) if twin else (-4, 4)):
            a0, a1 = base + side, base + side * 0.6 + 9
            spokes.append(f"M{polar(rr * 0.3, a0)}Q{polar(rr * 0.62, a0 + 5)} {polar(rr * 0.9, a1)}")
    lugs = ""
    for k in range(5):
        lx, ly = polar(rr * 0.17, -90 + 72 * k).split()
        lugs += f'<circle cx="{lx}" cy="{ly}" r="{fmt(16 * s)}" {stroke(FINE * 0.7)}/>'
    caliper = (f"M{polar(rr * 0.62, 150)}A{fmt(rr * 0.62 * s)} {fmt(rr * 0.62 * s)} 0 0 1 {polar(rr * 0.62, 200)}"
               f"L{polar(rr * 0.8, 200)}A{fmt(rr * 0.8 * s)} {fmt(rr * 0.8 * s)} 0 0 0 {polar(rr * 0.8, 150)}Z")
    return "".join([
        circle(r, MID), circle(r * 0.94, FINE, 'stroke-opacity=".55"'), circle(rr, MID), circle(rr * 0.93, FINE),
        circle(rr * 0.72, FINE, 'stroke-opacity=".5" stroke-dasharray=".6 .5"'),
        f'<path d="{caliper}" {stroke(FINE)}/>',
        f'<path d="{"".join(spokes)}" {stroke(FINE)}/>',
        circle(rr * 0.28, FINE), lugs, circle(rr * 0.08, FINE),
    ])


def car_parts(c):
    view = View(c["length"])
    diameter, rim = tyre_mm(c["tyre"])
    r = diameter / 2
    fa, ra = c["front"], c["front"] + c["wheelbase"]
    suv = c["kind"] == "suv"
    ar = r + (45 if suv else 30)
    sill = c["clearance"]
    start, end = c["outline"][0][:2], c["outline"][-1][:2]
    rear_out, rear_in = arch_point(ra, r, ar, end[1], True), arch_point(ra, r, ar, sill, False)
    front_out, front_in = arch_point(fa, r, ar, sill, True), arch_point(fa, r, ar, start[1], False)
    a = fmt(ar * SCALE)
    sag = (rear_in[0] - front_out[0]) / 3
    bottom = (f"L{view.pt(*rear_out)}A{a} {a} 0 1 0 {view.pt(*rear_in)}"
              f"C{view.pt(rear_in[0] - sag, sill - 12)} {view.pt(front_out[0] + sag, sill - 12)} {view.pt(*front_out)}"
              f"A{a} {a} 0 1 0 {view.pt(*front_in)}C{view.pt(front_in[0] - 150, start[1] - 5)} "
              f"{view.pt(start[0] + 120, start[1] - 5)} {view.pt(*start)}")
    parts = []
    # Construction: the road and the wheel centres.
    road = stroke(CONS, 'stroke-opacity=".45" stroke-dasharray="2.4 1.2"')
    parts.append(f'<path d="M{view.pt(-140, 0)}L{view.pt(c["length"] + 140, 0)}" {road}/>')
    marks = "".join(f"M{view.pt(x - r - 70, r)}L{view.pt(x + r + 70, r)}M{view.pt(x, -40)}L{view.pt(x, 2 * r + 70)}"
                    for x in (fa, ra))
    parts.append(f'<path d="{marks}" {stroke(CONS * 0.8, 'stroke-opacity=".35" stroke-dasharray="1.2 .7"')}/>')
    # Tinted panels first, lines on top.
    if c.get("top_fill"):
        tint = view.spline(c["top_fill"], True)
        parts.append(f'<path d="{tint}" {stroke(FINE, fill="currentColor", opacity=".12")}/>')
    for g in c.get("glass", []):
        parts.append(f'<path d="{view.spline(g, True)}" {stroke(MID, fill="currentColor", opacity=".1")}/>')
    if c.get("dlo"):
        parts.append(f'<path d="{view.spline(c["dlo"], True)}" {stroke(FINE)}/>')
    parts.append(f'<path d="{view.spline(c["outline"])}{bottom}" {stroke(BODY)}/>')
    # Wheel arch lips (and SUV cladding flares).
    for off in ((22, 62) if suv else (22,)):
        lr = ar + off
        lips = ""
        for axle, lo, hi in ((fa, start[1], sill), (ra, sill, end[1])):
            p1 = arch_point(axle, r, lr, max(lo, sill) + 15, False)
            p2 = arch_point(axle, r, lr, max(hi, sill) + 15, True)
            lips += f"M{view.pt(*p1)}A{fmt(lr * SCALE)} {fmt(lr * SCALE)} 0 1 1 {view.pt(*p2)}"
        parts.append(f'<path d="{lips}" {stroke(FINE)}/>')
    lines = list(c.get("lines", []))
    # Bumper seams: from the top of each wheel arch round to the lamp above it.
    lamps = c.get("lamps", [])
    if len(lamps) >= 2:
        hx, hy = max(lamps[0], key=lambda p: p[0])[:2]
        p0 = (fa - 0.7 * ar, r + 0.72 * ar)
        lines.append([p0, ((p0[0] + hx) / 2 - 70, (p0[1] + hy) / 2 + 25), (hx - 30, hy - 35)])
        tx, ty = min(lamps[1], key=lambda p: p[0])[:2]
        p0 = (ra + 0.7 * ar, r + 0.72 * ar)
        bumper = r + ar + 170  # the rear bumper's top edge: below the lamps on tall cars
        if ty - 35 > bumper:
            tx, ty = c["length"] - 25, bumper + 35
        end_x = tx + 30 if tx < c["length"] - 100 else tx
        lines.append([p0, ((p0[0] + tx) / 2 + 70, (p0[1] + ty) / 2 + 25), (end_x, ty - 35)])
    if lines:
        parts.append(f'<path d="{"".join(view.spline(line) for line in lines)}" {stroke(MID)}/>')
    # Exhaust tip under the rear bumper and a shark-fin antenna on the roof.
    ex, ey = end[0] - 120, end[1] + 45
    small_parts = view.spline([(ex - 70, ey), (ex, ey + 28), (ex + 70, ey), (ex, ey - 28)], True)
    if c["kind"] != "roadster":  # a soft top has no shark-fin antenna
        roof = [p for p in c["outline"] if p[0] > c["length"] * 0.62]
        rx, ry = max(roof, key=lambda p: p[1])[:2]
        fin = [(rx - 40, ry - 8, C), (rx + 20, ry + 30), (rx + 120, ry + 45), (rx + 170, ry - 12, C)]
        small_parts += view.spline(fin)
    parts.append(f'<path d="{small_parts}" {stroke(FINE)}/>')
    for lamp in c.get("lamps", []):
        parts.append(f'<path d="{view.spline(lamp, True)}" {stroke(MID, fill="currentColor", opacity=".12")}/>')
    if c.get("lamp_lines"):
        parts.append(f'<path d="{"".join(view.spline(line) for line in c["lamp_lines"])}" {stroke(FINE)}/>')
    for g in c.get("grille", []):
        parts.append(f'<path d="{view.spline(g, True)}" {stroke(FINE, fill="currentColor", opacity=".06")}/>')
    if c.get("mirror"):
        parts.append(f'<path d="{view.spline(c["mirror"], True)}" {stroke(MID)}/>')
    small = ""
    for hx, hy in c.get("handles", []):
        small += view.spline([(hx - 60, hy, C), (hx, hy + 14), (hx + 60, hy, C), (hx, hy - 14)], True)
    if c.get("fuel"):
        fx, fy = c["fuel"]
        small += view.spline([(fx - 70, fy), (fx, fy + 70), (fx + 70, fy), (fx, fy - 70)], True)
    if small:
        parts.append(f'<path d="{small}" {stroke(FINE)}/>')
    for axle in (fa, ra):
        parts.append(wheel(view, axle, r, rim, c.get("spokes", (5, True))))
    return parts


def car_symbol(key, c):
    head = (f'  <symbol id="{key}" viewBox="0 0 {VIEW_W} {VIEW_H}">\n'
            f"    <!-- {c['name']}: {c['length']} mm long, {c['wheelbase']} mm wheelbase, "
            f"{c['height']} mm high, {c['tyre']}. -->\n")
    return head + "".join(f"    {p}\n" for p in car_parts(c)) + "  </symbol>"


def build(existing):
    maps = re.findall(r'  <symbol id="(?:eu|uk|us|jp|au)".*?</symbol>', existing, re.S)
    if len(maps) != 5:
        raise SystemExit("expected the five map symbols in " + str(OUT))
    head = (
        '<svg xmlns="http://www.w3.org/2000/svg">\n'
        "  <!-- Car cards: made by tools/make_car_outlines.py (to scale from published dimensions).\n"
        "       Market cards: simplified Natural Earth boundaries, see docs/19-mazda-connect-models.md. -->\n"
    )
    cars = [car_symbol(k, c) for k, c in CARS.items()]
    return head + "\n".join(cars + maps) + "\n</svg>\n"


def main():
    if "--json" in sys.argv[1:]:
        print(json.dumps({k: "".join(car_parts(c)) for k, c in CARS.items()}))
        return 0
    existing = OUT.read_text(encoding="utf-8")
    text = build(existing)
    if "--check" in sys.argv[1:]:
        if text != existing:
            print(f"{OUT} is out of date: run python tools/make_car_outlines.py", file=sys.stderr)
            return 1
        return 0
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print("wrote", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())

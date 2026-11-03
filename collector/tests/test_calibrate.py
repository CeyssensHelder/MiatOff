#!/usr/bin/env python3
"""Tests for collector/tools/calibrate.py on simulated drives with known scales.

A 5-minute drive (standstill, pedal sweep, accelerating, braking, turns both
ways) is simulated with known sensor zero points and gains, a known wheel
scale and a scrambled wheel order, and written exactly as the dump stick's
CALIBRATION mode records it. The script must recover those values.

Run: python collector/tests/test_calibrate.py
"""
import importlib.util
import math
from pathlib import Path
import random
import sys
import tempfile

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("calibrate", HERE.parent / "tools/calibrate.py")
cal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cal)

FAILURES = []
G = 9.80665
TRUE = dict(z_lon=4024, z_lat=3990, z_yaw=2047, k_lon=-38.0, k_lat=41.0, k_yaw=-4.5, k_wheel=0.0055,
            pedal_max=1000)
WHEELBASE, HALF_TRACK = 2.31, 0.75
# WheelSpeed1..4 = rear-left, front-right, front-left, rear-right (scrambled on purpose)
ORDER = ("RL", "FR", "FL", "RR")


def check(cond, message):
    print(("PASS  " if cond else "FAIL  ") + message)
    if not cond:
        FAILURES.append(message)


def close(a, b, rel):
    return a is not None and b != 0 and abs(a - b) <= abs(b) * rel


def profile():
    """(seconds, acceleration m/s2, turn rate rad/s, pedal override or None)."""
    seq = [(15, 0, 0, 0), (10, 0, 0, "sweep"), (10, 2.0, 0, None), (10, 0, 0, None), (5, -4.0, 0, None),
           (5, 0, 0, 0), (10, 1.5, 0, None)]
    for w in (0.25, -0.25, 0.4, -0.4):
        seq += [(15, 0, w, None), (3, 0, 0, None)]
    for _ in range(4):
        seq += [(6, 2.5, 0, None), (4, -3.5, 0, None), (8, 0, 0.3, None), (8, 0, -0.3, None)]
    seq += [(10, -1.2, 0, None)]
    return seq


def simulate(seed=1, with_yaw=True):
    rnd = random.Random(seed)
    t, v = 100.0, 0.0
    text, yaw_rows, tick, sweep_t = [], ["uptime\tYawRate"], 0, 0.0

    def sig(iface, member, *values):
        text.append(f"@{t:.2f}")
        text.append(f"signal sender=:1.14 -> dest=(null destination) serial={tick} path=/x; "
                    f"interface={iface}; member={member}")
        if len(values) == 1:
            text.append(f"   uint16 {values[0]}")
        else:
            text.append("   struct {")
            text.extend(f"      uint16 {x}" for x in values[:-1])
            text.append(f"      uint64 {values[-1]}")
            text.append("   }")

    for seconds, a, w, pedal_mode in profile():
        for _ in range(int(seconds * 10)):
            a_true = a if (v > 0 or a > 0) else 0.0
            v = max(0.0, v + a_true * 0.1)
            if v == 0:
                a_true, w_true = 0.0, 0.0
            else:
                w_true = w
            if pedal_mode == "sweep":
                sweep_t += 0.1
                pedal = round(TRUE["pedal_max"] * abs(math.sin(sweep_t * math.pi / 5)))
            elif pedal_mode == 0 or a_true <= 0:
                pedal = 0
            else:
                pedal = min(TRUE["pedal_max"], round(250 + 150 * a_true))
            n = lambda s: rnd.gauss(0, s)
            sig("com.jci.vbs.vdt", "Veh_V_ActlEng", round(v * 3.6 / 0.01))
            sig("com.jci.vbs.vdt", "VehLong_A_Actl", round(TRUE["z_lon"] + TRUE["k_lon"] * a_true + n(2)))
            sig("com.jci.vbs.vdt", "Lateral_Acceleration", round(TRUE["z_lat"] + TRUE["k_lat"] * v * w_true + n(2)))
            if tick % 3 != 2:
                sig("com.jci.vbs.vdt", "ApedPos_Pc_ActlArb", pedal)
            front = math.sqrt(1 + (WHEELBASE * w_true / v) ** 2) if v > 0 else 1.0
            speeds = {"RL": v - w_true * HALF_TRACK, "RR": v + w_true * HALF_TRACK}
            speeds["FL"], speeds["FR"] = speeds["RL"] * front, speeds["RR"] * front
            raw = [max(0, round(speeds[k] * 3.6 / TRUE["k_wheel"] + n(1))) for k in ORDER]
            sig("com.jci.vbs.bcm", "WheelSpeedNotification", tick % 65536, 0, *raw, 0)
            if with_yaw and tick % 5 != 4:
                yaw_rows.append(f"{t + 0.05:.2f}\t{round(TRUE['z_yaw'] + TRUE['k_yaw'] * math.degrees(w_true) + n(1))}")
            t += 0.1
            tick += 1
    return "\n".join(text) + "\n", "\n".join(yaw_rows) + "\n"


def run(name, with_yaw=True):
    d = Path(tempfile.mkdtemp(prefix="mo-cal-")) / name
    d.mkdir(parents=True)
    signals, yaw = simulate(with_yaw=with_yaw)
    (d / "signals.txt").write_text(signals)
    if with_yaw:
        (d / "yaw.tsv").write_text(yaw)
    return cal.analyse(d)


def main():
    out = run("full")
    z = out["zero"]
    check(abs(z["LongitudinalAccelerometer"] - TRUE["z_lon"]) <= 2, f"zero longitudinal {z['LongitudinalAccelerometer']}")
    check(abs(z["LateralAcceleration"] - TRUE["z_lat"]) <= 2, f"zero lateral {z['LateralAcceleration']}")
    check(abs(z["YawRate"] - TRUE["z_yaw"]) <= 1, f"zero yaw {z['YawRate']}")
    check(out["pedal"] == {"released": 0, "floored": TRUE["pedal_max"]}, f"pedal range {out['pedal']}")
    check(close(out["wheel_kmh_per_count"]["k"], TRUE["k_wheel"], 0.01),
          f"wheel scale {out['wheel_kmh_per_count']['k']}")
    lon = out["longitudinal"]
    check(close(lon["counts_per_g"], TRUE["k_lon"] * G, 0.05) and cal.reliable(lon),
          f"longitudinal {lon['counts_per_g']:.1f} counts/g (true {TRUE['k_lon'] * G:.1f}, R2 {lon['r2']:.3f})")
    lat = out["lateral"]
    check(close(lat["counts_per_g"], TRUE["k_lat"] * G, 0.05) and cal.reliable(lat),
          f"lateral {lat['counts_per_g']:.1f} counts/g (true {TRUE['k_lat'] * G:.1f}, R2 {lat['r2']:.3f})")
    yaw = out["yaw"]
    # Sign of the turn rate follows the lateral sensor; the yaw sensor's own sign
    # relative to it is what the fit reports.
    expected_yaw = TRUE["k_yaw"] * (1 if TRUE["k_lat"] > 0 else -1)
    check(close(yaw["counts_per_deg_s"], expected_yaw, 0.05) and cal.reliable(yaw),
          f"yaw {yaw['counts_per_deg_s']:.2f} counts per deg/s (true {expected_yaw}, R2 {yaw['r2']:.3f})")
    check(out.get("front_pair") == (2, 3), f"front axle found: {out.get('front_pair')} (true FR=2, FL=3)")
    check(sorted(out["left_right_pairs"]) == [(1, 4), (2, 3)], f"left/right pairs {out['left_right_pairs']}")
    report = cal.report(out)
    check("UNRELIABLE" not in report and "units per g" in report, "report in English, all fits reliable")
    print(report)

    out = run("no-yaw", with_yaw=False)
    check(out["yaw"]["counts_per_deg_s"] is None and out["lateral"]["counts_per_g"] is not None,
          "without yaw.tsv: yaw not determined, the rest still works")
    check("yaw rate: cannot be determined" in cal.report(out), "report says yaw could not be determined")

    print()
    print(f"{len(FAILURES)} failure(s)" if FAILURES else "All tests passed.")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()

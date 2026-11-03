#!/usr/bin/env python3
"""Compute the Meters scales from a CALIBRATION recording of the dump stick.

Usage:
    python collector/tools/calibrate.py <dump>/calibration

Input (written by dump.sh, mode CALIBRATION):
    signals.txt   dbus-monitor output of com.jci.vbs.vdt/bcm, each signal preceded by "@<uptime>"
    yaw.tsv       uptime and YawRate from smdb

The scales follow from the drive itself, no exact manoeuvres needed:
    zero points       medians while standing still (speed 0 for >= 5 s)
    pedal             minimum and maximum of ApedPos_Pc_ActlArb
    wheel scale       mean wheel value against VehicleSpeed (x0.01 km/h, confirmed)
    longitudinal      sensor against dv/dt of the vehicle speed
    yaw               sensor against the turn rate from the left/right wheel-speed difference
    lateral           sensor against speed x turn rate
Each fit reports R^2 and the number of samples; a fit with R^2 < 0.8 or few samples
is marked unreliable.

SPDX-License-Identifier: GPL-3.0-or-later
"""
from bisect import bisect_left
from itertools import combinations
import math
from pathlib import Path
import re
import statistics
import sys

G = 9.80665
TRACK_M = 1.50          # ND MX-5: 1495 mm front, 1505 mm rear
SPEED_SCALE = 0.01      # Veh_V_ActlEng -> km/h (confirmed against GPS and gearing)


class Series:
    def __init__(self):
        self.t, self.v = [], []

    def add(self, t, v):
        self.t.append(t)
        self.v.append(v)

    def at(self, t):
        """Linear interpolation; None outside the recorded range."""
        if not self.t or t < self.t[0] or t > self.t[-1]:
            return None
        i = bisect_left(self.t, t)
        if self.t[i] == t or i == 0:
            return self.v[i]
        t0, t1, v0, v1 = self.t[i - 1], self.t[i], self.v[i - 1], self.v[i]
        return v0 + (v1 - v0) * (t - t0) / (t1 - t0) if t1 > t0 else v1


def parse_signals(path):
    series = {}
    t, member, values = None, None, []

    def done():
        if member and values and t is not None:
            if member == "WheelSpeedNotification":
                for i, v in enumerate(values[2:6], 1):
                    series.setdefault(f"Wheel{i}", Series()).add(t, v)
            else:
                series.setdefault(member, Series()).add(t, values[0])

    for line in Path(path).read_text(errors="replace").splitlines():
        if line.startswith("@"):
            done()
            member, values = None, []
            try:
                t = float(line[1:])
            except ValueError:
                t = None
        elif line.startswith("signal "):
            if member:
                done()
            member = line.split("member=")[-1].strip()
            values = []
        else:
            m = re.match(r"\s+(?:byte|u?int(?:16|32|64)|double) (-?[\d.]+)$", line)
            if m:
                values.append(float(m.group(1)))
    done()
    return series


def parse_yaw(path):
    s = Series()
    p = Path(path)
    if p.exists():
        for line in p.read_text().splitlines()[1:]:
            parts = line.split("\t")
            if len(parts) == 2:
                try:
                    s.add(float(parts[0]), float(parts[1]))
                except ValueError:
                    pass
    return s


def fit_origin(xs, ys):
    """y = k*x through the origin; returns (k, r2, n)."""
    n = len(xs)
    sxx = sum(x * x for x in xs)
    if n < 10 or sxx == 0:
        return None, 0.0, n
    k = sum(x * y for x, y in zip(xs, ys)) / sxx
    ss_res = sum((y - k * x) ** 2 for x, y in zip(xs, ys))
    ss_tot = sum(y * y for y in ys)
    return k, (1 - ss_res / ss_tot) if ss_tot else 0.0, n


def corr(xs, ys):
    if len(xs) < 10:
        return 0.0
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy) if sx and sy else 0.0


def standstill_windows(speed, min_s=5.0):
    windows, start = [], None
    for t, v in zip(speed.t, speed.v):
        if v == 0 and start is None:
            start = t
        elif v != 0 and start is not None:
            if t - start >= min_s:
                windows.append((start + 1, t - 1))
            start = None
    if start is not None and speed.t[-1] - start >= min_s:
        windows.append((start + 1, speed.t[-1] - 1))
    return windows


def analyse(cal_dir):
    cal_dir = Path(cal_dir)
    s = parse_signals(cal_dir / "signals.txt")
    yaw = parse_yaw(cal_dir / "yaw.tsv")
    speed = s.get("Veh_V_ActlEng", Series())
    lon, lat = s.get("VehLong_A_Actl", Series()), s.get("Lateral_Acceleration", Series())
    pedal = s.get("ApedPos_Pc_ActlArb", Series())
    wheels = [s.get(f"Wheel{i}", Series()) for i in range(1, 5)]
    out = {"samples": {k: len(v.t) for k, v in s.items()}, "yaw_samples": len(yaw.t)}

    # Zero points while standing still.
    win = standstill_windows(speed)
    out["standstill_s"] = round(sum(b - a for a, b in win), 1)

    def zero(series):
        vals = [v for t, v in zip(series.t, series.v) if any(a <= t <= b for a, b in win)]
        return statistics.median(vals) if vals else None

    z_lon, z_lat, z_yaw = zero(lon), zero(lat), zero(yaw)
    out["zero"] = {"LongitudinalAccelerometer": z_lon, "LateralAcceleration": z_lat, "YawRate": z_yaw}

    # Pedal range.
    if pedal.v:
        out["pedal"] = {"released": min(pedal.v), "floored": max(pedal.v)}

    # Wheel scale (km/h per count) while moving straight-ish.
    moving = [(t, v * SPEED_SCALE) for t, v in zip(speed.t, speed.v) if v * SPEED_SCALE > 10]
    xs, ys = [], []
    for t, kmh in moving:
        w = [wh.at(t) for wh in wheels]
        if None not in w:
            xs.append(sum(w) / 4)
            ys.append(kmh)
    k_wheel, r2, n = fit_origin(xs, ys)
    out["wheel_kmh_per_count"] = {"k": k_wheel, "r2": r2, "n": n}

    # Longitudinal: sensor against dv/dt (central difference over 1 s).
    xs, ys = [], []
    if z_lon is not None:
        for t, raw in zip(lon.t, lon.v):
            v0, v1, vm = speed.at(t - 0.5), speed.at(t + 0.5), speed.at(t)
            if None in (v0, v1, vm) or vm * SPEED_SCALE < 5:
                continue
            a = (v1 - v0) * SPEED_SCALE / 3.6          # m/s per 1 s
            xs.append(a)
            ys.append(raw - z_lon)
    k, r2, n = fit_origin(xs, ys)
    out["longitudinal"] = {"counts_per_ms2": k, "counts_per_g": k * G if k else None, "r2": r2, "n": n}

    # Turn rate from left/right wheel differences: find the left/right pairs.
    pairs = {}
    if k_wheel:
        tgrid = [t for t, kmh in moving][::2]
        for i, j in combinations(range(4), 2):
            d, y = [], []
            for t in tgrid:
                wi, wj, yv = wheels[i].at(t), wheels[j].at(t), lat.at(t)
                if None in (wi, wj, yv):
                    continue
                d.append((wi - wj) * k_wheel)
                y.append(yv)
            pairs[(i + 1, j + 1)] = corr(d, y)
    out["wheel_pair_corr_with_lateral"] = {f"{a}-{b}": round(c, 3) for (a, b), c in pairs.items()}
    # Four wheels split into two pairs in three ways. Left/right and diagonal
    # splits both follow the turns; the same-side split (front/rear on one
    # side) hardly does. Start with the split that follows the turns best.
    splits = [((1, 2), (3, 4)), ((1, 3), (2, 4)), ((1, 4), (2, 3))]
    turn_split = max(splits, key=lambda sp: min(abs(pairs[p]) for p in sp)) if pairs else None

    def omega(t, split=None):
        """Turn rate in rad/s, averaged over the two pairs of a split (sign: as the lateral sensor)."""
        split = split or turn_split
        rates = []
        for p in split or ():
            wi, wj = wheels[p[0] - 1].at(t), wheels[p[1] - 1].at(t)
            if None in (wi, wj):
                return None
            sign = 1 if pairs[p] >= 0 else -1
            rates.append(sign * (wi - wj) * k_wheel / 3.6 / TRACK_M)
        return sum(rates) / len(rates) if rates else None

    # Front/rear: within each same-side pair the front wheel runs a wider arc in
    # every turn, so it is faster whichever way the car turns.
    best = other = None
    if turn_split:
        same_side = min(splits, key=lambda sp: max(abs(pairs[p]) for p in sp))
        front = []
        for a, b in same_side:
            diff = []
            for t in [t for t, kmh in moving][::2]:
                w = omega(t)
                wa, wb = wheels[a - 1].at(t), wheels[b - 1].at(t)
                if w is None or None in (wa, wb) or abs(w) < 0.1:
                    continue
                diff.append(wa - wb)
            if len(diff) >= 10:
                front.append(a if statistics.fmean(diff) > 0 else b)
        if len(front) == 2:
            best = tuple(sorted(front))
            other = tuple(sorted(set(range(1, 5)) - set(front)))
            for p in (best, other):
                if p not in pairs:
                    pairs[p] = pairs[(p[1], p[0])]
            out["front_pair"] = best
        else:
            best, other = turn_split
    out["left_right_pairs"] = [best, other] if best else []
    lr_split = (best, other) if best else None

    # Yaw: sensor against turn rate (deg/s).
    xs, ys = [], []
    if best and z_yaw is not None:
        for t, raw in zip(yaw.t, yaw.v):
            vm, w = speed.at(t), omega(t, lr_split)
            if None in (vm, w) or vm * SPEED_SCALE < 10:
                continue
            xs.append(math.degrees(w))
            ys.append(raw - z_yaw)
    k, r2, n = fit_origin(xs, ys)
    out["yaw"] = {"counts_per_deg_s": k, "r2": r2, "n": n}

    # Lateral: sensor against v * omega.
    xs, ys = [], []
    if best and z_lat is not None:
        for t, raw in zip(lat.t, lat.v):
            vm, w = speed.at(t), omega(t, lr_split)
            if None in (vm, w) or vm * SPEED_SCALE < 10:
                continue
            xs.append(vm * SPEED_SCALE / 3.6 * w)
            ys.append(raw - z_lat)
    k, r2, n = fit_origin(xs, ys)
    out["lateral"] = {"counts_per_ms2": k, "counts_per_g": k * G if k else None, "r2": r2, "n": n}

    return out


def reliable(fit):
    return fit.get("r2", 0) >= 0.8 and fit.get("n", 0) >= 50


def report(out):
    lines = ["MiatOff calibration"]
    z = out["zero"]
    lines.append(f"  standstill used: {out['standstill_s']} s"
                 + ("" if out["standstill_s"] >= 5 else "  (too short: zero points uncertain)"))
    lines.append(f"  zero points: longitudinal {z['LongitudinalAccelerometer']}, lateral {z['LateralAcceleration']}, "
                 f"yaw rate {z['YawRate']}")
    if "pedal" in out:
        lines.append(f"  throttle pedal: released {out['pedal']['released']:.0f}, floored {out['pedal']['floored']:.0f}")
    w = out["wheel_kmh_per_count"]
    if w["k"]:
        lines.append(f"  wheel speed: {w['k']:.6f} km/h per unit (R2 {w['r2']:.3f}, n {w['n']})")
    for key, label, unit in (("longitudinal", "longitudinal acceleration", "counts_per_g"),
                             ("lateral", "lateral acceleration", "counts_per_g"),
                             ("yaw", "yaw rate", "counts_per_deg_s")):
        f = out[key]
        if f.get(unit) is None:
            lines.append(f"  {label}: cannot be determined (n {f['n']})")
            continue
        unit_txt = "units per g" if unit == "counts_per_g" else "units per degree/s"
        flag = "" if reliable(f) else "  UNRELIABLE"
        lines.append(f"  {label}: {f[unit]:.2f} {unit_txt} (R2 {f['r2']:.3f}, n {f['n']}){flag}")
    if out["left_right_pairs"]:
        pairs = " and ".join(f"WheelSpeed{a}/{b}" for a, b in out["left_right_pairs"] if a)
        lines.append(f"  left/right pairs: {pairs}" + (f"; front axle: WheelSpeed{out['front_pair'][0]}/"
                                                         f"{out['front_pair'][1]}" if out.get("front_pair") else ""))
    return "\n".join(lines)


def main(argv):
    if len(argv) != 1:
        raise SystemExit(__doc__)
    print(report(analyse(argv[0])))


if __name__ == "__main__":
    main(sys.argv[1:])

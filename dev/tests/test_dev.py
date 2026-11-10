#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Synthetic-only tests; never reads firmware dumps."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from drive import raw_state


class DriveTests(unittest.TestCase):
    def test_repeatable_drive_encodes_cmu_raw_units(self):
        idle = raw_state(0)
        self.assertEqual(idle['VehicleSpeed'], 0)
        self.assertEqual(idle['EngineSpeed'], 400)  # 800 rpm
        self.assertEqual(idle['LateralAcceleration'], 4000)
        self.assertEqual(idle['LongitudinalAccelerometer'], 4000)
        self.assertEqual(idle['EngClnt_Te_Actl'], 125)  # 85 C
        self.assertEqual(raw_state(6), raw_state(34))
        self.assertGreater(raw_state(6)['VehicleSpeed'], 0)
        self.assertEqual(raw_state(6)['AccelPedalPosition'], 1000)
        self.assertLess(raw_state(18)['LongitudinalAccelerometer'], 4000)
        self.assertNotEqual(raw_state(22)['LateralAcceleration'], 4000)
        # Do not pretend an ND1 provides a usable transmission gear or steering signal.
        self.assertNotIn('TransmissionGearPosition', idle)
        self.assertNotIn('SteeringWheel', idle)


if __name__ == '__main__':
    unittest.main()

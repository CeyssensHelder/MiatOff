#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Synthetic-only tests; never reads firmware dumps."""
from pathlib import Path
import os
import socket
import subprocess
import sys
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

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


class HarnessTests(unittest.TestCase):
    def get(self, url):
        with urlopen(url) as response:
            return response.read()

    def test_occupied_port_cleans_up_without_launching_a_collector(self):
        from serve import Harness
        with socket.socket() as occupied:
            occupied.bind(('127.0.0.1', 0))
            occupied.listen()
            harness = Harness(port=occupied.getsockname()[1], docker=os.environ.get('MO_DOCKER_IMAGE', ''))
            with self.assertRaises(OSError):
                with harness:
                    self.fail('should not start')
            self.assertIsNone(harness.process)
            self.assertFalse(harness.work.exists())

    def test_invalid_scenario_time_is_rejected_before_startup(self):
        script = Path(__file__).resolve().parents[1] / 'serve.py'
        for value in ('nan', 'inf', '-1'):
            result = subprocess.run([sys.executable, str(script), '--at', value], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn('finite nonnegative', result.stderr)

    def test_real_collector_http_client_scaling_staleness_and_cleanup(self):
        from serve import Harness
        docker = os.environ.get('MO_DOCKER_IMAGE', '')
        with Harness(port=0, docker=docker, at=6) as harness:
            work = harness.work
            url = harness.url.split('/index.html')[0]
            with urlopen(url + '/live.txt') as response:
                self.assertEqual(response.headers['Cache-Control'], 'no-store')
                live = response.read().decode()
            values = dict(line.split('=', 1) for line in live.splitlines())
            self.assertEqual(values['VehicleSpeed'], '3000')
            self.assertEqual(values['AccelPedalPosition'], '1000')
            self.assertEqual(values['EngClnt_Te_Actl'], '125')
            first = values['LiveSeq']
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                with urlopen(url + '/live.txt') as response:
                    latest = response.read().decode()
                if dict(line.split('=', 1) for line in latest.splitlines())['LiveSeq'] != first:
                    break
                time.sleep(0.1)
            else:
                self.fail('collector did not keep publishing')
            self.assertIn(b'js/data.js', self.get(harness.url))
            # Real browser data module, with a controlled clock rather than a 3 s sleep.
            script = """
const fs = require('fs'), vm = require('vm'), assert = require('assert');
let now = 10000;
const box = {window: {}, Date: {now: () => now}};
vm.runInNewContext(fs.readFileSync(process.argv[1], 'utf8'), box);
const d = box.window.MeterData;
d.ingestText(process.argv[2]);
assert.equal(d.target.speed, 30);
assert.equal(d.target.throttle, 100);
assert.equal(d.target.coolant, 85);
assert(Math.abs(d.target.rpm - Number(process.argv[3]) * 2) < 0.01);
assert.equal(d.stale(), false);
now += 3100;
d.ingestText(process.argv[2]);
assert.equal(d.stale(), true, 'repeated LiveSeq must not refresh freshness');
"""
            subprocess.run(['node', '-e', script,
                            str(Path(__file__).resolve().parents[2] / 'meters/js/data.js'),
                            live, values['EngineSpeed']], check=True)
            for path in ('/', '/collector.log', '/cvd.txt', '/../README.md', '/js/../../README.md'):
                with self.assertRaises(HTTPError) as error:
                    urlopen(url + path)
                self.assertEqual(error.exception.code, 404)
                error.exception.close()
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(url + '/live.txt', headers={'Host': 'untrusted.example'}))
            self.assertEqual(error.exception.code, 403)
            error.exception.close()
            harness.pause()
            time.sleep(0.5)  # drain a possible in-flight snapshot
            frozen = self.get(url + '/live.txt')
            time.sleep(0.5)
            self.assertEqual(self.get(url + '/live.txt'), frozen)
            harness.resume()
            deadline = time.monotonic() + 5
            while self.get(url + '/live.txt') == frozen:
                self.assertLess(time.monotonic(), deadline, 'resume did not restart publishing')
                time.sleep(0.1)
        self.assertFalse(work.exists(), 'temporary fixtures must be removed')
        self.assertIsNotNone(harness.process.poll(), 'collector must be reaped')


if __name__ == '__main__':
    unittest.main()


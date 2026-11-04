#!/usr/bin/env python3
"""Print the 64-variant table for a stock SM config (sm.conf or sm_WCP.conf).

Uses the same Python edits the simulator tests cross-check against the awk in
aa-touch.sh, so the output can be pasted into SM_TABLE or SM_WCP_TABLE.

    python aa-touch-stick/tests/print_sm_table.py path/to/dump/static/files/jci/sm/sm_WCP.conf

SPDX-License-Identifier: GPL-3.0-or-later
"""
from pathlib import Path
import hashlib
import importlib.util
import os
import sys

os.environ["MO_SYNTHETIC"] = "1"  # importing the tests must not need a private dump
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("aa_tests", HERE / "test_aa_touch_stick.py")
tests = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tests)


def main(argv: list) -> None:
    if len(argv) != 1:
        raise SystemExit(__doc__)
    stock = Path(argv[0]).read_bytes()
    table = tests.sm_table(stock)
    print("\n".join(f"{code} {hashlib.sha256(data).hexdigest()}" for code, data in sorted(table.items())))


if __name__ == "__main__":
    main(sys.argv[1:])

#!/usr/bin/env python3
"""Print the last non-PASS lines of a test log as a GitHub Actions error annotation.

Annotations can be read through the public API without signing in, which the full logs cannot.

    python3 tools/ci_annotation.py aa-touch.log "AA-touch suite failed"

SPDX-License-Identifier: GPL-3.0-or-later
"""
import sys


def encode(text: str) -> str:
    return text.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def main(path: str, title: str) -> None:
    with open(path, encoding="utf-8", errors="replace") as handle:
        lines = [l.rstrip() for l in handle if not l.startswith(("PASS", "Stick "))]
    print(f"::error title={title}::{encode(chr(10).join(lines[-40:]))}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

"""Prints SYS_TABLE for aa-touch.sh from a stock systemApp.js (the 64 known files).

    python aa-touch-stick/tests/print_sys_table.py path/to/dump/static/files/jci/gui/apps/system/js/systemApp.js

Each line is "<warning 0|1><menu code> <sha256>" (66 files: menu code 0 = off, w = on and nothing hidden, else the trim char), made with the independent
Python versions of the two edits (disclaimer_edit.py, menu_edit.py).
"""
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import disclaimer_edit  # noqa: E402
import menu_edit  # noqa: E402

stock = Path(sys.argv[1]).read_bytes()
rows = []
for disc in (0, 1):
    base = disclaimer_edit.patch(stock) if disc else stock
    for code in menu_edit.MENU_CODES:
        rows.append(f"{disc}{code} {hashlib.sha256(menu_edit.patch(base, code)).hexdigest()}")
print("\n".join(rows))

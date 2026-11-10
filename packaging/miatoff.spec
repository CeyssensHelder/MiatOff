# -*- mode: python -*-
# PyInstaller recipe for the MiatOff desktop app. Build on each operating system:
#     pyinstaller --noconfirm --clean packaging/miatoff.spec
#
# Only the files listed by kits.bundle_sources() go in the package, at the same relative paths as in the repository.
# There are no folder patterns here on purpose: dumps and other local files cannot end up in a release.
#
# SPDX-License-Identifier: GPL-3.0-or-later
import os
from pathlib import Path
import re
import sys

ROOT = Path(SPECPATH).parent
sys.path.insert(0, str(ROOT / "tools"))
import kits  # noqa: E402

VERSION = os.environ.get("MIATOFF_VERSION", "dev")
version_file = Path(workpath) / "VERSION"
version_file.parent.mkdir(parents=True, exist_ok=True)
version_file.write_text(VERSION + "\n", encoding="utf-8")

datas = [(str(ROOT / rel), str(Path(rel).parent)) for rel in kits.bundle_sources()]
datas.append((str(version_file), "."))
datas.append((str(ROOT / "packaging" / "THIRD-PARTY-NOTICES.txt"), "."))
for candidate in (Path(sys.base_prefix) / "LICENSE.txt",
                  Path(sys.base_prefix) / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "LICENSE.txt"):
    if candidate.is_file():
        datas.append((str(candidate), "python-license"))
        break

analysis = Analysis([str(ROOT / "miatoff_gui.py")], pathex=[str(ROOT / "tools")], datas=datas)
pyz = PYZ(analysis.pure)

if sys.platform == "win32":
    # One file that starts from the Downloads folder: nothing to unpack first.
    exe = EXE(pyz, analysis.scripts, analysis.binaries, analysis.datas, name="MiatOff", console=False, upx=False,
              icon=str(ROOT / "packaging" / "miatoff.ico"))
else:
    exe = EXE(pyz, analysis.scripts, exclude_binaries=True, name="MiatOff", console=False, upx=False)
    folder = COLLECT(exe, analysis.binaries, analysis.datas, name="MiatOff", upx=False)
    if sys.platform == "darwin":
        number = re.match(r"v?(\d+(?:\.\d+)*)", VERSION)
        app = BUNDLE(folder, name="MiatOff.app", icon=str(ROOT / "packaging" / "miatoff.icns"), bundle_identifier="io.github.ceyssenshelder.miatoff",
                     version=number.group(1) if number else "0.0.0",
                     info_plist={"NSHighResolutionCapable": True,
                                 "NSRemovableVolumesUsageDescription": "MiatOff prepares the USB stick you use in your car."})

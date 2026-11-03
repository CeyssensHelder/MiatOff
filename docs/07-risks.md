# 07 — Risks

## Technical
- **Wireless CarPlay breaks:** MZD-AIO overwrites v74 system files (system app, settings app, firewall script)
  with 2020 versions → wireless CarPlay can stop (symptom: the CarPlay WiFi option cannot be switched on). Recovery only
  worked by reinstalling the firmware, not through AIO's uninstaller.
  → **Mitigation:** keep it surgical (TouchTune style: minimal, targeted edits + hash verification + rollback).
  → **Open question:** does this EU ND1 have factory wireless CarPlay? That determines the risk profile.
- **Bricking / boot loop:** services are under watchdog; a broken service/`sm.conf` error can cause an unrecoverable
  boot loop. A display-toggle option can make the screen permanently black.
  → **Mitigation:** boot-loop guard (flag file, see [docs/06](06-ecosystem-and-repos.md)), know the failsafe boot, and
  have a reflash image ready before you start.
- **Not reversible:** the newest Mazda Connect software cannot be downgraded → stay on 74.00.324,
  do **not** upgrade to 74.00.331.
- **Wrong-region firmware** can break functions → always use the EU build.
- **"Car off/on" ≠ reboot** (cache) → test with a full power-down.

## Legal / licence
- **GPL-3.0:** TouchTune and the AIO lineage are copyleft. If MiatOff builds on them, it **must** also fall under
  GPL-3.0(-or-later) (ship the source with distribution). For purely personal use distribution doesn't matter,
  but publishing/selling does.
- **DMCA precedent:** MZD-AIO-TI received a **DMCA takedown** in 2017 (claim by NNG, the navigation supplier); the
  GitHub repo is now blocked (HTTP 451). Distributing a clone could hit the same corner, especially if it contains
  navigation/map components.
- **Warranty:** Mazda explicitly does **not** cover problems caused by "unauthorized customization". A firmware update or
  dealer reflash wipes the tweaks.

## Safety / lawful use
- **Touch while driving** bypasses a deliberately built-in distraction limit. Use responsibly; check local
  (traffic) law. TouchTune explicitly places responsibility on the driver.

## Data reliability (for the reviewer)
- Many sources are forums and **commercial vendors' sites** → some claims are vendor marketing.
- Performance figures (48→32 s etc.) are vendor measurements on specific units (including a 2019 CX-5), **not** on an ND1.
- Security facts (CVEs, boot architecture) come from ZDI/Trend Micro and are more reliable.

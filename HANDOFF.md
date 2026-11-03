# HANDOFF — for the reviewer / stronger model

This project investigates how to build — for your **own** car — open-source tweaks
for the Mazda Connect (CMU). Goals: **touch while driving** + **faster startup**. This is a legitimate
modification of your own hardware (2017 MX-5 ND1, FW 74.00.324).

## What you need to know before you start
- All findings come from **web research** (enthusiast forums, commercial vendors' websites,
  ZDI/Trend Micro security research, public GitHub repos). **No firmware of our own has been analysed yet.**
- As a result, much is certain at the **mechanism level**, but not yet at the **byte/line level** for our specific
  **EU build**.
- Markers in the docs: **(verified)** = read directly from public source code/repo; **(vendor claim)** = from
  a commercial vendor; **(forum report)** = unconfirmed community report.

## The core in 5 points
1. **Touch** is in effect solved: TouchTune (GPL-3.0) comments out a single line in `Common.js` (the
   `"Global.AtSpeed"` handler) and sets two NVRAM settings (`bus_bcm_speed_restriction`, `lvds_speed_restriction`)
   to `disable`, with backup + SHA-256 verification + rollback. (verified — see [docs/03](docs/03-touch-feature.md))
2. **Boot** runs through the JCI Service Manager based on `/jci/sm/sm.conf` + stage scripts; the biggest gain is in
   **core scheduling** + removing hard-coded `sleep`s + the AHA gate + trimming services for hardware that isn't
   present. (see [docs/04](docs/04-boot-speedup.md))
3. **UI tweaks**: the disclaimer timer in the HMI JS (3.5 → 0.5 s) and the page delay (1.5 → 0.3 s). (see [docs/05](docs/05-ui-tweaks.md))
4. **Risk #1**: broad system-file overwrites (as MZD-AIO does) can break wireless CarPlay → **keep it
   surgical**, TouchTune style. (see [docs/07](docs/07-risks.md))
5. The exact `sm.conf` lines and the disclaimer/page-delay locations differ **per region/build** and still have to be
   determined for our **EU 74.00.324** against the actual files.

## What we want your review on
See [docs/09-open-questions.md](docs/09-open-questions.md) for the full list. In short:
1. **Architecture review** of the proposed installer design in [docs/08](docs/08-approach-roadmap.md): is the
   TouchTune approach (stage → verify → publish → rollback) the right basis, and where are the weak spots?
2. **Boot strategy**: which of the levers named (core affinity, `sleep` removal, service trimming) give the best
   gain/risk ratio, and which must absolutely not be touched without a recovery path?
3. **Modifying safely**: how do we guarantee a reliable recovery path (failsafe boot / reflash) before we change anything,
   so that a failed change never leads to an unrecoverable unit?
4. **Licence**: is our GPL-3.0 analysis correct, and what does it mean if we take TouchTune code as a base?
5. **Scope check**: are there better/newer open-source projects than those named here (see [docs/06](docs/06-ecosystem-and-repos.md))?

## Main uncertainties / assumptions to challenge
- "Core scheduling is the biggest lever" comes from a commercial vendor — not independently verified.
- The claim that CarPlay/Android Auto/Bluetooth/Bose/steering-wheel buttons do *not* depend on the services to be trimmed is a
  vendor claim.
- Whether this specific EU ND1 has factory **wireless** CarPlay (which determines the whole risk profile) is not yet confirmed.
- All timing figures are vendor measurements on other units (including a 2019 CX-5), not on an ND1.

# 09 — Open questions / next research steps

## Strictly needed before we code
- [ ] **Wireless CarPlay?** Does this specific EU ND1 (2017, 1.5L) have factory **wireless** CarPlay? It determines the whole
  risk profile (see [docs/07](07-risks.md)).
- [ ] **Establish the recovery path:** which failsafe boot + reflash image are available for the **EU 74.00.324**, so that
  a failed change is always reversible? (silverchris docs as a starting point — [sources](sources.md))
- [ ] **Confirm the entry method** that works on v74 (USB autorun vs. terminal + keyboard), reproducibly.

## Boot (to be determined against the real EU files)
- [ ] Exact service names/lines in **`/jci/sm/sm.conf`** of the EU build that belong to DVD/TV/DAB/Aha/Stitcher/
  dealer diagnostics.
- [ ] Exact script paths + lines of the **3× `sleep 2`** (AP script) and the **5 WiFi modules**.
- [ ] How to safely decouple **BDS**'s `stage_3` dependency and the **AHA gate**.
- [ ] How exactly the commercial tool sets **core affinity** (taskset/affinity in which stage script?) — biggest gain.
- [ ] Verify the vendor claim that CarPlay/AA/BT/Bose/SWC do not depend on the trimmed services.

## UI tweaks (byte level)
- [ ] Exact HMI JS file + line for the **disclaimer timer** (presumably `systemApp.js`).
- [ ] Exact location of the **page delay** value (1.5→0.3 s).

## Project / legal
- [ ] Confirm the GPL-3.0 consequences if we take TouchTune code as a base (see [docs/07](07-risks.md)).
- [ ] Are there **newer/better** open-source projects than the list in [docs/06](06-ecosystem-and-repos.md)?

## Already done
- [x] Which touch tools exist and what they change → [docs/03](03-touch-feature.md)
- [x] TouchTune repo + licence + exact touch mechanism → [docs/03](03-touch-feature.md)
- [x] CMU architecture + boot chain + tweak mechanism → [docs/02](02-cmu-internals.md)
- [x] Boot ordering, levers, candidate services (mechanism level) → [docs/04](04-boot-speedup.md)
- [x] Disclaimer and page-delay tweaks (values + where they live) → [docs/05](05-ui-tweaks.md)
- [x] Open-source ecosystem mapped → [docs/06](06-ecosystem-and-repos.md)

# 04 — Faster boot: ordering, services, delays

> All timings/claims here are vendor measurements (a commercial tweak vendor) or forum reports, unless stated otherwise.
> Not independently verified and not measured on an ND1.

## Where to look
- Boot = the **JCI Service Manager** starting services in stages, defined in **`/jci/sm/sm.conf`** + stage scripts
  (`/jci/scripts/stage_*.sh`). See [docs/02](02-cmu-internals.md).

## Critical path to CarPlay (stock)
```
Audio → settings → jciMMUI (HMI, gated on stage_3) → BDS/Bluetooth (jciBCA)
     → AHA Radio → 5× WiFi kernel modules → WiFi AP → phone association → CarPlay session
```
Phase ranges (vendor): hardware init 0–3 s · audio/settings 3–10 s · screen 10–18 s · Bluetooth 18–25 s ·
WiFi/CarPlay 25–35+ s.

## Levers, from largest to smallest

### 1. Core scheduling (largest lever according to the vendor)
The vendor's product moves **WiFi and CarPlay bring-up onto the second, less busy CPU core**. The lion's share of the
~16–20 s CarPlay gain is attributed to this. → to find out: how exactly (`taskset`/affinity in a stage script?).

### 2. Remove hard-coded waits (low-hanging fruit)
- The AP start script has **3× `sleep 2`** → ~4–6 s.
- **5 WiFi kernel modules load serially** → ~2–5 s.
- **BDS waits on `stage_3`** for no hardware reason → decouple the dependency.
- **AHA Radio** (legacy streaming) initialises on every boot and **gates WiFi** → remove/decouple before CarPlay.

### 3. Trim services for absent hardware/features
Candidates (together they cause CPU contention in the first ~30 s; none dominates alone):
- DVD player
- TV tuner
- DAB radio
- Aha Radio
- Pandora / Stitcher (legacy streaming)
- Dealer diagnostics / telematics

Keep: **SiriusXM** only if you use it (NA only; not relevant for an EU MX-5).
**Vendor claim (to verify):** CarPlay, Android Auto, Bluetooth, Bose and steering-wheel buttons do **not** depend on these
services.

### 4. UI waits (strictly not boot, but "perceived" speed)
Disclaimer removed + shorter page delay → see [docs/05](05-ui-tweaks.md).

## Cannot be sped up
- The **phone handoff** (Bluetooth discovery → credentials → CarPlay session, ~5–8 s) is determined by **Apple's protocol**,
  not by the head unit.

## Safety with boot edits
- Services are under **watchdog** → a broken service can cause a **boot loop** that cannot be fixed over ssh.
- Switching the car off and on again is **not** a real reboot (the CMU keeps its cache) → test with a **full power-down**.
- Always have a backup + failsafe/reflash path ready first (see [docs/02](02-cmu-internals.md) + [docs/07](07-risks.md)).

## Verified vs. still to determine
| What we know (mechanism) | Still to determine on EU 74.00.324 |
|---|---|
| Boot via `sm.conf` + stage scripts | Exact service names/lines in the EU build |
| 3× `sleep 2` in the AP script, 5 serial WiFi modules | Exact script paths + safe edit per line |
| AHA gates WiFi, BDS waits on stage_3 | How to decouple without side effects |
| Core scheduling = largest lever (vendor) | Exact pinning method |

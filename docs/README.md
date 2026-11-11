# MiatOff documentation

Research and design notes on how the Mazda Connect (CMU) head unit works and how MiatOff changes it. If you only want to use
MiatOff, the [main README](../README.md) is enough. These notes are for people who want to understand or extend it.

Everything here concerns a 2017 EU MX-5 ND1 on firmware 74.00.324(A). Claims are marked where they come from: verified in
public source code, from a commercial vendor, or an unconfirmed forum report.

| # | File | Contents |
|---|---|---|
| 01 | [01-context.md](01-context.md) | Goal, car, firmware, core conclusions |
| 02 | [02-cmu-internals.md](02-cmu-internals.md) | Hardware, boot chain, tweak mechanism (USB/serial/terminal) |
| 03 | [03-touch-feature.md](03-touch-feature.md) | Touch while driving: verified TouchTune deep-dive |
| 04 | [04-boot-speedup.md](04-boot-speedup.md) | Boot ordering, services, delays, core scheduling |
| 05 | [05-ui-tweaks.md](05-ui-tweaks.md) | Startup warning and page-delay tweaks |
| 06 | [06-ecosystem-and-repos.md](06-ecosystem-and-repos.md) | Related open-source projects |
| 07 | [07-risks.md](07-risks.md) | Brick, CarPlay, warranty, legal and safety risks |
| 08 | [08-approach-roadmap.md](08-approach-roadmap.md) | Proposed architecture and phased plan |
| 09 | [09-open-questions.md](09-open-questions.md) | Open questions and next research steps |
| 10 | [10-implementation-plan.md](10-implementation-plan.md) | Implementation plan for this car, phased with a recovery ladder |
| 11 | [11-dump-analysis.md](11-dump-analysis.md) | Analysis of the first dump: go/no-go, exact AA-touch changes, boot profile |
| 12 | [12-handoff-aa-touch.md](12-handoff-aa-touch.md) | Brief for building AA touch: goal, facts, requirements, acceptance |
| 13 | [13-gauges.md](13-gauges.md) | Gauges: data sources, what is on the unit, approach |
| 14 | [14-bluetooth-startup.md](14-bluetooth-startup.md) | Bluetooth startup, FM fallback, feasibility evidence and next checks |
| 15 | [15-meters-designer.md](15-meters-designer.md) | Standalone Meters Designer: editing, v3 migration, recovery and browser acceptance |
| 16 | [16-mazda-menu-customisation.md](16-mazda-menu-customisation.md) | Home-menu feasibility and native integration research |
| 17 | [17-unified-designer.md](17-unified-designer.md) | Shared Meters/Home studio, documents and verification |
| 18 | [18-vehicle-presets.md](18-vehicle-presets.md) | MX-5 ND1/ND2 specifications and sources behind the designer's car setup |
| — | [sources.md](sources.md) | All sources |

## For AI assistants

[`ai/`](ai/) holds briefing material written for AI coding assistants and reviewers (start with
[`../AGENTS.md`](../AGENTS.md)).

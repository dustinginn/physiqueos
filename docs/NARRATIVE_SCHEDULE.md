# Narrative Schedule

This document is the authoritative cadence and Home precedence definition for PhysiqueOS Narrative artifacts.

| Narrative | Generation cadence | Evidence window / trigger |
| --- | --- | --- |
| Midweek | Every Wednesday | Production briefing reviews Sunday through Tuesday; Wednesday evidence is excluded. |
| Photo Event | Immediately after an event | Generated after a canonical Photo Session is confirmed and interpreted. |
| DEXA Event | Immediately after an event | Generated after a canonical DEXA scan is confirmed and interpreted. |
| Weekly | Every Sunday | Reviews the completed week. |
| Monthly | The first day of every month | Reviews the previous completed calendar month. |

## Home precedence

Home presents the highest-priority available Narrative in this order:

1. Active Anchor Event
2. Monthly
3. Midweek or Weekly, whichever scheduled artifact is current

Monday, Tuesday, Thursday, Friday, and Saturday are valid no-routine-briefing days. Home keeps the latest production Midweek or Weekly artifact current; it does not generate a filler artifact or treat absence as an error.

Routine Daily generation is retired under `routine_briefing_cadence_v2`. Historical Daily artifacts, IDs, lifecycle records, repository reads, and Briefing History rendering remain unchanged. There is no external scheduler or notification queue in the current runtime; legacy Daily work presented to the cadence migration is marked retired idempotently while unrelated work is preserved. Routine Daily notification routing is therefore suppressed by eliminating Daily eligibility and generation rather than mutating historical notification state.

Future cadence or precedence changes must update this file first so scheduling behavior and product documentation remain aligned.

## Wednesday production-routing boundary

Wednesday routes to the production Midweek cadence and never falls back to Daily. `midweek_briefing_v1` reuses the approved shared Midweek core, is claimed deterministically from owner plus the Sunday–Tuesday evidence window, persists through the canonical briefing repository, and completes only after a successful write. It appears in Briefing History and remains current until Sunday Weekly or an established higher-precedence Event supersedes it. `/briefings/midweek/preview` remains a read-only development adapter. Midweek notifications remain disabled because this repository has no production notification queue or mandatory notification contract.

Midweek expenditure uses the latest authoritative DEXA resting metabolic rate plus each calendar day's Apple Watch active calories exactly once. Balance is intake minus expenditure; missing calendar days remain missing and no uncertainty or activity multiplier is applied.

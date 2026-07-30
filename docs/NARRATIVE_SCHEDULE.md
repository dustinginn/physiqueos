# Narrative Schedule

This document is the authoritative cadence and Home precedence definition for PhysiqueOS Narrative artifacts.

| Narrative | Generation cadence | Evidence window / trigger |
| --- | --- | --- |
| Midweek | Every Wednesday | Production briefing reviews Sunday through Tuesday; Wednesday evidence is excluded. |
| Photo Event | Immediately after an event | Generated after a canonical Photo Session is confirmed and interpreted. |
| DEXA Event | Immediately after an event | Generated after a canonical DEXA scan is confirmed and interpreted. |
| Weekly | Every Sunday | Reviews the completed week. |
| Monthly | The first day of every month | Reviews the previous completed calendar month. |

## Canonical briefing family

Daily, Midweek, and Weekly are one briefing family. Midweek asks what is happening so far and what should change before the week ends; Weekly is the same product after the evidence window closes, asking what the completed week established and what should carry forward. Midweek and Weekly therefore share their presentation primitives, section hierarchy, coaching voice, terminology, interactions, navigation, and layout rhythm wherever practical. A future Midweek presentation improvement should flow into Weekly unless the completed window genuinely requires additional context.

The canonical cadence hierarchy is Hero, Snapshot, What Changed, Training, Interpretation, and Coach's Insight. A cadence may keep a section compact when its partial evidence window does not justify additional detail, but it should not invent an alternative presentation language.

Monthly is intentionally separate. It remains a long-form, reflective, magazine-like, chapter-based, visual, and story-driven editorial experience; it is not constrained by the Midweek/Weekly component contract.

## Home precedence

Home presents the highest-priority available Narrative in this order:

1. Active Anchor Event
2. Monthly
3. Midweek or Weekly, whichever scheduled artifact is current

Monday, Tuesday, Thursday, Friday, and Saturday are valid no-routine-briefing days. Home keeps the latest production Midweek or Weekly artifact current; it does not generate a filler artifact or treat absence as an error.

Routine Daily generation is retired under `routine_briefing_cadence_v2`. Historical Daily artifacts, IDs, lifecycle records, repository reads, and Briefing History rendering remain unchanged. The production cadence executor supports Midweek, Weekly, and Monthly; there is no production notification queue. Legacy Daily work presented to the cadence migration is marked retired idempotently while unrelated work is preserved. Routine Daily notification routing is therefore suppressed by eliminating Daily eligibility and generation rather than mutating historical notification state.

Future cadence or precedence changes must update this file first so scheduling behavior and product documentation remain aligned.

## Wednesday production-routing boundary

Wednesday routes to the production Midweek cadence and never falls back to Daily. `midweek_briefing_v1` reuses the approved shared Midweek core, is claimed deterministically from owner plus the Sunday–Tuesday evidence window, persists through the canonical briefing repository, and completes only after a successful write. It appears in Briefing History and remains current until Sunday Weekly or an established higher-precedence Event supersedes it. `/briefings/midweek/preview` remains a read-only development adapter. Midweek notifications remain disabled because this repository has no production notification queue or mandatory notification contract.

Midweek expenditure uses the latest authoritative DEXA resting metabolic rate plus each calendar day's Apple Watch active calories exactly once. Balance is intake minus expenditure; missing calendar days remain missing and no uncertainty or activity multiplier is applied.

## Production cadence execution

`briefing_cadence_registry_v1` is the canonical executable registry for routine production briefings. It registers Midweek, Weekly, and Monthly. It resolves the Founder timezone and current Coaching Updates schedule, then supplies each cadence's local eligibility rule, local eligible time, evidence-window builder, canonical generator, expected artifact identity, full-local-day catch-up horizon, notification state, and artifact-idempotency contract.

The existing `PhysiqueOS Runtime Monitor` invokes the short-lived production cadence runner after the application has passed its health and ownership checks. The monitor retains its one-minute frequency and 30-second task limit. Cadence failure is logged separately and never changes runtime health, restarts the production server, or prevents the existing ngrok monitor from running.

Eligibility and windows remain:

* Midweek: Wednesday at the configured local time (legacy default `00:00`), using the closed Sunday-through-Tuesday window and excluding all Wednesday evidence.
* Weekly: Sunday at the configured local time (legacy default `00:00`), using the completed Sunday-through-Saturday week and excluding Sunday evidence.
* Monthly: the first calendar day of each month at `00:00` local time, using the complete previous local calendar month. The Founder timezone is authoritative and `America/Los_Angeles` is the fallback. Monthly may catch up only through the end of that same local delivery day.

An eligible missing artifact may be caught up until the end of that same local cadence day. The executor does not generate the occurrence on the following day. It checks for a completed artifact before generation, then delegates ownership and persistence to the existing canonical generator and atomic Founder publication path. Completed artifacts are immutable: later same-day evidence is available to a future applicable cadence and never regenerates the completed occurrence.

One filesystem execution lock prevents overlapping cadence runners, with recovery after five minutes for a stale lock. Canonical artifact identity and Founder revision checks remain the durable concurrency boundary. A generator has a 15-second operational timeout; a timed-out runner retains its lock for stale recovery rather than allowing the next one-minute invocation to overlap. Transient failures receive at most three immediate attempts, followed by a 15-minute retry cooldown. Terminal semantic or configuration failures are recorded without an uncontrolled retry loop. An eligible artifact still missing after 15 minutes emits an operational warning.

Executor records are stored separately from Founder evidence under the ignored `logs/briefing-cadence-runs` operational directory, capped at 500 records, with a one-MiB rotating concise log. Records contain cadence/window/artifact identity, eligibility, timing, outcome, retry classification, runtime source, and bounded error summaries; they contain no evidence payloads. The production runner is `node scripts/runBriefingCadence.mjs`. `node scripts/statusBriefingCadence.mjs` is the read-only diagnostic for current expectations, latest runs, latest successful artifacts, next eligibility, and unresolved failures. Both entrypoints use Node's production-available module loader and do not require development dependencies.

Home and Briefing History remain read-only consumers of completed persisted artifacts. They never invoke the runner, generate, backfill, claim, or mutate briefing state. An active same-day Event remains first on Home, Monthly is promoted on its delivery date, and the current Midweek or Weekly remains available through Briefing History. Monthly uses `/briefings/monthly/[artifactId]`; preview routes never serve production artifacts.

Monthly production consumes only repository-owned evidence available by the local month-end cutoff. Preview fixtures, continuation records, cutoff overrides, inspector metadata, and developer disclosure are excluded from the persisted artifact. Optional missing evidence remains missing and does not block the whole briefing. The latest valid canonical Goal-confidence assessment at or before the cutoff is transported into the immutable Monthly Hero; presentation never calculates it.

Completed Monthly artifacts are immutable. Evidence received after completion does not rewrite the occurrence. A correction requires a separate controlled regeneration with an exact target, reason, and audit trail. Operational execution records contain Monthly timing, window, artifact identity, outcome, and bounded diagnostics without evidence payloads. Monthly generation failures remain isolated from application and tunnel health.

Monthly preserves the existing canonical notification preference. This activation does not create push delivery, a notification queue, or a separate scheduled task. DEXA and Photo Event generation remain event-triggered and are not registered scheduled cadences.

## First live Monthly acceptance

On the first eligible August 1 execution:

1. Run the existing Runtime Monitor and confirm one July artifact with the expected Monthly window and artifact identity.
2. Confirm its cutoff is July 31 at `23:59:59.999` Founder-local time and its provenance contains only canonical evidence references.
3. Confirm the canonical cutoff-valid confidence assessment appears in the Hero.
4. Confirm Home promotes Monthly beneath any active same-day Event, Briefing History lists it, and the production artifact route renders it without preview disclosure.
5. Run the cadence executor a second time and require `monthly:already_completed`.
6. Confirm no preview, fixture, continuation, or synthetic metadata exists in the artifact.
7. Confirm Founder revision advances only for the canonical Monthly artifact commit and any explicitly required confidence-history ownership.

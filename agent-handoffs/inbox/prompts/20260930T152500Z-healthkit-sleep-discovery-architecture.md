HealthKit Sleep discovery and canonical architecture

Standing rule: before stopping for any reason, follow agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md.

Context:
Build 71 is distributed and provisionally accepted. Strength background-notification acceptance awaits a natural event but does not block research. Codex separately owns persistent-pairing canary and Photo Intelligence. HealthKit Sleep is next.

THIS TASK IS RESEARCH / ARCHITECTURE / READ-ONLY ONLY.
Do not activate Sleep ingestion, mutate Founder production data, deploy Server, upload TestFlight, backfill history, touch persistent pairing, or touch Photo Intelligence.

Accepted principles:
- Keep HealthKit source observation -> canonical PhysiqueOS Sleep/Recovery record -> evidence eligibility -> strategic interpretation as separate layers.
- Ingestion/provenance must not itself decide strategic meaning.
- Eventual Apple Health Sleep sync is automatic/background with no routine Evidence Review confirmation.
- No historical backfill by default. Production ingestion requires a Founder-approved prospective start boundary.
- A later bounded historical read/import may be authorized only for UI/design validation; it must never retroactively change historical Briefings, Goal confidence, Strategy confidence, Narrative, recommendations, or strategic artifacts.
- Sleep does not become V3 Confidence/Narrative eligible merely because ingestion exists. Strategic graduation is separate.

1. Audit current HealthKit architecture after Build 71:
authorization/read types; process-launch observer/background delivery; anchored queries; owner identity; canonical HealthKit envelope; Activity/Nutrition/Cardio/Strength handling; Server ingest; day attribution; evidence eligibility; Home/Log/Evidence; V3 domains; notifications; provenance/source/device identity; dedupe/idempotency/revision recovery.
Identify reusable components and unsafe domain-specific assumptions.

2. Research current Apple Health/HealthKit Sleep semantics from authoritative Apple documentation as needed:
HKCategoryTypeIdentifierSleepAnalysis; inBed; asleepUnspecified; awake; asleepCore; asleepDeep; asleepREM; OS compatibility; sourceRevision; device; metadata; timestamps/time zones; deleted/revised samples.
Cover Apple Watch Sleep, iPhone/other Apple sources, third-party writers, manual entries, overlaps, naps, interrupted/split sleep, cross-midnight intervals, DST/travel, awake intervals, inBed vs asleep, nested stage samples, edits/deletions.
Do not assume Apple Watch is the only source.

3. Founder data-shape audit, read-only:
Determine what Sleep observations are actually available in Founder Apple Health without creating canonical production records.
Use an existing safe local/read-only path if one exists.
If direct HealthKit inspection requires a diagnostic Native build or Founder action, DO NOT create/upload it in this task. Specify the minimal diagnostic/action and stop for authorization.
Do not put raw private sleep records in GH. Report sanitized shape only: source types, stage availability, overlap pattern, approximate samples/night, naps/inBed presence, multi-source overlap, timezone/date-attribution characteristics.

4. Design canonical model with separate layers:

A. Source observation:
HealthKit sample identity; source/sourceRevision; device when useful; stage/category; start/end; timezone/context; allow-listed metadata; provenance; ingest/revision/deletion state.

B. Canonical sleep episode/night:
night/date key; episode start/end; total sleep; time in bed only when reliable; awake; core/deep/REM/unspecified durations; efficiency only if defensible; awakenings only if defensible; coverage/completeness; preferred source; nap vs main sleep; reconciliation; confidence/completeness; provenance to contributing samples.
Do not invent a proprietary sleep score.

C. Future recovery-evidence projection:
Design how canonical Sleep could later expose total sleep, consistency, stage coverage, major disruption, multi-night trend, etc. Do not make it eligible yet and do not invent coaching thresholds.

5. Design deterministic source reconciliation:
Never double count overlapping intervals. Preserve all source observations. Do not blindly prefer newest writer. Distinguish manual entries. Preserve useful stage detail under broader asleep intervals. inBed is not asleep. awake is not asleep. Deletions/revisions must reconcile idempotently.
Evaluate trusted-source policy vs stage/completeness precedence vs user preference or a combination. Recommend the simplest robust Founder-stage policy with extensibility.

6. Define night/date attribution:
Avoid naive UTC/start-date grouping. Handle overnight sleep, morning wake, naps, split sleep, late schedules, DST and timezone travel. Recommend a canonical sleep-night semantic that aligns with Briefing/daily evidence windows.

7. Design prospective background sync using Build 71 lessons:
process-launch observer registration where appropriate; HealthKit background delivery; anchored queries; durable anchor; deletion/revision recovery; idempotent Server ingest; background execution assertion; no Log dependency; no routine confirmation; locked-device behavior; no notification spam.
Research/justify the appropriate background-delivery frequency for Sleep rather than assuming workouts' immediate frequency applies.

8. Propose minimal V1 product surfaces:
Evidence Hub Sleep stream; nightly history; night detail; useful provenance.
Home only if a compact recent-sleep summary genuinely helps.
No routine Log confirmation flow.
Manual Sleep evidence can be noted as future scope if useful.
Briefing/V3 integration is a later graduation.
Do not design a giant sleep-tracker product; Sleep is evidence for physique/recovery coaching.

9. Privacy/data minimization:
minimum HealthKit authorization; minimum fields; metadata allow-list; logging exclusions; retention/provenance; source/device normalization or hashing if needed. No raw Founder sleep data in GH.

10. Produce phased implementation plan:
A: Server/contracts/schema + synthetic deterministic canonicalization tests.
B: Native HealthKit read/observer/anchored-query behind dormant gate; no production ingestion.
C: private Founder prospective canary after explicit start-date decision.
D: Evidence UI graduation.
E: separate strategic eligibility / V3 Confidence/Narrative graduation.

Identify Server vs Native ownership and migration needs.

Deterministic test matrix must cover:
simple overnight; staged Apple Watch night; asleepUnspecified fallback; inBed+asleep overlap; awake; third-party overlap; manual entry; nap; split sleep; DST; timezone travel; deletion; revision; duplicate delivery; out-of-order delivery; locked device/background wake; anchor reset/recovery.

Founder decisions:
Surface only decisions actually needed before implementation, likely prospective start date, whether a bounded historical read is desired solely for UI/design validation, source preference if real data shows multiple meaningful sources, and nap presentation. Resolve technical choices yourself where possible.

Output:
Publish agent-handoffs/reports/<timestamp>-healthkit-sleep-discovery-architecture.md with architecture map, Apple semantics/sources, sanitized Founder shape if obtainable, canonical contracts, reconciliation, night attribution, sync design, UI, privacy, migration implications, phased plan, test matrix, decisions, risks/open questions, and recommended next prompt.

Do not implement production code unless a tiny isolated non-production research harness is necessary. Publish GH report/checkpoint before stopping.

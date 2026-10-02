HealthKit Sleep Phase A Server foundation

Read first: agent-handoffs/reports/20260930T153000Z-healthkit-sleep-discovery-architecture.md
Standing reporting rule: agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

FOUNDER DECISIONS

Source preference:
Founder explicitly selects Oura as preferred authoritative Sleep source whenever Oura has usable coverage for an episode/night. Health currently shows Oura as the active highest-priority Sleep writer; Sleep Cycle is listed but inactive; PhysiqueOS has Full Access.

Architecture rule:
Preserve every HealthKit Sleep source observation. Source preference affects canonical primary selection only.
Oura wins when usable under Founder policy.
Other sensor sources are fallback/corroboration when Oura does not cover an episode.
Historical Sleep Cycle samples remain valid fallback/provenance.
Manual Sleep is fallback only when no usable sensor sleep exists.
Implement preference through a generic canonical source-preference policy/config, NOT a universal hard-coded Oura rule.

Product sequencing:
Do NOT design strategic weighting or Briefing integration yet.
Sequence is:
A canonical architecture/contracts
B dormant Native ingestion/canary
C prove canonical Founder Sleep data
D design Sleep presentation in Evidence using real canonical data
E Founder reviews Evidence design
F only then decide which Sleep facts belong in Home/Briefings and how much Sleep/Recovery affects Goal achievement, V3 Confidence and Narrative.

Therefore Phase A must NOT add Sleep to strategic evidence eligibility, V3, Briefings/readiness, Goal confidence, Strategy confidence, recommendations or Home. Do not invent thresholds or a Sleep score.

TASK

Implement dormant Server foundation only. No deploy, no policy activation, no Founder Sleep ingest, no backfill, no Native implementation except shared contracts if required.

1. Reverify current production authority. Codex PI may have changed Server production since the research report. Development only; do not deploy.

2. Add a HealthKit Sleep category-sample contract containing only necessary privacy-safe fields:
external UUID, category/stage, start/end, normalized timezone/zone source, source bundle identifier, normalized source class/family, needed source revision/version, privacy-safe product/device family if necessary, wasUserEntered, provenance, lifecycle/revision/deletion state.
Reject/omit source display name, personal device name, localIdentifier, UDI, firmware and arbitrary metadata.
Unknown future stage values become unknown and never count as asleep.

3. Add deletion/retraction plus recent-window manifest Server contracts:
deleted sample UUID/scope/provenance; idempotent replay.
A bounded live-ID manifest can mark missing previously-live Sleep samples in the manifest window as deleted(window_manifest), never touching samples outside the window or before activation floor.
No Native producer yet.

4. Add dedicated Sleep collections such as healthKitSleepSamples and healthKitSleepDays. Do not make Sleep ingest scan the entire healthKitObservations collection.
Verify backing table indexes for owner + collection + relevant date access.
If an index migration is truly required, implement candidate migration but do not apply it. Otherwise document why no migration is needed.

5. Add a fail-closed Sleep source-preference policy/config:
absent policy uses generic deterministic ranking.
Policy can select preferred source family/bundle.
Founder policy can later select Oura but DO NOT write it in production now.
Generic selection:
usable non-manual sensor over manual;
explicit preferred source over other sensors when usable;
then staged data over unspecified-only;
then coverage/completeness;
then deterministic source-family/bundle tie-break.
Preference changes canonical primary only, never preservation of secondary observations.

Synthetic tests must prove:
Oura preferred + Watch overlap -> Oura primary.
Oura unspecified + Watch staged -> Oura remains primary when its coverage is technically usable; Watch stays secondary, no hybrid totals.
Oura missing -> Watch fallback.
Oura technically unusable/insufficient -> deterministic fallback; define validity conservatively.
Oura + historical Sleep Cycle overlap -> Oura.
Sleep Cycle only -> usable fallback.
manual + Oura -> Oura.
manual only -> manual_only.
no preference -> generic deterministic ranking.

6. Implement pure deterministic sleep-canon-v1 or equivalent.

Sleep day:
wake-date semantic using previous-day 18:00 through current-day 18:00 in episode-local zone.
Durations use absolute instants, never wall-clock subtraction.

Episode clustering:
cluster relevant intervals separated by <=60 minutes.
Threshold is versioned technical algorithm config, not coaching policy.
Main episode = greatest canonical asleep duration.
Preserve all secondary episodes. Do not decide final UI labels Nap/Additional Sleep yet.

Stages:
inBed, asleepUnspecified, awake, asleepCore, asleepDeep, asleepREM, unknown.
inBed never asleep.
awake never asleep.
specific stage overrides overlapping unspecified sleep from same source lane.
No double counting.
V1 totals use one primary source lane per episode.
No cross-source gap filling.
Secondary sources preserved as corroborating provenance.
Only emit inBed total when defensible.
No sleep efficiency, awakening count or score.

7. Revision/idempotency:
duplicate delivery no-op.
Deletion + replacement/new UUID recomputes affected days.
Out-of-order arrival converges.
Same UUID with conflicting immutable content fails closed for that sample without wedging unrelated batch processing.
Canonical day has inputDigest and algorithm version.
Unchanged recomputation is no-op.

8. Add dormant fail-closed Sleep canonical activation policy:
prospective effective sleep day/start boundary, open-ended operation, validation_only/operational if consistent with existing policy architecture, no backfill.
ABSENT POLICY = OFF.
Do not choose/write Founder D0 yet. Current intent: first sleep night after prospective canary activation.

9. Add dormant Server manifest/capability needed for Native Phase B to know whether Sleep canonical ingestion is enabled. Default remains disabled.
Do not change Activity/Nutrition/Cardio/Strength behavior.

10. Strategic quarantine:
Structural tests must prove canonical Sleep cannot currently enter V3 Confidence, Narrative, Briefings, Goal confidence, Strategy confidence, recommendations or HealthKit strategic evidence.
Do not add Sleep to evidenceEligibility or Briefing readinessDomains.
Evidence UI may later read canonical Sleep without making it strategic.

11. Do NOT implement Evidence UI in Phase A.
Ensure read contracts can later support: nightly history, main/secondary episodes, stage durations/timeline, source/provenance, completeness, last update/revision.
Final layout will be designed only after real canonical Founder data exists.

12. Privacy:
Tests ensure personal source/device names and arbitrary metadata cannot persist or leak to logs.
Only minimum necessary fields.
Do not fix existing workout sourceName issue here; keep it as separate backlog.

13. Synthetic deterministic matrix must cover at least:
simple overnight unspecified;
staged night;
unspecified+nested stages same lane;
inBed+asleep;
awake;
Oura/Watch overlap;
manual alone/manual+sensor;
daytime secondary;
evening secondary;
split sleep;
<=60m cluster;
DST spring/fall;
timezone travel/fallback;
deletion;
revision;
duplicate delivery;
out-of-order;
same UUID conflicting content;
window manifest deletion;
activation floor;
unknown future stage;
inBed-only;
explicit Oura preference fallback;
no-preference generic ranking;
strategic quarantine;
privacy/source-name rejection.

14. Fresh architecture review must verify:
no backfill path;
no whole generic HealthKit collection scan;
deterministic source precedence;
no double counting;
Oura preference policy-driven not hard-coded;
no strategic eligibility leak;
no private metadata leak;
deletion/revision convergence;
timezone/DST correctness;
canonical model supports future Evidence design without prescribing it.

15. Validation:
new contract/canonicalizer tests;
HealthKit ingest regression;
Activity/Nutrition/Cardio/Strength regression sufficient to prove no break;
strategic quarantine;
production build;
lint/diff;
fresh review.
Risk-scaled. No deploy.

REPORT

Publish agent-handoffs/reports/<timestamp>-healthkit-sleep-phase-a-server-foundation.md with exact branch/SHA, production authority, contracts, storage/index/migration conclusion, source-preference policy, canonicalization, deletion/manifest, activation policy, quarantine, privacy, tests/results, fresh review, deployment status NOT DEPLOYED, exact Phase B Native requirements, remaining decisions and recommended next prompt.

Publish GH checkpoint before every stop.

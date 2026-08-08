# Confidence V2 Production Integration and Deployment Readiness

> **Historical integration record (deployment completed 2026-08-03).** The authoritative production description is [Confidence V2 current state](./CONFIDENCE_V2_CURRENT_STATE.md). Do not treat the readiness or pre-deployment steps below as current operating instructions.

Phase activation and extension timing must follow
`PHASE_REVIEW_PRODUCTION_ARCHITECTURE.md`: no Phase 2 Starting Forecast exists
before an authorized atomic transition, and extension must not reset the Goal's
Forecast series.

Status: implementation complete for briefing publication; deployment not performed  
Audited: 2026-08-01  
Production data effect during implementation: none

## Outcome

Confidence V2 now has one production finalizer and one atomic publication
service for Midweek, Weekly, Monthly, DEXA Event, and qualifying Photo Event
briefings. A Goal-initialization Starting Forecast adapter is implemented for
new Goal series. Home, the active-Goal preview, and Goals Hub read persisted
canonical Confidence only. Energy and Training finalization can prepare
briefing inputs but cannot publish Confidence.

The code is ready for a controlled deployment review. Deployment, runtime
restart, Founder-store migration, Goal transition, and production briefing
generation were deliberately not performed.

One cutover item remains deliberately outside this patch's automatic runtime
behavior: `GoalInitializationForecastService` is implemented and tested, but
the high-risk Goal-transition coordinator does not invoke it automatically.
Wiring the activation transaction or an explicitly accepted post-commit hook
requires a separate review of the Goal-transition atomicity contract. This does
not block the upcoming DEXA or cadence cutover, because the active Goal already
has a canonical V1 predecessor that the first V2 briefing can reference.

## Source-verified production architecture audit

The audit inspected runtime source in addition to the four V2 architecture
documents.

| Area | Before this patch | Production boundary after this patch |
| --- | --- | --- |
| Goal initialization | No production Starting Forecast publication path | `GoalInitializationForecastService` prepares and atomically publishes an initialization artifact plus first V2 assessment; not yet called by the Goal-transition coordinator |
| Midweek | `MidweekBriefingService` built a cadence-specific V1 assessment and used cadence publication | `PICadenceBriefingLifecycleService` calls `BriefingForecastFinalizer`; an existing in-progress scheduled claim is completed inside the same atomic commit |
| Weekly | `WeeklyNarrativeService` used cadence-specific V1 preparation/publication | Founder generation calls the shared cadence lifecycle; production regeneration is routed through the same finalizer with explicit replacement authorization |
| Monthly | Captured the latest assessment at cutoff and published no successor | Runs the shared finalizer and atomically publishes a V2 successor or immutable reaffirmation with the locked Monthly artifact |
| DEXA Event | DEXA-specific reasoning, preparation, and publication created V1 successors | Real canonical DEXA inputs are normalized and sent through Goal Contract -> Interpretation V2 -> Forecast V2 -> Narrative V2 -> shared finalizer |
| Photo Event | Photo-specific reasoning could publish V1, including paths that carried the prior assessment | Only a canonical, Goal-relevant visual interpretation can authorize V2 publication; neutral but meaningful interpretations can publish a reaffirmation; uploads alone cannot publish |
| Energy finalization | Could prepare and publish an independent V1 successor | Stops at `briefing_input_ready`; receipts and evidence preparation remain, Confidence publication is removed |
| Training finalization | Could prepare and publish an independent V1 successor | Stops at `briefing_input_ready`; receipts and evidence preparation remain, Confidence publication is removed |
| Home | Read a PI snapshot and silently calculated a legacy evidence-based fallback | Pure canonical read; V1 is explicitly incomplete compatibility, and missing/invalid canonical state is unavailable rather than recalculated |
| Active-Goal preview / Goals Hub | Could call the legacy overall-goal calculator | Use `ActiveGoalConfidencePresentationReadService`; no local percentage formula |
| Briefing History | Renders persisted embedded confidence blocks | Unchanged; V1 and V2 artifacts render their captured assessment and are never regenerated on read |

### Producers and persistence entry points

Authorized V2 producers are closed to these registry identities:

- `goal_initialization`
- `midweek_briefing`
- `weekly_briefing`
- `monthly_briefing`
- `dexa_event_briefing`
- `photo_event_briefing`

`ConfidencePublisherRegistry` issues an in-memory capability only after checking
publisher identity, cadence/event identity, canonical predecessor requirements,
a closed evidence window, and Photo qualification. The atomic publisher rejects
forged capabilities before reading or writing a transaction.

The V2 persistence entry point is
`CanonicalBriefingConfidencePublicationService`. It stages the briefing or Goal
initialization artifact, immutable history record, and current snapshot in one
`FounderStoreUnitOfWork`. It enforces revision and semantic-digest baselines,
expected predecessor identity, deterministic assessment identity, idempotency,
monotonic evidence cutoff, exact replacement lineage, and commit ownership.

The existing V1 services (`PIGoalConfidencePersistenceService`,
`PICadenceBriefingPublicationService`, `PIDEXAEventPublicationService`, and
`PIPhotoEventPublicationService`) remain in source for V1 audit, tests,
reconciliation, and historical compatibility. Founder production factories for
the authorized publishers no longer select them as their Confidence path.

### Consumers and legacy fallbacks

`CanonicalConfidenceReadService` is the source for current and cutoff reads.
`ConfidenceV1CompatibilityAdapter` maps persisted V1 assessments without
inventing V2 Goal Contract, Forecast, Narrative, semantic-continuity, or origin
fields. Those fields remain explicitly unknown and the result is marked
incomplete. `ActiveGoalConfidencePresentationReadService` exposes the persisted
value without calculation.

The retired evidence-presence calculator remains available only to the
architecture diagnostic service. Home, Goals Hub, active-Goal preview, cadence
publication, DEXA publication, and Photo publication do not import it.

### Atomicity, concurrency, idempotency, and replacement

- Artifact and assessment commit together or neither commits.
- A scheduled Midweek claim may be completed by the final atomic publication;
  it is not treated as an artifact replacement.
- Duplicate identity plus identical assessment returns `matched` without a
  write.
- Duplicate idempotency with different semantics fails closed.
- A stale revision, semantic digest, or predecessor fails before commit.
- A successor cannot move the canonical evidence cutoff backward.
- Replacement requires an existing occurrence plus exact
  `replacesArtifactId` and `replacesAssessmentId` lineage.
- The replaced briefing remains in flat artifact replacement history, while
  both assessments remain in immutable Confidence history.
- `no_meaningful_change` is published as an immutable reaffirmation, not
  discarded.

## Shared finalizer contract

`BriefingForecastFinalizer` accepts normalized publisher, user, Goal Contract,
Goal/phase, occurrence/artifact, cadence/event, bounded evidence window,
Strategy, Execution, Evidence descriptors, prior canonical context,
idempotency, expected predecessor/artifact, cutoff, source lineage, and a safe
artifact composer. It is independent of JSX.

Its ordered result contains Structured Interpretation, Forecast Assessment,
Narrative Assessment, numeric projection, immutable V2 assessment, composed
artifact, publication lineage, commit result, reaffirmation/no-op status, and
bounded diagnostics. Publisher authorization occurs before any engine or
artifact composer is invoked.

## Numeric projection and Starting Forecast

`NumericConfidenceProjectionService` consumes Forecast outputs and prior
canonical context, never raw evidence. It is deterministic, versioned,
integer-bounded, conservative, stable under an identical semantic fingerprint,
and limited by cadence-appropriate movement ceilings. Publisher type controls
only a ceiling; it does not assign evidence points. Goal relevance and
Objective/Guardrail state originate in the Goal Contract and Interpretation.

`StartingForecastService` uses ambition, timeline feasibility, baseline
quality, prior Goal history, historical execution, Strategy quality,
experience, and missing information. It does not universally start at 50 and
protects new users from an unsupported alarming low starting value. It never
converts a V1 percentage into a Starting Forecast.

## Immutable assessment and schema impact

The `canonical_confidence_assessment_v2` record includes the required Goal,
Goal Contract, publisher, artifact/window, prior/current percentage, band,
Forecast/Narrative, uncertainty, next evidence, engine identities, semantic
fingerprint, timestamps, source cutoff, replacement lineage, idempotency, and
reproducibility fields. Its content-derived ID is validated on publication.

Persistence impact:

- V2 history records are appended to existing `goalConfidenceHistory`.
- The existing `goalConfidenceSnapshots` collection remains the current
  pointer and supports mixed V1/V2 history.
- New append-only `confidenceInitializationArtifacts` stores Goal initialization
  artifacts.
- Missing `confidenceInitializationArtifacts` is normalized to `[]`; no
  destructive or eager data migration is required.
- V1 records and briefing artifacts are not rewritten.

Production cutover boundary: the first naturally occurring authorized V2
briefing references the current V1 assessment ID as its prior canonical context.
All later authorized publications reference V2. Historical reads continue to
use the assessment embedded with or linked from the historical artifact.

## DEXA production readiness

The Founder DEXA factory now selects the canonical atomic publication service.
The production lifecycle consumes the real canonical scan and nearest prior
scan, maps lean-mass, fat-mass, body-fat, and total-mass changes into normalized
descriptors, adapts the accepted active Goal to a versioned Goal Contract, and
runs the shared V2 engines. Synthetic preview routes remain isolated and are not
dependencies of the production lifecycle. The locked DEXA artifact and screen
composition remain owned by the existing DEXA narrative/presentation system;
the finalizer only inserts its canonical confidence block.

No real scan, production DEXA artifact, or production Confidence assessment was
created during this implementation.

## Scenario and test acceptance

The isolated 20-scenario matrix covers strong progress, Guardrail watch and
violation, execution/response uncertainty, insufficient elapsed time,
conflicting evidence, meaningful and no-change Photo Events, cadence
reaffirmation, Monthly increase/decrease, DEXA material/mixed outcomes, new and
experienced Starting Forecasts, semantic repeat, concurrent duplicate,
replacement, and unauthorized publication.

Verified results at implementation completion:

- Focused Interpretation/Forecast/Narrative/V2/lifecycle run: 239 passed.
- All Confidence/publication/history/atomic/safety files: 350 passed.
- Final affected-path run after replacement, Photo, and regeneration fixes:
  135 passed.
- Complete briefing-family selection: 374 passed; 3 failed before isolation.
  The affected Weekly regeneration failure was fixed and its 12-test file then
  passed. Remaining unrelated failures are:
  - `July25PhotoEventV34ReconciliationService.test.js`: hard-coded expected
    Founder revision 23/24, while the current dirty-worktree fixture is 56/57.
  - `MonthlyFounderEvidenceOwnership.test.js`: expects old `Pattern`/`Context`
    labels while the current Monthly presentation emits `Signal`/`Limit`.
- Full repository unit attempt: 3,312 passed, 41 failed, with 22 worker errors
  from the known approximately 4 GB Node heap ceiling. Most failures were in
  unrelated pre-existing protocol, recurrence, training identity, execution,
  Photo reconciliation, and current-date fixture changes. Confidence-adjacent
  stale expectations were isolated and corrected.
- Repository lint: pass, 0 errors; two pre-existing `<img>` warnings.
- Production build: pass; one existing Turbopack broad filesystem-trace warning
  from `EvidenceIntakeService` via `next.config.mjs`.

## Files in the Confidence V2 integration patch

Core production engine and contract files:

- `src/domain/confidence/AuthorizedBriefingForecastAdapters.js`
- `src/domain/confidence/BriefingForecastFinalizer.js`
- `src/domain/confidence/CanonicalConfidenceAssessmentModel.js`
- `src/domain/confidence/CanonicalConfidenceReadService.js`
- `src/domain/confidence/ConfidencePublisherRegistry.js`
- `src/domain/confidence/ConfidenceV1CompatibilityAdapter.js`
- `src/domain/confidence/NumericConfidenceProjectionService.js`
- `src/domain/confidence/ProductionConfidenceContextAdapter.js`
- `src/domain/confidence/StartingForecastService.js`
- `src/domain/confidence/index.js`
- `src/domain/forecast/ForecastEngine.js`
- `src/domain/forecast/ForecastRuntimeContract.js`
- `src/domain/narrative/NarrativeEngine.js`
- `src/domain/narrative/NarrativeRuntimeContract.js`

Publication, adapters, and consumers:

- `src/data/repositories/founderRuntimeStore.js`
- `src/domain/services/CanonicalBriefingConfidencePublicationService.js`
- `src/domain/services/GoalInitializationForecastService.js`
- `src/domain/services/PICadenceBriefingLifecycleService.js`
- `src/domain/services/PIDEXAEventLifecycleService.js`
- `src/domain/services/PIPhotoEventLifecycleService.js`
- `src/domain/services/MidweekBriefingService.js`
- `src/domain/services/WeeklyNarrativeService.js`
- `src/domain/services/MonthlyBriefingService.js`
- `src/domain/services/DEXAEventNarrativeService.js`
- `src/domain/services/PhotoEventNarrativeService.js`
- `src/domain/services/PIEnergyConfidenceFinalizationService.js`
- `src/domain/services/PITrainingConfidenceFinalizationService.js`
- `src/domain/services/ActiveGoalConfidencePresentationReadService.js`
- `src/domain/services/BriefingGoalConfidencePresentationService.js`
- `src/domain/services/HomeBriefingService.js`
- `src/domain/services/PhaseAwareActiveGoalPreviewService.js`
- `src/screens/GoalsHubScreen.jsx`

Acceptance and compatibility test files added or updated by this integration:

- `src/domain/confidence/BriefingForecastFinalizer.test.js`
- `src/domain/confidence/CanonicalConfidenceReadService.test.js`
- `src/domain/confidence/ConfidenceV2ScenarioAcceptance.test.js`
- `src/domain/confidence/NumericConfidenceProjectionService.test.js`
- `src/domain/confidence/ProductionConfidenceContextAdapter.test.js`
- `src/domain/services/CanonicalBriefingConfidencePublicationService.test.js`
- `src/domain/services/GoalInitializationForecastService.test.js`
- `src/domain/services/ActiveGoalConfidencePresentationReadService.test.js`
- `src/domain/services/PIEnergyConfidenceFinalizationService.test.js`
- `src/domain/services/PITrainingConfidenceFinalizationService.test.js`
- `src/domain/services/PILowerLevelConfidenceIntegration.test.js`
- `src/domain/services/WeeklyGoalConfidenceIntegration.test.js`
- `src/domain/services/OverallGoalConfidenceParity.test.js`
- `src/domain/services/WeeklyClosedWindowCatchUp.test.js`
- `src/domain/services/WeeklyBriefingPersistenceService.test.js`
- `src/domain/services/HomeActiveChapterProduction.test.js`
- `src/app/evidence/review/DEXACanonicalHydration.test.js`
- `src/app/goals/BuildLeanMassPhaseAwareProduction.test.js`
- `src/app/goals/NarrativeGoalProductionRoutes.test.js`
- `src/screens/GoalsHubScreen.test.js`

The repository was already materially dirty before this task. Unrelated edits
and untracked screenshots, exercise terminology work, evidence workflows,
execution UI, and synthetic preview assets were preserved and are not part of
this patch.

Documentation files changed by this integration are this report,
`docs/CONFIDENCE_PUBLICATION_ARCHITECTURE_V2.md`, and
`docs/CONFIDENCE_ARCHITECTURE_V2.md`.

## Deployment readiness and rollback

The current 2026-08-02 production baseline already contains the first canonical
V2 successor from the July 26-August 1 Weekly Briefing. The earlier
"first naturally occurring V2 briefing" instructions below are retained as the
implementation-time boundary, not as a pending production action. The current
operator procedure is
[`CONFIDENCE_V2_PHASE_REVIEW_PRODUCTION_CUTOVER.md`](./CONFIDENCE_V2_PHASE_REVIEW_PRODUCTION_CUTOVER.md):
preserve and accept the existing lineage, create no deployment-time assessment,
and treat the next natural authorized Briefing as a V2 successor.

No automatic deployment is authorized by this document.

Deployment prerequisites:

1. Review and approve the remaining Goal-transition Starting Forecast wiring
   decision (same activation transaction versus explicit post-commit hook).
2. Review the two unrelated briefing-test failures and accept or repair their
   stale fixture expectations.
3. Capture a recoverable copy of `private/founder/runtime-store.json` and record
   size, modified time, and SHA-256 immediately before deployment.
4. Confirm the production store still has the expected revision, active Goal,
   current V1 assessment, and no V2 history.
5. Deploy the reviewed code and perform one normal PhysiqueOS runtime restart
   using the established stop/start scripts. No offline schema migration is
   required; expected downtime is only the normal restart window.
6. Verify one canonical listener, runtime ownership, ngrok continuity, Home,
   Briefing History, current V1 compatibility state, and preview routes.
7. Do not generate or replace a production artifact during deployment. Allow
   the next natural authorized briefing to perform the first V2 publication.

Rollback before the first V2 publication is a code rollback and normal restart;
the Founder store should be byte-identical. After a V2 publication, do not
delete or rewrite its immutable history. Roll back publishers while retaining a
reader that understands V2, or restore the pre-deployment backup only with
explicit approval and a reconciliation plan for any intervening writes.

Explicit authorization is required for every production-changing action:

- creating the Founder-store backup;
- stopping or restarting the canonical runtime;
- deploying this code;
- wiring/enabling Goal-transition Starting Forecast publication;
- applying any later migration;
- generating, regenerating, or replacing a production briefing;
- allowing the first production V2 publication;
- changing Home or briefing publication state through live traffic;
- restoring a backup or rolling back persisted state.

## Runtime safety attestation

Implementation and tests did not write the production Founder store. The store
size and modified time remained at the values observed before implementation;
the final SHA-256 is recorded in the pre-deployment hash section below. No
production evidence, Goal state, confidence history, briefing artifact,
publication state, Home state, persisted Forecast, ngrok process, or runtime
listener was changed. The runtime was not stopped or restarted.

## Pre-deployment hashes

Recorded after build and tests on 2026-08-01. Re-record and compare immediately
before deployment authorization.

| File | SHA-256 |
| --- | --- |
| `private/founder/runtime-store.json` | `0AE9B33A291B0F28545F7924CBF6ABA5E0A85DF6257B54E885F1F401E3987F8A` |
| `src/domain/confidence/BriefingForecastFinalizer.js` | `0A9A4362BE1D32EC22CC6A0A571761C13B410AEEE4523C5737FBF8EB3D26482C` |
| `src/domain/confidence/ConfidencePublisherRegistry.js` | `340D50294F6AB64F35B468E8FB126D4057512DBD939BFACE9BA0B8E00FED334E` |
| `src/domain/confidence/NumericConfidenceProjectionService.js` | `19072AF856DA5B2A2564FA2F80D640FDE70E34622048CEA291E6D19C2F79FD38` |
| `src/domain/confidence/CanonicalConfidenceAssessmentModel.js` | `8923FDC4F580D337EBFBC6530576F6359A3E6AE09B2ECA93F03F95F7F85C44F8` |
| `src/domain/services/CanonicalBriefingConfidencePublicationService.js` | `ECE4BD110AF90788222261484463BED9B07E1D6597765FC57D49A19AF914734C` |
| `src/domain/services/GoalInitializationForecastService.js` | `D2AB0C78FA1F3E393FB58508087F9C797A5DC9A4703FDCC360F207AE37A07177` |
| `src/data/repositories/founderRuntimeStore.js` | `798CC0D6BCDFC4B83F336AFB96652EB5A25F5451EB0E7424F5BE258DE523D6C0` |

Founder store metadata: 17,672,103 bytes; modified
`2026-08-01T17:37:31.598-07:00` (`2026-08-02T00:37:31.598Z`). This matches the
size and modified time observed before implementation.

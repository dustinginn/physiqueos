# Phase Review Production Architecture

## Decision and safety boundary

Phase Review follows one product rule: PI recommends; the user decides. Time may
make a review due, but time never completes a phase, activates another phase,
replaces Strategy, creates a Starting Forecast, or assigns evidence to a
projected phase.

This architecture is additive and deployment-inactive. A fail-closed production
factory and server-only action now exist, but the action has no caller and has
not been deployed or executed. It does not run a repair, publish a decision,
regenerate an artifact, or mutate the Founder store. The synthetic August 15
DEXA route and `PhaseReviewCard` remain isolated and unchanged. See
[`PHASE_REVIEW_PRODUCTION_BOUNDARY.md`](./PHASE_REVIEW_PRODUCTION_BOUNDARY.md)
for the cross-process lock, authorization and operational boundary.

## Canonical Phase Contract

`canonicalGoalPhase.js` is the strict lifecycle boundary. It accepts historical
`id/goalId`, `startDate`, `successCriteria`, `upcoming`, and `skipped` fields and
projects them to canonical equivalents without modifying the source record.

Canonical fields are:

- identity: `phaseId`, `goalId`, `order`, `canonicalName`, `purpose`;
- lifecycle: `status`, `startedAt`, `plannedReviewAt`, nullable `completedAt`,
  `supersededAt`, `lastReviewedAt`, and `reviewState`;
- projection: nullable `projectedNextPhaseStart` and `projectedNextReviewAt`;
- completion: `completionCriteria`, `reviewMilestone`,
  `completionDecisionRequired`, and nullable `completionDecisionId`;
- extension: `extensionCount`, nullable `latestExtensionDecisionId`, and
  nullable `currentRecommendedReviewAt`;
- concurrency: non-negative `revision`.

Status semantics:

| Status | Meaning |
| --- | --- |
| `planned` | A future phase with no actual start and no evidence ownership. |
| `active` | The committed current phase. It remains active across its planned review until a decision commits. |
| `review_due` | Supported explicit compatibility status for an active phase whose review is due. Date passage does not persist it. |
| `review_pending_decision` | Supported explicit compatibility status for an active phase with an unresolved presented decision. |
| `completed` | A user-authorized decision committed `completedAt` and successor effects atomically. |
| `superseded` | A phase was replaced by an explicit lifecycle decision; it was not failed. |
| `paused` | Execution is intentionally paused and cannot own active execution effects. |

`reviewState` distinguishes `scheduled`, `due`, `pending_decision`, `extended`,
`decision_committed`, and `not_required`. `resolveCanonicalPhaseReviewState`
may derive `due` for presentation from `asOf >= plannedReviewAt`; it returns a
view and never changes committed `status`.

## Canonical Founder correction

`FounderPhaseCorrectionService` recognizes only the canonical Founder
Build Lean Mass aggregate and builds a deterministic, read-only projection:

| Field | Corrected value |
| --- | --- |
| Goal timeline start | `2026-07-19` |
| Establish Maintenance start | `2026-07-19` |
| Establish Maintenance planned review | `2026-08-15` |
| Establish Maintenance status | `active` |
| Establish Maintenance completion | `null`, decision required |
| Lean Mass Build status | `planned` |
| Lean Mass Build actual start | `null` |
| Lean Mass Build projected start | `2026-08-16` |
| Goal target | `2026-10-31` |

The repair plan contains before/after SHA-256 fingerprints, stable phase IDs,
changed paths, and an idempotency key. It explicitly reports
`persistenceAuthorized: false` and has no persistence method.

### Date-boundary convention

The August 15 DEXA and all evidence dated August 15 remain owned by Establish
Maintenance. If the user authorizes transition on August 15, Phase 1 completes
at the decision timestamp and Lean Mass Build starts on August 16, the first
full local execution day. This avoids assigning the evidence that justified a
decision to the phase created by that decision. Historical closed windows keep
their published ownership. A later or earlier authorized decision uses the same
rule: decision date closes the current phase; the next local date starts the
successor.

## Phase Review recommendation and decision

`phaseReviewDecision.js` preserves recommendation separately from selection.
Recommendations support `begin_next_phase`, `extend_current_phase`, and the
reserved `review_strategy_first`. User decisions support Begin and Extend.
Extension selections support one, two, three weeks, or a custom date.

Every immutable decision records Goal/current/next phase identities, the
original review, recommendation and recommendation duration, selected outcome
and duration, selected review, projected successor start, decision timestamp
and source, artifact/Briefing/Forecast/Interpretation/Confidence lineage,
reasoning lineage, actor, idempotency key, and expected current status/revision.
Choosing an alternative never overwrites PI's recommendation.

## Atomic mutation contracts

`PhaseReviewMutationService` requires explicit store, reader, unit-of-work, and
authorization dependencies. There is deliberately no production singleton or
server action.

The explicit participant lifecycle and atomic coordinator are defined in
[`PHASE_REVIEW_COMMIT_COORDINATOR.md`](./PHASE_REVIEW_COMMIT_COORDINATOR.md).
`PhaseReviewMutationService` is now only a compatibility alias; it cannot bypass
the coordinator or register the former opaque Begin callback.

Begin validates the active primary Goal, committed active phase, original review,
expected phase status/revision, planned successor, authorization binding, and
idempotency. One Founder-store unit of work completes Phase 1, records completion
and decision lineage, activates Phase 2 with an actual start, updates Goal phase
pointers/projection, appends the decision, and runs the registered Strategy,
trajectory, Starting Forecast, and read-model participants. Begin fails closed
unless the complete lifecycle registry and accepted Phase 2 Strategy/trajectory
records exist. The Starting Forecast uses the canonical V2 engines in prepared
mode and stages its publication records inside this transaction; it does not
call the separate post-capture `GoalInitializationForecastService` publisher.

Extend performs the same prior-state and authorization checks, keeps Phase 1
active, appends the immutable decision, moves `plannedReviewAt`, increments
`extensionCount`, preserves recommended and selected durations, updates the
successor projection and Goal timeline, and leaves Strategy, protocols, and
Confidence snapshots unchanged. It does not create a Starting Forecast.

The unit of work supplies revision compare-and-swap, same-process commit mutex,
cross-process whole-store ownership, atomic file replacement, staged
publication, and complete pre-commit rollback.
The decision ID and idempotency key make retries return the committed result.
Phase Review holds the canonical file lock from the final fresh read through
post-commit verification. The legacy persistence boundary uses the same lock,
so independent canonical writers cannot replace the whole file concurrently.

## Repository-wide dependency map

| Classification | Locations | Finding and required behavior |
| --- | --- | --- |
| canonical source | `canonicalGoalPhase.js`, `FounderPhaseCorrectionService`, `GoalPhaseTimelineIntegrityService` | Explicit planned review wins; legacy duration arithmetic is fallback only. |
| persistence dependency | `founderRuntimeStore.js`, `FounderStoreUnitOfWork.js`, `GoalRepository.js`, `GoalPhasePersistenceService.js`, `authoredGoalPhase.js` | Goal owns phases; decisions are append-only; store UoW is the atomic boundary. Legacy phase editing remains compatible and does not run the repair. |
| direct consumer | `HomeGoalTrajectoryService`, `HomeActiveChapterPresentationService`, `PhaseAwareActiveGoalPreviewService`, `GoalsHubScreen` | Render Started, Planned review, active/review-due/extended, and projected successor separately. |
| derived display | `HomeHeroCard`, `GoalRow`, active Goal phase cards and turning points | No “phase ends” language; no guaranteed successor start; planned phases do not own progress evidence. |
| briefing context | `DailyBriefingService`, `MidweekBriefingService`, `WeeklyBriefingContextService`, `WeeklyNarrativeService`, `MonthlyBriefingService` | Resolve the committed phase at the evidence cutoff. After August 15 and before decision, Phase 1 remains context. |
| event context | `DEXAEventContextService`, `PhotoEventContextService`, DEXA/Photo narrative services | Event evidence uses the committed phase and exposes planned review/review state. The August 15 DEXA belongs to Phase 1. |
| confidence/forecast | `ProductionConfidenceContextAdapter`, `ActiveGoalConfidencePresentationReadService`, `GoalInitializationForecastService`, `domain/confidence`, `domain/forecast` | Goal Contract carries explicit phase lifecycle. No Starting Forecast before authorized activation; extension is timing context, not a new Goal. Published history is immutable. |
| evidence filter | `PIObservationGoalContextService`, `GoalTrainingProgressService`, cadence evidence-window services | Actual starts and committed boundaries own evidence. Review-day evidence is included in the current phase; projections own none. |
| orchestration dependency | Goal Transition coordinator, transaction plan, staged repository factory, activation capability and source snapshot services | Existing whole-Goal Transition owns predecessor/target Goal replacement and protocol draft consumption. Phase activation must not reuse it as an unsafe partial workflow. A staged participant is required. |
| strategy/protocol | Strategy editors/managers, protocol transition/reconciliation/version services, execution projection | Extension retains current Strategy/protocols. Begin may activate only already accepted phase-compatible records through the atomic participant. No inspected production source activates the Goal phase solely from a date. |
| notification timing | Reminder repository, Action/Daily Focus, execution scheduling, DEXA appointment management | Existing reminders are protocol/execution driven. No new notification is activated. Future review reminders may reproject only if pending; delivered history is immutable. |
| compatibility adapter | legacy `goalPhase.js`, `authoredGoalPhase.js`, `expectedPhaseReviewDate`, Founder read correction | `upcoming -> planned`, `skipped -> superseded`, `startDate -> startedAt`, `successCriteria -> completionCriteria`; no destructive historical migration. |
| diagnostic/preview | synthetic DEXA route, `PhaseReviewPreviewService`, `PhaseReviewCard`, Goal/transition previews, lab routes | Read-only. Preview controls remain disconnected from the production mutation. |
| historical artifact | persisted Briefings, Confidence/Forecast history, activation audit timestamps, photo-completion lab scenario | Dates that describe real publication/evidence history are retained. They are not current phase configuration. |
| stale fixture | `midweekBriefingPreview.js`; prior Home/Goal trajectory tests and production read assertions | Canonical Goal timing corrected to July 19/August 15. Unrelated July 20 evidence-window fixtures remain valid. |
| stale docs | `HOME_GOAL_TRAJECTORY.md`, `ACTIVE_GOAL_PHASE_AWARE_PREVIEW.md`, one Goal Contract inventory line | Corrected. Historical transition audit timestamps remain untouched. |
| hardcoded Founder assumption | persisted active Build Lean Mass Goal; protected read adapter match | Live record still contains July 20/four weeks. Read projection corrects it without persistence; explicit repair authorization is still required. |
| automatic-transition risk | duration-derived Home progress and any consumer equating 100% time with completion | Blocked by separate status/review state and decision-required mutation. Search found no production phase completion service triggered only by the date. |
| no change required | generic tests using July 20 as evidence/window timestamps; `forecastV2Fixtures` generic calibration milestone; lab photo-completion date; activation audit documents | These dates are not Founder Phase 1 timing and changing them would rewrite unrelated or historical meaning. |

### Surface audit coverage

The source audit included Home trajectory/Goal cards; Goals Hub; active Goal,
journey, phase cards, previews, planning/editing, transition, activation and
completion; Daily, Midweek, Weekly, Monthly, DEXA and Photo briefing paths and
Briefing History; Confidence Goal Contract, Interpretation and Forecast; reminder,
notification, protocol, Strategy and execution services; evidence context and
training windows; Goal/phase repositories; Founder seeds/runtime compatibility;
diagnostics; tests; and architecture documents.

## Stale date findings

Live defects were the persisted Founder Goal (`timeline.startDate` and Phase 1
`startDate` of July 20 plus four-week duration), duration-derived August 17 Home
and Goal presentation, the active Goal training review window, the Midweek Goal
fixture, Home/Goal production assertions, and three current architecture lines.
They now use or project July 19 and August 15. August 17/July 20 occurrences in
Goal Transition forensic documents are immutable operation timestamps. Most
test occurrences are evidence days or arbitrary transaction clocks and are not
phase dependencies. `app/lab/photo-completion` is a synthetic historical event.
The Forecast V2 fixture's July 20 is a generic calibration milestone, not the
Founder active Goal. These are classified no-change.

## Persistence and migration

The schema impact is additive. `phaseReviewDecisions` is an append-only optional
collection; missing means empty. Historical phase records are adapted on read.
Canonical lifecycle fields may be added to current phases without deleting
legacy fields. No immediate destructive migration is required.

Authorized repair sequence:

1. Stop phase-decision writes and capture a byte-for-byte backup plus SHA-256.
2. Verify the active primary Goal ID, stable phase IDs, Goal/phase status,
   current Founder-store revision, and the repair plan's before fingerprint.
3. In one Founder-store transaction, apply only the plan's Goal/phase changed
   paths and initialize `phaseReviewDecisions` if absent.
4. Validate the canonical phases, exactly one active primary Goal/phase, null
   Phase 2 actual start, unchanged target, protocols, Strategy, evidence,
   Briefings, Confidence history, publication state, reminders, and supporting
   Goals.
5. Commit once, record commit ID/revision, and compute the after file SHA-256
   plus candidate Goal fingerprint. A repeated run whose after fingerprint
   matches returns no changes.

Expected changed records: one Build Lean Mass Goal aggregate and the store root
revision/commit metadata. Expected appended decisions: zero. Rollback restores
the byte-for-byte backup after verifying no later revision exists; if later
writes exist, use a compensating transaction built from the saved before Goal
instead of overwriting unrelated work.

## Deployment sequence and readiness gates

1. Review this audit and canonical date boundary.
2. Create and explicitly accept the Founder Phase 2 Strategy and Expected
   Trajectory records required by the implemented staged participants.
3. Review the implemented cross-process lock and prohibit/migrate direct
   scripts that bypass canonical persistence.
4. Back up and explicitly authorize the one-record repair.
5. Run the repair and verify hashes/invariants.
6. Separately authorize runtime restart/deployment.
7. Separately wire the production Phase Review control.
8. Separately authorize Confidence V2 deployment and the first natural V2
   Briefing publication.

Until gates 2–4 are satisfied, production Begin remains intentionally unavailable.
No deployment, runtime restart, repair, decision, notification activation,
artifact generation, or publication is authorized by this document.

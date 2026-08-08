# Phase Review Commit Coordinator

## Safety boundary

The Phase Review Commit Coordinator is the only mutation boundary for an
existing Goal's operational phase lifecycle. A production factory and
server-only action now construct it, but neither is connected to a page,
briefing, route, API client or scheduler. This patch does not execute the
Founder transition, publish a Briefing, or write a Confidence assessment. The
outer runtime boundary is documented in
[`PHASE_REVIEW_PRODUCTION_BOUNDARY.md`](./PHASE_REVIEW_PRODUCTION_BOUNDARY.md).

The coordinator stages the complete decision in one Founder-store unit of work.
Participant `commit` methods mutate only the transaction's isolated candidate.
The candidate is validated, revision checked, serialized, atomically replaced,
and published as one store revision. A pre-commit failure discards the entire
candidate and invokes participant rollback in reverse order.

## Coordinator flow

1. Parse the immutable Phase Review decision and verify actor-bound authorization.
2. Under the outer cross-process whole-store lock, acquire the same-process Goal
   lock and capture the persisted store revision.
3. Reject an idempotent replay or stale expected store/phase revision.
4. Open a Founder-store transaction bound to the captured revision.
5. Call every participant's `prepare` in canonical order without mutation.
6. Call every participant's `validate` in the same order.
7. Call every participant's `commit` against the isolated staged store.
8. Validate the complete candidate and append the transaction record.
9. Finalize commit IDs and Confidence persistence lineage inside the candidate.
10. Atomically commit one revision or roll back every participant.

Failed attempts are returned with an in-memory lifecycle/rollback log. They are
not persisted through a second audit write because that would violate the
all-or-nothing decision boundary. Successful attempts persist one append-only
`phaseReviewTransactions` record.

## Canonical participants

| Order | Participant | Begin Phase 2 | Continue Phase 1 |
| --- | --- | --- | --- |
| 1 | Phase Review | Append recommendation, selection, authorization lineage, and idempotency identity. | Same. |
| 2 | Goal | Move committed pointers to Phase 2 and clear the projection. | Keep Phase 1 current and move projected timing. |
| 3 | Current Phase | Complete Phase 1 and bind the decision. | Keep active, preserve the original milestone, increment extension metadata. |
| 4 | Next Phase | Activate with the first full local execution date. | Keep planned and reproject its start. |
| 5 | Strategy | Require one complete, accepted, unsuperseded, revision-matching Phase 2 Strategy and activate its Goal reference without mutating the accepted record. | Validate and retain all Strategy records unchanged. |
| 6 | Expected Trajectory | Require one complete, accepted, unsuperseded, revision-matching Phase 2 trajectory and activate its Goal/timeline reference without mutating the accepted record. | Validate and retain trajectory records unchanged. |
| 7 | Starting Forecast | Prepare the canonical first Phase 2 Forecast/Confidence series and stage its artifact, history, and snapshot. | Create nothing; expose only changed review timing. |
| 8 | Read Models | Upsert canonical lifecycle context for Home, Goal, timelines, Forecast, Confidence, Briefings, notifications, protocols, and Strategy scheduling. | Upsert extension context without presentation mutation. |

Every participant exposes `prepare`, `validate`, `commit`, and `rollback`.
Ordering is fixed by `PHASE_REVIEW_PARTICIPANT_ORDER`; registration fails if a
participant or lifecycle method is missing.

## Strategy and Expected Trajectory prerequisites

Production Begin requires additive phase-owned records:

- `phaseStrategies`: exactly one Phase 2 record in `accepted` state containing
  the accepted canonical `strategyHypothesis`;
- `phaseExpectedTrajectories`: exactly one Phase 2 record in `accepted` state
  containing at least one canonical trajectory segment.

The participants never generate, reinterpret, or edit accepted content. Accepted
records keep the five-state acceptance lifecycle; use is activated by Goal and
read-model pointers rather than an `active` record status. The current Founder
store has neither collection populated, so a real Begin remains fail-closed
until separate product workflows create and accept those records. See
[Phase 2 Activation Package](./PHASE_2_ACTIVATION_PACKAGE.md).

## Starting Forecast

The participant uses the production Goal Contract adapter and existing V2
Interpretation, Forecast, Narrative, numeric Confidence, and assessment models
in prepared-only mode. It consumes the Goal Contract, newly active phase,
accepted Strategy and trajectory, IDs for prior Goals and historical execution,
the normalized July 18 baseline summary, latest canonical Confidence V2
reference, decision lineage, remaining timeline, semantic gaps, and a typed
Starting Forecast context. The deterministic package passes no raw evidence or
briefing presentation to the engines.

The assessment, initialization artifact, history, snapshot, decision, phases,
Strategy, trajectory, and read model share the same Founder-store commit ID and
revision. A Phase 2 series cannot replace an existing series.

## Downstream canonical read model

`phaseLifecycleReadModels` contains domain state, not visual copy: committed
active/planned identities, actual/projected dates, review state, Strategy and
trajectory references, Starting Forecast identity, Forecast timing,
Confidence/Briefing context, notification projection, and protocol/Strategy
scheduling modes. Protocol definitions and historical Briefings/evidence are
protected by candidate invariants.

## Mutation-path audit

| Path | Classification | Result |
| --- | --- | --- |
| `PhaseReviewMutationService` | former opaque participant path | Compatibility alias for this coordinator; legacy callbacks are rejected. |
| Goal phase editor and `GoalPhasePersistenceService` | direct collection replacement risk | Existing operational lifecycle/timing changes fail with `PHASE_REVIEW_COORDINATOR_REQUIRED`. Initial authoring and non-operational edits retain their boundary. |
| Goal Transition Activation Coordinator | whole-Goal transition | Separate atomic workflow; it does not transition phases inside an existing Goal. |
| Goal edit drafts and screens | draft-only | No mutation before the guarded persistence service. |
| Home, Goal, briefing, Confidence, narrative, Forecast and event services | read consumers | No inspected direct phase mutation. |
| protocol execution timelines | protocol dose phases, not Goal phases | No change required. |
| Founder correction service | read projection/repair-plan builder | No persistence method. |

Source search found no other non-test assignment to Goal phase status or phase
pointers outside the canonical participants and read-only Founder projection.

## Transaction and rollback invariants

- actor-bound authorization;
- decision ID and idempotency-key uniqueness;
- expected store revision, phase status/revision, and planned review;
- deterministic order and reverse rollback;
- accepted Strategy and trajectory prerequisites;
- exactly one Phase 2 Starting Forecast series on Begin;
- no Starting Forecast, Strategy, trajectory, protocol, or Confidence mutation
  on Continue;
- immutable historical Briefing/evidence prefixes and protocol definitions;
- final transaction, Confidence history, snapshot, and artifact commit lineage;
- Founder-store compare-and-swap plus in-process mutex and cross-process
  whole-file ownership.

The Founder unit of work and legacy persistence boundary now share an atomic
file-backed cross-process lock. Phase Review passes its outer ownership into the
unit of work and retains it through persisted post-commit verification. Atomic
persistence followed by live publication may still report `failed_committed`
if publication or post-verification fails; the durable domain transaction is
complete, and backup/revision-aware incident recovery is then required.

## Production simulations

The isolated suite covers successful Begin; missing Strategy; missing
trajectory; Starting Forecast, validation, and staged-commit failures; one-,
two-, three-week and custom extensions; idempotent replay; stale phase/store
revisions; overlapping decisions; reverse rollback; and byte-for-byte persisted
and live-store preservation. Simulation stores are temporary.

## Deployment gates

Production remains no-go until separately authorized work supplies:

1. the Founder canonical phase repair;
2. accepted Phase 2 Strategy and Expected Trajectory records;
3. operational approval of the implemented cross-process lock and migration or
   prohibition of direct bypass scripts;
4. deployment of the implemented production-bound factory/server action;
5. production UI wiring and user-authorization capture;
6. backup, dry-run fingerprints, deployment/restart authority, and post-commit
   verification;
7. separate Confidence V2 deployment/publication authority.

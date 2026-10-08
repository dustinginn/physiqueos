# Operating Plan Energy Phase History V1

This additive read contract projects historical Energy targets only from immutable canonical protocol versions. It never reconstructs a prior target from the mutable protocol root, the active strategy, logged Nutrition or Activity, Apple Health, DEXA, Briefing prose, or defaults.

## Lineage

| Presented fact | Required canonical source | Semantics |
| --- | --- | --- |
| Goal and Phase identity | `goals[].id`, `goals[].phases[].id` | Owner-scoped canonical Goal chronology |
| Phase dates | `phase.startedAt` / `startDate`, `phase.completedAt` / `supersededAt` | Owner-local calendar dates |
| Revision attribution | `protocolVersions[].phaseId` plus matching `goalLinks[].goalId` | Explicit; no date-only inference |
| Effective range | `protocolVersions[].effectiveAt` and `endedAt` | Start-inclusive, end-exclusive owner-local calendar dates |
| Caloric intake target | `change.reviewedChanges.caloricIntakeTarget` | Planned target, never observed intake |
| Activity expenditure target | `change.reviewedChanges.activityExpenditureTarget` | Planned target, never measured expenditure or Active Energy |
| Provenance | protocol/version IDs, strategy ID, confirmation authority | Machine-readable source identity; not causal evidence |

Only `completed` or `superseded` phases and `superseded` or `archived` versions can appear. The current active phase remains in the existing current Strategy fields and is deliberately excluded from history.

## Availability matrix

| Source condition | Phase availability | Field availability | Presentation meaning |
| --- | --- | --- | --- |
| Explicit Goal/Phase-bound immutable version, both targets present, valid range | `available` | `available` | Show the recorded values and effective dates |
| Immutable version exists, one target was not stored | `partial` | present field `available`; missing field `not_recorded` | Show the real value and “Not recorded” for the missing field |
| Immutable version exists, neither target was stored | `unavailable` + `recorded_without_targets` | `not_recorded` | The revision is real, but its targets were not captured |
| Completed Phase exists with no explicitly attributed version | `unavailable` + `unknown` | no revision | Show Phase chronology and “Unavailable”; do not infer a target |
| Wrong Goal binding, invalid/out-of-Phase range, active version attached to old Phase | `untrusted` | withheld | Show unavailable source state; no values |
| Overlapping or same-effective-date revisions | `untrusted` + `conflicting_effective_ranges` | withheld | Do not choose a winner silently |
| Multiple contiguous revisions | `available` or `partial` | per revision | Show each effective range in deterministic chronological order |

Legacy records without explicit Phase and Goal attribution remain unknown even if their dates overlap a Phase. A capture-on-transition/backfill policy is outside this read-only contract and requires separate approval.

## Compatibility

`energyPhaseHistorySchemaVersion` and `energyPhaseHistory` are additive fields on the Native Energy Strategy read. Build 92 ignores the new keys. Build 93 decodes their absence as an empty history, preserving compatibility with the Build 92 Server response. No mutation contract, enum, database schema, or current Energy Strategy field changes.

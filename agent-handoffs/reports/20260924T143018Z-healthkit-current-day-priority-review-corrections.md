# HealthKit current-day priority — first review rejection and corrections

Generated: 2026-09-24T14:30:18Z

Task ID: `codex-healthkit-current-day-priority-sep23-repair-20260924`

## Status

The first fresh-context review rejected Native candidate `91de99a33c80c7b5bd9180b38fb79bbec34b5448` with three valid findings. All three are corrected in amended exact Native candidate `d7c271fae4ed9a51e13b92f413ea9480c739f7f6`, which is pushed and green in the expanded complete HealthKit suite. A second fresh-context independent review remains pending. Nothing was deployed, uploaded, repaired, or mutated in production.

## First-review findings

1. Historical Activity/Nutrition still used one 30-day batch, so a collision on one historical date could prevent later historical dates from completing.
2. The September 23 recovery fence parsed the Server identity digest but did not recompute and authenticate it against the exact outgoing owner/device/purpose/namespace identity.
3. A transient upload left the batch safely pending but returned normally, allowing the coordinator outcome to label the current-day stream caught up without durable acknowledgement.

The reviewer otherwise confirmed the separate current-day scopes/order, timezone-derived bounds, zero-valued presence semantics, unchanged Workout path, disabled APPLY UI, and Native-only diff.

## Corrections

- Historical catch-up is now decomposed into exact-day durable scopes across the unchanged 30-day window. Each date owns an independent cursor, pending batch, and revision floor while mapping to the same Server `automatic` namespace.
- A failed historical date is retained for exact replay but cannot prevent later dates from querying and acknowledging in the same foreground generation.
- A historical identity collision rebases and retries only that exact date once. The next date still runs even if that retry or a transient upload fails.
- Any retained Build 57 whole-window pending batch receives one safe replay opportunity but cannot block the independent exact-day units.
- Daily collision recovery now recomputes the Server contract digest from `healthkit-daily-revision-identity-v1`, observation type, exact external ID, source bundle, enrolled delivery-device identity, and ingestion purpose. A mismatch retires the rejected batch without advancing a revision floor.
- The September 23-specific constraint independently checks the same exact digest in addition to date/type/revision/external-ID facts.
- Transient delivery now persists the pending attempt and throws an operational error. Callers preserve exact replay semantics, while automatic current-day outcomes cannot claim caught-up success until a durable acknowledgement clears the batch.
- The prior implementation report’s ordering sentence is corrected here: the actual foreground order is current Activity, current Nutrition, unchanged Workout, historical Activity, historical Nutrition. Both current daily lanes still precede all daily history.

## Validation

Only the existing iPhone 17 Pro simulator `A8157897-95ED-4480-9150-6136652A6519` was used.

- Amended synchronization suite: 55/55 passed.
- Focused Founder transient-replay suite: 12/12 passed.
- Expanded complete Native HealthKit suite across all nine HealthKit test classes: 150/150 passed.
- Exact Server digest material has a hard-coded cross-contract regression vector.
- New negative fixture proves a wrong identity digest causes no floor advancement and no retained repair batch.
- New production-shaped fixture proves a transient first historical date remains pending while the later historical date is durably acknowledged in the same run.
- Existing current-day, coalescing, relaunch, offline, timezone, zero-value, Workout, repair authorization/digest/revision/request, and no-unrelated-mutation tests remain green.
- `git diff --check`: passed; branch clean and matches the pushed remote ref.

## Mutation evidence

- Temporarily reintroducing stop-on-first-historical-failure caused the new isolation fixture to fail on the missing later cursor, query count, and external ID; the mutation was reverted.
- Earlier candidate mutation checks for current-first ordering, zero-valued presence, September 23 date/scope, aggregate digest, authorization, revision 50→51, and maximum request count remain applicable and green in the clean suite.
- The local safety gate refused temporary source patches that would deliberately disable the new recovery identity fence or suppress transient delivery errors. No bypass was attempted. Both guards have direct negative regressions, and the exact committed source remains fail closed.

## Exact authority and invariants

- Native base / installed Build 57 source: `6cca05813ce26e3ddd8ff2dead9867bb4e7e3bb9`.
- Rejected first candidate: `91de99a33c80c7b5bd9180b38fb79bbec34b5448`.
- Amended review candidate: `d7c271fae4ed9a51e13b92f413ea9480c739f7f6`.
- Production Server remains `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d`, deployment `e8c3bed3-20f6-4f5c-b34a-d27ab0881480`.
- Production/Founder-device mutation: none.
- Server mutation/deploy: none.
- TestFlight archive/upload: none.
- September 23 Activity repair: not applied.
- Policy/strategic eligibility, Strength relationship, Logger, and Cardio: unchanged.
- Midweek Native work: not merged or packaged.

## Next

Obtain a new fresh-context independent adversarial review of exact amended candidate `d7c271fae4ed9a51e13b92f413ea9480c739f7f6`. If clean, publish the final reviewed SHA and verdict, then stop for separate TestFlight authorization. Any September 23 Activity apply remains a different later authorization.

## Flags

- FIRST_FRESH_CONTEXT_REVIEWED: YES
- FIRST_REVIEW_VERDICT: REJECTED
- FIRST_REVIEW_FINDINGS_CORRECTED: YES
- HISTORICAL_PER_DAY_ISOLATION_PASS: YES
- RECOVERY_IDENTITY_DIGEST_BOUND: YES
- TRANSIENT_NOT_DURABLE_ACK_PASS: YES
- NATIVE_TESTS_PASS: YES
- SECOND_FRESH_CONTEXT_REVIEWED: NO
- TESTFLIGHT_UPLOADED: NO
- SEP23_ACTIVITY_REPAIRED: NO
- READY_FOR_CARDIO: NO
- GH_REPORT_PUBLISHED: PENDING
- CONTAINS_SECRETS: NO

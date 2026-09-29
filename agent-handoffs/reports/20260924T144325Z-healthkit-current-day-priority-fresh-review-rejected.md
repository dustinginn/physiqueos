# HealthKit current-day priority — amended candidate fresh-review rejection

Generated: 2026-09-24T14:43:25Z

Task ID: `codex-healthkit-current-day-priority-sep23-repair-20260924`

## Status

The fresh-context independent adversarial review rejected exact amended Native candidate `d7c271fae4ed9a51e13b92f413ea9480c739f7f6`. The permanent current-day-first and historical per-day isolation work is green in the Native test suite, but the candidate is not releasable: the production Server does not expose the authenticated device identity Native needs to validate collision-recovery identity digests, and the bounded September 23 future-apply seam has no authoritative read-only Server preflight for fresh runtime/policy/data facts. The governing prompt says to stop and report if review finds Server changes necessary, so no further code correction was attempted.

Nothing was deployed, archived, uploaded, repaired, or mutated in production.

## Independent review verdict

Verdict: **REJECT**.

The reviewer examined Build 57 base `6cca05813ce26e3ddd8ff2dead9867bb4e7e3bb9` through exact candidate `d7c271fae4ed9a51e13b92f413ea9480c739f7f6`, including both amendment commits, the authoritative Server SHA `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d`, and production Native/Server auth paths.

### High — recovery identity source mismatch

- Server collision recovery hashes the observation's durable `deliveryDeviceId`, which is populated from the authenticated principal's Server-generated device ID.
- Native candidate `d7c271fa…` recomputes that digest with an independently generated Keychain value shaped as `founder-device-<UUID>`.
- Server pairing creates a separate opaque device ID. Its pair and refresh session responses do not return that ID, the access credential is opaque rather than a JWT, and Native does not persist the Server ID.
- Therefore a real production collision digest cannot equal the Native recomputation. Current-day, historical, and September 23 revision recovery would fail closed before revision 51 is recorded.
- Tests masked the contradiction by configuring both sides as the same synthetic `device-a` value.

This cannot be corrected safely from existing Native authority. The smallest safe Server contract change is to expose the authenticated Server device ID through the native auth/session boundary, including refresh/relaunch continuity. Native must then durably bind its HealthKit delivery identity to that Server value, and production-shaped tests must keep the local pre-pair identity distinct until pairing supplies the authoritative one.

### High — September 23 apply drift facts are caller-supplied

- `HealthKitSeptember23ActivityRepairAuthorization` accepts a freely constructed `serverFacts` value.
- Apply compares those supplied strings/counts with frozen constants, but does not freshly obtain Server runtime SHA, policy digest, current/source revisions, canonical/source counts, or September 24 invariants.
- A stale authorization object can therefore satisfy local equality checks after Server or data drift.
- APPLY is UI-disabled in this candidate, so no current production write was possible, but the implemented future apply seam does not meet the requested apply-time authority fence.

The bounded repair requires an authenticated, read-only, production Server preflight that returns the exact frozen facts needed by the Native apply gate, followed by a fail-closed comparison immediately before any upload. No production repair is authorized here.

### Medium — per-day historical failures are absent from diagnostics

- The amended engine stores historical pending batches, floors, and errors under exact-date scopes.
- The automatic diagnostics snapshot still reads only current-day and legacy whole-window scopes.
- A retained exact-day failure can therefore appear as zero pending/no error in the Founder diagnostics card.

This is Native-only and should be corrected when the two blocking Server/Native contract issues are addressed.

## What the review confirmed

- Current Activity and Nutrition run before unchanged Workout and before all historical daily work.
- Current-day success is partitioned from historical collisions.
- Historical dates have independent durable scopes and later dates continue after one date fails.
- Transient upload does not report success without durable acknowledgement.
- Zero-valued daily observations remain valid present observations.
- Local-date bounds use the supplied calendar/time zone.
- Recovery digest field order and separators otherwise match the Server contract.
- September 23 date/type/scope/revision/request-count and UI authorization bounds are present.
- All candidate paths are under `ios/`; no Server or Midweek source was changed.
- Candidate branch was clean and pushed at the reviewed SHA.

## Validation evidence retained

Only the existing iPhone 17 Pro simulator `A8157897-95ED-4480-9150-6136652A6519` was used.

- Amended synchronization suite: 55/55 passed.
- Focused Founder replay suite: 12/12 passed.
- Expanded complete Native HealthKit suite: 150/150 passed across all nine HealthKit test classes.
- Historical stop-on-first-failure mutation was killed and reverted.
- `git diff --check` passed.
- Independent review repeated static base-to-candidate scope and digest-material checks. It did not rerun XCTest because the production identity contradiction was already release-blocking.

The passing Native suite does not override the rejection because its mocks gave Native and Server the same device identity, unlike production.

## Exact authority and invariants

- Installed Native Build 57 source / candidate base: `6cca05813ce26e3ddd8ff2dead9867bb4e7e3bb9`.
- Rejected first candidate: `91de99a33c80c7b5bd9180b38fb79bbec34b5448`.
- Rejected amended candidate: `d7c271fae4ed9a51e13b92f413ea9480c739f7f6`.
- Production Server remains `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d`, deployment `e8c3bed3-20f6-4f5c-b34a-d27ab0881480`.
- Production/Founder-device mutation: none.
- New Server mutation/deploy: none.
- TestFlight archive/upload: none.
- September 23 Activity repair: not applied.
- Policy/strategic eligibility, Strength relationship, Logger, and Cardio: unchanged.
- Midweek Native work: not merged or packaged.

## Required next step

Authorize a narrowly scoped Server-plus-Native correction task to:

1. expose and persist the authenticated Server device ID across pair/refresh/relaunch;
2. add a read-only, authenticated September 23 repair preflight with fresh runtime, policy, revision/count, and unrelated-data invariants;
3. bind Native recovery-digest verification to that Server device ID;
4. include exact-day historical scopes in diagnostics;
5. add production-shaped tests that keep local pre-pair identity distinct from the Server identity; and
6. obtain another fresh-context independent review before any TestFlight authorization.

No Build 58 release candidate exists from this task. Do not upload `d7c271fa…`.

## Flags

- AUTHORITY_REVERIFIED: YES (from prior checkpoint; no production mutation followed)
- SEP24_ZERO_VALUES_ALLOWED: YES
- CURRENT_DAY_FIRST_IMPLEMENTED: YES
- CURRENT_DAY_HISTORICAL_ISOLATION_PASS: YES
- HISTORICAL_COLLISION_CANNOT_STARVE_CURRENT: YES
- PER_DAY_REVISION_INDEPENDENT: YES (Native tests)
- ACTIVITY_NUTRITION_SCOPE_INDEPENDENT: YES
- ZERO_AGGREGATE_PRESENCE_TEST_PASS: YES
- TIMEZONE_ROLLOVER_PASS: YES
- SEP23_REPAIR_TOOL_IMPLEMENTED: YES, BUT NOT RELEASE-READY
- SEP23_REPAIR_DRYRUN_ONLY: YES
- SEP23_APPLY_AUTH_GATE_ENFORCED: LOCAL GATE ONLY; FRESH SERVER PREFLIGHT MISSING
- SEP23_DATE_SCOPE_HARD_BOUND: YES
- SEP23_REVISION_50_51_GUARD: LOCAL/FROZEN FACTS ONLY
- SEP23_DIGEST_FENCE: REJECTED — PRODUCTION IDENTITY SOURCE MISMATCH
- SEP23_MAX_TWO_REQUESTS: YES
- SEP23_NO_UNRELATED_MUTATION: TESTED; APPLY NOT EXECUTED
- MUTATION_TESTS_PASS: PARTIAL — HISTORICAL ORDERING MUTATION KILLED
- NATIVE_TESTS_PASS: YES, 150/150
- FRESH_CONTEXT_REVIEWED: YES
- FRESH_CONTEXT_VERDICT: REJECT
- SERVER_CHANGE_REQUIRED: YES
- TESTFLIGHT_UPLOADED: NO
- SEP23_ACTIVITY_REPAIRED: NO
- READY_FOR_CARDIO: NO
- GH_REPORT_PUBLISHED: PENDING
- CONTAINS_SECRETS: NO

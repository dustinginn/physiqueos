Task id: healthkit-strength-link-confirmation-hardening-20260923

Harden the Workout link-confirmation restore/one-to-one edge case, then confirm the accepted Sep 22 Strength candidate through the guarded service and close the bounded canary policy.

Continue in the current Claude HealthKit chat. Sonnet High.

Notification requirement:
Notify/question the Founder in Claude chat whenever explicit authorization is required, when a physical-device action is needed, and when substantive work completes. If authorization is the only blocker, ask directly, wait, then continue. Do not terminate merely to request authorization.

Reverify current authority. Expected hints:
Production Server 4b362591cb5f80c599f8f45eb7f392de7c44a36f
deployment d4754b09-ff14-4c1f-ab9b-8d4ea5814d85
Native Build 53 SHA 1c57556f

Prior accepted canary:
agent-handoffs/reports/20260923T043023Z-healthkit-sep22-workout-canary-accepted.md

Known production canary state:
Sep 22 exact-date Workout policy active, quarantined.
3 canonical workouts: 1 traditional_strength_training, 2 walks.
Strength candidate matched the existing Sep 22 Logger strength session as confident_match score 99, not auto-confirmed.
2 walks are no_match and separate.
Logger detail unchanged.
No duplicate Training session.
Workout strategic/V3/Confidence/briefing eligibility OFF.
Activity/Nutrition unchanged except ordinary automatic Activity progression.
No second device sync needed.

Part 1 — read-only audit of link-confirmation edge case

Before code changes or production confirmation, inspect the registered canonical link-confirmation service/command and reproduce the reviewer-noted edge case:
restoring or confirming a system-released link can throw a one-to-one violation.

Establish exact invariant:
one canonical HealthKit Workout may link to at most one Logger session and one Logger session may link to at most one canonical HealthKit Workout, with safe idempotent confirmation/replay.

Determine:
- normal confirmation path for the current score-99 candidate;
- released/restored link state transitions;
- uniqueness constraints and transaction ordering;
- concurrent confirmation behavior;
- idempotency/replay behavior;
- whether the current Sep 22 candidate is affected or merely exposed to the latent edge case.

Part 2 — smallest correct hardening

If the edge case is real, implement the smallest Server fix before confirming production candidate.

Requirements:
- preserve one-to-one integrity;
- do not weaken uniqueness constraints;
- restore/confirm should be transactionally safe;
- same confirmation replay is idempotent;
- conflicting confirmation fails safely with a domain error, not raw DB error;
- concurrent confirmations cannot produce two active links;
- released-link restoration cannot collide with an existing active claim;
- no mutation of Logger exercises/sets/reps/load/variants/supersets/notes;
- no Workout strategic eligibility change;
- no Activity/Nutrition effects.

Add focused regression tests reproducing the exact edge case and concurrency/idempotency cases.
Mutation-test the fix.
Run relevant Server suites and fresh-context independent adversarial review.
If reviewer finds blocker/major issues, fix and re-review exact final SHA.

Part 3 — deploy if required

If code changes are required, prepare/deploy the exact reviewed Server candidate through established process.

Before production deploy, ask Founder directly in Claude chat for explicit authorization if required.
Verify runtime source SHA/deployment labels correctly using the now-known apps update --spec + rebuild process.
Health 200/200.
No schema/migration change unless surfaced before action.
Bounded zero-write/invariant audit.

Part 4 — confirm the specific Sep 22 Strength candidate

After the confirmation path is proven safe and any required fix is live:
re-audit the current candidate and ensure it is still the same confident_match score-99 Strength candidate to the same existing Logger session.

Before the production link-confirmation write, ask Founder directly in Claude chat for explicit authorization, stating that this will confirm the existing Strength candidate link but will not alter Logger detail or strategic eligibility.

After Founder approves, confirm through the registered guarded/canonical service. Do not write tables directly.

Post-confirm audit:
- exactly one active Strength link/claim;
- correct canonical Workout <-> correct Logger session;
- one-to-one integrity;
- candidate status/claim state correct;
- replay/idempotency safe;
- Logger detail digest/rows unchanged;
- no duplicate Training session;
- 2 walks remain separate/unmatched;
- Workout strategic/V3/Confidence/briefing eligibility still OFF;
- Activity/Nutrition unchanged;
- no briefing regeneration.

Part 5 — close Sep 22 ingestion canary policy

After link confirmation succeeds, deactivate/close the exact-date Sep 22 Workout canary policy through the established guarded path so the completed ingestion canary is left in a clean closed state.

If deactivation is a separate production mutation requiring Founder authorization, ask directly in Claude chat and continue after approval.

Verify:
- Sep 22 canonical workouts and confirmed link remain intact;
- deactivation does not delete or alter accepted canonical data;
- no future date Workout ingestion is enabled;
- strategic eligibility remains OFF.

No phone action should be needed for this task. Do not ask Founder to sync again.

Final report:
- edge-case root cause;
- exact fix and SHA if any;
- tests/mutation/review;
- deployed SHA/deployment if changed;
- confirmed Strength link state;
- one-to-one integrity;
- Logger integrity;
- walk separation;
- strategic eligibility;
- A/N invariants;
- Sep22 policy closed;
- next bounded step for cardio canary and eventual Workout graduation.

Flags:
RESTORE_ONE_TO_ONE_EDGE_CASE_CONFIRMED
LINK_CONFIRMATION_HARDENED
UNIQUENESS_CONSTRAINTS_PRESERVED
CONFIRMATION_REPLAY_IDEMPOTENT
CONCURRENT_CONFIRMATION_SAFE
SERVER_FIX_REQUIRED
SERVER_DEPLOYED
FOUNDER_AUTHORIZED_LINK_CONFIRMATION
STRENGTH_LINK_CONFIRMED
ONE_TO_ONE_INTEGRITY_PASS
LOGGER_DETAIL_UNCHANGED
DUPLICATE_TRAINING_SESSION_PRESENT
OUTDOOR_WALKS_REMAIN_SEPARATE
WORKOUT_V3_ELIGIBILITY_ENABLED
ACTIVITY_NUTRITION_UNCHANGED
SEP22_WORKOUT_POLICY_DEACTIVATED
READY_FOR_CARDIO_CANARY

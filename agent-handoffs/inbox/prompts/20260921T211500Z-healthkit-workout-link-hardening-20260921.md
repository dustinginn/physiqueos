Task id: healthkit-workout-link-hardening-20260921

Goal

Harden the already-deployed dormant HealthKit Workout foundation before the first real Workout canary. Implement and prove two correctness safeguards now:
1. strict one-to-one relationship protection between HealthKit workouts and Workout Logger sessions;
2. conservative back-to-back workout boundary handling so ambiguous adjacent sessions never auto-link.

Keep Workout production activation OFF.
Do not archive/upload/install Build 50 yet.
Do not alter the active Sep 21 Activity + Nutrition proving period.
Do not change V3/Confidence/briefing behavior.

Claude chat continuity

Continue in the existing Claude Remote Control chat named "HealthKit Phase 2".
Inbox metadata uses chat_preference=continue_current_chat.

Authority

Reverify first.

Expected production Server:
6779d1b8fb4d10fde26cb303017807bd6b02dfaa
deployment ac0e440f-a982-48dc-a750-dd894274eea9
schema 000014

Expected installed/accepted proving Native:
2bfbf54ad105a3a18189e811f06afc421741a7da
Build 49

Reviewed but not shipped Workout Native candidate:
d96db0d0
Build 50 is required later for Workout canary but must remain unarchived/unuploaded in this task unless metadata already exists locally; do not advance release state.

Current Workout foundation

Production foundation is dormant:
- Workout canonicalization activation OFF
- zero canonical HealthKit workouts
- zero links
- Workout Logger owns exercises/sets/reps/load
- HealthKit Workout can provide telemetry and link candidates
- ambiguous matches are not auto-linked
- strategic eligibility OFF
- no Training PR/performance events from HealthKit
- Activity/Nutrition Sep 21 state unchanged

The prior review explicitly recommended:
- restore/enforce a one-to-one guard;
- define/test back-to-back boundary semantics.

Audit before patching

Inspect the deployed Server implementation, current persistence model/collections, existing Workout Logger identity/reconciliation semantics, and the prior independent review findings.

Determine whether either safeguard already exists partially and why the reviewer still considered it incomplete.

Do not broaden scope beyond the two safeguards except for defects directly exposed by their tests.

Safeguard 1 — one-to-one relationship invariant

Required invariant:

At any point in canonical relationship state:
- one canonical HealthKit workout may be linked to at most one Workout Logger session;
- one Workout Logger session may be linked to at most one canonical HealthKit workout for the same relationship role;
- replay/revision/re-created HealthKit source UUID handling must not bypass this;
- link candidate generation may mention alternatives, but confirmed/active relationship state cannot violate one-to-one.

Protect against:
- two Apple workouts overlapping one Logger session;
- one Apple workout overlapping two Logger sessions;
- HealthKit re-created UUID/revision attempting a second relationship;
- retry/race/idempotent replay;
- relink after unlink;
- stale candidate trying to confirm after another relationship has won;
- duplicate relationship rows under alternate identities.

Prefer enforcement at the domain/write-service layer plus whatever persistence uniqueness/check is possible without schema migration. If durable database uniqueness would require a migration, stop and surface that rather than silently introducing DDL. Determine whether current JSON/application store architecture has an equivalent owner-scoped invariant.

The guard must be deterministic and fail closed:
- existing valid relationship remains;
- conflicting second relationship is refused or becomes ambiguous/pending;
- never silently overwrite an established link.

If no production link-confirm command exists yet, enforce the invariant in the relationship creation/confirmation service that the future command will call, and test it directly.

Safeguard 2 — back-to-back workout boundary rule

Founder can perform adjacent workouts/sessions. The matcher must not confidently attach an Apple workout to the wrong Logger session simply because time windows touch or nearly touch.

Define the rule using existing same-workout thresholds/product semantics rather than inventing a broad arbitrary window.

Test at minimum:
- Logger A ends exactly when Logger B begins.
- Apple workout overlaps only A clearly.
- Apple workout overlaps only B clearly.
- Apple workout straddles the A/B boundary.
- Apple workout overlaps both within confidence tolerance.
- small clock/source skew near boundary.
- two Logger sessions separated by a small gap.
- identical/equal scoring candidates.
- one candidate has materially stronger overlap/duration agreement.
- unverifiable/missing Logger times.

Required behavior:
- clear single best match may be confident_match;
- if two plausible Logger sessions remain within the ambiguity/tie boundary, result is ambiguous_multiple or possible_match requiring confirmation;
- no automatic confirmed relationship from an ambiguous boundary case;
- deterministic ordering must not turn a tie into a match;
- candidate ordering changes must not change semantic result.

Do not overfit to one Founder workout. Keep the matcher general.

Strength authority

These changes must not alter the existing authority rule:
Workout Logger remains sole content authority for exercises, sets, reps, load, variants, supersets and Logger notes.

HealthKit must not manufacture or mutate those fields.

Cardio

Do not change cardio canonicalization unless the one-to-one relationship abstraction is shared and a direct regression is required.

No Activity double counting.

Activation/quarantine

Workout production activation remains OFF throughout:
- no policy write
- no canonical Workout creation in production
- no link creation in production
- V3 eligible HealthKit Workout = 0
- Confidence impact = 0
- no briefing changes
- no Training events

Sep 21 Activity + Nutrition

Hard regression gate:
- current activation policy unchanged;
- current canonical Activity day byte/semantically unchanged;
- current canonical Nutrition day byte/semantically unchanged;
- no extra revisions caused by this deployment;
- strategic quarantine unchanged.

Tests

Add focused regression tests for every case above.

Also run:
- existing HealthKit Workout suites
- HealthKit Activity/Nutrition suites
- Training/Workout Logger regressions
- V3/briefing regression/golden suites
- full relevant Server unit comparison against pristine production base 6779d1b8
- phase/access/migration gates
- ESLint
- git diff --check
- production build

Concurrency/race analysis

Even if the current storage/write model serializes writes, explicitly review whether two concurrent link confirmations could violate one-to-one.

If the current architecture cannot make the invariant race-safe without schema/transactional changes, do not claim it is fully enforced. Report the exact residual and whether it blocks the canary.

The first canary may remain Founder-confirmed/manual if that keeps risk bounded.

Independent review

Fresh-context reviewer on exact candidate, challenging:
- one-to-one completeness
- race/retry behavior
- re-created UUID behavior
- back-to-back ambiguity
- deterministic tie handling
- no Logger content mutation
- activation OFF
- Activity/Nutrition test day unchanged
- V3/Training quarantine
- no schema/data mutation required

Fix blockers and re-review exact final SHA.

Deployment

If gates/review clear and no schema migration is required, Server deployment is Founder-authorized.

Use established production fast-forward + spec stamp + force-rebuild verification.

Pre/post zero-write audit:
- all canonical owner collections
- HealthKit raw/canonical Activity/Nutrition state
- HealthKit Workout collections
- Workout relationship/link collections
- Training authority/events
- V3/Confidence/briefings
- schema/migrations

Require zero data differences caused by deployment.

Production proof:
- exact web/worker/runtime SHA
- live/ready 200
- Workout activation OFF
- zero canonical HealthKit workouts
- zero active links
- Sep 21 Activity/Nutrition state unchanged
- strategic quarantine unchanged

Native

No Native changes are expected. Do not touch d96db0d0/Build 50 unless a Server contract defect makes it unavoidable; if so, stop and report.

Do not archive/upload Build 50.

Preservation

If a new reviewed Server candidate is created, push a non-force preservation ref after Founder approval if the local classifier requests it. Do not touch main.

Deliverable

At completion state whether the dormant Workout foundation is now canary-ready once Activity/Nutrition is accepted.

Give the exact future strength canary procedure but do not activate it.

Backlog remains:
- Sep 21 Activity/Nutrition bedtime/completed-day revisions and audit
- Build 50 archive/upload only after A+N acceptance
- display-only HealthKit Log/Evidence projection
- background delivery/durable Native revision floor
- Workout Logger draft survival
- Photo tap-to-expand production mismatch
- Coaching Updates delivery-time UI cleanup

GitHub protocol

Claim/complete through established inbox protocol.
Any terminal blocker requiring Founder action is a mandatory handoff publication point.

Report:
- root gap in prior one-to-one guard
- exact boundary rule
- candidate SHA/diff
- focused/full tests
- concurrency analysis
- independent review
- deployment/zero-write proof
- Activity/Nutrition state unchanged
- exact future canary procedure

Explicit flags:
ONE_TO_ONE_HK_TO_LOGGER_ENFORCED
ONE_TO_ONE_LOGGER_TO_HK_ENFORCED
RECREATED_UUID_CONFLICT_GUARDED
STALE_CANDIDATE_CONFLICT_GUARDED
CONCURRENT_CONFIRMATION_RACE_SAFE
BACK_TO_BACK_CLEAR_MATCH_SUPPORTED
BACK_TO_BACK_AMBIGUOUS_AUTO_LINK_DISABLED
TIE_ORDER_INDEPENDENT
WORKOUT_LOGGER_CONTENT_AUTHORITY_UNCHANGED
WORKOUT_PRODUCTION_ACTIVATION_ENABLED
HK_WORKOUT_V3_ELIGIBLE
TRAINING_EVENTS_CHANGED
ACTIVITY_NUTRITION_TESTDAY_UNCHANGED
SCHEMA_UNCHANGED
SERVER_HARDENING_REVIEW_APPROVED
SERVER_HARDENING_DEPLOYED
ZERO_WRITE_POSTDEPLOY_AUDIT_PASSED
READY_FOR_WORKOUT_CANARY_AFTER_ACTIVITY_NUTRITION_ACCEPTANCE

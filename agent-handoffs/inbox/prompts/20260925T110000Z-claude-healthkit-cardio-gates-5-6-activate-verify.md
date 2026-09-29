Task id: claude-healthkit-cardio-gates-5-6-activate-verify-20260925

Continue in the existing persistent HealthKit Founder Takeover Claude conversation. Reasoning: high.

Founder explicitly authorizes:
GATE 5 = fresh dry-run immediately followed by atomic APPLY of workout policy families strength -> [cardio,strength], only if every precondition remains exact.
GATE 6 = immediate post-apply read-only verification.

STOP after Gate 6. Do NOT reconcile any historical deferred workouts yet.

Founder context:
- Founder will do NO workouts today (Sep25), so no same-day prospective Cardio workout is expected for empirical type-fidelity testing.
- Founder expects workouts tomorrow.
- The prior Sep23/24 deferred walks may be used after Gate 6 for the separately-authorized historical reconciliation gates; they are appropriate for testing Cardio canonicalization/presentation/accounting, but because their stored payloads lack isIndoorWorkout they CANNOT validate prospective Indoor-vs-Outdoor fidelity.
- The first new post-activation Apple Watch Cardio workout with isIndoorWorkout metadata will be the empirical validation of specific Indoor/Outdoor fidelity.

Read first:
agent-handoffs/STANDING_DISK_SAFETY.md
agent-handoffs/latest.json
agent-handoffs/latest.md
agent-handoffs/reports/20260925T155000Z-healthkit-cardio-gates-3-4-refresh-and-policy-dryrun.md
agent-handoffs/reports/20260925T033000Z-healthkit-cardio-graduation-readiness.md

Expected authority, reverify:
Production Server e88b8ef78fa236ce09660997f4084bde069018a7
Deployment 9727de79-588e-4445-9306-53b0ee26971e ACTIVE
Build60 accepted on Founder device
Current workout policy families [strength], version 3, digest dc7ba152cf5e9dd528e380bed6bc0366
Current deferred Cardio backlog exactly 4
Do not rely blindly on these; fresh-read everything immediately before apply.

GATE 5 — FRESH DRY-RUN + ATOMIC APPLY

1. Reverify exact Server authority/health/migration state.
2. Re-read exact workout policy and complete deferred-Cardio inventory.
3. Require backlog remains exactly the same four known deferred cardio/walking observations and no new unexpected workout observation exists. If changed, STOP and report; do not apply under stale authorization.
4. Run a FRESH atomic replace-families dry-run:
   current exact [strength] -> target exact [cardio,strength].
5. Build the apply --expected snapshot from THAT fresh dry-run's current facts/digests. Do not reuse Gate4 stale expected facts.
6. Require dry-run outcome exactly dry_run and predicted mutation limited to:
   - workout policy update;
   - one audit row.
7. Preserve every non-family policy field exactly:
   - domains workout;
   - status enabled;
   - effectiveLocalDate 2026-09-23 unless fresh policy proves otherwise;
   - endLocalDate null;
   - openEnded true;
   - strategicEvidenceEligibility quarantined;
   - historicalBackfill false;
   - linkAutoConfirm false;
   - schema semantics unchanged.
8. Apply atomically using the reviewed replace-families runner, exact expected snapshot, and explicit Founder authorization reference tied to this chat authorization.
9. No deactivate/reactivate gap.
10. If runner returns drifted/refused or any precondition changes between fresh dry-run and apply, STOP. Rebuild; never force.

Gate5 expected result:
outcome applied
families exactly [cardio,strength]
policy version/audit metadata advance as designed
no other collection mutation.

GATE 6 — IMMEDIATE READ-ONLY POST-APPLY VERIFICATION

Using the guarded read-only production path, prove:
- workout policy families exactly [cardio,strength];
- policy enabled/openEnded;
- strategicEvidenceEligibility still quarantined;
- historicalBackfill false;
- linkAutoConfirm false;
- effective date/end date preserved;
- exactly one expected policy audit row added;
- Activity/Nutrition policy unchanged;
- four historical deferred walks remain deferred and uncanonicalized;
- canonical workout count/content unchanged by policy activation itself;
- Strength canonical workouts/links/claims unchanged;
- no Cardio Logger session/link/claim created;
- strategic evidence/Goal/Confidence/briefing/plan/protocol/training-record digests unchanged;
- migrations unchanged;
- production healthy;
- no unexpected error logs.

Prospective behavior after Gate 6:
- new Cardio workout observations are now eligible for canonicalization prospectively;
- family remains cardio;
- specific canonical type should preserve Apple's isIndoorWorkout metadata when present;
- no strategic eligibility;
- no Logger session or Strength relationship semantics for Cardio.

IMPORTANT TEST DISTINCTION

Historical Sep23/24 four:
Useful later for testing:
- bounded deferred reconciliation;
- canonical Cardio workout creation;
- Activity Detail workout rows;
- calorie decomposition/no-double-count;
- no Logger/link/claim;
- whole-day Activity invariance.

NOT useful for validating:
- Indoor Walk vs Outdoor Walk preservation, because their stored payloads lack isIndoorWorkout.

Tomorrow's first new Cardio workout:
Use as prospective empirical acceptance for:
- source Apple workout type/metadata retained;
- Indoor/Outdoor canonical/display type correct;
- automatic canonicalization under active Cardio policy;
- Activity Detail presentation;
- no Logger/link/claim;
- whole-day Activity accounting remains invariant.

Do not invent or backfill specific type on the historical four.

STOP CONDITIONS

Do not apply if:
- Server SHA/deployment/health differs;
- policy no longer Strength-only at fresh read;
- backlog no longer exactly the four authorized observations;
- fresh dry-run isn't exactly dry_run;
- target isn't exactly [cardio,strength];
- any non-family policy field would change unexpectedly;
- expected snapshot cannot be built from fresh facts;
- drift/refusal occurs;
- any mutation beyond policy + one audit row is predicted.

If apply succeeds but Gate6 finds any unexpected mutation, STOP immediately and report; do not reconcile workouts.

GITHUB

Publish timestamped HealthKit Gate5+6 report to agent-handoffs/reports/ on main and update HealthKit latest.json/latest.md.
Report exact new policy version/digest/audit reference, post-apply counts/digests, health, and the clear historical-vs-prospective testing distinction above.

STOP for Founder authorization before Gate7/8 historical reconciliation.

NOT AUTHORIZED

No deferred Cardio reconciliation.
No historical workout mutation.
No strategic eligibility change.
No historical backfill.
No auto-confirm.
No Server deployment.
No Native upload/device operation.
No historical briefing regeneration.

Flags:
AUTHORITY_REVERIFIED
FRESH_PREAPPLY_DRYRUN_PASS
FRESH_EXPECTED_SNAPSHOT_USED
GATE5_POLICY_APPLY_PASS
CARDIO_ACTIVATED
POLICY_FAMILIES_CARDIO_STRENGTH
NON_FAMILY_POLICY_FIELDS_PRESERVED
GATE6_POSTAPPLY_AUDIT_PASS
FOUR_DEFERRED_WALKS_STILL_DEFERRED
NO_CARDIO_LOGGER_LINK_CLAIM
STRATEGIC_STATE_UNCHANGED
PROSPECTIVE_CARDIO_CANONICALIZATION_ENABLED
HISTORICAL_WALKS_NOT_VALID_FOR_INDOOR_OUTDOOR_FIDELITY
TOMORROW_PROSPECTIVE_TYPE_FIDELITY_ACCEPTANCE_PENDING
DEFERRED_CARDIO_RECONCILED
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED

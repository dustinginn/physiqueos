Task id: claude-healthkit-cardio-gates-3-4-refresh-and-policy-dryrun-20260925

Continue in the existing persistent HealthKit Founder Takeover Claude conversation. Reasoning: high.

Founder has accepted Build 60 Strength behavior on device:
- Sep23 confirmed Strength detail PASS.
- Sep24 candidate Strength detail PASS.
- “This session could not be loaded” resolved.
- Candidate/confirmed semantics correct.

This task authorizes CARDIO GRADUATION GATE 3 + GATE 4 ONLY:
Gate 3 = fresh bounded read-only deferred-Cardio inventory + current policy/authority refresh.
Gate 4 = atomic workout-policy replacement DRY RUN ONLY.
No apply. No Cardio activation. No deferred reconciliation.

Read first:
agent-handoffs/STANDING_DISK_SAFETY.md
agent-handoffs/latest.json
agent-handoffs/latest.md
agent-handoffs/reports/20260925T033000Z-healthkit-cardio-graduation-readiness.md
agent-handoffs/reports/20260925T150000Z-midweek-v3-server-e88b8ef7-deployment-checkpoint.md
Build60 upload report if already published/available; otherwise use the established release authority:
Native Build60 release SHA 00321dcc6dd86a6479dbca5dd27e691c87348cd8, Apple delivery 23788859-48c2-4386-adb4-568a3a898adf, VALID.
Production Server e88b8ef78fa236ce09660997f4084bde069018a7, deployment 9727de79-588e-4445-9306-53b0ee26971e ACTIVE.

Reverify all current authority. Do not rely blindly on this prompt.

GATE 3 — FRESH BOUNDED INVENTORY / AUTHORITY REFRESH

Use the established guarded production read-only path.

Before any policy dry-run:
1. Reverify production Server exact e88b8ef7 on web+worker/runtime and healthy.
2. Reverify Build60 Founder acceptance status from handoff/report context; do not operate the phone.
3. Read current HealthKit workout activation policy:
   - exact policy id/version/digest;
   - current families;
   - effectiveLocalDate;
   - openEnded;
   - strategicEvidenceEligibility;
   - historicalBackfill;
   - linkAutoConfirm;
   - all other fields that atomic replace must preserve.
4. Freshly enumerate ALL Founder HealthKit workout observations from the relevant policy boundary through NOW that:
   - are currently deferred solely as family_not_in_activation_scope;
   - classify as family cardio under the currently deployed e88b8ef7 classifier.
5. Do not assume backlog count remains 4. Include any new Sep25+ cardio observations if present.
6. For each deferred observation report:
   - exact internal/raw identity retained for execution, but redact/hash it in public GH report;
   - localDate/timezone;
   - stored source activity/workout type;
   - isIndoorWorkout if retained;
   - classifier family + canonicalType;
   - start/end/duration;
   - active energy/telemetry available;
   - defer reason/state;
   - whether canonical workout already exists;
   - whether specific Indoor/Outdoor fidelity is recoverable.
7. Confirm historical known limitation:
   - Sep23/24 four legacy deferred walks may lack isIndoorWorkout and remain generic walking when reconciled;
   - DO NOT infer/fabricate Indoor/Outdoor from Founder memory, GPS, location, speed, or date.
8. Confirm any observations ingested after e88b8ef7 deployment preserve Apple-specific type when metadata exists.
9. Reverify strategic state and counts/digests needed for later invariants; zero writes.
10. Reverify Cardio is NOT already active.

If backlog/policy authority differs from the prior readiness package, rebuild the dry-run input from fresh facts. Do not use stale digests/identities.

GATE 4 — ATOMIC POLICY REPLACEMENT DRY RUN ONLY

After Gate 3 passes, prepare and execute ONLY the existing atomic workout-policy replace-families dry-run:
current exact families:[strength] -> target exactly [cardio,strength]

Bind to the FRESH Gate-3 policy digest/version/families and exact live Server SHA e88b8ef7.

Preserve every non-family field exactly, including:
- effectiveLocalDate;
- openEnded;
- strategicEvidenceEligibility remains quarantined/off as currently stored;
- historicalBackfill remains false;
- linkAutoConfirm remains false;
- Activity/Nutrition policy untouched;
- no strategic eligibility change.

Required dry-run behavior:
- zero production writes;
- outcome exactly dry_run;
- predicted resulting workout policy families exactly [cardio,strength];
- predicted audit row only;
- no observation/canonical workout/link/claim/evidence mutation;
- no deactivation/reactivation gap;
- no narrowing;
- no change to deferred observations;
- no Cardio canonicalization yet.

After dry-run, independently read production state again and prove:
- workout policy remains Strength-only;
- Cardio remains inactive;
- deferred observations remain deferred;
- canonical workouts/links/claims/strategic counts unchanged;
- no production data mutation occurred.

STOP CONDITIONS

STOP immediately and do not apply if:
- current policy is not exactly expected Strength-only state;
- policy digest/family precondition drift occurs;
- Server authority mismatch;
- dry-run outcome is not exactly dry_run;
- target families differ from exactly cardio+strength;
- any non-family policy field would change;
- any write/mutation is observed;
- any unexpected strategic eligibility/backfill/auto-confirm change is predicted;
- classifier unexpectedly reclassifies Strength/Cardio observations;
- bounded inventory cannot be proven complete.

GITHUB REPORTING

Publish a timestamped HealthKit Gate3+Gate4 report to agent-handoffs/reports/ on main and update HealthKit latest.json/latest.md because HealthKit owns this lane.
Do not expose raw observation UUIDs/PII in public report; use stable short hashes while retaining exact raw IDs only in the authorized local execution context for the later reconciliation gate.

Report:
- exact current production authority;
- Build60 accepted dependency;
- fresh deferred Cardio backlog count and date/type summary;
- current workout policy digest/families;
- exact policy dry-run predicted diff;
- zero-write proof;
- post-dry-run production state;
- whether Gate 5 APPLY is recommended;
- exact stop/abort conditions for Gate 5.

Then STOP for Founder authorization. Do NOT apply.

NOT AUTHORIZED

No workout-policy apply.
No Cardio activation.
No deferred workout reconciliation.
No strategic eligibility changes.
No historical backfill.
No auto-confirm.
No Native release/upload/device operation.
No Server deployment.
No production data mutation.

Flags:
AUTHORITY_REVERIFIED
BUILD60_STRENGTH_ACCEPTANCE_RECORDED
GATE3_INVENTORY_REFRESH_PASS
CURRENT_DEFERRED_CARDIO_COUNT
PROSPECTIVE_TYPE_FIDELITY_OBSERVED
WORKOUT_POLICY_STRENGTH_ONLY_CONFIRMED
CURRENT_POLICY_DIGEST_REFRESHED
GATE4_POLICY_DRYRUN_PASS
PREDICTED_TARGET_FAMILIES_CARDIO_STRENGTH
NON_FAMILY_POLICY_FIELDS_UNCHANGED
ZERO_WRITE_DRYRUN_PROVEN
POST_DRYRUN_POLICY_STILL_STRENGTH_ONLY
DEFERRED_OBSERVATIONS_UNCHANGED
STRATEGIC_STATE_UNCHANGED
GATE5_APPLY_RECOMMENDED
CARDIO_ACTIVATED
DEFERRED_CARDIO_RECONCILED
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED

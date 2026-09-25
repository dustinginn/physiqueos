Task id: claude-healthkit-cardio-historical-reconciliation-serial-20260925

Continue in the existing persistent HealthKit Founder Takeover Claude conversation. Reasoning: high.

Founder explicitly authorizes historical Cardio reconciliation for the four known Sep23/24 deferred walks, but ONLY through the previously reviewed strict serial safety sequence.

This task authorizes Gates 7, 8, and 9 for the four already-known deferred Cardio observations:
for EACH observation separately:
fresh read -> fresh dry-run -> apply -> immediate read-only verification -> only then move to the next observation.
After all four, run the full Activity/strategic invariant audit.

Do NOT batch dry-runs or applies. Do NOT reconcile any observation outside the exact fresh four-observation authorized set.

Read first:
agent-handoffs/STANDING_DISK_SAFETY.md
agent-handoffs/latest.json
agent-handoffs/latest.md
agent-handoffs/reports/20260925T155000Z-healthkit-cardio-gates-3-4-refresh-and-policy-dryrun.md
the Gate5+6 report referenced by latest.json/latest.md
agent-handoffs/reports/20260925T033000Z-healthkit-cardio-graduation-readiness.md

Expected authority, reverify:
Production Server e88b8ef78fa236ce09660997f4084bde069018a7
Deployment 9727de79-588e-4445-9306-53b0ee26971e ACTIVE
Workout policy version 4 with families exactly [cardio,strength]
Strategic eligibility quarantined; historicalBackfill false; linkAutoConfirm false
Exactly four legacy deferred cardio/walking observations remain from Sep23/24.
Do not rely blindly on this prompt; fresh-read before every mutation.

AUTHORIZED HISTORICAL SET

Only the four observations that were already present and explicitly inventoried before Cardio activation:
- Sep23: two deferred walking observations
- Sep24: two deferred walking observations
- each currently state workout_canonicalization_deferred / reason family_not_in_activation_scope
- none currently has a canonical workout
- none stores recoverable isIndoorWorkout metadata

Use exact raw observation identities only from the local authorized execution manifest/fresh production reads. Never publish raw UUIDs. Use stable short hashes in reports.

If the current deferred set is not exactly those same four identities/states, STOP and report before any reconciliation.

IMPORTANT TYPE RULE

Do not infer/fabricate Indoor/Outdoor for these four.
They canonicalize using only their stored trustworthy source data, expected generic canonicalType walking.
Founder knowledge that Sep23 were Outdoor and Sep24 Indoor is NOT source metadata and must not be written into canonical records.

Tomorrow/new prospective workouts are separate and will validate Indoor/Outdoor fidelity.

STRICT SERIAL RECONCILIATION

Order deterministically by localDate then start time, unless the reviewed runner requires another stable order. Record the order.

For observation 1:
1. Reverify Server/policy authority and exact observation state.
2. Capture pre-entry collection facts/digests.
3. Run the reviewed deferred-workout reconciliation runner in DRY RUN for EXACTLY this observation identity.
4. Require:
   - outcome exactly dry_run;
   - family cardio;
   - stored canonicalType expected walking/generic;
   - defer reason exactly family_not_in_activation_scope;
   - live policy includes cardio;
   - no existing canonical workout;
   - predicted creation exactly one canonical Cardio workout for this source identity;
   - no Training Logger session;
   - no Strength link;
   - no claim;
   - no strategic evidence;
   - no mutation outside this observation + its canonical workout/reconciliation state/audit semantics defined by the reviewed runner.
5. Build apply expected snapshot from THIS fresh dry-run. Never reuse an earlier entry's snapshot.
6. APPLY exactly this observation with explicit Founder authorization reference.
7. Immediately read-only verify:
   - exactly one canonical Cardio workout exists for this source identity;
   - observation reconciliation state advanced as designed;
   - idempotency/source identity preserved;
   - no duplicate;
   - no Logger session/link/claim;
   - no strategic evidence;
   - policy still [cardio,strength];
   - whole-day Activity total for affected date unchanged;
   - workout-energy attribution changes only by the canonicalized workout's retained active energy as designed;
   - non-workout energy remains max(total active - included known workout energy, 0);
   - no double-count;
   - unrelated dates/collections unchanged except expected audit/reconciliation artifacts.
8. Only if verification passes, proceed to observation 2.

Repeat the full fresh dry-run -> apply -> verify sequence independently for observations 2, 3, and 4.

COLLECTION-WIDE DRIFT FENCE

The runner hashes full observation/canonical collections. Activity/Nutrition sync may change those between operations.
Therefore:
- every entry gets a fresh dry-run immediately before its apply;
- expected facts come from that exact dry-run;
- if outcome is drifted/refused, STOP that attempt, refresh and rebuild; never force;
- after each successful apply, all later dry-runs MUST be refreshed because the canonical workout collection has intentionally changed;
- never precompute dry-runs for all four.

ACTIVITY ACCOUNTING INVARIANTS

Capture pre-reconciliation baseline and final post-four state for Sep23 and Sep24.

Whole-day canonical Activity totals MUST remain invariant:
- Sep23 current canonical whole-day total remains whatever fresh production read proves before reconciliation;
- Sep24 likewise.
Do not hardcode stale numbers as authority; report fresh values.

For each date:
- canonical Activity active calories and exercise minutes unchanged;
- canonical Cardio workouts now appear individually;
- workout calories are decomposition of the existing whole-day Activity total, not additions to it;
- each canonical workout contributes at most once;
- Strength contribution follows its confirmed-link semantics;
- Cardio contribution does not require Logger confirmation;
- non-workout calories = max(daily active total - known included canonical workout active energy, 0);
- no negative non-workout calories;
- no duplicate workout identity;
- total workout + non-workout decomposition reconciles to whole-day total within existing rounding rules;
- Activity history/detail revisions must remain semantically consistent.

TRAINING / STRATEGIC INVARIANTS

After all four:
- Strength canonical workouts unchanged;
- Strength links/claims unchanged;
- no Cardio Training Logger sessions;
- no Cardio Strength relationship links;
- no Cardio claims;
- workout policy still [cardio,strength];
- strategicEvidenceEligibility still quarantined;
- historicalBackfill false;
- linkAutoConfirm false;
- Goal/Confidence/briefing/plan/protocol/training-record strategic digests unchanged;
- no historical briefing regeneration;
- migrations unchanged;
- production healthy.

IDEMPOTENCY

After each successful reconciliation, run or prove the reviewed idempotency check/dry-run behavior for that exact observation. It must refuse/no-op rather than create a second canonical workout.
Do not perform a second mutating apply merely to test idempotency unless the runner's reviewed contract explicitly defines it as a safe no-op and the task's mutation scope permits it. Prefer dry-run/read proof.

STOP CONDITIONS

Stop immediately before the next mutation if:
- Server/policy authority changes;
- policy no longer exactly [cardio,strength];
- strategic quarantine/backfill/auto-confirm changes;
- authorized deferred identity set changes unexpectedly;
- current target observation no longer has the expected deferred reason/state;
- dry-run isn't exactly dry_run;
- classifier family isn't cardio;
- canonicalType attempts to invent indoor/outdoor;
- existing canonical workout unexpectedly exists before that entry;
- predicted Logger/link/claim/strategic evidence appears;
- drift/refusal cannot be resolved by a fresh read/dry-run;
- any post-entry Activity total changes;
- duplicate/double-count appears;
- any strategic digest changes unexpectedly.

If one entry fails verification after apply, STOP. Do not continue to remaining entries. Report exact state and do not attempt rollback unless separately authorized.

GITHUB

After all four and final audit, publish a timestamped HealthKit historical-Cardio-reconciliation report to agent-handoffs/reports/ on main and update HealthKit latest.json/latest.md.

Report:
- stable hashed identity/order for four entries;
- dry-run/apply outcome per entry;
- resulting canonical workout type/telemetry;
- Sep23/Sep24 whole-day Activity totals before/after;
- workout/non-workout decomposition before/after;
- no-double-count proof;
- no Logger/link/claim proof;
- strategic digest proof;
- policy post-state;
- health/migration state;
- explicit note that Indoor/Outdoor fidelity remains untested by these historical four and awaits a new prospective workout.

After successful reconciliation, recommend Founder real-device acceptance:
- Activity Detail Sep23 shows two historical Cardio workout rows;
- Activity Detail Sep24 shows two historical Cardio workout rows;
- they may display generic Walking/Cardio, which is EXPECTED;
- whole-day Activity totals remain unchanged;
- Strength detail remains healthy.

STOP after report. Do not perform tomorrow's prospective workout acceptance automatically; await the actual new workout/Founder observation.

NOT AUTHORIZED

No observations beyond the exact four.
No fabricated Indoor/Outdoor correction.
No strategic eligibility change.
No policy change.
No Server deployment.
No Native upload/device operation.
No historical briefing regeneration.
No unrelated production mutation.

Flags:
AUTHORITY_REVERIFIED
AUTHORIZED_FOUR_IDENTITIES_EXACT
SERIAL_RECONCILIATION_ORDER_RECORDED
OBS1_DRYRUN_PASS
OBS1_APPLY_PASS
OBS1_VERIFY_PASS
OBS2_DRYRUN_PASS
OBS2_APPLY_PASS
OBS2_VERIFY_PASS
OBS3_DRYRUN_PASS
OBS3_APPLY_PASS
OBS3_VERIFY_PASS
OBS4_DRYRUN_PASS
OBS4_APPLY_PASS
OBS4_VERIFY_PASS
FOUR_DEFERRED_CARDIO_RECONCILED
FOUR_CANONICAL_CARDIO_WORKOUTS_CREATED
WHOLE_DAY_ACTIVITY_TOTALS_INVARIANT
WORKOUT_NONWORKOUT_DECOMPOSITION_PASS
NO_DOUBLE_COUNT_PASS
NO_CARDIO_LOGGER_LINK_CLAIM
STRATEGIC_STATE_UNCHANGED
POLICY_CARDIO_STRENGTH_UNCHANGED
HISTORICAL_INDOOR_OUTDOOR_NOT_INFERRED
PROSPECTIVE_TYPE_FIDELITY_ACCEPTANCE_PENDING
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED

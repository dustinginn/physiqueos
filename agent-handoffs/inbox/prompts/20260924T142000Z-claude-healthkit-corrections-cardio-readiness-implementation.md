Task id: claude-healthkit-corrections-cardio-readiness-implementation-20260924

Continue the primary HealthKit lane in the existing persistent “HealthKit Founder Takeover” Claude conversation. Reasoning: high.

This authorizes CODE / TEST / REVIEW ONLY for the implementation phase described below. It does NOT authorize production deployment, TestFlight upload, policy mutation, Cardio activation, bounded production data reconciliation, or Founder-device operation.

Read first:
agent-handoffs/reports/20260924T181500Z-healthkit-activity-workout-cardio-reconciliation.md
agent-handoffs/latest.json
agent-handoffs/latest.md
agent-handoffs/CLAUDE_PHONE_HANDOFF.md
and the relevant reports linked from the forensic report.

Current authority expected unless reverified otherwise:
Production Server: f8c28700ae32c3a01b1859a988df5f8177a3dd0b
Deployment: b3e48c28-b002-4b5e-a48b-22acccba8093
Installed Native: Build 58, release fd7eed02add35bb9016dcd873018cd0c4ef43265
Native reviewed lineage: 19cbfa10740c0ff5d10e638b57883027349c4b31
Reverify before implementation and preserve concurrent-worktree safety.

Accepted forensic conclusions:
1. Sep23 Activity canonical data is healthy: revision 51/51, complete_day, ~782.7 active cal / 107 min. The planned Sep23 device repair is CANCELLED / NOT REQUIRED.
2. Sep23 history-vs-detail divergence is a Native cache/read-key consistency defect. Fix presentation/read behavior; do not mutate Sep23 Activity data.
3. Sep24 current-day Activity/Nutrition automatic sync is accepted healthy and must not regress.
4. Sep24 Apple Health workout identities are distinct and correct:
   - Indoor Walk #1 11:04–11:22, ~17:47, 157 active cal
   - Strength 11:22–11:50, ~27:58, 206 active cal, HR 120
   - Indoor Walk #2 11:50–12:06, ~16:27, 188 active cal
5. Both walks are stored and deferred with family_not_in_activation_scope; they are not lost and are not merged into Strength.
6. The 94-minute Strength display originates from frozen Logger synthetic timing caused by the commit-instant fallback when finishedAt was absent. The actual HK Strength telemetry is correct. Do not rewrite historical evidence merely to hide this.
7. Cardio classification and structural non-Logger behavior already exist, but safe graduation is blocked by:
   - no atomic policy widen;
   - already-deferred observations are never automatically reconsidered;
   - correct Activity no-double-count derivation exists but is not wired into live presentation.

Implementation goals:

PART A — Native Activity day cache/read consistency

Fix the smallest proven Native defect so Activity Day Detail and Recent Activity History cannot resolve different revisions for the same owner/date after an automatic HealthKit update.

Primary areas from forensic audit:
- ActivityDayView.swift
- ProductionDailyDriverAPI.swift
and focused cache/request infrastructure as required.

Requirements:
- one canonical cache identity for Activity owner+localDate regardless of landing/detail entry path, OR another minimal architecture that proves equivalent consistency;
- opening Activity Day Detail after history refresh must not return an older revision;
- pull-to-refresh/detail refresh must invalidate/reload the correct date-scoped entry;
- no cross-date contamination;
- no Nutrition cache regression;
- no change to Server Activity canonicalization or current-day sync behavior;
- Sep23 production-shaped fixture: history/detail both resolve revision 51 / 782.7-ish / 107, never revision 50 / 606 / 102 after revision 51 is observed;
- race/coalescing regression: an older in-flight response cannot overwrite a newer revision in cache;
- offline behavior must not silently downgrade a newer cached revision to an older one.

PART B — Strength telemetry/presentation ownership

Implement the smallest Server/presentation correction so a Logger session’s synthetic timing fallback is never presented as if it were Apple Health workout telemetry when a discrete canonical HK Strength workout exists.

Do NOT mutate the frozen Sep24 evidence package in this task.

Requirements:
- Apple Health provenance block uses canonical HK workout start/end/duration/active energy/HR when available;
- Logger exercises/sets/reps/load remain attached and authoritative for structured training detail;
- synthetic Logger end_time/duration_seconds may remain as immutable historical evidence but must be explicitly treated as Logger-context/synthetic, not HK telemetry;
- if no confirmed link exists, do not invent one;
- if relationship/candidate association is needed to choose a matching HK workout for presentation, use Server-owned deterministic identity/window logic and expose uncertainty honestly; do not have Native guess;
- no Indoor Walk can be selected as Strength;
- no synthetic Logger end time is created/rewritten;
- Sep24 production fixture must present HK Strength ~11:22–11:50 / ~28 min / 206 active cal / HR120 while preserving the Logger exercises;
- Sep23 prior accepted Strength case must not regress;
- no change to Confidence/strategic eligibility.

PART C — Safe atomic Workout policy scope replacement

Do NOT activate Cardio. Implement and review the missing capability required to widen the enabled workout policy safely without a deactivate/reactivate gap.

Design the smallest atomic Server/operations mechanism that replaces an enabled workout policy scope in ONE guarded transaction, preserving policy auditability and invariants.

Target future replacement:
current Strength-only -> families exactly [cardio,strength]
while preserving:
- effectiveLocalDate 2026-09-23 unless explicit future authorization says otherwise;
- openEnded true;
- strategicEvidenceEligibility quarantined;
- historicalBackfill false;
- linkAutoConfirm false.

Requirements:
- no disabled-policy gap visible to ingestion;
- one transaction / advisory lock / drift fence;
- explicit old-policy digest/version precondition;
- exact family-set authorization;
- refuse narrowing/expansion beyond explicitly authorized target;
- other daily Activity/Nutrition policy untouched;
- canonical workouts, links, claims, evidence, strategic collections untouched by policy replacement itself;
- dry-run predicts exact mutation;
- apply requires explicit authorization reference/token;
- idempotent replay produces zero writes;
- rollback on any invariant failure;
- audit row records old/new digests and authorization reference;
- production runner/entry tooling supports dry-run without mutation.
Do not run apply in production in this task.

PART D — bounded deferred Cardio reconciliation runner

Implement but DO NOT execute a new narrowly-scoped dry-run/apply runner for already-stored workout observations deferred solely because family_not_in_activation_scope.

Initial acceptance scope must be able to hard-bind to the two known Sep24 Indoor Walk observation identities from the forensic report; no broad historical sweep.

Requirements:
- accepts exact authorized observation identities only;
- each observation must already exist and have reconciliation reason family_not_in_activation_scope;
- current live workout policy must now include family cardio before apply can proceed;
- re-run canonicalization eligibility under current policy without re-ingesting or altering source identity;
- create exactly one canonical cardio workout per authorized deferred observation;
- preserve UUID/external identity/start/end/duration/energy/HR/source/device provenance;
- update the observation reconciliation state to canonicalized in a traceable way;
- Cardio creates NO Training Logger session, NO Strength link row, NO claim row, NO auto-confirm, NO strategic eligibility;
- two walks remain distinct from each other and from Strength;
- dry-run predicts exact canonical ids/mutations and writes nothing;
- apply requires explicit authorization reference;
- idempotent replay = zero additional writes;
- drift fence against policy/version, observation digests, existing canonical workout set, links/claims, strategic state;
- bounded post-apply invariants;
- refuse any observation with a different defer reason or family;
- refuse already-canonicalized identity unless returning explicit already_reconciled/no-op;
- no date-range/bulk mode in V1.
Do not execute against production in this task.

PART E — Cardio Activity attribution/presentation wiring

Implement the minimum Server read/presentation plumbing needed so, AFTER cardio is canonicalized in a future authorized step, Activity Detail can attribute canonical workout calories without double counting the whole-day Activity total.

Use the existing composeDailyActiveEnergyWithWorkouts model where appropriate rather than re-inventing arithmetic.

Desired semantics:
whole-day active calories = canonical daily Activity total and never increases merely because workouts canonicalize.
workout calories = sum of eligible canonical HealthKit workout active energy for that local day that the presentation contract includes.
non-workout active calories = max(whole-day active calories - workout calories, 0), with explicit handling for missing workout energy.
Strength + Cardio can both contribute to workout calories.
No workout energy is added on top of the daily total.
Cardio presentation does not create Logger sessions.
Activity Detail should be able to show linked/included workouts as distinct rows with type/family/time/duration/energy/provenance as appropriate.

Important:
- If current Strength presentation today derives workout calories exclusively through Logger-linked sessions, migrate carefully to a canonical-workout-aware attribution contract without double counting a Strength workout that also has a Logger relationship.
- one canonical workout identity may contribute energy at most once;
- missing energy must remain unknown/pending, never silently zero if that changes arithmetic meaning;
- do not change the daily canonical Activity record.

PART F — review whether Log should expose Cardio

Audit the current Log/Evidence product contract while implementing E. If canonical Cardio needs a minimal visible surface for Founder acceptance, implement the smallest Server-owned read contract + Native rendering that shows the two cardio workouts as Apple Health-sourced workout entries without pretending they are structured Training Logger sessions. If existing Evidence/Activity Detail is the better canonical surface, document why and do not add redundant Log UI. Avoid scope creep.

Testing required:

Native:
- Sep23 history/detail cache parity at revision 51;
- stale in-flight response cannot overwrite newer revision;
- pull-to-refresh date-scoped reload;
- no cross-date contamination;
- Nutrition unaffected;
- iPhone 17 Pro simulator only.

Server/presentation:
- cardio→strength→cardio fixture preserves three workout identities;
- Strength HK telemetry wins for HK telemetry presentation;
- Logger exercises remain;
- synthetic Logger duration never masquerades as HK duration;
- Indoor Walk never selected as Strength;
- Sep23 Strength regression green;
- strategic eligibility unchanged.

Atomic policy replacement:
- dry-run exact mutation;
- apply transactional;
- no disabled gap;
- wrong old digest/version refuses;
- wrong family target refuses;
- other policy untouched;
- idempotent replay zero writes;
- rollback mutation tests.

Deferred reconciliation:
- exact two-identity fixture;
- wrong defer reason refuses;
- cardio not in live policy refuses;
- dry-run zero writes;
- apply creates one canonical workout each and no links/claims/Logger;
- distinct identities preserved;
- replay no-op;
- unrelated workout/policy/strategic digests unchanged.

Activity attribution:
- daily total invariant before/after canonicalizing cardio;
- workout calories include canonical Strength + Cardio exactly once each;
- non-workout = daily total minus known included workout energy;
- no double count for Logger-linked Strength;
- missing workout energy handled explicitly;
- no negative non-workout result.

Run focused suites, mutation-test critical guards, then relevant full Server/Native suites.
Run a real production-shaped webpack build for any Server candidate before declaring release-ready; node --check alone is insufficient.
Fresh-context independent adversarial review exact final Server and Native candidates.

Worktree/concurrency:
Claude currently owns HealthKit. Use the existing Native and Server HealthKit worktrees where appropriate and preserve clean lineage. Do not touch Midweek Codex/Claude worktrees. If a new isolated worktree is genuinely required, create it from exact current authority and document why.
Do not merge unrelated Midweek Native work into this HealthKit candidate.

Release/mutation gates:
This task authorizes implementation/test/review only.
DO NOT:
- deploy Server;
- archive/upload TestFlight;
- mutate workout policy;
- activate Cardio;
- run deferred reconciliation in production;
- mutate Sep23 Activity;
- mutate the frozen Sep24 Logger evidence package;
- operate Founder phone;
- change strategic eligibility;
- regenerate briefings.

At completion:
Publish a timestamped implementation/review report to agent-handoffs/reports/ on main.
Update latest.json/latest.md.
Report exact Server and Native candidate SHAs, tests, mutation evidence, production-build result, fresh-review verdict, and a recommended ordered release/activation plan with separate authorization gates.

Preferred future release/activation sequence if implementation is clean:
1. deploy Server code/presentation + atomic policy replacement capability + deferred reconciliation capability + Activity attribution read path;
2. release Native cache/presentation changes;
3. real-device acceptance of Sep23 detail consistency + Sep24 Strength presentation;
4. dry-run atomic policy replacement Strength-only -> [cardio,strength], then separate Founder authorization to apply;
5. apply policy replacement and verify;
6. dry-run exact two-walk deferred reconciliation, then separate Founder authorization to apply;
7. apply and verify two Cardio workouts;
8. real-device acceptance of Activity workout/non-workout attribution and chosen Cardio visible surface;
9. only after all above, consider strategic eligibility changes (not part of this task).

GitHub publication rule:
Every substantive chunk must be published before called complete. Claude owns primary HealthKit latest.json/latest.md. If publication fails, say REPORT NOT PUBLISHED.

Persistent phone session:
Remain in the existing HealthKit Founder Takeover Claude conversation under the proven --bg --remote-control host. Do not create a new conversation.

Immediate next step:
Reverify authority and overlap, then implement A+B first with focused tests. Proceed to C+D+E only after A+B are green and architecture remains consistent with the forensic findings. Publish checkpoints as substantive chunks complete. Stop after final review for Founder release authorization.

Flags:
AUTHORITY_REVERIFIED
SEP23_REPAIR_CANCELLED
NATIVE_ACTIVITY_CACHE_FIX_IMPLEMENTED
NATIVE_ACTIVITY_CACHE_PARITY_PASS
STRENGTH_TELEMETRY_PRESENTATION_FIX_IMPLEMENTED
STRENGTH_SYNTHETIC_DURATION_NOT_HK_PASS
ATOMIC_WORKOUT_POLICY_REPLACE_IMPLEMENTED
ATOMIC_POLICY_DRYRUN_PASS
DEFERRED_CARDIO_RECONCILIATION_RUNNER_IMPLEMENTED
DEFERRED_RECONCILIATION_DRYRUN_PASS
CARDIO_NO_LOGGER_LINK_CLAIM_PASS
ACTIVITY_CANONICAL_WORKOUT_ATTRIBUTION_WIRED
ACTIVITY_DAILY_TOTAL_INVARIANT_PASS
CARDIO_VISIBLE_SURFACE_DECIDED
NATIVE_TESTS_PASS
SERVER_TESTS_PASS
MUTATION_TESTS_PASS
PRODUCTION_WEBPACK_BUILD_PASS
FRESH_CONTEXT_REVIEWED
SERVER_DEPLOYED
TESTFLIGHT_UPLOADED
POLICY_MUTATED
CARDIO_ACTIVATED
DEFERRED_CARDIO_RECONCILED
PRODUCTION_DATA_MUTATED
GH_REPORT_PUBLISHED

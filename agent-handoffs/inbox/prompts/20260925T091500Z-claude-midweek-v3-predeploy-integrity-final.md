Task id: claude-midweek-v3-predeploy-integrity-final-20260925

Continue in the existing persistent Midweek Briefing Founder Takeover Claude conversation. Reasoning: high.

This task authorizes CODE / TEST / REVIEW / GH REPORTING ONLY for two final pre-deploy integrity corrections identified by the read-only production precheck and final review. Do NOT deploy, archive/upload Native, mutate production, activate Cardio, or regenerate historical briefings.

Read first:
agent-handoffs/reports/20260925T083000Z-midweek-v3-release-blockers-final.md
the timezone precheck report on branch claude/midweek-v3-timezone-precheck-report-20260925 at agent-handoffs/reports/20260925T140000Z-midweek-v3-timezone-authority-readonly-precheck.md
agent-handoffs/STANDING_DISK_SAFETY.md

Current final candidates before this task:
Server 092011cc829378c757b827f0cf66d947a5c52271
Native 2374e11aa707ba4124378958ace429ffd781feba

Founder/orchestrator decisions:
1. DO NOT deploy 092011cc yet.
2. Review note N2 is a release blocker and must be fixed.
3. The timezone authority split found by the production precheck should be fixed now while this architecture is still being finalized, rather than knowingly shipping a future-user trap.
4. Review note N3 is ACCEPTED as a fail-safe behavior: an unexpected non-coverage programming/configuration exception may continue to fail closed without a hard-deadline escape. Do not turn unknown programming errors into forced publication. Ensure it is operationally visible.
5. A real-Postgres two-worker concurrency run is NOT required before this deploy. Keep the deterministic concurrency coverage and document the remaining infrastructure limitation.
6. Native 2374e11a remains unchanged unless a Server contract change unexpectedly requires Native work; avoid another full Native run otherwise.

FIX A — eliminate settlement snapshot/readiness race (review N2)

Current problem:
The cadence tick reads a HealthKit evidence overlay/snapshot once, while settlement coverage can be re-read later in the same tick. If the canonical HealthKit state advances between those two reads, the gate can declare readiness at revision N while the generator freezes an older evidence snapshot N-1. That can produce a watermark that says evidence was settled while the actual frozen briefing omitted the newly-settled revision.

Required invariant:
The evidence snapshot used to generate/freeze a briefing and the readiness/watermark facts authorizing that generation must come from one coherent settlement view.

Implement the earliest-correct solution. Preferred patterns:
- derive settlement coverage/readiness directly from the same canonical evidence snapshot that will be frozen; OR
- after readiness changes to satisfied, refresh/rebuild the evidence overlay once and derive the final readiness + watermark + generator inputs from that refreshed coherent snapshot before publication.

Do not accept a design where readiness is based on a later revision than the actual artifact inputs.

Requirements:
- one coherent evidence/revision set drives readiness decision, watermark canonical record/revision identities, and generator inputs;
- if evidence advances again after the coherent snapshot is captured, it may remain for the next current-Evidence revision; it must not retroactively mutate the already-frozen artifact;
- fail-closed read-error behavior remains intact;
- ordinary background sync can satisfy readiness;
- hard deadline behavior remains intact;
- no duplicate generation;
- avoid unbounded repeat-refresh loops. At most one deterministic reconciliation refresh per attempt unless existing architecture has a safer bounded primitive.

Required tests:
- overlay at rev N-1, coverage advances to N before gate: generator must either refresh to N and watermark N, or stay consistently at N-1/not-ready; never watermark N with N-1 artifact inputs;
- evidence advances after final coherent snapshot: artifact/watermark remain internally consistent and immutable;
- recovery from a coverage read error then settlement still uses coherent snapshot;
- hard deadline uses one coherent best-available snapshot and marks unresolved state honestly;
- two-worker modeled race retains one coherent artifact/watermark;
- Part F historical immutability and 3/3 final-day fixtures remain green.

FIX B — unify canonical recurring-briefing timezone authority

Production precheck proved:
- stored coachingUpdates.timeZone = America/Los_Angeles;
- user.timeZone is absent;
- scheduler currently resolves coachingUpdates.timeZone first;
- Midweek/Weekly/Monthly generators independently use user.timeZone ?? America/Los_Angeles;
- they match today only because the explicit stored coaching timezone equals the generator hard-coded default.

This split is unsafe for future users and could create different cadence/window days near midnight if a user has a non-default coaching timezone.

Required invariant:
Recurring briefing cadence eligibility, evidence window construction, settlement policy, generator window, and persisted evidenceSettlement watermark must all use ONE canonical recurring-briefing timezone authority.

Use the existing schedule/coaching-updates timezone authority as the source of truth unless source inspection proves a better already-canonical abstraction. Do not use transient device/travel timezone for recurring strategic briefing windows.

Requirements:
- scheduler and Midweek/Weekly/Monthly generators receive/use the same resolved canonical timezone;
- resolution should preserve current precedence semantics: explicit coaching-updates timezone first, then appropriate stored user fallback, then product default only as final fallback;
- no generator-local hard-coded fallback chain that can diverge from scheduler;
- evidenceSettlement watermark records the exact same timezone authority used to build the window;
- current Founder production behavior remains America/Los_Angeles;
- travel/device timezone cannot silently change strategic briefing windows;
- Monthly remains day 1;
- DEXA/Photo/event-driven briefings are not unintentionally forced into this recurring cadence timezone policy if their semantics differ.

Required tests:
- explicit coaching timezone different from user timezone: scheduler + Midweek + Weekly + Monthly all build identical date windows using coaching timezone;
- coaching timezone absent, user timezone present: all share user timezone;
- both absent: all share product default;
- DST fall-back and spring-forward boundaries;
- travel/device timezone input does not alter recurring strategic window;
- watermark timezone equals actual generator window timezone;
- current Founder production-shaped America/Los_Angeles fixture unchanged;
- Monthly day-1 invariant preserved.

N3 ACCEPTED FAIL-SAFE

Do not change the intentional fail-closed behavior for unexpected non-coverage gate exceptions merely to guarantee a deadline publication. Unknown programming/config errors should not force a potentially-invalid strategic artifact.

Confirm:
- exception is logged/observable with non-PII reason code/error class;
- repeated failure cannot create duplicate artifacts;
- it does not mutate production state apart from ordinary safe operational logging;
- report it as accepted fail-safe behavior, with future alerting/ops work if appropriate.

REAL POSTGRES CONCURRENCY

Do not add disproportionate infrastructure work in this task. The absence of a disposable Postgres harness is accepted for this release, provided:
- existing deterministic executor/repository/publication concurrency tests remain green;
- advisory-lock code path is unchanged unless Fix A/B requires it;
- the limitation is explicitly retained in the final report.
No production database may be used for concurrency testing.

VALIDATION

After fixes:
- rerun directly affected suites;
- rerun Part F 71/71 production-shaped acceptance;
- rerun relevant settlement/timezone/cadence/energy/HealthKit suites;
- mutation-test the coherent-snapshot guard and canonical-timezone guard RED then GREEN;
- run exact final Server production webpack build:
  NEXT_PHASE=phase-production-build npm run build -- --webpack
- fresh-context adversarial review exact final Server candidate, explicitly inspecting Fix A and Fix B plus preservation of HealthKit c58dcca9 and Cardio readiness tooling.

Native:
If Native source remains 2374e11a, do not rerun the full suite. Carry forward the existing clean run/review. If Native source changes unexpectedly, obey disk rule and revalidate appropriately.

DISK

Read and obey agent-handoffs/STANDING_DISK_SAFETY.md. Current free space was ~17 GiB. Webpack is permitted above the 15 GiB floor; do not start a heavy Native build/archive below the preferred 20 GiB reserve.

GITHUB

Publish the timezone precheck report to main as a read-only predeploy checkpoint.
At completion publish a NEW superseding final predeploy report to agent-handoffs/reports/ on main. Midweek remains secondary lane: do not overwrite HealthKit latest.json/latest.md.

Include:
- exact final Server SHA;
- Native SHA;
- coherent settlement snapshot solution;
- canonical timezone solution;
- N3 accepted disposition;
- tests/mutations;
- webpack result;
- fresh-review verdict;
- disk compliance;
- explicit no-deploy/no-upload/no-production-mutation statement.

STOP after final reviewed report for Founder deployment authorization.

Flags:
AUTHORITY_REVERIFIED
TIMEZONE_PRECHECK_PUBLISHED
SETTLEMENT_COHERENT_SNAPSHOT_PASS
WATERMARK_INPUT_REVISION_CONSISTENCY_PASS
CANONICAL_BRIEFING_TIMEZONE_UNIFIED
FOUNDER_LA_TIMEZONE_BEHAVIOR_PRESERVED
TRAVEL_TIMEZONE_DOES_NOT_CHANGE_STRATEGIC_WINDOW
MONTHLY_DAY1_UNCHANGED
N3_FAIL_CLOSED_ACCEPTED
DETERMINISTIC_CONCURRENCY_PASS
REAL_POSTGRES_CONCURRENCY_DEFERRED
PART_F_71_TESTS_PASS
MUTATION_GUARDS_PASS
PRODUCTION_WEBPACK_BUILD_PASS
HEALTHKIT_TYPE_FIDELITY_PRESERVED
CARDIO_READINESS_TOOLING_PRESERVED
NATIVE_2374E11A_UNCHANGED_OR_REVALIDATED
FRESH_CONTEXT_SERVER_REVIEWED
SERVER_DEPLOYED
TESTFLIGHT_UPLOADED
PRODUCTION_MUTATED
FINAL_GH_REPORT_PUBLISHED

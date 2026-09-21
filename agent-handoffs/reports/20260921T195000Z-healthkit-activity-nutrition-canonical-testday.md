# healthkit-activity-nutrition-canonical-testday-20260921 - completion report

Task id: healthkit-activity-nutrition-canonical-testday-20260921

## Outcome

Server deployed and the controlled canonical test day is ACTIVATED for the Founder-local date 2026-09-21 (Activity + Nutrition, strategic eligibility quarantined, no historical backfill). Native Build 49 (1.0 (49)) was required, archived, uploaded and processed VALID. The Founder now only needs to install Build 49 and tap one button (steps below). No health values appear in this report.

## Current-state map (before this task)

| HealthKit type | Native read | Transport | Server observation | Validation | Canonicalization | Evidence eligibility | V3 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Activity summary (move energy, exercise minutes, stand hours, steps, walking+running distance) | Build 47/48 canary, foreground, validation_only only | healthkit.observations.ingest.v1, 5 MiB bound | 10 raw validation_only rows (Sep 12-19, incl. Sep 19 partial->partial->complete revisions 1..3) | proven | permanently barred (validation_only) | not_assessed | none |
| Nutrition (dietary energy, protein, carbs, fat) | authorization requested, per-sample anchored streams existed but no daily total and no upload path | none | 0 rows | not proven | none (deferred in the Server foundation) | n/a | none |
| Workouts | per-sample stream, not canary-driven | contract accepts | none in production | n/a | source-only / candidate, never Evidence | not_assessed | none |

Build 48 canary is hard-wired to validation_only and its readback guard requires canonicalized=false, so Build 48 cannot perform an operational sync. The activation policy record did not exist and no code path wrote it. Conclusion: PRIOR_HEALTHKIT_CANARY_SUFFICIENT=NO for this test. It proved Activity transport, identity and revision semantics; the operational path and Nutrition daily totals are new and needed Build 49. The Founder did NOT need to repeat the canary.

## Architecture decision (layers stay separate)

HealthKit source observation -> canonical PhysiqueOS day record in a new application-only collection healthKitCanonicalDays -> separate fail-closed eligibility policy (HealthKitEvidenceEligibilityPolicy, a reviewed constant, no runtime switch) -> V3/Confidence/briefings only after explicit later authorization. Same precedent the Server foundation already set for workouts: nothing HealthKit-derived is written to canonicalEvidenceObjects. Refusal guards were added at both strategic Evidence write entry points, which also closes the legacy non-Native activity-day.sync.v1 alias whose default source was HealthKit.

## Server changes (candidate a40c0b53c49240d5666d2a3475d48541cfd5f57e on production base ba250af1)

- New observation type nutrition_daily_total: HealthKit daily statistics across all sources for calories, protein_g, carbs_g, fat_g only (an unlisted nutrient is a contract violation); identity = bundle + type + external id + delivery device + device-scoped source revision, exactly like Activity summaries; no meal objects are ever created.
- Canonical days: one record per Founder-local date and domain, deterministic id, revision counter and semantic fingerprint (coverage participates), revision history, HealthKit provenance, activation snapshot, coexistence assessment. Precedence: complete_day outranks partial_day; same device newer revision wins; other device equal coverage keeps existing; exact replay is a no-op. Activity canonicalizes only the approved metrics and reports unrecognized keys instead of dropping them. Nutrition uses the source-neutral NutritionDay semantics: complete day = full_day_asserted device aggregate (high reliability), partial day = low-reliability partial subtotal.
- Coexistence with screenshot/manual: the Evidence store's day stays the only strategic authority and is never modified. Ingestion records consistent / conflict_surfaced / no_other_source with per-field deltas using the established Nutrition tolerance (calories 25, protein/carbs/fat 2) and rounding-level Activity tolerance; nothing is overwritten. A partial HealthKit snapshot that trails a fuller source is reported, not a conflict.
- Activation policy: record healthkit_canonical_daily_activation_policy (schema healthkit-canonical-activation-policy-v1): domains, exact inclusive date window of at most 7 dates, quarantined, historicalBackfill false. Fail-closed and never throws, so a bad policy can never become a permanent Native 400. Note the record id differs from the id named in the earlier handoff (healthkit_activity_activation_policy); the old id is not read.
- Only writer: HealthKitActivationPolicyRunner via scripts/operations/buildHealthKitPayload.mjs (dry-run, drift fence on expected facts, owner advisory lock, exactly one policy row plus one audit row, in-transaction verification, deactivate keeps all canonical history, refuses a window that already holds validation-only daily snapshots, never widens in place). Read-only acceptance audit payload built from the same domain code.
- No schema change (uses the existing generic record table); no infrastructure or cost change. Request bounds and tripwire tests updated to the new wire shape; 5 MiB bound unchanged.

## Native changes (candidate 2bfbf54ad105a3a18189e811f06afc421741a7da on accepted Build 48 bbb46e19)

Foreground-only, no launch or background behavior, entitlements and usage strings unchanged (dietary types were already in the read set). New stream nutritionDailyTotal (HealthKit statistics per local day, per-day fingerprint + device revision cursor, coverage part of the fingerprint so partial->complete with unchanged numbers is a new revision; absent macros omitted; a previously uploaded day that becomes empty is a zero-calorie revision). New exact-day operational path synchronizeCanonicalTestDay (single local date, today or up to 3 days back, cursor scope bound to the date, additions re-filtered to that date, deletions dropped, a pending validation_only batch is never resumed as operational). Test-day observation identities are namespaced (testday) so they can never collide with the validation-only canary's immutable-purpose identities. The Founder canary view gained a Controlled canonical test day card that shows what the Server canonicalized versus deferred (with the deferral reason) from the acknowledgement. Build 48 contract check is unchanged (the new type is advertised in a separate manifest field). Build 49 metadata bump is a separate commit.

## Tests, review, deployment

- Server: unit 8326 tests (+80 new), 298 failures identical to the pristine base (same set, zero new); phase2/3/4/5/6/6.photo/6.training/access-gate/foundation/migration-safety all equal to base with zero new failures; ESLint and diff check clean; production build succeeded with the exact SHA.
- Native: 1244 tests, 0 failures (16 new canonical test-day tests plus the existing HealthKit suites).
- Independent fresh-context review: first pass found no Server blockers (approve with follow-ups) and one Native blocker (partial->complete with identical values never re-emitted) plus identity-collision, surfacing and macro issues; all were fixed and re-reviewed. Delta re-review: Server APPROVE on the exact final SHA, Native APPROVE with non-blocking follow-ups on f5735476; afterwards only the Build 49 metadata bump and a view guard (disable canary and test-day buttons while either runs) were added, with the full Native suite re-run green on the final tree.
- Deployed with the Founder's chat authorization, via a fast-forward push of a40c0b53 to the production branch, app spec stamp, stale-commit spec deployment cancelled, force-rebuild deployment dda84642-c713-4091-a3a2-126e02345d3b ACTIVE, web and worker source a40c0b53, health live and ready 200. Zero-write audit: before and after digests identical (0 differing sections). Code deployment did not activate anything.
- Build 49: archived from the clean reviewed tree, guarded upload dry run passed every identity/signature/dSYM/monotonic guard, real upload with the Founder's authorization succeeded, delivery 67a72613-4bb5-44b3-955c-331949739412, processing state VALID. First real success of the API-key upload path.
- Preservation refs (non-force, new): origin claude/healthkit-canonical-testday-server and native/build49-candidate. main was not touched except this handoff.

## Activation (Founder-authorized in chat)

Condition set by the Founder: activate for the current date only if Build 49's first sync reads and reconciles the full current local day including samples from before activation. Verified in code and tests: the test-day sync queries the whole local-day window with HealthKit's day-to-date activity summary and cumulative statistics (not an anchored change feed) against a fresh per-date cursor, so the first sync emits revision 1 with everything logged so far regardless of when activation happened. Dry run predicted exactly two new rows and no historical effect; apply verified seven in-transaction invariants (exact policy, quarantined, no backfill, audit row, and observations, canonical days and Evidence unchanged). Policy: owner Founder, domains activity + nutrition, window 2026-09-21..2026-09-21, strategic eligibility quarantined, historical backfill off. Post-activation read-only audit: policy enabled, zero canonical days yet, zero HealthKit-derived records in strategic Evidence, zero strategic-eligible HealthKit records, no goal/confidence/briefing/plan/protocol/evidence collection changed versus the pre-deploy baseline.

## Founder action for the test day

1. Install Build 49 from TestFlight (it is VALID now).
2. You > server connection > HealthKit Founder Canary: turn on Enable this canary; tap Request Apple Health authorization once (harmless if already granted).
3. In Controlled canonical test day, keep the date at 2026-09-21 and tap Sync test day now. Expect Server canonicalized: Activity, Nutrition. If it shows a deferral reason instead, stop and tell the agent (do not tap again).
4. After midnight (any time from 00:00 on 2026-09-22, ideally before 03:00), open the same screen, set the date back to 2026-09-21 and tap Sync test day now once more. This sends the complete_day revision.
5. Use the phone normally. Log nutrition through the normal source; wear the Watch. Do not sync any other date (other dates are stored raw and permanently barred). Uploading screenshots or manual Activity/Nutrition for the day is optional: HealthKit lives in a separate quarantined store and conflicts are surfaced, never overwritten.
6. Say you synced; the agent then runs the read-only acceptance audit.

Build 49 requires one manual sync action (no background delivery in this slice by design).

## Later audit plan (a new task id is needed)

Recommend a new inbox task, e.g. healthkit-canonical-testday-acceptance-audit-20260922: run the read-only acceptance audit for 2026-09-20..2026-09-22 (payload builder kind audit, no-values) and compare strategic collection digests to the recorded pre-deploy baseline. Acceptance: one canonical Activity day and one canonical Nutrition day for 2026-09-21, no duplicates, revision history for the partial->complete change, correct local date, HealthKit provenance, coexistence state recorded, zero HealthKit-derived strategic Evidence, zero strategic-eligible HealthKit records, briefings/Confidence/Goal unchanged. Then the Founder decides whether to deactivate the policy (safe and reversible; canonical history is kept) or authorize the next slice.

## Flags

PRIOR_HEALTHKIT_CANARY_SUFFICIENT=NO (Activity validation transport proven; operational path and Nutrition needed Build 49)
ACTIVITY_CANONICALIZATION_READY=YES
NUTRITION_CANONICALIZATION_READY=YES
ACTIVITY_TESTDAY_ACTIVATED=YES (2026-09-21)
NUTRITION_TESTDAY_ACTIVATED=YES (2026-09-21)
HISTORICAL_BACKFILL_DISABLED=YES
HEALTHKIT_ACTIVITY_V3_ELIGIBLE=NO
HEALTHKIT_NUTRITION_V3_ELIGIBLE=NO
CONFIDENCE_IMPACT_ENABLED=NO
WORKOUT_LOGGER_AUTHORITY_UNCHANGED=YES
NUTRITION_DAILY_TOTAL_AUTHORITY_PRESERVED=YES
THREE_AM_LATE_SYNC_COMPATIBLE=YES (proven by tests: observed date owns the day; a live 03:00 crossing is not exercised tonight because no briefing is due at 03:00 on 2026-09-22; the first cadence run is Wed 2026-09-23)
SERVER_DEPLOYED_IF_REQUIRED=YES
NATIVE_BUILD_REQUIRED=YES (Build 49 uploaded, VALID)
PRODUCTION_ACTIVATION_MUTATION_APPLIED=YES
READY_FOR_CONTROLLED_TEST_DAY=YES (waiting on the Founder installing Build 49 and syncing)
FOLLOWUP_AUDIT_REQUIRED=YES

## Risks, findings, and follow-ups

- Server never reconsiders an existing raw observation, so a premature sync (before activation) would be stored as deferred; activation was applied before Build 49 was announced, and the new coverage-in-fingerprint rule means a later complete-day revision would still canonicalize. The app now shows deferrals.
- Reviewer follow-ups (non-blocking): the canonicalization ledger is not scope-tagged; app reinstall or cursor-store loss restarts test-day revisions at 1 and could hit an identity-collision 409 that Native treats as permanent (add a durable revision floor before any wider rollout); test-day and any future un-namespaced operational Activity streams would have independent revision counters (resolve before background delivery); a superseded acknowledgement shows as nothing new.
- Canonicalization bumps the canonical runtime revision like every other Native command (can only add a stale-revision retry for a concurrent editor near 03:00; it never reads or changes briefing content).
- Nutrition complete_day means the calendar day ended, not that logging was complete; treat it carefully at any later promotion. An emptied day becomes a zero-calorie record.
- A one-day window is sufficient because the observed date owns the day; there is no wall-clock expiry, so deactivation is manual.
- Open older hardening items are unchanged: pre-auth 5 MiB parse cost and Native treating HTTP 400 as permanent.
- Process notes: one uncommitted-work loss (a stray git checkout) was repaired by re-applying from context, no effect on candidates; phase7B reference-index test failure is pre-existing on the production base.

# healthkit-testday-first-sync-audit-20260921 - completion report

Task id: healthkit-testday-first-sync-audit-20260921

Verdict: GREEN. Read-only audit; nothing was patched, deployed, activated, deactivated, resynced or written. All production access used the bounded READ ONLY / REPEATABLE READ path with transaction_read_only verified on, owner-scoped selects, explicit rollback.

## Authority (reverified live)

Production Server a40c0b53c49240d5666d2a3475d48541cfd5f57e, deployment dda84642-c713-4091-a3a2-126e02345d3b ACTIVE (web and worker), no in-progress deployment, health live and ready 200, runtime build id physiqueos-a40c0b53-20260921. Production branch head a40c0b53. Native Build 49, source 2bfbf54ad105a3a18189e811f06afc421741a7da (ref native/build49-candidate). Schema unchanged (000014).

## Audit 1 - activation policy

Record healthkit_canonical_daily_activation_policy, version 1, schema healthkit-canonical-activation-policy-v1: status enabled, domains activity + nutrition, window 2026-09-21 through 2026-09-21 only, strategicEvidenceEligibility quarantined, historicalBackfill false. There is no Confidence control in the policy (Confidence impact is structurally off). Exactly one audit row (action activate, reference recorded, before state absent). Exactly two rows in the configuration collection (policy + audit): no broader owner, date or domain window exists.

## Audit 2 - raw observation lineage (first sync, 12:49 PM local)

Both observations operational purpose, observed local date 2026-09-21 (America/Los_Angeles), first received 19:49:48Z / 19:49:49Z (ingestion time is separate from the effective day). One raw row each; source com.apple.Health; one delivery device; device-scoped source revision 1; partial_day coverage; external ids activity-summary:testday:2026-09-21 and nutrition-daily-total:testday:2026-09-21 (the test-day namespace). Accepted exactly once (created), each row at version 2 because the reconciliation was stamped after canonicalization. Total raw observations 12 = the 10 earlier validation-only rows (unchanged) + these 2. No pending state, no retries, no validation errors. Outbox unchanged versus baseline (774 succeeded, 12 dead, identical to before); no operation rows written since activation.

## Audit 3 - canonical Activity (quarantined store)

One canonical day, id healthkit_canonical_day_activity_2026-09-21, version 1, revision 1, no history, no duplicate. Partial-day, complete_day not yet. Basis healthkit_activity_summary_daily_total; provenance Apple Health / HealthKit / direct, bundle com.apple.Health. Contract fields canonicalized (as of the 12:49 partial snapshot): active (move) energy about 710 kcal, exercise about 98 min, stand 6 h, steps 5321, walking+running distance about 4.49 km; workout calories are not additive. Values match the submitted observation exactly (canonical current values equal the raw observation measurement). No screenshot or manual Activity exists yet for 2026-09-21 (the latest Evidence Activity day is 2026-09-20), so coexistence is recorded as no_other_source, resolution none, Evidence store remains strategic authority.

## Audit 4 - canonical Nutrition (quarantined store)

One canonical day, id healthkit_canonical_day_nutrition_2026-09-21, version 1, revision 1, no duplicate. Daily totals as of the partial snapshot: calories about 1948, protein about 170 g, carbohydrates about 116 g, fat about 87 g (the macros are internally consistent with the calories, about 1.9k kcal by 4/4/9). All four macros are non-zero, so there is no absent-macro ambiguity. Basis healthkit_dietary_daily_statistics, Apple Health / HealthKit provenance, daily-totals scope partial_meal_subtotal, assertion partial_subtotal, low reliability, energy usable, energy completeness partial (expected for a current partial day; it becomes a full-day asserted device aggregate, high reliability, only when a complete_day revision arrives). Meal objects: 0, none fabricated. Daily totals are the authority on this path; meal detail is not required. Values match the submitted observation exactly. No MFP/manual/screenshot Nutrition exists for 2026-09-21 (latest is 2026-09-20), so coexistence is no_other_source.

## Audit 5 - idempotency state

Determined without writing, by running the production domain code in memory against the stored state. An identical replay of the first observation reproduces the same source observation identity and reconciles to a no-op (replay), revision stays 1, no duplicate. A later intraday change (device revision 2, partial) updates the same canonical day in place (revision 2, prior values moved to history). A complete_day snapshot with unchanged values is still a material revision (revision 2, coverage change). A complete_day snapshot with changed values also updates the same day. In every case the canonical id, logical key and local date stay the same and eligibility stays quarantined. On the device, an unchanged day emits nothing ("Nothing changed"); a changed day or a change in coverage emits the next revision.

## Audit 6 - strategic quarantine (hard gate): PASS

Compared with the pre-activation baseline captured after the deploy, exactly 5 digests differ and all are HealthKit collections (canonical days 0 to 2, configuration 0 to 2, raw observations 10 to 12). Everything else is byte-identical: goals, Confidence history and snapshots, all 52 briefings, plans, protocols, all canonical Evidence (including Training, DEXA and Photo evidence), Training performance events, exercise library, photo/session rows, migrations, cadence operations and outbox. No row in any strategic table was written since activation. HealthKit-derived records inside strategic Evidence: 0. HealthKit references inside goal, Confidence, briefing, plan and protocol tables: 0. V3 eligible HealthKit Activity: 0. V3 eligible HealthKit Nutrition: 0. Both canonical days carry eligibility quarantined, strategic false. No briefing regenerated or revised, no Goal/phase/strategy mutation, no Training or Workout Logger mutation, no DEXA/Photo mutation. No generic evidence adapter sees the canonical days: a structural test pins that only the ingestion, operation, audit and diagnostic files may reference the HealthKit collections, and the eligibility gate is a reviewed constant. No blocker.

## Audit 7 - user-facing projection

Not appearing in normal Log Activity/Nutrition rows or the Evidence Hub is expected: those read models load canonical Evidence (canonicalEvidenceObjects activity_day and nutrition), and the HealthKit canonical days deliberately live in their own application-only collection that no Log, Evidence, Training, Energy, Confidence or briefing reader loads. Future step, not implemented: a separately authorized display-only read-model adapter in the Log and Evidence read services that reads healthKitCanonicalDays with a clear HealthKit source label (its logical keys activity_day|date and nutrition|date map one to one to the Evidence store's day identity, so precedence with screenshot/manual days can be shown deterministically), with V3 eligibility remaining independently gated by HealthKitEvidenceEligibilityPolicy. Promotion of a day into strategic Evidence is a separate, later, reviewed change to that policy plus an explicit promotion step, never the projection.

## Audit 8 - completed-day second sync readiness

From the stored state, a second sync for 2026-09-21 after local midnight will produce a complete_day snapshot (revision 2) that updates the same canonical Activity day and the same canonical Nutrition day, preserves date 2026-09-21, keeps them quarantined and creates no duplicates; the Nutrition day then becomes a full-day asserted device aggregate. Timing: no need to sync right at midnight or stay awake; a single sync after the day's logging is final is best (a sync any time from 00:00 on, including the next morning, gives the same completed-day revision; if anything for 2026-09-21 is added after that, one more sync just adds another revision to the same day). No briefing is scheduled at 03:00 on 2026-09-22 (first cadence run is Wed 2026-09-23), so the 00:00-02:59 to 03:00 boundary test is a separate later day if desired.

## Flags

FIRST_ACTIVITY_OBSERVATION_ACCEPTED=YES
FIRST_NUTRITION_OBSERVATION_ACCEPTED=YES
ACTIVITY_CANONICAL_DAY_SINGLETON=YES
NUTRITION_CANONICAL_DAY_SINGLETON=YES
ACTIVITY_VALUES_MATCH_SUBMITTED_OBSERVATION=YES
NUTRITION_VALUES_MATCH_SUBMITTED_OBSERVATION=YES
NUTRITION_MEALS_FABRICATED=NO
IDENTICAL_REPLAY_EXPECTED_IDEMPOTENT=YES
LATER_REVISION_EXPECTED_SAME_CANONICAL_DAY=YES
HEALTHKIT_ACTIVITY_V3_ELIGIBLE=NO
HEALTHKIT_NUTRITION_V3_ELIGIBLE=NO
CONFIDENCE_CHANGED_BY_SYNC=NO
BRIEFING_CHANGED_BY_SYNC=NO
TRAINING_CHANGED_BY_SYNC=NO
NORMAL_LOG_PROJECTION_ENABLED=NO
EVIDENCE_HUB_PROJECTION_ENABLED=NO
READY_FOR_COMPLETED_DAY_SECOND_SYNC=YES
TESTDAY_VERDICT=GREEN
PRODUCTION_MUTATED_DURING_AUDIT=NO

## Exact Founder next action

Rest of today: nothing special. Use the phone and log nutrition normally; you do not need to sync again today. Second sync: once your 2026-09-21 logging is final (any time from midnight on, including tomorrow morning), open You > server connection > HealthKit Founder Canary, and in Controlled canonical test day CHANGE THE DATE BACK TO 2026-09-21 (after midnight the default becomes 2026-09-22, and syncing that date would be stored raw and permanently barred). Tap Sync test day now once. Expect Server canonicalized: Activity, Nutrition. Then tell the agent so the completed-day audit can run. Do not sync any other date.

## Notes

- Minor, no action: the partial Nutrition record shows origin source_subtotal and low reliability by design for a partial day. The 12 dead outbox messages are unchanged from before this test.
- Reviewer follow-ups from the previous task remain open (durable Native revision floor, ledger tagging, identity spaces before background delivery).

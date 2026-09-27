# Build 68 Strength reconciliation: production verification PASSED, incident closed

Task: `build68-strength-founder-acceptance-and-production-verification-20260927`

## Verdict

**The Founder's "Match confirmed" is independently verified in production.** Build 68's idempotency-key fix (`dc7763e5`, final source `537f538b`) produced the first-ever `workout-reconciliation.resolve.v1` receipt. The receipt, review, link and claims are exactly what the product copy promised, and nothing else was changed. **The Strength reconciliation incident is formally closed.**

Everything below comes from two bounded zero-write reads: owner-scoped, `REPEATABLE READ READ ONLY` with `transaction_read_only = on`, explicitly rolled back, and success-marker gated against production SHA `49211870`. Production application logs were cross-checked.

## Checklist

1. **First-ever receipt exists.** There is exactly **1** `workout-reconciliation.resolve.v1` receipt, all-time. It is `01a0e4f2-524c-779e-b673-7bacc40b2ec8`, status **`committed`**, created and completed at 2026-09-27 22:18:01.490 UTC (15:18 PDT). The app log shows `native.command.receipt_committed` with `commandState: committed` and a 975 ms duration at 22:18:02.338.
2. **Receipt result:** `status: resolved_confirmed`, `revision: 2`, `resolution.action: confirm`, `linkId: healthkit_workout_link_7c89bb56…`, `selectedLoggerSessionCanonicalId: training|authoritative|training_logger_draft_3DDB804B-…`, `strategicEvidenceEligibility: quarantined`.
3. **Idempotency key is safe on the wire.** Checked structurally without exposing the value: length **64**, lowercase SHA-256 hex, matches the server grammar `[A-Za-z0-9._:/-]{16,200}`, **no control characters**. This is the Build 68 key format.
4. **The review is no longer pending.** `healthkit_workout_reconciliation_36a18cc3…` is **`resolved_confirmed`, version 2** (was `pending` v1), updated at the commit instant. Resolution: `action confirm`, `basis.mode founder_explicit_selection`, `by.kind founder`, `matcherVersion healthkit-strength-matcher-v5`, no rejected alternatives. The resolution history has exactly 1 entry.
5. **The link exists exactly once.** Across all time there is exactly one `healthKitWorkoutLinks` record for this workout or Logger session: `healthkit_workout_link_7c89bb56…`, local date 2026-09-24. It is now **`confirmed`, v2**, and its status history reads `candidate` (matcher, Sep 26), then `confirmed` (founder, this receipt). It points to `canonicalWorkoutId healthkit_canonical_workout_cd38c74b…` and `loggerSessionCanonicalId training|authoritative|training_logger_draft_3DDB804B-…`, with `contentAuthority` telemetry=healthkit and trainingContent=workout_logger.
   **Claims:** there are exactly 2 all-time, both created at the commit instant, both `held` by that one link. One is `kind: session` (`healthkit_link_claim_s_a91a0be5…`) and one is `kind: workout` (`healthkit_link_claim_w_2b182547…`). This is the designed one-claim-per-side uniqueness pair, not a duplicate.
6. **The Logger session was not changed.** `training|authoritative|training_logger_draft_3DDB804B-…` (`canonicalEvidenceObjects`) is still **version 1**, last updated **2026-09-24 17:56:52 UTC**, and was not touched.
7. **Strategic eligibility was not changed.** The review, link, both claims and the canonical workout all remain `evidenceEligibility: quarantined`, `strategic: false`, `decidedBy: healthkit-strategic-evidence-quarantine-v1`.
8. **No duplicates.** There is 1 receipt, 1 link, 2 claims (the pair) and 1 resolution-history entry. No `canonical_relationships` rows were created since the upload.
9. **No unrelated mutation from this action.** Every canonical write since the Build 68 upload (22:15 UTC) is accounted for:
   - Reconciliation, one transaction at 22:18:01.490: `evidenceReviews` ×1, `healthKitWorkoutLinks` ×1, `healthKitWorkoutLinkClaims` ×2.
   - HealthKit sync from the Founder's ongoing Apple Watch/Logger use: `healthKitObservations` ×5, `healthKitCanonicalDays` ×1, `healthKitCanonicalWorkouts` ×1. There are 5 committed `healthkit.observations.ingest.v1` receipts in this window.
   - The one canonical-workout write is the Sep 24 workout going to **v4 at 22:18:09.538**, 8 s after the reconciliation and **outside its transaction**. By exact timing it belongs to a HealthKit ingest logged as committed at 22:18:10.655 after 1,132 ms, so it started at about 22:18:09.52. That makes it ordinary HealthKit re-delivery, not reconciliation. Its eligibility is still quarantined.
10. **Logs.** No `api.request.failed` on the commands route. Two read-only `training.navigation.session` 404s (22:17:48, 22:18:35) are consistent with the Founder's in-progress Logger session not being on the server yet. No writes are involved and they do not affect this item.

## Root-cause authority (unchanged)

Native previously sent the raw `ProductionIdempotentSubmission` signature, which contains U+001F, as the `Idempotency-Key` header. Cloudflare rejected it with an empty 400 before it reached the application. Build 68 sends the SHA-256 hex of the same deterministic signature. See `agent-handoffs/reports/20260927T223500Z-build67-strength-root-cause-idempotency-header.md`.

## Build 68 Founder acceptance state
- PASS: Your Journey progress bars
- PASS: Completed Visible Abs Beginning/Completion real photos
- PASS: Logged Today Cardio
- **PASS: Strength reconciliation**, independently verified above
- HealthKit Cardio Phase1/V3: complete and live
- **Still pending:** natural-event acceptance of the reconciliation-review notification. This resolution was a Founder action on an existing review, so it creates no new review and cannot count as that event. The Founder's current Apple Watch strength workout may produce the natural event: a new reconciliation review and its notification.

## Confirmations
No production mutation by this task. No Founder device operated. No reconciliation triggered. No Native build cut. No Server deploy.

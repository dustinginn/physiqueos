# Midweek V3 live-wiring integration prep — combined candidates, acceptance, release plan (Parts A–G)

Generated: 2026-09-25 (UTC ~06:00)
Task id: `claude-midweek-v3-live-wiring-integration-prep-20260924`
Agent: Claude (Midweek Briefing Founder Takeover lane, secondary)
Status: **CODE / TEST / REVIEW COMPLETE. STOPPED FOR FOUNDER AUTHORIZATION.** No Server deployment, no Native archive/upload, no Cardio activation, no policy/data mutation, no historical briefing regeneration, no production access. `agent-handoffs/latest.json` / `latest.md` NOT updated (HealthKit-owned).

Standing disk-safety rule (`STANDING_DISK_SAFETY.md`) applied. See "Disk incident".

## Exact combined candidates

| | SHA | Branch (pushed) | Lineage |
|---|---|---|---|
| **Server** | `f52c8846` | `claude/midweek-v3-engine-server-20260925` | production `01d1900b` <- Midweek `f7d3d4a1`,`6046e9dd`,`e554070c` + HealthKit `c58dcca9`, merged `ff1851f3`; then `18ddc8ff` (tests only), `8d861c3f` + `f52c8846` (doc/test-title only). **Production source is byte-identical to reviewed `ff1851f3`.** |
| **Native** | `2374e11a` | `claude/midweek-standard-format-v3` | Build 59 `a269700b` <- Midweek `1343c52f` + HealthKit `6a108d25`, merged. No Build 60 bump. |

Neither branch is merged to `main`.

## Validation evidence

**Native `2374e11a`** — clean full run on iPhone 17 Pro simulator (`xcodebuild test`, exit 0, `** TEST SUCCEEDED **`): `PhysiqueOSTests.xctest` passed; `PhysiqueOSUITests.xctest` passed (12 tests, 0 failures, ~14 min); zero disk errors. An earlier run was discarded because the disk filled mid-run (see Disk incident) even though it printed TEST SUCCEEDED. Fresh-context review: **PASS-WITH-NOTES, no blocking**: parents/merge-base verified; the two sides share NO files; merge patch-ids equal each side's own diff vs `a269700b` (no dropped/duplicated hunks); no version bump; no stray files.

**Server `f52c8846`** — focused: 13 files / 273 tests / 0 failures in fresh review; Part F run: 594 tests, 590 pass, 3 fail, 1 skipped — the 3 failures are `MonthlyBriefingCadenceService.test.js`, environmental (gitignored `private/founder/*` data absent in worktree), and fail identically on clean production `01d1900b`. Fresh-context review: **PASS-WITH-NOTES, no blocking**: lineage/merge integrity (patch-id equality both directions, zero file overlap), no migration/schema/policy-write files, Cardio not in any graduation domain, settlement lock/claim ordering correct, no off-by-one in 03:00/480-min arithmetic, retry clamped to deadline, event-driven DEXA/Photo not gated.

## NOT verified / not met — read these

1. **PRODUCTION_WEBPACK_BUILD_PASS is NOT verified on the final candidate.** The webpack build was blocked by the session's permission classifier when I attempted it on `f52c8846`; I did not retry or work around it. A build passed earlier on `6046e9dd` only. Run before release: `NEXT_PHASE=phase-production-build npm run build -- --webpack` in the Server worktree. Since the delta from `ff1851f3` is docs + two test files, risk is low but the flag is not claimed.
2. **SETTLEMENT_WATERMARK_FROZEN_PASS is NOT met on the live path.** `buildEvidenceSettlementWatermarkV1` (deep-frozen, unit-tested) has **no production caller**. The live executor records only `settlementReasonCode` on the execution record and emits `briefing_settlement.*` log events (incl. `unsettledDomains` on deadline fallback). Cutoff / record+revision identities / readiness state / closeout receipt / generation timestamp are not persisted on the published artifact. Historical-artifact immutability itself does hold (existing-artifact early return; tested). Persisting the watermark on the artifact touches the generator/artifact contract — needs a design decision, not done here. `recordDeviceCloseoutReceiptV1` likewise has no endpoint.
3. **SETTLEMENT_OBSERVABILITY_LIVE — partial.** Live events: awaiting_settlement, settlement_not_applicable, readiness_satisfied, deadline_fallback_used, briefing_generated, briefing_published. Not confirmed live: `window_closed`, `closeout_*`, `latest_relevant_revision_received`. Production logger emission not verified.
4. **Real two-worker Postgres advisory-lock race was not exercised** (code trace + fakes only).
5. **Device closeout (Native half)** is not implemented here; HealthKit-lane handoff was published earlier: `agent-handoffs/reports/20260925T045514Z-healthkit-briefing-settlement-device-closeout-handoff.md`. It was NOT part of the combined Native candidate.

## Part F — integrated production-shaped acceptance (Server `18ddc8ff`; Native via existing XCTest)

New: `src/domain/services/IntegratedProductionShapedAcceptance.test.js` (47) and `IntegratedHealthKitProductionShapedAcceptance.test.js` (24). Real modules, production-shaped fixtures; Sep20–22 inventory, legacy V2 digest, and Sep23/Sep24 strength-detail digests captured against production `01d1900b` AND HEAD and asserted byte-identical. 10 mutation checks all RED then restored.

| # | Item | Result |
|---|---|---|
| 1 | Sep20–22 format inventory unchanged | PASS (identical to prod) |
| 2 | Hero holistic; no incidental PR thesis | PASS |
| 3 | Confidence concrete / no undefined update | PASS |
| 4 | Energy data-first / no transcription | PASS (Energy card scope; see note A) |
| 5 | Coach slots distinct/nonempty-or-omitted/no first-person | PASS Server contract; Native rendering: XCTest `testCoachFinale*`. No dedicated Native "slots differ" test (note B) |
| 6 | Historical artifact immutable | PASS |
| 7 | 3/3 final-day Energy after settled HealthKit | PASS at V3 Energy execution level (not the stored chart block) |
| 8 | Unsettled final day waits | PASS |
| 9 | Deadline fallback | PASS (publishes at 480 min with `hard_deadline_reached`; unsettled domains in log/execution reason only — gap 2) |
| 10 | Later evidence doesn't rewrite frozen briefing | PASS |
| 11 | Current-day Activity/Nutrition ingestion healthy | PASS |
| 12 | Sep23 confirmed Strength detail healthy | PASS Server byte-identical; Native decode PASS; no rendered-view test (note C) |
| 13 | Sep24 candidate Strength detail decodes/renders | PASS Server; Native decode test `testSep24ProductionShaped...`; no rendered-view test |
| 14 | Indoor/Outdoor survives Native -> Server -> classifier | PASS Server chain (request bound -> ingest -> `indoor_walking`/`outdoor_walking`/`walking`); Native transport encoded-JSON tests PASS; real `HKWorkout` metadata read is code-inspection only (note D) |
| 15 | Cardio NOT activated | PASS (no policy write, no migration, Cardio not a graduation domain) |
| 16 | Four deferred walks untouched | PASS (stay deferred after policy widening/redelivery; only the on-demand runner reconsiders) |
| — | Monthly stays day 1; DEXA/Photo not delayed | PASS (Monthly is gated but falls back within day 1) |

## Accepted / documented non-blocking review findings

- **N1** `HealthKitGraduationReader.readSettlementCoverage` catches all errors and returns no active domains, so a transient read error makes the gate generate immediately ("not applicable") instead of waiting — fail-open for waiting; briefing could freeze on partial data. Silent (`onError` unset). Recommend follow-up: treat error as all-unsettled so the deadline still bounds it.
- **N2** 30-min retry is informational; worker polls every 5 min, so deadline can fire ~5 min late. Harmless.
- **N4** Comment/log-name drift vs `BriefingSettlementEvent` enum; `operationalWarning: eligible_artifact_missing_after_grace` noise while waiting.
- **N6** A user with no canonical day at all for an in-scope domain always waits to the 11:00 deadline.
- **N7** Per-day Energy series ignores `nutritionCompleteness`; 3+ partially-logged low days could count as "below plan" (mitigated by intake-evidence ambiguity text; not reproduced).
- **N8 (product-relevant)** The "≥14 paired historical days" baseline uses the equal-length preceding window (3 days Midweek / 7 Weekly), so the user-relative nudge is probably inert for Midweek and Weekly; only Monthly could reach sufficiency. Safe/conservative but means the variability nudge likely never fires live for Midweek. Not fully traced.
- Fixed in-task: N3 (doc wrongly said Monthly bypasses gate), N5 (Item 9 test title overclaim).
- Note A: Confidence detail sheet `whatSupportsItNow` still carries an Energy figure by design (not the Energy card); untouched by the diff.
- Note B–D: Native has no Energy-card content test, no dedicated "slots differ" test, no rendered `TrainingSessionDetailView` test, and the `HKMetadataKeyIndoorWorkout` read is untested against a real `HKWorkout` (function handles Bool/NSNumber/absent).

## Part G — recommended release plan (NOT executed)

Combined SHAs: **Server `f52c8846`**, **Native `2374e11a`**.

0. Before anything: run the production webpack build on `f52c8846` (gap 1). Free disk >= 20 GiB before Native archive.
1. Founder reviews this report + both branch diffs; decide gaps 2, N1, N8 (fix now vs ship-and-follow-up).
2. Merge Server branch to `main`; deploy combined Server via the two-step (`apps update --spec` bumping GIT_SHA/BUILD_ID on web+worker, AND `create-deployment --force-rebuild`); verify `source_commit_hash` + log gitSha. No migration is included. Server-first is safe: Native `2374e11a` sends `isIndoorWorkout` only when known (key omitted when nil), and combined Server accepts it.
3. Merge Native branch; prepare/archive combined Native as **Build 60** (version bump happens then, not before) — separate authorization.
4. TestFlight upload — separate authorization.
5. Founder acceptance of Strength (Sep23 confirmed + Sep24 candidate) and Midweek on device.
6. Only then begin the already-prepared Cardio graduation gates (Cardio remains NOT activated).
7. HealthKit-lane device-closeout Native implementation (handoff `20260925T045514Z`) can ride a later build; the Server does not depend on it (deadline fallback is authoritative).

## Disk incident (standing-rule reporting)

A runaway `xcodebuild` from the earlier full Native run filled the volume (ENOSPC on every tool call). Killed the lingering `xcodebuild` processes; free space returned to ~19 GiB with no deletions by me (DerivedData was already empty; ~600 MB rebuilt). Before/after: ~0 -> 19 GiB -> 18 GiB (after one full clean Native run). Nothing was removed. Floor (15 GiB) was respected for all subsequent heavy work.

## Flags

AUTHORITY_REVERIFIED (earlier in task) · ENERGY_VARIABILITY_LIVE_WIRED (wired; N8: likely inert for Midweek/Weekly) · ENERGY_PROTOCOL_COMPLETENESS_SEPARATION_PASS · SETTLEMENT_POLICY_LIVE_SCHEDULER_WIRED · SERVER_OWNS_DELIVERY_TIME · SETTLEMENT_HARD_DEADLINE_PASS · SETTLEMENT_RETRY_IDEMPOTENCY_PASS (code trace + fakes) · NATIVE_CLOSEOUT_OWNERSHIP_RESOLVED · HEALTHKIT_CLOSEOUT_HANDOFF_PUBLISHED · COMBINED_SERVER_CANDIDATE_READY (with gaps above) · COMBINED_NATIVE_CANDIDATE_READY · HEALTHKIT_TYPE_FIDELITY_PRESERVED · STRENGTH_FIX_PRESERVED · MIDWEEK_FORMAT_PRESERVED · CARDIO_NOT_ACTIVATED · SEP20_22_ARTIFACT_IMMUTABLE · SERVER_TESTS_PASS (focused; 3 known env failures) · NATIVE_TESTS_PASS · FRESH_CONTEXT_SERVER_REVIEWED · FRESH_CONTEXT_NATIVE_REVIEWED

NOT SET: SETTLEMENT_WATERMARK_FROZEN_PASS · SETTLEMENT_OBSERVABILITY_LIVE (partial) · PRODUCTION_WEBPACK_BUILD_PASS (not verified on final candidate)

FALSE (as required): SERVER_DEPLOYED · TESTFLIGHT_UPLOADED · PRODUCTION_MUTATED

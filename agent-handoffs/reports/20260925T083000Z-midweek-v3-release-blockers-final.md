# Midweek V3 release blockers — FINAL reviewed candidates

Generated: 2026-09-25
Task id: `claude-midweek-v3-release-blockers-finalization-20260925`
Agent: Claude (Midweek Briefing Founder Takeover lane, secondary)
Supersedes: `20260925T060000Z-midweek-v3-live-wiring-integration-prep.md` (interim checkpoint; not release authority).
Status: **CODE / TEST / REVIEW COMPLETE. STOPPED FOR FOUNDER AUTHORIZATION.**

**Nothing was deployed. Nothing was uploaded (no archive, no TestFlight). No production data, policy, or workout was mutated. No historical briefing was regenerated. Cardio is NOT activated. No build-number change. No production access of any kind.** `latest.json`/`latest.md` were not touched.

## Exact final candidates

| | SHA | Branch (pushed, not merged) |
|---|---|---|
| **Server** | `092011cc829378c757b827f0cf66d947a5c52271` | `claude/midweek-v3-engine-server-20260925` |
| **Native** | `2374e11aa707ba4124378958ace429ffd781feba` | `claude/midweek-standard-format-v3` (unchanged) |

Server lineage: production `01d1900b` <- HealthKit `c58dcca9` + Midweek `f7d3d4a1`/`6046e9dd`/`e554070c` (merge `ff1851f3`) <- Part F/doc commits <- blocker commits `b6031797`, `2e23619f`, `3b85c9de`, `e85ca6ef`, `0d5cfdca`, `6692b000`, `0c71cfa9`, `092011cc`. No migration/schema/`.sql` file anywhere in `01d1900b..092011cc`. HealthKit `c58dcca9` files (`nativeCommandRequestBounds`, `HealthKitObservationService`, `HealthKitWorkoutService`, Cardio fixture, `platform/operations`) are byte-identical to `c58dcca9`.

Native source is unchanged from `2374e11a`, so the earlier clean full run (exit 0; both suites; UI 12/12; no disk errors) and the PASS-WITH-NOTES fresh review are carried forward. No Native run was repeated.

## Blocker resolutions

**1 — Watermark persisted on the real artifact (`WATERMARK_LIVE_PERSISTED`).** Optional top-level member `artifact.evidenceSettlement` in the existing JSON payload (no migration). Built in the executor via `buildEvidenceSettlementWatermarkV1`, passed to Midweek/Weekly/Monthly generators as an additive `settlement` input, attached by `attachEvidenceSettlement` (`BriefingEvidenceSettlementArtifact.js`). Fields: evidence window + cutoff, timezone + timezone authority, per-domain `present/coverage/settled/canonicalRecordId/revision`, `readyAtGeneration`, `unsettledDomainsAtGeneration`, `publishReasonCode`, `deadlineFallback`, `coverageReadFailed`, `earliestPublishAt`, `hardDeadlineAt`, `closeoutReceipt` (honestly `null` — no receipt endpoint exists), `generatedAt`, sha256 `integrity`. No separate publish timestamp: the artifact model does not distinguish generation from publication. Deep-frozen at build, at repository write, and on readback. Repository keeps the **oldest** watermark of an occurrence across replacement/correction/duplicate/retry writes. Historical artifacts without the field read and render byte-identically. `settlement_not_applicable` persists `settlementApplicable:false`.
**Disclosed:** an authorized replacement/Confidence-correction artifact inherits the ORIGINAL watermark while its content may reflect later evidence (immutable, but the watermark then describes the first publication).

**2 — Energy variability now reachable live (`ENERGY_VARIABILITY_HISTORY_LIVE_WIRED`).** 14-day minimum NOT lowered. New `EnergyVariabilityBaselineV3.js`: baseline = up to 42 days ending the day before the current window, derived from canonical evidence the generators already read (no new store read; one extra `createCadenceEnergyAssessment` call per generation), cut at `energyStrategy.effectiveAt`, current window never in its own baseline (enforced in selector and in `EnergyAmbiguityV3`). Also fixed a latent bug: `GoalContractV3.normalizeEnergyStrategy` dropped `effectiveAt`, so the regime cut was dead code live. Decision for the Founder: days whose `nutritionCompleteness` is not `complete` are excluded from BOTH baseline and pattern counts (so partial logging cannot masquerade as below-plan days); target distance never excludes a day; 1500/2500/4000 all comparable. Live-path tests prove a 3-day Midweek and 7-day Weekly window with 3+ weeks of history now reach a sufficient baseline through the real service read.
**Side effect:** adding `effectiveAt` to the contract's semantic input changes `goalContract.id`/fingerprint (and derived interpretation/assessment ids) for newly generated contracts with an Energy protocol. No comparing consumer found; a replay crossing the deploy boundary for an already-published occurrence could not be proven absent (review N7).

**3 — Settlement read errors fail closed (`SETTLEMENT_READ_ERROR_FAIL_CLOSED`).** `readSettlementCoverage` returns `readError` (no message) instead of `activeDomains:[]`; a failed EVIDENCE overlay also poisons coverage until a later successful overlay. Gate treats read failure as all domains unsettled (`unknown_coverage_read_failed`): before earliest publish wait; before deadline retry (`coverage_read_failed`); at/after the hard deadline generate with `hard_deadline_reached`, `deadlineFallback:true`, `coverageReadFailed:true`. Unexpected gate exceptions stay per-entry (retry, never generate, never abort other cadences). "No HealthKit-backed domains" still generates (legit not-applicable).

**Live observability (`SETTLEMENT_OBSERVABILITY_LIVE`).** Emitted from the real executor path, all names from the `BriefingSettlementEvent` enum: `window_closed` (once/window/process), `closeout_eligible` (once/window), `latest_relevant_revision_received` (on change), `readiness_checked` (first, on change, else <=1/30 min), `readiness_satisfied`, `deadline_fallback_used`, `settlement_not_applicable`, `awaiting_settlement`, `coverage_read_failed`, `settlement_gate_error`, `briefing_generated` and `briefing_published` (only when this attempt created the artifact; not on idempotent/matched retries). `closeout_requested` is NOT emitted (no Server request path exists). No PII (error name/code only; redaction verified). Dedup in-memory per process, bounded to 64 windows.

## Concurrency — NOT real Postgres
The repo has no local Postgres harness (no pg-mem/PGlite/embedded-postgres/testcontainers/docker/postgres binary; `test:*:postgres` scripts need an externally provisioned `PHYSIQUEOS_TEST_DATABASE_URL`, which was not used). Nothing here claims real Postgres. Substitute: deterministic controlled-ordering tests over the REAL executor, gate, HealthKit reader, Midweek generator, `DailyBriefingRepository` and `CanonicalBriefingConfidencePublicationService`, with a modelled `pg_try_advisory_lock`: two workers converge on one artifact / one watermark / one generated+published; readiness-vs-deadline race resolves deterministically in both orders; lock released after generator failure/timeout (no deadlock); duplicate publishers give one committed + one matched. **Unproven:** advisory-lock hashing, row serialization, `baseline_conflict` retry, a stale-snapshot loser, a real generator through the real publication service, and Weekly/Monthly two-worker paths. Recommend a real-Postgres two-worker run against a disposable database before or immediately after deploy.

## Tests
- Part F production-shaped acceptance: **71/71** (still pass after all blocker work; Item 9 strengthened to assert the persisted watermark).
- New blocker suites: watermark persistence 26, fail-closed 19, observability 18, concurrency 9 + 3, Energy historical baseline 30, plus reader/composition updates.
- Final fresh-review focused run: 562 passed, 4 failed, 1 skipped over 39 files; the 4 failures are environmental (3x `MonthlyBriefingCadenceService`, 1x `briefingCadenceEntrypoint` — both need gitignored `private/founder/*` data). Post-review N1 fix: 151/151 over the 7 settlement/acceptance/composition files.
- Broad `src/domain src/application src/platform/database src/data`: 201 failing tests at `f52c8846`, 200 on clean production `01d1900b`, environmental (missing gitignored founder runtime data); diffed: the only differences vs production were (a) `ProductionConfidenceNarrativeV3Adapter` — a real regression introduced by Part A commit `f7d3d4a1` (earlier reports mislabeled it "pre-existing/environmental"); the test still asserted an incidental movement PR as the Midweek thesis, which Part A intentionally replaced; assertion updated in `e85ca6ef` (Hero holistic; movement named by Confidence) — and (b) `HealthKitStrategicReadBoundary` "enumerates every reader", caused by the new shared test world under `src/testSupport/`; moved to `src/fixtures/` (`0c71cfa9`), boundary guard intact. One boundary test ("lets only the ingestion... reference HealthKit collections") fails identically on production with two pre-existing offenders (`HealthKitWorkoutPresentationService.js`, `HealthKitDeferredWorkoutReconciliationRunner.js`), untouched by this work.

## Mutation evidence (all RED, restored via `git checkout`, tree clean)
Watermark attach removed: 22 RED. Read error treated as generate: 15 RED (reader `readError` alone: 11). Duplicate protection: writer oldest-wins 2 RED, superseded-by-existing 1, executor early return 5, `idempotent` flag 1. `deadlineFallback` not persisted: 8 RED. Energy: no segmentation 5 RED, current window in baseline 8, minimum lowered to 7: 8, `effectiveAt` dropped 6, N7 filter off 5, Weekly wiring removed 1. Review-N1 timezone guard removed: 1 RED. Part F: 10 further mutations RED.

## Webpack — `PRODUCTION_WEBPACK_BUILD_PASS`
`NEXT_PHASE=phase-production-build npm run build -- --webpack` on the EXACT final SHA `092011cc`: exit 0, "Compiled successfully", no "Failed to compile" (an earlier attempt in the prior task was denied by the session classifier; this one ran).

## Fresh-context reviews
- **Server, final (`0c71cfa9`): PASS-WITH-NOTES, no blocking.** Then N1 fixed in `092011cc` and re-tested.
- **Native (`2374e11a`): PASS-WITH-NOTES, no blocking** (carried forward; source unchanged).
- Prior Server review of `8d861c3f`: PASS-WITH-NOTES.

### Review findings disposition
- **N1 FIXED (`092011cc`):** registry and generators resolve the timezone through different fallback chains; the new window-id guard could have thrown `evidence_settlement_window_mismatch` forever when ids differed only by timezone. Now accepted when the covered evidence days are identical; different days still refuse. **Still recommended pre-deploy (read-only):** confirm production `coachingUpdates.timeZone` equals `user.timeZone`.
- **N2 ACCEPTED, recommend follow-up:** the HealthKit evidence overlay is read once at tick start while the gate re-reads coverage later in the same tick; if a domain turns complete in between, the watermark can claim settlement (at a revision) the frozen evidence snapshot lacked. Window ~1 s, longer if an earlier cadence in the tick spends up to 120 s generating. Fix: reuse the overlay's coverage or re-run the overlay after the gate.
- **N3 ACCEPTED:** a persistent NON-read gate exception (programming/config error) fails closed with a per-tick warn and has no deadline escape. Coverage-read failures do have one.
- **N4 ACCEPTED:** concurrency gaps listed above.
- **N5 ACCEPTED (narrow):** Weekly/Monthly return `completed` without an `idempotent` flag; a matched result over a watermark-less existing artifact would be logged as created.
- **N6 ACCEPTED:** `effectiveAt` cut is a UTC-date slice (<= 1 day of mixed/contaminated regime for non-UTC users).
- **N7 ACCEPTED:** new contract/interpretation/assessment ids after deploy (see Blocker 2).
- **N8 ACCEPTED:** `readiness_satisfied`/`deadline_fallback_used` log at decision time, and dedup is per process.
- **N9 ACCEPTED:** one extra full-history double `JSON.stringify` per generation (transient heap/CPU; unquantified against the 1 GB worker).
- **N10 ACCEPTED:** in an authorized replacement the returned artifact's watermark can differ from the stored (correct, older) one.
- Also disclosed, not fixed: the pre-existing whole-runtime canonical load in the cadence tick is not date-scoped (untouched); artifact-size growth from the baseline series is only relevant if observations are persisted (estimated ~3 KB, unmeasured); Native/Web consumers of the new `evidenceSettlement` member were not checked (Server presentation does not read it; read models carry it through additively).
- Native review notes (unchanged): `HKMetadataKeyIndoorWorkout` read from a real `HKWorkout` proven by code inspection only; no rendered-view test for Sep23/Sep24 Strength detail; no dedicated Native Energy-card-content or "slots differ" test.

## Preserved (verified)
Sep20–22 artifacts immutable (executor short-circuits `already_completed` before any gate/write; format inventory identical to production); HealthKit `c58dcca9` type fidelity; Cardio readiness tooling; Cardio not activated; no policy activation; four deferred walks untouched; DEXA/Photo/event briefings never gated; Monthly stays day 1.

## Disk-space compliance (STANDING_DISK_SAFETY)
Every heavy operation ran with >= 16 GiB free (18 GiB before, 17 GiB after each webpack build; floor 15). No full Native suite or Xcode archive was run in this task. Nothing was deleted except temporary baseline worktrees created for A/B test comparison (removed). Free space before/after: 18 GiB -> 17 GiB.

## Recommended release sequence (NOT executed)
1. Founder reviews this report; explicitly accepts or defers N2/N3/N4/N5.
2. Read-only pre-deploy check of N1 (production `coachingUpdates.timeZone` vs `user.timeZone`); optionally a real-Postgres two-worker run on a disposable database.
3. Merge `claude/midweek-v3-engine-server-20260925` @ `092011cc`; deploy via the two-step (`apps update --spec` with GIT_SHA/BUILD_ID on web+worker AND `create-deployment --force-rebuild`); verify `source_commit_hash` and log gitSha. No migration. Server-first is safe (Native `2374e11a` only emits `isIndoorWorkout` when known).
4. Watch the first settlement cycles: `briefing_settlement.*` events, `evidenceSettlement` on the next Midweek/Weekly artifact, and that Energy variability behaves conservatively.
5. Separate authorization: merge Native `2374e11a`, then Build 60 number bump/archive; separate authorization for TestFlight upload.
6. Founder acceptance of Strength (Sep23/Sep24) and Midweek on device; then the prepared Cardio graduation gates.
7. HealthKit-lane device-closeout Native work (`20260925T045514Z` handoff) can follow; Server does not depend on it.

## Flags
AUTHORITY_REVERIFIED · STANDING_DISK_SAFETY_OBEYED · WATERMARK_LIVE_PERSISTED · WATERMARK_HISTORICAL_IMMUTABILITY_PASS · ENERGY_VARIABILITY_HISTORY_LIVE_WIRED · ENERGY_PROTOCOL_REGIME_SEGMENTATION_PASS · ENERGY_COMPLETENESS_SEPARATION_PASS · SETTLEMENT_READ_ERROR_FAIL_CLOSED · SETTLEMENT_DEADLINE_FALLBACK_PASS · SETTLEMENT_OBSERVABILITY_LIVE · PART_F_71_TESTS_PASS · MUTATION_GUARDS_PASS · PRODUCTION_WEBPACK_BUILD_PASS · NATIVE_2374E11A_CARRIED_FORWARD_OR_REVALIDATED · HEALTHKIT_TYPE_FIDELITY_PRESERVED · CARDIO_READINESS_TOOLING_PRESERVED · CARDIO_NOT_ACTIVATED · SEP20_22_ARTIFACT_IMMUTABLE · FRESH_CONTEXT_SERVER_REVIEWED · FRESH_CONTEXT_NATIVE_REVIEWED · SERVER_BROAD_TESTS_PASS (relevant suites; environmental failures identical to production, listed above)

NOT SET: **POSTGRES_TWO_WORKER_CONCURRENCY_PASS** (no local Postgres harness; deterministic substitute only)

FALSE (as required): SERVER_DEPLOYED · TESTFLIGHT_UPLOADED · PRODUCTION_MUTATED
FINAL_GH_REPORT_PUBLISHED: on branch `claude/midweek-v3-integration-report-20260925` only; NOT on `main` (agent policy: no push to `main` without explicit Founder instruction).

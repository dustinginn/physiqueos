# HealthKit corrections + Cardio-readiness implementation — final, both candidates reviewed and approved

Generated: 2026-09-24T23:05:00Z

Task id: `claude-healthkit-corrections-cardio-readiness-implementation-20260924`

Agent: Claude (Remote Control, HealthKit lane), executing `agent-handoffs/inbox/prompts/20260924T142000Z-claude-healthkit-corrections-cardio-readiness-implementation.md` in full (Parts A through F).

## Result

**All six implementation parts (A–F) are complete, tested, and independently fresh-context reviewed: APPROVE on both the final Server candidate and the final Native candidate.** This was **code/test/review only**, exactly as authorized. Nothing was deployed, uploaded, activated, or mutated in production. Neither candidate has been pushed to `origin` — both exist only as local commits on their respective worktrees/branches, awaiting separate Founder authorization for each subsequent gate.

## Authority reverified at task start and reconfirmed at completion

- Production Server: `f8c28700ae32c3a01b1859a988df5f8177a3dd0b`, deployment `b3e48c28-b002-4b5e-a48b-22acccba8093`, `/live`/`/ready` HTTP 200 — unchanged throughout this entire task.
- Installed Native: Build 58, release `fd7eed02add35bb9016dcd873018cd0c4ef43265` — unchanged; not operated.
- **Final Server candidate**: `01d1900bcbb9db32ce270e49c7d24e919ba0d7d7`, branch `codex/healthkit-current-day-review-server`, worktree `/private/tmp/physiqueos-healthkit-current-day-review-server`, 4 commits ahead of live production, local only.
- **Final Native candidate**: `236f208edffddcad4ace8748874993ed7daa05da`, branch `codex/healthkit-revision-recovery-native`, worktree `/private/tmp/physiqueos-healthkit-revision-recovery-native`, 1 commit ahead of installed Build 58, local only.

## Part A — Native Activity cache/read consistency (Native commit `236f208e`)

`ProductionActivityAPI.fetchActivityDay(date:)` (Activity Day Detail) now reads with `policy: .reload`, bypassing the coarse `activity?context=all` cache bucket it previously shared with unrelated callers and never actively invalidated — eliminating the class of bug where Detail could serve an older revision than Recent Activity History had already observed. `ActivityDayView` also gained `.refreshable`/scene-phase reload for symmetry. History's own path is untouched.

- 188/188 targeted tests (`FounderServerAPITests`, including 4 new tests). 1352/1353 full non-UI unit bundle — 1 pre-existing, unrelated failure (a hardcoded `CFBundleVersion == "56"` literal assertion, confirmed present and failing before this change, at the parent Build-58 commit).
- **Fresh-context review verdict: APPROVE.** Independently re-ran all of the above with identical results. One legitimate nuance surfaced and accepted as non-blocking: under `.reload`, if another caller already has an in-flight request for the identical cache key at the exact moment Detail asks, Detail's call joins that in-flight fetch rather than issuing a fully independent one — still always a live, in-progress network response, never a stale stored value, so this doesn't reopen the staleness bug, but the guarantee is "always at-least-as-fresh-as-any-concurrent-live-fetch" rather than "always its own exclusive round-trip." Also noted: every Detail-screen open now costs a live round-trip instead of a possible cache hit; reviewed and judged reasonable for a low-frequency, Founder-only detail screen, and the loading-state code doesn't force a spinner flicker on refresh.

## Part B — Server Strength telemetry presentation ownership (Server commit `ca21aa26`)

A new `projectHealthKitStrengthWorkoutPresentationBySession` reuses the existing deterministic HK-workout matcher to resolve, for display only, a same-day canonical HK Strength workout for a Logger session even when unconfirmed — exposed honestly as `"candidate"` vs `"confirmed"`, never creating a link. Wired through Training/Workout-Detail/Log presentation to override only display fields; Logger exercises/sets untouched; the frozen Sep 24 evidence package's `metadata.duration_seconds` (the synthetic 94-minute value) is never mutated. Whole-day energy accounting deliberately still used only the confirmed-link map at this stage (Part E built on top of it later).

- 91/91 directly-affected tests; broader suites matched the pre-existing baseline exactly; production build passed twice.
- **Reviewed as part of the combined final Server review below (APPROVE).**

## Part C — Atomic workout policy scope replacement (Server commit `0237dbe4`, NOT executed)

A new `"replace-families"` action on the existing HealthKit workout-activation-policy runner replaces an enabled policy's family scope in one guarded transaction (real Postgres transaction with a per-owner advisory lock, matching the pre-existing `activate`/`deactivate` actions exactly) — eliminating the previously-only-available deactivate-then-reactivate sequence's disabled-policy gap. Requires an exact old-policy digest precondition and an exact-current-families precondition (preventing an accidental silent narrowing), refuses any unacknowledged narrowing, is idempotent on replay (verified: a repeat call returns before any write is reached at all), and writes a single audit row recording old/new digest and the authorization reference. Never run against any real policy — tested exclusively against an in-memory fixture store.

- 38/38 tests. Production build passed.
- **Reviewed as part of the combined final Server review below (APPROVE).** One accepted minor note: `acknowledgeNarrowing` is a bare boolean rather than requiring the caller to echo back the exact dropped-family list — not a real bypass (the refusal message naming the dropped families must be seen first), but worth tightening in a future iteration.

## Part D — Bounded deferred Cardio reconciliation runner (Server commit `7e443a27`, NOT executed)

A new runner canonicalizes one specific already-deferred (`family_not_in_activation_scope`) HealthKit workout observation by exact identity — no bulk/date-range mode (enforced by real input validation, not just convention). Reuses ingestion's own canonical-workout constructor (not a reimplementation), preserving UUID/telemetry/provenance exactly. Refuses any observation with the wrong defer reason/family, refuses if the observation's family isn't yet in the live policy, distinguishes `already_canonicalized` (was never actually deferred) from `already_reconciled` (this exact reconciliation already ran), and creates no Logger session/link/claim/strategic-eligibility row for Cardio. Never run against any real database — tested exclusively against an in-memory fixture store, hard-bound in its test fixtures to the two known Sep 24 Indoor Walk identities.

- 12/12 tests. Production build passed.
- **Reviewed as part of the combined final Server review below (APPROVE).**

## Part E+F — Activity attribution wiring + Log/Cardio surface decision (Server commit `01d1900b`)

Wires canonical-workout-aware whole-day Activity-calorie attribution into `ProgressReportingService.js`, reusing the existing (previously-unwired) `composeDailyActiveEnergyWithWorkouts` model rather than re-deriving arithmetic. **Explicit product-judgment decision, reviewed and confirmed structurally sound**: a Strength workout must have a CONFIRMED link to count toward whole-day workout calories (matching Strength's own explicit confirm/deny mechanism), while a canonicalized Cardio workout counts unconditionally, because Cardio structurally has no confirm/deny step at all — its canonicalization is its only inclusion decision. Missing workout energy propagates as an explicit day-level "unknown," never a silent zero. The whole-day total itself is never touched or recomputed. Activity Detail now exposes a `contributingWorkouts` list (family/type/time/duration/energy/provenance) for each eligible workout. **Part F decision**: no new Log UI surface for Cardio — Activity Detail's new workout-row list is the more honest surface, since Cardio structurally has no Training Logger session to anchor a Log row to; implementing one would mean fabricating a session identity that doesn't exist.

- 28/28 directly-affected tests (including a byte-identical Sep 23 regression check). Broader suites matched baseline. Production build passed.
- **Reviewed as part of the combined final Server review below (APPROVE).**

## Full cross-part verification (performed by the orchestrating session, independently of each part's own agent)

- All ten directly-affected test files across Parts B–D re-run together: **214/214 passed.**
- `vitest.package7.config.js`: 555/561 (6 pre-existing unrelated). `vitest.phase3.config.js`: 288/289 (1 pre-existing unrelated). `vitest.phase4.config.js`: 139/139 clean. `vitest.phase6.config.js`: 519/522 (3 pre-existing unrelated). `vitest.phase6.training.config.js`: 153/153 clean. `vitest.native-sandbox.config.js`: 272/274 (2 pre-existing unrelated). All failure signatures re-confirmed identical to the long-established, previously-characterized baseline (missing gitignored local fixtures; an unrelated date-handling bug) — zero new failures anywhere.
- **Mutation-tested three critical guards directly** (temporarily disabled each, confirmed the exact protecting test goes RED, restored, confirmed GREEN, confirmed zero residual diff): Part C's `expectedCurrentPolicyDigest` precondition; Part D's `family_not_in_activation_scope` defer-reason gate; Part E's "unconfirmed Strength never counts, Cardio does" eligibility rule.
- Real production-shaped build (`npm run build -- --webpack`, `NEXT_PHASE=phase-production-build`) re-run independently on the final combined Server SHA with an explicit captured exit code: **0**, `Compiled successfully`, zero `Failed to compile`.
- Full accumulated diff vs. live production (`f8c28700..01d1900b`): 18 files, 3007 insertions / 44 deletions — confirmed scoped entirely to HealthKit workout presentation, activation-policy tooling, deferred-reconciliation tooling, and Activity-attribution wiring; nothing else.

## Independent fresh-context reviews

**Final Server candidate `01d1900b`: APPROVE (minor, non-blocking concerns).** Independently re-verified the full diff, all suite results, ran its own two additional mutation tests (Part C's narrowing-acknowledgement refusal, Part D's Cardio-only restriction — both RED then GREEN), its own production build, and confirmed cross-part consistency: Parts C and D's drift-fence/audit-row/idempotency conventions are near-verbatim consistent with each other and with the pre-existing, untouched `HealthKitWorkoutLinkReassessmentRunner.js` precedent — "one deliberate house style," in the reviewer's words. Two minor findings, both accepted as non-blocking: the digest/stable/listDigest helper functions are copy-pasted across three files rather than factored into a shared module (a future DRY concern, not a correctness issue); a parameter name reused for two semantically-different maps in `ProgressReportingService.js` (functionally verified correct, a readability nit only).

**Final Native candidate `236f208e`: APPROVE.** Independently re-verified the full diff and re-ran both test invocations with identical results (188/188 targeted, 1352/1353 full bundle with the same single pre-existing failure, independently confirmed pre-existing by reading the unmodified `TrainingLoggerTests.swift` and `project.pbxproj`). Confirmed the race/coalescing and "no per-date cache fragmentation" claims by tracing the actual cache-key construction and generation-gating logic by hand, not by name-matching to reused test infrastructure. The in-flight-join nuance noted under Part A above was this reviewer's own independent finding.

## Mutation and scope ledger

- Server deployed: **NO** (production remains `f8c28700...`/`b3e48c28-...`, unchanged and reverified at task end).
- TestFlight uploaded: **NO**.
- Workout/daily policy mutated: **NO** — Part C's new capability has never been run against any real policy record.
- Cardio activated: **NO**.
- Deferred Cardio observations reconciled: **NO** — Part D's new runner has never been run against any real database.
- September 23 Activity data mutated: **NO**.
- Frozen September 24 Logger evidence package mutated: **NO** — independently traced and confirmed by two separate reviewers.
- Founder-device operated: **NO**.
- Strategic eligibility / Confidence: unchanged, verified.
- Both final candidates remain local-only commits on their respective branches — neither pushed to `origin`.

## Recommended ordered release/activation sequence

Per the task's own preferred sequence, and unchanged by this review — each step below requires its own separate, explicit Founder authorization; none may be inferred from any other:

1. **Deploy Server** `01d1900bcbb9db32ce270e49c7d24e919ba0d7d7` (Parts B–E's code/presentation/tooling), using the established guarded deploy procedure (fast-forward, quoted refspec, four-value stamp update, force-rebuild, pre/post zero-write audits) — this ships the presentation fixes and the new policy-replacement/deferred-reconciliation *capabilities*, but activates nothing by itself.
2. **Release Native** `236f208edffddcad4ace8748874993ed7daa05da` (Part A) — archive, verify, guarded dry-run, then a separately authorized real TestFlight upload.
3. **Real-device acceptance** of Sep 23 Activity Detail/History consistency and the Sep 24 Strength presentation fix, once Step 2's build is installed and used normally.
4. **Dry-run** the atomic policy replacement (Strength-only → `[cardio, strength]`) against live production using Part C's now-deployed tooling; review its exact predicted mutation; then a separate authorization to apply.
5. **Apply** the policy replacement; verify Strength remains scoped and Cardio is now scoped, with no ingestion gap observed.
6. **Dry-run** the exact two-Indoor-Walk deferred reconciliation against live production using Part D's now-deployed tooling; review its exact predicted canonical-workout creation; then a separate authorization to apply.
7. **Apply**; verify both Cardio workouts canonicalize correctly, distinct from each other and from Strength, with no Logger session/link/claim created.
8. **Real-device acceptance** of Activity workout/non-workout attribution and the (already-decided, in Part F) Activity Detail workout-row surface for Cardio.
9. Only after all of the above: any strategic-eligibility change remains explicitly out of scope and requires its own future, separate authorization.

## Flags

- AUTHORITY_REVERIFIED: YES
- SEP23_REPAIR_CANCELLED: YES (unaffected, confirmed unchanged)
- NATIVE_ACTIVITY_CACHE_FIX_IMPLEMENTED: YES
- NATIVE_ACTIVITY_CACHE_PARITY_PASS: YES
- STRENGTH_TELEMETRY_PRESENTATION_FIX_IMPLEMENTED: YES
- STRENGTH_SYNTHETIC_DURATION_NOT_HK_PASS: YES
- ATOMIC_WORKOUT_POLICY_REPLACE_IMPLEMENTED: YES
- ATOMIC_POLICY_DRYRUN_PASS: YES (fixture-only)
- DEFERRED_CARDIO_RECONCILIATION_RUNNER_IMPLEMENTED: YES
- DEFERRED_RECONCILIATION_DRYRUN_PASS: YES (fixture-only)
- CARDIO_NO_LOGGER_LINK_CLAIM_PASS: YES
- ACTIVITY_CANONICAL_WORKOUT_ATTRIBUTION_WIRED: YES
- ACTIVITY_DAILY_TOTAL_INVARIANT_PASS: YES
- CARDIO_VISIBLE_SURFACE_DECIDED: YES (Activity Detail suffices; no new Log surface)
- NATIVE_TESTS_PASS: YES (188/188 targeted; 1352/1353 full, 1 pre-existing unrelated)
- SERVER_TESTS_PASS: YES (214/214 combined directly-affected; broader suites match pre-existing baseline exactly)
- MUTATION_TESTS_PASS: YES (5 total across orchestrator + Server reviewer, all RED-then-GREEN)
- PRODUCTION_WEBPACK_BUILD_PASS: YES (re-verified independently multiple times)
- FRESH_CONTEXT_REVIEWED: YES (both candidates, both APPROVE)
- SERVER_DEPLOYED: NO
- TESTFLIGHT_UPLOADED: NO
- POLICY_MUTATED: NO
- CARDIO_ACTIVATED: NO
- DEFERRED_CARDIO_RECONCILED: NO
- PRODUCTION_DATA_MUTATED: NO
- GH_REPORT_PUBLISHED: YES
- CONTAINS_SECRETS: NO

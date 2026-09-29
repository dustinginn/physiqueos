# HealthKit corrections — Part A (Native cache) + Part B (Server Strength presentation) checkpoint

Generated: 2026-09-24T20:30:00Z

Task id: `claude-healthkit-corrections-cardio-readiness-implementation-20260924`

Agent: Claude (Remote Control, HealthKit lane), executing `agent-handoffs/inbox/prompts/20260924T142000Z-claude-healthkit-corrections-cardio-readiness-implementation.md`

## Result

**Parts A and B are implemented, tested, and committed locally. This is code/test/review only** — nothing was deployed, uploaded, or activated, per this task's explicit authorization scope. Parts C–F proceed next per the task's own sequencing ("implement A+B first with focused tests. Proceed to C+D+E only after A+B are green").

## Authority reverified at task start

- Production Server: `f8c28700ae32c3a01b1859a988df5f8177a3dd0b`, deployment `b3e48c28-b002-4b5e-a48b-22acccba8093`, `/live`/`/ready` HTTP 200.
- Installed Native: Build 58, release `fd7eed02add35bb9016dcd873018cd0c4ef43265`.
- Both HealthKit worktrees clean at those exact SHAs before implementation began.

## Part A — Native Activity cache/read consistency

**New Native commit: `236f208edffddcad4ace8748874993ed7daa05da`** (parent `fd7eed02...`, branch `codex/healthkit-revision-recovery-native`, not pushed).

Root cause (confirmed against the forensic report): `ProductionActivityAPI.fetchActivityDay(date:)` (Detail) always requested `scope: .all`, landing in a cache bucket shared with unrelated callers and never actively invalidated, while `fetchActivityLanding` (History) actively invalidates on pull-to-refresh and app-foreground. Detail could therefore serve an older revision than History had already observed.

Fix: `fetchActivityDay` now reads with `policy: .reload` (bypasses the cache entirely for this one "day truth" screen — chosen over inventing a new date-scoped server resource, since replicating Training's dedicated `training-day` resource would require Server route changes outside this task's Native-only worktree). `ActivityDayView` also gained a `.refreshable` and scene-phase reload for symmetry/UX, though `.reload` alone already guarantees freshness. History's own path is untouched.

Verified against all 8 requirements from the implementation task, each with a dedicated new XCTest in `FounderServerAPITests.swift`:
- Detail never serves an older revision than History has already observed (Sep 23 rev 50→51 fixture: History refreshes to 782.7/107, Detail opens immediately after and gets the same, never 606/102).
- The existing generation-gated in-flight-response mechanism (already proven for another resource) is reused, not reinvented, and a new test proves an orphaned older response can never overwrite a newer cached value.
- Refresh/invalidate stays scoped to the `activity` resource only; no cross-date contamination (Activity has no per-date cache fragmentation to contaminate).
- Nutrition's caching is verified byte-for-byte unaffected by a dedicated test.
- No offline/disk-persistence downgrade path exists for this cache (it's a private in-memory actor property with zero persistence) — confirmed by inspection, no code change needed for that requirement.
- Zero Server files touched; zero files outside `ios/` touched.

**Tests**: `FounderServerAPITests` full suite — 188/188 passed (including the 4 new tests, individually confirmed by name). Full non-UI unit bundle — 1352 tests, 1 pre-existing unrelated failure (`TrainingLoggerTests` asserts a hardcoded `CFBundleVersion == "56"` literal with its own doc comment admitting it needs bumping on every release; confirmed present and already failing at the parent commit `fd7eed02`, i.e. before this change — not introduced by this work, not touched, out of this task's scope). Simulator: iPhone 17 Pro `A8157897-95ED-4480-9150-6136652A6519` only, confirmed via `xcrun simctl list devices`; no other simulator created or used.

## Part B — Server Strength telemetry presentation ownership

**New Server commit: `ca21aa2637a6975876f12f5e6b2cca51411b30a5`** (parent `f8c28700...`, branch `codex/healthkit-current-day-review-server`, not pushed).

Root cause (confirmed): the Sep 24 Logger session's evidence payload froze a synthetic `metadata.duration_seconds: 5647` (~94 min) via a documented commit-instant fallback, and every presentation path (Log, Workout Detail, Activity Linked Training Context) only ever consulted CONFIRMED HealthKit-workout attachments — so with no confirmed link (60% live-assessed confidence, below auto-confirm), all three surfaces fell through to the frozen synthetic value instead of the real HK Strength interval (11:22:10–11:50:09, 206.205 active cal, HR 120.14).

Fix (presentation-only, 9 files, 691 insertions / 24 deletions):
- New `projectHealthKitStrengthWorkoutPresentationBySession()` in `HealthKitWorkoutPresentationService.js` — reuses the existing deterministic `assessHealthKitStrengthLinkCandidates` matcher (untouched) to resolve, for display purposes only, a same-day canonical HK Strength workout for a Logger session even when unconfirmed, exposing it honestly as a `"candidate"` (vs. `"confirmed"`) with its confidence — never creates, writes, or auto-confirms a `healthKitWorkoutLinks` row.
- `ProgressReportingService.js`, `TrainingNavigationReadService.js`, `LoggedTodayService.js`, `CoreNavigationReadService.js`, `LogReadService.js` — threaded this resolution through to override only `value`/`detail`/`telemetry`/`sourceEvidence` for display; Logger exercises/sets/reps/load are never touched; the frozen evidence payload's `metadata.duration_seconds` remains `5647` on disk (verified unchanged after presentation runs) — this is a read-time override, not a data mutation.
- Whole-day Activity energy accounting (`getActivityDaysWithTrainingAggregates`) deliberately still uses only the confirmed-link map, completely unchanged — verified by a dedicated test asserting the Sep 24 unconfirmed case contributes zero to `confirmedHealthKitWorkoutCount` there. (Part E's attribution wiring is separate, later work.)
- Family safety double-enforced (the matcher itself requires `family === "strength"`, and the presentation filter independently requires it too) — an Indoor Walk can never be selected, proven by a dedicated test.
- New production-shaped fixture `healthKitSep24StrengthPresentationFixture.js` (mirrors the existing Sep 23 fixture's style) reproduces the audited numbers exactly.

**Tests**: directly affected files 91/91 passed (independently re-run and confirmed). Full `vitest.package7.config.js` 555/561 (6 pre-existing unrelated failures, confirmed identical to the unmodified baseline via `git stash` comparison). `vitest.phase3.config.js` 288/289, `vitest.phase6.config.js` 519/522 — same pre-existing unrelated failure signatures. `vitest.phase6.training.config.js` (covers `TrainingLoggerAppleHealthService.test.js`) 153/153. Full-repo diligence run: 8408/8708 passed, all 300 failures traced to the same missing gitignored local fixture files this worktree lacks, none touching HealthKit/Training presentation logic.

**Production build**: run twice independently against the new SHA — exit code 0 both times, `Compiled successfully`, zero `Failed to compile` occurrences (exit code captured explicitly, not inferred from a piped log grep, per the lesson from the earlier `07ed8230` build failure).

**Disk note**: free space was ~8.1 GB (under the repo's 10 GB pre-archive guideline) during this Server-only work; no cleanup was attempted since no archive step was involved and the build completed successfully regardless (this worktree's `node_modules` is a shared symlink, not duplicated). Flagging in case it matters for a future Native archive step.

## Mutation and scope ledger

- Production deployed/mutated: **NO**.
- TestFlight uploaded: **NO**.
- Workout/daily policy mutated: **NO**.
- Cardio activated: **NO**.
- September 23 Activity data mutated: **NO**.
- Frozen September 24 Logger evidence package mutated: **NO** (verified unchanged on disk after presentation logic runs).
- Founder-device operated: **NO**.
- Strategic eligibility / Confidence: unchanged (verified by test).
- Both new commits are local to their respective worktrees/branches only — neither has been pushed to `origin`.

## Next

Proceeding to Parts C (atomic workout policy scope replacement), D (bounded deferred Cardio reconciliation runner, not executed), and E+F (Activity attribution wiring + Log/Cardio surface decision), per the task's own sequencing. None of C–F will be applied/activated/executed against production in this task. A further checkpoint and the final report (with fresh-context independent review of the final Server and Native candidates) will follow.

## Flags

- AUTHORITY_REVERIFIED: YES
- SEP23_REPAIR_CANCELLED: YES (confirmed, unaffected by this task)
- NATIVE_ACTIVITY_CACHE_FIX_IMPLEMENTED: YES
- NATIVE_ACTIVITY_CACHE_PARITY_PASS: YES
- STRENGTH_TELEMETRY_PRESENTATION_FIX_IMPLEMENTED: YES
- STRENGTH_SYNTHETIC_DURATION_NOT_HK_PASS: YES
- NATIVE_TESTS_PASS: YES (188/188 targeted; 1352/1353 full unit bundle, 1 pre-existing unrelated failure)
- SERVER_TESTS_PASS: YES (91/91 directly affected; broader suites match pre-existing baseline exactly)
- PRODUCTION_WEBPACK_BUILD_PASS: YES (twice)
- SERVER_DEPLOYED: NO
- TESTFLIGHT_UPLOADED: NO
- POLICY_MUTATED: NO
- CARDIO_ACTIVATED: NO
- DEFERRED_CARDIO_RECONCILED: NO
- PRODUCTION_DATA_MUTATED: NO
- GH_REPORT_PUBLISHED: YES
- CONTAINS_SECRETS: NO

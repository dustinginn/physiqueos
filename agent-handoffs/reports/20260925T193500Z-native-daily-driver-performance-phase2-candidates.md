# Native daily-driver performance, Phase 2: implementation candidates

Task id: `claude-native-daily-driver-performance-phase2-20260925`
Report 2 of 3 (exact candidates). Baseline: `agent-handoffs/reports/20260925T185500Z-native-daily-driver-performance-phase2-baseline.md`. The performance lane does not take ownership of the HealthKit `latest.json`/`latest.md`; its pointer is `agent-handoffs/performance/latest.json`.

## Exact candidates (not deployed, not uploaded)

| Lane | Branch | Base | Final candidate SHA |
|---|---|---|---|
| Server | `claude/performance-phase2-server-20260925` | production `a399916ac9b1c9128067f0f77fb7fd05666aa92a` | `afdc849a6399130668d846544e85236fe1974741` |
| Native | `claude/native-performance-phase2-20260925` | Build 60 `00321dcc6dd86a6479dbca5dd27e691c87348cd8` | `c736254b23b169b144b8e998fe6476d4cd79fe95` |

Both are pushed to origin. Native is still versioned 1.0 (60); a Build 61 release commit is not prepared.

## Server commits (root cause → fix)

1. `6abdabca` `localDate`: one cached `Intl.DateTimeFormat` per time zone (bounded to 64 zones), plus a cached `resolveLocalTimeZone`.
   - Cause: Home spent ≈420 ms + 130 ms of CPU per read building formatters.
   - Output identical: a zone that fails to construct is never cached, so it keeps throwing.
2. `df8b662d` exercise-phrase memo and reporting date formatters.
   - Bounded 4096-entry memo for `normalizeExercisePhrase` (Training Logger spent ≈1.1 s per read here).
   - Cached `ProgressReportingService` date-key and short-date formatters (Training landing and Activity).
3. `21eed6e8` Native-only allowlist projections for `training-landing` and `training-library`.
   - They keep exactly the keys Build 60 decodes plus `href`, which becomes `destination`.
   - Landing 1.65 MB → 148 KB; library 191 KB → 12.6 KB.
4. `25f1d0e9` shared cached `formatShortMonthDay`, an exact `toLocaleDateString` equivalent that still returns "Invalid Date" and follows runtime TZ changes. Used for Progress Photos, gallery and reporting dates (Photos spent ≈690 ms per read here).
5. `73491417` Native-only Nutrition projection: drops the duplicate `entries` history (1.27 MB → 0.64 MB).
6. `ea8c8a54` tooling: zero-write Native read benchmark (`scripts/performance/`), with CPU-profile, response-shape and parity modes.
7. `afdc849a` review hardening: an absent landing/library/nutrition read still answers 404, not 500.

HealthKit ingestion, canonicalization, workout policy, Cardio classification and reconciliation, `isIndoorWorkout` and Training Day Cardio semantics are not touched. `localDate` is a shared pure utility whose output is byte-identical, verified by equivalence tests and production parity hashes.

## Native commits (root cause → fix)

1. `cd91c08b`
   - 19 read screens reuse their view model on `.task(id:)` re-fire, so back-navigation or tab reappearance no longer blanks them to a spinner, resets scope, or re-reads. Priority Detail and Training Logger are deliberately unchanged.
   - Only the visible screen refreshes on foreground (`refreshesOnForegroundWhenVisible`); previously every mounted screen refetched at once. Home keeps its handler for notification reconciliation.
2. `853ee8e4` persisted last-known Home.
   - Written atomically with complete file protection, excluded from backup, only for `home`, never returned as a read result.
   - Painted on cold launch only, labelled, with every priority's completion disabled and no notification reconciliation from it.
   - Retired by any write invalidating Home, and by pairing and revocation.
3. `31ed2615` Priority Detail acknowledges completion as soon as the durable command commits.
   - Previously it first awaited notification cleanup, which performs a full canonical Home read (1.4–2.4 s).
4. `c736254b` fresh-review hardening:
   - a snapshot from an earlier local day is refused, and the notice shows the snapshot's Server time;
   - a Server-rejected refresh credential retires snapshots, and every session end bumps the cache generation so an in-flight read cannot re-persist;
   - pull-to-refresh keeps the snapshot (not a write);
   - retained scope screens drop stale-scope responses.

## Tests, build, review

- **Server focused tests:**
  - all 7 commits pass: `localDate` (+8 tests), exercise identity (+3), Native projections (+6), Native contract suite (280);
  - the full unit suite shows 301 failures, identical to the untouched `a399916a` baseline (all environment-dependent, e.g. missing `private/founder/runtime-store.json`), with +17 new passing tests (9,120 vs 9,103).
- **Production webpack build:** passes on exact `afdc849a` (`PHYSIQUEOS_GIT_SHA=afdc849a…`, `NEXT_PHASE=phase-production-build`, `--webpack`: "Compiled successfully").
- **Native (existing iPhone 17 Pro simulator only):**
  - full unit suite 1,395/1,395 pass; `FounderServerAPITests` 201/201, including 13 new Phase 2 tests;
  - UI suite 11/12 pass. The failure was `TrainingAcceptanceUITests.testReportingJourneys` ("Could not scroll to button: training-reporting-disclosure"). It is a pre-existing flake: the same failure appeared on the Build 60 lineage in an earlier session and passed on recheck there; here an isolated rerun gave one fail and one pass. Its code path (`TrainingHistoryView` retention and scroll position) is unchanged from Build 60.
- **Fresh-context adversarial reviews:** two independent reviewers, Server and Native, found nothing blocking.
  - All Native-decoder key sets were confirmed against Build 60 source.
  - The review's medium and low findings are fixed in `afdc849a` / `c736254b`: snapshot age, Server-side revocation, generation bump, pull-to-refresh retention, stale-scope race, projection null handling.
  - Remaining informational items are listed in the final report.

Flags: HIGH_IMPACT_FIXES_IMPLEMENTED=yes · CACHE_CORRECTNESS_GUARDS_PASS=yes · REQUEST_COUNT_GUARDS_PASS=yes · SERVER_TESTS_PASS_OR_NOT_APPLICABLE=yes (no new failures vs baseline) · NATIVE_TESTS_PASS_OR_NOT_APPLICABLE=yes (unit all pass; one pre-existing UI flake) · PRODUCTION_WEBPACK_BUILD_PASS_OR_NOT_APPLICABLE=yes · FRESH_CONTEXT_REVIEWED=yes · HEALTHKIT_CARDIO_PATH_UNCHANGED=yes · SERVER_DEPLOYED=no · TESTFLIGHT_UPLOADED=no · PRODUCTION_MUTATED=no

# Build 93 stale Watch-projection test triage — test-only candidate PASS

**Recorded:** 2026-10-09T16:22:36Z  
**Assignment:** `agent-handoffs/inbox/prompts/20261009-codex-build93-stale-watch-projection-test-triage.md` at `a1759ea0d249bf2e780bb3c1873ce0b6e27dd0ae`  
**Base Native candidate:** `ac3def4ce6941138719f3a39c7cbbfc521b29eb0`  
**Test-only Native candidate:** `9d0a206908fc3c4a64976e9cc3840e23cab0ba55`  
**Candidate branch:** `codex/native-build93-final-integration-20261008`  
**Decision:** **PASS for the bounded triage. Product behavior is correct; the Build 87 fixture was stale.**

## Executive result

The single failed test was reproduced unchanged first on exact base candidate `ac3def4c`. It failed with the same two assertions recorded by the stopped release run: the progression choice remained `.previous` and revision remained `1` instead of changing.

Independent source, fixture, and state-transition analysis proves this is not a product regression. The Build 87 fixture pairs Leg Extensions with Sissy Squats. Pairing immediately refills both incomplete Leg Extension rows from the matching superset history to `80 lb × 15`, and the contextual Server recommendation is also exactly `80 lb × 15`. Build 93's intentional actionability guard therefore reports `canApplyProgressionSuggestion == false`; applying the matching recommendation is a true no-op and `TrainingSessionAuthority` correctly returns `.unchanged(revision: 1)`.

Only `ios/PhysiqueOSTests/TrainingLoggerTests.swift` changed. No production source, project configuration, dependency, build number, Server source, or release artifact changed. The corrected fixture first locks the matching-row no-op contract, then introduces one real editable-row difference (`75 lb` versus recommended `80 lb`) and proves suggestion application changes exactly that row, advances the authority revision, selects `.suggestion`, and reaches the Watch projection as `80 lb × 15`.

An adjacent Build 87 guidance test had the same vacuous fixture pattern: it claimed an incomplete row took a suggestion although that row already matched. Its incomplete load is now explicitly `70 lb` before application, so the test genuinely proves the incomplete row becomes `90 lb` while the completed row remains byte-for-byte unchanged.

The corrected single test, containing suite, focused Logger/Watch matrix, and full iPhone unit target all pass. The long UI suite was not run, as required.

## Reproduction on the exact failed base

Selected test:

`Build87SupersetHistoryContextTests/testTheWatchProjectionShowsTheAppliedContextualSuggestion()`

Environment: one fresh disposable iPhone 17 Pro simulator, iOS 27.0, serialized Xcode execution, Native `ac3def4c`.

Result: **FAILED**, one selected test with two assertion failures.

| Location | Actual | Stale expectation |
|---|---|---|
| `TrainingLoggerTests.swift:3017` | `progressionChoice == .previous` | `.suggestion` |
| `TrainingLoggerTests.swift:3022` | `currentRevision == 1` | greater than `1` |

The test runner exited after writing the two definitive assertion records, while Xcode remained stuck finalizing its result log. Only the triage-owned Xcode finalizer was terminated; the assertion objects were independently decoded from the result store. No broader test was run during reproduction.

## Root cause

The test originated in Build 87 commit `e9f8a957` and encoded the then-valid behavior that applying any explicit suggestion always selected `.suggestion` and caused a content revision, even when the recommended values already matched every editable row.

Build 93 commit `a3cecfb6` deliberately changed that contract:

- `canApplyProgressionSuggestion` is true only when a valid target changes at least one incomplete editable row;
- `applyProgressionSuggestion` returns immediately when the action cannot change the workout;
- `TrainingSessionAuthority` detects content equality and returns `.unchanged` without persisting or increasing revision.

Exact pre-apply state after superset pairing:

| Field | Value |
|---|---|
| Contextual previous rows | `[80 lb × 15, 80 lb × 15]` |
| Contextual recommendation | `80 lb × 15` |
| `progressionChoice` | `.previous` |
| `canApplyProgressionSuggestion` | `false` |
| Authority revision | `1` |
| Matching apply outcome | `.unchanged(revision: 1)` |
| Persisted draft after matching apply | exactly unchanged |

This is the required Build 93 product behavior: **Use Suggestion is enabled only when it will actually change the workout.** Reverting product code to satisfy the old assertion would reintroduce the Logger bug.

## Test-only correction

The repaired Watch-projection test now covers both sides of the boundary:

1. Pairing produces two `80 × 15` rows and a matching `80 × 15` recommendation.
2. It asserts `canApplyProgressionSuggestion == false`.
3. It applies the matching recommendation and requires `.unchanged`, identical draft content, `.previous`, and no revision increase.
4. It edits only the first incomplete row from `80` to `75` through the real authority, producing revision `2`.
5. It asserts rows `[75, 80]`, recommendation actionability, and then applies the suggestion.
6. It requires `.applied(revision: 3)`, `.suggestion`, rows `[80, 80]`, the already-matching second row exactly unchanged, actionability disabled again, and Watch output `80 lb × 15`.

The adjacent completed-row guidance fixture now starts its incomplete row at `70 lb`; applying the `90 lb` recommendation is therefore actionable, while the completed `40 lb × 30` row remains unchanged and completed.

Diff boundary from `ac3def4c` to `9d0a2069`:

- one modified file: `ios/PhysiqueOSTests/TrainingLoggerTests.swift`;
- 36 insertions, 2 deletions;
- zero production files;
- `git diff --check`: PASS.

## Test evidence on `9d0a2069`

| Gate | Result |
|---|---|
| Corrected single Watch-projection test | PASS — 1/1 |
| `Build87SupersetHistoryContextTests` rebuilt containing suite | PASS — 14/14 |
| Focused `TrainingLoggerTests`, `TrainingLoadSemanticsTests`, `TrainingSessionAuthorityTests`, and `Build83FinishLifecycleTests` | PASS — 265/265 |
| Full iPhone `PhysiqueOSTests` unit target | PASS — 2,283 total; 2,281 passed; 2 skipped; 0 failed |
| Long iPhone UI suite | NOT RUN — explicitly excluded by assignment |

The full target used the rebuilt candidate test bundle with `test-without-building`, one simulator, and parallel testing disabled. It completed in approximately 157 seconds of Xcode test operation time.

## Storage and cleanup

| Stage | Available KiB | Available GiB |
|---|---:|---:|
| Initial triage preflight | 22,834,068 | 21.78 |
| After initial build/reproduction | 20,178,164 | 19.24 |
| Lowest measured after full unit result | 19,590,428 | 18.68 |
| After removing triage DerivedData, temporary result decoder, and disposable simulator | 20,833,540 | 19.87 |

The 12 GiB hard floor was preserved with more than 6.6 GiB measured margin at the low point. Only this run's regenerable Xcode artifacts, temporary decoder, and disposable simulator were removed. The verified iCloud archive, release archives 85–92, protected simulator, candidates, active worktrees, credentials, signing material, and production tooling were untouched.

## Candidate publication and release implications

Candidate `9d0a206908fc3c4a64976e9cc3840e23cab0ba55` is pushed non-force to `origin/codex/native-build93-final-integration-20261008` and is clean. Its app/production source is identical to `ac3def4c`; only the unit-test source differs.

The previous Option B release exception named exact Native SHA `ac3def4c`, so it does **not** automatically authorize releasing `9d0a2069`. The smallest safe release-resume authorization is:

1. explicitly designate `9d0a206908fc3c4a64976e9cc3840e23cab0ba55` as the replacement final Native Build 93 candidate;
2. accept this fresh 2,283-test full iPhone unit result for that SHA;
3. retain Server candidate `e03f6768627f49175c476208eca79c99ae3d5ee9` and its unaffected Server evidence subject to normal immediate preflight;
4. run the already-approved exact Option B 12-test iPhone UI matrix on `9d0a2069`, then every still-mandatory Watch, Release, signing, archive, deployment, and TestFlight gate;
5. continue to stop on any new failure or unsafe storage condition.

Because the application source did not change, prior app-source-equivalence evidence may be reconciled explicitly, but no exact-SHA approval or remaining release gate is implicitly waived.

## Safety record

- No Server deployment, production mutation, Recovery activation, DEXA recovery, archive, export, TestFlight upload, build bump, or release-pointer update occurred.
- No UI suite was run.
- Production code is unchanged.
- The Native candidate branch was updated only by the isolated test commit.

**Bounded triage complete.** Build 93's progression-suggestion product behavior is correct, the stale Watch-projection fixture is corrected, and the full iPhone unit target is green on the published test-only candidate. Release work remains paused pending explicit SHA reconciliation and the remaining approved gates.

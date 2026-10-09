# Build 93 verified cloud-duplicate cleanup + release attempt — iPhone unit gate STOP

**Recorded:** 2026-10-09T16:03:23Z  
**Assignment:** `agent-handoffs/inbox/prompts/20261009-codex-build93-verified-cloud-duplicates-storage-unblock.md` at `4bdaeefb101a903a7da5f13843db91086fad14ea`  
**Decision:** **STOP — the mandatory full iPhone unit target failed. No deployment, archive, or upload occurred.**

## Executive result

The Founder-authorized cleanup completed within the sealed boundary. Before deleting anything, the iCloud archive, manifest, every one of the 2,985 source/destination pairs, job ownership/inactivity, file type, path containment, lack of symlink traversal, lack of open descriptors, and File Provider upload state were independently reverified. Only the exact manifest-listed local originals were removed. The iCloud archive and manifest remain intact and retrievable.

APFS availability rose from **20,433,156 KiB (19.49 GiB)** to **22,797,640 KiB (21.74 GiB)** immediately after the bounded deletion. The measured conservative projection then cleared the 12 GiB hard floor, so the serialized Build 93 gates began.

All fresh Server gates passed, Native project generation was deterministic, and the cold iPhone `build-for-testing` passed. The next mandatory gate—the complete `PhysiqueOSTests` target—executed 2,283 tests and reported one failed test with two assertion failures. The failing Build 87-era Watch-projection test expects applying a progression suggestion to mutate state even when the Build 93 no-op guard correctly determines that the suggestion would change nothing. Because the assignment says to stop on any failed gate, the run stopped immediately. The approved 12-test iPhone UI matrix, Watch gates, Release/archive/signing gates, guarded Server deployment, and TestFlight upload were not run.

The release was not waived or retried. Production remains on the prior Server deployment and App Store Connect remains on Build 92 `VALID`.

## Authority and candidate identity

| Check | Result |
|---|---|
| Assignment on `origin/main` | `4bdaeefb101a903a7da5f13843db91086fad14ea` — matched before operation |
| Native candidate | `ac3def4ce6941138719f3a39c7cbbfc521b29eb0` — exact local/remote identity; clean before and after |
| Server candidate | `e03f6768627f49175c476208eca79c99ae3d5ee9` — exact local/remote identity; clean before and after |
| Release configuration | `1.0 (93)` |
| Xcode coordination | No active Xcode runner before the serialized lane; no concurrent Xcode use was started |
| Release authority | Conditional only; deployment/upload authority never activated because a mandatory gate failed |

## Exact cloud-backed duplicate cleanup

The retained cloud manifest is:

`iCloud Drive/PhysiqueOS Archive/Reference/20261009-Build93-Storage-Offload/MANIFEST.tsv`

| Integrity item | Result |
|---|---:|
| Manifest SHA-256 before deletion | `12f45113c920f501588fccc62ef236312ec6dd16f5357f950432fc3ad1e1cb8f` |
| Manifest rows | 2,985 payload rows plus one header |
| Verified source/destination pairs | 2,985 / 2,985 |
| Verified logical payload | 1,345,945,641 bytes |
| Structural/path/hash failures | 0 |
| Removed local originals | 2,985 |
| Removed logical bytes | 1,345,945,641 bytes (1.254 GiB) |
| Remaining manifest-listed local originals | 0 |
| Retained cloud payload files | 2,985 / 2,985 |
| Retained cloud payload bytes | 1,345,945,641 |
| Manifest SHA-256 after deletion and after testing | unchanged, exact |

The live File Provider check before deletion reported the archive uploaded, not uploading, not paused, and free of unresolved conflicts. The final manifest check after testing reported `isUploaded=1`, `isUploading=0`, `isDownloaded=1`, `isMostRecentVersionDownloaded=1`, `isKeepDownloaded=0`, `hasUnresolvedConflicts=0`, and `isSyncPaused=0`.

The reviewed deletion code accepted only regular non-symlink files rooted below the eleven sealed Claude job `tmp` directories, required exact source and destination hashes immediately before each removal, rejected duplicate or traversal paths, and rehashed the entire retained cloud payload after deletion. No wildcard or directory-level deletion was used for the source files.

### Manifest allocation by inactive/completed source job

| Job | Files | Logical bytes |
|---|---:|---:|
| `b4dd295e` | 278 | 260,486,650 |
| `82438284` | 893 | 353,812,133 |
| `d8d307bb` | 610 | 212,057,040 |
| `f87d0b65` | 297 | 171,110,382 |
| `8295c04d` | 318 | 153,044,555 |
| `31dadeef` | 248 | 67,702,712 |
| `a1ff96e7` | 154 | 35,707,621 |
| `a4bc60c7` | 85 | 26,935,053 |
| `8d13e5c8` | 22 | 34,058,855 |
| `60223103` | 60 | 23,522,761 |
| `192e07a9` | 20 | 7,507,879 |

All source jobs were completed or independently verified inactive/superseded. No selected path had an open descriptor. Job metadata, prompts, logs, source trees, `ro`/`refs` trees, current Build 93 candidates/evidence, Founder data, archives, credentials, production tooling, active worktrees, and every file not listed in the sealed manifest were preserved.

## Storage trajectory and measured budget

All values are APFS available KiB from `df -k /`; GiB uses 1,048,576 KiB.

| Stage | Available KiB | Available GiB |
|---|---:|---:|
| Initial live preflight | 20,433,156 | 19.49 |
| After exact local-original deletion | 22,797,640 | 21.74 |
| After Server gates and Server artifact cleanup | 22,719,060 | 21.67 |
| After fresh iPhone simulator creation | 22,398,532 | 21.36 |
| After cold `build-for-testing` | 20,203,864 | 19.27 |
| During iPhone unit result capture | 18,937,388 | 18.06 |
| Final after removing this run's DerivedData, incomplete result bundle, temporary decoder, and disposable simulator | 22,886,316 | 21.83 |

Measured APFS gain immediately after the exact deletion was **2,364,484 KiB (2.25 GiB)**. This exceeds the 1.254 GiB logical source payload because APFS availability also settled/reclaimed pending space; the logical deletion and measured filesystem delta are intentionally reported separately.

Before heavy testing, the conservative projection was:

`21.74 GiB current - 5.26 GiB cold build - 2.00 GiB targeted UI - 1.25 GiB uncertainty = 13.23 GiB projected low`

That was 1.23 GiB above the mandatory 12 GiB floor. The actual observed low before the gate stop was 18.06 GiB. Storage did not fail the run.

## Fresh Server gate evidence

All Server work was against exact clean candidate `e03f6768` and was serialized before Xcode.

| Gate | Result |
|---|---|
| Focused Build 93 Server selection | PASS — 16 files, 264/264 tests |
| HealthKit strategic read boundary | PASS — 5/5 |
| Broad relevant baseline | PASS against accepted baseline — 1,868 passed, 15 known baseline failures, 3 skipped; no new failures |
| Changed-file ESLint | PASS — 37 JavaScript/JSX files |
| `git diff --check` | PASS |
| Production build | PASS — TypeScript clean and 50/50 routes generated |
| Drift scan | PASS — no migration, schema, dependency-lock, infrastructure, or deployment-file drift |
| Post-gate cleanup | `.next` removed and temporary dependency link detached; candidate clean |

The initial broad Vitest invocation selected the Storybook configuration and found no tests. This was a command/configuration selection error, not a product test failure; it was corrected to the repository's unit configuration before the recorded focused and broad results above.

## Native gates and failed mandatory unit gate

| Gate | Result |
|---|---|
| Project generation, run 1 | PASS |
| Project generation, run 2 | PASS; identical project hash `f38c5dd889f10a1453a8b0d181e4dd9c0260ef3a6c1a9f5dccf442e51c11ef53` |
| Reserved generator blocks | PASS — `0x20FF` and `0x21FF` present |
| Release identity | PASS — `1.0 (93)` |
| Fresh isolated device | iPhone 17 Pro, iOS 27; disposable simulator created for this run only |
| Cold `build-for-testing` | PASS — `** TEST BUILD SUCCEEDED **` |
| Full iPhone unit target | **FAIL — 2,283 tests executed, 2 skipped, 2 assertion failures in one test, 91.346 seconds** |

Exact failed test:

`Build87SupersetHistoryContextTests/testTheWatchProjectionShowsTheAppliedContextualSuggestion()`

Exact assertions:

1. `TrainingLoggerTests.swift:3017` — actual `progressionChoice` remained `.previous`; the older test expected `.suggestion`.
2. `TrainingLoggerTests.swift:3022` — actual `currentRevision` remained `1`; the older test expected it to be greater than `1`.

The Build 93 Logger correction deliberately makes `applyProgressionSuggestion` a true no-op when it cannot change any editable workout row. In this test, superset pairing has already refreshed the completion target to the contextual recommendation (`80` / `15`) before the suggestion is applied. The guarded apply therefore leaves both choice and revision unchanged. That behavior is consistent with the new Build 93 actionability contract, but the older Build 87 Watch-projection test was not reconciled and still requires a mutation for a no-op.

The Xcode test process emitted the complete suite summary and both assertion records, then hung while finalizing its result log. It was terminated only after the failed result was definitive. The two assertion records were independently recovered from the result store before the incomplete bundle was removed. No test was rerun and no failure was waived.

### Narrow correction required before a new release attempt

Preserve the production implementation. Update only this stale test so its setup creates a real actionable difference before calling `applyProgressionSuggestion`—for example, change one incomplete target row away from the recommendation, reacquire the pre-apply draft, assert `canApplyProgressionSuggestion == true`, then verify `.suggestion`, the corrected Watch projection, and a revision increase. A separate assertion should retain the no-op invariant when rows already match. After review, rerun the complete iPhone unit target and every remaining retained release gate from the stop point; do not simply waive this failure.

## Release gate ledger

| Gate | Status |
|---|---|
| Exact cloud-backed duplicate cleanup | PASS |
| 12 GiB storage floor and conservative projection | PASS |
| Exact candidate identity and cleanliness | PASS |
| Server focused/broad/lint/build gates | PASS |
| Native generation/release identity | PASS |
| Cold iPhone build-for-testing | PASS |
| Full iPhone unit target | **FAILED — release STOP** |
| Approved exact 12-test integrated iPhone UI matrix | NOT RUN — stopped at units |
| Credited exact-final Energy 1/1 and mapped prior 93/93 evidence | Retained, but insufficient to override failed units |
| Widget/Recovery/Sandbox release ledger completion | NOT CLAIMED — full unit target failed |
| Full Watch units and 11 Watch UI methods on both sizes | NOT RUN |
| Generic Release, seam scan, signing/export/archive readiness | NOT RUN |
| Guarded Server deployment | NOT EXECUTED |
| Build 93 archive/TestFlight upload | NOT EXECUTED |
| Release pointer updates | NOT EXECUTED |

## External state after STOP

- DigitalOcean app `bf57cf56-48cc-4cd6-90e4-a23ee5381741` remains on deployment `32143aa4-90d4-496a-81b2-17f35a609fde`, phase `ACTIVE`, with nothing in progress.
- Production `/api/v1/health/live` remains `ok`, build `physiqueos-84cc64e4-20261008`.
- Production `/api/v1/health/ready` remains `ready`, 9/9 checks ready, including `PROVIDER_MIGRATION_000014_APPLIED` and runtime authority.
- App Store Connect delivery `56b0c334-b8f5-42e4-979b-78e68a6d0573` remains Build 92, `VALID`, imported, and present on App Store Connect.
- No Build 93 deployment or upload was created. Recovery was not activated. No production data, schema, environment, release pointer, Founder weight/DEXA/history record, or build number was changed.

## Final state

**STOP.** The bounded storage operation is complete and verified, but Build 93 is not release-ready because a mandatory iPhone unit gate failed. The next authorized work should be a separately reviewed, test-only reconciliation of the stale Build 87 expectation followed by a fresh gated release attempt against the exact candidates (or newly authorized replacement SHA). No deployment or TestFlight action should occur until that full attempt is green.

# Build 90 Native integration candidate: READY FOR BUILD 90 RELEASE BUMP

**Task:** `build90-native-integration-20261007`. The prompt is `agent-handoffs/inbox/prompts/20261007T003000Z-claude-build90-native-integration.md`, at commit `17594af7`.

**Status:** the Build 90 Native integration candidate is validated and ready for release-bump authorization. This is a report-only publication: `latest.json` is unchanged, and Build 89 remains the release authority.

## Candidate
| Item | Value |
|---|---|
| **Integrated SHA** | `8fab4fcb6be2c2c9d9f0f87b1123a6e49337fdbd`. Code is identical to the merge `9763ab23`; the extra commit adds only a proof doc. |
| Branch | `claude/native-build90-integration-candidate-20261007` (pushed, verified, clean tree) |
| Parents / inputs | Build 89 `51399425`; Claude A `a14eb4c45ee602025cc7d666c96956b7972beac1`; Claude B `8c3172e1e2493b025114f12cd8b0bdf2c58d484e` |
| Method | Two `--no-ff` merges of the exact SHAs: A → `ae869c28`, then B → `9763ab23`. Both auto-resolved; no semantic conflict resolution was needed. |
| Shared file | `AppEnvironment.swift`, disjoint hunks, both kept. Claude A adds the Watch companion and launcher; Claude B adds the DEBUG Energy/Recovery fixture wrappers. |
| Exactness | `HEAD − A` equals B's set, and `HEAD − B` equals A's set. Every A-only and B-only file is byte-identical to its candidate. No foreign commits. |
| Changed | 23 iOS files (+3945/−1375). No pbxproj or generator change. |
| Version | **1.0 (89) unchanged** in the app, the Watch app and the Live Activity/Widget extension (pre-bump). |

The proof doc is `agent-handoffs/artifacts/build90-native-integration-candidate-20261007/README.md` on the branch.

## Validation
| Gate | Result |
|---|---|
| Focused iPhone (authority, Logger, rest, live projection, Build 83, Live Activity ×4, Briefing V3, Photo ×2, Energy, Recovery/Sleep ×2, AppTab) | **502 / 0** (1 designed skip) |
| Full PhysiqueOSTests | **2159 / 0** (1 designed skip) |
| Watch unit | **59 / 0** |
| Watch UI, 49 mm and 42 mm | 6/7 each. The single failure is `testFinalSetFinishShowsConfirmation…` at `WatchWorkoutNavigationUITests.swift:89`. **Reproduced identically on an exact `git archive` of Build 89**: same line, same assertion, test file unchanged. This is the known no-WCSession harness limitation; no new failure. |
| Full iPhone UI suite | All classes passed in the final summary (72 tests, 0 failures, but exit 65). See the note below the table. |
| Generic iOS Release | **SUCCEEDED**. The embedded Watch app (arm64 + arm64_32) and the Live Activity/Widget extension are present, all at 1.0 (89). |
| `verify_release_configuration.py` | OK |
| Release seam scan | **0** launch-flag seam strings (`-physiqueos.*`, `-watch*`) and **0** review/fixture type names in the app, Watch and Live Activity binaries. The broad "evidence-review" hits are pre-existing production command IDs. Positive controls in Release (3) and Debug (47). |
| `git diff --check` | Clean |

**iPhone UI note:** one test, `EnergyRecoveryRedesignUITests.testRecoveryBackLabelsFollowTheRealParentAndAllNightsPages`, failed once: an 8 s wait for the Trends screen, after which the runner restarted. Re-run alone, the class passed **7/7 twice**. The failure was not reproducible.

## Content confirmed
- **Claude A:**
  - B90-1 A: docked clock, WORKOUT/REST, canonical End Rest, no phone Pause/Resume, Build 83 hide.
  - B90-2 B: centered handoff; truthful `startWatchApp`; Use without Watch with no re-prompt; dismissal only on `watchStartedAt`; On Watch chip; Ready card removed.
  - B90-3 B: centered photo group, bounded stage, labels on the photos, canonical interpretation card, synchronized zoom and pan.
  - B90-4 A: true-centered Watch actions at 49 and 42 mm.
  - All three defect fixes: the Ready/start-clearing guard, appearance-slot forwarding, fractional `startedAt` parsing.
- **Claude B:** all approved Energy and Recovery/Sleep behavior, byte-identical to `8c3172e1`.
- **DEXA:** the appointment dead end is unchanged and **backlogged to OP-A**.
- **Excluded:** Codex progression and access work, Operating Plan and DEXA redesigns, and all unrelated backlog.

## Storage
| When | Free space |
|---|---|
| Start | 23.13 GiB |
| After safe reclaim | 23.63 GiB |
| At validation start (other sessions freed space) | 28.16 GiB |
| Lowest during validation (shared machine) | 14.63 GiB |
| After removing this lane's DerivedData and Release products | **21.88 GiB** |

- **What I reclaimed:** I erased only this lane's own three shut-down dedicated simulators.
- **What I left alone:** default DerivedData was already empty. The booted LaneB simulator, Codex's simulator and other jobs' directories were in use or uncertain, so I did not touch them.
- **Never deleted:** no Archives, worktrees, source or boards.

## Server: unexpected finding
- **What changed:** production Server is **no longer** `b7eb1e39`. During this task, the separate Codex lane deployed **Adaptive Training Progression V1**: `1b6687ff`, deployment `cbe6be96`, ACTIVE at 01:57Z (handoff `19da1d13`, report `d65f60f6`).
- **Current health:** confirmed read-only, health live 200.
- **Native impact:** that report states Native Build 89/90 was not touched. This candidate includes none of that work and needs no Native change.
- **My actions:** I did not deploy and did not mutate production.

## Physical-device acceptance checklist
The full list is in the proof doc. In summary:
1. Logger phone-only clock and End Rest.
2. Phone, Live Activity and Watch rest synchronization.
3. Handoff with an unlocked Watch.
4. Handoff with a locked or off-wrist Watch.
5. Use without Watch never re-prompts.
6. Photo pair on real media.
7. Watch centering and live appearance change.
8. Energy wording, kcal, Try again and Details/Hide.
9. Recovery/Sleep window, floor, summaries and navigation.

## Recommendation
**READY FOR BUILD 90 RELEASE BUMP.**

The next step needs Founder authorization:
1. Bump to 90 (APP_BUILD_NUMBER, CURRENT_PROJECT_VERSION ×8, the TrainingLoggerTests pin).
2. Regenerate.
3. Post-bump gates.
4. Archive from `8fab4fcb` plus the bump.
5. Guarded upload.

## Not done (by design)
No build bump, no archive, no TestFlight upload, no Server deploy, no production mutation.

# Post-Build 93 Mac storage housekeeping

- **Recorded:** 2026-10-10T00:37:12Z (2026-10-09 17:37 PDT)
- **Authority:** `agent-handoffs/inbox/prompts/20261009-codex-postbuild93-mac-storage-housekeeping.md` at `a7970f7f814cf0eeb2ad7bf0d9a4d80fb1d317be`
- **Result:** COMPLETE — safe boundary reached with more than 30 GiB free

## Outcome

The post-restart inventory began with 32,367,924 KiB (30.87 GiB) available on `/System/Volumes/Data`, already above the 30 GiB target. Cleanup therefore stayed narrow. Two completed Build 93 candidate worktrees were proven inactive, clean, free of untracked/ignored evidence, unused by live processes, and represented by preserved local branches plus reachable origin refs. They were removed through `git worktree remove` without force.

Final availability was 32,749,984 KiB (31.23 GiB). The measured APFS gain was 382,060 KiB (0.36 GiB); the removed checkouts contained 460,932 KiB (0.44 GiB) logically. APFS accounting is reported separately from logical deletion.

No Build 94 artifact, simulator, worktree, or current modification was removed. No Claude session, archive, credential, signing item, production tool, unique evidence, branch, commit, or personal data was removed. No build, test, deployment, production mutation, release-pointer change, archive, or TestFlight action was run.

## Storage measurements

| Stage | Available KiB | Available GiB |
|---|---:|---:|
| Initial inventory | 32,367,924 | 30.87 |
| Before second managed removal | 32,667,496 | 31.15 |
| Final settled verification | 32,749,984 | 31.23 |
| Measured gain | 382,060 | 0.36 |

`df -h` rounded both `/` and `/System/Volumes/Data` to 31 GiB available at completion. No local Time Machine snapshots were present.

## Exact deletion manifest

Both paths were ordinary `dustinginn:staff` directories. Both had empty tracked/untracked/ignored status, no open descriptors, no active Claude/Codex/Xcode ownership, and exact HEADs reachable from refreshed origin refs. The source branches were retained.

| Logical KiB | Removed checkout | Preserved branch | Preserved HEAD | Remote representation |
|---:|---|---|---|---|
| 380,088 | `/Users/dustinginn/.codex/worktrees/build92-morning-checkin-context/native-production-read-foundation` | `codex/native-build93-logger-suggestion-actionability-20261008` | `f92f2291b403cf0839d9c01d8125de5166bff48e` | `origin/codex/native-build93-logger-suggestion-actionability-20261008` |
| 80,844 | `/Users/dustinginn/.codex/worktrees/build93-dexa-reminder-capability/native-production-read-foundation` | `codex/build93-server-integration-candidate-20261008` | `d2b39b6d283d1033c8894e96c9720039befdd881` | exact HEAD reachable from `origin/codex/build93-server-integration-candidate-20261008`, `origin/codex/build93-final-server-integration-20261008`, and other current DEXA/server refs |

The tiny Codex container metadata directories and their `.codex-worktree-name` files were retained; only Git-managed checkouts were removed. No branch was deleted.

## Inventory and protected state

### Build 94

The active Build 94 integration worktree remained at `b1535c7d558a7e16a4098110c575de26734840bb` on `codex/native-build94-integrated-candidate-20261009`, with its five current modified files unchanged. The two Option B worktrees remained registered and unchanged:

- `/Users/dustinginn/.codex/worktrees/home-secondary-option-b/native-production-read-foundation`
- `/Users/dustinginn/.codex/worktrees/home-secondary-option-b-report/native-production-read-foundation`

The current Build 94 test/evidence material under `/private/tmp/physiqueos-option-b-*` was preserved. It occupied 1,228,484 KiB (1.17 GiB), led by the 960,168 KiB DerivedData tree and 263,176 KiB stress result bundle. The simulator-diagnostics process observed during the initial inventory had completed by final verification, but these artifacts remain owned by the active Build 94 lane and were not reclassified as disposable.

### Simulator

The only installed simulator is `B91 Evidence iPhone 17 Pro` (`B84D6637-58FA-4671-BDB1-96D0EFFD6136`). It was shut down at final inventory but had been used minutes earlier by the current Build 94 Option B validation and contains protected evidence/state. Its CoreSimulator root occupied 4,163,480 KiB (3.97 GiB). It was preserved.

### Claude and production tooling

The persistent Claude daemon remained alive. These two sessions were actively working before and after cleanup and their worktrees were untouched:

- `a2964f7f-9f10-4970-b95c-431a02c529d4` — Claude B Briefings — Build 93 Recovery
- `fa6c944a-1d91-40c8-b47e-a69405dd6002` — PhysiqueOS Goal Intelligence Architecture Audit

All other Claude session history, job data, and registered Claude worktrees were preserved, including blocked/recoverable sessions. The `.claude/jobs` tree (1,799,708 KiB), Claude worktrees (3,121,916 KiB), DigitalOcean read-only/console runner checkouts, credentials, and production tooling were untouched.

### Xcode and release archives

Shared Xcode DerivedData contained zero allocated KiB at inventory. No `xcodebuild`, `xctest`, `XCTRunner`, `swift-frontend`, `XCBBuildService`, or `simctl diagnose` process remained at final verification.

All release archives were preserved:

- Build 85 `b8ee8690`
- Build 86 `cec8af20`
- Build 87 `f66c7fc6`
- Build 88 `7fce3b97`
- Build 89 `51399425`
- Build 90 `32baf1d5`
- Build 91 `106f0518`
- Build 92 `beaf5eff`
- Build 93 `9d0a2069`

The archive root occupied 1,050,216 KiB. The signed Build 93 archive remains at `/Users/dustinginn/Library/Developer/Xcode/Archives/2026-10-09/PhysiqueOS-Build93-9d0a2069.xcarchive`.

## Items inspected and deliberately skipped

| Item | Approximate logical size | Reason retained |
|---|---:|---|
| Active Build 94 Option B temporary build/test evidence | 1.17 GiB | Current lane ownership and unique validation evidence |
| Build 91/Build 94 evidence simulator | 3.97 GiB | Used minutes before inventory; current evidence state |
| Codex runtime cache | 1.52 GiB | Loaded runtime dependency for active Codex work |
| Claude job data | 1.72 GiB | Active sessions plus retained session/evidence data |
| Registered Claude worktrees | 2.98 GiB | Active, recoverable, or evidence-bearing sessions; not safe to bulk-remove |
| `full1.xcresult` in completed Progress Photos job | about 44 MiB parent scratch | Older unique test evidence, not Build 93 disposable output |
| Browser/system/CloudKit caches | about 0.38 GiB total cache root | Outside bounded PhysiqueOS developer-artifact authority or actively managed by apps/system |
| Every Xcode archive | 1.00 GiB | Explicitly protected release evidence |

## Remaining safe opportunities

The best future reclaim is deferred until Build 94 completes:

1. Review and remove the current `/private/tmp/physiqueos-option-b-*` DerivedData/result bundles once their report and evidence are durably published (currently 1.17 GiB).
2. Review the three Build 94/Option B worktrees after the candidate is pushed and all owning Codex tasks are complete (currently about 1.43 GiB combined checkout size).
3. Retire the 3.97 GiB evidence simulator only after Build 94 physical/review needs and any unique simulator evidence are explicitly closed.
4. Perform owner-by-owner review of older Claude worktrees/job evidence; do not bulk-delete session state.

No further deletion was justified while the machine already had durable 30+ GiB headroom. The remaining large classes are active, protected, ambiguous, or carry disproportionate recovery/evidence risk.

## Final verification

- The two removed local branches and exact commits remain present and remote-reachable.
- Registered worktrees no longer include the two removed checkouts.
- Build 94 integration and Option B worktrees remain present; active modifications are unchanged.
- The current simulator and all `/private/tmp/physiqueos-option-b-*` artifacts remain present.
- Both active Claude sessions remain `working` on the same session IDs and paths.
- All nine Build 85–93 archives remain present, including the signed Build 93 archive.
- `agent-handoffs/latest.json` and `agent-handoffs/latest.md` were not modified.
- Production, deployment, release authority, TestFlight, credentials, and signing state were not touched.

**STOP.** Housekeeping is complete at the safe boundary with 31.23 GiB available.

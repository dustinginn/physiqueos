# Build 93 storage-unblock cleanup — HOLD

- Date: 2026-10-09
- Authority: `agent-handoffs/inbox/prompts/20261009-codex-build93-storage-unblock-cleanup.md` at `e0c9a818596f7ef99b145f3395c382a504108048`
- Scope: storage inventory and safe cleanup only
- Result: **HOLD** — the 25 GiB minimum was not met
- Native candidate preserved: `ac3def4ce6941138719f3a39c7cbbfc521b29eb0`
- Server candidate preserved: `e03f6768627f49175c476208eca79c99ae3d5ee9`

## Executive result

The remaining exact deletion set allowed by the assignment is empty. Prior cleanup had already removed the isolated Build 93 DerivedData, result bundles, and disposable simulator data that could be proven lane-owned. The remaining large items are protected evidence, registered worktrees, archives, shared/global caches of uncertain ownership, completed-job evidence, or personal/system data.

No deletion command was executed. No process was killed, no privileges were changed, and no broad cache or simulator prune was attempted. No build, Xcode test, archive, deployment, TestFlight upload, release-pointer change, production mutation, or Recovery activation occurred.

## Capacity measurement

`df -k` was captured against both `/` and `/System/Volumes/Data`; both APFS views reported the same available-block count.

| Measurement | UTC | Available KiB | Available GiB |
|---|---:|---:|---:|
| Before inventory | 2026-10-09T13:14:42Z | 11,881,960 | 11.33 |
| After inventory and temporary-worktree removal | 2026-10-09T13:21:39Z | 13,229,380 | 12.62 |
| Observed APFS change | — | +1,347,420 | +1.29 |

- Logical bytes deleted by this task: **0**.
- The +1.29 GiB APFS change is live-system/purgeable-space fluctuation, not deletion credit.
- Shortfall to the 25 GiB minimum: 12,985,020 KiB (12.38 GiB).
- Shortfall to the preferred 30 GiB target: 18,227,900 KiB (17.38 GiB).

Earlier in the same inventory window, availability fell from 11,881,960 KiB to 11,676,568 KiB and then rose to 13,229,380 KiB without deletion. That volatility is why this report keeps logical deletion separate from APFS availability.

## Dry-run deletion decision

### Eligible exact deletion list

Empty. Nothing remaining met all of these conditions simultaneously: inactive, Build 93 lane-owned, regenerable, unnecessary as report/test evidence, and outside every protected class.

Because the exact deletion list is empty, target owner/symlink fields are not applicable. As part of exclusion checks, the Build 93 job scratch root and the ambiguous Watch device root were confirmed as ordinary directories owned by `dustinginn`; neither had an open descriptor. The Watch tree contains internal symlinks, reinforcing the decision not to remove it by filesystem path.

### Examined but excluded

| Item | Logical size | Decision |
|---|---:|---|
| Completed Build 93 Claude job `a2964f7f` scratch | 255,980 KiB | Preserved. It is dominated by locked UI screenshots, validation JSON, and test logs; these are necessary test evidence. The job is `done` as of `2026-10-09T12:21:07.121Z`, and its former lock PID is no longer live, but its registered Recovery worktree remains protected. |
| Xcode DerivedData root | 262,532 KiB | Preserved. Remaining bytes are shared SDK/module/compilation caches; PhysiqueOS project directories are empty. Ownership is global/ambiguous, not isolated Build 93. |
| `full1.xcresult` in Claude job `9a1c3d59` | 44,924 KiB parent scratch | Preserved. It belongs to an older Progress Photos job, not Build 93. |
| Apple Watch Series 12 (42 mm) simulator `8E51BA0A-A42A-4325-ADF4-BC100CFA00B3` | 343,260 KiB | Preserved. It is shut down but predates the completed Build 93 job and could not be proven unpaired or Build 93-owned. |
| `B91 Evidence iPhone 17 Pro` simulator `B84D6637-58FA-4671-BDB1-96D0EFFD6136` | 4,388,476 KiB | Protected evidence simulator; untouched. |
| Build 85–92 archives | 924,632 KiB total at inventory | Protected release evidence; untouched. |
| Xcode distribution pipeline scratch | approximately 111 MiB | Preserved. It may be Build 92 distribution evidence, not Build 93 scratch. |
| Shared user/developer caches | see options below | Preserved because ownership and downstream impact are not safely attributable to this lane. |
| Registered Codex/Claude worktrees | 65 at pre-publication inventory | Protected source/worktree state; untouched. |

No local Time Machine snapshots were present. No isolated Build 93 `.xcresult`, non-empty PhysiqueOS DerivedData directory, or Build 93 disposable simulator remained.

## Process and job coordination

- No `xcodebuild`, `xctest`, `XCTRunner`, `swift-frontend`, `XCBBuildService`, `actool`, `ibtool`, `altool`, or `Transporter` process was found by exact-name process checks.
- Claude Build 93 Recovery job `a2964f7f` reports `done`, with detail `UI suite 93/0 green after Sandbox reset fix; ready for Build 93`.
- The prior Claude worktree lock PID `2359` is no longer live.
- The registered Claude Recovery worktree and all other registered worktrees were still treated as active/protected ownership boundaries.
- No Xcode usage was initiated, so there was no conflict with Claude's Recovery lane.

## Candidate and protected-inventory verification

- `/private/tmp/physiqueos-build93-native` is clean at exact candidate `ac3def4ce6941138719f3a39c7cbbfc521b29eb0`.
- `/private/tmp/physiqueos-build93-server` is clean at exact candidate `e03f6768627f49175c476208eca79c99ae3d5ee9`.
- Pre-publication registered-worktree manifest SHA-256: `0055590269a546d5d54ad41c6cce41ab93b7d8f317be65035b817399ba418cc5`.
- Build 85–92 archive-path manifest SHA-256: `ac991e4edef2544fd2fd5e6ed8afbb578a9663c0d59a7a70bf5443ff480d24ff`.
- Archives present and untouched:
  - Build 85 `b8ee8690`
  - Build 86 `cec8af20`
  - Build 87 `f66c7fc6`
  - Build 88 `7fce3b97`
  - Build 89 `51399425`
  - Build 90 `32baf1d5`
  - Build 91 `106f0518`
  - Build 92 `beaf5eff`
- The current audit worktree and both exact candidate worktrees were clean before report creation. No Founder manual changes were found in those three inspected worktrees.

The temporary report-publication worktree was removed after the report commit and before publication. The post-removal registered-worktree manifest matched the recorded pre-publication value.

## Ranked remaining options — separate Founder permission required

These are options for a later task, not authorization to act now.

1. **App-managed review/archive of inactive registered worktrees — up to 7,744,696 KiB (7.39 GiB logical).** Codex worktrees account for 4,016,656 KiB and Claude worktrees for 3,728,040 KiB. Each owner and untracked state must be checked; use managed archival, never raw deletion.
2. **Selective review of completed Claude job scratch — up to 2,210,868 KiB (2.11 GiB logical).** This includes evidence from multiple released builds and 255,980 KiB of Build 93 validation material. Permission must identify which evidence may be discarded.
3. **Review shared caches individually — up to 4,609,944 KiB (4.40 GiB logical before exclusions).** Inventory: `~/.cache` 1,595,656 KiB, `~/.local` 925,356 KiB, `~/Library/pnpm` 865,084 KiB, `~/Library/Caches` 574,200 KiB, `~/.npm` 387,116 KiB, and Xcode shared DerivedData caches 262,532 KiB. These are not all disposable caches; ownership and rebuild/network impact require separate review.
4. **Confirm pairing/ownership of the shutdown Watch simulator — 343,260 KiB (0.33 GiB logical).** Delete only after it is proven unpaired and not evidence-owned.
5. **Founder-managed storage outside this lane.** Even the reviewed developer options may not reliably produce the 17.38 GiB needed for the preferred target because logical deletion does not map one-for-one to APFS availability. Personal files, system sleep state, credentials, production tooling, archives, release evidence, and protected data remain out of scope.

## Readiness and rollback

**HOLD.** Available storage is 12.62 GiB, below both the 25 GiB minimum and the preferred 30 GiB target. Do not start the full Build 93 gate, deployment, archive, or upload from this state.

Rollback is not applicable to cleanup because no file or simulator was deleted. The only repository mutation is this additive report. Reverting its report commit would fully undo that publication without affecting candidates, production, or release state.

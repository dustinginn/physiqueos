# PhysiqueOS overnight Mac storage cleanup

Date: 2026-10-06 UTC

Task authority: `64b6ebb64fe3ad19124c0cb93d3d9c0f8738fea5`

Build 88 source authority: `7fce3b9708c063f3c6b58571778c595012b5de6d`

Scope: cleanup only; no source changes, builds, deploys, TestFlight actions, or session control

## Result

- Free space before: **30.83 GiB** (`32,326,888 KiB`; `df -h`: 31 GiB).
- Free space after cleanup: **38.02 GiB** (`39,864,544 KiB`; `df -h`: 38 GiB).
- Net free-space increase: **7.19 GiB**.
- Logical size deleted: **7.79 GiB** (`8,171,268 KiB`). The difference from the net measurement is APFS/accounting activity while the two overnight Claude lanes remained active.
- Standing floor satisfied: final free space is above both the 15 GiB hard floor and 20 GiB preferred reserve.

## Audit before deletion

- Enumerated active processes, open working directories, Claude job state, all registered Git worktrees, simulator devices/runtimes, Xcode artifacts, caches, and large PhysiqueOS paths before deleting anything.
- Xcode global DerivedData was already empty.
- Xcode Archives totaled about 423 MiB. The protected Build 88 archive was present at `~/Library/Developer/Xcode/Archives/2026-10-05/PhysiqueOS-Build88-7fce3b97.xcarchive` (113 MiB).
- CoreSimulator totaled about 11.28 GiB. Its three populated shutdown devices are named for recent Batch 2, Batch 3, and Evidence Reliability work, so they were treated as current/ambiguous.
- `~/.claude/jobs` totaled about 15.18 GiB. The largest job, `82438284`, was verified `done`, had no open file handles, and belonged to the completed Batch 3 / Build 88 lane. The two newly staged overnight lanes were separately verified `working` in their own worktrees.
- Forty-nine worktree registrations were initially visible: 45 existing checkouts plus four metadata entries whose `/private/tmp` checkouts no longer existed. During the audit, Claude A and Claude B created their two expected Build 88 worktrees, bringing the live checkout set to 47.

## Deleted

Only regenerable outputs inside completed Claude job `82438284` were deleted. Session state, timeline, logs, review images/packages, handoff material, source snapshots, and the canonical Xcode archive were retained.

- Eight job-local DerivedData directories (`dd`, `dd-release`, `dd-int`, `dd-preview`, `dd-base`, `dd-int-release`, `dd-archive88`, `dd-intw`): **6.10 GiB**.
- Stale test-result bundles (`results`, `gate-ui.xcresult`, `gate-unit.xcresult`, `b88/unit.xcresult`): **1.70 GiB**.
- Four stale Git worktree administrative entries were pruned only after a dry run proved their checkout paths were already absent:
  - `physiqueos-batch1-report-main`
  - `physiqueos-build85-native`
  - `physiqueos-build85-server`
  - `physiqueos-build87-report-main`

No worktree directory, branch, commit, source file, simulator, archive, credential, signing asset, iCloud material, or application cache used by an active process was deleted.

## Deliberately retained

- Build 88 archive and source authority: explicitly protected and re-verified after cleanup.
- Claude A worktree `overnight-lane-a-watch-live-priorities-20261006`, branch `claude/overnight-lane-a-watch-live-priorities-capture-20261006`: state `working`, intact at Build 88 base when checked.
- Claude B worktree `overnight-lane-b-briefings-redesign-20261006`, branch `claude/overnight-lane-b-briefings-redesign-20261006`: state `working`, intact at Build 88 base when checked.
- Blocked/resumable Claude jobs and their build data, including `a80bce44` and `f87d0b65`: ambiguous resume value, so preserved.
- All 47 live registered worktrees, including the persistent Remote Control hosts, dirty worktrees, and worktrees with commits not proven reachable from `origin/*`.
- All simulator device data: recent named devices may be needed by the active design lanes.
- Active Codex/Claude caches and runtimes: currently in use or operationally ambiguous.
- Build 85, 86, and 87 archives: recent release artifacts; low yield and no need to risk removing them after the target reserve was met.
- Signing identities/profiles/keys, App Store Connect credentials, release uploader/configuration, production access, Founder media/photos, database material, and iCloud backup material were outside the deletion set.

## Remaining large candidates requiring Founder decision

- Approximately 11.28 GiB of recent simulator device data. Delete individual devices only after confirming the associated Batch 2, Batch 3, and Evidence Reliability workflows no longer need them.
- Several GiB of DerivedData in blocked/resumable Claude jobs. These are technically regenerable but were retained because the sessions may resume.
- Roughly 3.8 GiB across active Codex application/runtime caches. Reclaim only during a coordinated Codex shutdown/restart window.
- The persistent Server checkout is about 2.0 GiB, primarily regenerable dependency material, but it is a Remote Control/production-development host and was left untouched.
- Numerous older clean, remote-reachable worktrees could be retired in a separate Founder-approved lifecycle pass; ambiguous, dirty, unpublished, or active worktrees must continue to be protected.

## Validation

- `git worktree prune --dry-run --verbose --expire now` returned no remaining stale entries after cleanup.
- `git fsck --connectivity-only` completed successfully with no missing/corrupt object report. Existing dangling objects were intentionally retained; no Git garbage collection was run.
- The current checkout remained at `9945d40ea89f68f0bd743c281fa8fe1e89a05b48` with the same pre-existing ahead/untracked status captured before cleanup.
- Build 88 commit exists and is an ancestor of `origin/main`; the exact protected archive still exists at 113 MiB.
- Both staged GH prompts were confirmed at `origin/main`:
  - `agent-handoffs/inbox/prompts/20261006T052100Z-overnight-claude-a-watch-live-priorities-checkin.md`
  - `agent-handoffs/inbox/prompts/20261006T052200Z-overnight-claude-b-briefings-redesign.md`
- Both corresponding Claude worktrees remained intact and `working`; neither session was started, paused, controlled, or killed by this cleanup lane.
- `latest.json` and `latest.md` were not modified.

STOP: safe cleanup is complete.

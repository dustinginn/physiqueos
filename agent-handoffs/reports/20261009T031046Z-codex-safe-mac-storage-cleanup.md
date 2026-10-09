# Safe Mac storage cleanup — HOLD below disk floor

Date: 2026-10-09T03:10:46Z  
Operator: Codex, existing Mac/operations conversation  
Governing task: `agent-handoffs/inbox/prompts/20261008-codex-safe-mac-storage-cleanup.md` at `5e8c157af8224eed18a1ed622367cf1384b18a13`  
Result: **bounded cleanup completed; HOLD remains because only protected or uncertain data remains and free space is below the 12 GiB task floor**

## Outcome

- Initial free space: **313,524 KiB (306 MiB)** on `/dev/disk3s1s1`.
- Final verified free space after APFS accounting settled: **10,111,120 KiB (9.6 GiB)** on both `/` and `/System/Volumes/Data`.
- Measured available-space increase: **9,797,596 KiB (9.34 GiB)**. This is the filesystem availability delta while another lane remained active; it is not represented as an exact block-for-block attribution.
- Exact logical content selected for deletion: **9,588,830,208 bytes (8.93 GiB)**, comprising 9,373,413,376 bytes of shutdown simulator device data plus 215,416,832 bytes of completed-job virtual environments. Simulator logs/metadata removed by CoreSimulator were additional and small.
- Requested 20 GiB target: **not reached safely**.
- Standing 15 GiB heavy-operation floor: **not reached**.
- Task-specific 12 GiB HOLD boundary: **not reached**. No further deletion was attempted once only protected or uncertain material remained.

No build, deployment, release, production mutation, process termination, Git cleanup, archive operation, or product-code change was performed.

## Inventory and concurrency proof

Before deletion, all registered Git worktrees, Claude/Codex job state, Xcode processes, CoreSimulator devices, DerivedData, Xcode Archives, and large Dustin-owned paths were inventoried.

The active Claude lane was and remained:

- Session: `a2964f7f-9f10-4970-b95c-431a02c529d4`
- Title: `Claude B Briefings — Build 93 Recovery`
- State: `working`
- Managed worktree: `/Users/dustinginn/Developer/PhysiqueOS/server/.claude/worktrees/build93-recovery-weekly-monthly-20261008`
- Active command at final verification: PID 54297, `xcodebuild test-without-building`, running against simulator `62C23ECC-4F7A-4096-85F9-4AE104DA0177` and DerivedData `/Users/dustinginn/.claude/jobs/a2964f7f/tmp/dd5`
- Active job storage retained: 4,331,800 KiB at the post-cleanup inventory point

The registered-worktree manifest SHA-256 was identical before and after cleanup:

`94e8db2cdd6675d125639111f9070fd28c3417fe5697e931deff2379fa6b71a6`

No process was killed, suspended, restarted, or signaled.

## Exact removals

All deletion targets were Dustin-owned directories, confirmed as real directories rather than symlinks, and printed in a bounded dry run before deletion.

### Completed shutdown simulator devices

Removed with `xcrun simctl delete` using these exact UUIDs:

1. `E95A598C-11DF-4781-B0AD-85C3923B9553` — `LaneB Briefings iPhone 17 Pro`, shutdown, 3,308,208,128 bytes of device data. Owning Claude job `b4dd295e` was `done`; its final detail records Lane B final candidate `156808fa`. The simulator's six media files were SHA-256-identical to the stock sample-photo set on retained simulators, proving no unique Founder media was removed.
2. `B0832DF3-49A7-4CCB-BEF0-6016B6477F8A` — `B91 OP iPhone 17 Pro`, shutdown, 3,471,364,096 bytes. Its only job references were in completed job `31dadeef`, whose final state records Build 91 implementation complete and full tests passing.
3. `2169D24C-F002-46FF-8693-82AB1482B854` — `B90 Watch S12 42mm`, shutdown, 952,279,040 bytes. It had no reference from the active Claude job and belonged to completed Build 90 work.
4. `13BE0B15-D548-4832-9B16-F583FB72DAFC` — `B90 Watch Ultra3 49mm`, shutdown, 1,641,562,112 bytes. It had no reference from the active Claude job and belonged to completed Build 90 work.

### Completed-job virtual environments

Removed these exact regenerable Python package installations from jobs whose state was `done`:

- `/Users/dustinginn/.claude/jobs/82438284/tmp/venv` — 56,780 KiB
- `/Users/dustinginn/.claude/jobs/b4dd295e/tmp/venv` — 43,708 KiB
- `/Users/dustinginn/.claude/jobs/31dadeef/tmp/venv` — 43,708 KiB
- `/Users/dustinginn/.claude/jobs/60223103/venv` — 43,700 KiB
- `/Users/dustinginn/.claude/jobs/a1ff96e7/tmp/venv` — 22,472 KiB

Blocked/resumable Claude jobs and their environments were not touched.

## Protected and verified intact

- Active B93 Harness simulator `62C23ECC-4F7A-4096-85F9-4AE104DA0177` remained booted and active.
- Booted B91 Evidence simulator `B84D6637-58FA-4671-BDB1-96D0EFFD6136` was treated as potentially active and retained.
- Shutdown generic Watch simulator `8E51BA0A-A42A-4325-ADF4-BC100CFA00B3` was retained because the active assignment includes Watch harness stabilization and ownership was not sufficiently separable.
- Active Claude DerivedData, `.xcresult` bundles, logs, screenshots, worktree and caches were retained.
- Global Xcode DerivedData (262,532 KiB) was retained because Xcode was actively testing and the contents were shared SDK/module caches.
- Every Xcode archive was retained and re-enumerated: Build 85, 86, 87, 88, 89, 90, 91 and 92.
- Registered Git repositories/worktrees, source, branches, uncommitted files, reports, visual review boards, credentials, signing/provisioning data, production tooling, `.tmp/digitalocean`, correction manifests, production backups, personal Messages/media, and Claude/Codex session data were not deleted.
- `agent-handoffs/latest.json` and `agent-handoffs/latest.md` were not modified.

## Safe-boundary decision

After the exact removals, the largest remaining Dustin-owned development consumers were protected:

- active Claude job: about 4.1 GiB;
- two booted iPhone simulators: about 7.0 GiB combined;
- registered Codex and PhysiqueOS worktrees/source;
- Claude/Codex session history and persistent host data;
- Build 85–92 archives and release evidence.

Other large Dustin-owned paths were personal data (notably Messages) or generic package/runtime stores whose ownership and current-session dependency could not be proven. They were left intact. There were no Time Machine local snapshots available to release, and the task explicitly limited mutation to files under Dustin Ginn.

Therefore the correct status is **HOLD**: 9.6 GiB is materially safer than the initial 306 MiB, but no further disk-intensive Xcode operation should begin until at least 15 GiB is available (preferably 20 GiB). Reaching that floor now requires either completion of the active Claude test lane so its generated artifacts can later be reassessed, or explicit Founder direction to expand cleanup beyond the proven safe set.


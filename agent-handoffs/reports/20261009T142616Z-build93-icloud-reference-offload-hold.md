# Build 93 iCloud reference offload — archive verified, eviction/manual follow-up HOLD

- Generated: 2026-10-09T14:26:16Z
- Assignment: `agent-handoffs/inbox/prompts/20261009-codex-build93-icloud-reference-offload.md`
- Assignment authority: `ffd8bc05a90175b97ba731e361acae6a28228f10`
- Status: **PARTIAL COMPLETE / HOLD — cloud archive is verified; supported local eviction was not executed**

## Outcome

iCloud Drive is available, signed in, caught up, not paused, has Optimize Mac Storage enabled, and reported approximately 995.6 GB decimal (927.2 GiB) of remaining personal quota. A bounded non-sensitive reference archive was copied to:

`iCloud Drive/PhysiqueOS Archive/Reference/20261009-Build93-Storage-Offload`

The archive contains 2,985 generated UI reference images/videos plus its manifest. The selected payload is **1,345,945,641 bytes (1.254 GiB)**. Every source/destination pair passed size and SHA-256 comparison twice: once immediately after copy and once after Apple File Provider reported terminal upload state. Final File Provider state for the archive was `isUploaded=1`, `isUploading=0`, `hasUnresolvedConflicts=0`, and `isSyncPaused=0`.

No source file was deleted. A guarded attempt to remove the exact manifest-listed local source copies was rejected because the assignment explicitly authorizes supported iCloud/Finder “Remove Download” eviction, not irreversible shell deletion of the original Claude-job files. I did not bypass that control.

Finder’s supported “Remove Download” action could not be automated because the available Finder computer-control surface repeatedly failed with `cgWindowNotFound`, even after opening the exact folder and reconnecting. No undocumented `brctl evict`, CloudDocs database edit, xattr trick, or manual backing-file deletion was used. The new cloud archive therefore remains downloaded locally, as do approximately 0.198 GiB of already-uploaded older PhysiqueOS backup archive copies.

Because no eviction completed and the copied archive is currently materialized, final APFS availability is **23,180,052 KiB (22.11 GiB)**. This is **2.89 GiB below** the mandatory 25 GiB Build 93 start threshold and **7.89 GiB below** the preferred 30 GiB reserve. Build 93 release work remains on HOLD.

## iCloud eligibility and health

Read-only Apple diagnostics established:

- iCloud Drive root exists as the user-owned CloudDocs File Provider domain;
- the account is eligible/signed in; account-identifying output is intentionally omitted;
- CloudDocs reported `caught-up` before the copy;
- available quota was `995,576,158,696` bytes;
- `com.apple.bird` reports `optimize-storage = 1`;
- File Provider supports upload-with-conflict-protection;
- neither the new archive nor the older PhysiqueOS backup archive folder is pinned with Keep Downloaded;
- both folders report uploaded, not uploading, with no unresolved conflicts.

## Bounded manifest

The exact per-file manifest is stored inside the cloud archive as `MANIFEST.tsv`. It records job ownership, source path relative to that job’s `tmp` root, byte count, SHA-256, filesystem owner, and destination path relative to the archive.

- Manifest rows: **2,985**
- Payload bytes: **1,345,945,641**
- Manifest SHA-256: `12f45113c920f501588fccc62ef236312ec6dd16f5357f950432fc3ad1e1cb8f`
- Destination files including manifest: **2,986**
- Destination logical bytes including manifest: **1,346,640,180**
- Destination currently allocated locally: **1,352,900,608 bytes (1.260 GiB)**

The full path list is intentionally not duplicated into GitHub. It is retained in the verified cloud manifest, and the summarized selection below is sufficient to audit the boundary without publishing local session filenames.

| Source job | State/eligibility | Files | Bytes |
|---|---|---:|---:|
| `b4dd295e` | completed Briefings redesign; only generated media outside its `ro` and `refs` trees | 278 | 260,486,650 |
| `82438284` | completed Batch 3 Evidence takeover; synthetic/published fixture media | 893 | 353,812,133 |
| `d8d307bb` | completed Watch/Live/Priority lane; generated fixture media | 610 | 212,057,040 |
| `f87d0b65` | inactive/superseded Build 88 redesign lane; no running task; generated fixture media only | 297 | 171,110,382 |
| `8295c04d` | inactive/superseded mockup-only Build 91 Evidence lane; no running task; prompt prohibited production/Founder media | 318 | 153,044,555 |
| `31dadeef` | completed Build 91 redesign audit; generated fixture media | 248 | 67,702,712 |
| `a1ff96e7` | completed released Build 90 design round; generated fixture media | 154 | 35,707,621 |
| `a4bc60c7` | completed Sleep lane; only nine named simulator-fixture capture roots, not repo/history roots | 85 | 26,935,053 |
| `8d13e5c8` | completed Build 89 candidate; generated UI media | 22 | 34,058,855 |
| `60223103` | completed Energy design lane; published fixture media | 60 | 23,522,761 |
| `192e07a9` | completed Build 92 training-variant lane; generated UI media | 20 | 7,507,879 |

No selected file had an open descriptor. The source jobs’ `state.json`, timelines, prompts, logs, source files, credentials, and non-media contents were not copied or changed. All **2,985** manifest-listed originals remain present after the denied removal attempt.

## Explicit exclusions

The operation excluded:

- current Build 93 Recovery job `a2964f7f` and all current Build 93 candidate evidence;
- the Briefings job’s `tmp/ro` and `tmp/refs` trees, which include real Founder briefing/DEXA/photo references;
- every unique Founder photo, health export, DEXA source, real production payload, private correction manifest, credential, key, token, signing asset, production runner, or backup-generation payload;
- all Xcode Archives 85–92 and every other release archive source;
- all registered worktree contents, dirty/untracked/unpushed work, and current Native/Server candidates;
- Claude/Codex transcripts, job metadata, and operational logs;
- the protected Build 91 Evidence simulator;
- any file outside the sealed manifest.

No active Xcode/test runner or Claude job owned a selected file. No active process was terminated.

## Integrity and preservation checks

- First source-to-destination verification: **2,985/2,985**, 1,345,945,641 bytes, zero failures.
- Post-upload source-to-destination verification: **2,985/2,985**, 1,345,945,641 bytes, zero failures.
- Cloud state after verification: uploaded, not uploading, no conflict, sync not paused.
- Registered-worktree manifest remains `8430ba64f3363fb769aa59e89492f78eb50839ccd73a6e5b23d160cac1e12e72`.
- Current archive-path listing manifest is `51f31e8b14390b5d92250461159787491ef7a3271dafdef1afe9c2a646c43553`; Builds 85–92 remain present.
- Native Build 93 worktree remains clean at `ac3def4ce6941138719f3a39c7cbbfc521b29eb0`.
- Server Build 93 worktree remains clean at `e03f6768627f49175c476208eca79c99ae3d5ee9`.
- Release pointers, production Server, Recovery authority, and TestFlight state were not changed.

## Capacity profile

Both `/` and `/System/Volumes/Data` returned the same APFS available-block value at each measurement.

| Stage | UTC | Available KiB | Available GiB | Notes |
|---|---:|---:|---:|---|
| Initial task preflight | 2026-10-09T14:02:33Z | 24,715,280 | 23.57 | already below 25 GiB |
| Final pre-copy gate | 2026-10-09T14:15:05Z | 24,180,836 | 23.06 | cloud caught up; destination absent |
| After copy/upload/integrity, before report | 2026-10-09T14:25:39Z | 23,179,376 | 22.11 | cloud copy still downloaded |
| Last report snapshot | 2026-10-09T14:26:16Z | 23,180,052 | 22.11 | HOLD |

The new archive currently occupies 1.260 GiB locally. The already-uploaded `iCloud Drive/PhysiqueOS Backups/archives` folder occupies another 0.198 GiB locally and reports `isUploaded=1`, `isDownloaded=1`, `isKeepDownloaded=0`. Supported Remove Download on both could release up to approximately **1.458 GiB allocated**, but APFS recovery is not assumed until measured. Because the originals remain, evicting the new cloud copy returns only its temporary local duplication; it does not reclaim the source files themselves.

## Exact supported manual eviction steps

1. Open Finder → iCloud Drive → `PhysiqueOS Archive` → `Reference`.
2. Control-click `20261009-Build93-Storage-Offload` and choose **Remove Download**. Do **not** choose Move to Trash or Delete.
3. Open Finder → iCloud Drive → `PhysiqueOS Backups`.
4. Control-click `archives` and choose **Remove Download**. This preserves the uploaded Build 83/84 cloud copies. Do not touch `generations`; it is already effectively evicted.
5. Wait until Finder shows cloud/download-available status. A fresh File Provider check should read `isUploaded=1`, `isDownloaded=0`, `isUploading=0`, and no conflict for both folders.
6. Re-measure `df -k / /System/Volumes/Data` after the values settle. Do not start Build 93 unless live availability is sustained at or above 25 GiB.

These Finder actions are reversible: opening or choosing Download Now rehydrates the verified cloud copies.

## Gates and next decision

No deployment, production write/read, Recovery activation, Xcode build/test, archive/export, TestFlight upload, build bump, or release-pointer mutation occurred.

**HOLD.** The task cannot claim eviction or storage readiness. The Founder can perform the two exact Finder Remove Download actions above. Separately, deleting the now-cloud-backed manifest-listed Claude-job originals would reclaim up to another 1.254 GiB, but that is an irreversible local-source deletion and was not accepted under this task’s current authority. It requires explicit separate authorization. Even both recoveries may still leave the Mac near or below 25 GiB because APFS availability has been volatile; a fresh sustained measurement is mandatory before any Build 93 gate resumes.

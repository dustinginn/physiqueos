# Pre-HealthKit storage, authority and Remote Control anchor readiness

Task id: pre-healthkit-storage-anchor-readiness-20260921
Agent: claude. Scope: storage audit + cleanup, Remote Control anchor to Build 48, spawn proof, HealthKit readiness audit (no HealthKit implementation).

## Flags

- STORAGE_AUDIT_COMPLETE = YES
- SAFE_CLEANUP_COMPLETE = YES (all Founder-authorized SAFE items done; DeviceSupport/simulators deliberately left per Founder chat decision)
- DISK_SPACE_HEALTHY = NO (marginal: 17.1 GB free, ~3.5% of volume, up from 12.3 GB)
- BUILD48_ARCHIVE_PRESERVED = YES
- ADMIN_KEY_SECURE_COPY_PRESERVED = YES (owner-only files in a 0700 directory; contents never read or printed)
- REDUNDANT_ADMIN_KEY_DOWNLOAD_REMOVED = NOT_APPLICABLE (no copy found in Downloads, Desktop or Documents; nothing to remove. A broader whole-home/Trash search was declined by the permission classifier and was not attempted.)
- REMOTE_CONTROL_ANCHOR_BUILD48 = YES
- REMOTE_CONTROL_HOST_BUILD48_READY = YES (from host-binary analysis + observed behavior; no restart needed; not yet empirically exercised)
- REMOTE_CONTROL_SPAWN_BUILD48_PROVEN = NO (this session cannot spawn a host session; one phone action completes it)
- PRODUCTION_SERVER_AUTHORITY_VERIFIED = YES
- HEALTHKIT_FOUNDATION_REVIEWED = YES
- THREE_AM_BRIEFING_CHANGE_QUEUED = YES (recorded as backlog with sequencing advice; not implemented)
- PHONE_ONLY_HEALTHKIT_WORK_READY = YES, provisional on the one confirming phone check below
- FOUNDER_MAC_ACTION_REQUIRED = NO (standing precondition: Mac awake, online, and the `claude rc` host left running)
- PRODUCTION_DATA_MUTATED_DURING_READINESS = NO

## Inbox gate note (process finding)

Commit c910435d added the prompt file only; `agent-handoffs/inbox/latest.json` still pointed at the previous, completed task (build48-admin-api-upload-final-retry-20260921), so `physiqueos-inbox fetch` refused with "status is completed". The Founder then named this exact prompt in chat and directed execution, so it was executed on that authority. Nothing was edited to make the gate pass. Because the inbox never registered this task, no claim was possible and the inbox file was not flipped to completed by this completion. ChatGPT should publish a matching inbox entry (or treat this completion as the closure) in future to avoid the gap.

## Authority (reverified live)

- Production Server: source a428fbda42757620750264e63eaee18950ab7132, deployment d3783f4c-bc14-469b-b10c-93635a047325 phase ACTIVE (read-only doctl, audit context). origin/combined-app-platform-cutover = a428fbda. Health live=200, ready=200. No production write or deploy performed.
- Accepted Native: Build 48, version 1.0 (48), bbb46e19084a7b7e0860a1d5e84e20e2f6649d1a (descendant of Build 47 f372699f; 5 files changed: Photo Briefing tile open behavior, tests, publication metadata). Last uploaded build on record: 48.
- Build 48 was not re-uploaded.

## Part A: storage audit (before)

Volume: 460 GiB, 12 GB free (98% used). Container free 12.27 GB.

| Item | Size | Class |
| --- | --- | --- |
| Xcode Archives Build 48 (2026-09-21) | 71 MB | KEEP (metadata 1.0 (48), dSYM present, codesign verify clean) |
| Xcode Archives Build 47 (2026-09-20) | 71 MB | KEEP (rollback reference; only ~71 MB, no meaningful space gain) |
| Other Xcode Archives Builds 16-46 | ~1.3 GB | NEEDS_REVIEW (dSYMs for older TestFlight builds; not removed) |
| Xcode DerivedData (PhysiqueOS-* + module caches) | ~1.0 GB | SAFE_REGENERABLE_CLEANUP (removed) |
| /tmp/b48 build/derived/xcresult dirs | ~1.5 GB | SAFE_REGENERABLE_CLEANUP (removed; logs and handoff notes kept) |
| /tmp/physiqueos-b48-scratch/dd | 451 MB | SAFE_REGENERABLE_CLEANUP (removed) |
| build17-native.bundle | 62 MB | SAFE_REGENERABLE_CLEANUP (bundle verified complete; its head is contained in 20 local branches; removed) |
| Worktrees photo-analysis-fix-server, training-authority-server, photos-staged-server, unified-v3-server, /tmp physiqueos-healthkit-request-bound-server | ~4.8 GB (du) | STALE_WORKTREE_CANDIDATE (removed after proof) |
| /tmp physiqueos-production-readonly-mac-bootstrap | 71 MB | KEEP (accepted read-only prod tooling worktree) |
| server main worktree (node_modules, .next) | 2.9 GB total | KEEP (main worktree; hosts .git and bridge worktrees) |
| Bridge worktrees (7, incl. this session) | 71 MB each, one 1.4 GB | KEEP (each has a live Remote Control session process; locked by the host) |
| native-remote-control anchor | 71 MB | KEEP (host cwd) |
| native-build47, photos-staged-native, confidence-v3-shadow, unified-v3-base | ~70 MB each | KEEP / NEEDS_REVIEW (small; branches hold unpushed Native/shadow commits; not worth removing) |
| native-production-read-foundation + /tmp/claude-502 session scratch (291 MB) | 71 MB + 291 MB | KEEP (live desktop Claude sessions use this cwd) |
| unified-v3-gates (plain directory, not a worktree) | 19 MB | NEEDS_REVIEW (audit/gate artifacts) |
| iPhone DeviceSupport | 5.7 GB | NEEDS_REVIEW (left per Founder decision; regenerates when the phone next connects to Xcode) |
| CoreSimulator devices / runtimes | 18 GB / 15.4 GB | NEEDS_REVIEW (high level only; one device is in active use) |
| ~/Library/Caches (Codex 1.5 GB, other) | 2.0 GB | NEEDS_REVIEW (another app's cache; not touched) |
| ~/.npm cache | 338 MB | KEEP |
| Git object store | 67 MB packs, 0 garbage, 0 prunable | KEEP |

## Part B: cleanup and worktree proof

Removed: DerivedData, /tmp/b48 build products, b48-scratch derived data, build17 bundle, and five worktrees.

Worktree removal proof, per worktree: tree clean (0 status entries), HEAD contained in a pushed origin ref, no open file handles, no non-regenerable ignored files (only node_modules/.next), branch refs retained (no branch deleted). Preserved-on refs: training-authority-server 9dbc2287 (origin/codex/training-authority-repair-ops), photos-staged-server e5073f14 (contained in origin refs), unified-v3-server 714dcaef (origin/combined-app-platform-cutover), /tmp hk-request-bound detached 5d07a6f3 (contained in origin refs), photo-analysis-fix-server 0ad2582b (contained in origin refs). `git worktree remove` on photo-analysis-fix-server failed partway ("Directory not empty") after deregistering; the leftover directory was proven to hold only a strict subset of that commit's tracked files plus .next and a partial node_modules, then deleted.

Removal was first blocked by the local permission classifier; it proceeded only after the Founder answered an explicit chat question authorizing it.

Live bridge worktrees were not touched (7 sessions alive under the host).

Unique unpushed commits (none lost; all remain on retained local branches, none of them on origin): the Native lineage (Builds 41-48, ~150 commits), claude/confidence-v3-shadow (3), codex/healthkit-foundation-s1, healthkit-s1-integrated, healthkit-s1-postgres-acceptance, healthkit-s1-postgres-gate-complete, healthkit-s1-postgres-gate-final (1 each; superseded, see Part E), codex/phase4-migration-discovery-fix (1).

Free space: before 11.98 GB in the volume view (12.27 GB container). After 16.0 GiB volume view (17.10 GB container). Measured gain about +4.8 GB. It is smaller than the ~7 GB `du` sum because the worktrees' node_modules were APFS clones sharing blocks; there are no APFS local snapshots holding space.

## Admin key

Secure installed keys: two owner-only (mode 600) files in a 700 directory under the App Store Connect key location; release config is owner-only. Contents were never read or printed. No `.p8` or AuthKey file exists in Downloads, Desktop or Documents (scoped name search only). A wider search (whole home, Spotlight, Trash) was blocked by the classifier as credential exploration and was not retried; the Founder may want to empty the Trash if the key was ever dragged there.

## Part C: Remote Control anchor

- Host: `claude rc` process, running ~10 h, cwd ~/Developer/PhysiqueOS/native-remote-control, 7 live child sessions. Config: worktree.baseRef = head (user settings).
- Anchor before: f372699fc6dfd4501d77c2a570a80c00d256a0ec (Build 47), detached, clean.
- Anchor after: bbb46e19084a7b7e0860a1d5e84e20e2f6649d1a (Build 48), detached, clean. Exact match verified. Fast-forward `git checkout --detach`; no history rewritten; origin/main and the production Server branch untouched; no new permanent worktree created.
- Preservation: Build 48 was reachable only from a live session's temporary branch and a detached anchor. A local branch `native/build48-accepted` -> bbb46e19 was created so the accepted commit cannot be orphaned by session cleanup. Local only, nothing pushed.
- Does the host cache its launch HEAD? No. In the host binary (2.1.278), worktree creation with baseRef=head runs `git rev-parse HEAD` in the process cwd at each spawn (fromCwd defaults to the host's cwd). Observed behavior matches: every bridge worktree created after the anchor was set (Sep 20 23:29) started at f372699f, the anchor's HEAD, not the main worktree's HEAD. So advancing the anchor in place is sufficient and no host restart is needed. The only running host was left running; its 7 sessions were never interrupted.
- Worktrees are created under the shared repo's main-worktree `.claude/worktrees/` directory, based on the anchor HEAD.

## Part D: spawn proof

Not proven. This session cannot spawn a Remote Control session, and a manual local worktree would not exercise the host's own spawn path, so none was made. Confirming step: from the phone, start one new session on this Mac host; its first command should show `git rev-parse HEAD` = bbb46e19084a7b7e0860a1d5e84e20e2f6649d1a, clean status, a `worktree-bridge-cse_*` branch under server/.claude/worktrees. No Mac action needed.

Incident: while looking for spawn options I ran `claude rc --help`; this printed help but the process did not exit (it may have briefly acted as a second host). It was stopped through the harness's task control (a direct kill was blocked by the classifier); confirmed gone and the real host and its 7 sessions unaffected. Not repeated.

## Part E: HealthKit readiness (audit only)

Architecture invariant preserved: HealthKit source observation -> canonical PhysiqueOS Activity/Workout record where appropriate -> evidence eligibility for strategic interpretation where appropriate. Ingestion/provenance does not decide strategic meaning; every raw record carries evidenceEligibility not_assessed (Server foundation doc).

- Server (production a428fbda): the reconciled ingestion foundation is already in production: command healthkit.observations.ingest.v1, HealthKitObservationService, activity_summary/workout/quantity_sample, purpose model (operational vs validation_only), 5 MiB request bound with field bounds, validation-only Activity canary read endpoint (branch 65ba080f is in production), activation policy disabled by default. No migration needed (schema 000014).
- Stale Server branches: codex/healthkit-foundation-s1, healthkit-s1-integrated, healthkit-s1-postgres-gate-final and origin/codex/healthkit-foundation-v1-handoff are superseded; each merges onto current production with 8-11 conflicts because production already carries the reconciled version. Do not rebase them; start any new slice from production a428fbda. No reconciliation needed for Native.
- Native (Build 48): HealthKit is compiled in: capability models, type registry, authorization coordinator, query client, observation normalizer, synchronization engine with persistence, server uploader, Founder canary coordinator and view. Entitlements include HealthKit and background-delivery; usage descriptions present. Branches native-healthkit-n0, n1 and founder-canary are all ancestors of Build 48. The canary uses validation_only purpose.
- Deferred per the Server foundation doc: Founder-authorized activation mutation path, background delivery, deletion/tombstone convergence, Nutrition canonicalization, sleep, cardio canonical commitment, strength confirmation/link mutation, strategic evidence eligibility.
- Open hardening (from earlier deploy): pre-auth 5 MiB parse cost, Native treating HTTP 400 as permanently rejected, 0.8% derivation slack.
- Next smallest slice: with Build 48 in TestFlight, first have the Founder run the existing canary and read the validation-only Activity back (no code). Then a Server-only slice from a428fbda: an explicitly Founder-authorized activation-policy mutation command (effective local date supplied by the Founder, no default, no backfill) with tests. Native operational-purpose sync and background delivery follow after that.
- 3 AM briefing change: should land before, or at latest together with, operational HealthKit Activation, because complete-day totals arrive with sync latency and a pre-3AM run could otherwise consume partial-day data. It touches the cadence executor (scripts/runBriefingCadence.mjs, BriefingCadenceExecutorService, BriefingCadenceRegistryService) and not the ingestion path, so it can run in parallel with the canary check.

## Backlog preserved

1. Server: all scheduled briefing generation to 3:00 AM local time, preserving cadence dates; audit Midweek, Weekly, Monthly and scheduled DEXA/event paths; timezone/DST and pre-3AM evidence tests; no historical regeneration.
2. Native: Workout Logger active draft must survive termination, eviction, restart and app/TestFlight update with exact state and no duplicate submission.
3. Native: Photo Briefing production comparison tiles hide Tap to expand (real payload fails canOpen/navigation condition); restore in the next accumulated-fixes build. Not patched here.
4. Optional Photo accessibility polish.

## Unexpected findings and risks

- Native source history (Builds 41-48, ~150 commits including the accepted Build 48 commit) exists only in this Mac's local repository; no origin ref contains it. Cleanup did not touch any branch. Consider authorizing a push of a preservation branch (native/build48-accepted) to origin.
- Travel dependency: Remote Control works only while this Mac is awake, online and the host process runs; a reboot ends the host (and wipes /tmp, including the prod read-only tooling worktree per earlier findings). Restart would be `cd ~/Developer/PhysiqueOS/native-remote-control && claude rc` at the Mac.
- Disk is still tight (17 GB). Further reclaim options, all Founder choices: iPhone DeviceSupport 5.7 GB, extra simulator devices (18 GB devices, ~10 GB non-active), older archives 1.3 GB, Codex cache 1.5 GB.
- Bridge worktrees accumulate per phone session (7 now); prune ended ones periodically.

## Recommended next task

Send two things: (1) the Server-only 3 AM briefing-generation task, and (2) after Founder runs the canary in Build 48, the Server HealthKit activation-policy slice from production a428fbda. First phone session should confirm HEAD = bbb46e19.

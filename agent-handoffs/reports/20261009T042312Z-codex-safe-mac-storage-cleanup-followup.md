# Second safe Mac storage cleanup — Build 93 integration headroom restored

Date: `2026-10-09T04:23:12Z`  
Operator: Codex, existing Mac/operations conversation  
Governing task: `agent-handoffs/inbox/prompts/20261008-codex-safe-mac-storage-cleanup-followup.md` at `763a257226a89ffd2305f7234262d3d28c3bd6be`  
Task id: `codex-safe-mac-storage-cleanup-followup-20261008`  
Result: **SAFE TARGET EXCEEDED; ABOUT 28.8 GiB REMAINS AVAILABLE; STORAGE IS READY FOR A SEPARATELY AUTHORIZED, SERIALIZED BUILD 93 INTEGRATION RUN**

No build, test run, integration, deployment, build-number change, archive, TestFlight upload, production mutation, process termination, worktree removal or release-pointer change occurred.

## Executive result

- The prior bounded cleanup ended at 9.6 GiB available. At the start of this follow-up, after the Founder's manual cleanup, `df` reported **30,775,912 KiB (29.35 GiB)** available.
- That is a net **20,664,792 KiB (19.70 GiB)** increase from the prior report's settled final measurement. This report does not infer which files the Founder removed.
- Claude job `a2964f7f` reports `state=done`, with the recorded result “UI suite 93/0 green after Sandbox reset fix; ready for Build 93.”
- The completed lane's `dd5` and `dd6w` DerivedData paths are absent. Its named B93 iPhone and Watch simulator devices are absent from the current CoreSimulator inventory.
- Exact-name checks found no `xcodebuild`, `xctest` or `XCTRunner` process. The Claude remote-control conversation remains open against the protected candidate worktree, but no test/build process or open-file reference used the completed result artifact.
- One remaining completed-job `.xcresult` was positively identified as inactive and regenerable, then removed: **144 KiB** allocated. No other path met the task's narrow deletion standard.
- Final `df` availability was **30,151,604 KiB (28.75 GiB)**. The 20–25 GiB target remains exceeded despite normal concurrent APFS/system activity.
- All registered worktrees, candidates, screenshots, reports, logs, archives 85–92, credentials, production tooling and the booted evidence simulator were preserved.

## Before and after capacity

| Measurement | Before | After | Observed delta |
|---|---:|---:|---:|
| `df` available on `/` and Data | 30,775,912 KiB / 29.35 GiB | 30,151,604 KiB / 28.75 GiB | -624,308 KiB / -609.68 MiB |
| APFS container free | 31,557,615,616 bytes / 31.6 GB decimal | 30,875,217,920 bytes / 30.9 GB decimal | -682,397,696 bytes / -650.79 MiB |
| Exact logical allocation selected for deletion | — | 144 KiB | 144 KiB removed |

The tiny bounded deletion did not cause the larger negative observed free-space delta. APFS and other live system activity changed by hundreds of MiB during verification. Logical deletion and observed filesystem availability are therefore reported separately, as required. The final reading still exceeds the preferred 25 GiB target.

No Time Machine local snapshots were listed.

## Claude completion and inactivity proof

The completed harness lane was rechecked rather than inferred from its report:

- job: `a2964f7f`;
- state: `done`;
- state timestamp: `2026-10-09T04:20:21.329Z`;
- final candidate worktree branch: `claude/native-build93-test-harness-stabilization-20261008`;
- exact local and remote candidate SHA: `a7e8a363cd836a54cee4baabd6d768ec1a62c7e0`;
- candidate worktree: clean;
- `dd5`: absent;
- `dd6w`: absent;
- B93 Harness iPhone simulator: absent;
- B93 lane Watch simulators: absent;
- `xcodebuild`: none;
- `xctest`: none;
- `XCTRunner`: none;
- open-file references to the remaining `.xcresult`: none.

A Claude remote-control controller for that conversation remains open. It was not stopped or signaled, and its registered/locked worktree was not altered. An open conversation controller is not an active Xcode test job; the process audit confirmed the completed test outputs were inactive.

The associated widget follow-up is also remotely present at `895e4a1e6a86bfb4b97028ce97f03ef742efe26d` on `claude/native-build93-widget-option-b-20261008`.

## Exact removal

Removed only:

- `~/.claude/jobs/a2964f7f/tmp/unit1.xcresult` — 144 KiB allocated.

Pre-delete gates:

- exact bounded path inside the completed job's scratch directory;
- real directory, not a symlink;
- owned by the Founder account;
- parent job state exactly `done`;
- no `xcodebuild`, `xctest` or `XCTRunner` process;
- no `lsof` reference;
- redundant/regenerable unit-test result rather than a source, report, screenshot or release artifact.

Post-delete verification confirmed the exact path is absent. It is not recoverable from this cleanup pass, but it is regenerable by rerunning the corresponding test. No broad directory or wildcard deletion was used.

## Simulator and artifact decision

Current CoreSimulator inventory contains four shutdown generic Watch devices and one booted `B91 Evidence iPhone 17 Pro`.

- The previously named B93 lane simulators are already gone.
- The booted evidence simulator was preserved as protected/potentially active.
- The generic shutdown Watch devices were preserved because exact lane ownership was not sufficiently separable and current free space already exceeds target.
- Global Xcode DerivedData remains approximately 256 MiB and was preserved as shared cache state.
- The remaining completed-job scratch area contains reports, logs, diagnostic images and review screenshots protected by the assignment; it was not broadly deleted.

## Protected inventory verification

The registered-worktree manifest was identical before and after cleanup:

`0d1026241f7602124c536e9f42f2e5f82aa78da7cd4da4442af21d3af34b3e42`

The archive-path manifest was identical before and after cleanup:

`51f31e8b14390b5d92250461159787491ef7a3271dafdef1afe9c2a646c43553`

All eight retained archives were re-enumerated:

- Build 85 `b8ee8690`;
- Build 86 `cec8af20`;
- Build 87 `f66c7fc6`;
- Build 88 `7fce3b97`;
- Build 89 `51399425`;
- Build 90 `32baf1d5`;
- Build 91 `106f0518`;
- Build 92 `beaf5eff`.

Also unchanged/protected:

- every registered Git worktree and its Git state;
- untracked/source files and candidate branches;
- reports, screenshots and design/review artifacts;
- credentials, signing and provisioning data;
- `.tmp/digitalocean` and the approved Mac console runner;
- private correction manifests and production backups;
- personal files and media;
- `agent-handoffs/latest.json` and `latest.md` Build 92 release authority.

## Build 93 integration readiness

**Storage recommendation: READY, not HOLD.**

The final 28.75 GiB available is:

- above the 15 GiB heavy-operation floor by about 13.75 GiB;
- above the 20 GiB requested target;
- above the preferred 25 GiB target.

The completed harness candidate is clean and remote, its expensive generated test directories/devices are gone, and no Xcode build/test runner is active. A later, separately authorized Build 93 integration may proceed with heavy Xcode operations serialized and with a capacity check immediately before starting. This maintenance task did not initiate that integration.

No additional deletion is recommended now. Broadening cleanup would reach protected or uncertain-owner simulators, shared caches, evidence, worktrees or user data without a storage need.

## Final safety accounting

- Exact inactive regenerable paths removed: 1.
- Logical allocated size removed: 144 KiB.
- Simulator deletions in this pass: 0.
- Processes stopped or signaled: 0.
- Worktrees/source/branches removed or changed: 0.
- Protected archives removed: 0.
- Credentials, signing or private data changed: 0.
- Builds/tests/integration runs started: 0.
- Deployments, production writes or Recovery activation: 0.
- Build bumps, archives or TestFlight uploads: 0.
- Release pointers changed: no.

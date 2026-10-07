PhysiqueOS Build 91 — Founder-authorized Native TestFlight release

SAME LANE: Continue the existing Claude Build 91 guarded Native integration Remote Control conversation and its existing managed worktree. Do not spawn child chats, subagents, extra sessions, or extra worktrees.

FOUNDER AUTHORIZATION

Founder explicitly approves proceeding from the validated Build 91 integration candidate through build-number bump, release verification, archive, signed distribution, guarded App Store Connect/TestFlight upload, and (only after verified VALID) Build 91 release-authority pointer publication.

This is NOT authorization to deploy Server, alter production data, change features, merge Build 92, reset HealthKit permissions, or start queued redesign/Apple Health audits.

AUTHORITIES — VERIFY FRESH

Repository dustinginn/physiqueos.

Validated integration candidate:
branch claude/native-build91-integration-candidate-20261007
exact SHA 3697951cb530a6f7d2593e92de76fced9613eaef

Published integration report main commit:
1d83b999ac2915f33588e40d017664cd952061a2
agent-handoffs/reports/20261007T220712Z-build91-guarded-native-integration.md
(If the exact report basename differs, inspect the actual main commit; do not assume filenames.)

Shipped Build 90 Native:
32baf1d5f43120cd07088df1210e1dc84ed26a78

Live production Server:
738ce66849a1361b4ce0ed069a4a04eac6abc4ef
deployment f0f1d3b4-8b95-4bc5-85ce-739a4fd0e255

Current protected latest.* on main represents Build 90 VALID with:
native 32baf1d5; native_build 90;
delivery 68dc945f-cfaa-43bb-a1ff-d0020fed54ff.

The current release-authority protocol is:
agent-handoffs/RELEASE_AUTHORITY.md
and agent-handoffs/tools/release_pointer_guard.py
with installed guarded publisher under ~/.physiqueos-release/bin/.
Follow these exactly; do not bypass or hand-edit around them.

Existing release scripts and Build 90 release report are normative for archive, signing, guarded API-key upload, delivery verification, and subsequent pointer movement. Do not use personal Apple credentials or expose secrets.

PART A — PRE-RELEASE SAFETY

1. Fetch and verify exact remote candidate branch tip is 3697951c and remains clean/unchanged. Confirm all three previously approved Build 91 inputs and 74-file iOS-only change set, no new or unrelated changes. Do not silently rebase/squash/merge product work. Ensure no release for Build 91 has already been uploaded to avoid duplicate delivery.
2. Confirm live Server 738ce668 ACTIVE 9/9, ready 9/9, no in-progress deployment, Build 90 backward compatibility as in integration report. All production verification read-only.
3. Check local worktree clean and configured signing/upload authority. Preserve persistent Claude hosts, other lanes, and app identity com.physiqueos.native.dev (verify exact release bundle IDs rather than assuming).
4. REQUIRED STORAGE GATE: Read 4bcfe4d861eb5abeb0cdfef1dead1fdc1d926217. Measure free disk before/after major gates. Require at least 12 GiB free at release start (or a measured, defensible higher threshold for archive/upload). If insufficient, safely reclaim only fully owned, idle, regenerable artifacts and shut-down disposable simulators after evidence capture; do not launch a big release job below the safe threshold. Never delete Archives (especially Builds 85–90 or the new 91 archive), source/worktrees/reports/media/signing material/credentials, active processes/outputs, other lane's simulators, runtimes/SDKs, ambiguous scratch. If adequate room unavailable, HOLD and publish bounded blocker, not a risky partial archive.

PART B — EXACT BUILD-NUMBER BUMP

From the validated integration candidate, produce a SINGLE minimal Build 91 release commit. Only release numbering and its required test pin may change:
- APP_BUILD_NUMBER = 91 in ios/Scripts/generate_project.py;
- every generated CURRENT_PROJECT_VERSION occurrence (historically 8) becomes 91 via deterministic project generation;
- any explicit TrainingLoggerTests build-number pin updates 90 to 91;
- any exact additional release-pin truly necessary, identify and justify explicitly, with no feature changes.

Version must be 1.0 (91) across app, Watch, widgets/extensions. Regenerate twice and require identical pbxproj. git diff --check clean. Require diff vs 3697951c limited to the necessary version/test-pin paths; if anything unexpected changes, STOP.

Publish only the exact named release branch (choose claude/native-build91-testflight-release-20261007) to dustinginn/physiqueos with normal non-force push after fresh verified destination and branch authority. Founder authorizes publication of that exact Build 91 release candidate branch and its reachable Git history. No separate remote-ownership approval is needed when exact target/scope match.

PART C — POST-BUMP REQUIRED GATES

Use sequential, storage-bounded validation:
- current release contract focused tests;
- complete PhysiqueOSTests;
- Watch unit tests;
- verify_release_configuration.py showing 1.0 (91), stable bundle/entitlement groups, HealthKit app-only, correct Watch extension/widget, Live Activity and App Group;
- generic clean unsigned Release build including Watch/widget extensions;
- no shipping pilot/fixture/debug/review seam flags;
- deterministic generator, git diff --check;
- compare prior baseline Watch no-WCSession harness limitation without treating known unrelated baseline as candidate-specific;
- validate app/Watch/widget signing/export identities and provisioning for the verified App Store Connect lane;
- confirm no migration, production writes, Server changes.

Build 91 integration already ran extensive iPhone UI (83/83 after two isolated reruns), Watch units 70 per size, Watch UI baseline 9/10 on each size and full units 2198 before the build-number bump. Only rerun expensive UI if post-bump change exposes a genuine behavior risk or a required release gate explicitly demands it; never skip mandatory post-bump tests.

Never claim green with a candidate-specific failure, and never archive/upload after a hard failure. Do not solve failing gates with unapproved product changes.

PART D — ARCHIVE + TESTFLIGHT UPLOAD

After all gates pass and storage headroom remains adequate:
- archive from exact Build 91 release commit, signed with the established legitimate release configuration;
- preserve a clearly named PhysiqueOS-Build91-<shortSHA>.xcarchive;
- inspect archive Info.plist, app/Watch/widget versions (all 91), bundle IDs, entitlements, provisioning, embedded content and source stamp;
- use the established guarded API-key distribution/upload tool to send ONLY Build 91 to the expected PhysiqueOS TestFlight app;
- capture submission/delivery ID; poll/re-query status until Apple reports VERIFIED VALID or definitive failure, using established release reporting standard;
- do not claim release success based merely on upload accepted, processing started, or unsigned build success.

If delivery is not yet VALID or status cannot be verified, keep latest.* at Build 90; publish a HOLD/pending report only, without moving release authority. Do not repeat upload recklessly; reconcile existing delivery before retry.

PART E — RELEASE AUTHORITY PUBLICATION

ONLY AFTER exact Build 91 TestFlight delivery is VERIFIED VALID:

Use the installed guarded publisher in explicitly authorized --release-authority mode, with a fresh origin/main read and pointer guard, to atomically publish:
- a new timestamped Build 91 TestFlight VALID report under agent-handoffs/reports/;
- latest.json and latest.md advancing from Build 90 to Build 91;
- Native SHA = exact post-bump Build 91 release commit;
- native_build=91;
- current production Server snapshot = 738ce668 and its exact deployment identity, as it is at the moment of the release; do not assume stale data;
- delivery ID and VERIFIED VALID state;
- complete list of gate results and archive receipt.

Do not modify README, existing reports, product files or unrelated main files. Honor guard's exact schema and release semantics. Normal fast-forward only; never force-push. If main moves or the guard fails, STOP and report without bypass. User expressly authorizes the necessary bounded release-authority Git push when VALID.

If release does not reach VALID:
Founder authorizes one additive report-only main publication through the installed guarded publisher, with latest.* unchanged at Build 90, explaining exact blocker and what remains. This includes the bounded push, and needs no new remote-ownership approval for verified dustinginn/physiqueos.

PART F — SAFE CLEANUP + PHYSICAL ACCEPTANCE

Once release evidence and receipts are safely persisted:
- retain Build 91 archive, prior Archives 85–90, receipts, signed App Store Connect provenance, Git source/candidate/report histories;
- delete only this lane's idle regenerable DerivedData, xcresults and temp/export products that are not needed for audit or ongoing processes. Do not delete other lane's data. Report before/after storage and reclaimed capacity.

Report Founder physical acceptance checklist:
- Evidence Hub and every Evidence page in Dark and Mineral; palette/icons;
- OP-A–D, Next DEXA route through Home Priority with OP crumb and Mark Skipped coexisting; Peptides/Tracking/Supplements;
- Watch footer clipping and exactly once truthful ready haptic on real Watch;
- Universal Skip Fadogia and real occurrence semantics in Home/Detail/notifications/prior-day scheduled evidence, with no fabricated completion/evidence;
- cross-lane regressions;
- repeated Apple Health permission sheets noted as separate queued audit (commit 5c86fbde), not silently patched during release.

Keep queued final redesign audit (287d8745) and Apple Health authorization audit (5c86fbde) untouched until sufficient storage is available after release.

FINAL OUTPUT

Publish exact final Build 91 SHA, TestFlight delivery, VALID proof, archive identity, post-bump gates, production Server snapshot, storage reclamation, no production mutation, pointer guard validation and current release authority. If VALID, latest now Build 91. If blocked, say HOLD and latest remains Build 90.

Notify:
PhysiqueOS Build 91 TestFlight — VALID; ready for physical acceptance.
(or precise HOLD reason).

STOP.
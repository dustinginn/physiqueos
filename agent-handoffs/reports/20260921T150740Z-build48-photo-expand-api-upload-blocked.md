# Build 48 photo expansion and API upload — blocked at Apple cloud signing

Task id: build48-photo-expand-api-upload-20260921 (agent: claude). Status: blocked (Founder Apple-side action required).

## Verified authority (independent, live)
- Production Server: a428fbda42757620750264e63eaee18950ab7132, deployment d3783f4c-bc14-469b-b10c-93635a047325 phase ACTIVE; web and worker source_commit_hash both a428fbda; /api/v1/health/live ok.
- Native base: f372699fc6dfd4501d77c2a570a80c00d256a0ec, Build 47 (1.0 (47)); worktree clean at start; no other worktree touched.
- Server code, production data and the deploy branch were not touched in this task.

## Issue-3 fix: recovered, not reproduced
Commit 8256db4b1a37184b7cebfd344a1878c07c321a54 was located in local git objects (on another local branch; its worktree was not modified). Its parent is exactly f372699f. Full diff reviewed: two files only, PhotoBriefingSections.swift (+40/-13) and PhotoBriefingTests.swift (+39). Recovered with a clean `git cherry-pick` as 5dcb52d8. Behavior: each comparison tile with a session opens `.photoSetDetail(setId, poseId)` through onTapGesture (same convention as the snapshot grid, no nested Button so the tile's Retry still receives taps); the "Tap a photo to expand" hint shows only when at least one side can open; a side with no/empty session is not expandable. Substantive text/layout unchanged.

## Exact Build 48 diff scope vs Build 47
- 5dcb52d8: PhotoBriefingSections.swift, PhotoBriefingTests.swift.
- bbb46e19 (metadata only): ios/Scripts/generate_project.py (APP_BUILD_NUMBER 47 -> 48), regenerated project.pbxproj (CURRENT_PROJECT_VERSION 47 -> 48 in the two app configurations), TrainingLoggerTests.swift (build-number regression test renamed to BuildFortyEight and asserts "48", same as the Build 47 bump pattern).
- No Server, V3, Training, DEXA, HealthKit, entitlement, Progress Photos upload/DNG or upload-tooling change in the repository. Commits are local on this worktree's branch and were NOT pushed.

## Tests and gates
- PhotoBriefingTests 29/29 (2 new). Full Native unit target 1225/1225 on the candidate and again on final SHA (HealthKit Capability, FounderCanary and Synchronization suites pass as regression only).
- Debug simulator build and unsigned generic Release build: succeeded. Project regeneration twice: identical hash before and after the bump. `git diff --check` clean. verify_release_configuration: 1.0 (48), AppIcon, HealthKit capability declarations, exempt encryption.
- Launch smoke on the simulator (fixture mode, no production data) ok; installed build reports 48.
- Tap interaction: one temporary simulator UI test on the fixture briefing (added, run, reverted; not committed) confirmed the hint appears and tapping the Current tile opens the Progress Photo evidence detail via existing routing. No broad UI tour was run.

## Independent review
A fresh-context read-only reviewer examined the exact candidate 5dcb52d8 (diff scope confirmed as two files) and the release helper: APPROVED, no blockers. Non-blockers recorded in backlog (VoiceOver label drops the capture date; no view-wiring test; team id not hard-coded in the helper; -allowProvisioningUpdates breadth; stale lock after a killed upload).

## Archive (retained, unmodified)
`PhysiqueOS Build 48.xcarchive` in the Xcode Archives folder for 2026-09-21, archived from clean final SHA bbb46e19. Verified: bundle id com.physiqueos.native.dev; team 33GMTRM6G9; version 1.0; build 48; architecture arm64; codesign --verify --deep --strict valid; dSYM present with UUID matching the binary; ITSAppUsesNonExemptEncryption=false; HealthKit entitlements byte-identical to the Build 47 archive; HealthKit usage strings identical to Build 47.

## API-key upload
Mechanism (sanitized): guarded helper physiqueos-asc-upload; identity guards, then `xcodebuild -exportArchive` with export options (app-store-connect, destination upload, automatic signing, manageAppVersionAndBuildNumber=false) and the App Store Connect API key passed by file path plus key id and issuer id flags; status via `xcrun altool --build-status`. Key contents were never read or printed; no browser automation; no interactive Xcode account fallback.
- Read-only auth-check: passed (API key authenticates; app resolved for the bundle id).
- Dry run: passed all guards (environment, archive identity, dSYM UUID, eligibility: build 48 > last uploaded 47, no prior upload recorded).
- The Founder authorized the real upload in chat and the classifier then allowed it. Executed with the exact confirmation string.
- Result: export/upload FAILED before any delivery was created. xcodebuild reported "Cloud signing permission error: You haven't been given access to cloud-managed distribution certificates. Please contact your team's Account Holder or an Admin" and "No iOS Distribution signing certificate matching team ID 33GMTRM6G9 with a private key was found". Helper exit 40 (xcodebuild exit 70). Helper state unchanged (last-uploaded-build still 47); its temporary export directory and lock were removed by the helper.
- API key sufficient? No. The Developer-role key authenticates but cannot obtain a distribution signing certificate through Apple cloud signing, and the Mac has no local iOS Distribution certificate with a private key.
- Delivery id: none. Apple processing state: none (nothing uploaded). Apple did not record 1.0 (48).

## Minimum Founder Apple-side action (choose one)
1. Create a new team API key with cloud-managed distribution certificate access (the Admin role is the known-sufficient choice; Apple's message says the team Account Holder or an Admin must grant this access), store its private key file only in the owner-only ~/.appstoreconnect/private_keys folder on this Mac, and update the key id in the release helper config. Do not paste key contents anywhere.
2. Or install an iOS Distribution certificate with its private key in the Mac login keychain (for example via Xcode's account certificate management by the Account Holder or an Admin). Unproven whether the existing Developer-role key can then upload without cloud signing; if not, option 1 is still needed.
Then publish a NEW task id to upload the existing Build 48 archive. Do not rebuild, rebump or rearchive.

## Permissions change (Founder-authorized in chat)
At the Founder's explicit request one Claude user-settings permissions.allow rule was added: running the release helper with any arguments (python3 ~/.physiqueos-release/bin/physiqueos-asc-upload with wildcard args) so future Remote Control sessions do not need re-approval. No other setting changed; no secrets involved. Note the auto-mode classifier had denied even the default dry run until the Founder's chat authorization.

## Explicit flags
BUILD48_REVIEW_APPROVED=true
BUILD48_ARCHIVED=true
BUILD48_API_UPLOAD_PATH_READY=false (authenticates; signing access missing)
BUILD48_UPLOADED_VIA_API_KEY=false
BUILD48_APPLE_PROCESSING=false
PHOTO_EXPAND_INTERACTION_CORRECT=true
SERVER_PHOTO_FIX_PRESERVED=true (no Native compensation added; Server untouched)
V3_BEHAVIOR_UNCHANGED=true
TRAINING_BEHAVIOR_UNCHANGED=true
DEXA_BEHAVIOR_UNCHANGED=true
HEALTHKIT_BEHAVIOR_UNCHANGED=true
PRODUCTION_DATA_MUTATED_DURING_BUILD48=false
FOUNDER_APPLE_ACTION_REQUIRED=true
READY_FOR_FOUNDER_BUILD48_ACCEPTANCE=false (nothing on TestFlight yet)
READY_FOR_NEXT_HEALTHKIT_PHASE_AFTER_FOUNDER_ACCEPTANCE=false (pending upload and acceptance; HealthKit not started)

## Cleanup
The upload failed, so no scratch was cleared beyond what the helper removed itself; the archive and local commits are retained. Regenerable DerivedData/log scratch under /tmp remains.

## Backlog (preserved)
- Retry upload of the existing archive after the Apple-side change.
- Next Server task, not implemented here: move ALL scheduled briefing generation to 3:00 AM local time while preserving cadence dates; evidence cutoff semantics must intentionally allow the completed prior day plus an ingestion/reconciliation buffer that covers HealthKit sync latency; audit Midweek, Weekly, Monthly and scheduled DEXA/event briefing paths; test timezone/DST and post-midnight/pre-3AM evidence; do not regenerate historical briefings.
- Optional polish and helper hardening listed above.

## Founder acceptance checks (after a successful upload of Build 48)
1. TestFlight shows 1.0 (48) as processed. 2. In a Photo Briefing with comparison images, "Tap a photo to expand" is shown and tapping Previous or Current opens that session's photo detail at the same pose; back returns to the briefing. 3. A comparison with no prior session (new baseline) shows no expand hint on the prior side. 4. Sep 19 first/latest image, photos 2-5, Read Photo Briefing, Home and Briefing History still behave as accepted on Build 47.

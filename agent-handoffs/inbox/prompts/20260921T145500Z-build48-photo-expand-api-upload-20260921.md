Task id: build48-photo-expand-api-upload-20260921

Goal

Finish Native Build 48 from accepted Build 47 after the Founder has confirmed on-device that the deployed Server photo correction fixed both remaining Server-caused Progress Photos defects. Build 48 should ship the already-created Photo Briefing tap-to-expand correction, run the complete Native release gates/review, archive Build 48, and prove the App Store Connect API-key upload path with a real TestFlight upload.

Founder acceptance already completed

The Founder has just verified on existing Build 47 after Server deployment a428fbda that:
- Sep 19 Progress Photos first/latest image now loads.
- Photos 2-5 load.
- the false Photo Briefing preparing state is gone.
- Read Photo Briefing resolves the published briefing.
- Home/Briefing History remain correct.

Do not reopen or compensate in Native for those two Server-fixed defects.

Authority

You are already in a Remote Control-managed isolated worktree. Do not create, switch, delete, or relocate worktrees.

Reverify current Native HEAD/worktree/ancestry and production Server authority before editing.

Expected accepted Native base:
f372699fc6dfd4501d77c2a570a80c00d256a0ec
Build 47, version 1.0 (47)

Expected current production Server:
a428fbda42757620750264e63eaee18950ab7132
deployment d3783f4c-bc14-469b-b10c-93635a047325

These are hints only; independently verify.

Recover the existing issue-3 fix

A prior Remote Control worktree produced local unpushed commit:
8256db4b1a37184b7cebfd344a1878c07c321a54

Reported contents:
- Photo Briefing comparison tiles previously had no tap target despite the copy saying Tap a photo to expand.
- each eligible comparison tile now opens its own session+pose photoSetDetail using the existing app convention.
- the hint is shown only when a tile can actually open.
- 29/29 PhotoBriefingTests passed, including two new regression tests.

Locate this commit safely in local git objects/refs without modifying another active worktree. Review its complete diff before using it.

If it is exactly the narrow reported fix and is based appropriately on accepted Build 47, recover it into the current Remote Control-managed branch using the safest normal Git operation. Do not modify/delete the prior worktree.

If the commit cannot be safely recovered, reproduce the same narrow fix from the proven diagnosis.

Build 48 scope

Build 48 contains only the Photo Briefing tap-to-expand correction plus release/API-upload tooling strictly necessary for the new upload path.

Do not add Native compensations for:
- first Sep 19 image loading
- Photo Briefing availability/preparing state
Those are fixed by the deployed Server and Founder-accepted on Build 47.

Do not begin HealthKit.
Do not add unrelated backlog fixes.
Do not alter V3 interpretation/presentation.
Do not alter Training.
Do not alter DEXA.
Do not alter Progress Photos upload/DNG authority.
Do not alter Server code in this task.

Photo expansion acceptance

Require:
- comparison images that say they are expandable are tappable.
- tap opens the intended photo/session/pose in an enlarged/detail presentation using existing conventions.
- expanded view can be dismissed/navigated back normally.
- no nested control swallows the tap.
- non-expandable tiles do not advertise Tap to expand.
- existing Photo Briefing substantive text/layout remains unchanged.
- existing Photo snapshot/latest-set navigation remains unchanged.

Tests and gates

Run focused PhotoBriefing/Progress Photos tests first.

Then:
- complete Native unit target
- HealthKit Native suites as regression only
- Debug compile
- unsigned generic Release compile
- deterministic project regeneration twice
- git diff --check
- release configuration verification
- one launch smoke

Do not run a broad 12-case UI tour.

Manual/simulator acceptance should be limited to the tap-to-expand interaction if it can be exercised without Founder production mutation.

Independent review

Before metadata bump/archive, independently review the exact final candidate.

Require no blocker on:
- tap-to-expand correctness
- no unintended Photo layout/text change
- no V3 regression
- no Training/DEXA regression
- no HealthKit behavior/source/entitlement change
- no production mutation
- historical V2 briefing compatibility
- release/API upload helper security

Fix blockers, rerun affected gates, and re-review the exact final SHA.

Build 48 metadata and archive

Only after review/gates:
- bump 1.0 (47) to 1.0 (48) using the established generator/regeneration procedure.
- commit metadata separately.
- run build-number regression, affected focused tests as appropriate, and one launch smoke.
- archive from exact clean final Build 48 SHA.
- verify:
  bundle id com.physiqueos.native.dev
  team 33GMTRM6G9
  version 1.0
  build 48
  arm64
  valid codesign
  dSYM present/matching
  ITSAppUsesNonExemptEncryption=false
  HealthKit entitlements byte-equivalent/semantically unchanged from Build 47
  HealthKit usage strings unchanged
- retain the archive.

App Store Connect API-key upload

This is intended to be the first real proof of the alternative upload path.

Prior tasks established:
- App Store Connect API-key auth-check passes read-only.
- a Developer-role API key appears installed locally.
- a real upload/cloud-signing operation under that role has not yet been proven.
- Claude standing permissions have now been configured to support normal Xcode/archive/export and upload operations.

Security:
- never print/read/publish .p8 contents.
- never expose private keys, JWTs, tokens, credentials or secret-bearing paths/content in GitHub/chat/logs.
- never commit credentials.
- do not use browser automation.
- do not fall back automatically to interactive Xcode Apple-account authentication.
- do not alter signing certificates/profiles unless explicitly required and separately authorized.

Use Apple's supported App Store Connect API-key authenticated upload mechanism available on the installed Xcode/toolchain.

Prefer the guarded local release helper if one already exists and is reviewed. If a helper must be created, keep credential material outside the repository and require exact archive/version/build/bundle validation before upload.

Before upload:
- validate the exact Build 48 archive identity.
- validate API authentication without exposing credentials.
- prove the selected command is using API-key authentication rather than the saved interactive Xcode account.

Then upload the EXISTING verified Build 48 archive. Do not rebuild/rebump/rearchive merely for upload.

Capture:
- upload/delivery id
- Apple processing state
- command/tool mechanism at a sanitized level

If the Developer-role key is insufficient:
- do not fall back to interactive auth.
- preserve the archive.
- stop and state the exact minimum Apple-side Founder action/role/key change required.
- publish a blocked handoff.

If upload succeeds:
- verify Apple recorded version 1.0 build 48.
- report processing state.
- clean only regenerable release/export scratch.
- retain archive.
- stop.

Do not begin HealthKit after upload.

Future Server backlog note

Do not implement this here, but preserve in backlog for the next Server task:
Move all scheduled briefing generation to 3:00 AM local time while preserving cadence dates and ensuring the evidence cutoff semantics intentionally allow the completed prior day plus ingestion/reconciliation buffer, including HealthKit sync latency. Audit Midweek, Weekly, Monthly and scheduled DEXA/event briefing paths; test timezone/DST and post-midnight/pre-3AM evidence. Do not regenerate historical briefings.

GitHub handoff

Claim and complete this task through the established inbox protocol.

Any terminal blocker requiring Founder action is a mandatory handoff publication point; do not merely pause in chat.

Publish completion under task id:
build48-photo-expand-api-upload-20260921

Report:
- verified Native/Server authority
- whether 8256db4b was recovered or reproduced
- exact Build 48 diff scope
- focused/full tests and gates
- independent review
- candidate SHA
- metadata/final SHA
- archive path/identity verification
- API upload mechanism
- whether API key was sufficient
- upload/delivery id and Apple processing state
- HealthKit unchanged
- production data unchanged
- remaining backlog including 3 AM briefing generation
- exact Founder acceptance checks

Explicit flags:
BUILD48_REVIEW_APPROVED
BUILD48_ARCHIVED
BUILD48_API_UPLOAD_PATH_READY
BUILD48_UPLOADED_VIA_API_KEY
BUILD48_APPLE_PROCESSING
PHOTO_EXPAND_INTERACTION_CORRECT
SERVER_PHOTO_FIX_PRESERVED
V3_BEHAVIOR_UNCHANGED
TRAINING_BEHAVIOR_UNCHANGED
DEXA_BEHAVIOR_UNCHANGED
HEALTHKIT_BEHAVIOR_UNCHANGED
PRODUCTION_DATA_MUTATED_DURING_BUILD48
FOUNDER_APPLE_ACTION_REQUIRED
READY_FOR_FOUNDER_BUILD48_ACCEPTANCE
READY_FOR_NEXT_HEALTHKIT_PHASE_AFTER_FOUNDER_ACCEPTANCE

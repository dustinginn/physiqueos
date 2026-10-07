PhysiqueOS Build 90 — release bump, archive, and guarded TestFlight upload

Continue in the existing Build 90 Native integration/release Claude Remote Control conversation and current provided work environment.

Do NOT create another Remote Control session or unnecessary worktree.

FOUNDER AUTHORIZATION

Founder explicitly authorizes the Build 90 Native release process from exact validated integration candidate:
8fab4fcb6be2c2c9d9f0f87b1123a6e49337fdbd

Integration report:
e7da8be969bdcd67f43317ed6da1f1b45121504c

Shipped Build 89 authority:
51399425b683d6a6e36b5c91836290259e31a7e0

Current production Server is independently:
1b6687ffbf016575e674d12406200c3792eb90a7
Adaptive Progression V1 already deployed.
Do not include or modify Server work in this release task.

GOAL

Create exact Build 90 Native release authority from the validated integrated candidate, run all required post-bump gates, archive, and perform the established guarded TestFlight upload.

No new product changes.

NO SCOPE EXPANSION

Do not add:
- new UI tweaks;
- progression changes;
- Operating Plan work;
- DEXA dead-end fix;
- backlog items;
- Server changes;
- unrelated cleanup.

If a release-blocking defect is discovered, STOP and report rather than making an unreviewed product change.

STEP 1 — PRE-RELEASE AUTHORITY

Freshly verify:
- exact HEAD/code authority at 8fab4fcb6be2c2c9d9f0f87b1123a6e49337fdbd before bump;
- clean worktree;
- pushed remote identity;
- no unexpected commits;
- shipped Build 89 remains latest release authority before this task;
- current production Server health is green, read-only check only;
- no Native/Server coupling introduced by Adaptive Progression V1.

STEP 2 — BUILD NUMBER BUMP

Bump Native build from 89 -> 90 using the established repository-authoritative versioning path.

Update exactly the required version authorities, including:
- APP_BUILD_NUMBER;
- CURRENT_PROJECT_VERSION across all required targets/configurations;
- TrainingLoggerTests build-number pin or equivalent existing test authority;
- any generated/version artifact required by the established process.

Do not change marketing version unless the repository release policy requires it. Expected marketing version remains 1.0.

Regenerate project artifacts using the established generator if required.

Require deterministic generation and no unrelated diffs.

STEP 3 — POST-BUMP SOURCE VERIFICATION

Verify:
- app build = 90;
- Watch app build = 90;
- Live Activity/Widget extension build = 90;
- all release targets coherent;
- no stale 89 pin remains where Build 90 authority should apply;
- no unintentional product-source diff beyond the approved integrated candidate + release-version bump/generated authority.

Run git diff --check.

STEP 4 — POST-BUMP TEST GATES

Run the established Build release gate appropriate for this repository.

At minimum:
- focused release/version tests;
- PhysiqueOSTests relevant smoke/full gate required by current release runbook;
- Watch unit smoke/full gate required by current release runbook;
- release configuration validation;
- any generator determinism checks required by changed version/project files.

Do not rerun every expensive UI suite if the established release process treats the already-green exact pre-bump integration candidate as sufficient and the only code delta is version metadata.

However:
- run any UI/release smoke required by the repository's accepted Build 89 release process;
- do not skip a gate that is explicitly release-authoritative.

Document exact gate counts.

STEP 5 — GENERIC RELEASE BUILD

Run a clean generic iOS Release build from exact bumped source.

Require:
- Build succeeds;
- embedded Watch app present;
- Live Activity/Widget extension present;
- all bundles version 1.0 (90);
- release entitlements/capabilities correct;
- verify_release_configuration.py passes;
- release seam scan remains 0 for review/debug launch flags and option-selection seams.

STEP 6 — ARCHIVE

Create the Build 90 archive using the established signed release/archive path.

Archive naming should clearly identify Build 90.

Protect existing Build 89 archive; never overwrite/delete it.

Record:
- exact archive path;
- archive UUID if applicable;
- app version/build from archive;
- embedded Watch/extension versions;
- signing identity/profile validation;
- archive source SHA.

Require archive validation before upload.

STEP 7 — GUARDED TESTFLIGHT UPLOAD

Use the established App Store Connect/TestFlight upload workflow.

Before upload:
- confirm no existing Build 90 already uploaded/processing in a conflicting state;
- verify archive is exact Build 90;
- verify bundle IDs;
- verify release authority and signing;
- verify no Server dependency gate is outstanding.

Perform one intended upload.

Do not retry blindly on transient App Store Connect error; diagnose first.

After upload:
- capture upload receipt/result;
- verify App Store Connect accepted the binary;
- if processing status is immediately available, record it;
- do not claim TestFlight availability until actual processing state confirms it.

STEP 8 — RELEASE AUTHORITY

Only after successful upload acceptance:

Update the repository's established Native release authority/latest-release metadata for Build 90 if and only if that is part of the accepted release workflow.

Do not overwrite Server release authority.

Record exact:
- Build 90 source SHA;
- version/build;
- archive;
- upload identifier/status;
- previous Build 89 authority;
- rollback/revert path.

If the established workflow waits until App Store Connect processing completes before updating latest release authority, follow that rule instead and leave status pending.

STEP 9 — STORAGE

Record free disk space before archive and after upload.

Remove only this lane's regenerable DerivedData/build intermediates after archive/upload verification if safe.

Do NOT delete:
- Build 89 archive;
- Build 90 archive;
- worktrees;
- source;
- credentials;
- review boards;
- uncertain files.

STEP 10 — PHYSICAL-DEVICE ACCEPTANCE HANDOFF

Publish the exact Build 90 physical-device acceptance checklist for Founder testing, including:

1. Logger WORKOUT/REST clock and End Rest.
2. Phone/Live Activity/Watch rest synchronization.
3. Watch handoff with unlocked Watch.
4. Watch handoff with locked/off-wrist/unreachable Watch.
5. Use without Watch no-reprompt behavior.
6. Photo Briefing expanded viewer with real Founder media.
7. Watch centered actions + live appearance propagation.
8. Energy wording/kcal/history/error/disclosure.
9. Recovery/Sleep charts/navigation/states.
10. Suggested progression behavior visible in Native after Server V1 deployment where applicable.
11. Existing DEXA appointment dead end remains known backlog, not a Build 90 regression.

REPORTING

Publish one main-visible Build 90 release report with:
- exact release SHA;
- bump commit;
- generated/project changes;
- all post-bump gates;
- generic Release result;
- archive path/identity;
- App Store Connect upload result/status;
- latest-release authority status;
- storage;
- physical-device acceptance checklist;
- confirmation no Server change/production mutation occurred in this task.

If upload accepted but processing is pending:
Status:
Build 90 uploaded to TestFlight — processing pending.

If processing is complete and release authority updated:
Status:
Build 90 TestFlight release ready for Founder acceptance.

If any release gate fails:
STOP and report HOLD.

Notify me and STOP.

END TASK.
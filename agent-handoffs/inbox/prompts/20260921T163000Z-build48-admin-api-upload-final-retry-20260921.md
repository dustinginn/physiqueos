Task id: build48-admin-api-upload-final-retry-20260921

Goal

Complete the already-built and verified Native Build 48 release by installing the Founder-authorized replacement Admin App Store Connect API credential locally and uploading the EXISTING Build 48 archive through the guarded API-key upload path. Do not rebuild, rebump, regenerate, rearchive, or change application code.

Direct Founder authorization

The Founder has now explicitly authorized in the live Claude chat:
- installing the replacement Admin App Store Connect API private key from the Mac Downloads folder into the appropriate owner-only local App Store Connect private-key directory;
- restrictive local permissions on the key;
- updating the local PhysiqueOS release configuration to use the replacement key identifiers;
- using that credential for the guarded Build 48 API-key upload;
- adding a supported scoped Claude permission rule if necessary so future PhysiqueOS App Store Connect key installation/replacement can be performed remotely without this interruption.

This GitHub task records the work to perform, but if the local classifier requires the direct chat authorization, use the authorization already given by the Founder in this same Claude conversation. Do not expose private-key contents.

Replacement Admin key identifiers

Key ID:
A2UF85693J

Issuer ID:
dc06c619-d69c-4edf-8770-61edfa9962a9

These identifiers are non-secret. The .p8 contents are secret.

Security rules

- Locate the replacement AuthKey_A2UF85693J.p8 (or corresponding downloaded file) in the Founder's Downloads folder without printing its contents.
- Never cat, display, log, paste, encode into chat/GitHub, or otherwise expose the .p8 contents.
- Never commit the key.
- Install it only into Apple's/our established owner-only local App Store Connect private-key location.
- Set restrictive filesystem permissions appropriate for a private key.
- Update only the local machine release configuration needed to select Key ID A2UF85693J and Issuer ID dc06c619-d69c-4edf-8770-61edfa9962a9.
- Do not publish secret-bearing paths/content or credential values beyond the non-secret Key/Issuer IDs above.
- Do not use browser automation.
- Do not fall back to interactive Xcode account authentication.
- Do not alter signing certificates/profiles manually unless the Admin API-key cloud-signing flow itself does so through Apple's supported mechanism.
- If a supported scoped Claude permission rule is needed for future credential replacement, add it only after verifying the installed Claude Code permission syntax; do not add secrets to the rule.

Build 48 authority

Reverify, but expected:
Native final SHA bbb46e19084a7b7e0860a1d5e84e20e2f6649d1a
Build 48 = version 1.0 (48)
Archive:
~/Library/Developer/Xcode/Archives/2026-09-21/PhysiqueOS Build 48.xcarchive

Expected production Server:
a428fbda42757620750264e63eaee18950ab7132
deployment d3783f4c-bc14-469b-b10c-93635a047325

Before upload, verify the existing archive identity:
- com.physiqueos.native.dev
- team 33GMTRM6G9
- 1.0 (48)
- arm64
- valid signature/archive
- HealthKit entitlements and usage strings remain as previously verified
Do not rerun the Native build/test suite merely for this credential retry.

Prior release state

Build 48 code/review/archive are already complete:
- 1225/1225 Native unit tests
- PhotoBriefing 29/29
- Debug/Release compile passed
- deterministic regeneration passed
- launch smoke passed
- independent review approved
- photo tap-to-expand exercised in simulator
- archive verified
- no production data mutation

The previous Developer-role API key authenticated successfully but failed cloud-managed distribution signing. No Build 48 delivery was created. The retained archive must be reused.

Execution

1. Install/select the Admin key securely.
2. Update local release config to the replacement Key/Issuer identifiers.
3. Run the guarded helper auth-check.
4. Run the guarded helper dry run against the existing Build 48 archive.
5. Confirm every archive/version/build/bundle guard passes.
6. Execute the real API-key upload with the exact confirmation required by the helper.
7. Prove the operation is using API-key authentication, not the saved interactive Xcode account.
8. If upload succeeds, capture sanitized delivery/upload id and Apple's processing state.
9. Verify Apple recorded version 1.0 build 48 if the available tooling can do so without interactive auth.
10. Clean only regenerable upload/export scratch; retain the archive.
11. Stop. Do not begin HealthKit.

If Admin API key still fails

Do not fall back to interactive authentication.
Do not rebuild.
Do not rearchive.
Publish a blocked completion handoff stating the exact Apple error and minimum Founder action required.

If upload succeeds

Publish the completion handoff and stop.

Permission durability

If the prior direct Founder authorization permits it and supported Claude Code configuration allows it, add the narrow standing local permission necessary for future execution of the established credential-install/replacement operation and guarded physiqueos-asc-upload helper without another classifier interruption. Do not create blanket secret-store permissions unrelated to PhysiqueOS/App Store Connect.

GitHub completion

Claim and complete this task through the inbox protocol.

Any terminal blocker requiring Founder action is a mandatory handoff publication point.

Publish under task id:
build48-admin-api-upload-final-retry-20260921

Report:
- Build 48 archive identity
- Admin credential installation success without exposing key contents
- auth-check result
- dry-run result
- API-key upload result
- delivery/upload id
- Apple processing state
- whether cloud signing succeeded
- whether persistent scoped permission was added
- whether interactive Xcode auth was used (expected NO)
- production/HealthKit unchanged
- remaining backlog: 3 AM briefing generation, future workout-draft cross-update persistence reliability, optional photo accessibility polish
- exact Founder acceptance next step

Explicit flags:
BUILD48_ARCHIVE_REUSED
ADMIN_API_KEY_INSTALLED
API_KEY_AUTH_CHECK_PASSED
API_KEY_CLOUD_SIGNING_SUCCEEDED
BUILD48_API_UPLOAD_PATH_READY
BUILD48_UPLOADED_VIA_API_KEY
BUILD48_APPLE_PROCESSING
INTERACTIVE_XCODE_AUTH_USED
SCOPED_FUTURE_UPLOAD_PERMISSION_READY
HEALTHKIT_BEHAVIOR_UNCHANGED
PRODUCTION_DATA_MUTATED
FOUNDER_ACTION_REQUIRED
READY_FOR_FOUNDER_BUILD48_ACCEPTANCE
READY_FOR_NEXT_HEALTHKIT_PHASE_AFTER_FOUNDER_ACCEPTANCE

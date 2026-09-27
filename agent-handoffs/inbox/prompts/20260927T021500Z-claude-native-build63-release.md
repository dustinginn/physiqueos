Task id: claude-native-build63-release-from-reviewed-batched-candidate-20260927

Proceed in the existing Claude Native release lane.

Founder explicitly authorizes cutting and uploading the next TestFlight build from the exact reviewed candidate:
8a88873e2764340373bc2f2a6d46a6d634387ca2

Do not add any additional feature or behavioral changes in this task.

Read first:
agent-handoffs/reports/20260927T020000Z-native-batched-candidate-post-build62-ready.md
agent-handoffs/STANDING_DISK_SAFETY.md

RELEASE SCOPE

1. Reverify candidate identity and ancestry
Base must remain exact uploaded Build62 source 85c38104.
Candidate must remain exactly 8a88873e with only the already-reviewed batched changes described in the report.
Stop on unexpected divergence.

2. Build-number bump only
Bump APP_BUILD_NUMBER 62 -> 63 using the project's authoritative generator flow.
Regenerate project files.
Do not change MARKETING_VERSION, bundle identifier, signing identity, capabilities, or any source behavior.

3. Re-run fresh validation after regeneration
Run the same relevant validation used for the reviewed candidate, including:
full PhysiqueOSTests;
GoalsAcceptanceUITests;
TrainingAcceptanceUITests;
release configuration verifier;
Release build;
store/bundle validation as appropriate.
Respect disk-safety thresholds before heavy Xcode work.

4. Archive
Create the signed Build63 archive using established Xcode tooling.
Do not browser-login to App Store Connect or Apple Developer.
If interactive reauth is required, stop and report.

5. Guarded upload dry-run
Use the established physiqueos-asc-upload tooling against the canonical Xcode Archives location.
Verify:
bundle id com.physiqueos.native.dev;
version 1.0;
build 63;
signature;
dSYM UUID match;
build 63 > last uploaded build;
no prior successful upload for this exact archive;
all environment/auth gates pass.

6. Upload
Founder explicitly authorizes the real upload of version 1.0 Build 63 if every dry-run gate passes.
Use the established --execute / --confirm guarded flow.
Do not create Build64 or substitute another archive if Build63 is rejected without separate Founder authorization.

7. Post-upload verification
Verify App Store Connect processing status with the established read-only status tool.
Do not claim TestFlight availability beyond what the tool verifies.

FOUNDER ACCEPTANCE SCOPE FOR BUILD63

Preserve the exact accepted/reviewed candidate behavior:
- Strength reconciliation diagnostics and explicit missing-version error handling.
- In-app Workout Reconciliation Diagnostics screen.
- Active Goal Your Journey Home-style progress presentation.
- Logged Today Training includes canonical Cardio on Cardio-only days without fabricating Logger semantics.
- Completed Visible Abs Goal Beginning/Completion use actual canonical progress photos.
- Reconciliation-review notifications preserved.
- Performance Phase2, Training/Cardio, local-day behavior, Active Goal V3 content otherwise unchanged.

Do not retry Sep24 Strength reconciliation in this task.
Do not operate Founder device.
Do not mutate production data.
Do not deploy Server code.
Do not change HealthKit graduation policy.
Do not regenerate historical strategic artifacts.

Publish a GH report/pointer with:
final Build63 source SHA after build-number bump;
ancestry to 8a88873e and Build62 base;
fresh test counts/results;
Release build result;
archive identity;
dry-run result;
upload result/delivery id;
App Store Connect processing status;
reauth status;
confirmation no feature changes beyond build-number metadata.

END TASK.

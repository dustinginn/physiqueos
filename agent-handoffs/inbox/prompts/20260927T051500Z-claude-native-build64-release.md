Task id: claude-native-build64-release-from-104c34ff-20260927

Proceed in the existing Claude Native release lane.

Founder explicitly authorizes cutting and uploading the next TestFlight build from exact release-ready candidate:
104c34ff

Do not add feature or behavioral changes.

STANDING REMOTE-CONTROL NOTIFICATION REQUIREMENT

Founder operates primarily from phone. Whenever this Claude session stops for ANY reason, send the Founder a push notification immediately so they know to return to the session.

This includes:
task completion;
waiting for Founder authorization;
permission/classifier gate;
authentication or reauthentication requirement;
test/build/review failure;
unexpected authority/divergence;
blocker;
error;
or any other condition that prevents autonomous continuation.

Do not silently stop or wait without notifying the Founder.

Read:
agent-handoffs/reports/20260927T045852Z-candidate-release-readiness.md
agent-handoffs/reports/20260927T035200Z-visible-abs-photo-fix.md
agent-handoffs/reports/20260927T031700Z-build63-acceptance-diagnosis.md
agent-handoffs/STANDING_DISK_SAFETY.md

RELEASE

1. Reverify exact candidate 104c34ff and ancestry from Build63 source 1ef837815fc43b70996abd972d1648547db78f46.
2. Bump APP_BUILD_NUMBER 63 -> 64 using the authoritative generator and regenerate project metadata. No MARKETING_VERSION/bundle/signing/capability/source-behavior change.
3. Re-run fresh release validation after regeneration. At minimum verify full relevant unit/UI suites, release configuration, Release build/store validation. Respect disk-safety thresholds.
4. Archive Build64 using established Xcode tooling.
5. Run guarded physiqueos-asc-upload dry-run against canonical archive path. Verify bundle com.physiqueos.native.dev, version 1.0, build 64, signature, dSYM, monotonic build number, archive uniqueness, auth.
6. Founder explicitly authorizes the real Build64 upload if every gate passes. Use established execute/confirm flow. No browser login. Stop and notify Founder if interactive reauth is required.
7. Verify App Store Connect processing with the established read-only status tool. Do not overclaim tester-facing availability.

BUILD64 CONTENT TO PRESERVE

- Your Journey real production currentState path now renders Home-style phase progress bars.
- Completed Visible Abs Beginning/Completion decode the actual Native media descriptor wire shape and render canonical photos.
- Strength reconciliation adds taskWasCancelledAtCatch diagnostic signal; no speculative retry behavior added.
- Existing Workout Reconciliation Diagnostics screen and prior diagnostics preserved.
- Logged Today Cardio PASS behavior preserved.
- Reconciliation-review notifications preserved.
- Performance Phase2, Training/Cardio, local-day behavior, Active Goal V3, and HealthKit Cardio Phase1/V3 preserved.

Do not retry Sep24 Strength in this task.
Do not operate Founder device.
Do not mutate production data.
Do not deploy Server code or change HealthKit policy.
Do not regenerate historical strategic artifacts.
Do not create Build65 if Build64 is rejected without separate Founder authorization.

Publish GH report/pointer with final Build64 SHA, ancestry, fresh tests, Release build, archive identity, dry-run, upload/delivery id, processing status, reauth status, and confirmation of no behavioral changes beyond the reviewed 104c34ff candidate plus build metadata.

Before ending the session for any reason, send Founder a push notification.

END TASK.

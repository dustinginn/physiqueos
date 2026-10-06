PhysiqueOS Build 88 — Founder authorization to bump, archive and upload final Native candidate

Continue in the EXISTING Claude Batch 3 integration / final Native Remote Control chat using High reasoning. Same chat.

FOUNDER AUTHORIZATION

Founder explicitly authorizes Build 88 from exact final Native candidate:

96e724a9f40f9178a16ea492958c3acd4b1b282e

Proceed with:
- build-number bump to 88;
- required regeneration/testing;
- Release archive;
- guarded TestFlight upload;
- wait for App Store Connect VALID;
- publish exact shipped authority and acceptance checklist.

This authorization does NOT authorize unrelated code changes.

WORKTREE / AUTHORITY

Stay in the existing single RC-provided worktree/branch:
claude/batch3-integrated-on-workout-preview-20261005

Start by verifying HEAD is exact:
96e724a9f40f9178a16ea492958c3acd4b1b282e

Working tree must be clean.

No EnterWorktree.
No secondary worktree.

PRODUCTION SERVER

Production Server remains:
b7eb1e397f0238df9ae904fd182ddbb51602e8d8
deployment 6fa4e887

No Server deploy or production-data mutation in this task.

BUILD 88 BUMP — ONLY EXPECTED SOURCE CHANGES

1. Set APP_BUILD_NUMBER = 88 in:
ios/scripts/generate_project.py

2. Update the pinned CFBundleVersion expectation to "88" in:
ios/PhysiqueOSTests/TrainingLoggerTests.swift

3. Regenerate:
python3 ios/scripts/generate_project.py

Audit the generated diff.

No product behavior should change from 96e724a9.

If any unrelated source/generated change appears, stop and investigate before committing.

POST-BUMP GATES

At minimum run the complete full Native unit suite because the build-number pin is tested.

Also run:
- project generation/byte stability;
- focused build-number/TrainingLogger tests;
- generic iOS Release compile;
- Release seam scan;
- verify Watch + WidgetKit/Live Activity embedding.

Given this is the actual TestFlight authority, if anything in regeneration touches behavior-bearing files unexpectedly, rerun the full Watch/UI gates as well.

The already-completed pre-bump gates on 96e724a9 remain:
- Native 2066/0;
- Watch 49/49;
- UI 60/60;
- Evidence reliability 10/10;
- Release OK.

Do not wave through any new failure.

If full unit tests rewrite snapshot PNG artifacts as a test side effect, restore them and do not commit them.

COMMIT / PUSH

After clean post-bump gates:
- commit only the intended Build 88 bump/generated changes;
- use a clear commit such as:
  chore(ios): Build 88
- push;
- record exact Build 88 source SHA.

ARCHIVE

Create a real archive copy in the dated Xcode Archives directory, not a symlink.

Use Release configuration and generic iOS destination with provisioning updates as established.

Archive must correspond exactly to the pushed Build 88 source SHA.

VERIFY ARCHIVE BEFORE UPLOAD

Verify:
- app bundle id com.physiqueos.native.dev;
- marketing version 1.0;
- CFBundleVersion 88;
- Watch app embedded;
- WidgetKit / Live Activity extension embedded;
- signing/provisioning valid;
- no Debug/review/synthetic seams;
- archive source authority matches Build 88 SHA.

GUARDED TESTFLIGHT UPLOAD

Use the established guarded uploader:
~/.physiqueos-release/bin/physiqueos-asc-upload

Run dry-run first.

Only if dry-run is clean, execute the real upload with the exact confirmation phrase for:
com.physiqueos.native.dev 1.0 (88)

Capture:
- delivery id;
- upload result;
- processing status.

WAIT FOR VALID

Poll status at a reasonable cadence until App Store Connect reports:
VALID

If processing fails/rejects:
- do not blindly re-upload;
- diagnose exact rejection;
- fix only if bounded and authorized by existing release semantics;
- if a new product/signing decision is required, STOP and ask Founder.

Do not claim Build 88 is ready until VALID.

WATCH / TESTFLIGHT

After VALID, report whether the build is available for Founder TestFlight installation.

Do not attempt to operate the Founder's physical iPhone/Watch unless the established release tooling explicitly supports it and no user action is required.

Provide concise installation/update instruction if Founder action is required.

PHYSICAL FOUNDER ACCEPTANCE CHECKLIST

Publish this checklist in the closeout:

1. Real Progress Photos
- real-media intake;
- pose confirmation;
- staged upload;
- review;
- Photos Evidence;
- first/latest mapping;
- inspector/enlargement/comparison.

2. Evidence recovery
- normal cold/warm opens;
- Try Again;
- pull to refresh;
- foreground recovery;
- temporary network loss;
- loaded hub remains visible on failed refresh.

3. Watch superset responsiveness
- ordinary sets;
- A -> B;
- B -> next-round A;
- completion acknowledgement latency.

4. Watch-finished workout
- phone shows full recap;
- PR list;
- one-time confetti when earned;
- no duplicate celebration.

5. Superset contextual progression
- Leg Extension + Sissy Squat or another relationship with history;
- pair after exercises are on screen;
- untouched/uncompleted rows refresh from superset context;
- Suggested/Maintain reflects exact relationship;
- completed/manual rows unchanged;
- Watch receives refreshed projection.

6. Redesigned Evidence
- Hub/Timeline;
- Training/Activity;
- Nutrition/Weight;
- Progress Photos/DEXA and all disclosures;
- Add Evidence/generic Review;
- Nutrition macro colors;
- Workout Match L13.

7. General smoke
- Home;
- Goals;
- Log;
- You;
- notifications;
- Watch pairing/session continuity;
- Live Activity/widget presence.

BUILD 88 CLOSEOUT

Publish:
- exact Build 88 Native source SHA;
- archive path/name;
- bundle/version/build;
- TestFlight delivery id;
- VALID timestamp/status;
- post-bump test results;
- production Server authority;
- DNS healthy status;
- no production mutation statement;
- physical acceptance checklist;
- known carried backlog:
  - Watch Review/Confirmation Complete Set gating + timed-set projection;
  - next-workout latency follow-up / reply-before-side-effects if telemetry warrants;
  - Evidence startup efficiency/read fan-out;
  - Energy/Weekly/Monthly chart overlay;
  - Beta Readiness issues #2–#5.

REPORTING

Publish main-visible Build 88 closeout and update normal handoff pointers.

NOTIFICATION

Notify Founder whenever Claude stops or needs input.

On successful App Store Connect validation notify:
PhysiqueOS Build 88 — VALID in TestFlight and ready for Founder acceptance.

STOP

Stop after VALID and closeout.

Do not start Watch projection or Evidence efficiency backlog work in this task.
Do not deploy Server.
Do not mutate production data.

END TASK.
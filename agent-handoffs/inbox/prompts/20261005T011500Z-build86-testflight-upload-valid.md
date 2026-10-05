PhysiqueOS Build 86 — archive, guarded TestFlight upload, and VALID verification

TASK TYPE

Continue in the EXISTING Build 86 Claude Remote Control chat/session.
Use High reasoning.
Do not create a new Claude chat.
Stay in the current Remote Control-authorized worktree.
DO NOT use EnterWorktree or create/switch to another worktree.

FOUNDER AUTHORIZATION

Founder explicitly authorizes archive and TestFlight upload of Build 86.

CURRENT NATIVE AUTHORITY

Combined Build 86 head:
cec8af20a6121bb66ecca3ba9f667d91774a891c

Version:
1.0 (86)

Last uploaded build was 85 as of the final integration report.

Build 86 contains:
- Watch HealthKit automatic exactly-once recording for phone-started structured workouts;
- truthful Watch Health status and live HR/energy metrics;
- non-blocking Watch refresh / Complete Set latency fix and instrumentation;
- accepted Foam Rolling Priority Detail implementation;
- global System / Dark / Mineral Light appearance infrastructure;
- narrow You -> Settings -> Appearance route.

SERVER AUTHORITY

Option A confirmed Strength presentation is deployed and verified at:
27dad44a... (use exact full deployed SHA from current production verification)

The Founder has now resolved today's pending Workout Match using “Use Logger session 1.”

Do not mutate that review or any production workout data.

PRE-UPLOAD REVERIFY

Before archiving:
- confirm current checkout/head is exactly cec8af20a6121bb66ecca3ba9f667d91774a891c;
- confirm worktree is clean;
- confirm project generator is byte-identical;
- confirm build number 86 throughout app/Watch/extensions;
- confirm last uploaded build is still 85 and build 86 has not already been delivered;
- confirm no newer authorized Native commit supersedes cec8af20;
- do not pull unrelated work into Build 86.

ARCHIVE

Archive the exact authorized head using the established Xcode workflow from the final integration report.

Use Xcode signing/provisioning as previously accepted.
Do not log into App Store Connect or Apple Developer in a browser.
If Xcode authentication is required, stop and tell the Founder exactly what action is needed.

Archive path must identify Build 86 and cec8af20.
If the release workflow requires copying into ~/Library/Developer/Xcode/Archives/<date>/, copy it; do not symlink it.

Verify the archive contains the expected iPhone app, Watch app and extensions and all use CFBundleVersion 86.

GUARDED UPLOAD

Use the established guarded uploader.

First run the dry run for:
bundle id com.physiqueos.native.dev
version 1.0
build 86

It must exit successfully and explicitly report WOULD UPLOAD.

Then, because the Founder has authorized this task, execute the guarded upload using the exact confirmation string required by the release tool.

Do not bypass the guardrails.

VALID VERIFICATION

Capture the delivery id.
Poll the established status command until the delivery reaches VALID or a terminal failure.

If processing is merely pending, continue normal bounded polling.
If authentication, signing, validation or upload fails, stop and report the exact blocker; do not improvise a browser-based workaround.

POST-UPLOAD

Publish a concise report with:
- exact Native SHA uploaded;
- archive identity/path;
- build/version;
- delivery id;
- final TestFlight status;
- confirmation that Server remains on Option A authority;
- confirmation no production data mutation occurred;
- physical-device acceptance checklist for Build 86.

Update normal latest/reporting pointers.

PHYSICAL DEVICE ACCEPTANCE

After VALID, tell Founder to install Build 86 and validate:

1. System / Dark / Mineral Light:
   - System follows iPhone;
   - Dark persists;
   - Light persists as Mineral Light;
   - return to System;
   - check You -> Settings -> Appearance.

2. Foam Rolling Priority Detail:
   - visual treatment;
   - Complete;
   - Skip;
   - setup -> Recovery Support if applicable.

3. Next real structured strength workout:
   - start normally on iPhone without Ready for Watch;
   - open PhysiqueOS Watch app;
   - HealthKit starts exactly once;
   - HR, Active Calories, Total Calories populate;
   - Health status is truthful;
   - Complete Set responsiveness at arm's length and 10–15 ft;
   - wrist down/up;
   - phone-originated set changes;
   - pause/resume;
   - finish saves exactly one Apple Health strength workout;
   - Watch relaunch mid-workout does not create duplicate.

4. Extensions:
   - small/large Home widgets in both system appearances;
   - Live Activity / Dynamic Island when naturally available;
   - Watch remains independent of iPhone appearance preference.

Do not close Watch/appearance release-gated ledger entries until physical acceptance is reported.

STOP after Build 86 reaches VALID and the report is published, or after a concrete blocker requiring Founder action.

END TASK.
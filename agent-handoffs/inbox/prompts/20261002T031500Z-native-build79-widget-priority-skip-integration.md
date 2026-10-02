Native Build 79 — consolidate Home Screen Widget V1 + Priority Skip capability

TASK TYPE

Single Native integration/release lane.

No new product scope.

READ FIRST

Build 78 final:
agent-handoffs/reports/20261002T010500Z-native-build78-completion-notification-polish.md

Priority Skip final:
agent-handoffs/reports/20261002T021500Z-priority-skip-peptides-foam-notification.md

Home Widget implementation:
agent-handoffs/reports/20261002T023151Z-home-screen-widget-v1-implementation.md

PAT maintenance:
agent-handoffs/reports/20261002T025604Z-mac-do-console-pat-maintenance-final.md

Durable backlog:
agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md

Standing GH protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

AUTHORITIES

Build 78 shipping base:
5911dd2a6f968c5a355ec68d3313f0e5e644d529

Priority Skip Native candidate:
88d597b25d49f773a12b7dcff3930b0f237a7a46

Home Widget Native candidate:
820401430b154eae64821d1fd7dc9ad993826f3c

Production Server Priority Skip capability:
2d967e48cb6a01e4a327934bbd81a405d3c26486
already deployed and verified.

Latest uploaded Native:
Build 78 VALID.

Mac post-restart:
- approximately 34 GiB free at Founder check;
- swap 0;
- DigitalOcean PAT maintenance complete;
- do not perform credential changes.

A. CREATE CONSOLIDATION BRANCH

Create a fresh integration branch/worktree from exact Build 78 5911dd2a.

Integrate BOTH exact reviewed candidates:
- Priority Skip 88d597b2;
- Home Widget 82040143.

Use merge/cherry-pick/replay method that preserves semantics and reviewability.

Do not absorb unrelated branch changes.

Reverify the previously observed no-conflict merge-tree, but perform fresh semantic review of the integrated tree.

B. LOCKED BUILD 79 SCOPE

Priority:
- peptide Detail supports canonical Skip;
- peptide notification Complete remains planned-dose/specialized;
- peptide notification adds Skip;
- peptide Skip records no dose/effectiveDose/completion evidence;
- Foam Rolling notification adds Skip;
- supplements remain no-Skip;
- Morning Check-In/weight remain no direct actions;
- Server-owned skipCommand is authority;
- existing Build 78 Complete/Skip haptics preserved.

Home widget:
- existing WidgetKit extension;
- systemSmall four-tile square as primary Founder-approved V1;
- optional systemLarge detailed Logged Today alternate;
- Nutrition calories + P/C/F;
- Activity active calories;
- exact-today Weight;
- large alternate includes Training;
- compact refresh;
- Start Logger / Resume Workout;
- App Group snapshot;
- no Server credentials or HealthKit reads in extension;
- exact-day/no-fallback semantics;
- privacy/stale/midnight states.

Preserve:
- Build 78 PR celebration + haptic;
- Build 77 Live Activities;
- TrainingSessionAuthority;
- all existing HealthKit behavior.

C. REVERIFY SERVER CONTRACT

Before final Native tests, perform read-only verification that production Server is exact expected authority or a compatible descendant.

Confirm representative current contracts expose:
- peptide notificationAction.skipCommand;
- Foam Rolling notificationAction.skipCommand;
- supplement no Skip;
without mutating Founder data.

Do not manually create/skip/complete occurrences for this check.

D. APP GROUP / SIGNING PREFLIGHT

The Home Widget candidate introduces:
group.com.physiqueos.native.dev.shared

Verify:
- same App Group in app and existing Widget extension;
- extension has App Group only, no HealthKit;
- app retains HealthKit;
- no credential/token stored in shared container;
- generator deterministic;
- release verifier correct.

Use Xcode automatic/cloud signing.

Do not browser-login Apple Developer/App Store Connect.

If capability/profile creation requires Founder interaction, Apple re-auth, 2FA, or manual Developer portal work:
STOP before release and publish exact required action.

Do not invent a workaround.

E. INTEGRATED REVIEW

Fresh independent review of the exact integrated candidate focused on:
- overlap/regression between Priority notification code and Widget/deep-link changes;
- App Group privacy/security;
- exact-day widget semantics;
- Start/Resume creates no duplicate workout;
- peptide Skip no-dose semantics;
- specialized Complete remains specialized;
- Foam Skip;
- backward-compatible old notification payloads;
- Live Activity extension coexistence with Home widget;
- PR completion lifecycle;
- authority/account/Sandbox-Production fencing.

Resolve substantive findings and re-review.

F. TESTS

Run on exact final candidate.

Priority:
- all new skip/capability tests;
- notification categories/delegate/scheduler;
- Priority Detail;
- peptide planned-dose Complete;
- peptide Skip no dose;
- Foam Skip;
- supplement no Skip;
- stale/duplicate/network/idempotency;
- haptics.

Widget:
- snapshot schema/store;
- exact-day/no fallback;
- Nutrition P/C/F;
- Activity partial;
- Weight;
- stale/offline/midnight/DST/timezone;
- privacy;
- Start/Resume;
- saved-left;
- authority/account fences;
- refresh;
- shipping render states;
- small + large.

Workout/Live Activity:
- TrainingSessionAuthority;
- projection;
- coordinator;
- Complete Set intent;
- views;
- rest modes;
- Workout Complete / PR celebration lifecycle.

Full Native:
- run complete unit suite;
- document known pre-existing peptide sandbox failure separately if still present;
- no new deterministic failures.

UI:
risk-scaled journeys for:
- Workout Complete/PR lifecycle;
- Start/Resume Logger deep link;
- existing Live Activity;
- Priority detail peptide Skip;
- widget routing where simulator permits.

G. SHIPPING RENDERS

Regenerate actual shipping widget images from the integrated candidate.

Founder has already accepted the concept.

Do not stop merely for another visual review if the integrated renders match the approved Codex candidate.

Stop only for Founder review if integration materially changes layout/content.

H. BUILD NUMBER

Reverify latest uploaded Native build.

If 78 remains latest:
Build 79.

Use one bump only after integrated candidate is accepted.

I. ARCHIVE

Before archive:
- disk >=15 GiB, preferably >=20;
- no conflicting active heavy build;
- generator/verifier green.

Archive Release generic iOS device.

Inspect:
- app version/build;
- existing Widget extension version/build;
- Home widget registered;
- Live Activity still registered;
- app signed App Group entitlement;
- extension signed same App Group;
- extension does NOT have HealthKit;
- app retains HealthKit;
- dSYMs;
- codesign.

J. TESTFLIGHT

If archive/signing is clean:
- guarded release tooling;
- dry run;
- upload Build 79;
- wait for VALID;
- no browser login;
- stop on required Founder auth.

K. PHYSICAL DEVICE CHECKLIST

After VALID, provide one compact acceptance checklist combining:

Home widget:
- gallery discovery;
- small square;
- large alternate;
- current-day totals;
- no-weight;
- refresh;
- Start Logger;
- Resume Workout;
- stale/privacy;
- real App Group refresh.

Priority:
- peptide Detail Skip;
- peptide notification Complete/Skip/Snooze;
- skipped peptide no dose;
- Foam notification Complete/Skip/Snooze;
- supplement no Skip;
- Morning Check-In no actions.

Carry-forward:
- PR celebration confetti+haptic;
- Live Activity real-workout acceptance.

Do not claim physical acceptance before Founder performs it.

L. BACKLOG

After Build 79 VALID:
update durable backlog:
- Home Widget V1 shipped / physical acceptance pending;
- peptide/Foam Skip shipped / physical acceptance pending;
- Build 78 items retain acceptance status as appropriate;
- do not mark complete until Founder confirms where physical acceptance matters.

M. REPORT

Publish to origin/main:
agent-handoffs/reports/<timestamp>-native-build79-widget-priority-skip-integration.md

Include:
- exact base;
- exact integrated candidate;
- integration method;
- Server verification;
- review;
- test counts;
- signing/App Group;
- archive;
- delivery id;
- VALID status;
- physical checklist;
- backlog update;
- known limitations.

MANDATORY GH STOP RULE

Before ANY stop:
- push implementation branch;
- publish checkpoint/final report to origin/main;
- update latest pointers;
- fetch/reverify origin/main;
- re-read exact report from main;
- give Founder exact main report commit SHA.

END TASK.

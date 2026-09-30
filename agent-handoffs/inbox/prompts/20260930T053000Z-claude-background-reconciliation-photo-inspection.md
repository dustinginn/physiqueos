Claude post-Build-70 Native polish batch — background reconciliation + photo inspection

STANDING REPORTING PROTOCOL

Before stopping for any reason, obey:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

CURRENT STATE

Build 70 Server is deployed and Native Build 70 is VALID in TestFlight.

Build 70 is Founder-accepted so far, with natural-event acceptance still pending for Workout Complete PR/confetti and the real paused-peptide Thursday behavior.

Do not reopen accepted Build 70 work unless this task reveals a direct regression.

SCOPE

This batch contains exactly three product items:

1. HealthKit Strength reconciliation background notification.
2. Photo Briefing image tap-to-expand / inspect.
3. Progress Photos Evidence image tap-to-expand / inspect.

Previously reported Progress Photos "Retry photo" loading/recovery and incorrect "Photo Briefing is being prepared" state are RESOLVED and removed from backlog. Do not work on them.

After this batch is Founder-accepted, HealthKit Sleep is the next project. Do NOT begin Sleep in this task.

ITEM 1 — HEALTHKIT STRENGTH RECONCILIATION BACKGROUND NOTIFICATION

Founder reproduced on Sep 29:

- Apple Health Strength workout existed.
- PhysiqueOS Logger session existed.
- Reconciliation/matching itself worked and produced a 95% match.
- Hours passed with no notification.
- Opening Log caused the reconciliation flow/notification to appear.

Therefore the remaining defect is not matching quality. It is the execution trigger/lifecycle.

EXPECTED EXPERIENCE

After a Watch/Apple Health Strength workout is ingested and a matching PhysiqueOS Logger session exists:

- reconciliation should run without requiring Log to open;
- pending review should be created through the authoritative path;
- local notification should be scheduled when appropriate;
- user may be on another tab or the app may be backgrounded;
- when iOS grants the app background execution, the workflow should progress without UI navigation acting as the trigger;
- tapping the notification should deep-link to the exact pending reconciliation review.

Do not promise impossible real-time behavior when iOS has not granted background execution. The requirement is to remove the Log-page dependency and correctly use the available HealthKit/background lifecycle.

DIAGNOSE BEFORE PATCHING

Trace end-to-end:
HealthKit observer/background delivery
→ HealthKit query/anchor
→ workout ingestion
→ canonical workout availability
→ reconciliation candidate discovery
→ matching
→ pending review creation
→ notification scheduling
→ deep link.

Instrument/test enough to identify exactly which step currently only executes because Log loads.

Audit:
- observer query registration;
- enableBackgroundDelivery;
- application/background lifecycle;
- async task lifetime;
- BackgroundExecutionAssertion where relevant;
- actor/task cancellation;
- HealthKit anchor persistence;
- duplicate/idempotency behavior;
- reconciliation trigger ownership;
- notification authorization/scheduling;
- whether Log view model currently performs work that belongs in a service/background coordinator.

Fix the ownership problem rather than calling a UI method from background code.

PRESERVE

- current 95% matching/review semantics;
- standard Evidence Review confirmation;
- no automatic Strength confirmation without review;
- existing HealthKit cardio/activity behavior;
- idempotency/duplicate protection;
- existing notification deep-link behavior;
- no notification spam.

ACCEPTANCE

Deterministic lifecycle tests should establish:
- HealthKit workout arrives while Log never opens;
- ingestion triggers reconciliation service;
- matching Logger session creates one pending review;
- one notification scheduled;
- repeated background delivery is idempotent;
- no matching Logger session does not create false review;
- later Logger session can reconcile if ordering is reversed;
- app foreground/background transitions do not duplicate;
- notification tap routes to exact review.

Founder real-device acceptance:
Complete/receive a Watch Strength workout with a matching Logger session and DO NOT open Log. Notification should arrive when the background pipeline processes it; tap should open the correct pending review.

ITEM 2 — PHOTO BRIEFING IMAGE INSPECTION

Every progress photo displayed in a Photo Briefing comparison should be tappable for inspection.

Use a native iOS interaction.

Preferred behavior:
- photo itself is the primary tap target;
- optional subtle expand affordance/icon if useful for discoverability;
- opens a full-screen or appropriately immersive viewer;
- pinch to zoom;
- pan while zoomed;
- dismiss via obvious native control/gesture;
- preserve orientation/aspect ratio;
- use the highest appropriate available display media, not a tiny thumbnail;
- no accidental evidence mutation;
- accessibility labels/actions.

Do not clutter the zine-style briefing with a large repeated "Tap to expand" button under every image.

If the existing copy says "Tap a photo to expand", make the behavior true.

ITEM 3 — PROGRESS PHOTOS EVIDENCE IMAGE INSPECTION

Any progress photo displayed on the Progress Photos Evidence page should support the same enlargement/inspection behavior.

Use the SAME reusable viewer/component as Photo Briefing unless there is a compelling technical reason not to.

The purpose is to inspect small physique details, so zoom quality matters.

Audit media-resolution selection. Do not unnecessarily fetch/render RAW/DNG if a high-quality display derivative is the correct product source.

Navigation/state:
- returning from viewer should preserve the Evidence page position/state;
- no duplicate loading or navigation stack corruption;
- handle unavailable media gracefully.

TESTING

Risk-scaled validation.

For the background reconciliation:
- deterministic service/lifecycle/idempotency tests are primary;
- one focused simulator/device flow if it answers a lifecycle question automated tests cannot;
- Founder real-device natural-event acceptance remains the final proof.

For photo viewer:
- targeted view/model/component tests;
- Release compile;
- one focused visual/interaction check of zoom/pan/dismiss on each entry surface is appropriate;
- do NOT run a broad simulator tour.

Do not rerun the entire app manually.

BUILD / DISTRIBUTION

Do not choose a build number or upload TestFlight until implementation/review is complete and ChatGPT/Founder authorizes distribution.

Do not deploy Server unless diagnosis proves a Server change is required. If Server work is required, isolate it and report before deployment.

NEXT PROJECT

HealthKit Sleep is next AFTER this batch is accepted.

Do not start Sleep architecture or implementation in this task.

REPORTING

Before every stop publish GH checkpoint/final report with:
- root cause for notification issue;
- exact files/services changed;
- exact Native/Server branch + SHA;
- photo viewer architecture/reuse;
- tests actually run/results;
- tests not run;
- focused visual/device validation performed;
- Server deploy status;
- TestFlight status;
- Founder acceptance checklist;
- known limitations;
- next step;
- local-only state.

END TASK.

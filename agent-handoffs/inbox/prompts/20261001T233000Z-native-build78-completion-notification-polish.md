Native Build 78 — completion feedback and actionable notification polish

PURPOSE

Produce the next consolidated Native release, Build 78 if Build 77 remains the latest uploaded build.

Scope is intentionally bounded:
1. integrate the already-reviewed Performance Record celebration lifecycle fix;
2. add celebratory haptic feedback to PR celebration;
3. add canonical Skip to actionable Priority notifications where valid;
4. add Apple Reminders-style one-tap Complete/check-circle notification action for simple binary Priorities;
5. add targeted completion/skip haptics where appropriate.

Do not add unrelated features.

READ FIRST

Durable backlog:
agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md

PR celebration audit:
agent-handoffs/reports/20261001T170354Z-workout-performance-record-celebration-audit.md

Workout Live Activities Build 77:
agent-handoffs/reports/20261001T220947Z-workout-live-activities-phase1-implementation.md

Standing GH protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

IMPORTANT:
Every stop/final report must be published and re-read from origin/main. Feature-branch-only reports do not count.

CURRENT AUTHORITIES

Latest uploaded Native:
Build 77
source c299fa29
VALID

PR celebration reviewed fix:
branch codex/workout-pr-celebration-lifecycle-fix-20261001
SHA 69cad804e2ac7d74ed98914e1601f2e7863dadc3

Production Server:
do not assume; reverify if notification mutation contract inspection requires it.

A. BASE / INTEGRATION

Start from exact Build 77 shipping source c299fa29.

Integrate the semantic changes from 69cad804 deliberately.

Do not blindly merge if Build 77 changed overlapping Training Logger files.

Preserve all Build 77 Live Activity behavior.

Reconcile:
- TrainingSessionAuthority;
- Workout Complete navigation;
- pending completion presentation;
- PR record reload;
- Live Activity finish lifecycle.

The PR fix must remain:
- no historical replay;
- exact just-completed session only;
- celebration cannot be consumed while hidden;
- authoritative records reload after view/process recreation;
- explicit Return to Log is the acknowledgement/cleanup boundary;
- accepted_processing/durable recovery remains idempotent.

B. PR CELEBRATION HAPTIC

When a genuine new Performance Record celebration is visibly presented:
- keep existing confetti;
- add an appropriate celebratory/success haptic;
- fire once per celebration presentation, aligned with the same one-shot lifecycle;
- do not fire while hidden;
- do not fire for historical/replayed records;
- respect Reduce Motion for animation, but haptic behavior should follow system haptic/accessibility expectations rather than assuming Reduce Motion disables haptics;
- avoid repeated haptic if the view re-renders.

Centralize haptic behavior through a small Native feedback abstraction if one already exists or if doing so prevents scattered UIKit calls.

Do not over-engineer a broad design system.

C. ACTIONABLE PRIORITY NOTIFICATION — SKIP

PhysiqueOS now supports canonical skipped state for applicable Priority occurrences.

Audit current:
- notification categories/actions;
- notification scheduling payload;
- actionable Priority mutation path;
- Priority type/capability model;
- Home inline completion;
- Priority detail completion;
- dose-aware/specialized peptide completion;
- snooze behavior;
- notification response handling;
- server/native canonical skip semantics.

Requirement:
- offer Skip from actionable Priority notifications only when that occurrence supports canonical Skip;
- call the same canonical mutation semantics as in-app Skip;
- no notification-only state;
- no fake local completion;
- stale/repeated Skip is safe/idempotent;
- invalid/unsupported Skip fails soft;
- notification clears/updates/reconciles after success;
- Home/Priority detail reflect authoritative skipped state.

Do not expose Skip where skipping is semantically invalid.

D. ONE-TAP COMPLETE / CHECK-CIRCLE FOR SIMPLE PRIORITIES

Founder wants an Apple Reminders-style direct completion affordance for simple binary Priorities instead of requiring long-press -> Complete.

Implement using the notification mechanisms actually supported by iOS.

If iOS does not permit a literal inline checkbox visual matching Reminders for third-party notifications, use the closest supported direct notification action and document the platform constraint. Do not fake unsupported system UI.

Eligibility:
- simple binary Priority;
- no required additional input;
- no dose selection;
- no Morning Check-In form;
- no weight entry;
- no evidence/details required;
- no confirmation workflow required.

Explicitly EXCLUDE at minimum:
- Morning Check-In / weight;
- any Priority whose completion needs dose/context/input;
- any specialized completion whose semantics differ from plain completion.

For eligible occurrences:
- direct Complete action should execute without first opening the app where iOS permits;
- use canonical Priority completion path;
- idempotent/stale-safe;
- authoritative reconciliation;
- notification updates/clears appropriately.

Preserve existing long-press/detail actions as appropriate; the goal is fewer steps for simple binary completion, not loss of richer actions.

E. COMPLETION SEMANTICS AUDIT

Before implementation, resolve the known Home-vs-Priority-detail semantic risk:
Home inline completion historically used plain completion while Priority detail could use dose-aware peptide completion.

Do not propagate that inconsistency into notifications.

Define/reuse one capability resolver:
- plainCompleteAllowed;
- skipAllowed;
- requiresDetail/input;
- specializedCompletion type if any.

Notification actions must be derived from canonical occurrence capabilities, not hard-coded Priority names where avoidable.

If Server already exposes capability metadata, prefer it.
If not, implement the narrowest deterministic Native mapping backed by current canonical contracts and document future Server-owned migration.

Do not change Server unless required for correctness. If a Server change is required, stop after architecture/report unless the change is additive, bounded and independently reviewed.

F. TARGETED HAPTICS

Implement targeted haptic feedback for:
- PR celebration: celebratory/success;
- in-app Priority completion: subtle success;
- in-app Priority Skip: lighter confirmation;
- notification Complete/Skip only if iOS/app execution context can legitimately deliver feedback; do not assume background notification actions can generate a user-perceived app haptic.

Consider Workout set completion:
- Build 77 real-world acceptance is still underway.
- Do NOT add set-completion haptic in Build 78 unless existing feedback already exists or a tiny safe change is clearly beneficial and does not alter Live Activity behavior.
- Prefer deferring until Founder gives real-workout feedback.

No haptics for ordinary navigation, charts, read-only screens, or passive HealthKit updates.

Use system haptic APIs and respect device/system capability.

G. NOTIFICATION UX

Audit exact iOS notification limitations.

Document:
- what appears on banner/Lock Screen;
- what requires expansion/long-press;
- whether direct actions can be surfaced without expansion;
- authentication behavior;
- foreground/background response behavior.

Founder requested Reminders-like checkbox behavior, but platform accuracy wins. Implement the closest legitimate third-party UX.

Do not make unsupported claims.

H. PR CELEBRATION TESTS

At minimum:
- one PR;
- multiple PRs;
- no PR;
- accepted_processing -> durable;
- navigation to Home before result;
- view recreation;
- app relaunch;
- hidden surface cannot consume;
- visible surface claims once;
- haptic once;
- Reduce Motion;
- Return to Log clears debt;
- no historical replay;
- unknown PR type fail-soft.

I. PRIORITY NOTIFICATION TESTS

At minimum:
- simple binary Complete offered;
- simple binary Skip offered when valid;
- unsupported Skip absent;
- requires-input Priority does not get direct Complete;
- Morning Check-In/weight excluded;
- peptide/dose-aware specialized completion excluded from plain Complete;
- snooze preserved;
- notification response Complete;
- notification response Skip;
- duplicate action;
- stale occurrence;
- already completed/skipped;
- authority/network failure;
- app foreground/background/terminated handling as supported;
- Home/Priority detail reconciliation;
- category/action registration migration from existing installed notifications;
- old scheduled notification payload fails soft.

J. HAPTIC TESTS

Prefer an injectable feedback client so tests can assert:
- correct event;
- exactly once;
- no event when hidden/ineligible;
- no accidental feedback on passive state refresh.

Do not test physical vibration in unit tests.

K. LIVE ACTIVITY REGRESSION

Build 78 must preserve Build 77.

Run focused regressions:
- TrainingSessionAuthority;
- Live Activity projection;
- coordinator;
- Complete Set intent;
- rest Stopwatch/Countdown/Off;
- Widget Extension build/version parity;
- workout completion/PR handoff interaction.

Do not modify Live Activity visuals unless required by integration correctness.

L. BUILD NUMBER

Reverify latest uploaded Native build.

If 77 remains latest, use 78.

M. REVIEW / VALIDATION

Fresh independent review focused on:
- PR lifecycle integration against Build 77;
- notification capability correctness;
- no plain-complete leakage into specialized priorities;
- skip canonical semantics;
- haptic one-shot behavior;
- Live Activity regression.

Run:
- focused suites;
- full Native unit suite if disk >=15 GiB;
- risk-scaled UI journeys for Workout Complete and Priority notification handling;
- Release compile;
- extension parity/verifier.

Respect 15 GiB disk floor.
Use safe cleanup if necessary; do not waive casually.

N. TESTFLIGHT

If candidate is clean:
- archive through Xcode;
- guarded release tooling;
- no browser login to App Store Connect/Developer;
- if re-auth/2FA required, stop and report exact Founder action;
- upload Build 78;
- wait for VALID.

O. FOUNDER ACCEPTANCE

Publish minimal checklist:

PR:
- natural future workout that produces PR;
- celebration details + confetti + haptic;
- exactly once;
- navigation away/back does not lose it.

Priority:
- simple binary Priority notification exposes fastest supported Complete action;
- valid Skip available;
- complete/skip reconciles Home/detail;
- Morning Check-In/weight still opens proper flow;
- peptide/specialized priorities retain correct semantics;
- completion/skip in-app haptic feels appropriate.

P. BACKLOG UPDATE

After Build 78 is VALID:
- update agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md on main;
- mark the implementation items shipped/pending physical acceptance rather than leaving them as staged;
- do not mark fully complete until Founder acceptance where required.

Q. REPORT

Publish to origin/main:
agent-handoffs/reports/<timestamp>-native-build78-completion-notification-polish.md

Include:
- exact base/candidate;
- PR fix integration details;
- notification capability model;
- actual iOS UX limitation/implementation;
- haptic events;
- tests/review;
- Live Activity regression;
- archive/signing/upload;
- Build 78 VALID status;
- Founder checklist;
- backlog update;
- known limitations.

Before stopping:
- push implementation branch;
- publish report to origin/main;
- update latest pointers;
- fetch/reverify origin/main;
- re-read exact report from main;
- give Founder exact main report commit SHA.

END TASK.

PhysiqueOS Home Screen Widget — audit, architecture, and implementation plan

TASK TYPE

Codex research/audit/design-plan only.

Do NOT implement shipping WidgetKit code yet.
Do NOT modify Build 78.
Do NOT upload TestFlight.
Do NOT change signing/provisioning.
Do NOT touch Server production.
Do NOT interfere with Claude's active Build 78 worktree, Simulator, DerivedData, or archive/upload paths.

READ FIRST

Durable backlog:
agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md

Build 77 Live Activities final report:
agent-handoffs/reports/20261001T220947Z-workout-live-activities-phase1-implementation.md

Latest storage report:
agent-handoffs/reports/20261001T234930Z-shared-mac-build78-active-conservative-storage-audit.md

Standing GH protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

FOUNDER PRODUCT DIRECTION

Home Screen widgets are likely the next iOS feature after Live Activities settles.

Founder wants:
1. daily totals displayed;
2. a Start Workout Logger action/button.

The exact daily-total composition is not yet locked.

Do not assume a large dashboard or cram every metric into the widget.

The audit should determine which totals are most useful and already trustworthy/canonical in Native today.

A. PLATFORM / APPLE AUDIT

Research current iOS WidgetKit / interactive widget capabilities for the app's actual deployment target.

Document:
- supported Home Screen widget families/sizes;
- interactive widgets and AppIntent buttons;
- deep links vs AppIntent actions;
- refresh/timeline behavior and system throttling;
- background/network limitations;
- privacy/redaction behavior;
- widget relevance/smart stacks where applicable;
- whether Start Workout Logger can be a direct AppIntent or should deep-link/open the app;
- extension data-sharing requirements;
- App Group need or no need;
- whether widgets can safely fetch the Server directly;
- offline/stale-data behavior;
- Live Activity extension reuse vs separate widget configuration;
- signing/project requirements;
- simulator vs physical-device acceptance.

Use authoritative Apple documentation/version facts where possible.

B. CURRENT PROJECT / EXTENSION AUDIT

Audit exact current Native project after Build 77 and active Build 78 changes if visible without touching Claude's work.

Map:
- existing Widget Extension target from Live Activities;
- target/product structure;
- generator support;
- shared contracts/modules;
- AppIntent infrastructure already added for Live Activities;
- URL/deep-link routing;
- app environment/authority boundaries;
- signing/bundle ids;
- release verifier behavior;
- whether a Home Screen Widget can live in the same extension target or should be a separate Widget configuration within the existing extension.

Do not alter the active Build 78 branch.

C. DAILY TOTALS DATA AUDIT

Audit the exact Native/Home data sources and canonical Server contracts for daily totals.

Identify what is currently trustworthy and cheap to render in a widget, including candidate categories such as:
- calories consumed;
- protein;
- carbs/fat if useful;
- activity/active calories;
- weight/current trend if truly daily-useful;
- priorities completed/remaining;
- training status;
- sleep/recovery state if available;
- any other Home summary metrics already canonical.

Do not assume all should appear.

For each candidate, document:
- source contract;
- freshness;
- whether HealthKit/background sync updates it;
- whether the widget can obtain it without opening the app;
- stale/offline behavior;
- whether showing it on Lock/Home Screen raises privacy concerns.

Recommend a minimal V1 daily-total set based on:
- usefulness;
- current Founder workflow;
- data reliability;
- low visual density.

D. START WORKOUT LOGGER ACTION

Audit the safest implementation.

Founder wants a Start Workout Logger action/button on the Home Screen widget.

Determine:
- whether this should directly invoke an AppIntent;
- whether it should open the app into Workout Logger start state;
- whether a workout can safely be created entirely from a widget action;
- whether choosing exercises/planning still requires app UI;
- how to avoid accidental duplicate workout sessions;
- how it interacts with TrainingSessionAuthority;
- what happens if a workout is already active;
- what happens if there is a saved/left workout;
- how to route to Resume vs Start New.

Preferred V1 may simply:
- no active workout -> open Workout Logger ready to start;
- active workout -> open/resume it.

Do not create a parallel session authority.

E. DATA DELIVERY ARCHITECTURE

Evaluate at least these patterns:

1. Widget reads an App Group snapshot written by the app.
2. Widget performs direct read-only Server fetch.
3. Hybrid: cached shared snapshot + bounded refresh fetch.
4. AppIntent refreshes snapshot on user action.

For each, assess:
- freshness;
- reliability;
- auth/security;
- background execution constraints;
- battery/network cost;
- complexity;
- failure modes;
- compatibility with Founder Production/Sandbox authority separation;
- future multi-user scaling.

Recommend one V1 architecture.

Do not implement it.

F. REFRESH / STALENESS

Design:
- refresh cadence;
- what "today" means in user timezone;
- day rollover;
- HealthKit auto-sync timing;
- stale-state labeling;
- app-open refresh;
- background refresh if supported;
- failure/offline behavior;
- whether totals should disappear, freeze with timestamp, or show a stale indicator.

Avoid implying real-time if WidgetKit cannot guarantee it.

G. WIDGET FAMILIES / UX

Propose a restrained set.

At minimum evaluate:

Small:
- 1–2 most important totals OR one headline total + Start Workout button.

Medium:
- likely primary V1.
- daily totals in compact row/grid;
- Start Workout Logger action;
- active workout state can switch action to Resume Workout.

Large:
- only if genuinely valuable.
- do not build a mini Home tab by default.

Also evaluate Lock Screen widget only if it materially helps; Founder asked Home Screen first.

H. VISUAL PROTOTYPES

Create NON-SHIPPING mockups using synthetic/redacted values.

At minimum:
1. Small — daily totals emphasis.
2. Small — workout launcher emphasis.
3. Medium — recommended V1 with daily totals + Start Workout.
4. Medium — active workout / Resume state.
5. Medium — stale/offline state.
6. Large — only if audit finds it worthwhile.
7. privacy/redacted state if relevant.

Use current PhysiqueOS visual language but respect WidgetKit system constraints.

No private Founder data.

I. INTERACTION STATES

Plan exact behavior for:
- no workout active;
- workout active;
- saved/left workout;
- tapping daily metric;
- tapping Start/Resume Workout;
- stale widget;
- app not authenticated/future multi-user login;
- Sandbox vs Founder Production.

J. TEST PLAN

Define deterministic tests for:
- timeline/date rollover;
- shared snapshot decoding;
- stale data;
- widget family layouts;
- AppIntent/deep link routing;
- duplicate workout prevention;
- active workout -> Resume;
- no active workout -> Start/Open Logger;
- authority switch;
- privacy redaction;
- offline;
- malformed/old snapshot;
- future schema version;
- widget extension/app build parity;
- VoiceOver/Dynamic Type/contrast.

K. PROJECT / SIGNING PLAN

Determine exact implementation changes likely needed:
- same extension vs new target;
- WidgetBundle updates;
- App Group entitlement if recommended;
- Info.plist;
- generator/project file;
- bundle id changes if any;
- release verifier updates;
- provisioning/signing implications;
- whether Founder Apple re-auth/2FA may be required.

Do not make any signing changes in this task.

L. PHASED IMPLEMENTATION PLAN

Recommend a minimal V1.

Likely shape:
Phase 1:
- one medium widget;
- daily totals;
- Start/Resume Workout;
- shared read architecture;
- stale handling.

Phase 1B:
- small variant(s);
- additional tap-through destinations.

Phase 2:
- richer personalization/configuration only if needed.

List exact likely files/targets and acceptance criteria.

M. NO SHIPPING IMPLEMENTATION

Do not write shipping application/widget code.
Scratch/prototype code is allowed only in a dedicated non-shipping prototype area.

Do not run heavy Xcode builds while Claude Build 78 is active unless strictly necessary for a read-only audit. Prefer source inspection and lightweight prototype rendering.

N. REPORT

Publish to origin/main:
agent-handoffs/reports/<timestamp>-home-screen-widget-audit-plan.md

Include:
- Apple platform facts;
- current extension/project audit;
- daily-total candidate matrix;
- recommended V1 metrics;
- Start/Resume Workout behavior;
- recommended data architecture;
- refresh/staleness design;
- widget family recommendation;
- screenshot/mockup paths;
- project/signing plan;
- tests;
- phased implementation plan;
- Founder decisions still needed.

Before stopping:
- push prototype/audit branch if any;
- publish report to origin/main;
- update latest pointers;
- fetch/reverify origin/main;
- re-read exact report from main;
- give Founder exact main report commit SHA.

END TASK.

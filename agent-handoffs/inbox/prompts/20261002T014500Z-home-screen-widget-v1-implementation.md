Home Screen Widget V1 — Logged Today + Start/Resume Workout implementation

TASK TYPE

Codex Native implementation lane.

Work independently from Claude's Priority Skip follow-up.

READ FIRST

Audit:
agent-handoffs/reports/20261002T011110Z-home-screen-widget-audit-plan.md

Build 78:
agent-handoffs/reports/20261002T010500Z-native-build78-completion-notification-polish.md

Backlog:
agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md

GH protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

BASE

Exact Build 78 shipping source:
5911dd2a6f968c5a355ec68d3313f0e5e644d529

Build 78 is VALID.

FOUNDER LOCKED PRODUCT DIRECTION

Founder does NOT want the earlier three-cell-only concept.

V1 should mirror the existing Native "Logged Today" summary as closely as WidgetKit allows, plus a Workout Logger action.

Primary desired information:
- TRAINING: today's strength/cardio summary;
- NUTRITION: calories + macros;
- ACTIVITY: active calories so far/current-day semantics;
- WEIGHT: today's weight when available;
- Start Workout Logger;
- action changes to Resume Workout when an active live session exists.

Use the existing Logged Today information hierarchy/visual language as design authority.

Primary V1 family:
- systemLarge if required for clean legibility.
- Do not cram into medium merely to minimize size.
- A medium condensed variant may be implemented only if it remains genuinely useful and clear after the large V1 is correct.
- Small/Lock Screen/accessory widgets are out of scope.

A. REVERIFY AUTHORITY

Reverify Build 78 source and current main.
Reconcile any post-78 changes without absorbing Claude's concurrent notification branch.

B. APPLE / AUDIT DECISIONS ACCEPTED

Use the existing PhysiqueOSLiveActivity WidgetKit extension / WidgetBundle rather than adding another extension target.

Recommended architecture from audit is accepted:
- app writes versioned App Group snapshot;
- widget reads snapshot only;
- widget does not authenticate to Server;
- widget does not query HealthKit;
- widget does not own workout/session state;
- no credentials/tokens in App Group;
- Start/Resume is navigation, not mutation.

C. APP GROUP / SNAPSHOT

Implement a versioned, minimal snapshot.

Include only fields needed to render/navigate:
- schemaVersion;
- authority;
- opaque account scope;
- exact localDate;
- timezone;
- writtenAt / lastSuccessfulReadAt / refresh state;
- Training Logged Today summary;
- Nutrition calories + protein/carbs/fat;
- Activity active calories + partial/current-day semantics;
- exact-today Weight when available;
- active workout projection: none/active, session id, label, progress where safe.

Do NOT include:
- auth token;
- refresh credential;
- raw HealthKit samples;
- meals;
- raw evidence;
- full workout sets/reps/load;
- private files.

Atomic write.
Fail-soft decoding.
Future schema fail-soft.
Sandbox and Founder Production fenced.
Future account/user mismatch fenced.

D. DATA AUTHORITIES

Match existing Logged Today semantics.

Training:
- use the same canonical Logged Today source for durable Training summary;
- HealthKit cardio summary remains as current Log semantics provide;
- active workout state comes separately from TrainingSessionAuthority.

Nutrition:
- exact current localDate canonical NutritionDay;
- calories + P/C/F;
- no fallback to previous day.

Activity:
- exact current localDate ActivityDay;
- active calories;
- label as "so far" / partial where current day is incomplete;
- no fallback to prior day.

Weight:
- exact current localDate only;
- never show yesterday as today;
- if no current-day weight, omit/show — according to best layout.

E. VISUAL DESIGN

Use the supplied Founder screenshot / existing Native Logged Today card as the visual/content reference.

Large widget should feel like a compact version of that card:
- Logged Today title if useful;
- Training;
- Nutrition;
- Activity;
- Weight;
- clear Start/Resume Workout action.

Preserve category hierarchy and recognizable icons where WidgetKit allows.

Avoid:
- mini Home dashboard;
- Goal Confidence;
- Briefings;
- Sleep/Recovery;
- Priorities;
- extra targets/percentages;
- unnecessary provenance copy if space is constrained.

Use system widget margins/corners.
Dark mode first but support system rendering requirements.
Privacy-sensitive totals must redact appropriately.

F. START / RESUME

No active live session:
Start Workout Logger
-> navigation into existing Logger entry.
-> URL/widget action creates ZERO workout sessions.

Active live session:
Resume Workout
-> exact session id.
-> app validates against selected authority and TrainingSessionAuthority.
-> if stale/missing, fail soft to Logger entry.
-> no authority switch.

Saved/left draft but no active session:
Start Workout Logger
-> existing Logger entry handles saved-workout choice.
-> do not auto-resume an intentionally left draft.

Do not create a parallel authority.

G. DEEP LINKS

Add typed routes shared between app/widget.

Metric tap behavior if feasible in large widget:
- Training -> Training/Log appropriate destination;
- Nutrition -> current Nutrition;
- Activity -> current Activity;
- Weight -> current Weight;
- Start/Resume -> Logger.

If per-section links materially complicate V1, prioritize Start/Resume and sensible whole-widget navigation; document.

H. SNAPSHOT REFRESH

Write/reload after:
- successful app bootstrap/canonical daily reads;
- successful HealthKit Activity/Nutrition upload followed by canonical exact-day read;
- Nutrition/Activity reconciliation;
- Weight write/reconciliation;
- durable Training update;
- TrainingSessionAuthority start/resume/save-leave/commit/cancel/end;
- foreground refresh;
- authority/account/day/timezone change.

Widget itself does no network polling.

Timeline:
- local snapshot only;
- honest staleness;
- midnight rollover hides prior-day totals;
- WidgetKit reload is requested, not assumed instantaneous.

Use initial policy from audit unless implementation evidence suggests a better simple rule:
<=90m normal;
90m–4h show age;
>4h/failure visibly stale;
prior day -> waiting for today's totals.

I. APP GROUP SIGNING

Audit proposed identifier:
group.com.physiqueos.native.dev.shared

If consistent with current app identity, implement matching App Group entitlements on:
- main app;
- existing Widget extension.

Do not put HealthKit entitlement on extension.

Use generator as authority.
Update release verifier.

Never browser-login Apple Developer/App Store Connect.

If capability/profile creation cannot be completed through established automatic/cloud signing and requires Founder auth/PAT/2FA/manual Developer action:
STOP with exact required action and main-visible GH report.

J. EXISTING LIVE ACTIVITY

Must remain unchanged functionally.

Add Home widget configuration to existing WidgetBundle.

Run Build 78 Live Activity regressions:
- extension builds;
- Live Activity;
- Complete Set;
- coordinator;
- projection;
- rest modes;
- extension version/build parity.

K. MOCKUP/PREVIEW ACCEPTANCE

Before upload:
- render actual shipping large widget states in SwiftUI previews/simulator where possible;
- compare against Logged Today reference;
- states:
  1. full current-day data;
  2. no weight;
  3. active workout / Resume;
  4. stale/offline;
  5. waiting for today's totals;
  6. privacy redacted;
  7. long Training summary.

Publish screenshots in checkpoint.

If the layout is materially different from the accepted Logged Today concept, stop for Founder review before upload.
If it clearly matches the accepted direction and tests/review are clean, continue.

L. TESTS

At minimum:
- snapshot schema;
- malformed/future schema;
- atomic read/write;
- exact-day no-fallback;
- missing values != zero;
- authority/account fences;
- Sandbox/Production separation;
- local midnight/DST/timezone;
- stale states;
- Nutrition P/C/F;
- partial Activity;
- exact-today Weight;
- Training summary;
- active workout state;
- Start creates no session;
- Resume exact session;
- stale Resume fallback;
- saved/left behavior;
- deep links;
- privacy;
- accessibility;
- large family layout;
- extension/app App Group entitlement parity;
- generator determinism;
- release verifier;
- Live Activity regressions.

M. REVIEW

Fresh review:
- privacy/auth;
- App Group safety;
- exact-day correctness;
- no credential leakage;
- no session mutation from widget;
- authority fencing;
- Live Activity regression;
- signing/project correctness.

N. RELEASE

This implementation is authorized to become the next Native build only after reconciling with Claude's concurrent Priority Skip patch.

DO NOT upload independently while Claude's notification patch is still outstanding.

Produce a clean reviewed widget candidate branch and report exact SHA.

Then STOP at integration-ready unless the coordinating task explicitly confirms Claude's patch is complete and authorizes consolidation.

Do not race two TestFlight builds.

O. REPORT

Publish to origin/main:
agent-handoffs/reports/<timestamp>-home-screen-widget-v1-implementation.md

Include exact candidate, screenshots, architecture, App Group/signing status, tests, Live Activity regression, and integration instructions for the next consolidated build.

Follow mandatory main-visible GH protocol.

END TASK.

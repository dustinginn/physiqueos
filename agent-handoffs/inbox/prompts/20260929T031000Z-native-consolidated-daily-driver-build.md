Task id: native-consolidated-daily-driver-build-after-briefings-20260928

Briefing Intelligence is deployed and accepted. Strength reconciliation Server fix 396e750d is deployed and the Founder resolved the recovered Sep 27/28 reviews.

Proceed with the next consolidated Native daily-driver build.

Use the normal Claude Remote Control Native workflow/worktree. Reverify current Native and Server authority before editing. Do not assume Build 68/current branch state without checking.

FOUNDER PRIORITY

Start with today's Activity/Training inconsistency and diagnose it end-to-end before implementing UI symptoms.

Founder screenshots Sep 28 show:
- Training Day correctly has 3 sessions:
  - Outdoor Walk 17 min / 0.94 mi / 108 active cal
  - Outdoor Walk 15 min / 0.9 mi / 103 active cal
  - Traditional Strength Training / Quads / 3 exercises
- Log -> Logged Today currently shows only:
  Training: Strength Training · 50 min · Apple Health
  Activity: 171 active calories · Apple Health
  It hides the two Outdoor Walks.
- Activity Evidence showed:
  active calories 171
  workout calories 212
  linked workouts 1
  non-workout calories 0
  warning that workout energy 212 exceeds daily active total 171.
- The canonical Training Day proves the two walks and strength session exist.
- Founder says Activity is not syncing correctly today.

DIAGNOSE FIRST

Trace Sep 28 across:
HealthKit observations -> automatic sync/cursors/revisions -> canonical activity summary -> canonical workouts -> workout/activity linkage -> Activity Evidence projection -> Training Day -> Log Logged Today.

Establish:
- why daily active calories are 171 while workout calories are 212;
- why Activity says only 1 linked workout while Training Day has 3;
- whether activitySummary is stale/partial/in-progress versus workout ingestion being newer;
- whether walking workouts are excluded from Activity linkage by policy/identity;
- whether any calories are double-counted;
- whether today's partial-day Apple Health state is being presented as final;
- whether a rebase/cursor/revision-floor issue is involved;
- whether the problem corrects later naturally and, if so, whether UI needs pending/provisional semantics.

Use bounded read-only production inspection where needed. No manual production data repair absent a separately justified/authorized plan.

Do not patch Log or Activity until the canonical cause is understood.

CONSOLIDATED BUILD SCOPE

After diagnosis, implement as many of the following as can safely ship together. Preserve server authority/canonical semantics.

1. ACTIVITY / WORKOUT SAME-DAY CONSISTENCY
Fix the canonical or Native projection issue identified above.

Acceptance:
- Activity Evidence and Training Day consume the same appropriate canonical workout set.
- All eligible same-day workouts are represented consistently.
- workout calories never create misleading arithmetic against a stale/partial active total without clear provisional semantics.
- no double counting between workout and non-workout activity.
- background/foreground sync converges deterministically.
- historical activity remains unchanged.

2. LOGGED TODAY: STRENGTH + CARDIO COEXISTENCE
Logged Today must compactly represent both modalities when both exist.

Do not turn Log into Training History.

Example product behavior:
TRAINING
Strength Training · 50 min
2 Outdoor Walks · 32 min

Exact copy/layout can follow existing design language.

Generalize:
- one strength + one cardio;
- one strength + multiple same-type cardio sessions;
- multiple cardio types;
- cardio only;
- strength only;
- no training.

Use canonical Training/Workout data, not a Native special case for Outdoor Walk.

3. CONTEXT-AWARE LOG TAB -> ACTIVE WORKOUT LOGGER
Previously approved Founder requirement:
When a Workout Logger session is actively in progress, tapping the center Log tab should take the user straight to that active Logger session.
From Logger, Back returns to the standard Log page.
When no Logger session is active, Log behaves normally.

Requirements:
- no trapping navigation;
- app launch/deep links remain sane;
- active Logger identity is canonical/current;
- completed/abandoned sessions immediately restore normal Log behavior.

4. STRENGTH RECONCILIATION NOTIFICATION TIMING
Server reconciliation is now correct.

Build 68 currently runs WorkoutReconciliationReviewReadyNotifier only from Log lifecycle. That is backwards: notification should prompt Founder to go to Log, not require Log to be opened first.

After every successful automatic HealthKit sync that can create/reopen workout reconciliation reviews:
- refresh pending reconciliation review identities;
- run the existing identity-diffed notifier regardless of active tab;
- support foreground sync and HealthKit background delivery when iOS wakes the app;
- notification tap deep-links to the specific pending review if existing navigation supports it safely; otherwise implement bounded deep-link support.
- preserve idempotence: one notification per newly ready review identity, no repeat on ordinary refresh.
- do not notify for already resolved reviews.

Document iOS limitation: without APNs, if iOS does not wake the app, notification waits until next app wake/sync. Do not build APNs in this task.

5. PENDING-REVIEW COPY PLURALIZATION
Fix:
"1 possible Logger sessions"
to singular when count == 1, plural otherwise.

This is Server-owned per the diagnosis. If a one-line Server patch is required, keep it isolated, fully tested, and do not silently deploy it as part of Native distribution. Publish exact Server candidate separately for guarded deployment approval unless current workflow explicitly permits an already-authorized trivial copy deploy. Default: stop before Server deploy.

6. PRIORITY DETAIL -> MARK SKIPPED
Founder requirement:
Allow today's priority occurrence to be marked Skipped directly from Priority Detail. Currently skip is only available during next-day Morning Check-In for an incomplete prior-day priority.

Do not create a second skip semantic.

Audit existing canonical Morning Check-In skip command/state and reuse it.

Acceptance:
- Priority Detail offers Mark Skipped only when occurrence is eligible;
- confirmation UX appropriate to destructive/intentional state change;
- skipped state is canonical and immediately reflected on Home/Priority/Morning Check-In;
- no duplicate occurrence/state;
- completed/skipped terminal semantics respected;
- historical skips unchanged.

If Server does not expose the needed canonical command to Native, identify the smallest Server addition and keep its deploy separately gated.

7. WORKOUT COMPLETION PERFORMANCE CELEBRATION
Founder requirement:
After successfully completing/confirming a Workout Logger session, if that session established new canonical performance records, show them on the existing Workout Complete screen and trigger a small one-time confetti celebration.

Use the canonical Exercise Performance Records system. Native must not independently calculate PRs.

Eligible record families should reflect whatever canonical system supports, e.g.:
- Load;
- Reps at Load;
- Session Volume;
- other established canonical record types.

UX:
- preserve current Workout Complete success state;
- if records exist, add a compact "New performance records" section;
- surface the most meaningful few;
- if many, summarize e.g. "+3 more records";
- small one-time confetti pop on first presentation only;
- no confetti/no empty record section when no new record;
- reopening screen does not repeatedly celebrate;
- accessibility / Reduce Motion respected;
- do not turn completion into workout detail.

Audit whether completion response/read model already exposes authoritative new records. If not, design the smallest canonical read/projection extension. Do not calculate records in Native.

8. MONTHLY NATIVE CLEANUP
Now that Monthly is accepted:
- replace Native-owned analytical label "Baseline Read" with natural language consistent with the new language policy (choose appropriate product copy, not "read");
- add a dedicated Routine icon/tone mapping so routine cards/timeline/Month Ahead do not fall back to generic sparkles;
- preserve exact approved Monthly structural skeleton and all Server-owned content.
Do not redesign Monthly.

9. DO NOT INCLUDE THESE IN THIS BUILD
Keep separate:
- pairing-token/session-renewal security fix;
- Face ID/device-auth product architecture;
- peptide Pause/Resume;
- peptide dosing schedule simplification;
- Photo visual-change magnitude producer;
- HealthKit Sleep ingestion;
- any unrelated Briefing Intelligence changes.

IMPLEMENTATION STRATEGY

Phase A: diagnosis and dependency map.
Publish a concise GH diagnosis before invasive implementation if Activity root cause is nontrivial.

Phase B: implement bounded workstreams that share this Native build.

Phase C: deterministic tests and fresh-context review.

Phase D: produce a Release build candidate, but DO NOT upload to TestFlight until Founder/ChatGPT approves the completed scope/report.

Keep TestFlight batching rule.

VALIDATION

At minimum:
- Activity partial-day/revision/cursor/rebase scenarios;
- 0/1/many workout linkage;
- strength+cardio aggregation;
- Logged Today combinations;
- active Logger tab routing lifecycle;
- reconciliation notifier foreground/background/idempotence/resolved cases;
- skip eligibility/terminal state/cross-surface parity;
- performance-record completion with 0/1/many records;
- confetti one-shot + Reduce Motion;
- Monthly label/icon regression;
- existing Native unit suite;
- Release compile without warnings if achievable under current baseline.

Use deterministic tests over screenshots. Manual simulator only for changed workflows where necessary.

FRESH-CONTEXT REVIEW

Review for:
- canonical authority vs Native duplication;
- Activity double counting;
- partial-day truthfulness;
- navigation traps;
- notification duplicates;
- skip-state divergence;
- PR calculation accidentally duplicated in Native;
- celebration persistence/accessibility;
- Monthly structural regression.

PRODUCTION / DISTRIBUTION SAFETY

Do not mutate Founder production data during diagnosis.
Do not manually repair today's Activity.
Do not deploy any Server patch without separate authority.
Do not upload TestFlight until Founder/ChatGPT accepts the candidate report.
Do not open/login to App Store Connect or Apple Developer in a browser. Upload via Xcode only after approval; if re-auth is required, tell Founder.

REPORT REQUIRED

Publish to GH:
- Activity root cause with Sep 28 evidence;
- exact scope completed/deferred;
- Server changes, if any, separated from Native;
- candidate SHA;
- tests/build results;
- fresh-context review;
- Founder acceptance checklist;
- recommended TestFlight build number but do not upload yet.

STANDING NOTIFICATION RULE

Whenever Claude stops for any reason, immediately push-notify Founder. Also notify when diagnosis is complete and when candidate is ready.

END TASK.

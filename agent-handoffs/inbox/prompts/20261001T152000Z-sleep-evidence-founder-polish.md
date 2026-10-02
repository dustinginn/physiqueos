HealthKit Sleep Evidence — Founder polish patch after Build 75 acceptance

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

READ FIRST

Integrated Build 75 report:
agent-handoffs/reports/20261001T145408Z-healthkit-sleep-evidence-integrated-native.md

Build 75 Native authority:
77681cd7

Production Server:
b81c784e5b8a6d5b82ed02a649b5fa3d0edeeff8

FOUNDER STATUS

Founder reviewed Sleep Evidence on physical iPhone Build 75.

Overall Sleep Evidence direction is ACCEPTED.

This task is a focused Native polish patch to close four Founder findings. Otherwise the Evidence experience should remain as-is.

Do not redesign Sleep Evidence.
Do not change Server contracts unless a genuine blocker is proven.
Do not touch prospective Oct 2 ingestion/canary.
Do not implement Recovery Briefing.
Do not enable strategic Sleep/V3/Goals/Confidence.
Do not touch Workout Live Activities.

TARGET

Prepare the next Native patch build after Build 75, expected Build 76 only after re-verifying current upload authority.

A. GOAL TIME BLOCKING

Add the same Goal-context time-blocking behavior used by other longitudinal PhysiqueOS Evidence surfaces.

Founder expects controls at the top for:
- Build Lean Mass
- Visible Abs
- All

Use canonical Goal date ranges, not hard-coded dates.

Behavior:
- selecting Build Lean Mass constrains Recovery/Sleep Evidence to that Goal's date range intersected with available Sleep Evidence;
- selecting Visible Abs constrains to that Goal's date range intersected with available Sleep Evidence;
- All uses the full available Sleep Evidence range beginning 2026-07-06;
- Goal selection applies coherently to landing/history/trends/averages/recent-night context where meaningful;
- do not request data outside the selected Goal range;
- no strategic implication: this is display/time filtering only;
- historical Sleep remains permanently strategically quarantined.

If the current Recovery landing concept has a 14-night latest snapshot, preserve the design intent while ensuring Goal selection does not leak nights outside the selected Goal range.

Use existing Goal selector visual language/components if available rather than inventing a Sleep-specific control.

Test boundary intersections, empty range, completed Visible Abs, active Build Lean Mass, and All.

B. PAGE STABILITY / BACK-SWIPE

Founder can physically drag/move Recovery cards/content horizontally, making the page feel unstable and interfering with the native leading-edge swipe-back gesture.

This is a bug.

Audit the entire Recovery/Sleep navigation stack:
- Recovery landing;
- Sleep Trends;
- Show All/history;
- Night Detail;
- every chart.

Find the root cause, including any:
- horizontal ScrollView;
- oversized GeometryReader/frame;
- content width greater than viewport;
- DragGesture;
- chart-selection overlay;
- gesture priority;
- simultaneousGesture/highPriorityGesture;
- chart plot interaction that captures horizontal drags.

Required behavior:
- report/card surface is vertically stable;
- cards cannot be dragged sideways;
- no horizontal page drift/bounce caused by child content;
- leading-edge interactive pop/swipe-back works naturally;
- charts may retain useful tap/selection inspection, but must not steal the page's back gesture;
- no blanket disabling of native navigation gestures.

Test on the physical-form-factor Simulator and add deterministic layout/gesture tests where practical.

C. CHART DATE LEGIBILITY

Founder screenshots show unreadable overlapping date labels in 3M Total Sleep and Continuity charts.

Keep ALL data points. Thin only x-axis labels/ticks.

Implement one shared range-aware Sleep date-axis policy across longitudinal Sleep charts.

Target density:
- 2W: approximately every 2-3 days;
- 1M: approximately weekly;
- 3M: approximately every 2 weeks;
- 6M: approximately monthly;
- All: approximately monthly; include year when crossing calendar years.

Exact implementation may use explicit axis values/stride based on date domain, but:
- do not rely on Swift Charts automatic ticks when they overlap;
- do not shrink labels into unreadability;
- do not rotate labels unless clearly superior and consistent with PhysiqueOS;
- do not drop/aggregate underlying nightly data merely for labels;
- weekly Server aggregation at long ranges remains unchanged;
- Total Sleep, Awake/Continuity, Longest Continuous Sleep and any other date-axis Sleep charts must share the policy so labels align;
- tap/selection should still expose exact date/value where currently supported.

Test each selector with synthetic dense data and the real available span shape.

D. HISTORICAL TIMEZONE UNCERTAINTY PRESENTATION

Founder found the current blanket fading/circle treatment confusing because every historical night appears visually degraded.

Underlying Server semantics remain correct:
- historical clock timezone is uncertain;
- total sleep duration remains valid;
- uncertain nights are excluded from formal Sleep Window consistency statistics.

Change presentation only.

Required direction:
- render historical Sleep Window bars at normal visual prominence rather than fading every row;
- remove repetitive per-row uncertainty circles/markers if they do not add useful information;
- use a small/subtle approximate indicator such as ≈ where a clock time itself is displayed;
- provide one concise explanatory note, conceptually:
  Historical clock times are approximate. Sleep duration is exact. Historical time zones were not preserved, so sleep and wake times may shift during travel.
- keep Source & Data provenance detail;
- formal consistency calculation must still exclude Server-marked uncertain nights;
- do not fabricate local timezone or infer travel location;
- prospective reliable nights should naturally participate in consistency once available.

Avoid technical wording such as device_at_ingest on the primary surface.

E. PRESERVE ACCEPTED UI

Everything else is accepted.

Preserve:
- Recovery information architecture;
- Last Night;
- 14-night chart + 7-night average;
- Sleep Window;
- Recent Nights;
- Data Sources;
- Trends ranges;
- Night Detail;
- hypnogram;
- stages;
- continuity;
- Time in Bed;
- additional sleep;
- provenance;
- no Sleep Score;
- no good/bad judgments.

F. OCT 2 CANARY

Do not manually trigger prospective Sleep.

Do not change the already-active validation_only policy.

If a prospective record appears naturally during this task, read-only verify that the patched UI handles it, but do not make the patch dependent on it.

G. TESTING

At minimum:
- Goal selector/range tests;
- selector intersection with Evidence start;
- empty Goal range;
- no out-of-range nights;
- shared date-axis policy for 2W/1M/3M/6M/All;
- dense 87-night equivalent chart layout;
- no horizontal overflow on supported iPhone widths;
- Recovery landing navigation/back gesture regression where automatable;
- Trends and Continuity chart regression;
- historical timezone presentation;
- uncertain nights still excluded from formal consistency;
- prospective certain-night presentation;
- existing RecoverySleepReadModelTests;
- RecoverySleepAcceptanceUITests;
- Founder Production cleanup;
- Evidence navigation;
- automatic Sleep coordinator;
- historical import;
- persistent pairing if shared files touched.

Fresh independent review.
Release compile.
Full Native unit suite if disk/resources permit; otherwise risk-scaled with explicit reason.

H. BUILD / UPLOAD

Reverify last uploaded Native build.

If 75 remains current, use Build 76.

Archive/upload through Xcode and established guarded release tooling only.

Do not use App Store Connect/Apple Developer browser login.

If re-auth/2FA is required, stop and tell Founder.

Wait for VALID.

I. FOUNDER ACCEPTANCE

After VALID, publish a minimal physical-device checklist focused only on:
1. Goal buttons/time blocking;
2. vertical stability and swipe-back;
3. readable chart dates at 2W/1M/3M/6M/All;
4. simplified historical timezone presentation.

No need to re-accept already-approved Sleep detail unless regression observed.

J. REPORT

Publish:
agent-handoffs/reports/<timestamp>-healthkit-sleep-evidence-founder-polish.md

Include:
- exact base/candidate;
- root cause of horizontal movement;
- Goal filtering implementation;
- shared axis policy;
- timezone presentation change;
- tests/review/build;
- TestFlight build/status;
- Oct 2 canary status if naturally observable;
- strategic status OFF;
- Founder checklist.

Publish GH before every stop.

END TASK.

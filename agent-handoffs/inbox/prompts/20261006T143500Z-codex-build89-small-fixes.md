PhysiqueOS Build 89 small-fixes lane — Codex

TASK TYPE

New Codex work lane.
Use the existing PhysiqueOS repository/workflow.

BASE AUTHORITY

Start from exact shipped Build 88 source:
7fce3b9708c063f3c6b58571778c595012b5de6d

Build 88 is VALID in TestFlight.

IMPORTANT CONCURRENCY

Two Claude branches are active and MUST remain isolated:

Claude A owns:
- Watch redesign and Watch functional fixes;
- Live Activity / Dynamic Island;
- Priority Detail;
- Morning Check-In;
- manual/backdated weight;
- Home Confidence;
- independent Watch appearance.

Claude B owns:
- Briefings family;
- Briefing History;
- DEXA Briefing presentation;
- Midweek window verification.

Do NOT merge, cherry-pick, edit, or depend on either Claude branch.

This Codex lane owns ONLY the four bounded Build 89 fixes below.

ITEM 1 — TRAINING DETAIL: WORKOUT PR CARD

On the Training Evidence workout-detail page, add a compact read-only card immediately below Workout Summary and before Exercises when that finalized workout earned performance records / PRs.

Requirements:
- use the SAME canonical performance-record authority already used by workout completion recap / New Performance Records / Watch-phone finish parity;
- do not independently recalculate PRs in this view;
- historical workout detail must show records attributed to that exact finalized workout;
- show exercise, record type and relevant value/load/reps/volume as appropriate;
- reuse established PR language/presentation where practical;
- no confetti on historical detail;
- if no PRs were earned, omit the card entirely;
- standalone vs superset context must not create a second PR calculation;
- Watch-finished and phone-finished workouts must behave identically;
- use the current Build 88 redesigned Training Evidence grammar;
- Dark + Mineral Light;
- compact enough not to push Exercises unnecessarily far down.

GH backlog authority:
Issue #6 — Training Detail — show workout PRs below Workout Summary.

ITEM 2 — NUTRITION CALORIES COLOR

Founder observed the Calories value/card using orange.

Calories should use the established Nutrition green semantic color.

Requirements:
- fix the shared semantic token/mapping where appropriate rather than hard-coding one screenshot;
- preserve the existing established colors for Protein/Carbs/Fat and other Nutrition metrics;
- Calories should be green consistently wherever this same Nutrition macro presentation semantics applies;
- no layout/copy/data behavior changes.

Do not touch Claude B Briefing color semantics.

ITEM 3 — HOME TIMELINE COPY

On the Build Lean Mass Home journey/timeline presentation, make ONLY these copy changes:

KEEP exactly:
green status line:
“4 weeks to goal target”

CHANGE:
Remaining metric:
“4 weeks to goal target”
to:
“4 weeks”

CHANGE Phase 2 line:
“about 4 weeks to goal target remaining”
to:
“about 4 weeks remaining”

The Founder explicitly corrected an earlier misunderstanding: DO NOT remove “to goal target” from the green status line.

Preserve:
- goal date;
- all timeline geometry;
- colors;
- typography;
- progress;
- phase semantics;
- date calculation;
- all other copy.

Prefer fixing presentation composition rather than changing canonical Server data.

ITEM 4 — HOME SCREEN WIDGET REFRESH COLOR

On the Home Screen Widget:
- keep the refresh icon/button exactly where it is;
- change only the purple refresh accent to the SAME teal/cyan semantic color used by the Start Logger button on that widget;
- no layout, sizing, hit target, refresh behavior, timeline behavior, App Intent or deep-link changes;
- use/reuse the same semantic token/source as Start Logger rather than duplicating a hex value if practical.

SCOPE CONTROL

Do not:
- touch Watch code;
- touch Live Activity code;
- touch Priority Detail/Daily Capture;
- touch Briefing files;
- touch Energy/Recovery;
- bump the build number;
- upload TestFlight;
- deploy Server;
- mutate production data.

AUDIT FIRST

Before changing each item:
- identify current source of truth;
- identify whether value/color/copy is Server-derived or presentation-derived;
- identify existing canonical PR authority for item 1;
- prove the smallest safe change.

IMPLEMENTATION

Keep changes bounded and independently reviewable.

Prefer separate commits per item or logically small commit groups so integration can cherry-pick/revert safely.

TESTS

Add/update focused deterministic tests for:

1. Training Detail PR card:
- one PR;
- multiple PRs;
- no PR omits card;
- exact workout attribution;
- canonical performance record values;
- Watch-finished/phone-finished parity;
- Dark/Mineral presentation accessibility.

2. Nutrition:
- Calories resolves to established green semantic token;
- other macro colors unchanged.

3. Home:
- green status line still contains “4 weeks to goal target”;
- Remaining renders “4 weeks” only;
- Phase 2 renders “about 4 weeks remaining”;
- no date/progress regression.

4. Widget:
- refresh and Start Logger resolve to same intended teal/cyan accent;
- refresh action/routing unchanged.

Run focused suites after each change.

At final run:
- relevant Native unit suites;
- relevant Home/Training/Nutrition UI journeys;
- Widget tests;
- generic Release compile if touched targets warrant it;
- generator stability;
- ensure no Debug/review seam leakage.

VISUAL REVIEW

Produce a small mobile-readable review package with real shipping SwiftUI/rendered target where practical:

C1 Training Detail with PR card — Dark + Mineral.
C2 Nutrition Calories correction — Dark + Mineral.
C3 Home timeline corrected copy — Dark + Mineral.
C4 Widget refresh correction.

These are small corrections. Founder does not need a huge board.

Publish direct GH links and verify them remotely before reporting.

CONCURRENCY / INTEGRATION

Do not integrate Claude A or Claude B.

At completion report:
- exact Codex candidate SHA;
- per-item commit SHAs;
- files changed;
- tests;
- review links;
- expected conflicts with Claude A/B.

If a requested fix unexpectedly requires touching a Claude-owned file:
STOP on that item and report the overlap rather than creating a conflict. Continue other independent items if safe.

REPORTING

Publish a report without taking over latest.json/latest.md from Build 88.

STOP after pushing the isolated candidate and review package.

No Build 89 bump yet.

END TASK.
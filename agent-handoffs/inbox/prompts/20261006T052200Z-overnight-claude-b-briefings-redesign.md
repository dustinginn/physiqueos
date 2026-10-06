PhysiqueOS Redesign Overnight Lane B — Briefings presentation family

TASK TYPE

NEW Claude Remote Control chat.
Use High reasoning.

BASE

Start from exact shipped Build 88 source:
7fce3b9708c063f3c6b58571778c595012b5de6d

Build 88 is VALID in TestFlight.

Use only the single RC-provided worktree.
No EnterWorktree.
No secondary worktree.

CONCURRENCY

Claude A independently owns Watch, Live Activity, Priority Detail and Daily Capture.

Codex independently owns Mac storage cleanup.

Do not touch their branches/worktrees.
Do not merge overnight.
Do not update latest.json/latest.md away from Build 88.

GOAL

Implement the complete Founder-locked Briefings redesign family as a PRESENTATION MIGRATION ONLY.

This includes:
Weekly;
Midweek;
Monthly;
Photo Briefing;
DEXA Briefing;
Briefing Detail chrome/states;
Briefing History;
briefing entry/cards only where owned by the Briefings family and not already accepted Home redesign.

CRITICAL PRODUCT RULE

DO NOT REGENERATE HISTORICAL BRIEFINGS.

Do not rerun V3.
Do not rewrite historical narrative using current knowledge.
Do not mutate canonical briefing payloads.
Do not change briefing generation cadence/eligibility.
Do not change Server briefing engine semantics.

Render existing canonical published briefing content through the new presentation layer.

PHYSICAL ACCEPTANCE FIXTURES

Founder wants exactly one recent REAL canonical published briefing of each type resurfaced for physical-device comparison:

1. most recent Midweek;
2. most recent Weekly;
3. most recent Monthly;
4. most recent Photo Briefing;
5. most recent DEXA Briefing.

Do not regenerate them.

Design/implement a safe way for those existing real briefing records to render through the new presentation when the next integrated build ships.

Do not create duplicate canonical briefings merely for review.
Do not alter publication timestamps/content.
Do not overwrite historical records.

If the most recent instance of a type cannot be rendered because the current Native contract lacks data, audit the canonical record/contract and report the exact missing presentation field. Do not invent content.

BRIEFING HIERARCHY

Preserve the Founder-approved cadence hierarchy:

Midweek:
shortest;
fast read;
only what materially changed;
no Sleep card by design.

Weekly:
richer;
big-picture weekly recap;
weight trend;
training;
nutrition;
activity/energy;
coaching;
recent plan changes/forward plan;
Sleep only after the separate 14-night eligibility rule.

Monthly:
richest / zine-like;
DEXA-aligned strategic review;
broader trends and context;
Sleep after eligibility;
strong visual hierarchy without excessive confidence copy.

Photo Briefing:
visual-first;
short per-photo captions;
known DEXA context where canonical briefing content already includes it;
image enlargement/comparison behavior preserved.

DEXA Briefing:
data-rich scan-to-scan review;
body composition changes;
metrics;
interpretation/coaching;
charts where canonical;
distinct from generic Weekly/Monthly.

Do not flatten all briefing types into one identical template.

KNOWN FOUNDER FEEDBACK TO PRESERVE

Weekly/Monthly:
strong hero headline;
holistic coach tone, not technical engine copy;
weight trends consistently covered;
training PRs/new performance can be highlighted;
confidence rationale high-level, never anchored on one workout;
Energy Balance commentary when intake/activity shifts;
explicit recent plan changes and forward plan;
no Unresolved section;
do not call nutrition "read";
over-target days are valid evidence;
Monthly should feel richer/zine-like.

These are content-engine expectations. Since this task does NOT regenerate content, do not rewrite historical copy to satisfy them. Ensure the presentation supports these sections when canonical payloads contain them.

LOCKED DESIGN

Read and implement the Founder-locked Briefing designs from the Oct 4 redesign program:
Weekly;
Midweek;
Monthly;
Photo;
DEXA;
Briefing viewer/detail;
Briefing History;
Final Design Batch briefing artifacts.

Do not invent a different redesign.

CHART INTERACTION

Fix the known old briefing chart gesture behavior while implementing the presentation:
tap selects;
horizontal movement scrubs;
vertical movement scrolls.

Reuse the corrected arbitration used by Nutrition/Weight/DEXA rather than maintaining legacy zero-distance chartScrub.

Audit Weekly/Midweek/Monthly/DEXA briefing charts as applicable.

Do not change underlying chart data.

HISTORY

Briefing History must receive the locked redesign and continue to:
list canonical published briefings;
open correct detail type;
preserve dates/type/status;
handle empty/loading/error;
not regenerate content.

DETAIL / STATES

Cover:
published;
loading;
failure/retry;
processing/preparing if production-reachable;
historical detail;
images/media;
charts;
long-form sections;
navigation/back;
accessibility;
Dark + Mineral Light.

Do not reintroduce the old "Unresolved" section through presentation logic if it is not canonical.

PHOTO MEDIA

Use existing safe simulator fixtures for visual implementation.

Do not pair a simulator to Founder Production or copy private Founder media into source.

The physical next build will validate real Photo Briefing media.

REAL BRIEFING DATA PROOF

Use read-only production/canonical inspection only if needed to identify the most recent real instance ids/types and verify the renderer can consume their existing payloads.

Never print/store sensitive payload content unnecessarily.
No production writes.

If production read-only access is not needed because the Native API already exposes the records, use the normal canonical path.

OVERNIGHT REVIEW BEHAVIOR

Founder explicitly authorizes continuing through all checkpoints overnight without intermediate approval.

Publish checkpoint boards separately for morning review.

Suggested checkpoints:
B1 shared Briefing chrome + History;
B2 Midweek + Weekly;
B3 Monthly;
B4 Photo Briefing;
B5 DEXA Briefing;
B6 real-canonical-record compatibility + final integrated package.

Do not mark visual checkpoints Founder accepted. Mark ready for review.

PIXEL PARITY

Same strict process as Batch 3:
locked reference;
real shipping SwiftUI;
Dark + Mineral Light;
matched simulator;
measure;
diff;
correct;
rerender.

Do not accept "close enough."

TESTING

Add/update deterministic presentation tests for all five types, History, detail routing, loading/error, chart gesture arbitration, appearance and accessibility.

Prove historical payload identity is unchanged.

At final:
relevant Native unit suites;
Briefing UI journeys;
Home briefing entry regression;
Photo/DEXA media/detail regression;
generic Release compile;
generator stability;
seam scan.

No build bump.
No TestFlight.
No Server deploy.
No production mutation.

OUTPUT

Publish:
exact candidate SHA;
checkpoint review links;
one most-recent-real-record identifier/date per briefing type used for eventual physical comparison, without exposing unnecessary private content;
proof no briefing was regenerated;
tests;
integration map onto Build 88;
likely conflicts with Claude A.

At completion notify:
PhysiqueOS Overnight Lane B — Briefings redesign ready for Founder review.

STOP after complete pushed candidate/review package.

END TASK.
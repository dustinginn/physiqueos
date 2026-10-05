PhysiqueOS Redesign Batch 3 — Claude takeover and visual reimplementation of Evidence family

TASK TYPE

NEW Claude Remote Control chat.
Use High reasoning.
This replaces Codex as implementation owner for Batch 3 Evidence.

WORKTREE RULE — MANDATORY

Use the single Remote Control-provided worktree for the entire session.
Do NOT use EnterWorktree.
Do NOT create or switch to a secondary worktree.
If a second worktree is genuinely unavoidable, STOP and explain why first.

FOUNDER DECISION

Codex Batch 3 closeout is REJECTED as visual implementation authority.

Reasons observed by Founder:
- Checkpoint A, especially Timeline, is materially off from the locked design and visually poor.
- Checkpoint B appears substantially like the production app rather than the locked redesign; Founder does not believe the intended redesign was actually implemented across those surfaces.
- Review artifact/link quality was unreliable for C–E.
- Passing tests and generated comparison boards did not establish visual parity.

Do not defend or preserve Codex's visual implementation merely because it is complete or tested.

CODEX BATCH 3 STATUS

Codex implementation authority:
d842a76bdb8dad023da4add7104688747d9c1872
Branch:
codex/redesign-batch3-evidence-20261005

Report:
agent-handoffs/reports/20261005T142039Z-redesign-batch3-evidence.md

Use this ONLY as:
- source/route inventory;
- behavioral audit;
- test discovery;
- potential implementation clues;
- overlap map.

It is NOT visual authority.
Do not start from its assumption that Checkpoints A–E are accepted.
Do not wholesale cherry-pick it.

LOCKED DESIGN AUTHORITY

The Founder-locked Evidence design artifacts from the design program are the visual authority.

Before coding, locate and enumerate the exact locked reference files for every Evidence surface.

For every surface, compare:
1. locked design;
2. current Build 87 shipping surface;
3. any Codex Batch 3 candidate.

Explicitly determine whether Codex actually transformed the surface or merely restyled existing production UI.

CURRENT PRODUCT BASE / CONCURRENCY

Apple-VALID Build 87:
f66c7fc690b1b61094e620791ee2d4a40caf3799

Accepted Home correction:
49e48f1eab3bc6ff22ca6c4bc24b3a9955b0fcc7

Claude Batch 2 is separately finalized/being finalized in another Claude chat. Do not create conflicts with that lane.

Batch 2 Workout Match L13 is Founder-approved and must be preserved during eventual Evidence Review integration.

Do not merge Batch 3 into Batch 2 during this task unless separately authorized.

SCOPE

Redo the locked Evidence family:

A. Evidence Hub + Timeline.
B. Training + Activity/Cardio Evidence.
C. Nutrition + Weight Evidence.
D. Progress Photos + DEXA Evidence.
E. Add Evidence + generic Evidence Review.

Workout Match is excluded from redesign and remains the Batch 2 specialized branch.

IMPLEMENTATION PHILOSOPHY

Claude nailed Batch 2 by treating visual parity as an engineering gate. Use that same method here.

Do not assume existing production structure should survive.
If the locked design has a different hierarchy/layout, implement that hierarchy while preserving canonical behavior.

Do not confuse:
- correct data;
- correct routing;
- correct colors;
- passing tests

with visual parity.

CHECKPOINT GATING — FOUNDER REVIEW REQUIRED

Unlike Codex's previous unattended Batch 3 run, STOP after EACH checkpoint for Founder review.

Do not begin the next checkpoint until Founder explicitly approves the current one.

Checkpoint order:
1. A — Evidence Hub + Timeline.
2. B — Training + Activity/Cardio.
3. C — Nutrition + Weight.
4. D — Progress Photos + DEXA.
5. E — Add Evidence + generic Evidence Review.

For now, implement CHECKPOINT A ONLY and stop.

CHECKPOINT A — EVIDENCE HUB + TIMELINE

Implement the exact locked:
- Evidence Hub/root;
- Recently Used;
- stream ordering and visual treatment;
- Timeline doorway;
- Timeline page;
- chronology line/dots;
- event hierarchy;
- labels/dates/detail;
- bounded footer/count treatment;
- loading/empty/error states;
- navigation/back treatment;
- Dark and Mineral Light.

Preserve canonical stream availability, routes, chronology and data.

Do not copy the rejected Codex Timeline composition.

PIXEL-BY-PIXEL PROTOCOL — MANDATORY

For Hub and Timeline separately:

1. Open the exact locked reference.
2. Render the real shipping SwiftUI candidate on iPhone 17 Pro-class simulator at equivalent geometry.
3. Capture Dark and Mineral Light.
4. Place reference and simulator side by side at matched scale.
5. Inspect and MEASURE:
   - outer margins;
   - safe-area offset;
   - hero/header height;
   - icon tile size/position;
   - eyebrow;
   - title size/weight/line-height;
   - subtitle;
   - section spacing;
   - card/row heights;
   - divider positions;
   - corner radii;
   - stream ordering;
   - event-dot diameter;
   - timeline rail x-position and width;
   - event vertical pitch;
   - date/eyebrow baselines;
   - event title/detail baselines;
   - colors/opacities;
   - bottom/footer geometry;
   - tab/navigation relationship;
   - scroll position and visible density.
6. Use image/diff tooling to expose geometry mismatch.
7. Correct discrepancies.
8. Re-render.
9. Repeat until differences are limited to unavoidable system chrome/rasterization or truthful dynamic content.

Do not label a 5–10 pt hierarchy difference as acceptable.
Do not use “close enough.”
Do not accept a production-looking layout when the locked reference differs.

REVIEW ARTIFACT REQUIREMENTS

Publish a simple, mobile-readable Checkpoint A package.

At minimum:
- hub-dark-reference-vs-simulator.png
- hub-light-reference-vs-simulator.png
- timeline-dark-reference-vs-simulator.png
- timeline-light-reference-vs-simulator.png
- checkpoint-a-primary-mobile-review-board.png
- measurement/parity notes.

Do not create an excessively wide board that is unreadable on iPhone.

The PRIMARY review board should make visual differences obvious without zooming excessively.

LINK VALIDATION

Before reporting Checkpoint A ready:
- push the artifact commit to GH;
- verify the exact artifact exists at the reported commit/ref;
- verify the final GitHub blob URL resolves;
- publish that verified link in the report.

Do not report guessed links.

BEHAVIOR / ACCESSIBILITY

Preserve:
- canonical Evidence routes;
- loading/error/empty behavior;
- timeline chronology;
- stable accessibility/test identities;
- full-row tap regions;
- >=44 pt controls;
- Dynamic Type feasibility;
- VoiceOver semantics.

Do not repeat the Home briefing identity regression.

TESTS

Run focused Evidence Hub/Timeline/read-model/navigation/appearance tests.

Add deterministic visual/UI coverage for the corrected locked hierarchy.

Run generic Release compile if Checkpoint A source changes touch shared presentation infrastructure.

Do not run an enormous unrelated suite merely to claim completeness at this checkpoint.

CODEX REUSE RULE

You may inspect Codex Batch 3 for:
- correct route mappings;
- fixtures;
- canonical data semantics;
- tests;
- useful isolated code.

If you reuse any code, independently verify its pixels against the locked reference.

Do not cherry-pick Codex Checkpoint A wholesale.

BATCH 2 PROTECTION

Do not touch:
- Log;
- Training Logger;
- Workout Match L13;
- Watch;
- HealthKit;
- Batch 2 finish semantics.

SERVER

No Server changes for Checkpoint A unless a locked visual element truly lacks data. If so, stop and report rather than inventing data.

NOTIFICATIONS — MANDATORY

Whenever Claude stops or needs Founder input for ANY reason, send a notification.

When Checkpoint A is ready, notify:
PhysiqueOS Batch 3 — Evidence Hub + Timeline ready for review.

STOP CONDITION

After Checkpoint A is implemented, pixel-audited, tested, pushed, and review links are verified:
- publish the Checkpoint A report;
- send notification;
- STOP for Founder review.

Do NOT begin Checkpoint B.
Do NOT upload TestFlight.
Do NOT bump build number.

END TASK.